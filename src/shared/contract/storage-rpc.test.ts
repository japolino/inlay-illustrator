import { describe, expect, test } from "bun:test";
import { characterResetPaths, migrateStoredFile, safePathSegment, STORAGE_FILE_VERSIONS, STORAGE_PATHS, storagePathForAssetMaidKey } from "./storage.js";
import { createEvent, createRequest, errorResponse, isRpcEvent, isRpcRequest, isRpcResponse, okResponse, RPC_METHODS, rpcError } from "./rpc.js";
import * as contract from "./index.js";

describe("storage layout", () => {
  test("paths", () => {
    expect(STORAGE_PATHS.characterDocument("abc-123")).toBe("characters/abc-123/asset-maid.json");
    expect(STORAGE_PATHS.chatData("c 1/x")).toBe("chats/c%201%2Fx/chat-data.json");
    expect(STORAGE_PATHS.characterMetadataCache("a.b")).toBe("characters/a.b/metadata-cache.json");
    expect(() => safePathSegment("..")).toThrow();
    expect(() => safePathSegment("")).toThrow();
    expect(characterResetPaths("c")).toContain("characters/c/asset-maid.json");
    expect(storagePathForAssetMaidKey("asset_maid:v1:config:model")).toBe("config/model.json");
    expect(storagePathForAssetMaidKey("asset_maid:v1:local:metadata-cache:src%201")).toBe("characters/src%201/metadata-cache.json");
    expect(storagePathForAssetMaidKey("asset_maid:v1:active-instance")).toBeNull();
  });
  test("migrations", () => {
    const m = migrateStoredFile("anima-artists", { animaArtists: { entries: [{ id: "a", text: "t" }], selection: { defaultId: "a", bySourceId: { c: "a" } } } });
    expect(m.applied).toEqual(["anima-artists:0->1"]);
    expect(m.value).toMatchObject({ version: 1, entries: [{ id: "a", title: "a", text: "t" }], selection: { defaultId: "a", bySourceId: {} } });
    expect(migrateStoredFile("config-model", { version: 99 }).tooNew).toBe(true);
    expect(migrateStoredFile("chat-data", {}).value.version).toBe(STORAGE_FILE_VERSIONS["chat-data"]);
  });
});

describe("rpc envelopes", () => {
  test("request/response pairing and guards", () => {
    const req = createRequest("workspace.load", { characterId: "c1" }, "ui:1");
    expect(isRpcRequest(req)).toBe(true);
    expect(isRpcRequest({ ...req, method: "nope" })).toBe(false);
    const ok = okResponse(req, { ok: true } as never);
    expect(isRpcResponse(ok)).toBe(true);
    expect(ok.requestId).toBe("ui:1");
    const err = errorResponse(req, rpcError("not-found", "Character not found."));
    expect(err.ok).toBe(false);
    const ev = createEvent("notice", { tone: "info", message: "hi" }, 3);
    expect(isRpcEvent(ev)).toBe(true);
    expect(new Set(RPC_METHODS).size).toBe(RPC_METHODS.length);
  });
  test("index re-exports every module", () => {
    expect(typeof contract.normalizeConfig).toBe("function");
    expect(typeof contract.normalizeCharacterDocument).toBe("function");
    expect(typeof contract.validateHistoryTree).toBe("function");
    expect(typeof contract.normalizeChatData).toBe("function");
    expect(typeof contract.createRequest).toBe("function");
    expect(contract.STORAGE_PATHS.configModel).toBe("config/model.json");
  });
});
