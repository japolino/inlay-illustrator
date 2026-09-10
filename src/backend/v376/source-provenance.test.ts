import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as source from "./data.js";

const referenceDirectory = new URL("../../../references/v376/", import.meta.url);
const reference = (name: string) => readFileSync(new URL(name, referenceDirectory));

// Fixed against the original extracted module, not generated from the port.
const originalRuntimeSha256 = "29fc6722354e3824f67ebb05af4cc3397c25d168ca0d693510926dd26599de64";

describe("V3.7.6 source provenance", () => {
  test("retains the original Lua bytes", () => {
    const bytes = reference("trigger_runtime.lua");
    expect(bytes.byteLength).toBe(386559);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(originalRuntimeSha256);
  });

  const artifacts = [
    ["RAW_LOREBOOK_CORE", "Card.Core.axLLM.txt"],
    ["RAW_LOREBOOK_IMAGE", "Card.Image.axLLM.txt"],
    ["RAW_LOREBOOK_FORMAT", "Card.Image.Format.txt"],
    ["RAW_LOREBOOK_PREPROCESS", "Card.Preprocess.Prompt.txt"],
    ["RAW_LOREBOOK_PREFILL", "Card.Prefill.Prompt.txt"],
    ["RAW_PRESET_1", "preset1.txt"],
    ["RAW_LOREBOOK_SYSTEM", "Card.System.axLLM.txt"],
    ["RAW_CUSTOM_MODULE_TOGGLE", "customModuleToggle.txt"],
    ["RAW_LOREBOOK_PRESETS", "Card.Presets.txt"]
  ] as const;
  for (const [constant, artifact] of artifacts) {
    test(`${constant} equals preserved ${artifact} byte for byte`, () => {
      expect(Buffer.from(source[constant], "utf8")).toEqual(reference(artifact));
    });
  }
});
