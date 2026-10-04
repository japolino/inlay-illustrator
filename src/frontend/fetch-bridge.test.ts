import { describe, expect, test } from "bun:test";
import { answerFetchBridge } from "./fetch-bridge.js";

const req = (url: string, as: "base64" | "json" = "base64") => ({ type: "inlay-illustrator:fetch-request" as const, requestId: "r1", url, as });

describe("fetch bridge", () => {
  test("refuses non-API URLs", async () => {
    const calls: string[] = [];
    const fake = (async (url: string) => { calls.push(url); return new Response("x"); }) as unknown as typeof fetch;
    expect((await answerFetchBridge(req("https://evil.example/api/x"), fake)).error).toContain("not allowed");
    expect((await answerFetchBridge(req("/api/../secret"), fake)).error).toContain("not allowed");
    expect(calls).toEqual([]);
  });
  test("returns base64 images and json", async () => {
    const fake = (async (url: string) => url.endsWith(".png")
      ? new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } })
      : url.endsWith("/text") ? new Response("hi", { headers: { "content-type": "text/plain" } }) : Response.json({ a: 1 })) as unknown as typeof fetch;
    expect(await answerFetchBridge(req("/api/v1/images/a.png"), fake)).toMatchObject({ requestId: "r1", data: "AQID", mimeType: "image/png" });
    expect(await answerFetchBridge(req("/api/v1/characters/c/gallery", "json"), fake)).toMatchObject({ json: { a: 1 } });
    expect((await answerFetchBridge(req("/api/v1/text"), fake)).error).toContain("Not an image");
  });
});
