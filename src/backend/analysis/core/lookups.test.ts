/**
 * Guard for the string-keyed lookups into the generated slices (`amFn("name")`, `AM.name`, `AM["name"]`, named imports
 * of `auto-core`). Typecheck cannot see them, and a re-slice renames every unit (0.9.90 even reuses old minified names
 * for different functions), so every lookup the backend makes must exist in the slice, and the few whose old name now
 * belongs to a different unit are pinned to the expected behavior.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import * as autoCore from "../../pipeline/core/auto-core";
import { AM, amFn } from "./index.js";

const BACKEND = join(import.meta.dir, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "core" ? [] : sourceFiles(path);
    return /\.tsx?$/u.test(name) ? [path] : [];
  });
}

/** Every slice name the hand-written backend looks up, with the files that use it. */
function lookups(): { analysis: Map<string, string[]>; auto: Map<string, string[]> } {
  const analysis = new Map<string, string[]>();
  const auto = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, name: string, file: string) => map.set(name, [...(map.get(name) ?? []), file]);
  const files = [...sourceFiles(BACKEND), join(BACKEND, "analysis", "core", "index.ts")];
  for (const file of files) {
    if (file.endsWith("lookups.test.ts")) continue;
    const text = readFileSync(file, "utf8");
    const rel = relative(BACKEND, file);
    for (const m of text.matchAll(/amFn\(\s*"([^"]+)"/gu)) add(analysis, m[1]!, rel);
    for (const m of text.matchAll(/\bAM\.([A-Za-z_$][\w$]*)/gu)) add(analysis, m[1]!, rel);
    for (const m of text.matchAll(/\bAM\[\s*"([^"]+)"/gu)) add(analysis, m[1]!, rel);
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"[^"]*core\/auto-core"/gu))
      for (const part of m[1]!.split(",")) {
        const name = part.trim().replace(/^type\s+/u, "").split(/\s+as\s+/u)[0]!.trim();
        if (name) add(auto, name, rel);
      }
  }
  return { analysis, auto };
}

describe("generated slice lookups", () => {
  const { analysis, auto } = lookups();

  test("the scan finds the backend's lookups", () => {
    expect(analysis.size).toBeGreaterThan(50);
    expect(auto.size).toBe(3);
  });

  test("every analysis-core name the backend looks up is exported by the slice", () => {
    const missing = [...analysis].filter(([name]) => AM[name] === undefined).map(([name, files]) => `${name} (${[...new Set(files)].join(", ")})`);
    expect(missing).toEqual([]);
  });

  test("every auto-core name the backend imports is exported by the slice", () => {
    const missing = [...auto.keys()].filter((name) => typeof (autoCore as Record<string, unknown>)[name] !== "function");
    expect(missing).toEqual([]);
  });

  test("0.9.89 names that 0.9.90 reuses for other units are not looked up", () => {
    // Old name -> its 0.9.90 unit (S/engine-build/coremap.tsv). `Mc` is now a prompt compiler, `PH` / `eH` / `QOt` /
    // `N1t` / `ejt` no longer exist or are unrelated; looking one up would silently call the wrong function.
    const stale = ["Mc", "PH", "eH", "J2", "Ci", "h0t", "T_", "y_", "Hs", "sn", "Gt", "Pi", "ib", "jf", "sG", "A4", "nb", "Ds", "Gwt", "f0t", "o0t", "C0t", "Pwt", "wwt", "dhe", "X$e", "G2e", "s3e", "Qit", "Loe", "SK", "Fve"];
    expect(stale.filter((name) => analysis.has(name))).toEqual([]);
    expect(["N1t", "QOt", "ejt"].filter((name) => auto.has(name))).toEqual([]);
  });

  test("lookups with a changed unit resolve to the expected behavior", () => {
    // Three-way merge (was `Mc`, B2 fix): untouched keys keep the stored value or stay absent.
    const merged = amFn("Bs")({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 }, { a: 5, d: 6 }, (x: { id?: string }) => x?.id ?? "") as Record<string, unknown>;
    expect(merged).toEqual({ a: 5, b: 3, c: 4, d: 6 });
    // Rating policy (was `PH(prompt, nsfw, actorCount)`): `XG(prompt, rating, actorCount)`.
    const prompt = { positivePrompt: "1girl, nsfw", globalPositivePrompt: "1girl", characterPrompts: [{ prompt: "girl, rating:explicit" }] };
    expect(amFn("XG")(prompt, "sfw", 1)).toMatchObject({ positivePrompt: "sfw, 1girl", globalPositivePrompt: "sfw, 1girl", characterPrompts: [{ prompt: "girl" }] });
    expect(amFn("XG")(prompt, false, 0)).toMatchObject({ positivePrompt: "1girl", globalPositivePrompt: "1girl" });
    // Per-source settings (was `Ci`): 0.9.90 adds `fixedRating` and drops `stateAccumulationEnabled`.
    const settings = amFn("xi")({ runtime: { customImageSizes: [] }, characterPrompt: { charxGenerationDefaults: {}, charxSettings: { overrides: {} } }, jevConnection: {} }, "c1");
    expect(settings).toHaveProperty("fixedRating");
    expect(settings).not.toHaveProperty("stateAccumulationEnabled");
    // Lorebook prompt key (was `Hs`).
    expect(amFn("Is")({ key: "char-1" }, { id: "7" })).toBe("char-1::lore::7");
  });
});
