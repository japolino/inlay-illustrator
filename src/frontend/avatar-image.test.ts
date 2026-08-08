import { describe, expect, test } from "bun:test";
import { respondToAvatarImageRequest } from "./avatar-image.js";

describe("avatar image frontend bridge", () => {
  test("fetches an authenticated avatar and returns base64 without a data URL prefix", async () => {
    const sent: unknown[] = [];
    const fetchFn = (async (url: string | URL | Request) => {
      expect(String(url)).toBe("/api/v1/images/avatar-1?size=lg");
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } });
    }) as typeof fetch;
    await respondToAvatarImageRequest({
      type: "avatar_image_request",
      requestId: "request-1",
      chatId: "chat-1",
      imageUrl: "/api/v1/images/avatar-1?size=lg"
    }, (payload) => sent.push(payload), fetchFn);
    expect(sent).toEqual([{
      type: "avatar_image_response",
      requestId: "request-1",
      chatId: "chat-1",
      data: "AQID",
      mimeType: "image/png"
    }]);
  });

  test("rejects non-image and non-Lumiverse URLs without fetching", async () => {
    const sent: Array<Record<string, unknown>> = [];
    let fetched = false;
    await respondToAvatarImageRequest({
      requestId: "request-2",
      imageUrl: "https://example.com/avatar.png"
    }, (payload) => sent.push(payload as Record<string, unknown>), (async () => {
      fetched = true;
      return new Response();
    }) as unknown as typeof fetch);
    expect(fetched).toBe(false);
    expect(sent[0]?.error).toBe("Invalid avatar image request.");
  });
});
