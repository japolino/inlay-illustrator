/**
 * Pure helpers of the workspace tabs: provider capabilities, form/outfit display data, asset selections,
 * display filters (AM `vvt` 133893), tri-state checkboxes, analysis notice text (AM `z9` 81571),
 * picker titles (AM `Lxt` 146612) and pick-result text (AM `hvt` 133864). No Preact imports.
 */
import {
  APPEARANCE_CATALOG,
  compileMainPrompt,
  normalizeAssetRef,
  resolveCharacterForms,
  splitPromptFragments,
  assetIdentity,
  type AssetRef,
  type CharacterDocument,
  type Form,
  type FormCollection,
  type Gender,
  type Outfit,
  type StoredAssetRef
} from "../../../shared/contract/character.js";
import {
  PROVIDER_CAPABILITIES,
  generationProviderFromLumiverse,
  isReferenceEnabledForProvider,
  usesAnimaArtists,
  type GenerationProvider,
  type InlayConfig
} from "../../../shared/contract/config.js";
import type { BackendStatus, PersonaSummary, ProgressInfo, RosterItem, RosterSource } from "../../../shared/contract/rpc.js";
import type { FilterGroup, FilterValues } from "../shell/filters.js";
import { matchFlag } from "../shell/filters.js";
import type { PickerTarget } from "../workspace-ui.js";
import { ASSETS_LABELS } from "./labels/assets.js";
import { ANALYSIS_LABELS, FILTER_GROUP_LABELS, FORM_LABELS, OUTFIT_LABELS, PICKER_LABELS } from "./labels/common.js";

/* ------------------------------------------------------------------------------------------------
 * Provider capabilities
 * ---------------------------------------------------------------------------------------------- */

export interface ProviderInfo {
  provider: GenerationProvider;
  /** AM `Xj`: reference UI shown (character / outfit / persona reference cards and pickers). */
  referenceUiVisible: boolean;
  /** AM `Tu`: reference path enabled. */
  referencesEnabled: boolean;
  /** AM `up`: outfit image generation supported. */
  outfitGeneration: boolean;
  /** AM `Nc`: anima-flat codec (Comfy UI artist list). */
  anima: boolean;
}

export function providerInfo(config: InlayConfig | null, status: BackendStatus | null): ProviderInfo {
  const provider: GenerationProvider = config?.image?.provider
    ? generationProviderFromLumiverse(config.image.provider)
    : (config?.runtime?.generationProvider ?? status?.generationProvider ?? "novelai");
  const caps = PROVIDER_CAPABILITIES[provider] ?? PROVIDER_CAPABILITIES.generic;
  return {
    provider,
    referenceUiVisible: caps.referenceUiMode === "full",
    referencesEnabled: isReferenceEnabledForProvider(provider, config?.novelai?.characterReferenceEnabled !== false, config?.runtime?.comfyuiCharacterReferenceEnabled !== false),
    outfitGeneration: caps.outfitImageGeneration === "enabled",
    anima: usesAnimaArtists(provider)
  };
}

/* ------------------------------------------------------------------------------------------------
 * Labels stored as data (Korean defaults from Asset Maid)
 * ---------------------------------------------------------------------------------------------- */

/** Display label of a form (stored defaults `기본` / `폼 N` are translated). */
export function formDisplayLabel(label: string): string {
  if (label === "기본") return FORM_LABELS.defaultFormLabel;
  const m = /^폼 (\d+)$/u.exec(label);
  return m ? FORM_LABELS.formN(m[1]!) : label;
}

/** Display label of an outfit (AM `Npe` fallback `의상 ${i+1}`, default `기본 의상`). */
export function outfitDisplayLabel(outfit: Pick<Outfit, "label" | "id">, index: number): string {
  const label = outfit.label.trim();
  if (!label) return OUTFIT_LABELS.outfitN(index + 1);
  if (label === "기본 의상") return OUTFIT_LABELS.defaultOutfit;
  const m = /^의상 (\d+)$/u.exec(label);
  return m ? OUTFIT_LABELS.outfitN(Number(m[1])) : label;
}

/* ------------------------------------------------------------------------------------------------
 * Forms
 * ---------------------------------------------------------------------------------------------- */

export function characterCollection(doc: CharacterDocument | null | undefined, promptKey: string, fallbackGender?: Gender): FormCollection {
  return resolveCharacterForms(doc?.characterPrompt ?? {}, promptKey, fallbackGender ? { fallbackGender } : {});
}

