/**
 * Per-character document and everything in it: roster, custom characters, recognition keys, personas,
 * appearance (FormCollection), references, artists. Ports of Asset Maid 0.9.88 normalizers
 * (`go` 25068, `Qs` 11683, `Si` 11746, `wTe` 31761, `kP`/`vw` 88539, `Ja` 24493, `Aa` 24565, `FP` 94880, `Kje` 20722 ...).
 * Pure functions only. Line numbers refer to AssetMaid.pretty.js.
 */
import appearanceCatalogJson from "./data/appearance-catalog.json" with { type: "json" };
import appearanceUiJson from "./data/appearance-ui.json" with { type: "json" };
import defaultPresetsJson from "./data/default-presets.json" with { type: "json" };
import filenameTagTableJson from "./data/filename-tag-table.json" with { type: "json" };
import {
  asArray,
  asRecord,
  type ContractIssue,
  fnv1a32Base36,
  hasOwn,
  jsonClone,
  prefixedId,
  trimString,
  uniqueStringsCaseInsensitive,
} from "./common.js";

/* ------------------------------------------------------------------------------------------------
 * Prompt keys (Lumiverse mapping). Asset Maid identifies every "actor" by a prompt key.
 * ---------------------------------------------------------------------------------------------- */

/** Separator between member key and lore id (AM `Fs` 85966). */
export const LORE_KEY_SEPARATOR = "::lore::";
/** Virtual lore id of the character description used as a prompt source (AM `asset-maid:charx-description:v1`). */
export const CHARACTER_DESCRIPTION_LORE_ID = "asset-maid:charx-description:v1";
export const CUSTOM_CHARACTER_ID_PREFIX = "character_";
export const PERSONA_PROMPT_KEY_PREFIX = "persona::";

/** Roster selection id of a world book entry: `<worldBookId>:<entryId>` (AM lore `selectionId`). */
export function loreSelectionId(worldBookId: string, entryId: string): string {
  return `${trimString(worldBookId)}:${trimString(entryId)}`;
}
/**
 * World book entry prompt key: `<characterId>::lore::<worldBookId>:<entryId>`.
 * (AM: `<sourceChaId>::<memberChaId>::lore::<loreId>`; in Lumiverse the member key is the character id.)
 */
export function lorePromptKey(characterId: string, worldBookId: string, entryId: string): string {
  return `${trimString(characterId)}${LORE_KEY_SEPARATOR}${loreSelectionId(worldBookId, entryId)}`;
}
/** Prompt key of the character-description pseudo lore (single characters only). */
export function descriptionPromptKey(characterId: string): string {
  return `${trimString(characterId)}${LORE_KEY_SEPARATOR}${CHARACTER_DESCRIPTION_LORE_ID}`;
}
/** Persona prompt key `persona::<personaId>` (Lumiverse persona id). */
export function personaPromptKey(personaId: string): string {
  return `${PERSONA_PROMPT_KEY_PREFIX}${trimString(personaId)}`;
}
export function isCustomCharacterId(value: string): boolean {
  return trimString(value).startsWith(CUSTOM_CHARACTER_ID_PREFIX);
}
/** Owner key of a custom character inside a source (AM `<sourceId>::custom::<id>`, Av 34028). */
export function customCharacterOwnerKey(characterId: string, customId: string): string {
  return `${trimString(characterId)}::custom::${trimString(customId)}`;
}
/** Virtual member key of a custom character (AM `Mot` 93097). */
export function customCharacterMemberKey(customId: string): string {
  return `virtual-character:${trimString(customId)}`;
}

export type ParsedPromptKey =
  | { kind: "lore"; characterId: string; worldBookId: string; entryId: string; selectionId: string }
  | { kind: "description"; characterId: string; selectionId: string }
  | { kind: "custom"; customId: string }
  | { kind: "persona"; personaId: string }
  | { kind: "unknown"; raw: string };

export function parsePromptKey(promptKey: string): ParsedPromptKey {
  const raw = trimString(promptKey);
  if (raw.startsWith(PERSONA_PROMPT_KEY_PREFIX)) return { kind: "persona", personaId: raw.slice(PERSONA_PROMPT_KEY_PREFIX.length) };
  if (raw.startsWith(CUSTOM_CHARACTER_ID_PREFIX) && !raw.includes(LORE_KEY_SEPARATOR)) return { kind: "custom", customId: raw };
  const at = raw.indexOf(LORE_KEY_SEPARATOR);
  if (at > 0) {
    const characterId = raw.slice(0, at);
    const rest = raw.slice(at + LORE_KEY_SEPARATOR.length);
    if (rest === CHARACTER_DESCRIPTION_LORE_ID) return { kind: "description", characterId, selectionId: rest };
    const colon = rest.indexOf(":");
    if (colon > 0 && colon < rest.length - 1) {
      return { kind: "lore", characterId, worldBookId: rest.slice(0, colon), entryId: rest.slice(colon + 1), selectionId: rest };
    }
  }
  return { kind: "unknown", raw };
}

/** Local reference binding key (AM `TZ` 29292): `asset-maid:<enc(owner)>:<enc(semanticId)>`. */
export function referenceBindingKey(runtimeOwner: string, semanticId: string): string {
  return ["asset-maid", encodeURIComponent(trimString(runtimeOwner) || "current-owner"), encodeURIComponent(trimString(semanticId) || "reference")].join(":");
}
/** Semantic ids of reference slots (AM data.md Part A §2.5). */
export const REFERENCE_SEMANTIC_IDS = {
  formCharacter: (formId: string) => `form:${formId}:character-reference`,
  formOutfit: (formId: string, outfitId: string) => `form:${formId}:outfit:${outfitId}:reference`,
  persona: (personaId: string) => `persona:${personaId}:reference`,
  personaForm: (formId: string) => `persona-form:${formId}:reference`,
  personaOutfit: (personaId: string, outfitId: string) => `persona:${personaId}:outfit:${outfitId}:reference`,
  artist: "artist-reference",
} as const;

/* ------------------------------------------------------------------------------------------------
 * Asset references
 * ---------------------------------------------------------------------------------------------- */

/**
 * Where an asset comes from. AM: "character" | "module" | "risu-persona" | "".
 * Lumiverse: "character" = character gallery / risu_asset_map / expressions / avatar image,
 * "persona" = persona avatar, "generated" = image-gen result, "upload" = user upload kept in userStorage.
 */
export type AssetSourceType = "character" | "persona" | "generated" | "upload" | "module" | "risu-persona" | "";

export interface CropReference {
  version: number;
  assetName: string;
  assetKey: string;
  extension: "png";
  cropRect: { x: number; y: number; width: number; height: number };
  sourceSize: { width: number; height: number };
}

/** Runtime asset reference (AM `pn` 29233). `key` = Lumiverse image id (or image-gen result id). */
export interface AssetRef {
  name: string;
  key: string;
  extension: string;
  sourceType: AssetSourceType | string;
  moduleId: string;
  moduleName: string;
  characterIndex?: number;
  /** AM field name kept: `chaId` holds the Lumiverse character id. */
  characterTarget?: { chaId: string; indexHint?: number };
  cropReference?: CropReference | unknown;
}

/** Stored asset reference (AM `Xl.toStoredReference` 29332): `ext` instead of `extension`. */
export interface StoredAssetRef {
  name: string;
  key: string;
  ext?: string;
  extension?: string;
  sourceType?: string;
  moduleId?: string;
  moduleName?: string;
  characterIndex?: number;
  characterTarget?: { chaId: string; indexHint?: number };
  cropReference?: CropReference | unknown;
}

function extensionOf(name: string, key: string, ext: unknown): string {
  const explicit = trimString(ext).replace(/^\./, "").toLowerCase();
  return explicit || (trimString(name || key).split(/[\\/.]/g).at(-1)?.toLowerCase() ?? "");
}

/** AM `pn`: accepts objects, `[name,key,ext]` tuples and strings. */
export function normalizeAssetRef(value: unknown): AssetRef {
  const tuple = Array.isArray(value) ? value : [];
  const r = asRecord(value);
  const s = typeof value === "string" ? value : "";
  const name = trimString(r.name ?? tuple[0]);
  const key = trimString(r.key ?? tuple[1] ?? s);
  const target = asRecord(r.characterTarget ?? r.character_target);
  const chaId = trimString(target.chaId ?? target.cha_id);
  const indexHint = Number(target.indexHint ?? target.index_hint);
  const characterIndex = Number(r.characterIndex ?? r.character_index);
  const out: AssetRef = {
    name,
    key,
    extension: extensionOf(name, key, r.extension ?? r.ext ?? tuple[2]),
    sourceType: trimString(r.sourceType ?? r.source_type),
    moduleId: trimString(r.moduleId ?? r.module_id),
    moduleName: trimString(r.moduleName ?? r.module_name),
  };
  if (Number.isInteger(characterIndex)) out.characterIndex = characterIndex;
  if (chaId) out.characterTarget = { chaId, ...(Number.isInteger(indexHint) && indexHint >= 0 ? { indexHint } : {}) };
  if ("cropReference" in r || "crop_reference" in r) out.cropReference = r.cropReference ?? r.crop_reference;
  return out;
}

/** AM `Wt`: identity `key:<key>` else `name:<name>`. */
export function assetIdentity(value: unknown): string {
  const a = normalizeAssetRef(value);
  return a.key ? `key:${a.key}` : a.name ? `name:${a.name}` : "";
}

