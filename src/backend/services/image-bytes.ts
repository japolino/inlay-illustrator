/**
 * ImageBytesService: the backend -> frontend fetch bridge (src/shared/contract/bridge.ts), generalised from the 0.9.x avatar
 * bridge (`avatar_image_request` / `avatar_image_response`, still accepted). The backend cannot read bytes of stored Lumiverse
 * images (spindle.images returns authenticated URLs only, spec/lumiverse-host.md §3) nor call REST endpoints without a Spindle
 * API (character gallery), so the frontend fetches same-origin `/api/` URLs and answers with base64 or JSON.
 *
 * Assets (AssetRef by sourceType, docs/CONTRACT.md §2):
 * - crop (`cropReference` / `__asset_maid_crop_*` names): userStorage `characters/<chaId>/reference-crops/<name>.png`
 * - upload: userStorage `uploads/<key>.<ext>` when present, else the key is a Lumiverse image id
 * - character / generated / persona / gallery / expression / risu asset / avatar: `key` = Lumiverse image id
 */
import {
  CROP_ASSET_NAME_PREFIX,
  FETCH_BRIDGE_MAX_BASE64,
  FETCH_BRIDGE_REQUEST,
  FETCH_BRIDGE_RESPONSE,
  isAllowedBridgeUrl,
  normalizeAssetRef,
  STORAGE_PATHS,
  type AssetRef,
  type FetchBridgeRequest,
} from "../../shared/contract/index.js";
import { fail, RpcFailure } from "../rpc/errors.js";
import type { ImageBytes, ImageBytesService, RunLog, SpindleHost, StorageService } from "./types.js";
import { abortError, asRecord, errorMessage, str } from "./util.js";

export const FETCH_BRIDGE_TIMEOUT_MS = 15_000;
const IMAGE_MIME = /^image\/(?:png|jpe?g|webp|gif|avif)$/;

export interface ImageBytesServiceDeps {
  host: SpindleHost;
  userId: string | undefined;
  storage: Pick<StorageService, "readBinary">;
  log?: RunLog;
  timeoutMs?: number;
  createRequestId?: () => string;
}

interface Pending {
  as: "base64" | "json";
  resolve(value: { data?: string; mimeType?: string; json?: unknown }): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort?: () => void;
}

