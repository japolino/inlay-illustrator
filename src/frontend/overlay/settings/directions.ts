/**
 * Pure helpers of the V5 direction editors (Asset Maid `Aj` 6046, `Td` 6049, `Sj` 5897, `XV` 5908, `WV` 5920,
 * `TH` 141517, button order `Cwe` 141503).
 */
import {
  V5_ANALYZER_SIZE_IDS,
  V5_SCENE_CONTROLS,
  type V5ControlOverrides,
  type V5DirectionControl,
  type V5DirectionPreset,
  type V5DirectionSetting
} from "../../../shared/contract/config.js";
import { ANALYSIS_LABELS } from "./labels.js";

export type DirectionKind = "analysis" | "aspect-ratio";

/** Built-in preset order (`Cwe`). */
const BUILT_IN_ORDER = new Map([["scene-default", 0], ["scene-comic", 1], ["scene-pov", 2], ["scene-ensemble", 3]]);
/** Size candidates (`Pwe`). */
export const SIZE_CANDIDATES = [
  { id: 1, resolution: "832 × 1216" },
  { id: 2, resolution: "1216 × 832" },
  { id: 3, resolution: "896 × 1152" },
  { id: 4, resolution: "1152 × 896" },
  { id: 5, resolution: "1024 × 1024" }
] as const;
/** Fallback when every size is unchecked (`j0t`). */
export const LAST_SIZE_FALLBACK = 5;

const controlsByRef = new Map(Object.values(V5_SCENE_CONTROLS).flatMap((list) => list.map((control) => [control.ref, control] as const)));

/** `Aj`: the selected preset (or the first). */
export function selectedPreset(setting: V5DirectionSetting | undefined): V5DirectionPreset | undefined {
  if (!setting?.presets?.length) return undefined;
  return setting.presets.find((preset) => preset.id === setting.selectedPresetId) ?? setting.presets[0];
}

/** `Td`: a setting with `presetId` selected (mirrors scene id, overrides and instruction). */
export function selectPreset(setting: Pick<V5DirectionSetting, "presets">, presetId: string | undefined): V5DirectionSetting {
  const presets = setting.presets ?? [];
  const selected = presets.find((preset) => preset.id === presetId) ?? presets[0];
  return {
    mode: "preset",
    ...(selected ? { selectedPresetId: selected.id } : {}),
    presets,
    ...(selected?.scenePresetId ? { presetId: selected.scenePresetId } : {}),
    ...(selected?.controlOverrides ? { controlOverrides: selected.controlOverrides } : {}),
    customText: selected?.instruction ?? ""
  };
}

/** `TH`: read-only description of a built-in preset (undefined = custom preset). */
export function builtInDescription(kind: DirectionKind, preset: V5DirectionPreset | undefined): string | undefined {
  if (!preset) return undefined;
  if (kind === "aspect-ratio") {
    if (preset.id === "image-ratio-default") return preset.instruction || ANALYSIS_LABELS.builtInNames["image-ratio-default"];
    if (preset.id === "image-ratio-unspecified") return ANALYSIS_LABELS.builtInDescriptions["image-ratio-unspecified"];
    return undefined;
  }
  if (preset.id === "scene-default") return ANALYSIS_LABELS.builtInDescriptions["scene-default"];
  if (preset.scenePresetId && preset.id === `scene-${preset.scenePresetId}`) return ANALYSIS_LABELS.builtInDescriptions[preset.id];
  return undefined;
}

/** Button label of a preset (`N0t`; built-ins translated). */
export function presetLabel(kind: DirectionKind, preset: V5DirectionPreset): string {
  return builtInDescription(kind, preset) !== undefined ? ANALYSIS_LABELS.builtInNames[preset.id] ?? preset.name : preset.name;
}