/** AM `Ai`: normalize + drop entries without name or key + dedupe by identity. */
export function dedupeAssetRefs(values: unknown): AssetRef[] {
  const seen = new Set<string>();
  return asArray(values)
    .map(normalizeAssetRef)
    .filter((a) => a.name && a.key)
    .filter((a) => {
      const id = assetIdentity(a);
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

export function toStoredAssetRef(asset: AssetRef): StoredAssetRef {
  return {
    name: asset.name,
    key: asset.key,
    ext: asset.extension,
    sourceType: asset.sourceType,
    moduleId: asset.moduleId,
    moduleName: asset.moduleName,
    ...(asset.characterIndex === undefined ? {} : { characterIndex: asset.characterIndex }),
    ...(asset.characterTarget === undefined ? {} : { characterTarget: asset.characterTarget }),
    ...(asset.cropReference === undefined ? {} : { cropReference: asset.cropReference }),
  };
}

/** AM `mL`: compact stored ref for persistence (drops `ext` dup, empty module fields, sourceType "character"). */
export function compactStoredAssetRef(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const r = value as Record<string, unknown>;
  const ext = r.extension ?? r.ext;
  return Object.fromEntries(
    Object.entries({ ...r, ...(ext === undefined ? {} : { extension: ext }) }).filter(([k, v]) =>
      k === "ext" || ((k === "moduleId" || k === "moduleName") && String(v ?? "").trim() === "") || (k === "sourceType" && v === "character")
        ? false
        : v != null,
    ),
  );
}

/* ------------------------------------------------------------------------------------------------
 * Generated asset names (AM `pMe` 29200 / `NZ` 29206)
 * ---------------------------------------------------------------------------------------------- */
export const GENERATED_ASSET_NAME_SEPARATOR = ".__am__.";
export const GENERATED_ASSET_NAME_PATTERN = /^(.+)\.__am__\.(chat|outfit)\.([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/u;
export const CROP_ASSET_NAME_PREFIX = "__asset_maid_crop_";
export type AssetKind = "original" | "chat" | "outfit";
/** AM `mi`: asset kind from its name. */
export function assetKindOfName(name: string): AssetKind {
  const m = GENERATED_ASSET_NAME_PATTERN.exec(trimString(name));
  return m ? (m[2] as "chat" | "outfit") : "original";
}

/* ------------------------------------------------------------------------------------------------
 * Appearance catalog (`Wb` 2410-2564) and base prompt groups
 * ---------------------------------------------------------------------------------------------- */

export interface AppearanceCatalogOption { id: string; prompt?: string; genders?: string[]; evidence_modes?: string[] }
export interface AppearanceCatalogGroup {
  id: string;
  mode: "freeform" | "options" | string;
  evidence_modes?: string[];
  genders?: string[];
  selection?: { type?: "single" | "multiple" | string; required?: boolean; max_tags?: number };
  description?: string;
  options?: AppearanceCatalogOption[];
  [key: string]: unknown;
}
export interface AppearanceCatalog {
  version: number;
  id: string;
  required_policy: unknown;
  tag_format: unknown;
  evidence_rules: Record<string, unknown>;
  groups: AppearanceCatalogGroup[];
}
/** The `Wb` catalog (byte-identical copy of extract/data/appearance-catalog-Wb.json). */
export const APPEARANCE_CATALOG = appearanceCatalogJson as unknown as AppearanceCatalog;
/** UI field groups `IT` (95441), labels `Yot`, sentinel, part relevance `aje`, defaults (Korean labels kept). */
export const APPEARANCE_UI = appearanceUiJson as unknown as {
  APPEARANCE_FIELD_GROUPS_UI: { id: string; label: string; fields: { id: string; label: string; placeholder: string }[]; fallbackFieldId?: string; placeholder?: string }[];
  APPEARANCE_EMPTY_OPTION_SENTINEL: string;
  FIELD_LABELS_KO: Record<string, string>;
  BASE_PROMPT_GROUP_ORDER: string[];
  GROUP_TO_OUTFIT_PART_RELEVANCE: Record<string, string[]>;
  OUTFIT_PARTS: string[];
  DEFAULT_FORM: { id: string; label: string };
  DEFAULT_OUTFIT: { id: string; label: string };
};

/** Group ids in catalog order (`V0` 11575). */
export const BASE_PROMPT_GROUP_IDS = [
  "identity.character_tag",
  "hair.color",
  "hair.length",
  "hair.style",
  "head.other",
  "eyes.color",
  "eyes.structure",
  "body.skin",
  "body.build",
  "body.proportions",
  "body.breast_size",
  "marks.distinctive",
  "nonhuman.features",
] as const;
export type BasePromptGroupId = (typeof BASE_PROMPT_GROUP_IDS)[number];
export type BasePromptGroupKey = BasePromptGroupId | "custom";
export type BasePromptGroups = Partial<Record<BasePromptGroupKey, string[]>>;

export const OUTFIT_PARTS = ["head", "top", "bottom", "legs", "feet"] as const;
export type OutfitPart = (typeof OUTFIT_PARTS)[number];

/** Group -> relevant outfit parts (`aje` 11594). */
export const GROUP_TO_OUTFIT_PARTS: Readonly<Record<BasePromptGroupKey, readonly OutfitPart[]>> = Object.freeze({
  "identity.character_tag": ["head", "top", "bottom"],
  "hair.color": ["head"],
  "hair.length": ["head"],
  "hair.style": ["head"],
  "head.other": ["head"],
  "eyes.color": ["head"],
  "eyes.structure": ["head"],
  "body.skin": ["top", "bottom"],
  "body.build": ["top", "bottom"],
  "body.proportions": ["top", "bottom", "legs"],
  "body.breast_size": ["top"],
  "marks.distinctive": ["head", "top", "bottom"],
  "nonhuman.features": ["head", "top", "bottom"],
  custom: [],
});

export type Gender = "female" | "male" | "unknown";
export const GENDERS: readonly Gender[] = ["female", "male", "unknown"];
export type EvidenceMode = "image" | "metadata" | "text";

/** AM `bg` 11590. */
export function normalizeGender(value: unknown, fallback: Gender = "female"): Gender {
  const v = trimString(value).toLocaleLowerCase();
  return v === "female" || v === "male" || v === "unknown" ? v : fallback;
}

const catalogGroupsById = new Map(APPEARANCE_CATALOG.groups.map((g) => [g.id, g]));
const TAG_PATTERN = /^[a-z0-9][a-z0-9 ()'!.-]{0,127}$/u;

/** AM `Hf`: catalog tag normalization (lowercase, `_`->space, strict ASCII pattern). */
export function normalizeCatalogTag(value: unknown): string {
  const t = trimString(value).toLocaleLowerCase().replace(/_+/gu, " ").replace(/\s+/gu, " ").trim();
  return TAG_PATTERN.test(t) ? t : "";
}
/** AM `dp`: split prompt fragments on `[,;|\r\n]`, `_`->space, dedupe (keeps any text). */
export function splitPromptFragments(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;|\r\n]+/gu) : [];
  return [...new Set(parts.map((p) => trimString(p).replace(/_+/gu, " ").replace(/\s+/gu, " ").trim()).filter(Boolean))];
}
function splitCatalogTags(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;|\r\n]+/gu) : [];
  return [...new Set(parts.map(normalizeCatalogTag).filter(Boolean))];
}
function groupLimit(group: AppearanceCatalogGroup): number {
  if (group.selection?.type === "single") return 1;
  const n = Math.floor(Number(group.selection?.max_tags));
  return Number.isFinite(n) && n > 0 ? n : 16;
}
function groupApplies(item: { genders?: string[]; evidence_modes?: string[] }, gender?: string, mode?: string): boolean {
  return (!gender || !item.genders?.length || item.genders.includes(gender)) && (!mode || !item.evidence_modes?.length || item.evidence_modes.includes(mode));
}
function normalizeGroupValues(group: AppearanceCatalogGroup, value: unknown, gender: string | undefined, mode: string | undefined, fragments: boolean, limit: boolean): string[] {
  const values = fragments ? splitPromptFragments(value) : splitCatalogTags(value);
  if (fragments) return values;
  if (group.mode === "freeform") return limit ? values.slice(0, groupLimit(group)) : values;
  const byTag = new Map<string, AppearanceCatalogOption>();
  for (const option of group.options ?? []) {
    const id = normalizeCatalogTag(option.id);
    const prompt = normalizeCatalogTag(option.prompt);
    if (id) byTag.set(id, option);
    if (prompt) byTag.set(prompt, option);
  }
  const out = values.flatMap((tag) => {
    const option = byTag.get(tag);
    if (!option) return [];
    if (gender && option.genders?.length && !option.genders.includes(gender)) return [];
    if (mode && option.evidence_modes?.length && !option.evidence_modes.includes(mode)) return [];
    return [normalizeCatalogTag(option.prompt ?? option.id)];
  });
  return limit ? out.slice(0, groupLimit(group)) : out;
}

export interface BasePromptGroupOptions {
  gender?: Gender | string;
  evidenceMode?: EvidenceMode | string;
  /** Keep any trimmed text (forms are stored this way). */
  allowPromptFragments?: boolean;
  /** Default true. */
  includeCustom?: boolean;
  /** Default true. */
  applyCatalogSelectionLimits?: boolean;
}

/** AM `Qs` 11683: normalize a base prompt group map against the catalog. */
export function normalizeBasePromptGroups(value: unknown, options: BasePromptGroupOptions = {}): BasePromptGroups {
  const groups = asRecord(value);
  const out: BasePromptGroups = {};
  for (const id of BASE_PROMPT_GROUP_IDS) {
    const group = catalogGroupsById.get(id);
    if (!group || !groupApplies(group, options.gender, options.evidenceMode)) continue;
    const values = normalizeGroupValues(group, groups[id], options.gender, options.evidenceMode, options.allowPromptFragments === true, options.applyCatalogSelectionLimits !== false);
    if (values.length) out[id] = values;
  }
  if (options.includeCustom !== false) {
    const custom = splitPromptFragments(groups.custom);
    if (custom.length) out.custom = custom;
  }
  return out;
}

/** AM `X0`: any physical trait (any group except identity.character_tag; includes custom). */
export function hasPhysicalTraits(groups: BasePromptGroups): boolean {
  return Object.entries(groups).some(([k, v]) => k !== "identity.character_tag" && (v?.length ?? 0) > 0);
}

/** AM `bW` 11705: merge analysis result into existing groups (physical traits replace; tag + custom kept). */
export function mergeAnalyzedBasePromptGroups(current: BasePromptGroups, analyzed: unknown, gender?: Gender | string): BasePromptGroups {
  const next = normalizeBasePromptGroups(analyzed, { gender, includeCustom: false });
  const merged: BasePromptGroups = hasPhysicalTraits(next) ? next : { ...current, ...next };
  if (current["identity.character_tag"]?.length) merged["identity.character_tag"] = current["identity.character_tag"];
  if (current.custom?.length) merged.custom = current.custom;
  return merged;
}

/** AM `Si` 11746: compiled main prompt (catalog order, then custom; ", "-joined). */
export function compileMainPrompt(groups: unknown, gender?: Gender | string): string {
  const normalized = normalizeBasePromptGroups(groups, { gender, allowPromptFragments: true });
  const parts: string[] = [];
  for (const id of BASE_PROMPT_GROUP_IDS) {
    const group = catalogGroupsById.get(id);
    if (!group || !groupApplies(group, gender)) continue;
    const values = normalized[id] ?? [];
    if (group.mode === "freeform") {
      parts.push(...values);
      continue;
    }
    const options = new Map((group.options ?? []).map((o) => [normalizeCatalogTag(o.id), o]));
    for (const value of values) {
      const option = options.get(normalizeCatalogTag(value));
      if (option) {
        if (gender && option.genders?.length && !option.genders.includes(gender)) continue;
        parts.push(trimString(option.prompt) || option.id);
      } else parts.push(value);
    }
  }
  parts.push(...(normalized.custom ?? []));
  return [...new Set(parts.map((p) => p.replace(/_/gu, " ").replace(/\s+/gu, " ").trim()).filter(Boolean))].join(", ");
}

/* ------------------------------------------------------------------------------------------------
 * Forms and outfits (FormCollection) — `go()` 25068 and operations 25130-25353
 * ---------------------------------------------------------------------------------------------- */

export const DEFAULT_FORM_ID = "form_default";
/** Stored default label "기본" ("Default"); the UI translates it. */
export const DEFAULT_FORM_LABEL = "기본";
export const DEFAULT_OUTFIT_ID = "outfit_default";
/** Stored default label "기본 의상" ("Default outfit"); the UI translates it. */
export const DEFAULT_OUTFIT_LABEL = "기본 의상";
export const AI_AUTO_ORIGIN = "ai-auto";

export interface FormReference {
  /** Reference used in generation. */
  enabled?: boolean;
  /** Stored only when false (true is the default). */
  referenceAnalysisEnabled?: boolean;
  defaultAsset?: StoredAssetRef | null;
  [key: string]: unknown;
}

export interface Outfit {
  id: string;
  label: string;
  description: string;
  candidateEnabled: boolean;
  head: string;
  top: string;
  bottom: string;
  legs: string;
  feet: string;
  keywords?: string[];
  sourceAssetName?: string;
  referenceAsset?: StoredAssetRef | null;
  referenceEnabled?: boolean;
  referenceAnalysisEnabled?: boolean;
  /** Persona outfit image. */
  imageAsset?: StoredAssetRef;
  origin?: "ai-auto";
  status?: "ready" | "failed" | "pending" | string;
  sourceFingerprint?: string;
  analysisManaged?: boolean;
  decisionReason?: string;
  decisionConfidence?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface Form {
  id: string;
  label: string;
  description: string;
  humanlike: boolean;
  gender: Gender;
  basePromptGroups: BasePromptGroups;
  negativePrompt: string;
  reference: FormReference | null;
  defaultOutfitId: string;
  outfits: Outfit[];
}

export interface FormCollection {
  defaultFormId: string;
  forms: Form[];
}

function slugId(value: unknown): string {
  return trimString(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}_.:-]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 96);
}
function uniqueId(id: string, taken: ReadonlySet<string>): string {
  if (!taken.has(id)) return id;
  for (let i = 2; ; i += 1) {
    const candidate = `${id}_${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}
function prefixedSlug(value: unknown, prefix: string): string {
  const s = slugId(value);
  return s ? (s.startsWith(`${prefix}_`) ? s : `${prefix}_${s}`) : "";
}
function formIdFor(label: unknown, taken: ReadonlySet<string>, explicit?: unknown): string {
  const s = prefixedSlug(explicit, "form");
  return uniqueId(s && s !== DEFAULT_FORM_ID ? s : `form_${fnv1a32Base36(trimString(label).normalize("NFKC") || "form")}`, taken);
}
function outfitIdFor(formId: string, label: unknown, taken: ReadonlySet<string>, explicit?: unknown): string {
  return uniqueId(prefixedSlug(explicit, "outfit") || `outfit_${fnv1a32Base36(`${formId}\0${trimString(label).normalize("NFKC") || "outfit"}`)}`, taken);
}
function defaultOutfitIdFor(formId: string, taken: ReadonlySet<string>): string {
  return formId === DEFAULT_FORM_ID && !taken.has(DEFAULT_OUTFIT_ID) ? DEFAULT_OUTFIT_ID : uniqueId(`outfit_${fnv1a32Base36(`${formId}\0default`)}`, taken);
}
/** AM `KL` 24998. */
export function createDefaultOutfit(id: string): Outfit {
  return { id, label: DEFAULT_OUTFIT_LABEL, description: "", candidateEnabled: true, head: "", top: "", bottom: "", legs: "", feet: "" };
}
/** AM `Ag`: structural deep copy (keeps undefined, unlike JSON). */
function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepCopy) as T;
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepCopy(v)])) as T;
  return value;
}
function normalizeOutfit(value: unknown, formId: string, index: number, taken: Set<string>): Outfit {
  const o = asRecord(value);
  const slug = slugId(trimString(o.id ?? o.outfitId ?? o.outfit_id));
  const id = slug && !taken.has(slug) ? slug : slug ? uniqueId(`${slug}_copy`, taken) : index === 0 ? defaultOutfitIdFor(formId, taken) : outfitIdFor(formId, o.label ?? o.name ?? `outfit-${index + 1}`, taken);
  taken.add(id);
  const out: Record<string, unknown> = {
    ...deepCopy(o),
    id,
    label: trimString(o.label ?? o.name) || (index === 0 ? DEFAULT_OUTFIT_LABEL : `의상 ${index + 1}`),
    description: trimString(o.description),
    candidateEnabled: o.candidateEnabled !== false && o.candidate_enabled !== false,
    head: trimString(o.head),
    top: trimString(o.top),
    bottom: trimString(o.bottom),
    legs: trimString(o.legs),
    feet: trimString(o.feet),
  };
  delete out.outfitId;
  delete out.outfit_id;
  delete out.name;
  delete out.candidate_enabled;
  return out as Outfit;
}
function normalizeForm(value: unknown, id: string, ordinal: number, outfitIds: Set<string>, fallbackGender: Gender): Form {
  const f = asRecord(value);
  const gender = normalizeGender(f.gender, fallbackGender);
  const outfits = asArray(f.outfits).map((o, i) => normalizeOutfit(o, id, i, outfitIds));
  if (!outfits.length) {
    const d = createDefaultOutfit(defaultOutfitIdFor(id, outfitIds));
    outfitIds.add(d.id);
    outfits.push(d);
  }
  const wanted = slugId(f.defaultOutfitId ?? f.default_outfit_id);
  const defaultOutfitId = outfits.some((o) => o.id === wanted) ? wanted : outfits[0]!.id;
  const at = outfits.findIndex((o) => o.id === defaultOutfitId);
  const ordered = at > 0 ? [outfits[at]!, ...outfits.filter((_, i) => i !== at)] : outfits;
  const reference = f.reference == null || typeof f.reference !== "object" || Array.isArray(f.reference) ? null : (deepCopy(f.reference) as FormReference);
  return {
    id,
    label: trimString(f.label ?? f.name) || (id === DEFAULT_FORM_ID ? DEFAULT_FORM_LABEL : `폼 ${ordinal}`),
    description: trimString(f.description),
    humanlike: f.humanlike !== false,
    gender,
    basePromptGroups: normalizeBasePromptGroups(f.basePromptGroups, { allowPromptFragments: true }),
    negativePrompt: trimString(f.negativePrompt ?? f.negative_prompt),
    reference,
    defaultOutfitId,
    outfits: ordered,
  };
}

/** AM `go` 25068: normalize any value into a valid FormCollection (>=1 form, >=1 outfit per form). */
export function normalizeFormCollection(value: unknown, options: { fallbackGender?: Gender } = {}): FormCollection {
  const r = asRecord(value);
  const fallbackGender = options.fallbackGender ?? "female";
  const rawForms = asArray(r.forms);
  const wantedDefault = prefixedSlug(r.defaultFormId ?? r.default_form_id, "form");
  const source = rawForms.length ? rawForms : [{}];
  const forms: Form[] = [];
  const formIds = new Set<string>();
  const outfitIds = new Set<string>();
  source.forEach((item, index) => {
    const f = asRecord(item);
    const id = (slugId(f.id) === DEFAULT_FORM_ID && !formIds.has(DEFAULT_FORM_ID)) || (!rawForms.length && index === 0) ? DEFAULT_FORM_ID : formIdFor(f.label ?? f.name ?? `form-${index + 1}`, formIds, f.id);
    formIds.add(id);
    forms.push(normalizeForm(f, id, index + 1, outfitIds, fallbackGender));
  });
  return {
    defaultFormId: forms.some((f) => f.id === wantedDefault) ? wantedDefault : forms.some((f) => f.id === DEFAULT_FORM_ID) ? DEFAULT_FORM_ID : forms[0]!.id,
    forms,
  };
}

/** Legacy per-key fields used when `characterForms[promptKey]` is absent (AM `LY` 25090). */
export interface LegacyAppearanceFallback {
  fallbackGender?: Gender;
  gender?: unknown;
  basePromptGroups?: unknown;
  fallbackPrompt?: unknown;
  description?: unknown;
  humanlike?: boolean;
  negativePrompt?: unknown;
  reference?: unknown;
  defaultOutfitId?: unknown;
  outfits?: unknown;
}

/** AM `LY`: build a single-form collection from legacy per-key maps. */
export function buildLegacyFormCollection(fallback: LegacyAppearanceFallback): FormCollection {
  const fallbackGender = fallback.fallbackGender ?? "female";
  const groups = fallback.basePromptGroups !== undefined ? normalizeBasePromptGroups(fallback.basePromptGroups, { allowPromptFragments: true }) : {};
  const prompt = fallback.basePromptGroups === undefined ? splitPromptFragments(fallback.fallbackPrompt) : [];
  return normalizeFormCollection(
    {
      defaultFormId: DEFAULT_FORM_ID,
      forms: [
        {
          id: DEFAULT_FORM_ID,
          label: DEFAULT_FORM_LABEL,
          description: trimString(fallback.description),
          humanlike: fallback.humanlike !== false,
          gender: normalizeGender(fallback.gender, fallbackGender),
          basePromptGroups: Object.keys(groups).length ? groups : prompt.length ? { custom: prompt } : {},
          negativePrompt: trimString(fallback.negativePrompt),
          reference: fallback.reference ?? null,
          defaultOutfitId: fallback.defaultOutfitId,
          outfits: Array.isArray(fallback.outfits) ? fallback.outfits : [],
        },
      ],
    },
    { fallbackGender },
  );
}

/** AM `Mc` 25117: forms of a key from `characterForms`, else the legacy fallback. */
export function resolveFormCollection(characterForms: unknown, promptKey: string, fallback: LegacyAppearanceFallback): FormCollection {
  const map = asRecord(characterForms);
  return hasOwn(map, promptKey) ? normalizeFormCollection(map[promptKey], { fallbackGender: fallback.fallbackGender }) : buildLegacyFormCollection(fallback);
}

function hasContent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return !!value.trim();
  if (Array.isArray(value)) return value.some(hasContent);
  if (typeof value === "object") return Object.values(value).some(hasContent);
  return true;
}
/** AM `IE` 24916: outfit has no keywords, parts, sourceAssetName or reference. */
export function isOutfitEmpty(outfit: unknown): boolean {
  const o = asRecord(outfit);
  const prompt = asRecord(o.prompt);
  const tags = asRecord(o.tags);
  return ![o.keywords, ...OUTFIT_PARTS.map((p) => o[p]), ...OUTFIT_PARTS.map((p) => prompt[p]), ...OUTFIT_PARTS.map((p) => tags[p]), o.sourceAssetName, o.source_asset_name, o.referenceAsset, o.reference_asset].some(hasContent);
}
/** AM `Ik`: candidateEnabled and not empty. */
export function isOutfitCandidate(outfit: unknown): boolean {
  const o = asRecord(outfit);
  const enabled = hasOwn(o, "candidateEnabled") ? o.candidateEnabled !== false : o.candidate_enabled !== false;
  return enabled && !isOutfitEmpty(o);
}

/** AM `ds` 25239: revision of a collection (FNV-1a base36 of normalized JSON). */
export function formCollectionRevision(value: unknown): string {
  return fnv1a32Base36(JSON.stringify(normalizeFormCollection(value)));
}

export interface ResolvedFormOutfit {
  formId: string;
  outfitId: string;
  form: Form;
  outfit: Outfit;
  usedFormFallback: boolean;
  usedOutfitFallback: boolean;
}

/** AM `DY` 25130: resolve form + outfit with fallback to defaults. */
export function resolveFormOutfit(collection: unknown, formId: unknown, outfitId: unknown): ResolvedFormOutfit {
  const c = normalizeFormCollection(collection);
  const fid = trimString(formId);
  const form = c.forms.find((f) => f.id === fid) ?? c.forms.find((f) => f.id === c.defaultFormId) ?? c.forms[0]!;
  const oid = trimString(outfitId);
  const outfit = form.outfits.find((o) => o.id === oid) ?? form.outfits.find((o) => o.id === form.defaultOutfitId) ?? form.outfits[0]!;
  return { formId: form.id, outfitId: outfit.id, form, outfit, usedFormFallback: form.id !== fid, usedOutfitFallback: outfit.id !== oid };
}

/** AM `FY` 25146: like resolveFormOutfit, but an outfit id alone may select its (unique) form. */
export function resolveFormOutfitByOutfit(collection: unknown, formId: unknown, outfitId: unknown): ResolvedFormOutfit {
  const c = normalizeFormCollection(collection);
  const defaultForm = c.forms.find((f) => f.id === c.defaultFormId) ?? c.forms[0]!;
  const fid = trimString(formId);
  const oid = trimString(outfitId);
  const rawForms = asArray(asRecord(collection).forms);
  const rawMatches = fid || !oid ? 0 : rawForms.filter((f) => asArray(asRecord(f).outfits).some((o) => trimString(asRecord(o).id) === oid)).length;
  const candidates = fid || !oid ? [] : rawMatches > 1 ? [] : c.forms.filter((f) => f.outfits.some((o) => o.id === oid));
  const form = fid ? (c.forms.find((f) => f.id === fid) ?? defaultForm) : candidates.length === 1 ? candidates[0]! : defaultForm;
  const outfit = (oid && (fid ? form.id === fid : candidates.length === 1) ? form.outfits.find((o) => o.id === oid) : null) ?? form.outfits.find((o) => o.id === form.defaultOutfitId) ?? form.outfits[0]!;
  return { formId: form.id, outfitId: outfit.id, form, outfit, usedFormFallback: form.id !== fid, usedOutfitFallback: outfit.id !== oid };
}

export interface AddFormInput {
  label: string;
  id?: string;
  description?: string;
  humanlike?: boolean;
  gender?: Gender;
  /** Copy appearance (not reference/outfits) from this form. */
  sourceFormId?: string;
}

/** AM `BL` 25174. */
export function addForm(collection: unknown, input: AddFormInput): { collection: FormCollection; formId: string } {
  const c = normalizeFormCollection(collection);
  const label = trimString(input.label);
  if (!label) return { collection: c, formId: "" };
  const id = formIdFor(label, new Set(c.forms.map((f) => f.id)), input.id);
  const source = c.forms.find((f) => f.id === trimString(input.sourceFormId));
  const outfits = [createDefaultOutfit(defaultOutfitIdFor(id, new Set(c.forms.flatMap((f) => f.outfits.map((o) => o.id)))))];
  const form: Form = source
    ? { id, label, description: trimString(input.description ?? source.description), humanlike: source.humanlike, gender: source.gender, basePromptGroups: deepCopy(source.basePromptGroups), negativePrompt: source.negativePrompt, reference: null, defaultOutfitId: outfits[0]!.id, outfits }
    : { id, label, description: trimString(input.description), humanlike: input.humanlike !== false, gender: input.gender ?? "unknown", basePromptGroups: {}, negativePrompt: "", reference: null, defaultOutfitId: outfits[0]!.id, outfits };
  return { collection: normalizeFormCollection({ ...c, forms: [...c.forms, form] }), formId: id };
}

export type FormPatch = Partial<Pick<Form, "label" | "description" | "humanlike" | "gender" | "negativePrompt">> & { basePromptGroups?: unknown; reference?: unknown };

/** AM `Pg` 25208 (operates on a normalized collection; empty label = no-op). */
export function patchForm(collection: FormCollection, formId: string, patch: FormPatch): FormCollection {
  const index = collection.forms.findIndex((f) => f.id === formId);
  if (index < 0) return collection;
  const form = collection.forms[index]!;
  const label = hasOwn(patch, "label") ? trimString(patch.label) : form.label;
  if (!label) return collection;
  const next: Form = {
    ...form,
    label,
    description: hasOwn(patch, "description") ? trimString(patch.description) : form.description,
    humanlike: hasOwn(patch, "humanlike") ? patch.humanlike !== false : form.humanlike,
    gender: hasOwn(patch, "gender") ? normalizeGender(patch.gender, form.gender) : form.gender,
    basePromptGroups: hasOwn(patch, "basePromptGroups") ? normalizeBasePromptGroups(patch.basePromptGroups, { allowPromptFragments: true }) : form.basePromptGroups,
    negativePrompt: hasOwn(patch, "negativePrompt") ? String(patch.negativePrompt ?? "") : form.negativePrompt,
    reference: hasOwn(patch, "reference") ? (patch.reference == null || typeof patch.reference !== "object" || Array.isArray(patch.reference) ? null : (deepCopy(patch.reference) as FormReference)) : form.reference,
  };
  return { ...collection, forms: collection.forms.map((f, i) => (i === index ? next : f)) };
}

/** AM `KY`: delete a non-default form. */
export function deleteForm(collection: FormCollection, formId: string): FormCollection {
  return formId === collection.defaultFormId || !collection.forms.some((f) => f.id === formId)
    ? collection
    : { defaultFormId: collection.defaultFormId, forms: collection.forms.filter((f) => f.id !== formId) };
}

/** AM `$Y`. */
export function setDefaultForm(collection: unknown, formId: string): FormCollection {
  const c = normalizeFormCollection(collection);
  const id = trimString(formId);
  return !id || id === c.defaultFormId || !c.forms.some((f) => f.id === id) ? c : { ...c, defaultFormId: id };
}

/** AM `$Ne`. */
export function findOutfit(collection: unknown, formId: string, outfitId: string): Outfit | null {
  return normalizeFormCollection(collection).forms.find((f) => f.id === trimString(formId))?.outfits.find((o) => o.id === trimString(outfitId)) ?? null;
}

/** AM `Jf` 25249: shallow-patch an outfit (id kept; empty label keeps the old label). */
export function patchOutfit(collection: unknown, formId: string, outfitId: string, patch: Partial<Outfit>): FormCollection {
  const c = normalizeFormCollection(collection);
  const fi = c.forms.findIndex((f) => f.id === trimString(formId));
  if (fi < 0) return c;
  const form = c.forms[fi]!;
  const oi = form.outfits.findIndex((o) => o.id === trimString(outfitId));
  if (oi < 0) return c;
  const old = form.outfits[oi]!;
  const label = (hasOwn(patch, "label") && trimString(patch.label)) || old.label;
  const next = { ...old, ...deepCopy(patch), id: old.id, label } as Outfit;
  return normalizeFormCollection({ ...c, forms: c.forms.map((f, i) => (i === fi ? { ...f, outfits: f.outfits.map((o, j) => (j === oi ? next : o)) } : f)) });
}

/** AM `HL` 25266: add an outfit to a form. */
export function addOutfit(collection: unknown, formId: string, options: { id?: string; label?: string; patch?: Partial<Outfit> } = {}): { collection: FormCollection; outfitId: string } {
  const c = normalizeFormCollection(collection);
  const fid = trimString(formId);
  const fi = c.forms.findIndex((f) => f.id === fid);
  if (fi < 0) return { collection: c, outfitId: "" };
  const form = c.forms[fi]!;
  const taken = new Set(c.forms.flatMap((f) => f.outfits.map((o) => o.id)));
  const label = trimString(options.label ?? options.patch?.label) || `의상 ${form.outfits.length + 1}`;
  const id = outfitIdFor(fid, label, taken, options.id);
  const outfit = { ...createDefaultOutfit(id), ...deepCopy(options.patch ?? {}), id, label } as Outfit;
  return { collection: normalizeFormCollection({ ...c, forms: c.forms.map((f, i) => (i === fi ? { ...f, outfits: [...f.outfits, outfit] } : f)) }), outfitId: id };
}

/** AM `BY` 25281: fill the form's EMPTY default outfit (new id from label). */
export function replaceEmptyDefaultOutfit(collection: unknown, formId: string, options: { id?: string; label?: string; patch?: Partial<Outfit> } = {}): { collection: FormCollection; outfitId: string } {
  const c = normalizeFormCollection(collection);
  const fid = trimString(formId);
  const fi = c.forms.findIndex((f) => f.id === fid);
  if (fi < 0) return { collection: c, outfitId: "" };
  const form = c.forms[fi]!;
  const oi = form.outfits.findIndex((o) => o.id === form.defaultOutfitId);
  const current = form.outfits[oi];
  if (!current || !isOutfitEmpty(current)) return { collection: c, outfitId: "" };
  const taken = new Set(c.forms.flatMap((f) => f.outfits.map((o) => o.id)));
  taken.delete(current.id);
  const label = trimString(options.label ?? options.patch?.label) || current.label;
  const id = outfitIdFor(fid, label, taken, options.id);
  const next = { ...current, ...deepCopy(options.patch ?? {}), id, label } as Outfit;
  return {
    collection: normalizeFormCollection({ ...c, forms: c.forms.map((f, i) => (i === fi ? { ...f, defaultOutfitId: id, outfits: f.outfits.map((o, j) => (j === oi ? next : o)) } : f)) }),
    outfitId: id,
  };
}

/** AM `HY`: delete a non-default outfit. */
export function deleteOutfit(collection: unknown, formId: string, outfitId: string): FormCollection {
  const c = normalizeFormCollection(collection);
  const fid = trimString(formId);
  const oid = trimString(outfitId);
  const form = c.forms.find((f) => f.id === fid);
  return !form || form.defaultOutfitId === oid || !form.outfits.some((o) => o.id === oid)
    ? c
    : normalizeFormCollection({ ...c, forms: c.forms.map((f) => (f.id === fid ? { ...f, outfits: f.outfits.filter((o) => o.id !== oid) } : f)) });
}

/** AM `UY` 25317: promote an outfit to the form default. */
export function promoteOutfitToDefault(collection: unknown, formId: string, outfitId: string): FormCollection {
  const c = normalizeFormCollection(collection);
  const fid = trimString(formId);
  const oid = trimString(outfitId);
  const form = c.forms.find((f) => f.id === fid);
  return !form || form.defaultOutfitId === oid || !form.outfits.some((o) => o.id === oid) ? c : normalizeFormCollection({ ...c, forms: c.forms.map((f) => (f.id === fid ? { ...f, defaultOutfitId: oid } : f)) });
}

/** AM `qY` 25326: move a non-default outfit to another form. */
export function moveOutfit(collection: unknown, fromFormId: string, toFormId: string, outfitId: string): FormCollection {
  const c = normalizeFormCollection(collection);
  const a = trimString(fromFormId);
  const b = trimString(toFormId);
  const oid = trimString(outfitId);
  if (!a || a === b) return c;
  const from = c.forms.find((f) => f.id === a);
  const to = c.forms.find((f) => f.id === b);
  const outfit = from?.outfits.find((o) => o.id === oid);
  if (!from || !to || !outfit || from.defaultOutfitId === oid || to.outfits.some((o) => o.id === oid)) return c;
  return normalizeFormCollection({
    ...c,
    forms: c.forms.map((f) => (f.id === a ? { ...f, outfits: f.outfits.filter((o) => o.id !== oid) } : f.id === b ? { ...f, outfits: [...f.outfits, outfit] } : f)),
  });
}

/** AM `GY` 25348: optimistic check that a target still exists at the given revision. */
export function isFormTargetCurrent(collection: unknown, target: { collectionRevision: string; formId: string; outfitId?: string }): boolean {
  const c = normalizeFormCollection(collection);
  if (formCollectionRevision(c) !== target.collectionRevision) return false;
  const form = c.forms.find((f) => f.id === trimString(target.formId));
  return form ? !target.outfitId || form.outfits.some((o) => o.id === trimString(target.outfitId)) : false;
}

const TRANSIENT_OUTFIT_KEYS = new Set(["decisionReason", "decisionConfidence", "createdAt", "updatedAt"]);
const TEXT_OUTFIT_KEYS = new Set(["description", "head", "top", "bottom", "legs", "feet"]);
/** AM `$W` 21064: compact an outfit for storage. */
export function compactOutfitForStorage(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (TRANSIENT_OUTFIT_KEYS.has(k) || (TEXT_OUTFIT_KEYS.has(k) && String(v ?? "").trim() === "") || (k === "referenceAnalysisEnabled" && v === true)) continue;
    if (k === "referenceAsset") {
      if (v != null) out[k] = compactStoredAssetRef(v);
      continue;
    }
    if ((Array.isArray(v) && v.length === 0) || v === undefined) continue;
    out[k] = v;
  }
  return out;
}
function compactReference(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v == null) continue;
    if (k === "defaultAsset" || k === "referenceAsset") out[k] = compactStoredAssetRef(v);
    else if (!(k === "referenceAnalysisEnabled" && v === true)) out[k] = v;
  }
  return out;
}
/** AM `BW`/`Jje`: compact a FormCollection for storage (normalizeFormCollection restores the defaults). */
export function compactFormCollectionForStorage(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  const c = value as Record<string, unknown>;
  if (!Array.isArray(c.forms)) return { ...c };
  return {
    ...c,
    forms: c.forms.map((form) => {
      if (form === null || typeof form !== "object" || Array.isArray(form)) return form;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        if ((k === "description" || k === "negativePrompt") && String(v ?? "").trim() === "") continue;
        if (k === "basePromptGroups") {
          const g = Object.fromEntries(
            Object.entries(asRecord(v)).flatMap(([gk, gv]) => {
              if (Array.isArray(gv)) {
                const kept = gv.filter((x) => String(x ?? "").trim() !== "");
                return kept.length ? [[gk, kept]] : [];
              }
              return gv === undefined ? [] : [[gk, gv]];
            }),
          );
          if (Object.keys(g).length) out[k] = g;
          continue;
        }
        if (k === "reference") {
          const ref = compactReference(v);
          if (ref && typeof ref === "object" && Object.keys(ref).length) out[k] = ref;
          continue;
        }
        if (k === "outfits") {
          out[k] = Array.isArray(v) ? v.map(compactOutfitForStorage) : v;
          continue;
        }
        if (v !== undefined) out[k] = v;
      }
      return out;
    }),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Custom characters (`wTe` 31761, `MJ` 31810, `xTe` 31820, `gD` 31752, `_x` 31748, `_Te` 31833)
 * ---------------------------------------------------------------------------------------------- */

export interface CustomCharacter {
  /** `character_<uuid v4>` */
  id: string;
  title: string;
  recognitionKeys: string[];
  appearanceDescription: string;
  /** Absent = registered in the roster. */
  rosterRegistered?: false;
  /** Absent = active. Legacy `analyzerEnabled:false` maps here. */
  workspaceEnabled?: false;
  /** AI-generated, not yet promoted. */
  origin?: "ai-auto";
}

export interface CustomCharacterInput {
  title: unknown;
  recognitionKeys: unknown;
  appearanceDescription?: unknown;
}

const CUSTOM_CHARACTER_KEYS = new Set(["id", "title", "recognitionKeys", "appearanceDescription", "rosterRegistered", "workspaceEnabled", "analyzerEnabled", "origin"]);

/** AM `_x`: split recognition keys on `[,\r\n]`, trim, dedupe. */
export function splitRecognitionKeys(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,\r\n]+/gu) : [];
  return [...new Set(parts.map(trimString).filter(Boolean))];
}

/** Validation messages (English; Korean originals in `messageKo`). */
export interface CustomCharacterInputError {
  field: "title" | "recognitionKeys";
  message: string;
  messageKo: string;
}
/** AM `gD`. */
export function validateCustomCharacterInput(input: CustomCharacterInput): CustomCharacterInputError[] {
  const errors: CustomCharacterInputError[] = [];
  if (!trimString(input.title)) errors.push({ field: "title", message: "Enter a character name.", messageKo: "캐릭터 이름을 입력해주세요." });
  if (!splitRecognitionKeys(input.recognitionKeys).length) errors.push({ field: "recognitionKeys", message: "Enter at least one recognition key.", messageKo: "인식 키를 하나 이상 입력해주세요." });
  return errors;
}

/** AM `wTe`: strict parse of a stored custom character (unknown keys or invalid values -> null). */
export function parseCustomCharacter(value: unknown): CustomCharacter | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const e = value as Record<string, unknown>;
  if (Object.keys(e).some((k) => !CUSTOM_CHARACTER_KEYS.has(k))) return null;
  const id = trimString(e.id);
  const title = trimString(e.title);
  const keys = splitRecognitionKeys(e.recognitionKeys);
  if (
    !id.startsWith(CUSTOM_CHARACTER_ID_PREFIX) ||
    !title ||
    !Array.isArray(e.recognitionKeys) ||
    !keys.length ||
    keys.length !== e.recognitionKeys.length ||
    (hasOwn(e, "rosterRegistered") && e.rosterRegistered !== false) ||
    (hasOwn(e, "workspaceEnabled") && e.workspaceEnabled !== false) ||
    (hasOwn(e, "analyzerEnabled") && e.analyzerEnabled !== false) ||
    (hasOwn(e, "origin") && e.origin !== AI_AUTO_ORIGIN)
  )
    return null;
  return {
    id,
    title,
    recognitionKeys: keys,
    appearanceDescription: trimString(e.appearanceDescription),
    ...(e.rosterRegistered === false ? { rosterRegistered: false as const } : {}),
    ...(e.workspaceEnabled === false || e.analyzerEnabled === false ? { workspaceEnabled: false as const } : {}),
    ...(e.origin === AI_AUTO_ORIGIN ? { origin: "ai-auto" as const } : {}),
  };
}

/** AM `MJ`: create (throws the first validation error message). */
export function createCustomCharacter(input: CustomCharacterInput, takenIds: ReadonlySet<string> = new Set()): CustomCharacter {
  const errors = validateCustomCharacterInput(input);
  if (errors.length) throw new Error(errors[0]!.message);
  return { id: prefixedId("character", takenIds), title: trimString(input.title), recognitionKeys: splitRecognitionKeys(input.recognitionKeys), appearanceDescription: trimString(input.appearanceDescription) };
}

/** AM `xTe`: update text fields, keep flags. */
export function updateCustomCharacter(current: CustomCharacter, input: CustomCharacterInput): CustomCharacter {
  const errors = validateCustomCharacterInput(input);
  if (errors.length) throw new Error(errors[0]!.message);
  return {
    id: current.id,
    title: trimString(input.title),
    recognitionKeys: splitRecognitionKeys(input.recognitionKeys),
    appearanceDescription: trimString(input.appearanceDescription),
    ...(current.rosterRegistered === false ? { rosterRegistered: false as const } : {}),
    ...(current.workspaceEnabled === false ? { workspaceEnabled: false as const } : {}),
    ...(current.origin === AI_AUTO_ORIGIN ? { origin: "ai-auto" as const } : {}),
  };
}

/** AM `_Te`: recognition keys that clash with other custom characters. */
export function findDuplicateRecognitionKeys(characters: readonly CustomCharacter[], keys: unknown, exceptId = ""): string[] {
  const used = new Set(characters.flatMap((c) => (c.id === exceptId ? [] : c.recognitionKeys)));
  return splitRecognitionKeys(keys).filter((k) => used.has(k));
}

/** Roster state of a custom character (AM `R6` 100686). */
export function customCharacterRosterState(c: CustomCharacter): { registered: boolean; workspaceEnabled: boolean } {
  const registered = c.rosterRegistered !== false;
  return { registered, workspaceEnabled: registered && c.workspaceEnabled !== false };
}

/** Promotion (AM `promoteGenerated` 37858): drop `origin:"ai-auto"`. */
export function promoteCustomCharacter(c: CustomCharacter): CustomCharacter {
  const { origin: _origin, ...rest } = c;
  return rest;
}

/** Roster state of a lorebook actor (AM `FT` 100652): registered = selected; active = registered && !disabled. */
export function loreRosterState(cp: Pick<CharacterScopedPrompt, "selectedLorebooks" | "workspaceDisabledLorebooks">, memberKey: string, selectionId: string): { registered: boolean; workspaceEnabled: boolean } {
  const registered = (cp.selectedLorebooks[memberKey] ?? []).includes(selectionId);
  const disabled = (cp.workspaceDisabledLorebooks[memberKey] ?? []).includes(selectionId);
  return { registered, workspaceEnabled: registered && !disabled };
}

/* ------------------------------------------------------------------------------------------------
 * Recognition keys of lorebook actors (`customLorebookKeys`, `kP`/`vw` 88539-88548)
 * ---------------------------------------------------------------------------------------------- */

/** Either extra keys (extend) or `{version:1, mode:"replace", keys}`. */
export type CustomLorebookKeys = string[] | { version: 1; mode: "replace"; keys: string[] };

function splitLoreKeys(value: unknown): string[] {
  return Array.isArray(value) ? uniqueStringsCaseInsensitive(value) : uniqueStringsCaseInsensitive(trimString(value).split(/[\r\n,;|]+/gu));
}
/** AM `kP`. */
export function parseCustomLorebookKeys(value: unknown): { keys: string[]; replacesBaseKeys: boolean } {
  const r = asRecord(value);
  return trimString(r.mode) === "replace" && Array.isArray(r.keys) ? { keys: splitLoreKeys(r.keys), replacesBaseKeys: true } : { keys: splitLoreKeys(value), replacesBaseKeys: false };
}
/** AM `vw`: effective activation keys = replace ? custom : base + custom + extra. */
export function effectiveRecognitionKeys(baseKeys: readonly string[], custom: unknown, extra: readonly string[] = []): string[] {
  const parsed = parseCustomLorebookKeys(custom);
  return parsed.replacesBaseKeys ? parsed.keys : uniqueStringsCaseInsensitive([...baseKeys, ...parsed.keys, ...extra]);
}
/** Writer form used by AM `Ife` 88575 (always replace). */
export function replaceRecognitionKeys(keys: unknown): CustomLorebookKeys {
  return { version: 1, mode: "replace", keys: splitLoreKeys(keys) };
}

/* ------------------------------------------------------------------------------------------------
 * Artists (NovelAI list `artistPrompts` + Anima list `animaArtists`)
 * ---------------------------------------------------------------------------------------------- */

export interface NovelAIArtistOverrides { steps?: number; scale?: number; cfgRescale?: number }
export interface NonArtistPromptWeight { enabled: boolean; multiplier: number }
export interface ArtistEntry {
  /** `artist_<uuid>` for user entries; built-in preset ids for override-only entries. */
  id: string;
  title: string;
  prompt: string;
  negativePrompt?: string;
  novelAIOverrides?: NovelAIArtistOverrides;
  nonArtistPromptWeight?: NonArtistPromptWeight;
  description?: string;
  origin?: "analysis" | string;
  sourceId?: string;
  sourceName?: string;
  sourcePromptKey?: string;
  sourceLoreTitle?: string;
  sourceAssetName?: string;
  [key: string]: unknown;
}
export interface ArtistPreset { id: string; title: string; prompt: string; negativePrompt: string; description: string }
const defaultPresets = defaultPresetsJson as unknown as {
  DEFAULT_ARTIST_PRESETS: ArtistPreset[];
  DEFAULT_MALE_PERSONA_PROMPT: string;
  DEFAULT_OUTFIT_PART_FRAMING_WEIGHTS: Record<OutfitPart, Record<string, number>>;
  DEFAULT_OUTFIT_PART_CONTEXT_WEIGHT_RULES: unknown[];
  ANIMA_DEFAULT_POSITIVE_PROMPT: string;
  ANIMA_DEFAULT_NEGATIVE_PROMPT: string;
};
/** Built-in NovelAI artist presets (`_je` 20463). Titles are Korean in the original data. */
export const DEFAULT_ARTIST_PRESETS: readonly ArtistPreset[] = defaultPresets.DEFAULT_ARTIST_PRESETS;
export const DEFAULT_SELECTED_ARTIST_ID = "detail_anime_illustration_style";
export const DEFAULT_MALE_PERSONA_PROMPT = defaultPresets.DEFAULT_MALE_PERSONA_PROMPT;
export const DEFAULT_OUTFIT_PART_FRAMING_WEIGHTS: Record<OutfitPart, Record<string, number>> = defaultPresets.DEFAULT_OUTFIT_PART_FRAMING_WEIGHTS;
export const DEFAULT_OUTFIT_PART_CONTEXT_WEIGHT_RULES: readonly unknown[] = defaultPresets.DEFAULT_OUTFIT_PART_CONTEXT_WEIGHT_RULES;
export const ANIMA_DEFAULT_POSITIVE_PROMPT = defaultPresets.ANIMA_DEFAULT_POSITIVE_PROMPT;
export const ANIMA_DEFAULT_NEGATIVE_PROMPT = defaultPresets.ANIMA_DEFAULT_NEGATIVE_PROMPT;

/** Ranges of artist NovelAI overrides (`Rc` 24481). */
export const ARTIST_OVERRIDE_RANGES = Object.freeze({ steps: { min: 1, max: 50, step: 1 }, scale: { min: 0, max: 20, step: 0.1 }, cfgRescale: { min: 0, max: 1, step: 0.01 } });

function clampOptional(value: unknown, min: number, max: number): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
}
/** AM `Ja` 24493. */
export function normalizeNovelAIArtistOverrides(value: unknown): NovelAIArtistOverrides | undefined {
  const r = asRecord(value);
  const steps = hasOwn(r, "steps") ? clampOptional(r.steps, 1, 50) : undefined;
  const scale = hasOwn(r, "scale") ? clampOptional(r.scale, 0, 20) : undefined;
  const cfgRescale = hasOwn(r, "cfgRescale") ? clampOptional(r.cfgRescale, 0, 1) : undefined;
  const out: NovelAIArtistOverrides = {
    ...(steps === undefined ? {} : { steps: Math.round(steps) }),
    ...(scale === undefined ? {} : { scale }),
    ...(cfgRescale === undefined ? {} : { cfgRescale }),
  };
  return Object.keys(out).length ? out : undefined;
}
/** AM `Aa` 24565: multiplier clamp 0.5..1, step 0.05, default 0.7. */
export function normalizeNonArtistPromptWeight(value: unknown): NonArtistPromptWeight | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const r = value as Record<string, unknown>;
  const multiplier = typeof r.multiplier === "number" && Number.isFinite(r.multiplier) ? Math.round(Math.min(1, Math.max(0.5, r.multiplier)) * 20) / 20 : 0.7;
  return { enabled: r.enabled === true, multiplier };
}

/** AM `Mu` 7452: normalize the whitespace before the closing `::` of weighted groups. */
export function normalizeWeightedPromptSpacing(text: string): string {
  if (!text.includes("::")) return text;
  const numberEnd = /[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/u;
  const opensGroup = (at: number): boolean => {
    const m = numberEnd.exec(text.slice(0, at));
    if (!m) return false;
    const start = at - m[0].length;
    if (start === 0) return true;
    let i = start - 1;
    while (i >= 0 && /\s/u.test(text[i] ?? "")) i -= 1;
    return i < 0 ? true : /[,|([{]/u.test(text[i] ?? "");
  };
  let out = "";
  let pos = 0;
  let depth = 0;
  while (pos < text.length) {
    const at = text.indexOf("::", pos);
    if (at < 0) {
      out += text.slice(pos);
      break;
    }
    out += text.slice(pos, at);
    if (opensGroup(at)) {
      depth += 1;
      out += "::";
    } else if (depth > 0) {
      out = out.replace(/[ \t]*$/u, " ") + "::";
      depth -= 1;
    } else out += "::";
    pos = at + 2;
  }
  return out;
}

export interface ResolvedNovelAIArtist extends ArtistPreset {
  displayTitle: string;
  userDefined: boolean;
  novelAIOverrides?: NovelAIArtistOverrides;
  nonArtistPromptWeight?: NonArtistPromptWeight;
}
/** AM `FP` 94880: built-in presets (with stored overrides) + user entries. */
export function listNovelAIArtists(artistPrompts: unknown): ResolvedNovelAIArtist[] {
  const entries = asArray(artistPrompts);
  const out = new Map<string, ResolvedNovelAIArtist>();
  for (const preset of DEFAULT_ARTIST_PRESETS) {
    const stored = preset.id === "none" ? {} : asRecord(entries.find((e) => trimString(asRecord(e).id) === preset.id));
    const overrides = normalizeNovelAIArtistOverrides(stored.novelAIOverrides);
    const weight = normalizeNonArtistPromptWeight(stored.nonArtistPromptWeight);
    out.set(preset.id, { ...preset, ...(overrides ? { novelAIOverrides: overrides } : {}), ...(weight ? { nonArtistPromptWeight: weight } : {}), displayTitle: preset.title, description: preset.description ?? "", negativePrompt: preset.negativePrompt ?? "", userDefined: false });
  }
  entries.forEach((raw, index) => {
    const a = asRecord(raw);
    if (!Object.keys(a).length) return;
    const id = trimString(a.id ?? a.artistId ?? a.artist_id) || `artist_${index + 1}`;
    if (out.has(id)) return;
    const title = trimString(a.title ?? a.name ?? a.label) || id;
    const sourceName = trimString(a.sourceName ?? a.source_name) || trimString(a.sourceCharacterName ?? a.source_character_name);
    const overrides = normalizeNovelAIArtistOverrides(a.novelAIOverrides);
    const weight = normalizeNonArtistPromptWeight(a.nonArtistPromptWeight);
    out.set(id, {
      id,
      title,
      displayTitle: sourceName ? `${title} - ${sourceName}` : title,
      prompt: normalizeWeightedPromptSpacing(trimString(a.prompt ?? a.artistPrompt ?? a.artist_prompt)),
      negativePrompt: normalizeWeightedPromptSpacing(trimString(a.negativePrompt ?? a.negative_prompt)),
      ...(overrides ? { novelAIOverrides: overrides } : {}),
      ...(weight ? { nonArtistPromptWeight: weight } : {}),
      description: trimString(a.description),
      userDefined: true,
    });
  });
  return [...out.values()];
}

export interface AnimaArtistEntry { id: string; title: string; text: string; portableOrigin?: string }
export interface AnimaArtistList {
  version: 1;
  entries: AnimaArtistEntry[];
  /** `defaultId` is global; `bySourceId[characterId]` is per character (stored in the character document). */
  selection: { defaultId: string; bySourceId: Record<string, string> };
}
export const NO_ARTIST_ID = "none";
export function createDefaultAnimaArtists(): AnimaArtistList {
  return { version: 1, entries: [], selection: { defaultId: NO_ARTIST_ID, bySourceId: {} } };
}
function idText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
/** AM `Kje` 20722 (+ `Dje`, `Fje`). */
export function normalizeAnimaArtists(value: unknown): AnimaArtistList {
  const r = asRecord(value);
  const selection = asRecord(r.selection);
  const entries: AnimaArtistEntry[] = [];
  const ids = new Set<string>();
  for (const raw of asArray(r.entries)) {
    const e = asRecord(raw);
    const id = idText(e.id);
    const title = idText(e.title ?? e.name ?? e.label) || id;
    const text = idText(e.text);
    if (!id || id === NO_ARTIST_ID || !text || ids.has(id)) continue;
    ids.add(id);
    const origin = idText(e.portableOrigin);
    entries.push({ id, title, text, ...(origin ? { portableOrigin: origin } : {}) });
  }
  const defaultId = idText(selection.defaultId);
  const bySourceId: Record<string, string> = {};
  for (const [k, v] of Object.entries(asRecord(selection.bySourceId))) {
    const key = idText(k);
    const val = idText(v);
    if (!key || (val !== NO_ARTIST_ID && !ids.has(val))) continue;
    bySourceId[key] = val;
  }
  return { version: 1, entries, selection: { defaultId: ids.has(defaultId) ? defaultId : NO_ARTIST_ID, bySourceId } };
}

/* ------------------------------------------------------------------------------------------------
 * Personas (`personaSettings`, global "settings" domain)
 * ---------------------------------------------------------------------------------------------- */

export interface PersonaProfile {
  forms?: FormCollection | unknown;
  basePromptGroups?: unknown;
  mainPrompt?: string;
  prompt?: string;
  gender?: Gender | string;
  negativePrompt?: string;
  reference?: unknown;
  outfits?: unknown;
  defaultOutfitId?: string;
  referenceAsset?: StoredAssetRef | null;
  referenceEnabled?: boolean;
  analysisEnabled?: boolean;
  referenceAnalysisEnabled?: boolean;
  analysisAssets?: StoredAssetRef[];
  analysis?: { bodyHash?: string; imageKey?: string; metadataFingerprint?: string; analyzedAt?: string; warnings?: string[] };
  [key: string]: unknown;
}
export interface PersonaScopeEntry {
  referenceAsset?: StoredAssetRef | null;
  referenceEnabled?: boolean;
  referenceAnalysisEnabled?: boolean;
  formReferences?: Record<string, { analysisEnabled?: boolean }>;
  /** Key = `JSON.stringify([formId, outfitId])` (legacy key: outfitId). */
  outfitReferences?: Record<string, { referenceAsset?: StoredAssetRef | null; referenceAnalysisEnabled?: boolean }>;
}
export interface PersonaSourceScope { personas: Record<string, PersonaScopeEntry> }
/** Lumiverse: profile keys are Lumiverse persona ids (AM: `id:<persona.id>` persona keys). */
export interface PersonaSettings {
  selectedPersonaKey: string;
  profiles: Record<string, PersonaProfile>;
  /** Keyed by character id (AM source id). */
  sourceScopes: Record<string, PersonaSourceScope>;
}
export function createDefaultPersonaSettings(): PersonaSettings {
  return { selectedPersonaKey: "", profiles: {}, sourceScopes: {} };
}
export function normalizePersonaSettings(value: unknown): PersonaSettings {
  const r = asRecord(value);
  const profiles: Record<string, PersonaProfile> = {};
  for (const [k, v] of Object.entries(asRecord(r.profiles))) if (trimString(k) && v && typeof v === "object" && !Array.isArray(v)) profiles[k] = jsonClone(v as PersonaProfile);
  const scopes: Record<string, PersonaSourceScope> = {};
  for (const [k, v] of Object.entries(asRecord(r.sourceScopes))) {
    if (!trimString(k)) continue;
    scopes[k] = { personas: jsonClone(asRecord(asRecord(v).personas)) as Record<string, PersonaScopeEntry> };
  }
  return { selectedPersonaKey: trimString(r.selectedPersonaKey), profiles, sourceScopes: scopes };
}
/** Key inside `outfitReferences` (AM `oI` 93303). */
export function personaOutfitReferenceKey(formId: string, outfitId: string): string {
  return JSON.stringify([trimString(formId) || DEFAULT_FORM_ID, trimString(outfitId)]);
}
/** AM `yT`/`bd` 93209: forms of a persona (profile.forms, else legacy fields). */
export function resolvePersonaForms(settings: PersonaSettings, personaGender: Gender | string, personaId: string): FormCollection {
  const profile = asRecord(settings.profiles[personaId]);
  return resolveFormCollection(hasOwn(profile, "forms") ? { [personaId]: profile.forms } : {}, personaId, {
    basePromptGroups: profile.basePromptGroups,
    fallbackPrompt: profile.mainPrompt,
    gender: profile.gender,
    fallbackGender: personaGender === "female" ? "female" : "male",
    negativePrompt: profile.negativePrompt,
    reference: profile.reference,
    outfits: profile.outfits,
    defaultOutfitId: profile.defaultOutfitId,
  });
}

/* ------------------------------------------------------------------------------------------------
 * Asset analysis / selection / matching records (loosely typed; written by the analysis flows)
 * ---------------------------------------------------------------------------------------------- */

export interface MetadataSummary { assetName: string; [key: string]: unknown }
export interface AssetMetadataRecord {
  /** Absent = true. */
  analyzeEnabled?: boolean;
  selectedAssetNames?: string[];
  selectedAssets?: StoredAssetRef[];
  summaries?: MetadataSummary[];
  skippedNoMetadataAssetNames?: string[];
  failedImageAnalysisAssetNames?: string[];
  analysisEvidenceMode?: EvidenceMode;
  aiAnalysis?: { status: "done"; outfitCount: number; artistCount: number; completedAt: string; [key: string]: unknown };
  [key: string]: unknown;
}
export interface AssetSelection { selectedAssetNames: string[]; selectedAssets: StoredAssetRef[]; [key: string]: unknown }
export interface LorebookImageFilterProfile { promptKey: string; identityAliases: string[]; confidence: number; inputSignature: string }
export interface LorebookImageFilter {
  status: "idle" | "running" | "done" | "error" | string;
  sourceId: string;
  assetSignature: string;
  promptSignatures: Record<string, string>;
  emptyPromptKeys: string[];
  profiles: LorebookImageFilterProfile[];
  [key: string]: unknown;
}
/** Metadata check state per asset (AM device-local `metadata-cache` domain). */
export type MetadataAvailability = "none" | "partial" | "available" | "deleted";
export interface SeedSetting { seed: string; fixed: boolean }
export interface CharacterReferenceSetting { enabled?: boolean; referenceAnalysisEnabled?: boolean; defaultAsset?: StoredAssetRef | null }

/* ------------------------------------------------------------------------------------------------
 * Per-character generation overrides (`charxSettings`, "workspace" domain). Resolution lives in config.ts.
 * ---------------------------------------------------------------------------------------------- */

/** Per-charx override fields (`gp` 24586). */
export const CHARX_SETTING_FIELDS = [
  "nativeAssetVisibility",
  "freeOutfitGeneration",
  "freeCharacterGeneration",
  "rosterSelectionEnabled",
  "stateAccumulationEnabled",
  "nsfwAlwaysEnabled",
  "forceAiChoiceCoordinates",
  "autoRemoveConflictingRegex",
  "fixedResolution",
  "fixedPositivePrompt",
  "negativePrompt",
  "animaPositivePrompt",
  "animaNegativePrompt",
] as const;
export type CharxSettingField = (typeof CHARX_SETTING_FIELDS)[number];
export type NativeAssetVisibility = "hidden" | "shown";
export interface FixedResolution { enabled: boolean; sizeId: number }

/** Stored per-charx override: any subset of the fields plus `revisionByField`. */
export interface CharxOverride {
  nativeAssetVisibility?: NativeAssetVisibility;
  freeOutfitGeneration?: boolean;
  freeCharacterGeneration?: boolean;
  rosterSelectionEnabled?: boolean;
  stateAccumulationEnabled?: boolean;
  nsfwAlwaysEnabled?: boolean;
  forceAiChoiceCoordinates?: boolean;
  autoRemoveConflictingRegex?: boolean;
  fixedResolution?: FixedResolution;
  fixedPositivePrompt?: string;
  negativePrompt?: string;
  animaPositivePrompt?: string;
  animaNegativePrompt?: string;
  revisionByField?: Partial<Record<CharxSettingField, number>>;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------------------------------------
 * Character document (userStorage `characters/<characterId>/asset-maid.json`)
 * ---------------------------------------------------------------------------------------------- */

/**
 * All source-scoped `characterPrompt` fields of Asset Maid (domains workspace, prompts, artists,
 * asset-selection, asset-analysis, asset-matching, charx-analysis). Same field names and value shapes.
 * Maps keyed by `sourceId` / `chaId` in AM are keyed by the Lumiverse character id.
 */
export interface CharacterScopedPrompt {
  /* workspace */
  selectedSourceId: string;
  selectedCharacters: string[];
  /** memberKey (= characterId) -> selection ids (`<worldBookId>:<entryId>` or the description lore id). Registered in roster. */
  selectedLorebooks: Record<string, string[]>;
  /** memberKey -> selection ids registered but inactive. */
  workspaceDisabledLorebooks: Record<string, string[]>;
  /** AM modules -> Lumiverse world books connected as extra roster sources: characterId -> world book ids. */
  activeModules: Record<string, string[]>;
  charxSettings: { overrides: Record<string, CharxOverride> };
  /* prompts */
  characterIdentityPrompts: Record<string, unknown>;
  basePromptGroups: Record<string, BasePromptGroups>;
  characterForms: Record<string, FormCollection>;
  lorebookPrompts: Record<string, string>;
  lorebookPromptGenders: Record<string, Gender>;
  lorebookNegativePrompts: Record<string, string>;
  outfitPrompts: Record<string, Outfit[]>;
  outfitPartFramingWeights: Record<OutfitPart, Record<string, number>>;
  characterReferences: Record<string, CharacterReferenceSetting>;
  seedSettings: Record<string, SeedSetting>;
  customLorebookKeys: Record<string, CustomLorebookKeys>;
  /* artists (the list itself is global) */
  selectedArtistId: string;
  /* asset-selection */
  assetSelections: Record<string, AssetSelection>;
  /* asset-analysis */
  assetMetadata: Record<string, AssetMetadataRecord>;
  artistExtractionAssetBySourceId: Record<string, StoredAssetRef & { memberKey?: string }>;
  /* asset-matching */
  lorebookImageFilters: Record<string, LorebookImageFilter>;
  /* charx-analysis (AM: RisuAI customscript image-token detectors; Lumiverse: regex scripts) */
  charxAssetRegexAnalysis: Record<string, unknown>;
}

export const CHARACTER_DOCUMENT_SCHEMA = "inlay-illustrator.character";
export const CHARACTER_DOCUMENT_VERSION = 1;

export interface CharacterDocument {
  schema: typeof CHARACTER_DOCUMENT_SCHEMA;
  version: typeof CHARACTER_DOCUMENT_VERSION;
  characterId: string;
  updatedAt: string;
  characterPrompt: CharacterScopedPrompt;
  /** Per-character Anima artist selection (AM `animaArtists.selection.bySourceId[characterId]`); null = global default. */
  animaArtistId: string | null;
  /** AM `features.characters.entries`. */
  customCharacters: CustomCharacter[];
}

export function createDefaultCharacterPrompt(characterId = ""): CharacterScopedPrompt {
  return {
    selectedSourceId: trimString(characterId),
    selectedCharacters: [],
    selectedLorebooks: {},
    workspaceDisabledLorebooks: {},
    activeModules: {},
    charxSettings: { overrides: {} },
    characterIdentityPrompts: {},
    basePromptGroups: {},
    characterForms: {},
    lorebookPrompts: {},
    lorebookPromptGenders: {},
    lorebookNegativePrompts: {},
    outfitPrompts: {},
    outfitPartFramingWeights: jsonClone(DEFAULT_OUTFIT_PART_FRAMING_WEIGHTS),
    characterReferences: {},
    seedSettings: {},
    customLorebookKeys: {},
    selectedArtistId: DEFAULT_SELECTED_ARTIST_ID,
    assetSelections: {},
    assetMetadata: {},
    artistExtractionAssetBySourceId: {},
    lorebookImageFilters: {},
    charxAssetRegexAnalysis: {},
  };
}

export const CHARACTER_SCOPED_PROMPT_FIELDS = Object.freeze(Object.keys(createDefaultCharacterPrompt()) as (keyof CharacterScopedPrompt)[]);

export function createEmptyCharacterDocument(characterId: string, now: Date = new Date()): CharacterDocument {
  return {
    schema: CHARACTER_DOCUMENT_SCHEMA,
    version: CHARACTER_DOCUMENT_VERSION,
    characterId: trimString(characterId),
    updatedAt: now.toISOString(),
    characterPrompt: createDefaultCharacterPrompt(characterId),
    animaArtistId: null,
    customCharacters: [],
  };
}

function stringListMap(value: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(asRecord(value))) {
    const key = trimString(k);
    if (!key || !Array.isArray(v)) continue;
    out[key] = [...new Set(v.map(trimString).filter(Boolean))];
  }
  return out;
}
function objectMap<T>(value: unknown): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(asRecord(value))) if (trimString(k) && v !== null && typeof v === "object" && !Array.isArray(v)) out[k] = jsonClone(v) as T;
  return out;
}
function stringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(asRecord(value))) if (trimString(k) && (typeof v === "string" || typeof v === "number")) out[k] = String(v);
  return out;
}

/** Normalize the per-character prompt fields (stable for already-normalized input). */
export function normalizeCharacterPrompt(value: unknown, characterId = ""): CharacterScopedPrompt {
  const r = asRecord(value);
  const base = createDefaultCharacterPrompt(characterId);
  const forms: Record<string, FormCollection> = {};
  for (const [k, v] of Object.entries(asRecord(r.characterForms))) if (trimString(k)) forms[k] = normalizeFormCollection(v, { fallbackGender: normalizeGender(asRecord(r.lorebookPromptGenders)[k], "female") });
  const genders: Record<string, Gender> = {};
  for (const [k, v] of Object.entries(asRecord(r.lorebookPromptGenders))) if (trimString(k)) genders[k] = normalizeGender(v);
  const outfitPrompts: Record<string, Outfit[]> = {};
  for (const [k, v] of Object.entries(asRecord(r.outfitPrompts))) if (trimString(k) && Array.isArray(v)) outfitPrompts[k] = jsonClone(v) as Outfit[];
  const seeds: Record<string, SeedSetting> = {};
  for (const [k, v] of Object.entries(asRecord(r.seedSettings))) {
    const s = asRecord(v);
    if (trimString(k)) seeds[k] = { seed: trimString(s.seed), fixed: s.fixed === true };
  }
  const customKeys: Record<string, CustomLorebookKeys> = {};
  for (const [k, v] of Object.entries(asRecord(r.customLorebookKeys))) {
    if (!trimString(k)) continue;
    const parsed = parseCustomLorebookKeys(v);
    customKeys[k] = parsed.replacesBaseKeys ? { version: 1, mode: "replace", keys: parsed.keys } : parsed.keys;
  }
  const weights = asRecord(r.outfitPartFramingWeights);
  const framing = jsonClone(base.outfitPartFramingWeights);
  for (const part of OUTFIT_PARTS) {
    const w = asRecord(weights[part]);
    for (const [frame, value] of Object.entries(w)) {
      const n = Number(value);
      if (Number.isFinite(n)) framing[part][frame] = n;
    }
  }
  const overrides: Record<string, CharxOverride> = objectMap<CharxOverride>(asRecord(r.charxSettings).overrides);
  return {
    selectedSourceId: trimString(r.selectedSourceId) || base.selectedSourceId,
    selectedCharacters: Array.isArray(r.selectedCharacters) ? r.selectedCharacters.map(trimString).filter(Boolean) : [],
    selectedLorebooks: stringListMap(r.selectedLorebooks),
    workspaceDisabledLorebooks: stringListMap(r.workspaceDisabledLorebooks),
    activeModules: stringListMap(r.activeModules),
    charxSettings: { overrides },
    characterIdentityPrompts: jsonClone(asRecord(r.characterIdentityPrompts)),
    basePromptGroups: Object.fromEntries(Object.entries(asRecord(r.basePromptGroups)).filter(([k]) => trimString(k)).map(([k, v]) => [k, normalizeBasePromptGroups(v, { allowPromptFragments: true })])),
    characterForms: forms,
    lorebookPrompts: stringMap(r.lorebookPrompts),
    lorebookPromptGenders: genders,
    lorebookNegativePrompts: stringMap(r.lorebookNegativePrompts),
    outfitPrompts,
    outfitPartFramingWeights: framing,
    characterReferences: objectMap<CharacterReferenceSetting>(r.characterReferences),
    seedSettings: seeds,
    customLorebookKeys: customKeys,
    selectedArtistId: trimString(r.selectedArtistId) || base.selectedArtistId,
    assetSelections: objectMap<AssetSelection>(r.assetSelections),
    assetMetadata: objectMap<AssetMetadataRecord>(r.assetMetadata),
    artistExtractionAssetBySourceId: objectMap<StoredAssetRef & { memberKey?: string }>(r.artistExtractionAssetBySourceId),
    lorebookImageFilters: objectMap<LorebookImageFilter>(r.lorebookImageFilters),
    charxAssetRegexAnalysis: jsonClone(asRecord(r.charxAssetRegexAnalysis)),
  };
}

export interface NormalizeResult<T> { value: T; issues: ContractIssue[] }

/** Normalize a stored character document. Invalid custom characters are dropped and reported. */
export function normalizeCharacterDocument(raw: unknown, characterId: string): NormalizeResult<CharacterDocument> {
  const r = asRecord(raw);
  const issues: ContractIssue[] = [];
  const id = trimString(characterId) || trimString(r.characterId);
  if (raw !== undefined && raw !== null && (r.schema !== CHARACTER_DOCUMENT_SCHEMA || r.version !== CHARACTER_DOCUMENT_VERSION)) {
    issues.push({ path: "$", code: "schema-mismatch", message: `Expected ${CHARACTER_DOCUMENT_SCHEMA} v${CHARACTER_DOCUMENT_VERSION}.` });
  }
  if (trimString(r.characterId) && trimString(r.characterId) !== id) issues.push({ path: "$.characterId", code: "character-id-mismatch", message: "Document belongs to another character; id replaced." });
  const customCharacters: CustomCharacter[] = [];
  const ids = new Set<string>();
  asArray(r.customCharacters).forEach((c, i) => {
    const parsed = parseCustomCharacter(c);
    if (!parsed) issues.push({ path: `$.customCharacters[${i}]`, code: "invalid-custom-character", message: "Invalid custom character dropped." });
    else if (ids.has(parsed.id)) issues.push({ path: `$.customCharacters[${i}]`, code: "duplicate-custom-character", message: `Duplicate custom character id dropped: ${parsed.id}` });
    else {
      ids.add(parsed.id);
      customCharacters.push(parsed);
    }
  });
  const anima = trimString(r.animaArtistId);
  return {
    value: {
      schema: CHARACTER_DOCUMENT_SCHEMA,
      version: CHARACTER_DOCUMENT_VERSION,
      characterId: id,
      updatedAt: typeof r.updatedAt === "string" && r.updatedAt ? r.updatedAt : new Date(0).toISOString(),
      characterPrompt: normalizeCharacterPrompt(r.characterPrompt, id),
      animaArtistId: anima || null,
      customCharacters,
    },
    issues,
  };
}

/**
 * AM `JJ` 33099: remove every trace of a custom character (or any prompt key) from the per-character prompt maps.
 */
export function removePromptKeyData(cp: CharacterScopedPrompt, promptKey: string): CharacterScopedPrompt {
  const strip = <T>(map: Record<string, T>): Record<string, T> => {
    if (!hasOwn(map, promptKey)) return map;
    const next = { ...map };
    delete next[promptKey];
    return next;
  };
  return {
    ...cp,
    characterIdentityPrompts: strip(cp.characterIdentityPrompts),
    basePromptGroups: strip(cp.basePromptGroups),
    characterForms: strip(cp.characterForms),
    lorebookPrompts: strip(cp.lorebookPrompts),
    lorebookPromptGenders: strip(cp.lorebookPromptGenders),
    lorebookNegativePrompts: strip(cp.lorebookNegativePrompts),
    outfitPrompts: strip(cp.outfitPrompts),
    characterReferences: strip(cp.characterReferences),
    seedSettings: strip(cp.seedSettings),
    customLorebookKeys: strip(cp.customLorebookKeys),
    assetSelections: strip(cp.assetSelections),
    assetMetadata: strip(cp.assetMetadata),
  };
}

/** AM `vn` 93684-like: forms of a lorebook/custom prompt key from the character prompt maps. */
export function resolveCharacterForms(cp: Partial<CharacterScopedPrompt>, promptKey: string, extra: { fallbackPrompt?: string; fallbackGender?: Gender } = {}): FormCollection {
  return resolveFormCollection(cp.characterForms, promptKey, {
    basePromptGroups: asRecord(cp.basePromptGroups)[promptKey],
    fallbackPrompt: asRecord(cp.lorebookPrompts)[promptKey] ?? extra.fallbackPrompt,
    gender: asRecord(cp.lorebookPromptGenders)[promptKey],
    fallbackGender: extra.fallbackGender,
    negativePrompt: asRecord(cp.lorebookNegativePrompts)[promptKey],
    reference: asRecord(cp.characterReferences)[promptKey],
    outfits: asRecord(cp.outfitPrompts)[promptKey],
  });
}

/* ------------------------------------------------------------------------------------------------
 * Representative-image filename tag table (`znt` 88607, `Sfe` 89538)
 * ---------------------------------------------------------------------------------------------- */
export type FilenameTagRole = "scene" | "composition" | "pose" | "emotion" | "outfit" | "context" | "marker" | "clothing-state";
export type FilenameTagEffect = "keep" | "prefer" | "caution" | "exclude";
export interface FilenameTagRow { tag: string; role: FilenameTagRole; effect: FilenameTagEffect; aliases: string[] }
const tagTable = filenameTagTableJson as unknown as { source: string; rawRows: string[][]; rankingVocab: Record<string, unknown> };
/** 929 rows `[tag, role, effect, ...aliases]` expanded. */
export const FILENAME_TAG_TABLE: readonly FilenameTagRow[] = tagTable.rawRows.map(([tag, role, effect, ...aliases]) => ({ tag: tag!, role: role as FilenameTagRole, effect: effect as FilenameTagEffect, aliases }));
/** Ranking vocabulary (`Sfe`): marker words, emotion tiers, limited-visibility emotions ... */
export const FILENAME_RANKING_VOCAB: Readonly<Record<string, unknown>> = tagTable.rankingVocab;
