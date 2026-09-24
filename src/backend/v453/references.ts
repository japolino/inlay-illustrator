import { isNovelAiConnection, type Config } from "../../shared/config.js";
import { buildImageParameters, readComfyConfig } from "../images.js";
import { throwIfAborted } from "../operation-manager.js";
import { writeJson } from "../storage.js";
import type { ImageConnection } from "../types.js";
import type { V376Shot } from "../v376/types.js";
import { compileLightboardDescriptor, descriptorCharacters } from "./prompt.js";
import type { LightboardCharacter } from "./types.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;
type Request = Parameters<typeof spindle.imageGen.generate>[0];
interface Snapshot { data: string; mimeType: string; name: string; imageId: string; createdAt: string }
const pending = new Map<string, Promise<Snapshot>>();

export function parseSnapshotData(value: unknown): Pick<Snapshot, "data" | "mimeType"> | null {
  if (typeof value !== "string") return null;
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  return m && m[2]!.length <= 28_000_000 ? { mimeType: m[1]!, data: m[2]! } : null;
}

export function referenceParameters(connection: ImageConnection | null, snapshots: Snapshot[], config: Config): Record<string, unknown> {
  const enabled = config.referenceSnapshots && config.referenceStrength > 0 && snapshots.length > 0;
  if (isNovelAiConnection(connection)) return { resolvedReferenceImages: enabled ? snapshots.map(s => ({
    data: s.data, strength: config.referenceStrength, infoExtracted: 1, refType: "character"
  })) : [], resolvedSourceImages: [] };
  if (connection?.provider === "comfyui") {
    const workflow = readComfyConfig(connection.metadata, config.imageParameters.workflow_id ?? config.imageParameters.workflowId);
    const hasSource = workflow?.field_mappings?.some(m => m.mappedAs === "init_image");
    if (!hasSource) {
      if (enabled) throw new Error("Reference snapshots need a ComfyUI workflow with an init_image mapping.");
      return {};
    }
    return {
    resolvedSourceImages: enabled ? snapshots.map(s => ({ data: s.data, mimeType: s.mimeType })) : [],
    resolvedReferenceImages: [],
    // Matches cue-living-novel's reference-conditioned workflow convention.
    // Forward through field values too: the host otherwise ignores denoise without init_image.
    denoise: enabled ? config.referenceStrength : 0,
    comfyui_field_values: { denoise: enabled ? config.referenceStrength : 0 }
  };
  }
  if (connection?.provider === "swarmui") return { resolvedSourceImages: enabled ? snapshots.map(s => ({ data: s.data, mimeType: s.mimeType })) : [] };
  return {};
}

function hostWorkflowParameters(parameters: Record<string, unknown>, connection: ImageConnection | null): Record<string, unknown> {
  if (connection?.provider !== "comfyui" || !readComfyConfig(connection.metadata, parameters.workflow_id ?? parameters.workflowId)) return parameters;
  // A supplied graph bypasses Lumiverse's upload-and-map step. Send the
  // selected workflow ID and field values so the host performs that step.
  const { workflow, workflowFormat, preserveImportedWorkflow, ...mapped } = parameters;
  return mapped;
}

function providerPromptConfig(config: Config, connection: ImageConnection): Config {
  if (!isNovelAiConnection(connection)) return config;
  const model = config.imageModel || connection.model || "";
  const structured = /^nai-diffusion-[45]/.test(model);
  return { ...config, promptSyntax: "nai", promptSeparator: structured ? "native" : "pipe" };
}