/** Built-ins first (in `Cwe` order), then custom presets in stored order. */
export function orderedPresets(kind: DirectionKind, presets: readonly V5DirectionPreset[]): { builtIns: V5DirectionPreset[]; custom: V5DirectionPreset[] } {
  const builtIns = presets
    .filter((preset) => builtInDescription(kind, preset) !== undefined)
    .sort((a, b) => (BUILT_IN_ORDER.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (BUILT_IN_ORDER.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  return { builtIns, custom: presets.filter((preset) => builtInDescription(kind, preset) === undefined) };
}

/** Controls shown for a preset (`ek[scenePresetId]`; "minimum panels" only in developer mode). */
export function presetControls(kind: DirectionKind, preset: V5DirectionPreset | null | undefined, developerMode: boolean): V5DirectionControl[] {
  if (kind !== "analysis" || !preset?.scenePresetId) return [];
  return (V5_SCENE_CONTROLS[preset.scenePresetId] ?? []).filter((control) => developerMode || control.id !== "minimum-panels");
}

function valueOption(control: V5DirectionControl, value: unknown) {
  return control.valueOptions?.find((option) => option.value === value);
}

/** `Sj`: enabled flag (+ value for numeric controls) of a control under `overrides`. */
export function controlState(control: V5DirectionControl, overrides: V5ControlOverrides | undefined): { enabled: boolean; value?: number } {
  const raw = overrides?.[control.ref];
  if (control.valueOptions?.length) {
    const value = valueOption(control, raw)?.value ?? control.defaultValue ?? control.valueOptions[0]?.value;
    return { enabled: typeof raw === "number" || raw === true || (raw === undefined && control.defaultEnabled), ...(value !== undefined ? { value } : {}) };
  }
  return { enabled: typeof raw === "boolean" ? raw : control.defaultEnabled };
}

function cleanOverrides(overrides: V5ControlOverrides | undefined): V5ControlOverrides {
  return { ...(overrides ?? {}) };
}
function finish(overrides: V5ControlOverrides): V5ControlOverrides | undefined {
  return Object.keys(overrides).length ? overrides : undefined;
}

/** `XV`: set a control on/off. */
export function setControlEnabled(overrides: V5ControlOverrides | undefined, ref: string, enabled: boolean): V5ControlOverrides | undefined {
  const control = controlsByRef.get(ref);
  if (!control) return finish(cleanOverrides(overrides));
  const next = cleanOverrides(overrides);
  if (control.valueOptions?.length) {
    if (enabled) {
      const value = controlState(control, overrides).value;
      if (control.defaultEnabled && value === control.defaultValue) delete next[ref];
      else if (value !== undefined) next[ref] = value;
    } else if (control.defaultEnabled) next[ref] = false;
    else delete next[ref];
  } else if (enabled === control.defaultEnabled) delete next[ref];
  else next[ref] = enabled;
  return finish(next);
}

/** `WV`: set the value of a numeric control. */
export function setControlValue(overrides: V5ControlOverrides | undefined, ref: string, value: number): V5ControlOverrides | undefined {
  const control = controlsByRef.get(ref);
  if (!control?.valueOptions?.length || !valueOption(control, value)) return finish(cleanOverrides(overrides));
  const next = cleanOverrides(overrides);
  if (control.defaultEnabled && value === control.defaultValue) delete next[ref];
  else next[ref] = value;
  return finish(next);
}

/** Applies overrides to a preset (drops the key when empty). */
export function withOverrides(preset: V5DirectionPreset, overrides: V5ControlOverrides | undefined): V5DirectionPreset {
  const { controlOverrides: _drop, ...rest } = preset;
  return overrides ? { ...rest, controlOverrides: overrides } : rest;
}

/** Toggles a size candidate (`U` in `Nwe`; empty -> [5]). */
export function toggleSizeCandidate(current: readonly number[] | undefined, id: number, checked: boolean): number[] {
  const base = current ?? V5_ANALYZER_SIZE_IDS;
  const next = checked ? SIZE_CANDIDATES.map((size) => size.id as number).filter((size) => size === id || base.includes(size)) : base.filter((size) => size !== id);
  return next.length ? next : [LAST_SIZE_FALLBACK];
}

/** New draft preset (`ee` in `Nwe`). */
export function newPresetDraft(kind: DirectionKind, settingKey: "scene" | "imageRatio", uuid: string = randomId()): V5DirectionPreset {
  return {
    id: `${settingKey}-${uuid}`,
    name: ANALYSIS_LABELS.newPreset,
    instruction: "",
    ...(kind === "aspect-ratio" ? { allowedSizeIds: [...V5_ANALYZER_SIZE_IDS] } : {})
  };
}

/** Saves a draft (`z` in `Nwe`): replace or append, then select it. */
export function commitPresetDraft(kind: DirectionKind, setting: V5DirectionSetting, draft: V5DirectionPreset): V5DirectionSetting {
  const name = draft.name.trim();
  const text = (kind === "analysis" ? draft.customInstruction?.text : draft.instruction)?.replace(/\r\n?/gu, "\n").trim() ?? "";
  const preset: V5DirectionPreset = { ...draft, name, ...(kind === "analysis" ? { customInstruction: { enabled: !!text, text } } : { instruction: text }) };
  const exists = setting.presets.some((p) => p.id === preset.id);
  const presets = exists ? setting.presets.map((p) => (p.id === preset.id ? preset : p)) : [...setting.presets, preset];
  return selectPreset({ presets }, preset.id);
}

/** Removes a preset and selects the first remaining one (`me` in `Nwe`). */
export function removePreset(setting: V5DirectionSetting, presetId: string): V5DirectionSetting {
  const presets = setting.presets.filter((preset) => preset.id !== presetId);
  return selectPreset({ presets }, presets[0]?.id);
}

/** Stores a custom instruction on the selected built-in preset (`B` in `Nwe`). */
export function setCustomInstruction(setting: V5DirectionSetting, presetId: string, text: string): V5DirectionSetting {
  const clean = text.replace(/\r\n?/gu, "\n").trim();
  return selectPreset({ presets: setting.presets.map((p) => (p.id === presetId ? { ...p, customInstruction: { enabled: !!clean, text: clean } } : p)) }, presetId);
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}


/**
 * Patch form of a direction setting for `config.update` (deep merge, keys cannot be deleted):
 * `presetId` is "" when the selected preset has no scene id, and `controlOverrides` lists every scene control
 * explicitly so a stale stored override cannot survive the merge.
 */
export function directionPatch(setting: V5DirectionSetting): V5DirectionSetting {
  const selected = selectedPreset(setting);
  const controls: V5ControlOverrides = {};
  for (const list of Object.values(V5_SCENE_CONTROLS)) {
    for (const control of list) {
      const state = controlState(control, selected?.controlOverrides);
      controls[control.ref] = control.valueOptions?.length ? (state.enabled ? state.value ?? true : false) : state.enabled;
    }
  }
  return {
    mode: "preset",
    selectedPresetId: selected?.id ?? "",
    presets: setting.presets,
    presetId: selected?.scenePresetId ?? "",
    controlOverrides: controls,
    customText: selected?.instruction ?? ""
  };
}
