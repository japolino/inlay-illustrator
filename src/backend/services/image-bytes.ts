/**
 * ImageBytesService: image bytes for vision / references / img2img, plus same-origin REST JSON.
 *
 * - Lumiverse images: original bytes via `spindle.images.readBinary(imageId, userId)` (permission "images"; the host rejects
 *   missing images with "Image not found" and caps reads at 100 MiB). The mime type is sniffed from the bytes.
 * - JSON: REST endpoints without a Spindle API (character gallery, LLM connection model lists) go through the
 *   backend -> frontend fetch bridge (src/shared/contract/bridge.ts); the frontend fetches same-origin `/api/` URLs.
 *
 * Assets (AssetRef by sourceType, docs/CONTRACT.md §2):
 * - crop (`cropReference` / `__asset_maid_crop_*` names): userStorage `characters/<chaId>/reference-crops/<name>.png`
 * - key `storage:<userStorage path>` (analysis uploads / crops stored by the extension): bytes from userStorage
 * - upload: userStorage `uploads/<key>.<ext>` when present, else the key is a Lumiverse image id
 * - character / generated / persona / gallery / expression / risu asset / avatar: `key` = Lumiverse image id or image URL
 */
import type { PERMISSION_DENIED_PREFIX as HostPermissionDeniedPrefix } from "lumiverse-spindle-types";
import {
  CROP_ASSET_NAME_PREFIX,
  FETCH_BRIDGE_REQUEST,
  FETCH_BRIDGE_RESPONSE,
  imageIdFromResultUrl,
  isAllowedBridgeUrl,
  normalizeAssetRef,
  STORAGE_PATHS,
  type AssetRef,
  type FetchBridgeRequest,
} from "../../shared/contract/index.js";
import { fail, RpcFailure } from "../rpc/errors.js";
import type { ImageBytes, ImageBytesService, RunLog, SpindleHost, StorageService } from "./types.js";
import { abortError, asRecord, errorMessage, str, throwIfAborted } from "./util.js";

export const FETCH_BRIDGE_TIMEOUT_MS = 15_000;
/** AssetRef key prefix for images kept in the extension's userStorage (`storage:<path>`). */
export const STORAGE_KEY_PREFIX = "storage:";
/** Host error prefix for missing permissions (a type-only import keeps the spindle-types runtime out of the bundle). */
const PERMISSION_DENIED_PREFIX: typeof HostPermissionDeniedPrefix = "PERMISSION_DENIED:";

export interface ImageBytesServiceDeps {
  host: SpindleHost;
  userId: string | undefined;
  storage: Pick<StorageService, "readBinary">;
  log?: RunLog;
  timeoutMs?: number;
  createRequestId?: () => string;
}

