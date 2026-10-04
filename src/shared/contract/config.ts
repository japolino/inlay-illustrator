/**
 * Global settings of the port (Asset Maid 0.9.88 config `Y0` 20768 + normalizer `fEe` 21767) with the Lumiverse mapping:
 * - analyzer = a Lumiverse connection profile (+ model override, reasoning, timeout) instead of direct provider fields;
 * - image generation = a Lumiverse image-gen connection (+ model override, provider parameters); the prompt codec is
 *   derived from the connection provider (novelai -> "novelai-structured", everything else -> "anima-flat").
 * Also: per-character override resolution (`ki`/`xE`/`Gl` 24584-24900) and chat image generation settings (`aS`/`Km` 157809).
 * Pure functions only. Line numbers refer to AssetMaid.pretty.js. Dropped AM fields are listed in docs/CONTRACT.md.
 */
import imageSizePresetsJson from "./data/image-size-presets.json" with { type: "json" };
import novelaiModelsJson from "./data/novelai-models.json" with { type: "json" };
import v5DirectionsJson from "./data/v5-directions.json" with { type: "json" };
import {
  type AnimaArtistList,
  ANIMA_DEFAULT_NEGATIVE_PROMPT,
  ANIMA_DEFAULT_POSITIVE_PROMPT,
  type ArtistEntry,
  type CharacterDocument,
  type CharacterScopedPrompt,
  CHARX_SETTING_FIELDS,
  type CharxOverride,
  type CharxSettingField,
  createDefaultAnimaArtists,
  createDefaultPersonaSettings,
  DEFAULT_MALE_PERSONA_PROMPT,
  type FixedResolution,
  type NativeAssetVisibility,
  normalizeAnimaArtists,
  normalizePersonaSettings,
  type PersonaSettings,
} from "./character.js";
import { type CountPolicy, fixedCountPolicy, MAX_IMAGE_COUNT, normalizeCountPolicy, UNLIMITED_IMAGE_COUNT } from "./chat.js";
import {
  asArray,
  asRecord,
  clampInt,
  clampNumber,
  type ContractIssue,
  deepMergeOverDefaults,
  diffAgainstDefaults,
  hasOwn,
  isPlainObject,
  jsonClone,
  trimString,
} from "./common.js";

export const CONFIG_VERSION = 1;

/* ------------------------------------------------------------------------------------------------
 * Static tables
 * ---------------------------------------------------------------------------------------------- */

export interface ImageSizePreset { id: number; label: string; width: number; height: number }
/** `Ns.IMAGE_SIZE_PRESETS` (11759-11765). */
export const IMAGE_SIZE_PRESETS: readonly ImageSizePreset[] = imageSizePresetsJson as ImageSizePreset[];
export const DEFAULT_IMAGE_SIZE_PRESET_ID = 1;
/** Sizes offered to the V5 analyzer (`zH`/`QV`). */
export const V5_ANALYZER_SIZE_IDS: readonly number[] = [1, 2, 5];
export interface CustomImageSize { id: number; width: number; height: number }
export const CUSTOM_IMAGE_SIZE_MIN_ID = 1e9;
export const IMAGE_SIZE_MIN = 64;
export const IMAGE_SIZE_MAX = 2048;

/** NovelAI models offered in settings (`aL` 20541). */
export const NOVELAI_MODELS: readonly { value: string; label: string }[] = novelaiModelsJson.models;
export const DEFAULT_NOVELAI_MODEL = novelaiModelsJson.defaultModel;
export const NOVELAI_SAMPLERS = [
  { value: "k_euler_ancestral", label: "Euler Ancestral" },
  { value: "k_euler", label: "Euler" },
  { value: "k_dpmpp_2m", label: "DPM++ 2M" },
  { value: "k_dpmpp_sde", label: "DPM++ SDE" },
] as const;
export const NOVELAI_NOISE_SCHEDULES = ["karras", "native", "exponential", "polyexponential"] as const;
export const CHARACTER_REFERENCE_TYPES = ["character", "style", "character&style"] as const;
export type CharacterReferenceType = (typeof CHARACTER_REFERENCE_TYPES)[number];
/** AM `Uj`: NovelAI V5 model test (V5 has no director reference). */
export function isNovelAIV5Model(model: unknown): boolean {
  return /^nai-diffusion-5(?:-|$)/u.test(trimString(model));
}

export const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** NovelAI scene analyzer profiles (`$je`): "v4-5" (Asset Maid V4.5) / "v5-hybrid" (Asset Maid V5). */
export const ANALYSIS_PROFILES = ["v4-5", "v5-hybrid"] as const;
export type AnalysisProfile = (typeof ANALYSIS_PROFILES)[number];
export const DEFAULT_ANALYSIS_PROFILE: AnalysisProfile = "v5-hybrid";
/** AM `Hje`: "v5-hybrid-preview" -> "v5-hybrid"; unknown -> "v5-hybrid". */
export function normalizeAnalysisProfile(value: unknown): AnalysisProfile {
  return value === "v5-hybrid-preview" ? "v5-hybrid" : (ANALYSIS_PROFILES as readonly unknown[]).includes(value) ? (value as AnalysisProfile) : DEFAULT_ANALYSIS_PROFILE;
}

/* ------------------------------------------------------------------------------------------------
 * Image providers (AM `W0` 20554) mapped onto Lumiverse image-gen connections
 * ---------------------------------------------------------------------------------------------- */

/**
 * AM provider ids kept: "novelai" and "comfy-ui". "generic" is a port addition for every other Lumiverse
 * image provider (sdapi, swarmui, openai, google-gemini ...). "chan-server" is dropped.
 */
export type GenerationProvider = "novelai" | "comfy-ui" | "generic";
export type PromptCodecId = "novelai-structured" | "anima-flat";
export interface ProviderCapabilities {
  label: string;
  /** "full" = character/outfit references supported; "none" = no reference UI. */
  referenceUiMode: "full" | "none";
  outfitImageGeneration: "enabled" | "disabled";
  promptCodecId: PromptCodecId;
}
export const PROVIDER_CAPABILITIES: Readonly<Record<GenerationProvider, ProviderCapabilities>> = Object.freeze({
  novelai: { label: "NovelAI", referenceUiMode: "full", outfitImageGeneration: "enabled", promptCodecId: "novelai-structured" },
  "comfy-ui": { label: "ComfyUI", referenceUiMode: "full", outfitImageGeneration: "enabled", promptCodecId: "anima-flat" },
  generic: { label: "Other", referenceUiMode: "none", outfitImageGeneration: "enabled", promptCodecId: "anima-flat" },
});
/** Lumiverse image-gen provider id -> AM generation provider. */
export function generationProviderFromLumiverse(providerId: unknown): GenerationProvider {
  const id = trimString(providerId).toLowerCase();
  if (id === "novelai") return "novelai";
  if (id === "comfyui" || id === "comfy-ui") return "comfy-ui";
  return "generic";
}
export function promptCodecForProvider(provider: GenerationProvider): PromptCodecId {
  return PROVIDER_CAPABILITIES[provider].promptCodecId;
}
/** AM `Nc`: providers that use the Anima artist list and the anima-flat codec. */
export function usesAnimaArtists(provider: GenerationProvider): boolean {
  return promptCodecForProvider(provider) === "anima-flat";
}
/** AM `Tu` 20647: is the reference image path enabled for this provider. */
export function isReferenceEnabledForProvider(provider: GenerationProvider, novelaiCharacterReferenceEnabled: boolean, comfyuiCharacterReferenceEnabled: boolean): boolean {
  if (provider === "novelai") return novelaiCharacterReferenceEnabled !== false;
  if (provider === "comfy-ui") return comfyuiCharacterReferenceEnabled !== false;
  return false;
}

/* ------------------------------------------------------------------------------------------------
 * V5 user directions (`novelai.v5UserDirections`, normalizer `zPe` + `eX`/`EPe`/`Td`)
 * ---------------------------------------------------------------------------------------------- */

export interface V5DirectionControl {
  id: string;
  label: string;
  ref: string;
  defaultEnabled: boolean;
  variables: Record<string, string>;
  instructionSuffix?: string;
  defaultValue?: number;
  valueOptions?: { value: number; variables: Record<string, string>; instructionSuffix?: string }[];
}
export type V5ControlOverrides = Record<string, boolean | number>;
export interface V5CustomInstruction { enabled: boolean; text: string }
export interface V5DirectionPreset {
  id: string;
  name: string;
  instruction: string;
  /** Scene presets only: "pov" | "ensemble" | "comic". */
  scenePresetId?: "pov" | "ensemble" | "comic";
  controlOverrides?: V5ControlOverrides;
  customInstruction?: V5CustomInstruction;
  /** Image-ratio presets only: allowed size ids 1..5. */
  allowedSizeIds?: number[];
}
export interface V5DirectionSetting {
  mode: "preset";
  selectedPresetId?: string;
  presets: V5DirectionPreset[];
  presetId?: string;
  controlOverrides?: V5ControlOverrides;
  customText: string;
}
export interface V5UserDirections { scene: V5DirectionSetting; imageRatio: V5DirectionSetting }