export function findForm(collection: FormCollection, formId: string | null | undefined): Form {
  return collection.forms.find((f) => f.id === formId) ?? collection.forms.find((f) => f.id === collection.defaultFormId) ?? collection.forms[0]!;
}

export function composedPrompt(form: Pick<Form, "basePromptGroups" | "gender">): string {
  return compileMainPrompt(form.basePromptGroups, form.gender);
}

/** AM `lve`/`evt`: true when every form's composed base prompt is empty. */
export function isUnanalyzed(collection: FormCollection): boolean {
  return collection.forms.every((form) => !composedPrompt(form).trim());
}

/** Filter "empty": some form has a blank composed base prompt. */
export function hasEmptyForm(collection: FormCollection): boolean {
  return collection.forms.some((form) => !composedPrompt(form).trim());
}

/** Join / split tags for the base prompt inputs (AM `Zme`: ", " join, `dp` split). */
export function joinTags(values: readonly string[] | undefined): string {
  return (values ?? []).join(", ");
}
export function splitTags(text: string): string[] {
  return splitPromptFragments(text);
}

/** Preset options of a catalog field (AM `hW`): hair length, breast size. */
export function catalogOptions(fieldId: string): { value: string; label: string }[] {
  const group = APPEARANCE_CATALOG.groups.find((g) => g.id === fieldId);
  return (group?.options ?? []).map((o) => {
    const tag = (o.prompt ?? o.id).replace(/_/gu, " ");
    return { value: tag, label: tag };
  });
}

