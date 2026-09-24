import { expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../../shared/config.js";
import { buildLightboardInstructions } from "./instructions.js";
import { parseLightboardResponse } from "./schema.js";
import { compileLightboardDescriptor } from "./prompt.js";
import { encode } from "@toon-format/toon";

const scene = { slot: 0, cast: "1girl", camera: "from above, upper body", scene: "interior, library, warm light",
  characters: [{ name: "Mira", positive: "girl on the left, adult, black hair", negative: "hat", description: "She reaches toward a book." }] };

test("all source instruction branches render without Risu macros or imports", () => {
  for (const lightboardDescription of ["high", "low", "full"] as const)
    for (const moduleMode of ["illustration", "comic"] as const)
      for (const coverImageEnabled of [false, true]) {
        const text = buildLightboardInstructions({ ...DEFAULT_CONFIG, lightboardDescription, moduleMode, coverImageEnabled,
          lightboardFocus: "Mira", lightboardDirection: "Rainy evening", lightboardCamera: 2 }, "Previous portrait tags");
        expect(text).not.toContain("{{"); expect(text).not.toContain("lb:require:");
        expect(text).toContain("Mira"); expect(text).toContain("Rainy evening");
        expect(text).toContain("characters[n]");
      }
});

test("decodes source TOON and rejects nonexistent or duplicate slots", () => {
  expect(parseLightboardResponse(`<lb-xnai>\n${encode({ scenes: [scene] })}\n</lb-xnai>`, new Set([0])).scenes[0]).toEqual(scene);
  expect(() => parseLightboardResponse(JSON.stringify({ scenes: [scene] }), new Set([1]))).toThrow("does not exist");
  expect(() => parseLightboardResponse(JSON.stringify({ scenes: [scene, scene] }), new Set([0]))).toThrow("Duplicate");
});

test("preserves source preset ordering and separate character channels", () => {
  const compiled = compileLightboardDescriptor(scene, { ...DEFAULT_CONFIG, promptSyntax: "nai", promptSeparator: "native" }, 1);
  expect(compiled.prompt).toContain("1girl, from above, upper body, interior, library");
  expect(compiled.prompt).not.toContain("black hair");
  expect(compiled.nativeCharacters?.[0]).toEqual({ name: "Mira", prompt: "girl on the left, adult, black hair. She reaches toward a book.", negative: "hat" });
  expect(compiled.rawShot.lightboard).toEqual(scene);
});

test("comic scenes keep each panel's characters and convert weights", () => {
  const compiled = compileLightboardDescriptor({ slot: 0, cast: "1girl", panels: [
    { scene: "1.2::library::", characters: scene.characters },
    { scene: "garden", characters: scene.characters }
  ] }, { ...DEFAULT_CONFIG, moduleMode: "comic", lightboardWeightMode: "convert" }, 1);
  expect(compiled.prompt).toContain("Panel 1: (library:1.2)");
  expect(compiled.prompt).toContain("panel 2");
  expect(compiled.negative).toContain("framed, outside border");
});


test("source character names are optional while appearance and description remain required", () => {
  const { name, ...unnamed } = scene.characters[0]!;
  const parsed = parseLightboardResponse(encode({ scenes: [{ ...scene, characters: [unnamed] }] }), new Set([0]));
  expect(parsed.scenes[0]!.characters![0]!.name).toBe("");
  expect(compileLightboardDescriptor(parsed.scenes[0]!, DEFAULT_CONFIG, 1).prompt).toContain("black hair");
});