const v5Directions = v5DirectionsJson as unknown as {
  scenePresets: V5DirectionPreset[];
  imageRatioPresets: V5DirectionPreset[];
  controls: Record<string, V5DirectionControl[]>;
  defaultUserDirections: V5UserDirections;
  legacyArtistCgPresetId: string;
  legacyArtistCgSelectedId: string;
  maxPresets: number;
};
/** Built-in scene / image-ratio presets (`kj`) and scene controls (`ek`). Names are Korean in the original data. */
export const V5_SCENE_PRESETS: readonly V5DirectionPreset[] = v5Directions.scenePresets;
export const V5_IMAGE_RATIO_PRESETS: readonly V5DirectionPreset[] = v5Directions.imageRatioPresets;
export const V5_SCENE_CONTROLS: Readonly<Record<string, readonly V5DirectionControl[]>> = v5Directions.controls;
const controlsByRef = new Map(Object.values(V5_SCENE_CONTROLS).flatMap((list) => list.map((c) => [c.ref, c] as const)));

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\r\n?/gu, "\n").trim() : "";
}
function scenePresetIdOf(value: unknown): "pov" | "ensemble" | "comic" | undefined {
  return value === "pov" || value === "ensemble" || value === "comic" ? value : undefined;
}
function controlValue(control: V5DirectionControl, value: unknown): boolean | number | undefined {
  if (control.valueOptions?.length) {
    const def = control.defaultValue;
    const matched = control.valueOptions.find((o) => o.value === value)?.value ?? (value === true ? def : undefined);
    return matched !== undefined ? (control.defaultEnabled && matched === def ? undefined : matched) : value === false && control.defaultEnabled ? false : undefined;
  }
  return typeof value === "boolean" && value !== control.defaultEnabled ? value : undefined;
}
function normalizeControlOverrides(value: unknown): V5ControlOverrides | undefined {
  const out: V5ControlOverrides = {};
  for (const [ref, v] of Object.entries(asRecord(value))) {
    const control = controlsByRef.get(ref);
    if (!control) continue;
    const n = controlValue(control, v);
    if (n !== undefined) out[ref] = n;
  }
  return Object.keys(out).length ? out : undefined;
}
function controlOverridesFor(scenePresetId: string | undefined, overrides: V5ControlOverrides | undefined): V5ControlOverrides | undefined {
  if (!scenePresetId) return undefined;
  const out: V5ControlOverrides = {};
  for (const control of V5_SCENE_CONTROLS[scenePresetId] ?? []) {
    const n = controlValue(control, overrides?.[control.ref]);
    if (n !== undefined) out[control.ref] = n;
  }
  return Object.keys(out).length ? out : undefined;
}
function normalizeCustomInstruction(value: unknown): V5CustomInstruction {
  const r = asRecord(value);
  return { enabled: r.enabled === true && r.source !== "author-note", text: cleanText(r.text) };
}
function normalizeDirectionPreset(value: unknown, kind: "scene" | "imageRatio"): V5DirectionPreset | null {
  const r = asRecord(value);
  const id = typeof r.id === "string" ? r.id.trim().slice(0, 120) : "";
  const name = typeof r.name === "string" ? r.name.trim().slice(0, 80) : "";
  const migrated = kind === "scene" ? "scene-migrated-custom" : "image-ratio-migrated-custom";
  const artistCg = kind === "scene" && (id === v5Directions.legacyArtistCgSelectedId || r.scenePresetId === v5Directions.legacyArtistCgPresetId);
  if (!id || !name || id === migrated || artistCg) return null;
  const scene = kind === "scene" ? scenePresetIdOf(r.scenePresetId) : undefined;
  const overrides = scene ? controlOverridesFor(scene, normalizeControlOverrides(r.controlOverrides)) : undefined;
  const sizes = kind === "imageRatio" ? [...new Set(asArray(r.allowedSizeIds).filter((n): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5))] : [];
  return {
    id,
    name,
    instruction: cleanText(r.instruction),
    ...(kind === "scene" && r.customInstruction !== undefined ? { customInstruction: normalizeCustomInstruction(r.customInstruction) } : {}),
    ...(scene ? { scenePresetId: scene } : {}),
    ...(overrides ? { controlOverrides: overrides } : {}),
    ...(kind === "imageRatio" ? { allowedSizeIds: sizes.length ? sizes : [...V5_ANALYZER_SIZE_IDS] } : {}),
  };
}
function selectDirectionPreset(setting: { presets?: V5DirectionPreset[] }, presetId: string | undefined): V5DirectionSetting {
  const presets = setting.presets ?? [];
  const selected = presets.find((p) => p.id === presetId) ?? presets[0];
  return {
    mode: "preset",
    ...(selected ? { selectedPresetId: selected.id } : {}),
    presets,
    ...(selected?.scenePresetId ? { presetId: selected.scenePresetId } : {}),
    ...(selected?.controlOverrides ? { controlOverrides: selected.controlOverrides } : {}),
    customText: selected?.instruction ?? "",
  };
}
function isLegacyArtistCg(r: Record<string, unknown>): boolean {
  if (r.presetId === v5Directions.legacyArtistCgPresetId) return true;
  const selected = typeof r.selectedPresetId === "string" ? r.selectedPresetId.trim() : "";
  if (selected === v5Directions.legacyArtistCgSelectedId) return true;
  return asArray(r.presets).some((p) => {
    const o = asRecord(p);
    return o.id === selected && o.scenePresetId === v5Directions.legacyArtistCgPresetId;
  });
}
function normalizeDirectionSetting(value: unknown, kind: "scene" | "imageRatio"): V5DirectionSetting {
  const r = asRecord(value);
  const builtIns = (kind === "scene" ? V5_SCENE_PRESETS : V5_IMAGE_RATIO_PRESETS).map((p) => jsonClone(p));
  const legacyArtistCg = kind === "scene" && isLegacyArtistCg(r);
  const ids = new Set<string>();
  let presets = asArray(r.presets)
    .slice(0, v5Directions.maxPresets)
    .flatMap((p) => {
      const n = normalizeDirectionPreset(p, kind);
      if (!n || ids.has(n.id)) return [];
      ids.add(n.id);
      return [n];
    });
  const rawOverrides = { ...asRecord(r.controlOverrides) };
  if (!("comic.speech-bubble" in rawOverrides) && r.comicSpeechBubbleEnabled === false) rawOverrides["comic.speech-bubble"] = false;
  const sceneId = kind === "scene" ? scenePresetIdOf(r.presetId) : undefined;
  const overrides = sceneId ? normalizeControlOverrides(rawOverrides) : undefined;
  if (presets.length) {
    presets = [...presets, ...builtIns.filter((b) => !presets.some((p) => p.id === b.id))];
    const target = sceneId ? (presets.find((p) => p.id === r.selectedPresetId && p.scenePresetId === sceneId) ?? presets.find((p) => p.scenePresetId === sceneId)) : undefined;
    if (sceneId && overrides) presets = presets.map((p) => (p.id === target?.id ? { ...p, controlOverrides: overrides } : p));
    const selected = legacyArtistCg
      ? "scene-default"
      : sceneId
        ? target?.id
        : typeof r.selectedPresetId === "string" && presets.some((p) => p.id === r.selectedPresetId)
          ? r.selectedPresetId
          : presets[0]!.id;
    return selectDirectionPreset({ presets }, selected);
  }
  const list = builtIns.map((p) => (p.scenePresetId === sceneId && overrides ? { ...p, controlOverrides: overrides } : p));
  const selected = kind === "scene" && sceneId ? `scene-${sceneId}` : list[0]?.id;
  return selectDirectionPreset({ presets: list }, selected);
}
/** AM `zPe`. */
export function normalizeV5UserDirections(value: unknown): V5UserDirections {
  const r = asRecord(value);
  let scene = normalizeDirectionSetting(r.scene, "scene");
  const selected = scene.presets.find((p) => p.id === scene.selectedPresetId) ?? scene.presets[0];
  if (r.customInstruction !== undefined && selected && selected.customInstruction === undefined) {
    scene = selectDirectionPreset({ presets: scene.presets.map((p) => (p.id === selected.id ? { ...p, customInstruction: normalizeCustomInstruction(r.customInstruction) } : p)) }, selected.id);
  }
  return { scene, imageRatio: normalizeDirectionSetting(r.imageRatio, "imageRatio") };
}
/** AM `RPe`. */
export function createDefaultV5UserDirections(): V5UserDirections {
  return jsonClone(v5Directions.defaultUserDirections);
}

/* ------------------------------------------------------------------------------------------------
 * Config shape
 * ---------------------------------------------------------------------------------------------- */

export type UiLanguage = "en" | "ko";
export interface UiSettings {
  /** Port default "en" (AM "ko"). */
  language: UiLanguage;
  developerModeEnabled: boolean;
  popupClickThroughProtectionEnabled: boolean;
  floatingGenerationCountEnabled: boolean;
  floatingGenerationCountPosition: { x: number; y: number } | null;
}

/** Lumiverse reasoning setting (`GenerationRequestDTO.reasoning.source`). AM `thinkingMode` default/off/on. */
export type ReasoningMode = "inherit" | "off" | "custom";
export interface AnalyzerSettings {
  /** Lumiverse connection profile id; "" = the user's default connection. */
  connectionId: string;
  /** Model override; "" = the connection's model. */
  model: string;
  /** 0..2, default 0.2. */
  temperature: number;
  /** Our own timeout per call, 1000..300000 ms, default 180000. */
  timeoutMs: number;
  reasoning: { mode: ReasoningMode; effort: ThinkingLevel };
  /** Inject provider JSON mode (`response_format` etc.) when the provider supports it. Default true. */
  jsonMode: boolean;
  /** Vision support: "auto" = probe + cache per connection/model (AM `Rde`), or forced. */
  vision: "auto" | "supported" | "unsupported";
  /** Max output tokens; 0 = host/provider default. */
  maxTokens: number;
}

export interface JevConnectionSettings {
  /** Default of the per-charx "roster preselection" toggle. */
  rosterSelectionDefault: boolean;
  model: string;
}