async function snapshotFor(characters: LightboardCharacter[], config: Config, connection: ImageConnection, chatId: string, userId?: string, signal?: AbortSignal): Promise<Snapshot> {
  const name = characters.map(c => c.name.trim()).sort().join(" + ");
  const identity = JSON.stringify([chatId, connection.id, config.imageModel || connection.model,
    config.imageParameters.workflow_id ?? config.imageParameters.workflowId ?? "", name.toLocaleLowerCase(), connection.metadata,
    config.promptPresets.find(p => p.id === config.activePromptPresetId) ?? null,
    config.customPositivePrefix, config.customPositiveSuffix, config.customNegative, config.referenceRevision]);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity))))
    .map(b => b.toString(16).padStart(2, "0")).join("");
  const path = `snapshots/${hash}.json`;
  const key = `${userId ?? ""}:${path}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const work = (async () => {
    const stored = typeof spindle.userStorage.getJson === "function"
      ? await spindle.userStorage.getJson<Snapshot | null>(path, { fallback: null, userId })
      : await spindle.userStorage.exists(path, userId) ? JSON.parse(await spindle.userStorage.read(path, userId)) as Snapshot : null;
    if (stored && parseSnapshotData(`data:${stored.mimeType};base64,${stored.data}`)) return stored;
    throwIfAborted(signal);
    const portrait = compileLightboardDescriptor({ slot: 0, cast: characters.length === 1 ? "solo" : `${characters.length} distinct characters, character reference sheet`, camera: "straight-on, full body",
      scene: "plain neutral background, even studio lighting, character reference portrait, neutral standing pose",
      characters: characters.map(character => ({ ...character, description: "A standalone character reference portrait. Neutral expression, relaxed arms, unobstructed face and clothing. No scene action, props, or lettering." }))
    }, providerPromptConfig(config, connection), 1);
    const negative = [portrait.negative, ...new Set((portrait.nativeCharacters ?? []).map(c => c.negative).filter(Boolean))].filter(Boolean).join(", ");
    const parameters = await buildImageParameters(config, connection, portrait.prompt, negative, portrait.nativeCharacters);
    const disabled = referenceParameters(connection, [], config);
    if (disabled.comfyui_field_values) disabled.comfyui_field_values = {
      ...(parameters.comfyui_field_values as Record<string, unknown> ?? {}),
      ...(disabled.comfyui_field_values as Record<string, unknown>)
    };
    throwIfAborted(signal);
    const result = await spindle.imageGen.generate({ connection_id: connection.id, prompt: portrait.prompt,
      negativePrompt: negative, model: config.imageModel || undefined,
      parameters: hostWorkflowParameters({ ...parameters, ...disabled }, connection), owner_chat_id: chatId, userId, includeDataUrl: true });
    throwIfAborted(signal);
    const image = parseSnapshotData(result.imageDataUrl);
    if (!image || !result.imageId) throw new Error(`Could not capture a reference snapshot for ${name}. The host must return imageDataUrl.`);
    const snapshot: Snapshot = { ...image, name, imageId: result.imageId, createdAt: new Date().toISOString() };
    await writeJson(path, snapshot, userId);
    return snapshot;
  })();
  pending.set(key, work);
  try { return await work; } finally { if (pending.get(key) === work) pending.delete(key); }
}

/** Snapshot jobs never enter generated records or chat markup. */
export async function generateWithSnapshots(request: Request, rawShot: unknown, config: Config, connection: ImageConnection | null, signal?: AbortSignal) {
  throwIfAborted(signal);
  const descriptor = (rawShot as V376Shot | undefined)?.lightboard;
  const characters = descriptor ? [...new Map(descriptorCharacters(descriptor).filter(c => c.name.trim()).map(c => [c.name.trim().toLocaleLowerCase(), c])).values()] : [];
  const supported = isNovelAiConnection(connection) || connection?.provider === "comfyui" || connection?.provider === "swarmui";
  const snapshots: Snapshot[] = [];
  if (connection?.provider === "comfyui" && config.referenceSnapshots && config.referenceStrength > 0 && characters.length) {
    const workflow = readComfyConfig(connection.metadata, config.imageParameters.workflow_id ?? config.imageParameters.workflowId);
    if (!["init_image", "denoise"].every(field => workflow?.field_mappings?.some(m => m.mappedAs === field))) throw new Error("Reference snapshots need a ComfyUI workflow with init_image and denoise mappings.");
  }
  if (isNovelAiConnection(connection) && descriptor) {
    const native = compileLightboardDescriptor(descriptor, providerPromptConfig(config, connection!), 1, (rawShot as V376Shot).lightboardTitle);
    // Current Lumiverse supports positive characterTags, but a shared negative
    // caption only. Keep all negatives effective instead of silently dropping them.
    const negative = [native.negative, ...new Set((native.nativeCharacters ?? []).map(c => c.negative).filter(Boolean))].filter(Boolean).join(", ");
    request = { ...request, prompt: native.prompt, negativePrompt: negative,
      parameters: { ...request.parameters, negativePrompt: negative,
        characterTags: (native.nativeCharacters ?? []).map(c => ({ tags: c.prompt })) } };
  }
  if (supported && connection && config.referenceSnapshots && config.referenceStrength > 0) {
    const groups = isNovelAiConnection(connection) ? characters.map(c => [c]) : characters.length ? [characters] : [];
    // ComfyUI takes one source image, so multi-character scenes get their own
    // dedicated cast reference sheet instead of silently dropping identities.
    for (const group of groups) {
      throwIfAborted(signal);
      snapshots.push(await snapshotFor(group, config, connection, String(request.owner_chat_id ?? ""), request.userId, signal));
    }
  }
  const reference = referenceParameters(connection, snapshots, config);
  const parameters = { ...request.parameters, ...reference,
    ...(reference.comfyui_field_values ? { comfyui_field_values: {
      ...(request.parameters?.comfyui_field_values as Record<string, unknown> ?? {}),
      ...(reference.comfyui_field_values as Record<string, unknown>)
    } } : {}) };
  throwIfAborted(signal);
  const result = await spindle.imageGen.generate({ ...request, connection_id: connection?.id || request.connection_id, parameters: hostWorkflowParameters(parameters, connection) });
  throwIfAborted(signal);
  return result;
}
