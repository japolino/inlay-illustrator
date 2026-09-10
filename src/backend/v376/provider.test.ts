import { describe, expect, test } from "bun:test";
import {
  extractCharactersFromParameters,
  inspectHostCharacterCapability,
  nativeCharactersToPayload,
  normalizeCharacterPayload,
  queryHostProviderCapabilities
} from "./provider.js";

describe("V3.7.6 Provider and NovelAI character utilities", () => {
  test("normalizeCharacterPayload isolates positive and negative channels", () => {
    const raw = [
      { prompt: "blonde hair, blue eyes", negative: "bad hands, lowres" },
      { prompt: "red hair, armored knight", negative: "helmet" },
      { prompt: "", negative: "only negative" },
      { prompt: "only positive", negative: "" },
      null,
      undefined,
      "invalid"
    ];

    const normalized = normalizeCharacterPayload(raw);
    expect(normalized).toHaveLength(4);
    expect(normalized[0]).toEqual({
      prompt: "blonde hair, blue eyes",
      negative: "bad hands, lowres"
    });
    expect(normalized[1]).toEqual({
      prompt: "red hair, armored knight",
      negative: "helmet"
    });
    expect(normalized[2]).toEqual({
      prompt: "",
      negative: "only negative"
    });
    expect(normalized[3]).toEqual({
      prompt: "only positive",
      negative: ""
    });
  });

  test("nativeCharactersToPayload converts V376NativeCharacter array faithfully", () => {
    const chars = [
      { name: "Alice", prompt: "silver hair, twin tails", negative: "short hair" },
      { name: "Bob", prompt: "brown hair, trenchcoat" }
    ];

    const payload = nativeCharactersToPayload(chars);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toEqual({
      prompt: "silver hair, twin tails",
      negative: "short hair"
    });
    expect(payload[1]).toEqual({
      prompt: "brown hair, trenchcoat",
      negative: ""
    });
  });

  test("extractCharactersFromParameters extracts from both characters and nativeCharacters keys", () => {
    const fromChars = extractCharactersFromParameters({
      characters: [{ prompt: "girl", negative: "blurry" }]
    });
    expect(fromChars).toEqual([{ prompt: "girl", negative: "blurry" }]);

    const fromNative = extractCharactersFromParameters({
      nativeCharacters: [{ prompt: "boy", negative: "dark" }]
    });
    expect(fromNative).toEqual([{ prompt: "boy", negative: "dark" }]);

    const empty = extractCharactersFromParameters({});
    expect(empty).toEqual([]);
  });

  test("inspectHostCharacterCapability correctly documents unsupported host boundary without silent flattening", () => {
    const naiConn = {
      id: "nai-1",
      name: "NovelAI",
      provider: "novelai",
      model: "nai-diffusion-4-5-full"
    };
    const comfyConn = {
      id: "comfy-1",
      name: "Local Comfy",
      provider: "comfyui",
      model: "sd_xl_base.safetensors"
    };

    const naiReport = inspectHostCharacterCapability(naiConn);
    expect(naiReport.isNovelAi).toBeTrue();
    expect(naiReport.canTransportPayload).toBeTrue();
    expect(naiReport.hostBridgeVerified).toBeFalse();
    expect(naiReport.unsupportedReason).toContain("host-level NovelAI V4 bridge is not verifiable");

    const comfyReport = inspectHostCharacterCapability(comfyConn);
    expect(comfyReport.isNovelAi).toBeFalse();
    expect(comfyReport.canTransportPayload).toBeFalse();
    expect(comfyReport.hostBridgeVerified).toBeFalse();
  });

  test("queryHostProviderCapabilities safely handles absent host spindle API without throwing", async () => {
    const result = await queryHostProviderCapabilities("novelai");
    expect(result.providerFound).toBeFalse();
    expect(result.hasCharactersSchema).toBeFalse();
    expect(result.parameterKeys).toEqual([]);
  });
});