/** NovelAI parameters (AM `config.novelai`, minus apiKey/endpoint/naiModel). */
export interface NovelAISettings {
  analysisProfile: AnalysisProfile;
  v5UserDirections: V5UserDirections;
  width: number;
  height: number;
  sampler: string;
  noiseSchedule: string;
  steps: number;
  scale: number;
  cfgRescale: number;
  qualityToggle: boolean;
  useCoords: boolean;
  useOrder: boolean;
  characterReferenceEnabled: boolean;
  characterReferenceType: CharacterReferenceType;
  characterReferenceStrength: number;
  characterReferenceFidelity: number;
  characterPrompts: unknown[];
  /** Global negative prompt (AM "settings" domain). */
  negativePrompt: string;
}

/** Lumiverse image-gen connection. */
export interface ImageGenerationSettings {
  /** Lumiverse image-gen connection id; "" = host default connection. */
  connectionId: string;
  /** Provider id of that connection as last seen (e.g. "novelai", "comfyui"); drives codec + provider kind. */
  provider: string;
  /** Model override; "" = connection model. For NovelAI this is the `naiModel`. */
  model: string;
  /** ComfyUI: saved workflow id passed as `parameters.workflow_id`; "" = host active workflow. */
  comfyuiWorkflowId: string;
  /** Extra provider parameters merged into every request (passthrough). */
  parameters: Record<string, unknown>;
}

export interface CharxGenerationDefaults {
  nativeAssetVisibility: NativeAssetVisibility;
  freeOutfitGeneration: boolean;
  freeCharacterGeneration: boolean;
  /** Absent = `jevConnection.rosterSelectionDefault`. */
  rosterSelectionEnabled?: boolean;
  stateAccumulationEnabled: boolean;
  nsfwAlwaysEnabled: boolean;
  forceAiChoiceCoordinates: boolean;
  autoRemoveConflictingRegex: boolean;
  fixedResolution: FixedResolution;
  fixedPositivePrompt: string;
  negativePrompt: string;
  animaPositivePrompt: string;
  animaNegativePrompt: string;
  /** Incremented on every all-charx edit of a field. */
  revisionByField?: Partial<Record<CharxSettingField, number>>;
  /** characterId -> fields whose per-charx value differs from all-charx. */
  dirtyFieldsBySourceId?: Record<string, CharxSettingField[]>;
}

/** Global (all characters) part of AM `characterPrompt` ("settings" domain + global artist list). */
export interface GlobalCharacterPromptSettings {
  overwriteExistingPrompts: boolean;
  characterReferenceBulkEnabled: boolean;
  personaGender: "male" | "female";
  malePersonaPrompt: string;
  malePersonaNegativePrompt: string;
  personaSettings: PersonaSettings;
  fixedPositivePrompt: string;
  charxGenerationDefaults: CharxGenerationDefaults;
  /** AM `assetRegexEntries` (settings domain; shape owned by the charx-regex feature). */
  assetRegexEntries?: unknown[];
  /** Global NovelAI artist list (AM `asset_maid:v1:config:artists-global`). */
  artistPrompts: ArtistEntry[];
}

export interface RuntimeSettings {
  customImageSizes: CustomImageSize[];
  /** 0..10, default 5. Shared by analyzer, image and AI-edit retries. */
  generationAutoRetryCount: number;
  nsfwAlwaysEnabled: boolean;
  /** Derived from `image.provider` on normalize. */
  generationProvider: GenerationProvider;
  novelaiCallMode: "sequential";
  /** Wait between image requests, 0..30 s. */
  novelaiParallelIntervalSec: number;
  /** Chat image width, 30..100 %. */
  chatImageWidthPercent: number;
  /** Our own completion timeout for image requests, 1000..3600000 ms. */
  comfyuiCompletionTimeoutMs: number;
  comfyuiCharacterReferenceEnabled: boolean;
  comfyuiOutfitReferenceEnabled: boolean;
}

export interface PresetCatalogSettings { rawJson: string; lastError: string }

/** Persisted global settings (userStorage `config/model.json` + `config/settings.json` + artists files). */
export interface InlayConfig {
  version: typeof CONFIG_VERSION;
  enabled: boolean;
  ui: UiSettings;
  analysis: AnalyzerSettings;
  jevConnection: JevConnectionSettings;
  novelai: NovelAISettings;
  image: ImageGenerationSettings;
  /** Entries + default selection (per-character selection lives in the character document). */
  animaArtists: AnimaArtistList;
  presetCatalog: PresetCatalogSettings;
  characterPrompt: GlobalCharacterPromptSettings;
  runtime: RuntimeSettings;
}

/**
 * Asset Maid's merged runtime config (`Y0` shape) for the engine: global settings + the active character's
 * document. `novelai.naiModel` is the resolved image model (connection model when no override).
 */
export interface RuntimeConfig extends Omit<InlayConfig, "characterPrompt" | "novelai"> {
  novelai: NovelAISettings & { naiModel: string };
  characterPrompt: GlobalCharacterPromptSettings & CharacterScopedPrompt;
}

/* ------------------------------------------------------------------------------------------------
 * Defaults
 * ---------------------------------------------------------------------------------------------- */

export const DEFAULT_ANALYZER_TIMEOUT_MS = 180000;
export const ANALYZER_TIMEOUT_MIN_MS = 1000;
export const ANALYZER_TIMEOUT_MAX_MS = 300000;
export const DEFAULT_JEV_MODEL = "jev-latest";

export function createDefaultCharxGenerationDefaults(): CharxGenerationDefaults {
  return {
    nativeAssetVisibility: "hidden",
    freeOutfitGeneration: true,
    freeCharacterGeneration: true,
    stateAccumulationEnabled: false,
    nsfwAlwaysEnabled: false,
    forceAiChoiceCoordinates: true,
    autoRemoveConflictingRegex: false,
    fixedResolution: { enabled: false, sizeId: DEFAULT_IMAGE_SIZE_PRESET_ID },
    fixedPositivePrompt: "",
    negativePrompt: "",
    animaPositivePrompt: ANIMA_DEFAULT_POSITIVE_PROMPT,
    animaNegativePrompt: ANIMA_DEFAULT_NEGATIVE_PROMPT,
  };
}

/** `Y0()` with the Lumiverse mapping applied. */
export function createDefaultConfig(): InlayConfig {
  return {
    version: CONFIG_VERSION,
    enabled: true,
    ui: { language: "en", developerModeEnabled: false, popupClickThroughProtectionEnabled: true, floatingGenerationCountEnabled: false, floatingGenerationCountPosition: null },
    analysis: { connectionId: "", model: "", temperature: 0.2, timeoutMs: DEFAULT_ANALYZER_TIMEOUT_MS, reasoning: { mode: "off", effort: "medium" }, jsonMode: true, vision: "auto", maxTokens: 0 },
    jevConnection: { rosterSelectionDefault: false, model: DEFAULT_JEV_MODEL },
    novelai: {
      analysisProfile: DEFAULT_ANALYSIS_PROFILE,
      v5UserDirections: createDefaultV5UserDirections(),
      width: 832,
      height: 1216,
      sampler: "k_euler_ancestral",
      noiseSchedule: "karras",
      steps: 28,
      scale: 6,
      cfgRescale: 0.5,
      qualityToggle: true,
      useCoords: false,
      useOrder: true,
      characterReferenceEnabled: false,
      characterReferenceType: "character",
      characterReferenceStrength: 0.6,
      characterReferenceFidelity: 1,
      characterPrompts: [],
      negativePrompt: "",
    },
    image: { connectionId: "", provider: "", model: "", comfyuiWorkflowId: "", parameters: {} },
    animaArtists: createDefaultAnimaArtists(),
    presetCatalog: { rawJson: "", lastError: "" },
    characterPrompt: {
      overwriteExistingPrompts: false,
      characterReferenceBulkEnabled: false,
      personaGender: "male",
      malePersonaPrompt: DEFAULT_MALE_PERSONA_PROMPT,
      malePersonaNegativePrompt: "",
      personaSettings: createDefaultPersonaSettings(),
      fixedPositivePrompt: "",
      charxGenerationDefaults: createDefaultCharxGenerationDefaults(),
      artistPrompts: [],
    },
    runtime: {
      customImageSizes: [],
      generationAutoRetryCount: 5,
      nsfwAlwaysEnabled: false,
      generationProvider: "generic",
      novelaiCallMode: "sequential",
      novelaiParallelIntervalSec: 0,
      chatImageWidthPercent: 70,
      comfyuiCompletionTimeoutMs: 600000,
      comfyuiCharacterReferenceEnabled: true,
      comfyuiOutfitReferenceEnabled: false,
    },
  };
}

/** Frozen default config (use `createDefaultConfig()` for a mutable copy). */
export const DEFAULT_CONFIG: Readonly<InlayConfig> = Object.freeze(createDefaultConfig());

