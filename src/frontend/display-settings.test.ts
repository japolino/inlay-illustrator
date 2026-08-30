import { beforeEach, describe, expect, test } from "bun:test";
import {
  applyDisplaySettingsSnapshot,
  getDisplayMax,
  getDisplayMaxRaw,
  parseDisplayMax,
  resetDisplaySettings,
  setDisplayMax,
  subscribeDisplaySettings
} from "./display-settings.js";

beforeEach(() => resetDisplaySettings());

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

  test("listeners fire for local writes and authoritative changes only", () => {
    let calls = 0;
    const unsubscribe = subscribeDisplaySettings(() => { calls += 1; });
    setDisplayMax("3");
    applyDisplaySettingsSnapshot({ displayMax: "3" });
    applyDisplaySettingsSnapshot({ displayMax: "5" });
    unsubscribe();
    expect(calls).toBe(2);
  });
});
