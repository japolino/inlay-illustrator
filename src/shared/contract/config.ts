import { NOVELAI_SAMPLERS, NOVELAI_NOISE_SCHEDULES } from "./novelai-sampling.js";
export { NOVELAI_SAMPLERS, NOVELAI_NOISE_SCHEDULES, novelAISamplingOptions } from "./novelai-sampling.js";
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
  REMOVED_CHARX_SETTING_FIELDS,
  stripRemovedCharxFields,
  type CharxOverride,
  type CharxSettingField,
  createDefaultAnimaArtists,
  createDefaultPersonaSettings,
  DEFAULT_MALE_PERSONA_PROMPT,
  DEFAULT_SELECTED_ARTIST_ID,
  type FixedResolution,
  type NativeAssetVisibility,
  normalizeAnimaArtists,
  normalizePersonaSettings,
  type PersonaSettings,
  resolveNovelAIArtistSelection,
} from "./character.js";
import { type CountPolicy, fixedCountPolicy, MAX_IMAGE_COUNT, normalizeCountPolicy, UNLIMITED_IMAGE_COUNT } from "./chat.js";
import type { AtelierCatalog, AtelierExecution, AtelierRuntimeOverlay, DefaultChanges } from "./atelier.js";
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
export const CHARACTER_REFERENCE_TYPES = ["character", "style", "character&style"] as const;
export type CharacterReferenceType = (typeof CHARACTER_REFERENCE_TYPES)[number];
/** NovelAI V5 Medium wire model (AM 0.9.90 `p5e$990`). */
export const NOVELAI_V5_MEDIUM_MODEL = "nai-diffusion-5-full-medium";
export const NOVELAI_V5_FULL_MODEL = "nai-diffusion-5-full";
export const NOVELAI_EFFORTS = ["high", "medium"] as const;
export type NovelAIEffort = (typeof NOVELAI_EFFORTS)[number];
/** AM 0.9.90 `g5e$990`: the High / Medium choice is offered only for NovelAI V5 Full (or a stored `-medium` model). */
export function novelAIEffortAvailable(model: unknown): boolean {
  const m = trimString(model);
  return m === NOVELAI_V5_FULL_MODEL || m === NOVELAI_V5_MEDIUM_MODEL;
}
/** AM 0.9.90 `TC$990`: this request runs NovelAI V5 Medium. */
export function isNovelAIMedium(config: { naiModel?: unknown; effort?: unknown }): boolean {
  const m = trimString(config.naiModel);
  return m === NOVELAI_V5_MEDIUM_MODEL || (m === NOVELAI_V5_FULL_MODEL && config.effort === "medium");
}
/** AM 0.9.90 `m5e$990`: anything but "medium" is "high". */
export function normalizeNovelAIEffort(value: unknown): NovelAIEffort {
  return value === "medium" ? "medium" : "high";
}
/** Sampling a NovelAI image was actually made with (AM 0.9.90 `finalizedPrompt.sampling` -> `analyzerDecision.novelaiSampling`). */
export interface NovelAISampling { model: string; effort: NovelAIEffort; steps: number; sampler: string; scale: number; cfgRescale: number; noiseSchedule: string }

/** AM `Uj`: NovelAI V5 model test (V5 has no director reference). */
export function isNovelAIV5Model(model: unknown): boolean {
  return /^nai-diffusion-5(?:-|$)/u.test(trimString(model));
}

export const THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** NovelAI scene analyzer profiles (AM 0.9.90 `b5e`): only "v5-hybrid" (Asset Maid V5); V4.5 analysis was merged into V5. */
export const ANALYSIS_PROFILES = ["v5-hybrid"] as const;
export type AnalysisProfile = (typeof ANALYSIS_PROFILES)[number];
export const DEFAULT_ANALYSIS_PROFILE: AnalysisProfile = "v5-hybrid";
/** AM 0.9.90 `w5e`: every stored value ("v4-5", "v5-hybrid-preview", unknown) becomes "v5-hybrid". The field is kept and still written. */
export function normalizeAnalysisProfile(_value: unknown): AnalysisProfile {
  return DEFAULT_ANALYSIS_PROFILE;
}