interface Pending {
  resolve(json: unknown): void;
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

/** Mime type from the file signature; null unless png, jpeg, webp, gif or avif. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && /avi[fs]/u.test(ascii(8, 32))) return "image/avif";
  return null;
}

/** Lumiverse image id of `/api/v1/images/<id>[?size=..]` or `/api/v1/image-gen/results/<id>`. */
export function imageIdFromUrl(url: string): string | null {
  const match = /^\/api\/v1\/images\/([^/?#]+)(?:[?#]|$)/u.exec(url);
  if (!match) return imageIdFromResultUrl(url);
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
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

  function requestJson(url: string, options: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<unknown> {
    if (!isAllowedBridgeUrl(url)) fail("bad-request", `Only same-origin /api/ URLs can be fetched (got "${String(url).slice(0, 120)}").`, { detailCode: "FETCH_BRIDGE_URL" });
    if (options.signal?.aborted) return Promise.reject(abortError(options.signal.reason));
    const requestId = newId();
    const timeoutMs = options.timeoutMs ?? deps.timeoutMs ?? FETCH_BRIDGE_TIMEOUT_MS;
    const promise = new Promise<unknown>((resolve, reject) => {
      const entry: Pending = {
        resolve,
        reject,
        signal: options.signal,
        timer: setTimeout(() => {
          finish(requestId)?.reject(new RpcFailure({ code: "timeout", message: "The overlay did not answer in time. Keep Lumiverse open in a browser tab and try again.", detailCode: "FETCH_BRIDGE_TIMEOUT", retryable: true }));
        }, timeoutMs),
      };
      if (options.signal) {
        entry.onAbort = () => finish(requestId)?.reject(abortError(options.signal?.reason));
        options.signal.addEventListener("abort", entry.onAbort, { once: true });
      }
      pending.set(requestId, entry);
    });
    const message: FetchBridgeRequest = { type: FETCH_BRIDGE_REQUEST, requestId, url };
    try {
      host.sendToFrontend(message, userId);
    } catch (error) {
      finish(requestId)?.reject(new RpcFailure({ code: "internal", message: `Could not reach the frontend: ${errorMessage(error)}` }));
    }
    return promise;
  }

  async function readImage(imageId: string, signal?: AbortSignal): Promise<ImageBytes> {
    throwIfAborted(signal);
    let bytes: Uint8Array;
    try {
      bytes = await host.images.readBinary(imageId, userId);
    } catch (error) {
      const message = errorMessage(error);
      if (message === "Image not found") fail("not-found", `Image not found: ${imageId}`, { detailCode: "IMAGE_NOT_FOUND" });
      if (message.startsWith(PERMISSION_DENIED_PREFIX)) fail("permission-denied", `Could not read image ${imageId}: ${message}`);
      throw new RpcFailure({ code: "provider-error", message: `Could not read image ${imageId}: ${message}` });
    }
    throwIfAborted(signal);
    const mimeType = sniffImageMime(bytes);
    if (!mimeType) fail("provider-error", `Image ${imageId} is not a PNG, JPEG, WebP, GIF or AVIF image.`, { detailCode: "IMAGE_UNSUPPORTED" });
    return { data: bytesToBase64(bytes), mimeType };
  }

  async function fromStorage(path: string, extension: string): Promise<ImageBytes | null> {
    const bytes = await deps.storage.readBinary(path);
    return bytes ? { data: bytesToBase64(bytes), mimeType: mimeTypeForExtension(extension) } : null;
  }

  async function fromStorageKey(key: string): Promise<ImageBytes> {
    const path = key.slice(STORAGE_KEY_PREFIX.length).replace(/\\/g, "/").replace(/^\/+/, "");
    if (!path || path.split("/").some((part) => part === ".." || part === ".")) fail("bad-request", `Invalid storage asset key: ${key}`, { detailCode: "ASSET_KEY_INVALID" });
    const bytes = await fromStorage(path, path.split(".").at(-1) ?? "png");
    if (!bytes) fail("not-found", `Stored image not found: ${path}`, { detailCode: "IMAGE_NOT_FOUND" });
    return bytes;
  }

  const service = {
    pendingCount: () => pending.size,

    async getImage(ref: { imageId?: string; url?: string }, options: { signal?: AbortSignal } = {}) {
      const url = str(ref.url);
      const imageId = url ? imageIdFromUrl(url) : str(ref.imageId);
      if (!imageId) fail("bad-request", url ? `Not a Lumiverse image URL: "${url.slice(0, 120)}".` : "No image id or URL given.", { detailCode: "IMAGE_REF_INVALID" });
      return readImage(imageId, options.signal);
    },

    async getAsset(raw: AssetRef, options: { signal?: AbortSignal } = {}) {
      const asset = normalizeAssetRef(raw);
      const crop = asRecord(asset.cropReference);
      // AM `$mt` 138466: the crop's own image first, the source asset when it cannot be read.
      const cropKey = str(crop.assetKey);
      if (cropKey.startsWith(STORAGE_KEY_PREFIX)) {
        try {
          return await fromStorageKey(cropKey);
        } catch {
          /* fall through */
        }
      }
      if (asset.key.startsWith(STORAGE_KEY_PREFIX)) return fromStorageKey(asset.key);
      const characterId = str(asset.characterTarget?.chaId);
      if ((Object.keys(crop).length || asset.name.startsWith(CROP_ASSET_NAME_PREFIX)) && characterId) {
        const cropName = (asset.name || asset.key).replace(/\.png$/i, "");
        const bytes = await fromStorage(STORAGE_PATHS.characterReferenceCrop(characterId, cropName), "png");
        if (bytes) return bytes;
        // Fall through to the source image of the crop.
        const sourceKey = str(crop.assetKey);
        if (sourceKey.startsWith(STORAGE_KEY_PREFIX)) return fromStorageKey(sourceKey);
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
      return (await requestJson(url, options)) as T;
    },

    acceptFrontendMessage(message: Record<string, unknown>): boolean {
      const type = message?.type;
      if (type !== FETCH_BRIDGE_RESPONSE) return false;
      const entry = finish(str(message.requestId));
      if (!entry) return true; // late or duplicate answer (several open tabs): consumed, ignored
      const error = str(message.error);
      if (error) {
        const status = Number(message.status);
        entry.reject(new RpcFailure({ code: status === 404 ? "not-found" : status === 401 || status === 403 ? "permission-denied" : "provider-error", message: error, detailCode: "FETCH_BRIDGE_ERROR", ...(Number.isFinite(status) && status ? { details: { status } } : {}) }));
        return true;
      }
      entry.resolve(message.json);
      return true;
    },
  };
  return service;
}
