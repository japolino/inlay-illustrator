import { isNovelAiConnection } from "../../shared/config.js";
import type { ImageConnection } from "../types.js";
import type { V376NativeCharacter } from "./types.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

/**
 * Normalized character payload for NovelAI multi-character generation.
 * Reflects V3.7.6 options.characters: [{ prompt, negative }].
 */
export interface NovelAiCharacterPayload {
  prompt: string;
  negative: string;
}

/**
 * Normalizes input character arrays into discrete { prompt, negative } objects.
 * Both positive and negative channels are preserved without silent merging or loss.
 */
export function normalizeCharacterPayload(
  characters: unknown
): NovelAiCharacterPayload[] {
  if (!Array.isArray(characters)) return [];
  const result: NovelAiCharacterPayload[] = [];
  for (const item of characters) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
    const negative = typeof record.negative === "string" ? record.negative.trim() : "";
    if (prompt || negative) {
      result.push({ prompt, negative });
    }
  }
  return result;
}

/**
 * Converts V376NativeCharacter[] into NovelAiCharacterPayload[].
 */
export function nativeCharactersToPayload(
  chars: V376NativeCharacter[] | undefined
): NovelAiCharacterPayload[] {
  if (!chars || !Array.isArray(chars)) return [];
  return chars.map((c) => ({
    prompt: typeof c.prompt === "string" ? c.prompt.trim() : "",
    negative: typeof c.negative === "string" ? c.negative.trim() : ""
  })).filter((c) => c.prompt || c.negative);
}

/**
 * Extracts normalized character payload from parameters dictionary.
 * Checks `characters` first, then `nativeCharacters`.
 */
export function extractCharactersFromParameters(
  parameters: Record<string, unknown> | undefined
): NovelAiCharacterPayload[] {
  if (!parameters || typeof parameters !== "object") return [];
  if (Array.isArray(parameters.characters)) {
    return normalizeCharacterPayload(parameters.characters);
  }
  if (Array.isArray(parameters.nativeCharacters)) {
    return normalizeCharacterPayload(parameters.nativeCharacters);
  }
  return [];
}

/**
 * Host capability inspection result.
 * Documents whether native characters can be verified on the host bridge.
 */
export interface HostCapabilityInspection {
  provider: string;
  isNovelAi: boolean;
  canTransportPayload: boolean;
  hostBridgeVerified: boolean;
  unsupportedReason?: string;
}

/**
 * Evaluates connection capability for NovelAI character transport.
 * Note: Spindle ImageGenRequestDTO transports parameters.characters across the
 * RPC boundary, but lumiverse-spindle-types does not document host-level
 * unpacking into NovelAI V4 characterPrompts.
 */
export function inspectHostCharacterCapability(
  connection: ImageConnection | null
): HostCapabilityInspection {
  const provider = connection?.provider || "(default)";
  const isNAI = isNovelAiConnection(connection);
  if (!isNAI) {
    return {
      provider,
      isNovelAi: false,
      canTransportPayload: false,
      hostBridgeVerified: false,
      unsupportedReason: `Provider "${provider}" is not NovelAI. Native character prompt channels are NovelAI-specific.`
    };
  }
  return {
    provider,
    isNovelAi: true,
    canTransportPayload: true,
    hostBridgeVerified: false,
    unsupportedReason: "Payload transports across Spindle parameters boundary, but host-level NovelAI V4 bridge is not verifiable via spindle-types."
  };
}

/**
 * Read-only check of host provider capabilities via spindle.imageGen.getProviders().
 * Inspects whether the provider exposes any character-related parameters without running paid generation.
 */
export async function queryHostProviderCapabilities(
  providerId: string,
  userId?: string
): Promise<{
  providerFound: boolean;
  parameterKeys: string[];
  hasCharactersSchema: boolean;
  rawSchema?: Record<string, unknown>;
}> {
  try {
    if (typeof spindle !== "undefined" && spindle?.imageGen && typeof spindle.imageGen.getProviders === "function") {
      const providers = await spindle.imageGen.getProviders(userId);
      const matched = providers.find((p) => p.id.toLowerCase() === providerId.toLowerCase());
      if (matched) {
        const parameterKeys = Object.keys(matched.capabilities.parameters || {});
        const hasCharactersSchema = parameterKeys.includes("characters") || parameterKeys.includes("characterPrompts");
        return {
          providerFound: true,
          parameterKeys,
          hasCharactersSchema,
          rawSchema: matched.capabilities.parameters
        };
      }
    }
  } catch {
    // If getProviders fails or spindle is undefined, return default unverified status
  }
  return {
    providerFound: false,
    parameterKeys: [],
    hasCharactersSchema: false
  };
}
