import { beforeEach, describe, expect, test } from "bun:test";
import {
  applyDisplaySettingsSnapshot,
  configureDisplayModeTransport,
  getDisplayMax,
  getDisplayMaxRaw,
  getDisplayMode,
  isValidDisplayMode,
  normalizeDisplayMode,
  parseDisplayMax,
  resetDisplaySettings,
  setDisplayMax,
  setDisplayMode,
  subscribeDisplaySettings
} from "./display-settings.js";

beforeEach(() => resetDisplaySettings());

describe("display mode normalization (Card.Inlay.Display)", () => {
  test("preserves the original missing/null-string/empty quirks", () => {
    expect(normalizeDisplayMode(null)).toBe("0");
    expect(normalizeDisplayMode(undefined)).toBe("0");
    expect(normalizeDisplayMode("null")).toBe("0");
    expect(normalizeDisplayMode("")).toBe("0");
    expect(normalizeDisplayMode(" 0")).toBe(" 0");
    expect(normalizeDisplayMode("weird")).toBe("weird");
  });

  test("valid UI modes are exactly 0..3", () => {
    for (const mode of ["0", "1", "2", "3"]) expect(isValidDisplayMode(mode)).toBe(true);
    expect(isValidDisplayMode("4")).toBe(false);
    expect(isValidDisplayMode("")).toBe(false);
  });

  test("state snapshots stay isolated per chat", () => {
    applyDisplaySettingsSnapshot({ chatId: "chat-a", displayMode: "2" });
    applyDisplaySettingsSnapshot({ chatId: "chat-b", displayMode: "1" });
    expect(getDisplayMode("chat-a")).toBe("2");
    expect(getDisplayMode("chat-b")).toBe("1");
    expect(getDisplayMode("chat-c")).toBe("0");
  });

  test("writes update immediately and use the configured backend transport", () => {
    const sent: Array<{ chatId: string; displayMode: string }> = [];
    const stop = configureDisplayModeTransport((payload) => sent.push(payload));
    setDisplayMode("chat-a", "3");
    expect(getDisplayMode("chat-a")).toBe("3");
    expect(sent).toEqual([{ chatId: "chat-a", displayMode: "3" }]);
    stop();
    setDisplayMode("chat-a", "1");
    expect(sent.length).toBe(1);
  });

  test("listeners fire for local writes and authoritative changes only", () => {
    let calls = 0;
    const unsubscribe = subscribeDisplaySettings(() => { calls += 1; });
    setDisplayMode("chat-a", "1");
    applyDisplaySettingsSnapshot({ chatId: "chat-a", displayMode: "1" });
    applyDisplaySettingsSnapshot({ chatId: "chat-a", displayMode: "2" });
    unsubscribe();
    expect(calls).toBe(2);
  });
});

describe("display max parsing (toggle_Card.Display.Max)", () => {
  test("matches tonumber(value) or 0", () => {
    for (const value of [null, undefined, "", "abc", "10abc", true]) expect(parseDisplayMax(value)).toBe(0);
    expect(parseDisplayMax("5")).toBe(5);
    expect(parseDisplayMax(" 7 ")).toBe(7);
    expect(parseDisplayMax("-2.5")).toBe(-2.5);
    expect(parseDisplayMax(Number.NaN)).toBe(0);
  });

  test("keeps raw text byte-for-byte while parsing at display time", () => {
    setDisplayMax(" 02.50 ");
    expect(getDisplayMaxRaw()).toBe(" 02.50 ");
    expect(getDisplayMax()).toBe(2.5);
    applyDisplaySettingsSnapshot({ displayMax: "null" });
    expect(getDisplayMaxRaw()).toBe("null");
    expect(getDisplayMax()).toBe(0);
  });
});
