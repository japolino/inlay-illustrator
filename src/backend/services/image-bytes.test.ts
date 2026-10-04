import { describe, expect, test } from "bun:test";
import { STORAGE_PATHS } from "../../shared/contract/index.js";
import { answerFetchBridge, createFakeHost, TINY_PNG_BASE64 } from "../testing/fake-host.js";
import { bytesToBase64, createImageBytesService } from "./image-bytes.js";
import { createStorageService } from "./storage.js";

function setup(timeoutMs = 50) {
  const fake = createFakeHost();
  const storage = createStorageService(fake.host, fake.userId);
  let n = 0;
  const bytes = createImageBytesService({ host: fake.host, userId: fake.userId, storage, timeoutMs, createRequestId: () => `r${++n}` });
  fake.host.onFrontendMessage((payload) => void bytes.acceptFrontendMessage(payload as Record<string, unknown>));
  return { fake, storage, bytes };
}

describe("image bytes bridge", () => {
  test("image id -> url -> bridge base64; JSON endpoints", async () => {
    const { fake, bytes } = setup();
    fake.addImage({ id: "img1", url: "/api/v1/images/img1" });
    answerFetchBridge(fake, { "/api/v1/images/img1": { data: TINY_PNG_BASE64, mimeType: "image/png" }, "/api/v1/characters/c1/gallery": { json: [{ id: "g" }] } });
    expect(await bytes.getImage({ imageId: "img1" })).toEqual({ data: TINY_PNG_BASE64, mimeType: "image/png" });
    expect(await bytes.getJson<unknown>("/api/v1/characters/c1/gallery")).toEqual([{ id: "g" }]);
    expect(fake.sentOfType("inlay-illustrator:fetch-request")).toEqual([
      { type: "inlay-illustrator:fetch-request", requestId: "r1", url: "/api/v1/images/img1", as: "base64" },
      { type: "inlay-illustrator:fetch-request", requestId: "r2", url: "/api/v1/characters/c1/gallery", as: "json" },
    ]);
    expect(bytes.pendingCount()).toBe(0);
  });

  test("rejects foreign URLs, errors, invalid images, timeouts and aborts", async () => {
    const { fake, bytes } = setup();
    await expect(bytes.getJson("https://evil.example/x")).rejects.toMatchObject({ error: { code: "bad-request" } });
    answerFetchBridge(fake, { "/api/a": { error: "Not found", status: 404 }, "/api/b": { data: "QQ==", mimeType: "text/html" } });
    await expect(bytes.getImage({ url: "/api/a" })).rejects.toMatchObject({ error: { code: "not-found" } });
    await expect(bytes.getImage({ url: "/api/b" })).rejects.toMatchObject({ error: { detailCode: "FETCH_BRIDGE_INVALID_IMAGE" } });
    fake.onSend = null;
    await expect(bytes.getImage({ url: "/api/slow" })).rejects.toMatchObject({ error: { code: "timeout" } });
    const controller = new AbortController();
    const p = bytes.getImage({ url: "/api/slow" }, { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(bytes.pendingCount()).toBe(0);
    await expect(bytes.getImage({ imageId: "missing" })).rejects.toMatchObject({ error: { code: "not-found" } });
  });

  test("legacy avatar_image_response is accepted; duplicate answers are consumed", async () => {
    const { fake, bytes } = setup();
    fake.onSend = (payload) => {
      const id = (payload as { requestId: string }).requestId;
      queueMicrotask(() => {
        fake.sendFromFrontend({ type: "avatar_image_response", requestId: id, data: TINY_PNG_BASE64, mimeType: "image/png" });
        fake.sendFromFrontend({ type: "avatar_image_response", requestId: id, data: TINY_PNG_BASE64, mimeType: "image/png" });
      });
    };
    expect((await bytes.getImage({ url: "/api/x" })).mimeType).toBe("image/png");
    expect(bytes.acceptFrontendMessage({ type: "other" })).toBe(false);
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
    fake.addImage({ id: "g1", url: "/api/v1/images/g1" });
    answerFetchBridge(fake, { "/api/v1/images/g1": { data: TINY_PNG_BASE64, mimeType: "image/webp" } });
    expect((await bytes.getAsset({ name: "smile.webp", key: "g1", extension: "webp", sourceType: "character", moduleId: "", moduleName: "" })).mimeType).toBe("image/webp");
  });
});
