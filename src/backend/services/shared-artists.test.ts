import { describe, expect, test } from "bun:test";
import { normalizeConfig, type InlayConfig } from "../../shared/contract/index.js";
import { createFakeHost } from "../testing/fake-host.js";
import { createServices } from "./index.js";
import { sharedArtistsChannel, sharedArtistsValue, shareArtists } from "./shared-artists.js";

function configWith(artistPrompts: unknown[], defaultArtistId: string, anima: unknown[] = []): InlayConfig {
  const base = normalizeConfig({});
  return normalizeConfig({ ...base, characterPrompt: { ...base.characterPrompt, artistPrompts, defaultArtistId }, animaArtists: { version: 1, entries: anima, selection: { defaultId: "none", bySourceId: {} } } });
}

function fakePool() {
  const handlers = new Map<string, { handler: () => unknown; policy: unknown }>();
  const unregistered: string[] = [];
  return {
    handlers,
    unregistered,
    rpcPool: {
      sync: () => "",
      read: async () => undefined,
      handle: (endpoint: string, handler: () => unknown, policy?: unknown) => {
        handlers.set(endpoint, { handler, policy });
        return `inlay_illustrator.${endpoint}`;
      },
      unregister: (endpoint: string) => void unregistered.push(endpoint),
    },
  };
}

describe("shared artists", () => {
  test("one channel per user; the owner and odd ids share owner", () => {
    expect(sharedArtistsChannel("5D2E9A41-7c3b-4f08-b6e1-2a9c0d4e8f73")).toBe("artists.5d2e9a41-7c3b-4f08-b6e1-2a9c0d4e8f73");
    expect(sharedArtistsChannel(undefined)).toBe("artists.owner");
    expect(sharedArtistsChannel("user.with.dots")).toBe("artists.owner");
  });

  test("lists the own NovelAI artists without none, with overrides and the global default", () => {
    const value = sharedArtistsValue(configWith([
      { id: "artist_a", title: "Webtoon", prompt: "0.6::artist:a ::,   year 2025", negativePrompt: "lowres", novelAIOverrides: { steps: 18, scale: 7, cfgRescale: 0 } },
      { id: "artist_b", title: "Manga", prompt: "artist:b" },
    ], "artist_a", [{ id: "anima_1", title: "Painterly", text: "@painter" }]));
    expect(value.version).toBe(1);
    expect(value.defaultArtistId).toBe("artist_a");
    expect(value.novelai.some((artist) => artist.id === "none")).toBe(false);
    // AM 0.9.90: "none" is the only built-in, so no shared artist is built in.
    expect(value.novelai.filter((artist) => artist.builtIn)).toEqual([]);
    const own = value.novelai.filter((artist) => !artist.builtIn);
    expect(own).toEqual([
      { id: "artist_a", title: "Webtoon", prompt: "0.6::artist:a ::,   year 2025", negativePrompt: "lowres", novelAIOverrides: { steps: 18, scale: 7, cfgRescale: 0 }, builtIn: false },
      { id: "artist_b", title: "Manga", prompt: "artist:b", negativePrompt: "", builtIn: false },
    ]);
    expect(value.anima).toEqual([{ id: "anima_1", title: "Painterly", text: "@painter" }]);
  });

  test("a deleted default reads as none", () => {
    expect(sharedArtistsValue(configWith([], "artist_gone")).defaultArtistId).toBe("none");
  });

  test("registers an on-demand endpoint that reads the current config, gated on image_gen", async () => {
    const pool = fakePool();
    let config = configWith([{ id: "artist_a", title: "First", prompt: "a" }], "artist_a");
    const unregister = shareArtists({ rpcPool: pool.rpcPool } as never, "u1", async () => config);
    const entry = pool.handlers.get("artists.u1");
    expect(entry?.policy).toEqual({ requires: ["image_gen"] });
    config = configWith([{ id: "artist_a", title: "Renamed", prompt: "a" }], "artist_a");
    const value = (await entry!.handler()) as ReturnType<typeof sharedArtistsValue>;
    expect(value.novelai.find((artist) => artist.id === "artist_a")?.title).toBe("Renamed");
    unregister();
    expect(pool.unregistered).toEqual(["artists.u1"]);
  });

  test("a host without the pool skips sharing; createServices registers the user's endpoint", () => {
    expect(() => shareArtists({} as never, "u1", async () => normalizeConfig({}))()).not.toThrow();
    const fake = createFakeHost({ userId: "u2" });
    const pool = fakePool();
    (fake.host as { rpcPool?: unknown }).rpcPool = pool.rpcPool;
    createServices(fake.host, fake.userId);
    expect([...pool.handlers.keys()]).toEqual(["artists.u2"]);
  });
});