/* ------------------------------------------------------------------------------------------------
 * Normalizer (port of `fEe` semantics)
 * ---------------------------------------------------------------------------------------------- */

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback;
}
function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** AM `oEe` 21365: valid custom sizes (id >= 1e9 safe int, unique, 64..2048 ints, not a preset/duplicate size). */
export function normalizeCustomImageSizes(value: unknown): CustomImageSize[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<number>();
  const sizes = new Set(IMAGE_SIZE_PRESETS.map((p) => `${p.width}x${p.height}`));
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { id, width, height } = item as Record<string, unknown>;
    const key = `${width}x${height}`;
    if (!isCustomImageSizeId(id) || ids.has(id) || validateImageSize(width, height) || sizes.has(key)) return [];
    ids.add(id);
    sizes.add(key);
    return [{ id, width: width as number, height: height as number }];
  });
}
export function isCustomImageSizeId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= CUSTOM_IMAGE_SIZE_MIN_ID;
}
/** AM `UW`: "" when valid, else the error text (English; Korean original "가로와 세로에 64~2048 사이의 정수를 입력하세요."). */
export function validateImageSize(width: unknown, height: unknown): string {
  return [width, height].every((v) => Number.isInteger(v) && (v as number) >= IMAGE_SIZE_MIN && (v as number) <= IMAGE_SIZE_MAX) ? "" : "Enter integers between 64 and 2048 for width and height.";
}
/** AM `cE`: find a preset or custom size by id. */
export function findImageSize(id: unknown, customSizes: readonly CustomImageSize[] = []): ImageSizePreset | CustomImageSize | undefined {
  const n = Number(id);
  return IMAGE_SIZE_PRESETS.find((p) => p.id === n) ?? customSizes.find((s) => s.id === n);
}
/** AM `ML` 24623 (+ `PNe`): fixed resolution with a valid size id. */
export function normalizeFixedResolution(value: unknown, customSizes?: readonly CustomImageSize[]): FixedResolution {
  const r = asRecord(value);
  const n = Number(r.sizeId);
  const sizeId = Number.isSafeInteger(n) && (IMAGE_SIZE_PRESETS.some((p) => p.id === n) || isCustomImageSizeId(n)) ? n : DEFAULT_IMAGE_SIZE_PRESET_ID;
  return { enabled: r.enabled === true, sizeId: !customSizes || findImageSize(sizeId, customSizes) ? sizeId : DEFAULT_IMAGE_SIZE_PRESET_ID };
}

/** Map AM's analyzer config (`thinkingMode`/`thinkingEnabled`/`thinkingLevel`) onto the Lumiverse reasoning setting. */
export function reasoningFromLegacy(raw: Record<string, unknown>): { mode: ReasoningMode; effort: ThinkingLevel } {
  const level = trimString(raw.thinkingLevel).toLowerCase();
  const effort = oneOf(level, THINKING_LEVELS, "medium");
  const mode = raw.thinkingMode === "default" ? "inherit" : raw.thinkingMode === "on" ? "custom" : raw.thinkingMode === "off" ? "off" : raw.thinkingEnabled === true ? "custom" : "off";
  return { mode, effort };
}

/** Normalize analyzer settings; accepts AM-shaped legacy input (provider fields are dropped). */
export function normalizeAnalyzerSettings(value: unknown, fallback: AnalyzerSettings = DEFAULT_CONFIG.analysis): AnalyzerSettings {
  let r = asRecord(value);
  // AM `XW`: fold the active provider's remembered settings in before reading legacy fields.
  const provider = trimString(r.provider);
  const map = asRecord(r.providerConfigMap);
  if (provider && isPlainObject(map[provider])) {
    const remembered = map[provider] as Record<string, unknown>;
    r = { ...r };
    for (const k of ["model", "temperature", "timeoutMs", "thinkingEnabled", "thinkingMode", "thinkingLevel"]) if (!hasOwn(r, k) && hasOwn(remembered, k)) r[k] = jsonClone(remembered[k]);
  }
  const reasoning = isPlainObject(r.reasoning)
    ? { mode: oneOf((r.reasoning as Record<string, unknown>).mode, ["inherit", "off", "custom"] as const, fallback.reasoning.mode), effort: oneOf(trimString((r.reasoning as Record<string, unknown>).effort).toLowerCase(), THINKING_LEVELS, fallback.reasoning.effort) }
    : hasOwn(r, "thinkingMode") || hasOwn(r, "thinkingEnabled") || hasOwn(r, "thinkingLevel")
      ? reasoningFromLegacy(r)
      : { ...fallback.reasoning };
  return {
    connectionId: trimString(r.connectionId),
    model: trimString(r.model),
    temperature: clampNumber(r.temperature, 0.2, 0, 2),
    timeoutMs: Math.round(clampNumber(r.timeoutMs, DEFAULT_ANALYZER_TIMEOUT_MS, ANALYZER_TIMEOUT_MIN_MS, ANALYZER_TIMEOUT_MAX_MS)),
    reasoning,
    jsonMode: r.jsonMode !== false,
    vision: oneOf(r.vision, ["auto", "supported", "unsupported"] as const, "auto"),
    maxTokens: clampInt(r.maxTokens, 0, 0, 1_000_000),
  };
}

const REMOVED_CHARX_DEFAULT_FIELDS = ["imageAutoGenerationEnabled", "imageGenerationCountPolicy"];

/** Keep only known charx default fields; strip removed fields from revisions and dirty lists (AM `uEe`). */
export function normalizeCharxGenerationDefaults(value: unknown): CharxGenerationDefaults {
  const merged = deepMergeOverDefaults(createDefaultCharxGenerationDefaults() as unknown as Record<string, unknown>, value) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const f of CHARX_SETTING_FIELDS) if (hasOwn(merged, f)) out[f] = merged[f];
  const known = new Set<string>(CHARX_SETTING_FIELDS);
  if (isPlainObject(merged.revisionByField)) {
    const rev = Object.fromEntries(Object.entries(merged.revisionByField).filter(([k]) => !REMOVED_CHARX_DEFAULT_FIELDS.includes(k)));
    if (Object.keys(rev).length) out.revisionByField = rev;
  }
  if (isPlainObject(merged.dirtyFieldsBySourceId)) {
    const dirty: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(merged.dirtyFieldsBySourceId)) {
      if (!Array.isArray(v)) continue;
      const kept = v.filter((s) => !REMOVED_CHARX_DEFAULT_FIELDS.includes(String(s)) && known.has(String(s))).map(String);
      if (kept.length) dirty[k] = kept;
    }
    if (Object.keys(dirty).length) out.dirtyFieldsBySourceId = dirty;
  }
  return out as unknown as CharxGenerationDefaults;
}

/** Strip removed fields from one per-charx override (AM `uEe` part 2). */
export function normalizeCharxOverride(value: unknown): CharxOverride {
  const o = jsonClone(asRecord(value)) as Record<string, unknown>;
  for (const f of REMOVED_CHARX_DEFAULT_FIELDS) delete o[f];
  if (isPlainObject(o.revisionByField)) {
    for (const f of REMOVED_CHARX_DEFAULT_FIELDS) delete (o.revisionByField as Record<string, unknown>)[f];
    if (!Object.keys(o.revisionByField).length) delete o.revisionByField;
  }
  return o as CharxOverride;
}

export interface ConfigNormalizeResult { config: InlayConfig; issues: ContractIssue[] }

/**
 * Normalize stored/legacy settings into a full {@link InlayConfig} (port of `fEe`):
 * deep-merge over defaults, clamp numbers, coerce enums, apply legacy fallbacks
 * (`v5-hybrid-preview`, `jevConnection.selectionEnabled`, AM `naiModel`/analyzer provider fields, removed charx fields).
 * Accepts both the port shape and an Asset Maid `Y0`-shaped object.
 */
export function normalizeConfig(raw: unknown): InlayConfig {
  return normalizeConfigWithIssues(raw).config;
}

