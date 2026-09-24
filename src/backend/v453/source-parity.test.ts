import { expect, test } from "bun:test";
import { DEFAULT_CONFIG, normalizeConfig } from "../../shared/config.js";
import { buildLightboardInstructions, lightboardBooks } from "./instructions.js";
import { cleanLightboardOutput } from "./parser.js";
import { parseLightboardResponse } from "./schema.js";
import { decodeLightboardToon } from "./toon.js";

test("every restored source prompt option renders without unresolved macros", () => {
  for (const lightboardJailbreak of ["none", "memoir", "authority"] as const)
    for (const lightboardThoughts of ["draft", "internal", "off"] as const)
      for (const lightboardForcedInsertion of [false, true])
        for (const lightboardJapanese of [false, true]) {
          const config = { ...DEFAULT_CONFIG, lightboardJailbreak, lightboardThoughts, lightboardForcedInsertion, lightboardJapanese };
          const books = lightboardBooks(config);
          const output = buildLightboardInstructions(config);
          for (const text of [output, books("lb-xnai.lb.jailbreak"), books("lb-xnai.lb.prefill"), books("lb-xnai.lb.prefill-user")]) {
            expect(text).not.toContain("{{");
            expect(text).not.toContain("lb:require:");
          }
          expect(output.includes("<lb-process>")).toBe(lightboardThoughts === "draft");
          expect(output.includes("# Thoughts Guideline")).toBe(lightboardThoughts === "internal");
          expect(output.includes("Write every generated text value in Japanese")).toBe(lightboardJapanese);
          expect(output.includes("Insert `%%`")).toBe(lightboardForcedInsertion);
        }
});

test("source illustration and comic examples survive output cleanup and decoding", () => {
  for (const moduleMode of ["illustration", "comic"] as const)
    for (const lightboardForcedInsertion of [false, true]) {
      const read = lightboardBooks({ ...DEFAULT_CONFIG, moduleMode, lightboardForcedInsertion, coverImageEnabled: true });
      const example = read(`lb-xnai.lb.example.${moduleMode === "comic" ? "comic" : "scene"}`).replaceAll("slot: ...", "slot: 5");
      const raw = `<lb-process>Example <lb-xnai>bad draft</lb-xnai></lb-process>\n${example}`;
      const response = parseLightboardResponse(cleanLightboardOutput(raw, lightboardForcedInsertion), new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), moduleMode === "comic");
      expect(response.scenes).toHaveLength(2);
      expect(response.keyvis).toBeDefined();
      expect(JSON.stringify(response)).not.toContain("%%");
    }
});

test("source decoder keeps bare strings, implicit lists, tabular rows, and nested list siblings", () => {
  expect(decodeLightboardToon('scene: library: warm light\ncharacters:\n  - name: Mira\n    positive: black hair\n  - name: Ren\n    positive: red hair')).toEqual({ scene: "library: warm light", characters: [{ name: "Mira", positive: "black hair" }, { name: "Ren", positive: "red hair" }] });
  expect(decodeLightboardToon('people[2]{name,tags}:\n  Mira,black hair\n  Ren,red hair')).toEqual({ people: [{ name: "Mira", tags: "black hair" }, { name: "Ren", tags: "red hair" }] });
  expect(decodeLightboardToon('items[2]:\n  - tags[2]: a,b\n    name: first\n  - tags[1]: c\n    name: second')).toEqual({ items: [{ tags: ["a", "b"], name: "first" }, { tags: ["c"], name: "second" }] });
  expect(decodeLightboardToon('scene: "He says \\"hello\\"."')).toEqual({ scene: 'He says "hello".' });
});

test("source array-count validation remains in place without new rejection rules", () => {
  expect(() => decodeLightboardToon("scenes[4]:\n  - scene: garden")).toThrow("Array length mismatch: expected 4, got 1");
  expect(() => decodeLightboardToon("items[1]:\n   - bad")).toThrow("Indentation");
});

test("key visual alone is valid and optional null metadata is ignored", () => {
  const keyvis = { camera: "wide", cast: "1girl", scene: "garden", characters: [{ positive: "black hair", description: "Standing.", negative: null }] };
  const response = parseLightboardResponse(JSON.stringify({ keyvis }), new Set());
  expect(response.scenes).toEqual([]);
  expect(response.keyvis!.characters![0]!.negative).toBeUndefined();
});

test("source option settings survive persistence normalization", () => {
  expect(normalizeConfig({ lightboardJailbreak: "authority", lightboardThoughts: "internal", lightboardForcedInsertion: true, lightboardJapanese: true, lightboardReiterations: 2 })).toMatchObject({ lightboardJailbreak: "authority", lightboardThoughts: "internal", lightboardForcedInsertion: true, lightboardJapanese: true, lightboardReiterations: 2 });
});
