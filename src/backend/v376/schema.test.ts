import { describe, expect, it } from "bun:test";
import {
  filterStandaloneGenderTags,
  fixJsonKeys,
  fuzzyMatchKey,
  levenshteinDistance,
  normalizeCharacterData,
  normalizeReferenceTags,
  normalizeV376Scenes,
  parseV376Payload,
} from "./schema.js";
import { V376Options } from "./types.js";

describe("v376 schema parsing and structural normalization", () => {
  const baseOptions: V376Options = {
    mode: "illustration",
    nsfw: false,
    supplement: false,
    text: "off",
    quote: false,
    syntax: "nai",
    separator: "pipe",
    imageMin: 3,
    imageMax: 5,
    characterMax: 2,
    panelMin: 3,
    originalReference: false,
    originalCreationName: "",
  };

  it("calculates levenshtein distance and fuzzy matches schema keys", () => {
    expect(levenshteinDistance("scene", "scenes")).toBe(1);
    expect(levenshteinDistance("characters", "charaters")).toBe(1);
    expect(fuzzyMatchKey("charaters")).toBe("characters");
    expect(fuzzyMatchKey("paragragh")).toBe("paragraph");
    expect(fuzzyMatchKey("placment")).toBe("placement");
  });

  it("repairs misspelled keys using fixJsonKeys", () => {
    const raw = {
      scence: "forest",
      charaters: [
        {
          nam: "Hero",
          appearnce: "black hair",
        },
      ],
    };
    const fixed = fixJsonKeys(raw) as any;
    expect(fixed.scene).toBe("forest");
    expect(fixed.characters[0].name).toBe("Hero");
    expect(fixed.characters[0].appearance).toBe("black hair");
  });

  it("filters standalone gender tags while preserving combined phrases", () => {
    expect(filterStandaloneGenderTags("1girl, long hair, blue eyes")).toBe("long hair, blue eyes");
    expect(filterStandaloneGenderTags("girl, boy, 1boy, tall boy, tomboy")).toBe("tall boy, tomboy");
    expect(filterStandaloneGenderTags("")).toBe("");
  });

  it("normalizes reference tags with deduplication and null/none removal", () => {
    const raw = "blue hair, Blue Hair, null, none, red eyes, RED EYES";
    expect(normalizeReferenceTags(raw)).toBe("blue hair, red eyes");
  });

  it("parses valid JSON with markdown fences and structural recovery", () => {
    const response = `
\`\`\`json
{
  "scenes": [
    {
      "place": "classroom, afternoon sunlight",
      "shots": [
        {
          "paragraph": 1,
          "camera": "medium shot",
          "situation": "talking by the window",
          "characters": [
            {
              "name": "Alice",
              "label": "schoolgirl",
              "age": "teenager",
              "appearance": "1girl, blonde hair, blue eyes",
              "attire": "school uniform, sailor collar"
            }
          ]
        }
      ]
    }
  ]
}
\`\`\`
`;
    const payload = parseV376Payload(response, baseOptions);
    expect(payload.scenes.length).toBe(1);
    expect(payload.scenes[0].place).toBe("classroom, afternoon sunlight");

    const shot = payload.scenes[0].shots[0];
    expect(shot.paragraph).toBe(1);
    expect(shot.camera).toBe("medium shot");
    expect(shot.characters.length).toBe(1);

    const char = shot.characters[0];
    expect(char.name).toBe("Alice");
    // Standalone 1girl should be filtered out from positive tags built from appearance
    expect(char.positive).not.toContain("1girl");
    expect(char.positive).toContain("blonde hair");
    expect(char.positive).toContain("school uniform");
  });

  it("tolerates trailing commas in JSON (deliberate fix for malformed source JSON examples)", () => {
    const malformedJson = `{
      "scenes": [
        {
          "place": "dungeon",
          "shots": [
            {
              "paragraph": "P2",
              "camera": "close-up",
              "characters": [
                {
                  "name": "Warrior",
                  "label": "knight",
                  "age": "young adult",
                  "appearance": "silver armor",
                  "attire": "plate mail",
                },
              ],
            },
          ],
        },
      ],
    }`;

    const payload = parseV376Payload(malformedJson, baseOptions);
    expect(payload.scenes.length).toBe(1);
    expect(payload.scenes[0].shots[0].paragraph).toBe(2);
    expect(payload.scenes[0].shots[0].characters[0].name).toBe("Warrior");
  });

  it("satisfies the sex omission contract: missing sex field is accepted when NSFW is true", () => {
    const nsfwPayloadJson = `{
      "scenes": [
        {
          "place": "bedroom",
          "shots": [
            {
              "paragraph": 3,
              "camera": "eye level",
              "situation": "sitting together on the bed",
              "characters": [
                {
                  "name": "Bob",
                  "label": "1boy",
                  "age": "adult",
                  "appearance": "messy hair",
                  "attire": "pajamas"
                }
              ]
            }
          ]
        }
      ]
    }`;

    const payload = parseV376Payload(nsfwPayloadJson, { ...baseOptions, nsfw: true });
    expect(payload.scenes[0].shots[0].characters[0].sex).toBeUndefined();
    expect(payload.scenes[0].shots[0].characters[0].name).toBe("Bob");
  });

  it("auto-assigns character names with letter suffix when name is empty", () => {
    const unnamedJson = `{
      "scenes": [
        {
          "place": "cafe",
          "shots": [
            {
              "paragraph": 1,
              "characters": [
                {
                  "label": "waitress",
                  "age": "20s",
                  "appearance": "brown hair",
                  "attire": "apron"
                },
                {
                  "label": "waitress",
                  "age": "20s",
                  "appearance": "black hair",
                  "attire": "apron"
                }
              ]
            }
          ]
        }
      ]
    }`;

    const payload = parseV376Payload(unnamedJson, baseOptions);
    const chars = payload.scenes[0].shots[0].characters;
    expect(chars[0].name).toBe("waitress A");
    expect(chars[1].name).toBe("waitress B");
  });

  it("injects character name into positive tags if originalReference is true and character is not an OC", () => {
    const canonJson = `{
      "scenes": [
        {
          "place": "dock",
          "shots": [
            {
              "paragraph": 1,
              "characters": [
                {
                  "name": "Amiya",
                  "label": "cautus",
                  "age": "teenager",
                  "appearance": "rabbit ears, brown hair",
                  "attire": "oversized coat"
                },
                {
                  "name": "CustomGirl (oc)",
                  "label": "operator",
                  "age": "adult",
                  "appearance": "purple eyes",
                  "attire": "combat jacket"
                }
              ]
            }
          ]
        }
      ]
    }`;

    const payload = parseV376Payload(canonJson, { ...baseOptions, originalReference: true });
    const amiya = payload.scenes[0].shots[0].characters[0];
    const oc = payload.scenes[0].shots[0].characters[1];

    // Canon character should have name in positive tags
    expect(amiya.positive).toContain("Amiya");
    // OC character should NOT have name inserted behind label
    expect(oc.positive).not.toContain("CustomGirl (oc)");
  });

  it("normalizes scenes into flat shots matching Lua normalizedScenes", () => {
    const payload = {
      scenes: [
        {
          place: "park",
          shots: [
            {
              paragraph: 1,
              situation: "walking dogs",
              characters: [
                {
                  name: "John",
                  label: "man",
                  age: "30",
                  appearance: "tall",
                  attire: "jeans",
                },
              ],
            },
          ],
        },
      ],
    };

    const flatShots = normalizeV376Scenes(payload, baseOptions);
    expect(flatShots.length).toBe(1);
    expect(flatShots[0].paragraph).toBe(1);
    expect(flatShots[0].place).toBe("park");
    expect(flatShots[0].characters[0].name).toBe("John");
    expect(flatShots[0].characters[0].identity).toBe("man, 30, tall, jeans");
  });

  it("matches character_normalization fixtures from src/evals/v376-parity/fixtures/fixtures.json", () => {
    // 1. canon_char_original_on_supplement_on
    const c1 = normalizeCharacterData(
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
      { ...baseOptions, originalReference: true, supplement: true }
    );
    expect(c1.positive).toBe(
      "girl, Asuka Langley Soryu (Evangelion), long orange hair, blue eyes, slender, plugsuit, smirk, arms crossed, standing proud, glaring"
    );
    expect(c1.identity).toBe("girl, long orange hair, blue eyes, slender, plugsuit");

    // 2. canon_char_original_off_supplement_on
    const c2 = normalizeCharacterData(
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
      { ...baseOptions, originalReference: false, supplement: true }
    );
    expect(c2.positive).toBe(
      "girl, long orange hair, blue eyes, slender, plugsuit, smirk, arms crossed, standing proud, glaring"
    );

    // 3. oc_char_original_on_supplement_on
    const c3 = normalizeCharacterData(
      {
        name: "Elina (OC)",
        label: "girl",
        age: "",
        appearance: "girl, silver hair, purple eyes",
        body: "petite",
        attire: "black cloak",
        expression: "serious",
        action: "holding wand",
        supplement: "casting a spell",
      },
      { ...baseOptions, originalReference: true, supplement: true }
    );
    expect(c3.positive).toBe(
      "girl, silver hair, purple eyes, petite, black cloak, serious, holding wand, casting a spell"
    );

    // 4. canon_char_original_on_supplement_off
    const c4 = normalizeCharacterData(
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
      { ...baseOptions, originalReference: true, supplement: false }
    );
    expect(c4.positive).toBe(
      "girl, Asuka Langley Soryu (Evangelion), long orange hair, blue eyes, slender, plugsuit, smirk, arms crossed"
    );
  });

  it("enforces standalone gender filtering strictly in appearance while preserving it in other fields", () => {
    const char = normalizeCharacterData(
      {
        name: "TestChar",
        label: "1girl",
        age: "teenager",
        appearance: "1girl, girl, boy, 1boy, tall boy, magical girl, long hair",
        attire: "schoolgirl uniform, boyish cap",
        action: "running with a boy",
      },
      baseOptions
    );

    // label must preserve standalone gender
    expect(char.label).toBe("1girl");
    // positive must have label (1girl) + appearance without standalone gender (tall boy, magical girl, long hair) + attire + action
    expect(char.positive).toBe(
      "1girl, teenager, tall boy, magical girl, long hair, schoolgirl uniform, boyish cap, running with a boy"
    );
    // identity must have label + age + appearance (no standalone gender) + attire, and strictly omit action/name
    expect(char.identity).toBe(
      "1girl, teenager, tall boy, magical girl, long hair, schoolgirl uniform, boyish cap"
    );
    expect(char.identity).not.toContain("running");
    expect(char.identity).not.toContain("TestChar");
  });

  it("strictly enforces source array order for character tags and identity tags", () => {
    // Canon character: label, name, age, appearance, body, attire, expression, action, sex, text
    const canonChar = normalizeCharacterData(
      {
        name: "CanonHero",
        label: "warrior",
        age: "young adult",
        appearance: "black hair",
        body: "athletic",
        attire: "armor",
        expression: "fierce",
        action: "slashing",
        sex: "none",
        text: "speech bubble saying \"charge\"",
      },
      { ...baseOptions, originalReference: true }
    );
    expect(canonChar.positive).toBe(
      "warrior, CanonHero, young adult, black hair, athletic, armor, fierce, slashing, speech bubble saying \"charge\""
    );

    // OC character: label, age, appearance, body, attire, expression, action, sex, text (NO name)
    const ocChar = normalizeCharacterData(
      {
        name: "Custom (oc)",
        label: "mage",
        age: "adult",
        appearance: "white hair",
        body: "slender",
        attire: "robe",
        expression: "calm",
        action: "casting",
        sex: "none",
        text: "runic glow",
      },
      { ...baseOptions, originalReference: true }
    );
    expect(ocChar.positive).toBe(
      "mage, adult, white hair, slender, robe, calm, casting, runic glow"
    );

    // Identity strictly includes ONLY: label, age, appearance, body, attire
    expect(ocChar.identity).toBe("mage, adult, white hair, slender, robe");
  });

});