export function normalizeConfigWithIssues(raw: unknown): ConfigNormalizeResult {
  const issues: ContractIssue[] = [];
  const input = isPlainObject(raw) ? (jsonClone(raw) as Record<string, unknown>) : {};
  if (raw !== undefined && raw !== null && !isPlainObject(raw)) issues.push({ path: "$", code: "not-an-object", message: "Config is not an object; defaults used." });
  const defaults = createDefaultConfig();
  const merged = deepMergeOverDefaults(defaults as unknown as Record<string, unknown>, input) as Record<string, unknown>;

  const ui = asRecord(merged.ui);
  const pos = asRecord(ui.floatingGenerationCountPosition);
  const hasPos = isPlainObject(ui.floatingGenerationCountPosition) && typeof pos.x === "number" && Number.isFinite(pos.x) && typeof pos.y === "number" && Number.isFinite(pos.y);

  const legacyNovelai = asRecord(input.novelai);
  const imageIn = asRecord(merged.image);
  const legacyModel = !hasOwn(asRecord(input.image), "model") ? trimString(legacyNovelai.naiModel) : "";
  const image: ImageGenerationSettings = {
    connectionId: trimString(imageIn.connectionId),
    provider: trimString(imageIn.provider).toLowerCase() || (trimString(asRecord(input.runtime).generationProvider) === "novelai" ? "novelai" : trimString(asRecord(input.runtime).generationProvider) === "comfy-ui" ? "comfyui" : ""),
    model: trimString(imageIn.model) || legacyModel,
    comfyuiWorkflowId: trimString(imageIn.comfyuiWorkflowId),
    parameters: isPlainObject(imageIn.parameters) ? (jsonClone(imageIn.parameters) as Record<string, unknown>) : {},
  };

  const n = asRecord(merged.novelai);
  const d = defaults.novelai;
  const novelai: NovelAISettings = {
    analysisProfile: normalizeAnalysisProfile(n.analysisProfile),
    v5UserDirections: normalizeV5UserDirections(n.v5UserDirections),
    width: clampInt(n.width, d.width, IMAGE_SIZE_MIN, IMAGE_SIZE_MAX),
    height: clampInt(n.height, d.height, IMAGE_SIZE_MIN, IMAGE_SIZE_MAX),
    sampler: NOVELAI_SAMPLERS.some((s) => s.value === n.sampler) ? (n.sampler as string) : d.sampler,
    noiseSchedule: oneOf(n.noiseSchedule, NOVELAI_NOISE_SCHEDULES, "karras"),
    steps: clampInt(n.steps, d.steps, 1, 50),
    scale: clampNumber(n.scale, d.scale, 0, 20),
    cfgRescale: clampNumber(n.cfgRescale, d.cfgRescale, 0, 1),
    qualityToggle: bool(n.qualityToggle, d.qualityToggle),
    useCoords: bool(n.useCoords, d.useCoords),
    useOrder: bool(n.useOrder, d.useOrder),
    characterReferenceEnabled: n.characterReferenceEnabled === true,
    characterReferenceType: oneOf(n.characterReferenceType, CHARACTER_REFERENCE_TYPES, "character"),
    characterReferenceStrength: clampNumber(n.characterReferenceStrength, 0.6, 0, 1),
    characterReferenceFidelity: clampNumber(n.characterReferenceFidelity, 1, 0, 1),
    characterPrompts: Array.isArray(n.characterPrompts) ? jsonClone(n.characterPrompts) : [],
    negativePrompt: typeof n.negativePrompt === "string" ? n.negativePrompt : "",
  };
  if (isNovelAIV5Model(image.model)) novelai.characterReferenceEnabled = false;

  const jevRaw = asRecord(hasOwn(input, "jevConnection") ? input.jevConnection : merged.jevConnection);
  const jevConnection: JevConnectionSettings = {
    rosterSelectionDefault: typeof jevRaw.rosterSelectionDefault === "boolean" ? jevRaw.rosterSelectionDefault : jevRaw.selectionEnabled === true,
    model: typeof jevRaw.model === "string" && jevRaw.model.trim() ? jevRaw.model.trim() : DEFAULT_JEV_MODEL,
  };

  const cp = asRecord(merged.characterPrompt);
  const characterPrompt: GlobalCharacterPromptSettings = {
    overwriteExistingPrompts: cp.overwriteExistingPrompts === true,
    characterReferenceBulkEnabled: cp.characterReferenceBulkEnabled === true,
    personaGender: cp.personaGender === "female" ? "female" : "male",
    malePersonaPrompt: typeof cp.malePersonaPrompt === "string" ? cp.malePersonaPrompt : DEFAULT_MALE_PERSONA_PROMPT,
    malePersonaNegativePrompt: typeof cp.malePersonaNegativePrompt === "string" ? cp.malePersonaNegativePrompt : "",
    personaSettings: normalizePersonaSettings(cp.personaSettings),
    fixedPositivePrompt: typeof cp.fixedPositivePrompt === "string" ? cp.fixedPositivePrompt : "",
    charxGenerationDefaults: normalizeCharxGenerationDefaults(asRecord(input.characterPrompt).charxGenerationDefaults),
    ...(Array.isArray(cp.assetRegexEntries) ? { assetRegexEntries: jsonClone(cp.assetRegexEntries) } : {}),
    artistPrompts: asArray(cp.artistPrompts).filter(isPlainObject).map((e) => jsonClone(e) as ArtistEntry),
  };

  const rt = asRecord(merged.runtime);
  const runtime: RuntimeSettings = {
    customImageSizes: normalizeCustomImageSizes(rt.customImageSizes),
    generationAutoRetryCount: Math.max(0, Math.min(10, Math.floor(Number(rt.generationAutoRetryCount ?? 5) || 0))),
    nsfwAlwaysEnabled: rt.nsfwAlwaysEnabled === true,
    generationProvider: generationProviderFromLumiverse(image.provider),
    novelaiCallMode: "sequential",
    novelaiParallelIntervalSec: clampInt(rt.novelaiParallelIntervalSec, 0, 0, 30),
    chatImageWidthPercent: clampInt(rt.chatImageWidthPercent, 70, 30, 100),
    comfyuiCompletionTimeoutMs: clampInt(rt.comfyuiCompletionTimeoutMs, 600000, 1000, 3600000),
    comfyuiCharacterReferenceEnabled: rt.comfyuiCharacterReferenceEnabled !== false,
    comfyuiOutfitReferenceEnabled: rt.comfyuiOutfitReferenceEnabled === true,
  };

  const pc = asRecord(merged.presetCatalog);
  const config: InlayConfig = {
    version: CONFIG_VERSION,
    enabled: input.enabled !== false,
    ui: {
      language: ui.language === "ko" ? "ko" : "en",
      developerModeEnabled: ui.developerModeEnabled === true,
      popupClickThroughProtectionEnabled: bool(ui.popupClickThroughProtectionEnabled, true),
      floatingGenerationCountEnabled: ui.floatingGenerationCountEnabled === true,
      floatingGenerationCountPosition: hasPos ? { x: Math.max(0, Math.min(1, pos.x as number)), y: Math.max(0, Math.min(1, pos.y as number)) } : null,
    },
    analysis: normalizeAnalyzerSettings(input.analysis),
    jevConnection,
    novelai,
    image,
    animaArtists: normalizeAnimaArtists(merged.animaArtists),
    presetCatalog: { rawJson: typeof pc.rawJson === "string" ? pc.rawJson : "", lastError: typeof pc.lastError === "string" ? pc.lastError : "" },
    characterPrompt,
    runtime,
  };
  if (hasOwn(input, "auxAnalysis")) issues.push({ path: "$.auxAnalysis", code: "dropped-field", message: "auxAnalysis is never used by Asset Maid; dropped." });
  return { config, issues };
}

/* ------------------------------------------------------------------------------------------------
 * Storage domains (AM `ll` 20934; port keeps the global domains in userStorage `config/*.json`)
 * ---------------------------------------------------------------------------------------------- */

/** AM persistence domains. Global ones are stored under `config/`, the rest in the character document. */
export const CONFIG_DOMAINS = ["model", "settings", "workspace", "prompts", "artists", "asset-selection", "anima-artists", "asset-analysis", "metadata-cache", "asset-matching", "charx-analysis"] as const;
export type ConfigDomain = (typeof CONFIG_DOMAINS)[number];
export const GLOBAL_CONFIG_DOMAINS = ["model", "settings", "artists", "anima-artists"] as const satisfies readonly ConfigDomain[];
export const CHARACTER_CONFIG_DOMAINS = ["workspace", "prompts", "artists", "asset-selection", "anima-artists", "asset-analysis", "asset-matching", "charx-analysis"] as const satisfies readonly ConfigDomain[];

/** Stored global config parts (each file holds a diff against defaults, like AM `yk`). */
export interface StoredGlobalConfig {
  /** `config/model.json`: analysis, jevConnection, novelai (minus negativePrompt/characterPrompts), image. */
  model: Record<string, unknown>;
  /** `config/settings.json`: enabled, ui, presetCatalog (minus lastError), runtime, novelai.negativePrompt, characterPrompt (global part minus artistPrompts). */
  settings: Record<string, unknown>;
  /** `config/artists-global.json`: `{characterPrompt:{artistPrompts}}`. */
  artistsGlobal: { characterPrompt: { artistPrompts: ArtistEntry[] } };
  /** `config/anima-artists.json`: entries + defaultId. */
  animaArtists: AnimaArtistList;
}

/** Split a normalized config into its stored parts (diffs against defaults where AM stores diffs). */
export function splitConfigForStorage(config: InlayConfig): StoredGlobalConfig {
  const defaults = createDefaultConfig();
  const { negativePrompt: _n, characterPrompts: _c, ...novelaiModel } = config.novelai;
  const { negativePrompt: _dn, characterPrompts: _dc, ...novelaiModelDefaults } = defaults.novelai;
  const model = asRecord(diffAgainstDefaults({ analysis: config.analysis, jevConnection: config.jevConnection, novelai: novelaiModel, image: config.image }, { analysis: defaults.analysis, jevConnection: defaults.jevConnection, novelai: novelaiModelDefaults, image: defaults.image }));
  const { artistPrompts, ...cpSettings } = config.characterPrompt;
  const { artistPrompts: _a, ...cpDefaults } = defaults.characterPrompt;
  const settings = asRecord(
    diffAgainstDefaults(
      { version: config.version, enabled: config.enabled, ui: config.ui, presetCatalog: { rawJson: config.presetCatalog.rawJson }, runtime: config.runtime, novelai: { negativePrompt: config.novelai.negativePrompt }, characterPrompt: cpSettings },
      { version: defaults.version, enabled: defaults.enabled, ui: defaults.ui, presetCatalog: { rawJson: defaults.presetCatalog.rawJson }, runtime: defaults.runtime, novelai: { negativePrompt: defaults.novelai.negativePrompt }, characterPrompt: cpDefaults },
    ),
  );
  // AM always writes popupClickThroughProtectionEnabled (device default may differ).
  settings.ui = { ...asRecord(settings.ui), popupClickThroughProtectionEnabled: config.ui.popupClickThroughProtectionEnabled };
  return {
    model,
    settings,
    artistsGlobal: { characterPrompt: { artistPrompts: jsonClone(artistPrompts) } },
    animaArtists: { version: 1, entries: jsonClone(config.animaArtists.entries), selection: { defaultId: config.animaArtists.selection.defaultId, bySourceId: {} } },
  };
}

/** Rebuild a config from stored parts (missing parts = defaults). */
export function mergeStoredConfig(parts: Partial<StoredGlobalConfig>): InlayConfig {
  const model = asRecord(parts.model);
  const settings = asRecord(parts.settings);
  const novelai = { ...asRecord(model.novelai), ...asRecord(settings.novelai) };
  const characterPrompt = { ...asRecord(settings.characterPrompt), ...(parts.artistsGlobal ? { artistPrompts: asArray(asRecord(asRecord(parts.artistsGlobal).characterPrompt).artistPrompts) } : {}) };
  return normalizeConfig({
    ...settings,
    ...model,
    novelai,
    characterPrompt,
    ...(parts.animaArtists ? { animaArtists: parts.animaArtists } : {}),
  });
}

