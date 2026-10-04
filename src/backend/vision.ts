/**
 * Generic vision helpers for LLM connection profiles (salvaged from the
 * retired avatar-vision enrichment): capability detection from connection
 * metadata, error classification for "this model takes no images", and the
 * multimodal user message shape that Lumiverse `generate.raw` accepts.
 */
import type { LlmImagePart, LlmMessage } from "./llm-client.js";
import { asRecord, cleanArray, cleanString } from "./utils.js";

function explicitBoolean(root: unknown, keys: string[]): boolean | null {
  const record = asRecord(root);
  for (const key of keys) {
    if (typeof record[key] === "boolean") return record[key] as boolean;
  }
  return null;
}

/**
 * Reads explicit vision capability from connection metadata.
 * Returns true/false when declared, null when unknown (then try and classify the error).
 */
export function declaredVisionSupport(metadata: unknown): boolean | null {
  const record = asRecord(metadata);
  const direct = explicitBoolean(record, ["vision", "supportsVision", "supports_vision", "multimodal", "supportsImages", "supports_images"]);
  if (direct !== null) return direct;
  const capabilities = asRecord(record.capabilities);
  const nested = explicitBoolean(capabilities, ["vision", "image", "images", "multimodal"]);
  if (nested !== null) return nested;
  const modalities = [record.input_modalities, record.inputModalities, capabilities.input_modalities, capabilities.inputModalities]
    .flatMap((value) => cleanArray<unknown>(value).map((item) => cleanString(item).toLowerCase()));
  if (modalities.includes("image") || modalities.includes("vision")) return true;
  if (modalities.length > 0 && modalities.every((value) => value === "text")) return false;
  return null;
}

/** True when a provider error means "images are not accepted" (so a text-only fallback makes sense). */
export function unsupportedVisionError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return /(?:image|vision|multimodal).*(?:unsupported|not supported|not allowed|invalid)|(?:unsupported|invalid|does not support|doesn't support).*(?:image|vision|content.*array|input modality)|text[- ]only/.test(message);
}

/** One user message with a text part followed by image parts (base64 without the data: prefix). */
export function visionUserMessage(text: string, images: Array<{ data: string; mimeType: string }>): LlmMessage {
  const parts: LlmImagePart[] = images.map((image) => ({ type: "image", data: image.data, mime_type: image.mimeType }));
  return { role: "user", content: [{ type: "text", text }, ...parts] };
}
