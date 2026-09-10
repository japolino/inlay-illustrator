/**
 * Benign Frozen Test Fixtures for V3.7.6 Parity Evaluation.
 *
 * All fixtures are completely benign, deterministic, and represent realistic
 * LLM generation payloads across illustration, asset, and comic modes.
 *
 * Each fixture is traced to corresponding source logic in references/v376/.
 */

import type { GoldenSceneFixture } from "../types.js";
import type { V376Payload } from "../../../backend/v376/types.js";

/**
 * Fixture 1: Illustration Mode - Single character with supplement.
 * Traced to Card.Image.axLLM.txt lines 12-40 and trigger_runtime.lua lines 1689-1850.
 */
export const FIXTURE_ILLUSTRATION_SINGLE: GoldenSceneFixture = {
  id: "illustration-single-char",
  name: "Illustration Mode - Single Character with Supplement",
  description: "Benign single character scene in a sunny garden with pose/action supplement",
  mode: "illustration",
  options: {
    mode: "illustration",
    supplement: true,
    nsfw: false,
    text: "off",
    quote: false,
  },
  payload: {
    scenes: [
      {
        place: "sunlit garden, stone path, blooming flowers",
        shots: [
          {
            paragraph: 1,
            camera: "cowboy shot, straight-on",
            situation: "standing amidst colorful blossoms",
            characters: [
              {
                name: "Alice",
                label: "1girl",
                age: "young adult",
                appearance: "long blonde hair, blue eyes, gentle smile",
                attire: "white sundress, straw hat",
                expression: "smiling pleasantly",
                action: "holding a wicker basket",
                supplement: {
                  pose: "standing gracefully with slight tilt",
                  action: "softly grasping basket handle",
                },
              },
            ],
          },
        ],
      },
    ],
  },
  provenance: {
    file: "references/v376/Card.Image.axLLM.txt",
    lines: "12-40",
    description: "Standard single character illustration with supplement enrichment",
  },
};

/**
 * Fixture 2: Illustration Mode - Multi-character scene.
 * Traced to trigger_runtime.lua lines 1206-1217 (buildCharacterPromptGroups)
 * and lines 1730-1765 (character channel formatting).
 */
export const FIXTURE_ILLUSTRATION_MULTI: GoldenSceneFixture = {
  id: "illustration-multi-char",
  name: "Illustration Mode - Two Characters",
  description: "Two characters interacting in a modern cafe with distinct attire and positions",
  mode: "illustration",
  options: {
    mode: "illustration",
    supplement: false,
    nsfw: false,
    text: "off",
    quote: false,
  },
  payload: {
    scenes: [
      {
        place: "cozy coffee shop, wooden tables, warm sunlight",
        shots: [
          {
            paragraph: 1,
            camera: "medium shot, eye level",
            situation: "enjoying afternoon tea together",
            placement: "Alice on the left, Bob on the right",
            characters: [
              {
                name: "Alice",
                label: "1girl",
                age: "young woman",
                appearance: "blonde ponytail, bright blue eyes",
                attire: "beige cardigan, brown skirt",
                expression: "laughing cheerful",
                action: "sipping hot tea",
                position: "seated on wooden chair",
              },
              {
                name: "Bob",
                label: "1boy",
                age: "young man",
                appearance: "short dark hair, glasses",
                attire: "navy blue sweater, grey trousers",
                expression: "friendly smile",
                action: "reading an open book",
                position: "seated opposite table",
              },
            ],
          },
        ],
      },
    ],
  },
  provenance: {
    file: "references/v376/trigger_runtime.lua",
    lines: "1206-1217",
    description: "Multi-character grouping with per-character positive and negative channels",
  },
};

/**
 * Fixture 3: Asset Mode - Character Focus / Portrait.
 * Traced to trigger_runtime.lua lines 1795-1801:
 * Asset mode forces 'white background, simple background', 'portrait', 'cowboy shot', 'looking at viewer'.
 */
export const FIXTURE_ASSET_MODE: GoldenSceneFixture = {
  id: "asset-mode-character",
  name: "Asset Mode - Standalone Character Portrait",
  description: "Character asset generation requiring forced plain background and camera tags",
  mode: "asset",
  options: {
    mode: "asset",
    supplement: false,
    nsfw: false,
    text: "off",
    quote: false,
  },
  payload: {
    scenes: [
      {
        place: "studio background",
        shots: [
          {
            paragraph: 1,
            camera: "straight-on",
            situation: "standing still",
            characters: [
              {
                name: "Carol",
                label: "1girl",
                age: "young adult",
                appearance: "silver twin tails, green eyes",
                attire: "futuristic jacket, black shorts",
                expression: "confident smirk",
                action: "arms crossed",
              },
            ],
          },
        ],
      },
    ],
  },
  provenance: {
    file: "references/v376/trigger_runtime.lua",
    lines: "1795-1801",
    description: "Asset mode tag injection (white background, portrait, cowboy shot, looking at viewer)",
  },
};