/* ------------------------------------------------------------------------------------------------
 * Per-character override resolution (AM 24584-24900)
 * ---------------------------------------------------------------------------------------------- */

/** Minimal config slice the override logic needs (works on InlayConfig, RuntimeConfig or AM `Y0`). */
export interface CharxScopeConfig {
  jevConnection: { rosterSelectionDefault: boolean };
  runtime: { customImageSizes: readonly CustomImageSize[]; nsfwAlwaysEnabled?: boolean };
  novelai: { negativePrompt?: string };
  characterPrompt: {
    fixedPositivePrompt?: string;
    charxGenerationDefaults: CharxGenerationDefaults | Record<string, unknown>;
    charxSettings: { overrides: Record<string, CharxOverride | Record<string, unknown>> };
  };
}

/** Effective per-character generation settings (AM `ki` result shape). */
export interface EffectiveCharxSettings {
  nativeAssetVisibility: NativeAssetVisibility;
  freeCharacterGenerationEnabled: boolean;
  freeOutfitGenerationEnabled: boolean;
  rosterSelectionEnabled: boolean;
  stateAccumulationEnabled: boolean;
  nsfwAlwaysEnabled: boolean;
  forceAiChoiceCoordinates: boolean;
  autoRemoveConflictingRegex: boolean;
  fixedResolution: FixedResolution;
  fixedPositivePrompt: string;
  negativePrompt: string;
  animaPositivePrompt: string;
  animaNegativePrompt: string;
}
/** Patch accepted by the setters (AM `NY` input). */
export type CharxSettingsPatch = Partial<EffectiveCharxSettings>;

const REVISIONS = "revisionByField";
const DIRTY = "dirtyFieldsBySourceId";
const CHARX_FIELD_SET = new Set<string>(CHARX_SETTING_FIELDS);
function text(value: unknown): string {
  return value == null ? "" : String(value);
}
function defaultsOf(config: CharxScopeConfig): Record<string, unknown> {
  return asRecord(config.characterPrompt.charxGenerationDefaults);
}
function overrideOf(config: CharxScopeConfig, characterId: string): Record<string, unknown> {
  return asRecord(asRecord(config.characterPrompt.charxSettings.overrides)[trimString(characterId)]);
}
function revisionOf(obj: Record<string, unknown>, field: string): number {
  const n = Number(asRecord(obj[REVISIONS])[field]);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}
function dirtyMap(defaults: Record<string, unknown>): Record<string, CharxSettingField[]> {
  const out: Record<string, CharxSettingField[]> = {};
  for (const [k, v] of Object.entries(asRecord(defaults[DIRTY]))) {
    const key = trimString(k);
    if (!key || !Array.isArray(v)) continue;
    const set = new Set(v.map(trimString).filter((s) => CHARX_FIELD_SET.has(s)));
    const ordered = CHARX_SETTING_FIELDS.filter((f) => set.has(f));
    if (ordered.length) out[key] = [...ordered];
  }
  return out;
}
/** AM `Gl` 24682: does the override for `field` win over the all-charx value. */
function overrideWins(defaults: Record<string, unknown>, override: Record<string, unknown>, field: CharxSettingField, dirty: ReadonlySet<string>): boolean {
  if (!hasOwn(override, field)) return false;
  if (hasOwn(asRecord(override[REVISIONS]), field)) return revisionOf(override, field) >= revisionOf(defaults, field);
  return dirty.has(field) ? true : revisionOf(defaults, field) === 0;
}

/** AM `xE` 24772: effective all-charx settings. */
export function resolveAllCharxSettings(config: CharxScopeConfig): EffectiveCharxSettings {
  const t = defaultsOf(config);
  return {
    nativeAssetVisibility: hasOwn(t, "nativeAssetVisibility") && t.nativeAssetVisibility === "shown" ? "shown" : "hidden",
    freeCharacterGenerationEnabled: t.freeCharacterGeneration !== false,
    freeOutfitGenerationEnabled: typeof t.freeOutfitGeneration === "boolean" ? t.freeOutfitGeneration : true,
    rosterSelectionEnabled: typeof t.rosterSelectionEnabled === "boolean" ? t.rosterSelectionEnabled : config.jevConnection.rosterSelectionDefault === true,
    stateAccumulationEnabled: t.stateAccumulationEnabled === true,
    nsfwAlwaysEnabled: t.nsfwAlwaysEnabled === true,
    forceAiChoiceCoordinates: typeof t.forceAiChoiceCoordinates === "boolean" ? t.forceAiChoiceCoordinates : true,
    autoRemoveConflictingRegex: typeof t.autoRemoveConflictingRegex === "boolean" ? t.autoRemoveConflictingRegex : false,
    fixedResolution: normalizeFixedResolution(t.fixedResolution, config.runtime.customImageSizes),
    fixedPositivePrompt: hasOwn(t, "fixedPositivePrompt") ? text(t.fixedPositivePrompt) : "",
    negativePrompt: hasOwn(t, "negativePrompt") ? text(t.negativePrompt) : "",
    animaPositivePrompt: hasOwn(t, "animaPositivePrompt") ? text(t.animaPositivePrompt) : ANIMA_DEFAULT_POSITIVE_PROMPT,
    animaNegativePrompt: hasOwn(t, "animaNegativePrompt") ? text(t.animaNegativePrompt) : ANIMA_DEFAULT_NEGATIVE_PROMPT,
  };
}

/** AM `ki` 24725: effective settings of one character (override wins per field by revision rules). */
export function resolveEffectiveCharxSettings(config: CharxScopeConfig, characterId: string): EffectiveCharxSettings {
  const defaults = defaultsOf(config);
  const id = trimString(characterId);
  const o = overrideOf(config, id);
  const dirty = new Set<string>(dirtyMap(defaults)[id] ?? []);
  const all = resolveAllCharxSettings(config);
  const wins = (f: CharxSettingField) => overrideWins(defaults, o, f, dirty);
  const boolField = (f: CharxSettingField, fallback: boolean): boolean => (wins(f) && typeof o[f] === "boolean" ? (o[f] as boolean) : fallback);
  return {
    nativeAssetVisibility: wins("nativeAssetVisibility") ? (o.nativeAssetVisibility === "shown" ? "shown" : "hidden") : all.nativeAssetVisibility,
    freeCharacterGenerationEnabled: boolField("freeCharacterGeneration", all.freeCharacterGenerationEnabled),
    freeOutfitGenerationEnabled: boolField("freeOutfitGeneration", all.freeOutfitGenerationEnabled),
    rosterSelectionEnabled: boolField("rosterSelectionEnabled", all.rosterSelectionEnabled),
    stateAccumulationEnabled: boolField("stateAccumulationEnabled", all.stateAccumulationEnabled),
    nsfwAlwaysEnabled: boolField("nsfwAlwaysEnabled", all.nsfwAlwaysEnabled),
    forceAiChoiceCoordinates: boolField("forceAiChoiceCoordinates", all.forceAiChoiceCoordinates),
    autoRemoveConflictingRegex: boolField("autoRemoveConflictingRegex", all.autoRemoveConflictingRegex),
    fixedResolution: wins("fixedResolution") ? normalizeFixedResolution(o.fixedResolution, config.runtime.customImageSizes) : all.fixedResolution,
    fixedPositivePrompt: wins("fixedPositivePrompt") ? text(o.fixedPositivePrompt) : all.fixedPositivePrompt,
    negativePrompt: wins("negativePrompt") ? text(o.negativePrompt) : all.negativePrompt,
    animaPositivePrompt: wins("animaPositivePrompt") ? text(o.animaPositivePrompt) : all.animaPositivePrompt,
    animaNegativePrompt: wins("animaNegativePrompt") ? text(o.animaNegativePrompt) : all.animaNegativePrompt,
  };
}