/** Base64 of bytes without Buffer (no base64_decode capability needed for encoding). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function mimeTypeForExtension(extension: string): string {
  const ext = extension.replace(/^\./, "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "avif") return "image/avif";
  return "image/png";
}

export function createImageBytesService(deps: ImageBytesServiceDeps): ImageBytesService & { pendingCount(): number } {
  const { host, userId } = deps;
  const pending = new Map<string, Pending>();
  const newId = deps.createRequestId ?? (() => globalThis.crypto.randomUUID());

  function finish(requestId: string): Pending | null {
    const entry = pending.get(requestId);
    if (!entry) return null;
    pending.delete(requestId);
    clearTimeout(entry.timer);
    if (entry.signal && entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort);
    return entry;
  }

  function request(url: string, as: "base64" | "json", options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<{ data?: string; mimeType?: string; json?: unknown }> {
    if (!isAllowedBridgeUrl(url)) fail("bad-request", `Only same-origin /api/ URLs can be fetched (got "${String(url).slice(0, 120)}").`, { detailCode: "FETCH_BRIDGE_URL" });
    if (options.signal?.aborted) return Promise.reject(abortError(options.signal.reason));
    const requestId = newId();
    const timeoutMs = options.timeoutMs ?? deps.timeoutMs ?? FETCH_BRIDGE_TIMEOUT_MS;
    const promise = new Promise<{ data?: string; mimeType?: string; json?: unknown }>((resolve, reject) => {
      const entry: Pending = {
        as,
        resolve,
        reject,
        signal: options.signal,
        timer: setTimeout(() => {
          finish(requestId)?.reject(new RpcFailure({ code: "timeout", message: "The overlay did not answer the image request in time. Keep Lumiverse open in a browser tab and try again.", detailCode: "FETCH_BRIDGE_TIMEOUT", retryable: true }));
        }, timeoutMs),
      };
      if (options.signal) {
        entry.onAbort = () => finish(requestId)?.reject(abortError(options.signal?.reason));
        options.signal.addEventListener("abort", entry.onAbort, { once: true });
      }
      pending.set(requestId, entry);
    });
    const message: FetchBridgeRequest = { type: FETCH_BRIDGE_REQUEST, requestId, url, as };
    try {
      host.sendToFrontend(message, userId);
    } catch (error) {
      finish(requestId)?.reject(new RpcFailure({ code: "internal", message: `Could not reach the frontend: ${errorMessage(error)}` }));
    }
    return promise;
  }

  async function base64Of(url: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<ImageBytes> {
    const reply = await request(url, "base64", options);
    return { data: reply.data!, mimeType: reply.mimeType! };
  }

  async function imageUrl(imageId: string): Promise<string> {
    let dto: unknown;
    try {
      dto = await host.images.get(imageId, { specificity: "full", ...(userId ? { userId } : {}) });
    } catch (error) {
      throw new RpcFailure({ code: "provider-error", message: `Could not read image ${imageId}: ${errorMessage(error)}`, retryable: true });
    }
    const url = str(asRecord(dto).url);
    if (!url) fail("not-found", `Image not found: ${imageId}`, { detailCode: "IMAGE_NOT_FOUND" });
    return url;
  }

  async function fromStorage(path: string, extension: string): Promise<ImageBytes | null> {
    const bytes = await deps.storage.readBinary(path);
    return bytes ? { data: bytesToBase64(bytes), mimeType: mimeTypeForExtension(extension) } : null;
  }

  const service = {
    pendingCount: () => pending.size,

    async getImage(ref: { imageId?: string; url?: string }, options: { signal?: AbortSignal; timeoutMs?: number } = {}) {
      const url = str(ref.url) || (str(ref.imageId) ? await imageUrl(str(ref.imageId)) : "");
      if (!url) fail("bad-request", "No image id or URL given.");
      return base64Of(url, options);
    },

    async getAsset(raw: AssetRef, options: { signal?: AbortSignal } = {}) {
      const asset = normalizeAssetRef(raw);
      const crop = asRecord(asset.cropReference);
      const characterId = str(asset.characterTarget?.chaId);
      if ((Object.keys(crop).length || asset.name.startsWith(CROP_ASSET_NAME_PREFIX)) && characterId) {
        const cropName = (asset.name || asset.key).replace(/\.png$/i, "");
        const bytes = await fromStorage(STORAGE_PATHS.characterReferenceCrop(characterId, cropName), "png");
        if (bytes) return bytes;
        // Fall through to the source image of the crop.
        const sourceKey = str(crop.assetKey);
        if (sourceKey) return service.getImage(sourceKey.startsWith("/api/") ? { url: sourceKey } : { imageId: sourceKey }, options);
      }
      if (asset.sourceType === "upload" && asset.key) {
        const bytes = await fromStorage(STORAGE_PATHS.upload(asset.key, asset.extension || "png"), asset.extension || "png");
        if (bytes) return bytes;
      }
      if (!asset.key) fail("bad-request", `Asset "${asset.name}" has no image key.`, { detailCode: "ASSET_KEY_MISSING" });
      return service.getImage(asset.key.startsWith("/api/") ? { url: asset.key } : { imageId: asset.key }, options);
    },

    async getJson<T = unknown>(url: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
      const reply = await request(url, "json", options);
      return reply.json as T;
    },

    acceptFrontendMessage(message: Record<string, unknown>): boolean {
      const type = message?.type;
      if (type !== FETCH_BRIDGE_RESPONSE && type !== "avatar_image_response") return false;
      const entry = finish(str(message.requestId));
      if (!entry) return true; // late or duplicate answer (several open tabs): consumed, ignored
      const error = str(message.error);
      if (error) {
        const status = Number(message.status);
        entry.reject(new RpcFailure({ code: status === 404 ? "not-found" : status === 401 || status === 403 ? "permission-denied" : "provider-error", message: error, detailCode: "FETCH_BRIDGE_ERROR", ...(Number.isFinite(status) && status ? { details: { status } } : {}) }));
        return true;
      }
      if (entry.as === "json") {
        entry.resolve({ json: message.json });
        return true;
      }
      const data = str(message.data).replace(/^data:[^;,]+;base64,/, "");
      const mimeType = str(message.mimeType).toLowerCase();
      if (!data || data.length > FETCH_BRIDGE_MAX_BASE64 || !IMAGE_MIME.test(mimeType)) {
        entry.reject(new RpcFailure({ code: "provider-error", message: "The frontend returned an invalid image.", detailCode: "FETCH_BRIDGE_INVALID_IMAGE" }));
        return true;
      }
      entry.resolve({ data, mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType });
      return true;
    },
  };
  return service;
}
