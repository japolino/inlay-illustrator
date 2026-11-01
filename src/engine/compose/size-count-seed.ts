/**
 * Image size selection, image count policy and seed policy (spec/pipeline.md §3.6 and §3.10, spec/novelai.md §9 E).
 */
import {
  resolveImageSize as coreResolveSize,
  normalizeImageCountPolicy as coreNormalizeCount,
  resolveImageCountConstraint as coreResolveCount,
  createSeedResolver as coreSeedResolver,
  randomSeed as coreRandomSeed,
  hht as coreBuiltInSize,
  Wi as coreNormalizeSeed,
  NOVELAI_DEFAULTS,
} from "../core/asset-maid-core";
import type { ImageCountConstraint, ImageCountPolicy, ImageSize } from "./types";

/** The 5 built-in size presets (`Ns.IMAGE_SIZE_PRESETS`): 1 832×1216, 2 1216×832, 3 896×1152, 4 1152×896, 5 1024×1024. */
export const IMAGE_SIZE_PRESETS = (NOVELAI_DEFAULTS as { IMAGE_SIZE_PRESETS: readonly ImageSize[] }).IMAGE_SIZE_PRESETS;
/** Default size preset id (1). */
export const DEFAULT_IMAGE_SIZE_PRESET_ID = (NOVELAI_DEFAULTS as { DEFAULT_IMAGE_SIZE_PRESET_ID: number }).DEFAULT_IMAGE_SIZE_PRESET_ID;

/** Built-in preset or custom size (`runtime.customImageSizes`) by id. Original: `aC` @2508. */
export function resolveImageSize(sizeId: unknown, customSizes: readonly ImageSize[] = []): ImageSize | undefined {
  return coreResolveSize(sizeId, customSizes as never) as ImageSize | undefined;
}

/** Built-in preset only (the batch executor's `requestedSizeId` fallback). Original: `hht` @158104. */
export function resolveBuiltInImageSize(sizeId: unknown): ImageSize | undefined {
  return coreBuiltInSize(sizeId) as ImageSize | undefined;
}

/**
 * Normalize a count policy (number/string = fixed; object with mode fixed|range, values, legacy keys).
 * Range with min == max bumps max by 1. Original: `Uf` @4689.
 */
export function normalizeImageCountPolicy(value: unknown, fallback: unknown = 1, maxCount: number = Number.MAX_SAFE_INTEGER): ImageCountPolicy {
  return coreNormalizeCount(value, fallback as never, maxCount) as ImageCountPolicy;
}

/** Clamp a policy to the number of slots: `{fixed,0,0}` for 0 slots. Original: `$Ae` @4707. */
export function resolveImageCountConstraint(policy: unknown, slotCount: unknown): ImageCountConstraint {
  return coreResolveCount(policy, slotCount) as ImageCountConstraint;
}

/** Seed resolver: the first configured AND fixed seed wins, else a random u32 (not fixed). Original: `Oxe` @157637. */
export function createSeedResolver(random?: () => string | number): {
  resolve(items: ReadonlyArray<{ configuredSeed: unknown; configuredSeedFixed: boolean }>): { seed: string; seedFixed: boolean };
} {
  return coreSeedResolver(...((random ? [random] : []) as [])) as ReturnType<typeof createSeedResolver>;
}

/** Random seed 0..4294967295 (`crypto.getRandomValues` via `amEnv`). Original: `w4` @153339. */
export function randomSeed(): number {
  return coreRandomSeed() as number;
}

/** Seed string normaliser: digits only, clamped to 0..4294967295, else "". Original: `Wi` @7361. */
export function normalizeSeed(value: unknown): string {
  return coreNormalizeSeed(value) as string;
}