/** Comparison key per field (AM `wE`). */
function effectiveFieldKey(s: EffectiveCharxSettings, field: CharxSettingField): unknown {
  switch (field) {
    case "freeOutfitGeneration":
      return s.freeOutfitGenerationEnabled;
    case "freeCharacterGeneration":
      return s.freeCharacterGenerationEnabled;
    case "fixedResolution":
      return `${Number(s.fixedResolution.enabled)}:${s.fixedResolution.sizeId}`;
    default:
      return s[field as Exclude<CharxSettingField, "freeOutfitGeneration" | "freeCharacterGeneration">];
  }
}
/** AM `NY`: apply a patch to a stored field object; returns the changed fields. */
function applyPatch(target: Record<string, unknown>, patch: CharxSettingsPatch): { next: Record<string, unknown>; fields: CharxSettingField[] } {
  const next = { ...target };
  const fields: CharxSettingField[] = [];
  const set = (field: CharxSettingField, value: unknown) => {
    next[field] = value;
    fields.push(field);
  };
  if (patch.nativeAssetVisibility !== undefined) set("nativeAssetVisibility", patch.nativeAssetVisibility === "shown" ? "shown" : "hidden");
  if (patch.freeOutfitGenerationEnabled !== undefined) set("freeOutfitGeneration", patch.freeOutfitGenerationEnabled);
  if (patch.freeCharacterGenerationEnabled !== undefined) set("freeCharacterGeneration", patch.freeCharacterGenerationEnabled);
  if (patch.rosterSelectionEnabled !== undefined) set("rosterSelectionEnabled", patch.rosterSelectionEnabled);
  if (patch.stateAccumulationEnabled !== undefined) set("stateAccumulationEnabled", patch.stateAccumulationEnabled);
  if (patch.nsfwAlwaysEnabled !== undefined) set("nsfwAlwaysEnabled", patch.nsfwAlwaysEnabled);
  if (patch.forceAiChoiceCoordinates !== undefined) set("forceAiChoiceCoordinates", patch.forceAiChoiceCoordinates);
  if (patch.autoRemoveConflictingRegex !== undefined) set("autoRemoveConflictingRegex", patch.autoRemoveConflictingRegex);
  if (patch.fixedResolution !== undefined) set("fixedResolution", normalizeFixedResolution(patch.fixedResolution));
  if (patch.fixedPositivePrompt !== undefined) set("fixedPositivePrompt", patch.fixedPositivePrompt);
  if (patch.negativePrompt !== undefined) set("negativePrompt", patch.negativePrompt);
  if (patch.animaPositivePrompt !== undefined) set("animaPositivePrompt", patch.animaPositivePrompt);
  if (patch.animaNegativePrompt !== undefined) set("animaNegativePrompt", patch.animaNegativePrompt);
  return { next, fields };
}
function withRevisions(obj: Record<string, unknown>, fields: readonly string[], value: (f: string) => number): Record<string, unknown> {
  if (!fields.length) return obj;
  const rev = { ...asRecord(obj[REVISIONS]) };
  for (const f of fields) rev[f] = value(f);
  return { ...obj, [REVISIONS]: rev };
}
function withDirty(defaults: Record<string, unknown>, dirty: Record<string, CharxSettingField[]>): Record<string, unknown> {
  const next = { ...defaults };
  if (Object.keys(dirty).length) next[DIRTY] = dirty;
  else delete next[DIRTY];
  return next;
}
function withDefaults<T extends CharxScopeConfig>(config: T, defaults: Record<string, unknown>, extra: Partial<T["characterPrompt"]> = {}): T {
  return { ...config, characterPrompt: { ...config.characterPrompt, ...extra, charxGenerationDefaults: defaults } } as T;
}
function withOverrides<T extends CharxScopeConfig>(config: T, overrides: Record<string, unknown>): T {
  return { ...config, characterPrompt: { ...config.characterPrompt, charxSettings: { ...config.characterPrompt.charxSettings, overrides } } } as T;
}

/** AM `LL` 24793: recompute the dirty list of a character for the given fields. */
export function recomputeCharxDirtyFields<T extends CharxScopeConfig>(config: T, characterId: string, fields: readonly CharxSettingField[] = CHARX_SETTING_FIELDS): T {
  const id = trimString(characterId);
  if (!id || !fields.length) return config;
  const defaults = defaultsOf(config);
  const dirty = dirtyMap(defaults);
  const set = new Set<string>(dirty[id] ?? []);
  const effective = resolveEffectiveCharxSettings(config, id);
  const all = resolveAllCharxSettings(config);
  for (const f of fields) (Object.is(effectiveFieldKey(effective, f), effectiveFieldKey(all, f)) ? set.delete(f) : set.add(f));
  const ordered = CHARX_SETTING_FIELDS.filter((f) => set.has(f));
  const next = { ...dirty };
  if (ordered.length) next[id] = [...ordered];
  else delete next[id];
  return JSON.stringify(dirty) === JSON.stringify(next) ? config : withDefaults(config, withDirty(defaults, next));
}

/** AM `ONe` 24811: set per-character override fields (stamped with the current all-charx revision). */
export function setCharxOverride<T extends CharxScopeConfig>(config: T, characterId: string, patch: CharxSettingsPatch): T {
  const id = trimString(characterId);
  if (!id) return config;
  const overrides = asRecord(config.characterPrompt.charxSettings.overrides);
  const applied = applyPatch(asRecord(overrides[id]), patch);
  if (!applied.fields.length) return config;
  const defaults = defaultsOf(config);
  const stamped = withRevisions(applied.next, applied.fields, (f) => revisionOf(defaults, f));
  return recomputeCharxDirtyFields(withOverrides(config, { ...overrides, [id]: stamped }), id, applied.fields);
}

/** AM `jNe` 24831: edit all-charx defaults (bumps revisions; edited fields leave every dirty list; mirrors nsfw/negative/fixed prompt). */
export function setCharxDefaults<T extends CharxScopeConfig>(config: T, patch: CharxSettingsPatch): T {
  const defaults = defaultsOf(config);
  const applied = applyPatch(defaults, patch);
  if (!applied.fields.length) return config;
  let next = withRevisions(applied.next, applied.fields, (f) => revisionOf(defaults, f) + 1);
  const edited = new Set<string>(applied.fields);
  const dirty = Object.fromEntries(
    Object.entries(dirtyMap(next)).flatMap(([k, list]) => {
      const kept = list.filter((f) => !edited.has(f));
      return kept.length ? [[k, kept]] : [];
    }),
  ) as Record<string, CharxSettingField[]>;
  next = withDirty(next, dirty);
  return {
    ...config,
    runtime: { ...config.runtime, ...(patch.nsfwAlwaysEnabled === undefined ? {} : { nsfwAlwaysEnabled: patch.nsfwAlwaysEnabled }) },
    novelai: { ...config.novelai, ...(patch.negativePrompt === undefined ? {} : { negativePrompt: patch.negativePrompt }) },
    characterPrompt: { ...config.characterPrompt, ...(patch.fixedPositivePrompt === undefined ? {} : { fixedPositivePrompt: patch.fixedPositivePrompt }), charxGenerationDefaults: next },
  } as T;
}

/** AM `NNe` 24866: clear all overrides of a character ("reset current charx settings"). */
export function clearCharxOverrides<T extends CharxScopeConfig>(config: T, characterId: string): T {
  const id = trimString(characterId);
  if (!id) return config;
  const overrides = asRecord(config.characterPrompt.charxSettings.overrides);
  const current = { ...asRecord(overrides[id]) };
  for (const f of CHARX_SETTING_FIELDS) delete current[f];
  const rev = { ...asRecord(current[REVISIONS]) };
  for (const f of CHARX_SETTING_FIELDS) delete rev[f];
  if (Object.keys(rev).length) current[REVISIONS] = rev;
  else delete current[REVISIONS];
  const next = { ...overrides };
  if (Object.keys(current).length) next[id] = current;
  else delete next[id];
  return recomputeCharxDirtyFields(withOverrides(config, next), id, CHARX_SETTING_FIELDS);
}

/** AM `ENe` 24861: bump every all-charx revision and clear dirty lists (all overrides lose). */
export function resetAllCharxOverrides<T extends CharxScopeConfig>(config: T): T {
  const defaults = defaultsOf(config);
  return withDefaults(config, withDirty(withRevisions(defaults, CHARX_SETTING_FIELDS, (f) => revisionOf(defaults, f) + 1), {}));
}

/** AM `RNe`: recompute all dirty fields of a character (run when the charx settings page opens). */
export function refreshCharxDirtyFields<T extends CharxScopeConfig>(config: T, characterId: string): T {
  return recomputeCharxDirtyFields(config, characterId, CHARX_SETTING_FIELDS);
}

/** True when the character has any per-charx difference (AM 24900-like). */
export function hasCharxOverrides(config: CharxScopeConfig, characterId: string): boolean {
  return (dirtyMap(defaultsOf(config))[trimString(characterId)] ?? []).length > 0;
}

/** Scope object for the global config + one character document. */
export function charxScopeFor(global: InlayConfig, document: Pick<CharacterDocument, "characterPrompt"> | null): CharxScopeConfig {
  return {
    jevConnection: global.jevConnection,
    runtime: global.runtime,
    novelai: global.novelai,
    characterPrompt: {
      fixedPositivePrompt: global.characterPrompt.fixedPositivePrompt,
      charxGenerationDefaults: global.characterPrompt.charxGenerationDefaults,
      charxSettings: { overrides: document?.characterPrompt.charxSettings.overrides ?? {} },
    },
  };
}

/** Effective per-character settings from the global config and a character document (or its override alone). */
export function resolveEffectiveConfig(global: InlayConfig, character: { characterId: string; document?: Pick<CharacterDocument, "characterPrompt"> | null; override?: CharxOverride }): EffectiveCharxSettings {
  const doc = character.document ?? (character.override ? { characterPrompt: { charxSettings: { overrides: { [character.characterId]: character.override } } } as unknown as CharacterScopedPrompt } : null);
  return resolveEffectiveCharxSettings(charxScopeFor(global, doc), character.characterId);
}

/** Merge global config + character document into Asset Maid's runtime config shape (for the engine). */
export function buildRuntimeConfig(global: InlayConfig, document: CharacterDocument | null, options: { resolvedImageModel?: string } = {}): RuntimeConfig {
  const g = jsonClone(global);
  const cp = document ? jsonClone(document.characterPrompt) : ({} as CharacterScopedPrompt);
  const characterId = document?.characterId ?? "";
  const naiModel = trimString(options.resolvedImageModel) || g.image.model || DEFAULT_NOVELAI_MODEL;
  const animaSelection = { ...g.animaArtists.selection.bySourceId };
  if (characterId && document?.animaArtistId) animaSelection[characterId] = document.animaArtistId;
  const runtime: RuntimeConfig = {
    ...g,
    novelai: { ...g.novelai, naiModel, characterReferenceEnabled: isNovelAIV5Model(naiModel) ? false : g.novelai.characterReferenceEnabled },
    animaArtists: { ...g.animaArtists, selection: { ...g.animaArtists.selection, bySourceId: animaSelection } },
    characterPrompt: { ...g.characterPrompt, ...(document ? cp : ({} as CharacterScopedPrompt)) } as GlobalCharacterPromptSettings & CharacterScopedPrompt,
  };
  return runtime;
}

