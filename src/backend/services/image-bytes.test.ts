import { describe, expect, test } from "bun:test";
import { FETCH_BRIDGE_RESPONSE, STORAGE_PATHS } from "../../shared/contract/index.js";
import { answerFetchBridge, createFakeHost, TINY_PNG_BASE64 } from "../testing/fake-host.js";
import { bytesToBase64, createImageBytesService, imageIdFromUrl, sniffImageMime } from "./image-bytes.js";
import { createStorageService } from "./storage.js";

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

function setup(options: { timeoutMs?: number; granted?: string[] } = {}) {
  const fake = createFakeHost(options.granted ? { granted: options.granted } : {});
  const storage = createStorageService(fake.host, fake.userId);
  let n = 0;
  const bytes = createImageBytesService({ host: fake.host, userId: fake.userId, storage, timeoutMs: options.timeoutMs ?? 50, createRequestId: () => `r${++n}` });
  fake.host.onFrontendMessage((payload) => void bytes.acceptFrontendMessage(payload as Record<string, unknown>));
  return { fake, storage, bytes };
}

describe("image bytes", () => {
  test("reads Lumiverse images by id or URL without the frontend", async () => {
    const { fake, bytes } = setup();
    fake.addImage({ id: "img1" });
    fake.addImage({ id: "img 2" }, ascii("RIFF\0\0\0\0WEBPVP8 "));
    expect(await bytes.getImage({ imageId: "img1" })).toEqual({ data: TINY_PNG_BASE64, mimeType: "image/png" });
    expect(await bytes.getImage({ url: "/api/v1/images/img1?size=sm" })).toEqual({ data: TINY_PNG_BASE64, mimeType: "image/png" });
    expect((await bytes.getImage({ url: "/api/v1/image-gen/results/img%202" })).mimeType).toBe("image/webp");
    expect(fake.sent).toEqual([]);
  });

  test("errors: missing, unsupported, bad refs, permission, abort", async () => {
    const { fake, bytes } = setup();
    fake.addImage({ id: "html" }, ascii("<html>"));
    await expect(bytes.getImage({ imageId: "missing" })).rejects.toMatchObject({ error: { code: "not-found", detailCode: "IMAGE_NOT_FOUND" } });
    await expect(bytes.getImage({ imageId: "html" })).rejects.toMatchObject({ error: { code: "provider-error", detailCode: "IMAGE_UNSUPPORTED" } });
    await expect(bytes.getImage({ url: "/api/v1/characters/c1" })).rejects.toMatchObject({ error: { code: "bad-request" } });
    await expect(bytes.getImage({})).rejects.toMatchObject({ error: { code: "bad-request" } });
    const denied = setup({ granted: [] });
    denied.fake.addImage({ id: "img1" });
    await expect(denied.bytes.getImage({ imageId: "img1" })).rejects.toMatchObject({ error: { code: "permission-denied" } });
    fake.addImage({ id: "img1" });
    const controller = new AbortController();
    controller.abort();
    await expect(bytes.getImage({ imageId: "img1" }, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    const late = new AbortController();
    const p = bytes.getImage({ imageId: "img1" }, { signal: late.signal });
    late.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  test("sniffs image signatures and parses image URLs", () => {
    expect(sniffImageMime(ascii("\xff\xd8\xff\xe0"))).toBe("image/jpeg");
    expect(sniffImageMime(ascii("GIF89a"))).toBe("image/gif");
    expect(sniffImageMime(ascii("\0\0\0\x1cftypmif1\0\0\0\0mif1avif"))).toBe("image/avif");
    expect(sniffImageMime(ascii("\0\0\0\x1cftypisom"))).toBeNull();
    expect(imageIdFromUrl("/api/v1/images/a%20b?size=lg")).toBe("a b");
    expect(imageIdFromUrl("/api/v1/image-gen/results/r1")).toBe("r1");
    expect(imageIdFromUrl("/api/v1/images/a/thumb")).toBeNull();
  });

  test("assets: crops and uploads from userStorage, others by image id", async () => {
    const { fake, storage, bytes } = setup();
    await storage.writeBinary(STORAGE_PATHS.characterReferenceCrop("c1", "__asset_maid_crop_1"), new Uint8Array([1, 2, 3]));
    await storage.writeBinary(STORAGE_PATHS.upload("u1", "jpg"), new Uint8Array([4]));
    const crop = await bytes.getAsset({ name: "__asset_maid_crop_1.png", key: "x", extension: "png", sourceType: "character", moduleId: "", moduleName: "", characterTarget: { chaId: "c1" } });
    expect(crop).toEqual({ data: bytesToBase64(new Uint8Array([1, 2, 3])), mimeType: "image/png" });
    expect(await bytes.getAsset({ name: "a.jpg", key: "u1", extension: "jpg", sourceType: "upload", moduleId: "", moduleName: "" })).toEqual({ data: "BA==", mimeType: "image/jpeg" });
    expect(await bytes.getAsset({ name: "up.webp", key: "storage:uploads/u1.jpg", extension: "webp", sourceType: "upload", moduleId: "", moduleName: "" })).toEqual({ data: "BA==", mimeType: "image/jpeg" });
    await expect(bytes.getAsset({ name: "x", key: "storage:uploads/none.png", extension: "png", sourceType: "upload", moduleId: "", moduleName: "" })).rejects.toMatchObject({ error: { code: "not-found" } });
    await expect(bytes.getAsset({ name: "x", key: "storage:../secret.png", extension: "png", sourceType: "upload", moduleId: "", moduleName: "" })).rejects.toMatchObject({ error: { code: "bad-request" } });
    fake.addImage({ id: "g1" }, ascii("GIF89a"));
    expect((await bytes.getAsset({ name: "smile.webp", key: "g1", extension: "webp", sourceType: "character", moduleId: "", moduleName: "" })).mimeType).toBe("image/gif");
    expect((await bytes.getAsset({ name: "gen", key: "/api/v1/image-gen/results/g1", extension: "png", sourceType: "generated", moduleId: "", moduleName: "" })).mimeType).toBe("image/gif");
  });

  test("assets: a crop reference without a character target reads the crop image, else the source", async () => {
    const { fake, storage, bytes } = setup();
    const path = STORAGE_PATHS.characterReferenceCrop("c1", "__asset_maid_crop_2");
    await storage.writeBinary(path, new Uint8Array([7, 8]));
    fake.addImage({ id: "src1" }, ascii("GIF89a"));
    const ref = { name: "full.png", key: "src1", extension: "png", sourceType: "character", moduleId: "", moduleName: "" };
    const crop = { version: 1, assetName: "__asset_maid_crop_2.png", assetKey: `storage:${path}`, extension: "png", cropRect: { x: 0, y: 0, width: 1, height: 1 }, sourceSize: { width: 2, height: 2 } };
    expect(await bytes.getAsset({ ...ref, cropReference: crop })).toEqual({ data: bytesToBase64(new Uint8Array([7, 8])), mimeType: "image/png" });
    expect((await bytes.getAsset({ ...ref, cropReference: { ...crop, assetKey: "storage:characters/c1/reference-crops/gone.png" } })).mimeType).toBe("image/gif");
  });

  test("assets: a crop of a storage-backed upload reads the crop image, else the upload", async () => {
    const { storage, bytes } = setup();
    const path = STORAGE_PATHS.characterReferenceCrop("c1", "__asset_maid_crop_3");
    await storage.writeBinary(path, new Uint8Array([7, 8]));
    await storage.writeBinary(STORAGE_PATHS.upload("u2", "png"), new Uint8Array([9]));
    const upload = { name: "ref.png", key: `storage:${STORAGE_PATHS.upload("u2", "png")}`, extension: "png", sourceType: "upload", moduleId: "", moduleName: "" };
    const crop = { version: 1, assetName: "__asset_maid_crop_3.png", assetKey: `storage:${path}`, extension: "png", cropRect: { x: 0, y: 0, width: 1, height: 1 }, sourceSize: { width: 2, height: 2 } };
    expect(await bytes.getAsset({ ...upload, cropReference: crop })).toEqual({ data: bytesToBase64(new Uint8Array([7, 8])), mimeType: "image/png" });
    expect(await bytes.getAsset({ ...upload, cropReference: { ...crop, assetKey: "storage:characters/c1/reference-crops/gone.png" } })).toEqual({ data: bytesToBase64(new Uint8Array([9])), mimeType: "image/png" });
  });
});

describe("JSON fetch bridge", () => {
  test("requests JSON through the frontend", async () => {
    const { fake, bytes } = setup();
    answerFetchBridge(fake, { "/api/v1/characters/c1/gallery": { json: [{ id: "g" }] } });
    expect(await bytes.getJson<unknown>("/api/v1/characters/c1/gallery")).toEqual([{ id: "g" }]);
    expect(fake.sentOfType("inlay-illustrator:fetch-request")).toEqual([{ type: "inlay-illustrator:fetch-request", requestId: "r1", url: "/api/v1/characters/c1/gallery" }]);
    expect(bytes.pendingCount()).toBe(0);
  });

  test("rejects foreign URLs, errors, timeouts and aborts", async () => {
    const { fake, bytes } = setup();
    await expect(bytes.getJson("https://evil.example/x")).rejects.toMatchObject({ error: { code: "bad-request" } });
    answerFetchBridge(fake, { "/api/a": { error: "Not found", status: 404 }, "/api/b": { error: "HTTP 403", status: 403 } });
    await expect(bytes.getJson("/api/a")).rejects.toMatchObject({ error: { code: "not-found" } });
    await expect(bytes.getJson("/api/b")).rejects.toMatchObject({ error: { code: "permission-denied" } });
    fake.onSend = null;
    await expect(bytes.getJson("/api/slow")).rejects.toMatchObject({ error: { code: "timeout" } });
    const controller = new AbortController();
    const p = bytes.getJson("/api/slow", { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(bytes.pendingCount()).toBe(0);
  });

  test("duplicate answers are consumed; other message types are not", async () => {
    const { fake, bytes } = setup();
    fake.onSend = (payload) => {
      const id = (payload as { requestId: string }).requestId;
      queueMicrotask(() => {
        fake.sendFromFrontend({ type: FETCH_BRIDGE_RESPONSE, requestId: id, json: 1 });
        fake.sendFromFrontend({ type: FETCH_BRIDGE_RESPONSE, requestId: id, json: 2 });
      });
    };
    expect(await bytes.getJson<unknown>("/api/x")).toBe(1);
    expect(bytes.acceptFrontendMessage({ type: "other" })).toBe(false);
  });
});
