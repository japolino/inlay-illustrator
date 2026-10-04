/**
 * Pure helpers of the system page: custom resolutions (`U0t` 142657, `UW`, `nEe` 21356) and the chat image
 * generation settings card (count policy `qf`/`Gf`, split analysis `T2`).
 */
import {
  IMAGE_SIZE_PRESETS,
  SPLIT_ANALYSIS_MAX_TOTAL,
  maxSplitBatchSize,
  normalizeChatImageGenerationSettings,
  validateImageSize,
  type ChatImageGenerationSettings,
  type CustomImageSize
} from "../../../shared/contract/config.js";
import { MAX_IMAGE_COUNT, UNLIMITED_IMAGE_COUNT, countPolicyValues, fixedCountPolicy, normalizeCountPolicy } from "../../../shared/contract/chat.js";
import { SYSTEM_LABELS } from "./labels.js";

export interface CustomSizeDraft { id: number; width: string; height: string }

/** `nEe`: random custom size id >= 1e9. */
export function newCustomSizeId(random: () => number = Math.random): number {
  return 1e9 + Math.floor(random() * 1e9);
}

/** Saves a draft row (`s` in `U0t`): validate, round to multiples of 64, reject duplicates (built-in or custom). */
export function saveCustomSize(sizes: readonly CustomImageSize[], draft: CustomSizeDraft): { sizes: CustomImageSize[] } | { error: string } {
  const width = Number(draft.width);
  const height = Number(draft.height);
  if (draft.width.trim() === "" || draft.height.trim() === "" || validateImageSize(width, height)) return { error: SYSTEM_LABELS.sizeInvalid };
  const w = Math.round(width / 64) * 64;
  const h = Math.round(height / 64) * 64;
  const taken = [...IMAGE_SIZE_PRESETS.map((p) => ({ id: p.id, width: p.width, height: p.height })), ...sizes];
  if (taken.some((s) => s.id !== draft.id && s.width === w && s.height === h)) return { error: SYSTEM_LABELS.sizeDuplicate };
  const next = { id: draft.id, width: w, height: h };
  return { sizes: sizes.some((s) => s.id === draft.id) ? sizes.map((s) => (s.id === draft.id ? next : s)) : [...sizes, next] };
}

/** Count limit of the chat image settings (7, unlimited in developer mode). */
export function countLimit(developerMode: boolean): number {
  return developerMode ? UNLIMITED_IMAGE_COUNT : MAX_IMAGE_COUNT;
}

function finish(settings: ChatImageGenerationSettings, limit: number): ChatImageGenerationSettings {
  return normalizeChatImageGenerationSettings(settings, settings, limit);
}

export function setCountMode(settings: ChatImageGenerationSettings, mode: "fixed" | "range", limit: number): ChatImageGenerationSettings {
  const values = countPolicyValues(settings.countPolicy, limit);
  return finish({ ...settings, countPolicy: normalizeCountPolicy({ mode, values }, settings.countPolicy, limit) }, limit);
}

export function setFixedCount(settings: ChatImageGenerationSettings, count: number, limit: number): ChatImageGenerationSettings {
  const values = countPolicyValues(settings.countPolicy, limit);
  const fixed = fixedCountPolicy(count, limit);
  return finish({ ...settings, countPolicy: { ...fixed, values: { ...values, fixed: fixed.max } } }, limit);
}

export function setCountRange(settings: ChatImageGenerationSettings, min: number, max: number, limit: number): ChatImageGenerationSettings {
  const values = countPolicyValues(settings.countPolicy, limit);
  return finish({ ...settings, countPolicy: normalizeCountPolicy({ mode: "range", values: { fixed: values.fixed, min, max } }, settings.countPolicy, limit) }, limit);
}

export function setAnalysisMode(settings: ChatImageGenerationSettings, mode: "single" | "split", limit: number): ChatImageGenerationSettings {
  if (mode === "single") return finish({ ...settings, analysisMode: "single" }, limit);
  const total = settings.splitAnalysis.totalCount ?? Math.max(2, settings.countPolicy.max);
  return finish({ ...settings, analysisMode: "split", splitAnalysis: { totalCount: total, batchSize: Math.min(settings.splitAnalysis.batchSize, maxSplitBatchSize(total)) } }, limit);
}

export function setSplitTotal(settings: ChatImageGenerationSettings, total: number, limit: number): ChatImageGenerationSettings {
  const clamped = Math.min(SPLIT_ANALYSIS_MAX_TOTAL, Math.max(1, Math.round(total)));
  return finish({ ...settings, splitAnalysis: { totalCount: clamped, batchSize: Math.min(settings.splitAnalysis.batchSize, maxSplitBatchSize(clamped)) } }, limit);
}

export function setSplitBatch(settings: ChatImageGenerationSettings, batch: number, limit: number): ChatImageGenerationSettings {
  const total = settings.splitAnalysis.totalCount;
  const max = total === null ? 7 : maxSplitBatchSize(total);
  return finish({ ...settings, splitAnalysis: { totalCount: total, batchSize: Math.min(max, Math.max(1, Math.round(batch))) } }, limit);
}
