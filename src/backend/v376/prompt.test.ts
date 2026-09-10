import { describe, expect, test } from "bun:test";
import {
  applyPreset,
  buildCharacterPromptGroups,
  compileV376Payload,
  compileV376Shot,
  convertConfigPresetToSourceDsl,
  decodePlaceholders,
  extractLLMPrompts,
  extractPresetSections,
  joinPromptParts,
  postProcessPrompt,
  removeDuplicateTags,
  resolvePresetContent,
} from "./prompt.js";
import { filterStandaloneGenderTags, normalizeCharacterData } from "./schema.js";
import { RAW_PRESET_1 } from "./data.js";
import type { V376Payload, V376Shot } from "./types.js";
import { DEFAULT_CONFIG, normalizeConfig } from "../../shared/config.js";

describe("V3.7.6 Prompt Assembly - Source-Faithful Pipeline", () => {
  describe("removeDuplicateTags", () => {
    test("deduplicates tags within pipe segment case-insensitively while preserving order", () => {
      const input = "1girl, blonde hair, Long Hair, blue eyes, 1girl, long hair | 1boy, brown hair, Brown Hair";
      const result = removeDuplicateTags(input);
      expect(result).toBe("1girl, blonde hair, Long Hair, blue eyes | 1boy, brown hair");
    });

    test("preserves newlines and multi-line pipe segments", () => {
      const input = "tagA, tagB, taga\n| tagC, tagc, tagD";
      const result = removeDuplicateTags(input);
      expect(result).toBe("tagA, tagB\n | tagC, tagD");
    });
  });

  describe("extractPresetSections", () => {
    test("extracts [Positive] and [Negative] case-insensitively", () => {
      const preset = `[Positive]\nmasterpiece, high quality\n[Negative]\nworst quality, bad anatomy`;
      const { positive, negative } = extractPresetSections(preset);
      expect(positive).toBe("masterpiece, high quality");
      expect(negative).toBe("worst quality, bad anatomy");
    });

    test("handles preset with only [Positive]", () => {
      const preset = `[Positive]\nartist:style, vibrant`;
      const { positive, negative } = extractPresetSections(preset);
      expect(positive).toBe("artist:style, vibrant");
      expect(negative).toBe("");
    });

    test("returns entire content as positive if no section markers exist", () => {
      const preset = "simple tag list, year 2025";
      const { positive, negative } = extractPresetSections(preset);
      expect(positive).toBe("simple tag list, year 2025");
      expect(negative).toBe("");
    });
  });

  describe("decodePlaceholders", () => {
    test("replaces BP and SE placeholder codes with anatomical and scene terms", () => {
      const encoded = "1girl, SE1, SE5, BP1, BP3, SE6";
      const decoded = decodePlaceholders(encoded);
      expect(decoded).toBe("1girl, nsfw, nude, nipples, pussy, sex");
    });

    test("leaves non-placeholder text untouched", () => {
      const text = "1girl, holding sword, castle in background";
      expect(decodePlaceholders(text)).toBe(text);
    });
  });

  describe("buildCharacterPromptGroups & tag filtering", () => {
    test("filters exact standalone gender tags from appearance but retains compound tags", () => {
      const characters = [
        {
          name: "Alice",
          label: "girl",
          age: "young girl",
          appearance: "girl, 1girl, tall girl, blonde hair, blue eyes",
          attire: "school uniform",
          expression: "smile",
          action: "waving",
        },
      ];

      const groups = buildCharacterPromptGroups(characters, " | ");
      // "girl" and "1girl" removed from appearance; "tall girl" retained
      expect(groups.positive).toContain("tall girl");
      expect(groups.positive).not.toContain("young girl, girl,");
      expect(groups.positive).not.toContain(", 1girl,");
      expect(groups.positive).toBe("girl, young girl, tall girl, blonde hair, blue eyes, school uniform, smile, waving");
    });

    test("appends supplement details if supplement option is enabled", () => {
      const characters = [
        {
          name: "Hero",
          label: "boy",
          age: "teen",
          appearance: "black hair",
          attire: "armor",
          supplement: { pose: "kneeling on ground", action: "holding glowing blade" },
        },
      ];

      const groupsWithSupp = buildCharacterPromptGroups(characters, " | ", { supplement: true });
      expect(groupsWithSupp.positive).toContain("kneeling on ground, holding glowing blade");

      const groupsWithoutSupp = buildCharacterPromptGroups(characters, " | ", { supplement: false });
      expect(groupsWithoutSupp.positive).not.toContain("kneeling on ground");
    });

    test("injects name right after label if originalReference is true and character is not OC", () => {
      const characters = [
        {
          name: "Asuka Langley",
          label: "girl",
          age: "teen",
          appearance: "red hair, blue eyes",
          attire: "plugsuit",
        },
        {
          name: "Custom (oc)",
          label: "girl",
          age: "teen",
          appearance: "silver hair",
          attire: "dress",
        },
      ];

      const groups = buildCharacterPromptGroups(characters, " | ", { originalReference: true });
      // Asuka should have name inserted right after label: "girl, Asuka Langley, teen..."
      expect(groups.positive).toContain("girl, Asuka Langley, teen, red hair, blue eyes, plugsuit");
      // OC character should NOT have name inserted: "girl, teen, silver hair, dress"
      expect(groups.positive).toContain("girl, teen, silver hair, dress");
      expect(groups.positive).not.toContain("Custom (oc)");
    });
  });

  describe("extractLLMPrompts replacements", () => {
    test("applies keyword replacements: from front -> straight-on, young girl -> loli, young boy -> shota", () => {
      const shot: V376Shot = {
        paragraph: 1,
        camera: "from front, eye level",
        scene: "classroom, interior",
        action: "sitting",
        characters: [
          {
            name: "Girl A",
            label: "girl",
            age: "young girl",
            appearance: "black hair",
            attire: "uniform",
          },
          {
            name: "Boy B",
            label: "boy",
            age: "young boy",
            appearance: "brown hair",
            attire: "uniform",
          },
        ],
      };

      const extracted = extractLLMPrompts(shot, { mode: "illustration" });
      expect(extracted.setupPrompt).toContain("straight-on");
      expect(extracted.setupPrompt).not.toContain("from front");
      expect(extracted.charPositive).toContain("loli");
      expect(extracted.charPositive).toContain("shota");
      expect(extracted.charPositive).not.toContain("young girl");
      expect(extracted.charPositive).not.toContain("young boy");
    });
  });

  describe("applyPreset template substitution and syntax", () => {
    test("replaces {prompt} and escapes parens in NAI mode", () => {
      const preset = "[Positive]\n1.2::masterpiece::, {prompt}, sharp focus\n[Negative]\nlowres, bad hands";
      const applied = applyPreset("straight-on, classroom", "1girl, loli (ahemaru)", "bad eyes", preset, {
        syntax: "nai",
        separator: "pipe",
      });

      // Parens escaped for NovelAI attention safety
      expect(applied.positive).toContain("1girl, loli \\(ahemaru\\)");
      expect(applied.positive).toContain("1.2::masterpiece::, straight-on, classroom | 1girl, loli \\(ahemaru\\), sharp focus");
      expect(applied.negative).toBe("lowres, bad hands, bad eyes");
    });

    test("converts curly braces to parens and merges newlines in ComfyUI mode", () => {
      const preset = "[Positive]\n{masterpiece}, dynamic lighting\n[Negative]\nlowres";
      const applied = applyPreset("classroom", "1girl, blonde hair", "", preset, {
        syntax: "comfyui",
        separator: "pipe",
      });

      const postProcessed = postProcessPrompt(applied.positive, { syntax: "comfyui" });
      expect(postProcessed).toContain("(masterpiece)");
      expect(postProcessed).not.toContain("{masterpiece}");
    });

    test("protects dual-pipe ||...|| blocks during pipe normalization", () => {
      const preset = "[Positive]\n{prompt}\n[Negative]\nlowres";
      const applied = applyPreset("setup", "tag1 ||protected | block|| tag2", "", preset, {
        syntax: "nai",
        separator: "pipe",
      });
      expect(applied.positive).toContain("||protected | block||");
    });
  });

  describe("compileV376Shot & compileV376Payload - Mode Parity", () => {
    test("Illustration Mode with NAI V4 native channels", () => {
      const payload: V376Payload = {
        scenes: [
          {
            place: "classroom, sunset",
            shots: [
              {
                paragraph: 1,
                camera: "from front, cowboy shot",
                situation: "1girl, solo",
                scene: "classroom, sunset",
                action: "reading book",
                characters: [
                  {
                    name: "Alice",
                    label: "girl",
                    age: "young girl",
                    appearance: "blonde hair, blue eyes",
                    attire: "school uniform",
                    expression: "smile",
                    action: "reading",
                    negative: "bad hands",
                  },
                ],
              },
            ],
          },
        ],
      };

      const compiled = compileV376Payload(payload, {
        mode: "illustration",
        separator: "native",
        syntax: "nai",
      });

      expect(compiled).toHaveLength(1);
      const shot = compiled[0];
      expect(shot.paragraph).toBe(1);

      // Base prompt has setup, does NOT flatten characters
      expect(shot.prompt).toContain("straight-on, cowboy shot");
      expect(shot.prompt).not.toContain("blonde hair");

      // Character is in nativeCharacters paired channel
      expect(shot.nativeCharacters).toBeDefined();
      expect(shot.nativeCharacters).toHaveLength(1);
      const nativeChar = shot.nativeCharacters![0];
      expect(nativeChar.name).toBe("Alice");
      expect(nativeChar.prompt).toContain("loli");
      expect(nativeChar.prompt).toContain("blonde hair, blue eyes, school uniform, smile, reading");
      expect(nativeChar.negative).toBe("bad hands");
    });

    test("Illustration Mode with String / Pipe fallback merges characters with pipe delimiter", () => {
      const payload: V376Payload = {
        scenes: [
          {
            place: "park, day",
            shots: [
              {
                paragraph: 2,
                camera: "wide shot",
                scene: "park, sunny",
                characters: [
                  {
                    name: "Alice",
                    label: "girl",
                    age: "teen",
                    appearance: "blonde hair",
                    attire: "sundress",
                  },
                  {
                    name: "Bob",
                    label: "boy",
                    age: "teen",
                    appearance: "brown hair",
                    attire: "t-shirt",
                  },
                ],
              },
            ],
          },
        ],
      };

      const compiled = compileV376Payload(payload, {
        mode: "illustration",
        separator: "pipe",
        syntax: "nai",
      });

      expect(compiled).toHaveLength(1);
      const shot = compiled[0];
      // In string mode, characters are merged into prompt with pipe delimiter
      expect(shot.prompt).toContain(" | ");
      expect(shot.prompt).toContain("blonde hair, sundress");
      expect(shot.prompt).toContain("brown hair, t-shirt");
      expect(shot.nativeCharacters).toBeUndefined();
    });

    test("Asset Mode adds required portrait, cowboy shot, white background and looking at viewer", () => {
      const payload: V376Payload = {
        scenes: [
          {
            place: "white background, simple background",
            shots: [
              {
                paragraph: 1,
                camera: "upper body",
                characters: [
                  {
                    name: "CharA",
                    label: "girl",
                    age: "teen",
                    appearance: "twin braids, green eyes",
                    attire: "maid outfit",
                  },
                ],
              },
            ],
          },
        ],
      };

      const compiled = compileV376Payload(payload, {
        mode: "asset",
        separator: "pipe",
        syntax: "nai",
      });

      const shot = compiled[0];
      expect(shot.prompt).toContain("white background, simple background");
      expect(shot.prompt).toContain("portrait, cowboy shot");
      expect(shot.prompt).toContain("looking at viewer");
    });

    test("Comic Mode formats placement, extra tags, panels, and panel character channels", () => {
      const payload: V376Payload = {
        scenes: [
          {
            place: "rooftop, night",
            shots: [
              {
                paragraph: 1,
                placement: "two panel split horizontal",
                characters: [
                  {
                    name: "Hero",
                    label: "boy",
                    age: "teen",
                    appearance: "black hair",
                    attire: "hoodie",
                  },
                ],
                panels: [
                  { number: "1", composition: "looking up at stars", text: "speech bubble saying \"wow\"" },
                  { number: "2", composition: "close up on eyes", text: "" },
                ],
              },
            ],
          },
        ],
      };

      const compiled = compileV376Payload(payload, {
        mode: "comic",
        separator: "native",
        syntax: "nai",
      });

      const shot = compiled[0];
      expect(shot.prompt).toContain("comic panel, manga panel, ultra complexity");
      expect(shot.panelsPrompt).toBe("panel 1, looking up at stars, speech bubble saying \"wow\" | panel 2, close up on eyes");

      // In NAI V4 mode, comic panels are added to nativeCharacters
      expect(shot.nativeCharacters).toBeDefined();
      expect(shot.nativeCharacters).toHaveLength(3); // 1 character + 2 panels
      expect(shot.nativeCharacters![0].name).toBe("Hero");
      expect(shot.nativeCharacters![1].prompt).toBe("panel 1, looking up at stars, speech bubble saying \"wow\"");
      expect(shot.nativeCharacters![2].prompt).toBe("panel 2, close up on eyes");
    });

    test("Appearance cache negative tags are injected per character", () => {
      const payload: V376Payload = {
        scenes: [
          {
            place: "indoor gym",
            shots: [
              {
                paragraph: 1,
                characters: [
                  {
                    name: "Mona",
                    label: "girl",
                    age: "adult",
                    appearance: "purple hair",
                    attire: "swimsuit",
                    negative: "bad arms",
                  },
                ],
              },
            ],
          },
        ],
      };

      const compiled = compileV376Payload(payload, {
        mode: "illustration",
        separator: "native",
        syntax: "nai",
        appearanceMap: {
          Mona: { negTags: "extra nipples, distorted hat" },
        },
      });

      const shot = compiled[0];
      expect(shot.nativeCharacters).toBeDefined();
      const char = shot.nativeCharacters![0];
      // Combines shot negative ("bad arms") with appearanceMap negative tags
      expect(char.negative).toBe("bad arms, extra nipples, distorted hat");
    });

    test("Preserves customPos (prefix) and customNeg (suffix) and customNegative correctly", () => {
      const payload: V376Payload = {
        scenes: [
          {
            place: "beach",
            shots: [
              {
                paragraph: 1,
                characters: [
                  {
                    name: "BeachGirl",
                    label: "girl",
                    age: "teen",
                    appearance: "red bikini",
                    attire: "straw hat",
                  },
                ],
              },
            ],
          },
        ],
      };

      const compiled = compileV376Payload(payload, {
        mode: "illustration",
        separator: "pipe",
        syntax: "nai",
        customPositivePrefix: "artist:favorite_painter",
        customPositiveSuffix: "cinematic sunset bloom",
        customNegative: "worst face, monochrome",
      });

      const shot = compiled[0];
      expect(shot.prompt.startsWith("artist:favorite_painter, ")).toBe(true);
      expect(shot.prompt.endsWith(", cinematic sunset bloom")).toBe(true);
      expect(shot.negative).toContain("worst face, monochrome");
    });

    test("Legacy string mode with ComfyUI syntax formats character appearance negatives as (neg:-1) in positive", () => {
      const payload: V376Payload = {
        scenes: [
          {
            place: "room",
            shots: [
              {
                paragraph: 1,
                characters: [
                  {
                    name: "Alice",
                    label: "girl",
                    age: "teen",
                    appearance: "blonde hair",
                    attire: "shirt",
                  },
                ],
              },
            ],
          },
        ],
      };

      const compiled = compileV376Payload(payload, {
        mode: "illustration",
        separator: "pipe",
        syntax: "comfyui",
        appearanceMap: {
          Alice: { negTags: "extra arms" },
        },
      });

      const shot = compiled[0];
      // In comfyui legacy mode, negTags is formatted as (extra arms:-1) inside positive
      expect(shot.prompt).toContain("(extra arms:-1)");
      expect(shot.nativeCharacters).toBeUndefined();
    });

    test("Legacy string mode with NAI syntax formats character appearance negatives as -1::neg:: in positive", () => {
      const payload: V376Payload = {
        scenes: [
          {
            place: "room",
            shots: [
              {
                paragraph: 1,
                characters: [
                  {
                    name: "Alice",
                    label: "girl",
                    age: "teen",
                    appearance: "blonde hair",
                    attire: "shirt",
                  },
                ],
              },
            ],
          },
        ],
      };

      const compiled = compileV376Payload(payload, {
        mode: "illustration",
        separator: "pipe",
        syntax: "nai",
        appearanceMap: {
          Alice: { negTags: "extra arms" },
        },
      });

      const shot = compiled[0];
      // In NAI legacy mode, negTags is formatted as -1::extra arms:: inside positive
      expect(shot.prompt).toContain("-1::extra arms::");
      expect(shot.nativeCharacters).toBeUndefined();
    });

    test("Accepts AppConfig-like object with moduleMode, promptSeparator, promptSyntax", () => {
      const payload: V376Payload = {
        scenes: [
          {
            place: "cafe",
            shots: [
              {
                paragraph: 3,
                characters: [
                  {
                    name: "Barista",
                    label: "boy",
                    age: "teen",
                    appearance: "brown hair",
                    attire: "apron",
                  },
                ],
              },
            ],
          },
        ],
      };

      const configLike = {
        moduleMode: "illustration" as const,
        promptSeparator: "native" as const,
        promptSyntax: "nai" as const,
        customPositivePrefix: "masterpiece",
        customPositiveSuffix: "best quality",
        negativeAffix: "extra fingers",
      };

      const compiled = compileV376Payload(payload, configLike);
      expect(compiled).toHaveLength(1);
      const shot = compiled[0];
      expect(shot.paragraph).toBe(3);
      expect(shot.prompt.startsWith("masterpiece, ")).toBe(true);
      expect(shot.negative).toContain("extra fingers");
      expect(shot.nativeCharacters).toBeDefined();
    });

  describe("Audit Parity Fixtures (src/evals/v376-parity/fixtures/fixtures.json)", () => {
    test("verifies tag filtering & replacements fixtures", () => {
      // 1. Standalone gender filtering
      const filtered = filterStandaloneGenderTags("girl, short blue hair, blue eyes, tall boy, 1girl, 1boy, school uniform");
      expect(filtered).toBe("short blue hair, blue eyes, tall boy, school uniform");

      // 2. Keyword replacements
      const shot: V376Shot = {
        paragraph: 1,
        camera: "wide shot, from front",
        scene: "young girl sitting",
        characters: [
          {
            name: "CharA",
            label: "girl",
            age: "young girl",
            appearance: "blonde hair, blue eyes",
            attire: "",
          },
          {
            name: "CharB",
            label: "boy",
            age: "young boy",
            appearance: "brown hair",
            attire: "",
          },
        ],
      };
      const extracted = extractLLMPrompts(shot, { mode: "illustration" });
      expect(extracted.setupPrompt).toContain("wide shot, straight-on, loli sitting");
      expect(extracted.charPositive).toBe("girl, loli, blonde hair, blue eyes | boy, shota, brown hair");

      // 3. Scoped deduplication
      const deduplicated = removeDuplicateTags("solo, blonde hair, blue eyes, solo, smiling | solo, blue eyes, red dress, solo");
      expect(deduplicated).toBe("solo, blonde hair, blue eyes, smiling | solo, blue eyes, red dress");
    });

    test("verifies character normalization fixtures", () => {
      // Canon char, original on, supplement on
      const char1 = normalizeCharacterData(
        {
          name: "Asuka Langley Soryu (Evangelion)",
          label: "girl",
          age: "",
          appearance: "girl, long orange hair, blue eyes",
          body: "slender",
          attire: "plugsuit",
          expression: "smirk",
          action: "arms crossed",
          supplement: {
            pose: "standing proud",
            action: "glaring",
          },
        },
        { originalReference: true, supplement: true } as any
      );
      expect(char1.positive).toBe(
        "girl, Asuka Langley Soryu (Evangelion), long orange hair, blue eyes, slender, plugsuit, smirk, arms crossed, standing proud, glaring"
      );
      expect(char1.identity).toBe("girl, long orange hair, blue eyes, slender, plugsuit");

      // Canon char, original off, supplement on
      const char2 = normalizeCharacterData(
        {
          name: "Asuka Langley Soryu (Evangelion)",
          label: "girl",
          age: "",
          appearance: "girl, long orange hair, blue eyes",
          body: "slender",
          attire: "plugsuit",
          expression: "smirk",
          action: "arms crossed",
          supplement: {
            pose: "standing proud",
            action: "glaring",
          },
        },
        { originalReference: false, supplement: true } as any
      );
      expect(char2.positive).toBe(
        "girl, long orange hair, blue eyes, slender, plugsuit, smirk, arms crossed, standing proud, glaring"
      );

      // OC char, original on, supplement on -> (oc) prevents name injection
      const char3 = normalizeCharacterData(
        {
          name: "Evelyn (oc)",
          label: "girl",
          age: "",
          appearance: "girl, silver hair, purple eyes",
          body: "petite",
          attire: "black cloak",
          expression: "serious",
          action: "holding wand",
          supplement: "casting a spell",
        },
        { originalReference: true, supplement: true } as any
      );
      expect(char3.positive).toBe(
        "girl, silver hair, purple eyes, petite, black cloak, serious, holding wand, casting a spell"
      );

      // Canon char, original on, supplement off
      const char4 = normalizeCharacterData(
        {
          name: "Asuka Langley Soryu (Evangelion)",
          label: "girl",
          age: "",
          appearance: "girl, long orange hair, blue eyes",
          body: "slender",
          attire: "plugsuit",
          expression: "smirk",
          action: "arms crossed",
          supplement: {
            pose: "standing proud",
            action: "glaring",
          },
        },
        { originalReference: true, supplement: false } as any
      );
      expect(char4.positive).toBe(
        "girl, Asuka Langley Soryu (Evangelion), long orange hair, blue eyes, slender, plugsuit, smirk, arms crossed"
      );
    });

    test("verifies prompt assembly mode 0 illustration pipe nai from fixture", () => {
      const applied = applyPreset(
        "close-up, bedroom, sunlight",
        "girl, long blonde hair, blue eyes, white shirt, smile",
        "",
        RAW_PRESET_1,
        { syntax: "nai", separator: "pipe" }
      );
      expect(applied.positive).toContain("close-up, bedroom, sunlight | girl, long blonde hair, blue eyes, white shirt, smile");
      expect(applied.positive).toContain("1.35::henriiku \\(ahemaru\\)::");
    });

    test("verifies prompt assembly mode 0 illustration newline comfyui from fixture", () => {
      const applied = applyPreset(
        "close-up, bedroom, sunlight",
        "girl, long blonde hair, blue eyes, white shirt, smile",
        "",
        RAW_PRESET_1,
        { syntax: "comfyui", separator: "newline" }
      );
      const postProcessed = postProcessPrompt(applied.positive, { syntax: "comfyui" });
      expect(postProcessed).toContain("close-up, bedroom, sunlight,\n\ngirl, long blonde hair, blue eyes, white shirt, smile");
      expect(postProcessed).toContain("1.35::henriiku (ahemaru)::");
    });

    test("verifies prompt assembly mode 1 asset pipe nai from fixture", () => {
      const shot: V376Shot = {
        paragraph: 1,
        camera: "close-up",
        scene: "bedroom, sunlight",
        characters: [
          {
            name: "Alice",
            label: "girl",
            age: "",
            appearance: "long blonde hair, blue eyes",
            attire: "white shirt",
            expression: "smile",
          },
        ],
      };
      const compiled = compileV376Shot(shot, {
        mode: "asset",
        separator: "pipe",
        syntax: "nai",
        presetContent: RAW_PRESET_1,
      });
      expect(compiled.prompt.startsWith("portrait, cowboy shot, white background, simple background, ")).toBe(true);
      expect(compiled.prompt.endsWith("looking at viewer")).toBe(true);
    });

    test("verifies NAI v4 native mode with mismatched negatives concatenates all negatives to baseNeg", () => {
      const shot: V376Shot = {
        paragraph: 1,
        scene: "street, daytime",
        characters: [
          {
            name: "Alice",
            label: "girl",
            age: "",
            appearance: "blonde hair, blue eyes",
            attire: "sundress",
            negative: "hat",
          },
          {
            name: "Bob",
            label: "boy",
            age: "",
            appearance: "black hair, brown eyes",
            attire: "t-shirt",
            negative: "",
          },
        ],
      };
      const compiled = compileV376Shot(shot, {
        mode: "illustration",
        separator: "native",
        syntax: "nai",
        presetContent: RAW_PRESET_1,
      });
      expect(compiled.nativeCharacters).toBeDefined();
      expect(compiled.nativeCharacters).toHaveLength(2);
      // Negatives were mismatched (one had negative, one empty) -> per Lua lines 1880-1890, allCharNeg concatenated to baseNeg
      expect(compiled.negative).toContain("hat");
    });
  });
  });

  describe("Config promptPresets and activePromptPresetId Adapter", () => {
    test("verifies activePromptPresetId selection changes preset template and preserves custom affix ordering", () => {
      const payload: V376Payload = {
        scenes: [
          {
            place: "rooftop garden",
            shots: [
              {
                paragraph: 1,
                camera: "eye level",
                scene: "rooftop garden, blooming flowers",
                characters: [
                  {
                    name: "Flora",
                    label: "girl",
                    age: "teen",
                    appearance: "green hair, hazel eyes",
                    attire: "gardening apron",
                  },
                ],
              },
            ],
          },
        ],
      };

      const baseConfig = normalizeConfig({
        ...DEFAULT_CONFIG,
        customPositivePrefix: "artist:botanical_master",
        customPositiveSuffix: "bloom lighting, highly detailed",
        customNegative: "extra hands, deformed",
        promptPresets: [
          {
            id: "preset-watercolor",
            name: "Watercolor Pastel",
            positivePrefix: "watercolor style, pastel colors, soft edges",
            negativePrefix: "heavy shadows, harsh lines",
          },
          {
            id: "preset-cyberpunk",
            name: "Cyberpunk Glow",
            positivePrefix: "[Positive]\nneon lighting, volumetric dust, {prompt}, 8k\n[Negative]\norganic plants, sunlight",
            negativePrefix: "",
          },
        ],
      });

      // 1. Without activePromptPresetId, falls back to RAW_PRESET_1
      const defaultCompiled = compileV376Payload(payload, baseConfig);
      expect(defaultCompiled[0].prompt).toContain("henriiku");
      expect(defaultCompiled[0].prompt.startsWith("artist:botanical_master, ")).toBe(true);
      expect(defaultCompiled[0].prompt.endsWith(", bloom lighting, highly detailed")).toBe(true);

      // 2. With preset-watercolor selected
      const watercolorConfig = {
        ...baseConfig,
        activePromptPresetId: "preset-watercolor",
      };
      const watercolorCompiled = compileV376Payload(payload, watercolorConfig);
      const wcShot = watercolorCompiled[0];

      // Verifies preset changed
      expect(wcShot.prompt).not.toContain("henriiku");
      expect(wcShot.prompt).toContain("watercolor style, pastel colors, soft edges");
      // Verifies negative preset changed
      expect(wcShot.negative).toContain("heavy shadows, harsh lines");
      expect(wcShot.negative).toContain("extra hands, deformed");
      // Verifies custom affix ordering:
      // CustomPos is prepended, CustomNeg is appended
      expect(wcShot.prompt.startsWith("artist:botanical_master, ")).toBe(true);
      expect(wcShot.prompt.endsWith(", bloom lighting, highly detailed")).toBe(true);

      // 3. With preset-cyberpunk selected (which uses full DSL with {prompt} placeholder)
      const cyberpunkConfig = {
        ...baseConfig,
        activePromptPresetId: "preset-cyberpunk",
      };
      const cyberpunkCompiled = compileV376Payload(payload, cyberpunkConfig);
      const cbShot = cyberpunkCompiled[0];

      expect(cbShot.prompt).toContain("neon lighting, volumetric dust");
      expect(cbShot.prompt).toContain("8k");
      expect(cbShot.negative).toContain("organic plants, sunlight");
    });
  });

  describe("Source-Faithful Parity Audit & Adversarial Invariant Tests", () => {
    test("literalReplace case-sensitivity: ignores uppercase or mixed case in keyword replacements", () => {
      const shot: V376Shot = {
        paragraph: 1,
        camera: "wide shot, From Front, from front",
        scene: "Young Girl sitting, young girl standing, Young Boy, young boy walking",
        characters: [
          {
            name: "Char",
            label: "girl",
            age: "young girl, Young Girl, young boy, Young Boy",
            appearance: "blonde hair",
            attire: "",
          },
        ],
      };

      const extracted = extractLLMPrompts(shot, { mode: "illustration" });
      // Only lowercase 'from front' -> 'straight-on', 'From Front' remains
      expect(extracted.setupPrompt).toContain("From Front");
      expect(extracted.setupPrompt).toContain("straight-on");
      // Only lowercase 'young girl' -> 'loli', 'Young Girl' remains
      expect(extracted.setupPrompt).toContain("Young Girl sitting");
      expect(extracted.setupPrompt).toContain("loli standing");
      // Only lowercase 'young boy' -> 'shota', 'Young Boy' remains
      expect(extracted.setupPrompt).toContain("Young Boy");
      expect(extracted.setupPrompt).toContain("shota walking");

      // In charPositive:
      expect(extracted.charPositive).toContain("loli");
      expect(extracted.charPositive).toContain("Young Girl");
      expect(extracted.charPositive).toContain("shota");
      expect(extracted.charPositive).toContain("Young Boy");
    });

    test("source preset DSL placeholders: substitutes {setup}, {char}, {supplement}, {prompt} exactly", () => {
      const dslPreset = `[Positive]
intro: {setup} | characters: {char} | supp: {supplement} | combined: {prompt}
[Negative]
neg_intro | neg_chars: {prompt}`;

      const shot: V376Shot = {
        paragraph: 1,
        camera: "close-up",
        scene: "cyber city",
        characters: [
          {
            name: "Rei",
            label: "girl",
            age: "",
            appearance: "short blue hair, red eyes",
            attire: "white suit",
            negative: "blurry",
          },
        ],
      };

      const compiled = compileV376Shot(shot, {
        mode: "illustration",
        separator: "pipe",
        syntax: "nai",
        presetContent: dslPreset,
      });

      // {setup} -> close-up, cyber city
      expect(compiled.prompt).toContain("intro: close-up, cyber city");
      // {char} -> girl, short blue hair, red eyes, white suit
      expect(compiled.prompt).toContain("characters: girl, short blue hair, red eyes, white suit");
      // {supplement} -> replaced with ""
      expect(compiled.prompt).toContain("supp: |");
      // {prompt} in [Negative] -> replaced with "" and charNegative appended with commaStr
      expect(compiled.negative).toContain("neg_intro | neg_chars:, blurry");
    });

    test("NAI v4 native negative alignment: aligned case distributes negatives 1:1 to characters", () => {
      const shot: V376Shot = {
        paragraph: 1,
        scene: "park",
        characters: [
          {
            name: "CharA",
            label: "girl",
            age: "",
            appearance: "red hair",
            attire: "dress",
            negative: "bad hands",
          },
          {
            name: "CharB",
            label: "boy",
            age: "",
            appearance: "blue hair",
            attire: "suit",
            negative: "lowres",
          },
        ],
      };

      const compiled = compileV376Shot(shot, {
        mode: "illustration",
        separator: "native",
        syntax: "nai",
        presetContent: "[Positive]\nmasterpiece\n[Negative]\nworst quality",
      });

      expect(compiled.nativeCharacters).toHaveLength(2);
      expect(compiled.nativeCharacters![0].negative).toBe("bad hands");
      expect(compiled.nativeCharacters![1].negative).toBe("lowres");
      // baseNeg does not receive the character negatives when aligned
      expect(compiled.negative).toBe("worst quality");
    });

    test("comic mode panel.number as number (LLM raw numeric schema) does not throw", () => {
      const shot = {
        paragraph: 1,
        placement: "grid layout",
        characters: [
          {
            name: "Char",
            label: "girl",
            age: "",
            appearance: "blonde hair",
            attire: "robe",
          },
        ],
        panels: [
          { number: 1 as any, composition: "looking up", text: "speech saying \"hello\"" },
          { number: 2 as any, composition: "walking away" },
        ],
      };

      const compiled = compileV376Shot(shot, {
        mode: "comic",
        separator: "native",
        syntax: "nai",
        presetContent: RAW_PRESET_1,
      });

      expect(compiled.nativeCharacters).toBeDefined();
      // Panels become native character entries
      expect(compiled.nativeCharacters!.some((c) => c.prompt.includes("panel 1, looking up"))).toBe(true);
      expect(compiled.nativeCharacters!.some((c) => c.prompt.includes("panel 2, walking away"))).toBe(true);
    });

    test("source setupPrompt array ordering: camera, scene, action, sex, placement", () => {
      const shot: V376Shot = {
        paragraph: 1,
        camera: "CAMERA_TAG",
        scene: "SCENE_TAG",
        action: "ACTION_TAG",
        sex: "SEX_TAG",
        placement: "PLACEMENT_TAG",
        characters: [],
      };

      const extracted = extractLLMPrompts(shot, { mode: "illustration" });
      expect(extracted.setupPrompt).toBe("CAMERA_TAG, SCENE_TAG, ACTION_TAG, SEX_TAG, PLACEMENT_TAG");
    });

    test("comic mode setupPrompt and extraTags order: place, placement, comic panel, manga panel, ultra complexity", () => {
      const shot: V376Shot = {
        paragraph: 1,
        placement: "top-to-bottom vertical",
        place: "tokyo street",
        characters: [],
      };

      const extracted = extractLLMPrompts(shot, { mode: "comic" });
      expect(extracted.setupPrompt).toBe(
        "tokyo street, top-to-bottom vertical, comic panel, manga panel, ultra complexity"
      );
    });

    test("asset mode post-assembly tag injection order", () => {
      const shot: V376Shot = {
        paragraph: 1,
        camera: "close-up",
        scene: "studio",
        characters: [
          {
            name: "Hero",
            label: "girl",
            age: "",
            appearance: "brown hair",
            attire: "jacket",
          },
        ],
      };

      const compiled = compileV376Shot(shot, {
        mode: "asset",
        separator: "pipe",
        syntax: "nai",
        presetContent: "[Positive]\n{prompt}\n[Negative]\nlowres",
      });

      // Asset mode prepends white background, portrait, cowboy shot, and appends looking at viewer
      expect(compiled.prompt.startsWith("portrait, cowboy shot, white background, simple background, ")).toBe(true);
      expect(compiled.prompt.endsWith(", looking at viewer")).toBe(true);
    });
  });

});