/** Outfits flagged AI-auto and ready (bulk promote). */
export function promotableOutfits(collection: FormCollection, formId: string | null): { formId: string; outfitId: string }[] {
  const out: { formId: string; outfitId: string }[] = [];
  for (const form of collection.forms) {
    if (formId && form.id !== formId) continue;
    for (const outfit of form.outfits) if (outfit.origin === "ai-auto" && (outfit.status ?? "ready") === "ready") out.push({ formId: form.id, outfitId: outfit.id });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Assets
 * ---------------------------------------------------------------------------------------------- */

export function toAssetRef(stored: StoredAssetRef | AssetRef | null | undefined): AssetRef | null {
  if (!stored) return null;
  const ref = normalizeAssetRef(stored);
  return ref.key || ref.name ? ref : null;
}

export function sameAsset(a: StoredAssetRef | AssetRef | null | undefined, b: StoredAssetRef | AssetRef | null | undefined): boolean {
  if (!a || !b) return false;
  return assetIdentity(a) === assetIdentity(b);
}

/** Selected assets of a roster row / persona (AM `hI` asset-selection context). */
export function selectedAssets(doc: CharacterDocument | null | undefined, promptKey: string): AssetRef[] {
  const selection = doc?.characterPrompt.assetSelections[promptKey];
  const list = selection?.selectedAssets?.length ? selection.selectedAssets : (selection?.selectedAssetNames ?? []).map((name) => ({ name, key: name }));
  return list.map((a) => toAssetRef(a)).filter((a): a is AssetRef => !!a);
}

/** Reference asset of a character form (form reference, else the legacy per-character reference). */
export function formReferenceAsset(doc: CharacterDocument | null | undefined, collection: FormCollection, promptKey: string, formId: string): AssetRef | null {
  const form = findForm(collection, formId);
  const fromForm = toAssetRef(form?.reference?.defaultAsset ?? null);
  if (fromForm) return fromForm;
  if (form?.id !== collection.defaultFormId) return null;
  return toAssetRef(doc?.characterPrompt.characterReferences[promptKey]?.defaultAsset ?? null);
}

export function outfitReferenceAsset(outfit: Outfit): AssetRef | null {
  return toAssetRef(outfit.referenceAsset ?? null) ?? toAssetRef(outfit.imageAsset ?? null);
}

/** Reference enabled of a form (`reference.enabled !== false`). */
export function formReferenceEnabled(form: Form): boolean {
  return form.reference?.enabled !== false;
}

/** Analysis flag of a reference entry (`referenceAnalysisEnabled !== false`). */
export function formAnalysisEnabled(form: Form): boolean {
  return form.reference?.referenceAnalysisEnabled !== false;
}

/* ------------------------------------------------------------------------------------------------
 * Tri-state checkboxes
 * ---------------------------------------------------------------------------------------------- */

export type TriState = boolean | "indeterminate";
export function triState(values: readonly boolean[]): TriState {
  if (values.length === 0) return false;
  const on = values.filter(Boolean).length;
  return on === 0 ? false : on === values.length ? true : "indeterminate";
}

/* ------------------------------------------------------------------------------------------------
 * Display filters (AM `hve,gve,yve,bve,vve,yvt,bvt` 133879-133892, matcher `vvt` 133893)
 * ---------------------------------------------------------------------------------------------- */

const G = FILTER_GROUP_LABELS;
const ROSTER: FilterGroup = { id: "roster", label: G.roster.label, yes: G.roster.yes, no: G.roster.no };
const ORIGIN: FilterGroup = {
  id: "origin",
  label: G.origin.label,
  options: [
    { id: "all", label: G.origin.all },
    { id: "lorebook", label: G.origin.lorebook },
    { id: "module", label: G.origin.module },
    { id: "custom", label: G.origin.custom },
    { id: "ai-auto", label: G.origin.aiAuto }
  ]
};
const ASSETS: FilterGroup = { id: "assets", label: G.assets.label, yes: G.assets.yes, no: G.assets.no };
const EMPTY: FilterGroup = { id: "empty", label: G.empty.label, yes: G.empty.yes, no: G.empty.no };
const CHECKED: FilterGroup = { id: "checked", label: G.checked.label, yes: G.checked.yes, no: G.checked.no };
const REFERENCE: FilterGroup = { id: "reference", label: G.reference.label, yes: G.reference.yes, no: G.reference.no };

export const FILTER_GROUPS = {
  /** Assets tab, CharX view (`bve`). */
  assetsCharx: [ROSTER, ORIGIN, ASSETS, EMPTY, CHECKED],
  /** Assets tab, persona view (`yvt`). */
  assetsPersona: [ASSETS, EMPTY, CHECKED],
  /** Prompts tab (`vve`). */
  prompts: [ROSTER, ORIGIN, EMPTY, REFERENCE],
  /** Persona tab (`bvt`). */
  persona: [EMPTY, REFERENCE]
} as const satisfies Record<string, FilterGroup[]>;

/** Facts the matcher needs about one row. */
export interface FilterFacts {
  roster?: boolean;
  origin?: "lorebook" | "module" | "custom" | "ai-auto";
  assets?: boolean;
  empty?: boolean;
  checked?: boolean;
  reference?: boolean;
}

export function matchesFilters(facts: FilterFacts, values: FilterValues): boolean {
  for (const [group, value] of Object.entries(values)) {
    if (!value || value === "all") continue;
    if (group === "origin") {
      if (facts.origin !== value) return false;
      continue;
    }
    const flag = facts[group as keyof Omit<FilterFacts, "origin">];
    if (flag === undefined) continue;
    if (!matchFlag(value, flag)) return false;
  }
  return true;
}

/** Origin of a roster row (AM `the`). */
export function rosterOrigin(item: RosterItem, sources: readonly RosterSource[]): FilterFacts["origin"] {
  if (item.origin === "ai-auto") return "ai-auto";
  if (item.kind === "custom") return "custom";
  if (item.kind === "lore" && item.worldBookId) {
    const source = sources.find((s) => s.worldBookId === item.worldBookId);
    if (source && !source.attached) return "module";
  }
  return "lorebook";
}

/** Rows registered in the roster (AM `ko`/`Sst`): the people the tabs work on. */
export function registeredRows(roster: readonly RosterItem[]): RosterItem[] {
  return roster.filter((item) => item.registered);
}

/** Roster-active rows (AM `selected` = registered and not workspace-disabled). */
export function isRosterActive(item: RosterItem): boolean {
  return item.registered && item.workspaceEnabled;
}

/* ------------------------------------------------------------------------------------------------
 * Analysis notices
 * ---------------------------------------------------------------------------------------------- */

/** Toast tone from a job status. */
export function jobTone(status: string): "running" | "success" | "warning" | "danger" {
  if (status === "queued" || status === "running") return "running";
  if (status === "success") return "success";
  if (status === "error") return "danger";
  return "warning";
}

/** Notice text: progress label (backend English) + `done/total` + retry suffix (AM `OXe`). */
export function progressMessage(progress: ProgressInfo, running: boolean, message?: string): string {
  let text = (!running && message) || progress.label || "";
  if (running && progress.total && progress.total > 0 && !/\d+\/\d+/u.test(text)) text = `${text} · ${progress.done ?? 0}/${progress.total}`;
  if (running && progress.retry && progress.retry.attempt > 0) text = `${text} · ${progress.retry.attempt}/${progress.retry.total}`;
  return text;
}

export function progressFraction(progress: ProgressInfo, running: boolean): number {
  if (!running) return 1;
  if (typeof progress.fraction === "number") return progress.fraction;
  if (progress.total && progress.total > 0) return (progress.done ?? 0) / progress.total;
  return 0;
}

/** AM `z9`: `${mode} AI ${status} · c/t` (mode text with fallback arrow). */
export function evidenceStatusText(input: { requestedMode: string; effectiveMode?: string; status: string; completed: number; total: number }): string {
  const modes = ANALYSIS_LABELS.modes;
  const effective = input.effectiveMode ?? input.requestedMode;
  const modeText = effective !== input.requestedMode ? `${modes[input.requestedMode] ?? input.requestedMode}→${modes[effective] ?? effective}` : (modes[effective] ?? effective);
  return `${modeText} AI ${ANALYSIS_LABELS.status[input.status] ?? input.status} · ${input.completed}/${input.total}`;
}

/** AM `hvt` (133864): representative-pick result text and tone. */
export interface PickResult { addedImages: number; addedPeople: number; lorebookNames: string[]; withheld: number; unclassified: number }
export function pickResultText(result: PickResult): { text: string; tone: "success" | "warning" } {
  const names = result.lorebookNames.length ? result.lorebookNames.slice(0, 3).join(", ") + (result.lorebookNames.length > 3 ? "…" : "") : ASSETS_LABELS.pickResult.none;
  if (result.addedImages > 0) return { text: ASSETS_LABELS.pickResult.added(result.addedPeople, result.addedImages, names), tone: "success" };
  if (result.unclassified > 0) return { text: ASSETS_LABELS.pickResult.unclassified(result.unclassified), tone: "warning" };
  if (result.withheld > 0) return { text: ASSETS_LABELS.pickResult.withheld(result.withheld), tone: "warning" };
  return { text: names, tone: "warning" };
}

/* ------------------------------------------------------------------------------------------------
 * Asset picker
 * ---------------------------------------------------------------------------------------------- */

export type PickerKind = "asset-selection" | "persona-asset-selection" | "character-reference" | "outfit-reference" | "persona-reference" | "persona-outfit-reference" | "artist-reference";

/** Maps the shell's picker target to Asset Maid's context kind. */
export function pickerKind(target: PickerTarget): PickerKind {
  switch (target.kind) {
    case "selection": return "asset-selection";
    case "character-form": return "character-reference";
    case "character-outfit": return "outfit-reference";
    case "artist-extraction": return "artist-reference";
    case "persona": return target.outfitId ? "persona-outfit-reference" : target.formId ? "persona-reference" : "persona-asset-selection";
  }
}

/** Multi select (selections) vs single select (references). */
export function pickerMultiSelect(kind: PickerKind): boolean {
  return kind === "asset-selection" || kind === "persona-asset-selection";
}

/** Filter ids allowed per kind (AM `Cit` 97611). */
export function pickerFilters(kind: PickerKind): ("all" | "candidate" | "chat" | "outfit" | "original" | "generated")[] {
  return kind === "artist-reference" ? ["original", "generated"] : ["all", "candidate", "chat", "outfit"];
}

/** Frame title (AM `Lxt`). */
export function pickerTitle(kind: PickerKind, name: string): string {
  const t = PICKER_LABELS.title;
  switch (kind) {
    case "asset-selection": return t.selection(name);
    case "persona-asset-selection": return t.personaSelection(name);
    case "character-reference": return t.characterReference(name);
    case "outfit-reference": return t.outfitReference(name);
    case "persona-reference": return t.personaReference(name);
    case "persona-outfit-reference": return t.personaOutfitReference(name);
    case "artist-reference": return t.artist;
  }
}

/** Secondary pane title (spec §3.4 table). */
export function pickerPaneTitle(kind: PickerKind): string {
  const t = PICKER_LABELS.paneTitle;
  switch (kind) {
    case "character-reference": return t.characterReference;
    case "outfit-reference": return t.outfitReference;
    case "persona-reference": return t.personaReference;
    case "persona-outfit-reference": return t.personaOutfitReference;
    case "artist-reference": return t.artist;
    default: return t.selection;
  }
}

/* ------------------------------------------------------------------------------------------------
 * Personas
 * ---------------------------------------------------------------------------------------------- */

export function personaDisplayName(persona: Pick<PersonaSummary, "name">, index: number): string {
  return persona.name.trim() || `Persona ${index + 1}`;
}