/**
 * Fixture 4: Comic Mode - Multi-panel page layout.
 * Traced to trigger_runtime.lua lines 1700-1725, 1785-1793:
 * Comic mode formats panel numbers, compositions, and speech bubble text.
 */
export const FIXTURE_COMIC_MODE: GoldenSceneFixture = {
  id: "comic-mode-panels",
  name: "Comic Mode - Multi-panel Page Layout",
  description: "Sequential comic page with panels, framing, and dialogue text bubbles",
  mode: "comic",
  options: {
    mode: "comic",
    supplement: false,
    nsfw: false,
    text: "english",
    quote: true,
  },
  payload: {
    scenes: [
      {
        place: "city rooftop at sunset",
        shots: [
          {
            paragraph: 1,
            camera: "wide angle",
            situation: "overlooking the glowing cityscape",
            placement: "Dave standing near the safety railing",
            characters: [
              {
                name: "Dave",
                label: "1boy",
                age: "teen",
                appearance: "messy brown hair, athletic build",
                attire: "hoodie, denim jeans",
                expression: "determined gaze",
                action: "leaning forward against rail",
              },
            ],
            panels: [
              {
                number: "1",
                composition: "establishing shot, wide panoramic view of twilight horizon",
                text: "The sun is finally going down.",
              },
              {
                number: "2",
                composition: "close-up on Dave's face, wind blowing hair",
                text: "Tomorrow begins the real test.",
              },
            ],
            quote: "Tomorrow begins the real test.",
          },
        ],
      },
    ],
  },
  provenance: {
    file: "references/v376/trigger_runtime.lua",
    lines: "1700-1725, 1785-1793",
    description: "Comic mode panel formatting and speech bubble integration",
  },
};

/**
 * Fixture 5: NSFW Mode with sex field omitted.
 * Traced to Card.Image.axLLM.txt line 161:
 * "Don't output it if sex isn't happening (such as a kiss or a hug)."
 * Confirms sex field omission contract is preserved without schema failure.
 */
export const FIXTURE_NSFW_SEX_OMITTED: GoldenSceneFixture = {
  id: "nsfw-sex-omitted",
  name: "NSFW Mode - Romance Scene with Sex Omitted",
  description: "Non-explicit romantic kiss with nsfw enabled where sex attribute is omitted",
  mode: "illustration",
  options: {
    mode: "illustration",
    supplement: true,
    nsfw: true,
    text: "off",
  },
  payload: {
    scenes: [
      {
        place: "dimly lit bedroom, soft candle light",
        shots: [
          {
            paragraph: 1,
            camera: "close-up, romantic angle",
            situation: "sharing an intimate embrace",
            characters: [
              {
                name: "Elena",
                label: "1girl",
                age: "adult woman",
                appearance: "long auburn hair, flushed cheeks",
                attire: "silk nightgown",
                expression: "closed eyes, gentle smile",
                action: "embracing partner tightly",
                // Notice: sex field is intentionally omitted here!
                supplement: {
                  pose: "tender embrace",
                  action: "soft whisper",
                },
              },
            ],
          },
        ],
      },
    ],
  },
  provenance: {
    file: "references/v376/Card.Image.axLLM.txt",
    lines: "161",
    description: "Sex field is optional when sex action is not actively occurring",
  },
};

/**
 * Fixture 6: Structural Recovery - Misspelled keys (Levenshtein distance <= 2).
 * Traced to trigger_runtime.lua lines 1110-1149:
 * KNOWN_JSON_KEYS, levenshteinDistance, and fixJsonKeys.
 */
export const FIXTURE_MISSPELLED_KEYS_RAW: GoldenSceneFixture = {
  id: "structural-misspelled-keys",
  name: "Structural Tolerance - Misspelled Keys Repaired",
  description: "Raw LLM JSON containing common typos with distance <= 2 repaired by fixJsonKeys",
  mode: "illustration",
  options: {
    mode: "illustration",
    supplement: false,
    nsfw: false,
  },
  rawResponse: JSON.stringify({
    scens: [
      {
        place: "botanical greenhouse",
        shost: [
          {
            paragragh: 1,
            camra: "medium full shot",
            situation: "watering ferns",
            charaters: [
              {
                name: "Flora",
                label: "1girl",
                age: "young adult",
                apperance: "green braided hair, hazel eyes",
                attire: "gardener overalls",
                expresion: "happy",
                action: "holding watering can",
              },
            ],
          },
        ],
      },
    ],
  }),
  provenance: {
    file: "references/v376/trigger_runtime.lua",
    lines: "1110-1149",
    description: "Lua fixJsonKeys recursively recovers misspelled keys with distance <= 2",
  },
};

/**
 * Fixture 7: Structural Recovery - Malformed JSON with trailing commas and markdown fence.
 * Traced to Card.Image.Format.txt lines 128, 143, 163 (which exhibit trailing commas in source examples)
 * and trigger_runtime.lua lines 1150-1180 (extractCardImageJson markdown stripping).
 */
