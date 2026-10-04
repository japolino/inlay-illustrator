/**
 * Provider-specific reference-image parameters for Lumiverse image generation.
 *
 * Salvaged from the retired Lightboard pipeline (src/backend/v453/references.ts).
 * These helpers are provider plumbing only: they know how the Lumiverse host
 * expects reference/source images for NovelAI, ComfyUI and SwarmUI, but nothing
 * about how the references are chosen.
 *
 * - NovelAI: `resolvedReferenceImages` (director / character reference, V4.5).
 * - ComfyUI: `resolvedSourceImages` plus a `denoise` value, mirrored into
 *   `comfyui_field_values` because the host ignores a bare `denoise` without
 *   an `init_image` mapping. A workflow without an `init_image` mapping cannot
 *   take a reference.
 * - SwarmUI: `resolvedSourceImages`.
 */
import { isNovelAiConnection } from "../shared/config.js";
import { readComfyConfig } from "./images.js";
import type { ImageConnection } from "./types.js";

/** One reference image as raw base64 (no data: prefix). */
export type ReferenceImage = {
  data: string;
  mimeType: string;
};

export type ReferenceOptions = {
  /** Master switch. When false, providers receive an explicit "no reference" value. */
  enabled: boolean;
  /** 0..1. NovelAI reference strength, ComfyUI denoise. Zero disables the reference. */
  strength: number;
  /** NovelAI `infoExtracted` (default 1). */
  informationExtracted?: number;
  /** NovelAI `refType` (default "character"). */
  referenceType?: string;
  /** ComfyUI workflow id from the image parameters (`workflow_id` / `workflowId`). */
  workflowId?: unknown;
};

/** Largest base64 payload we accept for a single reference (about 21 MB decoded). */
export const MAX_REFERENCE_BASE64_LENGTH = 28_000_000;

/** Parses `data:image/(png|jpeg|webp);base64,...` into raw base64 and its MIME type. */
export function parseImageDataUrl(value: unknown): ReferenceImage | null {
  if (typeof value !== "string") return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2]!.length > MAX_REFERENCE_BASE64_LENGTH) return null;
  return { mimeType: match[1]!, data: match[2]! };
}

function clampStrength(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** True when the selected ComfyUI workflow maps the given field kinds. */
export function comfyWorkflowMaps(connection: ImageConnection | null, workflowId: unknown, fields: string[]): boolean {
  const workflow = readComfyConfig(connection?.metadata, workflowId);
  return fields.every((field) => workflow?.field_mappings?.some((mapping) => mapping.mappedAs === field) === true);
}

/**
 * Returns the parameter patch that attaches (or explicitly clears) reference
 * images for the connection's provider. Unknown providers get `{}`.
 *
 * Throws when references are enabled for a ComfyUI workflow that cannot take
 * a source image, so the caller fails before any paid request.
 */
export function referenceParameters(
  connection: ImageConnection | null,
  images: ReferenceImage[],
  options: ReferenceOptions
): Record<string, unknown> {
  const strength = clampStrength(options.strength);
  const enabled = options.enabled && strength > 0 && images.length > 0;
  if (isNovelAiConnection(connection)) {
    return {
      resolvedReferenceImages: enabled
        ? images.map((image) => ({
          data: image.data,
          strength,
          infoExtracted: options.informationExtracted ?? 1,
          refType: options.referenceType ?? "character"
        }))
        : [],
      resolvedSourceImages: []
    };
  }
  if (connection?.provider === "comfyui") {
    if (!comfyWorkflowMaps(connection, options.workflowId, ["init_image"])) {
      if (enabled) throw new Error("Reference images need a ComfyUI workflow with an init_image mapping.");
      return {};
    }
    const denoise = enabled ? strength : 0;
    return {
      resolvedSourceImages: enabled ? images.map((image) => ({ data: image.data, mimeType: image.mimeType })) : [],
      resolvedReferenceImages: [],
      denoise,
      comfyui_field_values: { denoise }
    };
  }
  if (connection?.provider === "swarmui") {
    return { resolvedSourceImages: enabled ? images.map((image) => ({ data: image.data, mimeType: image.mimeType })) : [] };
  }
  return {};
}

/**
 * Merges a reference patch into request parameters. `comfyui_field_values`
 * is merged key by key so earlier field values (width, steps, ...) survive.
 */
export function mergeReferenceParameters(
  parameters: Record<string, unknown> | undefined,
  reference: Record<string, unknown>
): Record<string, unknown> {
  const base = parameters ?? {};
  const merged: Record<string, unknown> = { ...base, ...reference };
  if (reference.comfyui_field_values && typeof reference.comfyui_field_values === "object") {
    merged.comfyui_field_values = {
      ...((base.comfyui_field_values as Record<string, unknown> | undefined) ?? {}),
      ...(reference.comfyui_field_values as Record<string, unknown>)
    };
  }
  return merged;
}

/**
 * For a ComfyUI connection with a host-side workflow mapping, drop any inline
 * workflow graph so the host performs its own upload-and-map step (which is
 * what consumes `resolvedSourceImages` and `comfyui_field_values`).
 */
export function hostWorkflowParameters(
  parameters: Record<string, unknown>,
  connection: ImageConnection | null
): Record<string, unknown> {
  if (connection?.provider !== "comfyui" || !readComfyConfig(connection.metadata, parameters.workflow_id ?? parameters.workflowId)) {
    return parameters;
  }
  const { workflow: _workflow, workflowFormat: _format, preserveImportedWorkflow: _preserve, ...mapped } = parameters;
  return mapped;
}

/**
 * Lumiverse supports positive per-character prompts (`characterTags`) but only
 * one shared negative caption. Fold unique per-character negatives into the
 * shared negative so none of them is silently dropped.
 */
export function sharedNegativeWithCharacterNegatives(
  negative: string,
  characters: Array<{ negative?: string }> | undefined
): string {
  const extra = [...new Set((characters ?? []).map((character) => (character.negative ?? "").trim()).filter(Boolean))];
  return [negative.trim(), ...extra].filter(Boolean).join(", ");
}

/** Host `characterTags` payload for NovelAI per-character positive prompts. */
export function characterTagsParameter(characters: Array<{ prompt: string }> | undefined): Array<{ tags: string }> {
  return (characters ?? []).map((character) => ({ tags: character.prompt }));
}