/* ------------------------------------------------------------------------------------------------
 * Chat image generation settings (`asset_maid:v1:config:chat-image-generation-settings`; `aS`/`Km` 157809)
 * ---------------------------------------------------------------------------------------------- */

export interface ChatImageGenerationSettings {
  /** Auto-generate when an AI reply finishes. */
  autoGenerationEnabled: boolean;
  countPolicy: CountPolicy;
  /** "split" = V5 split analysis (needs a total count). */
  analysisMode: "single" | "split";
  splitAnalysis: { totalCount: number | null; batchSize: number };
}
export const SPLIT_ANALYSIS_MAX_TOTAL = 20;
export function createDefaultChatImageGenerationSettings(): ChatImageGenerationSettings {
  return { autoGenerationEnabled: true, countPolicy: fixedCountPolicy(1), analysisMode: "single", splitAnalysis: { totalCount: null, batchSize: 3 } };
}
export const DEFAULT_CHAT_IMAGE_GENERATION_SETTINGS: Readonly<ChatImageGenerationSettings> = Object.freeze(createDefaultChatImageGenerationSettings());
/** AM `T2`: max batch size for a split total. */
export function maxSplitBatchSize(totalCount: number): number {
  return Math.min(7, Math.max(1, Math.ceil(totalCount / 2)));
}
/**
 * AM `Km` 157826. `maxCount` defaults to 7 (UI); storage load uses unlimited (`UNLIMITED_IMAGE_COUNT`),
 * developer mode allows unlimited counts.
 */
export function normalizeChatImageGenerationSettings(value: unknown, fallback: ChatImageGenerationSettings = DEFAULT_CHAT_IMAGE_GENERATION_SETTINGS, maxCount: number = MAX_IMAGE_COUNT): ChatImageGenerationSettings {
  const r = asRecord(value);
  const split = asRecord(r.splitAnalysis);
  const positive = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) > 0;
  const total = positive(split.totalCount) ? split.totalCount : null;
  const batch = positive(split.batchSize) ? split.batchSize : 3;
  return {
    analysisMode: r.analysisMode === "split" && total !== null ? "split" : "single",
    splitAnalysis: { totalCount: total, batchSize: Math.min(batch, total === null ? 7 : maxSplitBatchSize(total)) },
    autoGenerationEnabled: typeof r.autoGenerationEnabled === "boolean" ? r.autoGenerationEnabled : fallback.autoGenerationEnabled,
    countPolicy: normalizeCountPolicy(r.countPolicy, fallback.countPolicy, maxCount),
  };
}
/** Load-time normalization with the AM notices (157887-157901, English; Korean in `noticeKo`). */
export function loadChatImageGenerationSettings(stored: unknown, legacy: { chatImageCount?: unknown; legacySettings?: unknown } = {}): { settings: ChatImageGenerationSettings; notice: string; migrated: boolean } {
  if (stored !== undefined && stored !== null) {
    const r = asRecord(stored);
    const split = asRecord(r.splitAnalysis);
    const notices: string[] = [];
    if (r.analysisMode !== undefined && r.analysisMode !== "single" && r.analysisMode !== "split") notices.push("Unknown analysis mode restored to single analysis.");
    if (r.analysisMode === "split" && (!Number.isSafeInteger(split.totalCount) || Number(split.totalCount) < 1)) notices.push("Invalid split total count; restored to single analysis.");
    if (split.batchSize !== undefined && (!Number.isSafeInteger(split.batchSize) || Number(split.batchSize) < 1)) notices.push("Split batch size restored to the default and the total-count limit.");
    const settings = normalizeChatImageGenerationSettings(stored, DEFAULT_CHAT_IMAGE_GENERATION_SETTINGS, UNLIMITED_IMAGE_COUNT);
    if (Number.isSafeInteger(split.batchSize) && Number(split.batchSize) > settings.splitAnalysis.batchSize) notices.push(`Split batch size adjusted to the allowed maximum of ${settings.splitAnalysis.batchSize}.`);
    return { settings, notice: notices.join(" "), migrated: false };
  }
  // AM ISt/157905: legacy `chat-image-count` number, or fields from the old settings domain.
  if (legacy.chatImageCount !== undefined && legacy.chatImageCount !== null) {
    return { settings: normalizeChatImageGenerationSettings({ countPolicy: fixedCountPolicy(legacy.chatImageCount, UNLIMITED_IMAGE_COUNT) }, DEFAULT_CHAT_IMAGE_GENERATION_SETTINGS, UNLIMITED_IMAGE_COUNT), notice: "", migrated: true };
  }
  const old = asRecord(legacy.legacySettings);
  const charx = asRecord(asRecord(old.characterPrompt).charxGenerationDefaults);
  const rt = asRecord(old.runtime);
  const hasAuto = typeof charx.imageAutoGenerationEnabled === "boolean" || typeof rt.imageAutoGenerationEnabled === "boolean";
  if (hasAuto || hasOwn(charx, "imageGenerationCountPolicy")) {
    return {
      settings: normalizeChatImageGenerationSettings({ autoGenerationEnabled: typeof charx.imageAutoGenerationEnabled === "boolean" ? charx.imageAutoGenerationEnabled : rt.imageAutoGenerationEnabled, countPolicy: charx.imageGenerationCountPolicy }, DEFAULT_CHAT_IMAGE_GENERATION_SETTINGS, UNLIMITED_IMAGE_COUNT),
      notice: "",
      migrated: true,
    };
  }
  return { settings: normalizeChatImageGenerationSettings(DEFAULT_CHAT_IMAGE_GENERATION_SETTINGS), notice: "", migrated: false };
}

/* ------------------------------------------------------------------------------------------------
 * Overlay UI state (`asset_maid:v1:ui-state`, `gU`/`yU` 152976; per-source state `gIt`/`xIt` 152923)
 * ---------------------------------------------------------------------------------------------- */

export interface UiStateGlobal { sidebarOpen: boolean; navigationLayout: "grid" | "list"; splitRatio: number; zoomInfoOpen: boolean; zoomSidebarsOpen: boolean }
export type WorkspaceTab = "assets" | "prompts" | "artists" | "settings" | "persona";
export interface UiStateSource {
  activeTab: WorkspaceTab;
  secondaryOpen: boolean;
  secondaryMode: "asset-picker" | "character-tags" | "outfit";
  navigationView: "characters" | "lorebooks" | "custom" | "modules";
  activeOutfitByPromptKey: Record<string, string>;
  activePersonaOutfitByPersonaKey: Record<string, string>;
}
export interface UiState { version: 1; global: UiStateGlobal; bySourceId: Record<string, UiStateSource> }
export function createDefaultUiState(): UiState {
  return { version: 1, global: { sidebarOpen: true, navigationLayout: "grid", splitRatio: 0.5, zoomInfoOpen: false, zoomSidebarsOpen: true }, bySourceId: {} };
}
export const DEFAULT_UI_STATE_SOURCE: Readonly<UiStateSource> = Object.freeze({ activeTab: "assets", secondaryOpen: false, secondaryMode: "asset-picker", navigationView: "characters", activeOutfitByPromptKey: {}, activePersonaOutfitByPersonaKey: {} });
function stringPairs(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(asRecord(value)).flatMap(([k, v]) => (trimString(k) && trimString(v) ? [[trimString(k), trimString(v)]] : [])));
}
/** AM `xIt`. */
export function normalizeUiStateSource(value: unknown): UiStateSource {
  const r = asRecord(value);
  return {
    activeTab: r.activeTab === "prompts" || r.activeTab === "artists" || r.activeTab === "settings" || r.activeTab === "persona" ? r.activeTab : "assets",
    secondaryOpen: typeof r.secondaryOpen === "boolean" ? r.secondaryOpen : false,
    secondaryMode: r.secondaryMode === "character-tags" ? "character-tags" : r.secondaryMode === "outfit" || r.secondaryMode === "persona-reference" ? "outfit" : "asset-picker",
    navigationView: r.navigationView === "lorebooks" || r.navigationView === "custom" || r.navigationView === "modules" ? r.navigationView : "characters",
    activeOutfitByPromptKey: stringPairs(r.activeOutfitByPromptKey),
    activePersonaOutfitByPersonaKey: stringPairs(r.activePersonaOutfitByPersonaKey),
  };
}
/** AM `yU`: only layout + split ratio persist; the rest resets on load. Port keeps per-source state too. */
export function normalizeUiState(value: unknown): UiState {
  const r = asRecord(value);
  const g = asRecord(r.global);
  const ratio = Number(r.splitRatio ?? g.splitRatio);
  const bySourceId: Record<string, UiStateSource> = {};
  for (const [k, v] of Object.entries(asRecord(r.bySourceId))) if (trimString(k)) bySourceId[trimString(k)] = normalizeUiStateSource(v);
  return {
    version: 1,
    global: {
      sidebarOpen: true,
      navigationLayout: (r.navigationLayout ?? g.navigationLayout) === "list" ? "list" : "grid",
      splitRatio: Number.isFinite(ratio) ? Math.min(0.65, Math.max(0.35, ratio)) : 0.5,
      zoomInfoOpen: false,
      zoomSidebarsOpen: true,
    },
    bySourceId,
  };
}
