import { describe, expect, test } from "bun:test";
import {
  buildRoleList,
  chatRoleFromRow,
  foldThresholdIndex,
  foldUidFor,
  inlayUidIndex,
  isMessageFolded,
  type ChatRole
} from "./message-display.js";

/** Reference implementation of the original Lua backwards traversal. */
function originalFold(index0: number, roles: ChatRole[], displayMax: number): boolean {
  if (displayMax <= 0) return false;
  let charCount = 0;
  for (let i = roles.length; i >= 1; i--) {
    if (roles[i - 1] === "char") {
      charCount += 1;
      if (charCount > displayMax) return index0 + 1 <= i;
    }
  }
  return false;
}

describe("chat role mapping", () => {
  test("is_user maps to user; spindle_role system maps to system; else char", () => {
    expect(chatRoleFromRow({ is_user: true })).toBe("user");
    expect(chatRoleFromRow({ is_user: 1 })).toBe("user");
    expect(chatRoleFromRow({ is_user: false })).toBe("char");
    expect(chatRoleFromRow({ is_user: false, extra: { spindle_role: "system" } })).toBe("system");
    expect(chatRoleFromRow({ is_user: false, extra: { spindle_role: "assistant" } })).toBe("char");
    expect(chatRoleFromRow({ is_user: false, extra: null })).toBe("char");
    expect(chatRoleFromRow({ role: "assistant" })).toBe("char");
    expect(chatRoleFromRow({ role: "user" })).toBe("user");
    expect(chatRoleFromRow({ role: "system" })).toBe("system");
  });

  test("buildRoleList indexes by index_in_chat and id", () => {
    const list = buildRoleList([
      { id: "m1", index_in_chat: 0, is_user: true },
      { id: "m2", index_in_chat: 1, is_user: false },
      { id: "m3", index_in_chat: 2, is_user: true }
    ]);
    expect(list.roles).toEqual(["user", "char", "user"]);
    expect(list.indexById.get("m2")).toBe(1);
    expect(list.indexById.get("m3")).toBe(2);
  });

  test("buildRoleList tolerates missing index_in_chat", () => {
    const list = buildRoleList([{ id: "m1", is_user: false }, { id: "m2", is_user: true }]);
    expect(list.roles).toEqual(["char", "user"]);
  });
});

describe("folding rule (toggle_Card.Display.Max)", () => {
  test("displayMax 0 (default) never folds", () => {
    const roles: ChatRole[] = ["char", "char", "char", "char"];
    expect(foldThresholdIndex(roles, 0)).toBe(null);
    expect(isMessageFolded(0, foldThresholdIndex(roles, 0))).toBe(false);
  });

  test("fewer char messages than displayMax folds nothing", () => {
    const roles: ChatRole[] = ["user", "char", "user", "char"];
    expect(foldThresholdIndex(roles, 3)).toBe(null);
    expect(foldThresholdIndex(roles, 2)).toBe(null);
  });

  test("boundary char message itself folds (<= quirk)", () => {
    // char messages at 0-based 0 and 2; displayMax 1 -> the 2nd newest
    // char message (0-based 0, 1-based 1) is the boundary and folds.
    const roles: ChatRole[] = ["char", "user", "char"];
    const threshold = foldThresholdIndex(roles, 1);
    expect(threshold).toBe(1);
    expect(isMessageFolded(0, threshold)).toBe(true);
    expect(isMessageFolded(1, threshold)).toBe(false);
    expect(isMessageFolded(2, threshold)).toBe(false);
  });

  test("interleaved user messages between boundary and next char message stay unfolded", () => {
    // Original quirk: char at 1-based 1, 3, 5; displayMax 2 -> threshold is
    // the 3rd-newest char (1-based 1); the user message at 1-based 2 unfolds.
    const roles: ChatRole[] = ["char", "user", "char", "user", "char"];
    const threshold = foldThresholdIndex(roles, 2);
    expect(threshold).toBe(1);
    expect(isMessageFolded(0, threshold)).toBe(true);
    expect(isMessageFolded(1, threshold)).toBe(false);
    expect(isMessageFolded(2, threshold)).toBe(false);
  });

  test("counts char messages without inlays too (full chat traversal)", () => {
    // A(inlay char), B(char no inlay), C(inlay char); displayMax 2 -> A folds.
    const roles: ChatRole[] = ["char", "char", "char"];
    const threshold = foldThresholdIndex(roles, 2);
    expect(threshold).toBe(1);
    expect(isMessageFolded(0, threshold)).toBe(true);
    expect(isMessageFolded(2, threshold)).toBe(false);
  });

  test("user and system messages never count toward the threshold", () => {
    const roles: ChatRole[] = ["user", "system", "user", "char", "user"];
    const threshold = foldThresholdIndex(roles, 1);
    expect(threshold).toBe(null);
  });

  test("matches the original Lua backwards traversal on randomized chats", () => {
    let seed = 12345;
    const random = (max: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    for (let trial = 0; trial < 4000; trial++) {
      const length = random(9);
      const roles: ChatRole[] = [];
      for (let i = 0; i < length; i++) {
        const pick = random(3);
        roles.push(pick === 0 ? "char" : pick === 1 ? "user" : "system");
      }
      for (const displayMax of [0, 1, 2, 3, 5]) {
        const threshold = foldThresholdIndex(roles, displayMax);
        for (let index0 = 0; index0 < roles.length; index0++) {
          expect(isMessageFolded(index0, threshold)).toBe(originalFold(index0, roles, displayMax));
        }
      }
    }
  });
});

describe("fold uid scheme", () => {
  test("image index is 1-based like the original <CARDn> tag", () => {
    expect(inlayUidIndex("0")).toBe("1");
    expect(inlayUidIndex("2")).toBe("3");
  });

  test("missing or bad image indexes fall back to 1 (original nil fallback)", () => {
    expect(inlayUidIndex(null)).toBe("1");
    expect(inlayUidIndex("")).toBe("1");
    expect(inlayUidIndex("x")).toBe("1");
    expect(inlayUidIndex("-3")).toBe("1");
  });

  test("uid mirrors fold-ifs-r-<chatIdx>-<inlayIdx>", () => {
    expect(foldUidFor(4, "m1", "0")).toBe("fold-ifs-r-4-1");
    expect(foldUidFor(0, "m1", "2")).toBe("fold-ifs-r-0-3");
  });

  test("missing index0 falls back to a sanitized message id", () => {
    expect(foldUidFor(null, "abc/def", "0")).toBe("fold-ifs-r-abcdef-1");
    expect(foldUidFor(null, "", "0")).toBe("fold-ifs-r-x-1");
  });
});