/* ------------------------------------------------------------------------------------------------
 * Image providers (AM `W0` 20554) mapped onto Lumiverse image-gen connections
 * ---------------------------------------------------------------------------------------------- */

/**
 * AM 0.9.90 provider ids (`Ix`): "novelai" and "comfy-ui". "chan-server" is gone, and so are the port's former
 * "generic" Lumiverse providers (sdapi, swarmui, openai, ...): a connection of another provider is not usable.
 */
export type GenerationProvider = "novelai" | "comfy-ui";
/** AM `VQ`: the provider a stored unknown or removed id ("generic", "chan-server") normalizes to. */
export const DEFAULT_GENERATION_PROVIDER: GenerationProvider = "novelai";
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
});
/** Lumiverse image-gen provider id -> AM generation provider; null for every other provider (not supported). */
export function generationProviderFromLumiverse(providerId: unknown): GenerationProvider | null {
  const id = trimString(providerId).toLowerCase();
  if (id === "novelai") return "novelai";
  if (id === "comfyui" || id === "comfy-ui") return "comfy-ui";
  return null;
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
  instructionPosition?: "before-preset";
  presentation?: "segmented";
  instructionSuffix?: string;
  defaultValue?: number;
  valueOptions?: { value: number; label?: string; variables: Record<string, string>; instructionSuffix?: string }[];
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
/** AM `r8`: a legacy boolean `comic.landscape` becomes `comic.frame` (2 landscape, 1 portrait) unless the frame is set. */
function migrateLegacyControlOverrides(value: unknown): Record<string, unknown> {
  const out = { ...asRecord(value) };
  if (!("comic.frame" in out) && typeof out["comic.landscape"] === "boolean") out["comic.frame"] = out["comic.landscape"] ? 2 : 1;
  delete out["comic.landscape"];
  return out;
}
/** AM `Yg`. */
function normalizeControlOverrides(value: unknown): V5ControlOverrides | undefined {
  const out: V5ControlOverrides = {};
  for (const [ref, v] of Object.entries(migrateLegacyControlOverrides(value))) {
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
  // AM 0.9.89.3 `y5e`: preset ids 1..5 or custom size ids (>= 1e9, kept even when the custom size is gone).
  const sizes = kind === "imageRatio" ? [...new Set(asArray(r.allowedSizeIds).filter((n): n is number => (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5) || isCustomImageSizeId(n)))] : [];
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
  /** Lumiverse Decision connection id; "" = host default connection. */
  connectionId?: string;
  /** Default of the per-charx "roster preselection" toggle. */
  rosterSelectionDefault: boolean;
  /** Model sent with JEV requests; "" = the decision connection's own model. Absent = `DEFAULT_JEV_MODEL`. */
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
  /**
   * NovelAI V5 Full High / Medium (AM 0.9.90 `config.novelai.effort`). Medium sends `nai-diffusion-5-full-medium` with 14
   * steps, Euler Ancestral and no negatives; the stored steps / sampler / CFG rescale / negatives stay untouched.
   */
  effort: NovelAIEffort;
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
  /** Global NovelAI artist preset, used by characters without an own `selectedArtistId` (port addition). */
  defaultArtistId: string;
}

/** Generation resolution chosen in the chat toolbar (AM 0.9.90 `runtime.analysisExecution.resolution`). */
export interface ExecutionResolution { id: number; width: number; height: number }
/**
 * Chat toolbar quick settings (AM 0.9.90 `runtime.analysisExecution`, normalizer `M0$990` N 3807). `resolution: null`
 * = automatic (the analyzer picks); absent fields are seeded once from the per-CharX `fixedResolution` /
 * `forceAiChoiceCoordinates` of the current character (`PPe$990`), see `effectiveAnalysisExecution`.
 */
export interface AnalysisExecution { resolution?: ExecutionResolution | null; aiCoordinates?: boolean }

export interface RuntimeSettings {
  customImageSizes: CustomImageSize[];
  /** Chat toolbar resolution / AI coordinates (AM 0.9.90); absent until the toolbar first saves it. */
  analysisExecution?: AnalysisExecution;
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
  /**
   * Test switch (no UI): every image request stores a 1x1 placeholder instead of calling the image provider, so the
   * analyzer and prompt composition can be exercised without provider cost or NovelAI's one-image-at-a-time lock.
   */
  devPromptOnly?: boolean;
  /**
   * Switch (no UI) that turns off the Inlay outfit layer: outfit parts in V5 analyzer requests, the legwear/footwear
   * visibility and state repair of image prompts (backend/pipeline/outfit-awareness.ts, outfit-visibility.ts) and the
   * text clothing evidence of outfit analysis (backend/analysis/outfit-evidence.ts).
   */
  outfitAwarenessDisabled?: boolean;
}

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
  characterPrompt: GlobalCharacterPromptSettings;
  runtime: RuntimeSettings;
}

/**
 * Asset Maid's merged runtime config (`Y0` shape) for the engine: global settings + the active character's
 * document. `novelai.naiModel` is the resolved image model (connection model when no override).
 */
export interface RuntimeConfig extends Omit<InlayConfig, "characterPrompt" | "novelai" | "runtime"> {
  novelai: NovelAISettings & { naiModel: string };
  characterPrompt: GlobalCharacterPromptSettings & CharacterScopedPrompt;
  /**
   * AM `presetCatalog` (0.9.90: only `atelier`; the dead V4.5 `rawJson` was dropped, backed up to
   * `config/legacy/preset-raw-catalog.json`). Absent `atelier` = the built-in preset only.
   */
  presetCatalog: { atelier?: AtelierCatalog };
  runtime: RuntimeSettings & {
    /** Atelier data merged from `config/atelier.json` (see `AtelierRuntimeOverlay`). */
    instructionChanges?: DefaultChanges;
    freeGenerationLibrary?: AtelierRuntimeOverlay["freeGenerationLibrary"];
    freeGenerationInstructions?: AtelierRuntimeOverlay["freeGenerationInstructions"];
    analysisExecution?: AnalysisExecution & Partial<AtelierExecution>;
  };
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
    // AM 0.9.90: native CharX assets are shown unless the user hid them (was "hidden").
    nativeAssetVisibility: "shown",
    freeOutfitGeneration: true,
    freeCharacterGeneration: true,
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
    jevConnection: { connectionId: "", rosterSelectionDefault: false, model: DEFAULT_JEV_MODEL },
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
      effort: "high",
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
      defaultArtistId: DEFAULT_SELECTED_ARTIST_ID,
    },
    runtime: {
      customImageSizes: [],
      generationAutoRetryCount: 5,
      nsfwAlwaysEnabled: false,
      generationProvider: DEFAULT_GENERATION_PROVIDER,
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

/**
 * AM 0.9.90 `M0$990` (N 3807): a resolution is kept only when it is a built-in preset with the same size or a valid
 * custom size; `null` (auto) is kept; `aiCoordinates` only when boolean. Undefined when nothing is left.
 */
export function normalizeAnalysisExecution(value: unknown): AnalysisExecution | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const r = value as Record<string, unknown>;
  const out: AnalysisExecution = {};
  if (r.resolution === null) out.resolution = null;
  else if (r.resolution && typeof r.resolution === "object") {
    const { id, width, height } = r.resolution as Record<string, unknown>;
    const preset = IMAGE_SIZE_PRESETS.some((p) => p.id === id && p.width === width && p.height === height);
    if (preset || normalizeCustomImageSizes([{ id, width, height }]).length === 1) out.resolution = { id: id as number, width: width as number, height: height as number };
  }
  if (typeof r.aiCoordinates === "boolean") out.aiCoordinates = r.aiCoordinates;
  return Object.keys(out).length ? out : undefined;
}

/** AM 0.9.90 `WV$990` (N 3826): the toolbar settings still need their one-time seed from the CharX settings. */
export function analysisExecutionNeedsSeed(runtime: { analysisExecution?: AnalysisExecution }): boolean {
  const e = normalizeAnalysisExecution(runtime.analysisExecution);
  return !e || !hasOwn(e, "resolution") || typeof e.aiCoordinates !== "boolean";
}

/**
 * Effective toolbar settings (AM 0.9.90 `qv$990` + the `CPe$990` seed as a read-time fallback): stored values win;
 * a missing resolution comes from the CharX fixed resolution (enabled -> that size, else auto) and a missing
 * `aiCoordinates` from `!forceAiChoiceCoordinates`.
 */
export function effectiveAnalysisExecution(
  runtime: { analysisExecution?: AnalysisExecution; customImageSizes?: readonly CustomImageSize[] },
  source: Pick<EffectiveCharxSettings, "fixedResolution" | "forceAiChoiceCoordinates"> | null,
): { resolution: ExecutionResolution | null; aiCoordinates: boolean } {
  const stored = normalizeAnalysisExecution(runtime.analysisExecution) ?? {};
  let resolution: ExecutionResolution | null = null;
  if (stored.resolution !== undefined) resolution = stored.resolution;
  else if (source?.fixedResolution.enabled) {
    const size = findImageSize(source.fixedResolution.sizeId, runtime.customImageSizes ?? []);
    resolution = size ? { id: size.id, width: size.width, height: size.height } : null;
  }
  return { resolution, aiCoordinates: typeof stored.aiCoordinates === "boolean" ? stored.aiCoordinates : !(source?.forceAiChoiceCoordinates ?? true) };
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

const REMOVED_CHARX_DEFAULT_FIELDS = REMOVED_CHARX_SETTING_FIELDS;

/**
 * Stored all-charx defaults without `nativeAssetVisibility` from before AM 0.9.90. Settings are stored as a diff against
 * the defaults, so an explicit "hidden" (the old default) was never written; only its revision or a dirty entry shows
 * the user chose it. Those keep "hidden"; untouched settings take the new "shown" default (AM 0.9.90 `nR`).
 */
function withLegacyAssetVisibility(value: unknown): unknown {
  if (!isPlainObject(value) || hasOwn(value, "nativeAssetVisibility")) return value;
  const revision = Number(asRecord(value.revisionByField).nativeAssetVisibility);
  const dirty = Object.values(asRecord(value.dirtyFieldsBySourceId)).some((v) => Array.isArray(v) && v.includes("nativeAssetVisibility"));
  return (Number.isFinite(revision) && revision > 0) || dirty ? { ...value, nativeAssetVisibility: "hidden" } : value;
}

/** Keep only known charx default fields; strip removed fields from revisions and dirty lists (AM `uEe`). */
export function normalizeCharxGenerationDefaults(value: unknown): CharxGenerationDefaults {
  const merged = deepMergeOverDefaults(createDefaultCharxGenerationDefaults() as unknown as Record<string, unknown>, withLegacyAssetVisibility(value)) as Record<string, unknown>;
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
  return stripRemovedCharxFields(jsonClone(asRecord(value)) as Record<string, unknown>) as CharxOverride;
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
    // AM-shaped input (no `image` part): the provider comes from `runtime.generationProvider`.
    provider:
      trimString(imageIn.provider).toLowerCase() ||
      (hasOwn(input, "image") ? "" : trimString(asRecord(input.runtime).generationProvider) === "novelai" ? "novelai" : trimString(asRecord(input.runtime).generationProvider) === "comfy-ui" ? "comfyui" : ""),
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
    effort: normalizeNovelAIEffort(n.effort),
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
    connectionId: trimString(jevRaw.connectionId),
    rosterSelectionDefault: typeof jevRaw.rosterSelectionDefault === "boolean" ? jevRaw.rosterSelectionDefault : jevRaw.selectionEnabled === true,
    // A cleared field is kept: it selects the connection's model (other providers reject `jev-latest`).
    model: typeof jevRaw.model === "string" ? jevRaw.model.trim() : DEFAULT_JEV_MODEL,
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
    defaultArtistId: trimString(cp.defaultArtistId) || DEFAULT_SELECTED_ARTIST_ID,
  };

  const rt = asRecord(merged.runtime);
  const runtime: RuntimeSettings = {
    customImageSizes: normalizeCustomImageSizes(rt.customImageSizes),
    generationAutoRetryCount: Math.max(0, Math.min(10, Math.floor(Number(rt.generationAutoRetryCount ?? 5) || 0))),
    nsfwAlwaysEnabled: rt.nsfwAlwaysEnabled === true,
    // AM `aN`: unsupported or removed providers ("generic", "chan-server") fall back to NovelAI.
    generationProvider: generationProviderFromLumiverse(image.provider) ?? DEFAULT_GENERATION_PROVIDER,
    novelaiCallMode: "sequential",
    novelaiParallelIntervalSec: clampInt(rt.novelaiParallelIntervalSec, 0, 0, 30),
    chatImageWidthPercent: clampInt(rt.chatImageWidthPercent, 70, 30, 100),
    comfyuiCompletionTimeoutMs: clampInt(rt.comfyuiCompletionTimeoutMs, 600000, 1000, 3600000),
    comfyuiCharacterReferenceEnabled: rt.comfyuiCharacterReferenceEnabled !== false,
    comfyuiOutfitReferenceEnabled: rt.comfyuiOutfitReferenceEnabled === true,
    ...(normalizeAnalysisExecution(rt.analysisExecution) ? { analysisExecution: normalizeAnalysisExecution(rt.analysisExecution) } : {}),
    ...(rt.devPromptOnly === true ? { devPromptOnly: true } : {}),
    ...(rt.outfitAwarenessDisabled === true ? { outfitAwarenessDisabled: true } : {}),
  };

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
  /** `config/settings.json`: enabled, ui, runtime, novelai.negativePrompt, characterPrompt (global part minus artistPrompts). The Atelier lives in `config/atelier.json`. */
  settings: Record<string, unknown>;
  /** `config/artists-global.json`: `{characterPrompt:{artistPrompts, defaultArtistId}}`. */
  artistsGlobal: { characterPrompt: { artistPrompts: ArtistEntry[]; defaultArtistId: string } };
  /** `config/anima-artists.json`: entries + defaultId. */
  animaArtists: AnimaArtistList;
}

/** Split a normalized config into its stored parts (diffs against defaults where AM stores diffs). */
export function splitConfigForStorage(config: InlayConfig): StoredGlobalConfig {
  const defaults = createDefaultConfig();
  const { negativePrompt: _n, characterPrompts: _c, ...novelaiModel } = config.novelai;
  const { negativePrompt: _dn, characterPrompts: _dc, ...novelaiModelDefaults } = defaults.novelai;
  const model = asRecord(diffAgainstDefaults({ analysis: config.analysis, jevConnection: config.jevConnection, novelai: novelaiModel, image: config.image }, { analysis: defaults.analysis, jevConnection: defaults.jevConnection, novelai: novelaiModelDefaults, image: defaults.image }));
  const { artistPrompts, defaultArtistId, ...cpSettings } = config.characterPrompt;
  const { artistPrompts: _a, defaultArtistId: _d, ...cpDefaults } = defaults.characterPrompt;
  const settings = asRecord(
    diffAgainstDefaults(
      { version: config.version, enabled: config.enabled, ui: config.ui, runtime: config.runtime, novelai: { negativePrompt: config.novelai.negativePrompt }, characterPrompt: cpSettings },
      { version: defaults.version, enabled: defaults.enabled, ui: defaults.ui, runtime: defaults.runtime, novelai: { negativePrompt: defaults.novelai.negativePrompt }, characterPrompt: cpDefaults },
    ),
  );
  // AM always writes popupClickThroughProtectionEnabled (device default may differ).
  settings.ui = { ...asRecord(settings.ui), popupClickThroughProtectionEnabled: config.ui.popupClickThroughProtectionEnabled };
  // The native asset visibility is always written too, so an explicit choice survives a later default change (the
  // default became "shown" in AM 0.9.90; see `withLegacyAssetVisibility`).
  const charxStored = asRecord(asRecord(settings.characterPrompt).charxGenerationDefaults);
  settings.characterPrompt = {
    ...asRecord(settings.characterPrompt),
    charxGenerationDefaults: { ...charxStored, nativeAssetVisibility: config.characterPrompt.charxGenerationDefaults.nativeAssetVisibility },
  };
  return {
    model,
    settings,
    artistsGlobal: { characterPrompt: { artistPrompts: jsonClone(artistPrompts), defaultArtistId } },
    animaArtists: { version: 1, entries: jsonClone(config.animaArtists.entries), selection: { defaultId: config.animaArtists.selection.defaultId, bySourceId: {} } },
  };
}

/** Rebuild a config from stored parts (missing parts = defaults). */
export function mergeStoredConfig(parts: Partial<StoredGlobalConfig>): InlayConfig {
  const model = asRecord(parts.model);
  const settings = asRecord(parts.settings);
  const novelai = { ...asRecord(model.novelai), ...asRecord(settings.novelai) };
  const artists = asRecord(asRecord(parts.artistsGlobal).characterPrompt);
  const characterPrompt = { ...asRecord(settings.characterPrompt), ...(parts.artistsGlobal ? { artistPrompts: asArray(artists.artistPrompts), defaultArtistId: artists.defaultArtistId } : {}) };
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
    // AM 0.9.90 `nR`: an own value wins, otherwise "shown".
    nativeAssetVisibility: hasOwn(t, "nativeAssetVisibility") ? (t.nativeAssetVisibility === "shown" ? "shown" : "hidden") : "shown",
    freeCharacterGenerationEnabled: t.freeCharacterGeneration !== false,
    freeOutfitGenerationEnabled: typeof t.freeOutfitGeneration === "boolean" ? t.freeOutfitGeneration : true,
    rosterSelectionEnabled: typeof t.rosterSelectionEnabled === "boolean" ? t.rosterSelectionEnabled : config.jevConnection.rosterSelectionDefault === true,
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

/**
 * Merge global config + character document into Asset Maid's runtime config shape (for the engine). With `atelier`
 * (from `config/atelier.json`, see the backend AtelierService) the AM Atelier fields are merged in:
 * `presetCatalog.atelier`, `runtime.instructionChanges` / `freeGenerationLibrary` / `freeGenerationInstructions`, and a
 * complete `runtime.analysisExecution` = stored mode + controls + the chat toolbar resolution / AI coordinates
 * (seeded from the character's CharX settings when never saved, AM `CPe`), so `qv`/`yAe` take the Atelier path.
 */
export function buildRuntimeConfig(global: InlayConfig, document: CharacterDocument | null, options: { resolvedImageModel?: string; atelier?: AtelierRuntimeOverlay } = {}): RuntimeConfig {
  const g = jsonClone(global);
  const cp = document ? jsonClone(document.characterPrompt) : ({} as CharacterScopedPrompt);
  const characterId = document?.characterId ?? "";
  const naiModel = trimString(options.resolvedImageModel) || g.image.model || DEFAULT_NOVELAI_MODEL;
  const animaSelection = { ...g.animaArtists.selection.bySourceId };
  if (characterId && document?.animaArtistId) animaSelection[characterId] = document.animaArtistId;
  const runtime: RuntimeConfig = {
    ...g,
    runtime: { ...g.runtime },
    presetCatalog: {},
    novelai: { ...g.novelai, naiModel, characterReferenceEnabled: isNovelAIV5Model(naiModel) ? false : g.novelai.characterReferenceEnabled },
    animaArtists: { ...g.animaArtists, selection: { ...g.animaArtists.selection, bySourceId: animaSelection } },
    characterPrompt: { ...g.characterPrompt, ...(document ? cp : ({} as CharacterScopedPrompt)) } as GlobalCharacterPromptSettings & CharacterScopedPrompt,
  };
  runtime.characterPrompt.selectedArtistId = resolveNovelAIArtistSelection(g.characterPrompt, document?.characterPrompt.selectedArtistId).id;
  if (options.atelier) applyAtelierOverlay(runtime, options.atelier, resolveEffectiveConfig(g, { characterId, document }));
  return runtime;
}

/**
 * Merge the Atelier fields into an AM runtime config snapshot (in place; see `buildRuntimeConfig`). `source` = the
 * CharX settings that seed a never-saved toolbar resolution / AI coordinates.
 */
export function applyAtelierOverlay<T extends { runtime: unknown; presetCatalog?: unknown }>(
  runtime: T,
  atelier: AtelierRuntimeOverlay,
  source: Pick<EffectiveCharxSettings, "fixedResolution" | "forceAiChoiceCoordinates"> | null,
): T {
  const settings = { ...(runtime.runtime as RuntimeConfig["runtime"]) };
  const execution = effectiveAnalysisExecution(settings, source);
  settings.analysisExecution = { ...jsonClone(atelier.execution), resolution: execution.resolution, aiCoordinates: execution.aiCoordinates };
  delete settings.instructionChanges;
  delete settings.freeGenerationLibrary;
  delete settings.freeGenerationInstructions;
  if (atelier.instructionChanges !== undefined) settings.instructionChanges = jsonClone(atelier.instructionChanges);
  if (atelier.freeGenerationLibrary !== undefined) settings.freeGenerationLibrary = jsonClone(atelier.freeGenerationLibrary);
  if (atelier.freeGenerationInstructions !== undefined) settings.freeGenerationInstructions = jsonClone(atelier.freeGenerationInstructions);
  runtime.runtime = settings;
  runtime.presetCatalog = { ...(runtime.presetCatalog as Record<string, unknown> | undefined), atelier: jsonClone(atelier.catalog) };
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
/** AM 0.9.89.6 `iRt` / `aRt`: split total cap 30 and batch cap 10 (20 and 7 before). */
export const SPLIT_ANALYSIS_MAX_TOTAL = 30;
export const MAX_SPLIT_BATCH_SIZE = 10;
export function createDefaultChatImageGenerationSettings(): ChatImageGenerationSettings {
  return { autoGenerationEnabled: true, countPolicy: fixedCountPolicy(1), analysisMode: "single", splitAnalysis: { totalCount: null, batchSize: 3 } };
}
export const DEFAULT_CHAT_IMAGE_GENERATION_SETTINGS: Readonly<ChatImageGenerationSettings> = Object.freeze(createDefaultChatImageGenerationSettings());
/** AM `T2`: max batch size for a split total. */
export function maxSplitBatchSize(totalCount: number): number {
  return Math.min(MAX_SPLIT_BATCH_SIZE, Math.max(1, Math.ceil(totalCount / 2)));
}
/**
 * AM `Km` 157826. `maxCount` defaults to 10 (UI); storage load uses unlimited (`UNLIMITED_IMAGE_COUNT`),
 * developer mode allows unlimited counts.
 */
export function normalizeChatImageGenerationSettings(value: unknown, fallback: ChatImageGenerationSettings = DEFAULT_CHAT_IMAGE_GENERATION_SETTINGS, maxCount: number = MAX_IMAGE_COUNT): ChatImageGenerationSettings {
  const r = asRecord(value);
  const split = asRecord(r.splitAnalysis);
  const positive = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) > 0;
  // AM caps the split total (the UI clamps too; a hand-edited or out-of-band value must not run a larger split).
  const total = positive(split.totalCount) ? Math.min(split.totalCount, SPLIT_ANALYSIS_MAX_TOTAL) : null;
  const batch = positive(split.batchSize) ? split.batchSize : 3;
  // Rebuilt from the known fields: keys of removed features (`webtoonMode`, `comicFormat`) are dropped on the next write.
  return {
    analysisMode: r.analysisMode === "split" && total !== null ? "split" : "single",
    splitAnalysis: { totalCount: total, batchSize: Math.min(batch, total === null ? MAX_SPLIT_BATCH_SIZE : maxSplitBatchSize(total)) },
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
  secondaryMode: "asset-picker" | "outfit";
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
    // AM 0.9.90 `oSt`: a saved unique-tag search pane ("character-tags", search removed) reopens as the closed asset picker.
    secondaryOpen: r.secondaryMode === "character-tags" ? false : typeof r.secondaryOpen === "boolean" ? r.secondaryOpen : false,
    secondaryMode: r.secondaryMode === "outfit" || r.secondaryMode === "persona-reference" ? "outfit" : "asset-picker",
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
