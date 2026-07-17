import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, normalizeConfig } from "../shared/config.js";
import { parserInstruction } from "./instructions.js";
import { assemblePrompt, renderPrompt } from "./prompt.js";
import { exactVisualKey, normalizeScenePayload } from "./scenes.js";

describe("ordered Anima prompt composition", () => {
  test("renders a multi-character sofa scene in exact hybrid order with ComfyUI blank lines", () => {
    const config = {
      ...DEFAULT_CONFIG,
      promptSyntax: "comfyui" as const,
      customPositivePrefix: "<lora:sofa:0.8>;;",
      customPositiveSuffix: "cinematic finish!",
      customNegative: "extra fingers; malformed hands?",
      promptPresets: [{
        id: "quality",
        name: "Quality",
        positivePrefix: "score_9; (detail:1.25).",
        negativePrefix: "lowres; bad anatomy."
      }],
      activePromptPresetId: "quality"
    };
    const entry = assemblePrompt({
      environment: {
        location: ["sunken living room", "discarded second location"],
        timeWeather: ["rainy evening", "discarded second time"],
        lightingMood: ["warm lamp light", "soft shadows", "intimate mood", "discarded fourth light"],
        backgroundElements: ["green velvet sofa", "low coffee table", "rainy window", "bookshelf", "cream rug", "discarded sixth prop"]
      }
    }, {
      paragraph: 1,
      situation: "2girls",
      action: "holding hands, leaning together",
      camera: "wide shot, from side;",
      sharedComposition: "Their shoulders touch as their hands meet between them.",
      characters: [{
        name: "Alice",
        label: "girl",
        appearance: "blonde hair, blue eyes",
        attire: "red dress",
        expression: "smiling",
        action: "reclining, looking at the other girl",
        composition: "The girl on the left reclines into the sofa and looks toward the other girl."
      }, {
        name: "Beth",
        label: "girl",
        appearance: "black hair, green eyes",
        attire: "white blouse, black skirt",
        expression: "gentle smile",
        action: "sitting upright, looking left",
        composition: "The girl on the right sits upright and turns her gaze left."
      }],
      negative: "text; watermark!"
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe([
      "score_9, (detail:1.25)",
      "<lora:sofa:0.8>",
      "2girls",
      "The girl on the left reclines into the sofa and looks toward the other girl",
      "girl, blonde hair, blue eyes, red dress, smiling",
      "The girl on the right sits upright and turns her gaze left",
      "girl, black hair, green eyes, white blouse, black skirt, gentle smile",
      "Their shoulders touch as their hands meet between them",
      "sunken living room",
      "rainy evening",
      "warm lamp light",
      "soft shadows",
      "intimate mood",
      "green velvet sofa",
      "low coffee table",
      "rainy window",
      "bookshelf",
      "cream rug",
      "wide shot, from side",
      "cinematic finish"
    ].join(",\n\n"));
    expect(entry.negative).toBe("lowres, bad anatomy, extra fingers, malformed hands, text, watermark");
    expect(renderPrompt(entry.prompt, config.promptSyntax)).not.toContain("holding hands");
    expect(renderPrompt(entry.prompt, config.promptSyntax)).not.toContain("sitting upright,");
  });

  test("keeps character composition and location/time when natural/shared detail is disabled", () => {
    const config = { ...DEFAULT_CONFIG, promptSyntax: "nai" as const, supplement: false };
    const entry = assemblePrompt({ environment: {
      location: "railway platform",
      timeWeather: "foggy dawn",
      lightingMood: ["cold blue light"],
      backgroundElements: ["station clock"]
    } }, {
      situation: "1girl",
      action: "reaching for another",
      sharedComposition: "Two hands nearly touch across the gap.",
      camera: "close-up",
      characters: [{
        label: "girl",
        appearance: "black hair",
        action: "leaning forward",
        composition: "The foreground girl leans across the platform edge."
      }]
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe(
      "1girl, The foreground girl leans across the platform edge, girl, black hair, reaching for another, railway platform, foggy dawn, close-up"
    );
  });

  test("uses character and shared action tags only when their composition prose is missing", () => {
    const config = { ...DEFAULT_CONFIG, promptSyntax: "nai" as const };
    const entry = assemblePrompt({ environment: { location: "garden", timeWeather: "day" } }, {
      situation: "1girl",
      action: "waving goodbye",
      camera: "portrait",
      characters: [{ label: "girl", appearance: "red hair", action: "standing, looking away" }]
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe(
      "1girl, girl, red hair, standing, looking away, waving goodbye, garden, day, portrait"
    );
  });

  test("accepts legacy supplement and place as runtime fallbacks", () => {
    const config = { ...DEFAULT_CONFIG, promptSyntax: "nai" as const };
    const entry = assemblePrompt({ place: "interior, old library" }, {
      situation: "1girl",
      action: "reading",
      supplement: "The lone reader is framed between towering shelves.",
      camera: "from above",
      characters: [{ label: "girl", appearance: "brown hair", action: "sitting" }]
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe(
      "1girl, girl, brown hair, sitting, The lone reader is framed between towering shelves, interior, old library, from above"
    );
  });
});

describe("prompt compatibility and normalization", () => {
  test("keeps Anima assets compact and tags-only", () => {
    const config = { ...DEFAULT_CONFIG, mode: "asset" as const, promptSyntax: "nai" as const };
    const entry = assemblePrompt({ place: "bedroom" }, {
      situation: "1girl",
      supplement: "This prose must not render.",
      characters: [{ label: "girl", appearance: "silver hair", action: "standing" }]
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe(
      "1girl, girl, silver hair, standing, looking at viewer, portrait, cowboy shot, bedroom, white background, simple background"
    );
  });

  test("keeps Default ordering while normalizing punctuation and preserving weight syntax", () => {
    const config = {
      ...DEFAULT_CONFIG,
      promptStyle: "default" as const,
      promptSyntax: "comfyui" as const,
      customPositivePrefix: "<lora:ink:0.75>; (quality:1.5); 1.2::sharp focus::",
      customPositiveSuffix: "finish?",
      customNegative: "bad hands; lowres!"
    };
    const entry = assemblePrompt({ place: "studio; night." }, {
      camera: "portrait;",
      situation: "1girl",
      action: "standing!",
      characters: [{ label: "girl", appearance: "blue hair" }],
      supplement: "Centered against a tall canvas.",
      negative: "text;"
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe([
      "<lora:ink:0.75>, (quality:1.5), 1.2::sharp focus::",
      "portrait, 1girl, standing",
      "studio, night",
      "girl, blue hair",
      "Centered against a tall canvas",
      "finish"
    ].join(",\n\n"));
    expect(entry.negative).toBe("bad hands, lowres, text");
  });
});

describe("Anima parser contract and visual distinctness", () => {
  test("requests composition and budgeted structured environment without requesting supplement", () => {
    const instruction = parserInstruction(DEFAULT_CONFIG);

    expect(instruction).toContain('"composition": "string"');
    expect(instruction).toContain('"sharedComposition": "string"');
    expect(instruction).toContain('"environment": {');
    expect(instruction).toContain("exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements");
    expect(instruction).not.toContain('"supplement": "string"');
  });

  test("includes character/shared composition and environment fields in exact visual keys", () => {
    const shot = {
      paragraph: 1,
      characters: [{ expression: "smile", action: "sitting", composition: "Left side" }],
      sharedComposition: "Hands together"
    };
    const environment = {
      location: "sofa room",
      timeWeather: "evening",
      lightingMood: ["warm light"],
      backgroundElements: ["window"]
    };
    const [first] = normalizeScenePayload({ scenes: [{
      environment,
      shots: [shot]
    }] });
    const [different] = normalizeScenePayload({ scenes: [{
      environment: {
        ...environment,
        backgroundElements: ["fireplace"]
      },
      shots: [shot]
    }] });

    expect(exactVisualKey(first)).not.toBe(exactVisualKey(different));
  });

  test("silently drops removed legacy cleanup configuration keys", () => {
    const config = normalizeConfig({ danbooruCleanup: true, danbooruEndpoint: "http://legacy.invalid" });

    expect(config).toEqual(DEFAULT_CONFIG);
    expect("danbooruCleanup" in config).toBe(false);
    expect("danbooruEndpoint" in config).toBe(false);
  });
});
