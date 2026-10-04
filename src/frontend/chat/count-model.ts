/**
 * Pure logic of the generation-count panel (Asset Maid `kCt` 177146-177254 + store `kSt` 157923,
 * spec/ui.md §6.2): view state and action -> next ChatImageGenerationSettings.
 */
import {
  countRange,
  fixedCountPolicy,
  MAX_IMAGE_COUNT,
  normalizeCountPolicy,
  UNLIMITED_IMAGE_COUNT
} from "../../shared/contract/chat.js";
import { maxSplitBatchSize, SPLIT_ANALYSIS_MAX_TOTAL, type ChatImageGenerationSettings } from "../../shared/contract/config.js";

export type CountMode = "fixed" | "range" | "split";

export const COUNT_ACTIONS = [
  "toggle-auto",
  "select-fixed",
  "select-range",
  "select-split",
  "fixed-decrement",
  "fixed-increment",
  "min-decrement",
  "min-increment",
  "max-decrement",
  "max-increment",
  "total-decrement",
  "total-increment",
  "batch-decrement",
  "batch-increment"
] as const;
export type CountAction = (typeof COUNT_ACTIONS)[number];

export interface CountLimits {
  /** 7, or unlimited in developer mode (AM 180577). */
  maximumCount: number;
  /** Split analysis needs the V5 hybrid analysis profile. */
  splitSupported: boolean;
}

export interface CountView {
  mode: CountMode;
  auto: boolean;
  fixed: number;
  min: number;
  max: number;
  total: number;
  batch: number;
  maximumCount: number;
  splitSupported: boolean;
  /** Bounds per stepper (inclusive). */
  bounds: Record<"fixed" | "min" | "max" | "total" | "batch", { min: number; max: number }>;
}

