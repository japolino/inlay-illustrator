import { afterEach, describe, expect, test } from "bun:test";
import { createFakeHost } from "./testing/fake-host.js";
import { findLegacyImage, listInlayGallery } from "./legacy-records.js";

const root = globalThis as typeof globalThis & { spindle?: unknown };
afterEach(() => {
  delete root.spindle;
});

describe("legacy 0.9.x records (read only)", () => {
  test("gallery and lookup over states/ + records/ (V3 slots and parallel arrays)", async () => {
    const fake = createFakeHost();
    root.spindle = fake.host;
    fake.addChat({ id: "chat1", character_id: "c1", name: "Old chat" });
    fake.addCharacter({ id: "c1", name: "Alice" });
    fake.files.set("states/chat1.json", JSON.stringify({ generated: { "k:m1:0": { recordPath: "records/chat1/a.json" }, "k:m2:1": { imageUrls: ["/u2"], imageIds: ["i2"], prompts: ["p2"] } } }));
    fake.files.set("records/chat1/a.json", JSON.stringify({ messageId: "m1", swipeId: 0, slots: [{ imageId: "i1", imageUrl: "/u1", paragraph: 2, prompt: "p1" }] }));
    fake.files.set("states/broken.json", "{oops");
    const gallery = await listInlayGallery(fake.userId, 1);
    expect(gallery.chatIds).toEqual(["broken", "chat1"]);
    const chat = gallery.chats.find((c) => c.chatId === "chat1")!;
    expect(chat).toMatchObject({ name: "Old chat", cardName: "Alice", messageCount: 2, branchCount: 1 });
    expect(chat.images.map((i) => [i.messageId, i.imageId, i.paragraph])).toEqual([["m1", "i1", 2], ["m2", "i2", 1]]);
    const found = await findLegacyImage({ chatId: "chat1", imageUrl: "/u2" }, fake.userId);
    expect(found?.record.slots[found.index]?.prompt).toBe("p2");
    expect(await findLegacyImage({ chatId: "none", imageId: "x" }, fake.userId)).toBeNull();
  });
});
