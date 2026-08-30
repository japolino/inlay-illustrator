import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, normalizeConfig, normalizeFabCorner } from "./config.js";

describe("shared configuration", () => {
  test("normalizes an empty record to independent defaults", () => {
    const first = normalizeConfig({});
    const second = normalizeConfig({});
    expect(first).toEqual(DEFAULT_CONFIG);
    expect(first.imageParameters).not.toBe(second.imageParameters);
  });

  test("restores illustration and asset settings while disabling advanced-era routing", () => {
    const config = normalizeConfig({ mode: "asset", assetImageWidth: 512, adaptiveMode: true, perspectiveMode: "creative" });
    expect(config).toMatchObject({ mode: "asset", assetImageWidth: 512 });
    expect("adaptiveMode" in config).toBeFalse();
    expect("perspectiveMode" in config).toBeFalse();
  });

  test("clamps image counts, widths, and character limits", () => {
    expect(normalizeConfig({ minImages: 10, maxImages: 2, assetImageWidth: 50, maxCharacters: 99 }))
      .toMatchObject({ minImages: 2, maxImages: 10, assetImageWidth: 120, maxCharacters: 3 });
  });

  test("preserves quote and original-reference controls", () => {
    expect(normalizeConfig({ quotesEnabled: true, quoteInstructions: " exact quote rule ", originalReference: true, originalCreationName: " Anima " }))
      .toMatchObject({ quotesEnabled: true, quoteInstructions: "exact quote rule", originalReference: true, originalCreationName: "Anima" });
  });
  test("preserves raw display-max text for Lua tonumber semantics", () => {
    expect(normalizeConfig({ displayMax: " 02.50 " }).displayMax).toBe(" 02.50 ");
    expect(normalizeConfig({ displayMax: "null" }).displayMax).toBe("null");
    expect(normalizeConfig({}).displayMax).toBe("0");
  });

  test("fab corner normalizes case, whitespace, and unknown values", () => {
    expect(normalizeFabCorner("Bottom-Left")).toBe("bottom-left");
    expect(normalizeFabCorner(" top-right ")).toBe("top-right");
    expect(normalizeFabCorner("bottom-left")).toBe("bottom-left");
    expect(normalizeFabCorner("top-right")).toBe("top-right");
    expect(normalizeFabCorner("top-left")).toBe("top-left");
    for (const bad of ["", "middle", "4", null, undefined]) {
      expect(normalizeFabCorner(bad as string | null | undefined)).toBe("bottom-right");
    }
    expect(normalizeConfig({ fabCorner: "top-left" }).fabCorner).toBe("top-left");
    expect(normalizeConfig({ fabCorner: "nonsense" } as Record<string, unknown>).fabCorner).toBe("bottom-right");
    expect(DEFAULT_CONFIG.fabCorner).toBe("bottom-right");
    expect("displayTheme" in DEFAULT_CONFIG).toBeFalse();
    expect("displayTheme" in normalizeConfig({ displayTheme: "1" } as Record<string, unknown>)).toBeFalse();
  });

});