export const FIXTURE_TRAILING_COMMAS_RAW: GoldenSceneFixture = {
  id: "structural-trailing-commas-fenced",
  name: "Structural Tolerance - Trailing Commas and Markdown Code Blocks",
  description: "LLM response enclosed in ```json fences with trailing commas before closing braces",
  mode: "illustration",
  options: {
    mode: "illustration",
    supplement: false,
    nsfw: false,
  },
  rawResponse: `Here is the requested image generation plan:
\`\`\`json
{
  "scenes": [
    {
      "place": "open library, tall bookshelves,",
      "shots": [
        {
          "paragraph": 1,
          "camera": "eye level,",
          "situation": "studying ancient tome,",
          "characters": [
            {
              "name": "Grace",
              "label": "1girl",
              "age": "scholar",
              "appearance": "spectacles, auburn bun,",
              "attire": "scholarly robe,",
              "expression": "thoughtful concentration,",
              "action": "turning parchment page,",
            },
          ],
        },
      ],
    },
  ],
}
\`\`\`
Hope this visualizes well!`,
  provenance: {
    file: "references/v376/trigger_runtime.lua",
    lines: "1150-1180",
    description: "extractCardImageJson strips markdown markers and parses payload cleanly",
  },
};

/**
 * Registry of all benign frozen fixtures.
 */

/**
 * Fixture 7: NAI V4 Native Mode with Mismatched Character Negatives.
 * Traced to trigger_runtime.lua lines 1735-1770 and 1880-1900.
 */
export const FIXTURE_NAI_MISMATCHED_NEGATIVES: GoldenSceneFixture = {
  id: "nai-mismatched-negatives",
  name: "NovelAI V4 Native Mode - Mismatched Negatives Fallback",
  description: "Two character scene where only one character defines negative tags, triggering baseNeg fallback",
  mode: "illustration",
  options: {
    mode: "illustration",
    separator: "native",
    syntax: "nai",
    supplement: false,
    nsfw: false,
  },
  payload: {
    scenes: [
      {
        place: "city street, crosswalk",
        shots: [
          {
            paragraph: 1,
            camera: "wide shot, straight-on",
            situation: "waiting at traffic light",
            characters: [
              {
                name: "Alice",
                label: "girl",
                age: "young adult",
                appearance: "blonde hair, blue eyes",
                attire: "sundress",
                negative: "hat",
              },
              {
                name: "Bob",
                label: "boy",
                age: "young adult",
                appearance: "black hair, brown eyes",
                attire: "t-shirt, jeans",
                negative: "",
              },
            ],
          },
        ],
      },
    ],
  },
  provenance: {
    file: "references/v376/trigger_runtime.lua",
    lines: "1883-1893",
    description: "When character negative count mismatches positive count, concatenate all negatives to baseNeg and clear channel negatives",
  },
};

/**
 * Fixture 8: Custom Affix & Quality Tags Assembly.
 * Traced to trigger_runtime.lua lines 1845-1847 and 1876-1878.
 */
export const FIXTURE_CUSTOM_AFFIX: GoldenSceneFixture = {
  id: "custom-affix-ordering",
  name: "Custom Affix Ordering - Prefix, Quality Suffix & Negative",
  description: "Scene asserting customPos prepending, customNeg appending to positive, and customNegative appending to negative",
  mode: "illustration",
  options: {
    mode: "illustration",
    separator: "pipe",
    syntax: "nai",
    supplement: false,
    nsfw: false,
    customPos: "masterpiece, highly detailed",
    customNeg: "vibrant colors",
    customNegative: "blurry background, deformed limbs",
  },
  payload: {
    scenes: [
      {
        place: "sunny meadow",
        shots: [
          {
            paragraph: 1,
            camera: "close-up",
            situation: "relaxing on the grass",
            characters: [
              {
                name: "Alice",
                label: "girl",
                age: "young adult",
                appearance: "blonde hair, blue eyes",
                attire: "white sundress",
              },
            ],
          },
        ],
      },
    ],
  },
  provenance: {
    file: "references/v376/trigger_runtime.lua",
    lines: "1845-1847, 1876-1878",
    description: "CustomPos prepended to positive, CustomNeg appended to positive as quality tag suffix, customNegative appended to negative",
  },
};

export const ALL_GOLDEN_FIXTURES: readonly GoldenSceneFixture[] = Object.freeze([
  FIXTURE_ILLUSTRATION_SINGLE,
  FIXTURE_ILLUSTRATION_MULTI,
  FIXTURE_ASSET_MODE,
  FIXTURE_COMIC_MODE,
  FIXTURE_NSFW_SEX_OMITTED,
  FIXTURE_MISSPELLED_KEYS_RAW,
  FIXTURE_TRAILING_COMMAS_RAW,
  FIXTURE_NAI_MISMATCHED_NEGATIVES,
  FIXTURE_CUSTOM_AFFIX,
]);
