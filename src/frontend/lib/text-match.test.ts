import { describe, expect, test } from "bun:test";
import { matchRank, matchesQuery, toChosung, toJamo } from "./text-match.js";

describe("text-match", () => {
  test("substring tokens (NFKC, case-insensitive)", () => {
    expect(matchesQuery("", ["anything"])).toBe(true);
    expect(matchesQuery("ARIA wan", ["Aria the Wanderer"])).toBe(true);
    expect(matchesQuery("aria x", ["Aria the Wanderer"])).toBe(false);
    expect(matchesQuery("ｍｉｎａ", ["Kim Mina"])).toBe(true);
  });
  test("Hangul jamo and chosung", () => {
    expect(toJamo("서연")).toBe("ㅅㅓㅇㅕㄴ");
    expect(toChosung("한서연")).toBe("ㅎㅅㅇ");
    expect(matchesQuery("서ㅇ", ["한서연"])).toBe(true);
    expect(matchesQuery("ㅎㅅㅇ", ["한서연 Academy"])).toBe(true);
    expect(matchesQuery("ㅅㅇ", ["한서연"])).toBe(true);
    expect(matchesQuery("ㅁㅇ", ["한서연"])).toBe(false);
    expect(matchesQuery("과", ["사과나무"])).toBe(true);
  });
  test("rank", () => {
    expect(matchRank("min", "Mina")).toBe(0);
    expect(matchRank("ina", "Mina")).toBe(1);
    expect(matchRank("ㅁㅇ", "민아")).toBe(2);
    expect(matchRank("zz", "Mina")).toBe(-1);
  });
});
