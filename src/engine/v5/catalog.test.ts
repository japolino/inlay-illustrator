// Parity fixtures: src/engine/__fixtures__/v5/catalog.json
// Generator: cd C:/Users/eme4/asset-maid-port/scratch/engine/v5 && bun gen-catalog.mjs
import { describe, expect, test } from "bun:test";
import fixture from "../__fixtures__/v5/catalog.json";
import rawConfigJson from "../core/data/v5-raw-config.json";
import { toPlain } from "../testing/plain";
import {
  V5_COMPILER_VERSION,
  V5_RAW_CONFIG,
  assertV5RawConfig,
  canonicalV5Json,
  compileV5Catalog,
  fnv1a64V5,
  getDefaultV5Catalog,
  getV5CatalogFingerprint,
  isV5RawValidationError,
  NovelAIV5RawValidationError,
  validateV5RawConfig,
} from "./catalog";

const plain = (v: unknown) => JSON.parse(JSON.stringify(toPlain(v)));
const base = () => JSON.parse(JSON.stringify(rawConfigJson));

/** Decode the toPlain markers used in the vector inputs. */
function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (o.__undefined__ === true) return undefined;
    if (typeof o.__number__ === "string") return Number(o.__number__);
    if (typeof o.__bigint__ === "string") return BigInt(o.__bigint__);
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, decode(v)]));
  }
  return value;
}

// Same edits as gen-catalog.mjs.
const broken: Record<string, () => unknown> = {
  "not-an-object": () => 42,
  "schema-status": () => ({ ...base(), schema: "novelai-v5", status: "active", revision: 2 }),
  "unknown-fields": () => { const r = base(); r.extra = true; r.modifierLibrary.closed[1].options[0].colour = "red"; return r; },
  "selectable-sizes": () => {
    const r = base();
    r.stages.frame_placement.sizes = r.stages.frame_placement.sizes.map((s: Record<string, unknown>) => {
      if (s.id !== 5) return s;
      const { analyzerSelectable: _drop, ...x } = s;
      return x;
    });
    return r;
  },
  "bad-rule": () => {
    const r = base();
    r.modifierLibrary.closed[3].rules = [{ when: { provider: "novelai" }, add: { prompt: { "nowhere.tag": ["x"] } } }, { route: { prompt: { source: "bound_source" } } }];
    return r;
  },
  "other-option-id": () => { const r = base(); r.modifierLibrary.closed[4].options.push({ id: "other", prompt: null }); return r; },
  "missing-interaction-tag": () => {
    const r = base();
    delete r.stages.interaction.definitions[0].prompt.tag;
    r.stages.interaction.definitions[1].allowedModes = ["sideways"];
    return r;
  },
};
const modified: Record<string, (r: any) => void> = {
  "weight-change": (r) => { r.modifierLibrary.closed[3].options[0].prompt = [[1.2, "indoors"]]; },
  "new-option": (r) => { r.modifierLibrary.closed[4].options.push({ id: "dawn", prompt: [[1, "dawn"]], description: "Early morning light." }); },
  "new-interaction": (r) => {
    r.stages.interaction.definitions.push({ id: "high_five", allowedModes: ["mutual"], defaultMode: "mutual", promptTarget: "relation", prompt: { tag: [[1, "high five"]] }, description: "Two actors slap raised palms." });
  },
};

describe("v5 catalog", () => {
  test("built-in raw config and default catalog", () => {
    expect(JSON.parse(JSON.stringify(V5_RAW_CONFIG))).toEqual(rawConfigJson);
    const c = getDefaultV5Catalog();
    const d = fixture.defaultCatalog;
    expect(c.compilerVersion).toBe(V5_COMPILER_VERSION);
    expect(plain(c.hashes)).toEqual(d.hashes);
    expect(plain(c.stats)).toEqual(d.stats);
    expect(getV5CatalogFingerprint(c)).toBe(d.fingerprint);
    expect(plain(c.sizes)).toEqual(d.sizes);
    expect(plain(c.analyzer.sizes)).toEqual(d.analyzerSizes);
    expect(plain(c.interactions.get("hug"))).toEqual(d.interaction0);
    expect(plain(c.definitions.get("framing.crop"))).toEqual(d.definition0);
    expect(plain(c.weights)).toEqual(d.weights);
    expect(c.prompts.entries.length).toBe(d.promptEntryCount);
  });

  for (const [name, make] of Object.entries(broken)) {
    test(`diagnostics: ${name}`, () => {
      const expected = (fixture.diagnostics as Record<string, { result: unknown; error: unknown }>)[name];
      expect(plain(validateV5RawConfig(make()))).toEqual(expected.result);
      let error: unknown = null;
      try {
        compileV5Catalog(make());
      } catch (e) {
        expect(isV5RawValidationError(e)).toBe(true);
        expect(e).toBeInstanceOf(NovelAIV5RawValidationError);
        const err = e as NovelAIV5RawValidationError;
        error = { name: err.name, message: err.message, diagnostics: err.diagnostics };
      }
      expect(plain(error)).toEqual(expected.error);
      expect(() => assertV5RawConfig(make())).toThrow((expected.error as { message: string }).message);
    });
  }

  for (const [name, edit] of Object.entries(modified)) {
    test(`hashes of a modified raw config: ${name}`, () => {
      const raw = base();
      edit(raw);
      const c = compileV5Catalog(raw);
      const expected = (fixture.modified as Record<string, Record<string, unknown>>)[name];
      expect(plain(c.hashes)).toEqual(expected.hashes);
      expect(plain(c.stats)).toEqual(expected.stats);
      expect(getV5CatalogFingerprint(c)).toBe(expected.fingerprint as string);
      expect(plain(c.diagnostics)).toEqual(expected.diagnostics);
      const sample = name === "new-interaction" ? c.interactions.get("high_five") : c.definitions.get(name === "new-option" ? "scene.time" : "scene.environment");
      expect(plain(sample)).toEqual(expected.sample);
    });
  }

  test("canonical JSON and FNV-1a-64 vectors", () => {
    for (const vector of fixture.vectors as { value: unknown; canonical?: string; hash?: string; error?: { name: string; message: string } }[]) {
      const value = decode(vector.value);
      if (vector.error) {
        expect(() => canonicalV5Json(value)).toThrow(vector.error.message);
        continue;
      }
      expect(canonicalV5Json(value)).toBe(vector.canonical!);
      expect(fnv1a64V5(value)).toBe(vector.hash!);
    }
  });
});
