/**
 * One analysis session = the AM dependency graph for one character (AM boot L180596-180714), built from the port services:
 * config store (`N`), source catalog (`F = jnt`), priority assets (`it = wot`), metadata reader (`Oe = Int`),
 * image loader (`$e = aat`), analyzer client (`C`).
 */
import { RpcFailure } from "../../rpc/errors.js";
import type { AmSource, BackendServices, LlmMessage } from "../../services/types.js";
import type { AssetRef, RpcError } from "../../../shared/contract/index.js";
import { AM, amFn } from "../core/index.js";
import { AmConfigStore } from "./config-store.js";
import { createAmPriorityAssets, type AmPriorityAssets } from "./asset-index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export function base64ToBytes(data: string): Uint8Array {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** AM `rI(source, customEntries, "all")` (L93161): the character source with custom characters as virtual members. */
export async function buildRuntimeSource(services: BackendServices, characterId: string, store: AmConfigStore | null, options: { chatId?: string } = {}): Promise<AmSource> {
  const document = await services.storage.loadCharacterDocument(characterId);
  const source = await services.sources.buildSource(characterId, document, options);
  return (amFn("rI")(source, document.customCharacters, "all") ?? source) as AmSource;
}

export interface AnalyzerCallInfo {
  purpose: string;
  onRetry?: (info: { attempt: number; total: number; error: RpcError }) => void;
}

/** Error shape AM `oP` (L81557) recognises as "the model cannot read images". */
function imageUnsupportedError(message: string): Error {
  return Object.assign(new Error(`${message} (image input is not supported by this model)`), { httpStatus: 415, code: "ANALYZER_HTTP" });
}

/** AM analyzer client `C.complete(config.analysis, messages, options)` over `services.llm.complete`. */
export function createAmAnalyzer(services: BackendServices, info: AnalyzerCallInfo) {
  return {
    async complete(_analysisConfig: unknown, messages: Any[], options: Any = {}) {
      const converted: LlmMessage[] = messages.map((m: Any) => ({
        role: m.role,
        content: typeof m.content === "string"
          ? m.content
          : (m.content as Any[]).map((p: Any) =>
              p.type === "image" ? { type: "image" as const, data: String(p.data ?? ""), mime_type: String(p.mimeType ?? p.mime_type ?? "image/png") } : { type: "text" as const, text: String(p.text ?? "") },
            ),
      }));
      try {
        const result = await services.llm.complete(
          {
            purpose: info.purpose,
            messages: converted,
            responseMode: options.responseMode === "text" ? "text" : "json",
            visionFallback: "fail",
            ...(Number.isFinite(options.timeoutMs) ? { settings: { timeoutMs: options.timeoutMs } } : {}),
            ...(options.structuredOutputSchema ? { schema: options.structuredOutputSchema } : {}),
          },
          { signal: options.signal, onRetry: info.onRetry },
        );
        return { raw: result.raw, parsed: result.parsed };
      } catch (error) {
        if (error instanceof RpcFailure && error.error.code === "unsupported") throw imageUnsupportedError(error.message);
        throw error;
      }
    },
  };
}

export interface AnalysisSession {
  characterId: string;
  store: AmConfigStore;
  source: AmSource;
  sourceCatalog: Any;
  priorityAssets: AmPriorityAssets;
  metadata: Any;
  images: Any;
  /** Re-read the source (after host changes) and refresh the catalog snapshot. */
  reloadSource(): Promise<AmSource>;
  dispose(): void;
}

export async function openAnalysisSession(services: BackendServices, characterId: string, options: { chatId?: string; reason?: string } = {}): Promise<AnalysisSession> {
  const store = await AmConfigStore.open(services, characterId, options.reason ?? "analysis");
  let source = await buildRuntimeSource(services, characterId, store, options);
  const snapshot = () => ({ currentSourceId: characterId, currentMemberKey: source.members[0]?.key ?? "", sources: [source] });
  const sourceCatalog = {
    load: async () => snapshot(),
    loadAllSources: async () => snapshot(),
    getSnapshot: () => snapshot(),
    hasCharacterDirectory: () => true,
    hasAllSources: () => true,
    getCachedCharacter: () => null,
  };
  const priorityAssets = createAmPriorityAssets(store, (id) => (id === source.id || !id ? source : null));
  const readAsset = async (asset: Any): Promise<Blob> => {
    const bytes = await services.imageBytes.getAsset(asset as AssetRef);
    return new Blob([base64ToBytes(bytes.data) as unknown as BlobPart], { type: bytes.mimeType || "image/png" });
  };
  // AM Int L87689 with a binary cache that reads through the image-bytes bridge (no createImageBitmap in the worker:
  // stealth alpha metadata is skipped there, PNG/JPEG/WebP text chunks still work).
  const metadata = amFn("Int")({ readAsset }, store, { binaryCache: { read: (asset: Any) => readAsset(asset) } });
  const images = amFn("aat")({ readAsset }, { readAsset });
  return {
    characterId,
    store,
    get source() {
      return source;
    },
    sourceCatalog,
    priorityAssets,
    metadata,
    images,
    async reloadSource() {
      services.sources.invalidate(characterId);
      source = await buildRuntimeSource(services, characterId, store, options);
      priorityAssets.invalidate();
      return source;
    },
    dispose() {
      void metadata.dispose?.();
    },
  } as AnalysisSession;
}

/** AM `ym` (L81545): remember whether the analysis model reads images (AM `F_` consults it before image batches). */
export function rememberVisionSupport(analysisConfig: unknown, supported: boolean | null): void {
  if (supported === null) return;
  AM.ym(analysisConfig, supported ? "supported" : "unsupported");
}
