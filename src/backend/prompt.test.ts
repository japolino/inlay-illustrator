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
      sharedComposition: "They hold hands and lean together on the sofa.",
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
      "wide shot, from side",
      "The girl on the left reclines into the sofa and looks toward the other girl",
      "girl, blonde hair, blue eyes, red dress, smiling",
      "The girl on the right sits upright and turns her gaze left",
      "girl, black hair, green eyes, white blouse, black skirt, gentle smile",
      "They hold hands and lean together on the sofa",
      "sunken living room, rainy evening, warm lamp light, soft shadows, intimate mood, green velvet sofa, low coffee table, rainy window, bookshelf, cream rug",
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
      "1girl, close-up, The foreground girl leans across the platform edge, girl, black hair, leaning forward, reaching for another, railway platform, foggy dawn"
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
      "1girl, portrait, girl, red hair, standing, looking away, waving goodbye, garden, day"
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
      "1girl, from above, girl, brown hair, sitting, The lone reader is framed between towering shelves, interior, old library"
    );
  });

  test("keeps uncovered action tags, prioritizes camera, compacts environment, and anonymizes POV names", () => {
    const config = { ...DEFAULT_CONFIG, promptSyntax: "comfyui" as const };
    const entry = assemblePrompt({ environment: {
      location: "residential street",
      timeWeather: "evening",
      lightingMood: ["warm amber streetlamp light", "tense atmosphere"],
      backgroundElements: ["streetlamps", "houses", "paved sidewalk"]
    } }, {
      situation: "1girl",
      camera: "cowboy shot, low angle, pov",
      characters: [{
        label: "girl",
        appearance: "short golden blonde hair, red eyes",
        expression: "annoyed, blush",
        action: "turning around, marching toward viewer, looking at viewer",
        composition: "From Jay's POV, the girl spins toward the viewer and fixes her gaze on the camera."
      }]
    }, config, 1, 1);
    const rendered = renderPrompt(entry.prompt, config.promptSyntax);

    expect(rendered).toBe([
      "1girl",
      "cowboy shot, low angle, pov",
      "from the viewer's POV, the girl spins toward the viewer and fixes her gaze on the camera",
      "girl, short golden blonde hair, red eyes, annoyed, blush, turning around, marching toward viewer",
      "residential street, evening, warm amber streetlamp light, tense atmosphere, streetlamps, houses, paved sidewalk"
    ].join(",\n\n"));
    expect(rendered).not.toContain("Jay");
    expect(rendered).toContain("turning around");
    expect(rendered).not.toContain("looking at viewer");
    expect(rendered.indexOf("cowboy shot")).toBeLessThan(rendered.indexOf("short golden blonde hair"));
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
    expect(instruction).toContain("Preserve the source's explicit action, direction of movement, visible emotional state, and interpersonal tone");
    expect(instruction).toContain("Do not put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle");
    expect(instruction).toContain("Always populate characters[].action with standard tags");
    expect(instruction).toContain("never infer romance, calm, menace, or another emotional tone from lighting alone");
    expect(instruction).toContain("Choose framing that can visibly contain the complete focal action");
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