export function countLimits(developerMode: boolean, analysisProfile: string | undefined): CountLimits {
  return { maximumCount: developerMode ? UNLIMITED_IMAGE_COUNT : MAX_IMAGE_COUNT, splitSupported: !analysisProfile || analysisProfile === "v5-hybrid" };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function countView(settings: ChatImageGenerationSettings, limits: CountLimits): CountView {
  const policy = normalizeCountPolicy(settings.countPolicy, 1, limits.maximumCount);
  const values = policy.values ?? { fixed: policy.max, min: policy.min, max: policy.max };
  const mode: CountMode = settings.analysisMode === "split" && limits.splitSupported ? "split" : policy.mode;
  const totalCap = SPLIT_ANALYSIS_MAX_TOTAL;
  const total = clamp(settings.splitAnalysis.totalCount ?? Math.min(limits.maximumCount, policy.max), 1, totalCap);
  const batchCap = maxSplitBatchSize(total);
  return {
    mode,
    auto: settings.autoGenerationEnabled,
    fixed: values.fixed,
    min: values.min,
    max: values.max,
    total,
    batch: clamp(settings.splitAnalysis.batchSize, 1, batchCap),
    maximumCount: limits.maximumCount,
    splitSupported: limits.splitSupported,
    bounds: {
      fixed: { min: 1, max: limits.maximumCount },
      min: { min: 1, max: Math.max(1, values.max - 1) },
      max: { min: values.min + 1, max: Math.max(values.min + 1, limits.maximumCount) },
      total: { min: 1, max: totalCap },
      batch: { min: 1, max: batchCap }
    }
  };
}

/** Text on the collapsed toggle: "N", "min–max" or the split total. */
export function countToggleText(view: CountView): string {
  if (view.mode === "range") return `${view.min}–${view.max}`;
  if (view.mode === "split") return String(view.total);
  return String(view.fixed);
}

function withPolicy(settings: ChatImageGenerationSettings, mode: "fixed" | "range", values: { fixed: number; min: number; max: number }, limit: number): ChatImageGenerationSettings {
  const range = countRange(values.min, values.max, 1, 2, limit);
  const policy = mode === "fixed"
    ? { ...fixedCountPolicy(values.fixed, limit), values: { fixed: clamp(values.fixed, 1, limit), ...range } }
    : normalizeCountPolicy({ mode: "range", values: { fixed: values.fixed, ...range } }, 1, limit);
  // AM `setCountPolicy` always switches back to single analysis.
  return { ...settings, countPolicy: policy, analysisMode: "single" };
}

/** Applies one panel action. Returns null when the action does nothing (at a bound, unsupported). */
export function applyCountAction(settings: ChatImageGenerationSettings, action: CountAction, limits: CountLimits): ChatImageGenerationSettings | null {
  const view = countView(settings, limits);
  const limit = limits.maximumCount;
  const values = { fixed: view.fixed, min: view.min, max: view.max };
  const step = (key: keyof CountView["bounds"], delta: number): number | null => {
    const current = view[key];
    const bounds = view.bounds[key];
    const next = clamp(current + delta, bounds.min, bounds.max);
    return next === current ? null : next;
  };
  switch (action) {
    case "toggle-auto":
      return { ...settings, autoGenerationEnabled: !settings.autoGenerationEnabled };
    case "select-fixed":
      return view.mode === "fixed" ? null : withPolicy(settings, "fixed", values, limit);
    case "select-range":
      return view.mode === "range" ? null : withPolicy(settings, "range", values, limit);
    case "select-split": {
      if (!limits.splitSupported || view.mode === "split") return null;
      const total = view.total;
      return { ...settings, analysisMode: "split", splitAnalysis: { totalCount: total, batchSize: clamp(settings.splitAnalysis.batchSize, 1, maxSplitBatchSize(total)) } };
    }
    case "fixed-decrement":
    case "fixed-increment": {
      const next = step("fixed", action === "fixed-increment" ? 1 : -1);
      return next === null ? null : withPolicy(settings, "fixed", { ...values, fixed: next }, limit);
    }
    case "min-decrement":
    case "min-increment": {
      const next = step("min", action === "min-increment" ? 1 : -1);
      return next === null ? null : withPolicy(settings, "range", { ...values, min: next }, limit);
    }
    case "max-decrement":
    case "max-increment": {
      const next = step("max", action === "max-increment" ? 1 : -1);
      return next === null ? null : withPolicy(settings, "range", { ...values, max: next }, limit);
    }
    case "total-decrement":
    case "total-increment": {
      const next = step("total", action === "total-increment" ? 1 : -1);
      if (next === null) return null;
      return { ...settings, analysisMode: "split", splitAnalysis: { totalCount: next, batchSize: clamp(view.batch, 1, maxSplitBatchSize(next)) } };
    }
    case "batch-decrement":
    case "batch-increment": {
      const next = step("batch", action === "batch-increment" ? 1 : -1);
      if (next === null) return null;
      return { ...settings, analysisMode: "split", splitAnalysis: { totalCount: view.total, batchSize: next } };
    }
    default:
      return null;
  }
}

/** Floating position (normalized 0..1) -> CSS custom properties (AM `OIe` 176544). */
export function floatingStyle(position: { x: number; y: number } | null): Record<string, string> {
  if (!position) {
    return { "--ii-am-floating-left": "max(8px, calc(100vw - 62px))", "--ii-am-floating-top": "max(8px, calc(100vh - 110px))", "--ii-am-floating-panel-top": "calc(var(--ii-am-floating-top) - 56px)" };
  }
  const x = Math.min(1, Math.max(0, position.x));
  const y = Math.min(1, Math.max(0, position.y));
  return {
    "--ii-am-floating-left": `clamp(8px, calc(${(x * 100).toFixed(3)}vw - 22px), calc(100vw - 52px))`,
    "--ii-am-floating-top": `clamp(8px, calc(${(y * 100).toFixed(3)}vh - 22px), calc(100vh - 52px))`,
    "--ii-am-floating-panel-top": y >= 0.5 ? "calc(var(--ii-am-floating-top) - 56px)" : "calc(var(--ii-am-floating-top) + 52px)"
  };
}

/** Pointer position -> normalized floating position. */
export function normalizeFloatingPoint(clientX: number, clientY: number, width: number, height: number): { x: number; y: number } {
  const round = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
  return { x: round(width > 0 ? clientX / width : 1), y: round(height > 0 ? clientY / height : 1) };
}
