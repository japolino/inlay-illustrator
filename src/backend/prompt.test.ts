import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, normalizeConfig } from "../shared/config.js";
import { parserInstruction } from "./instructions.js";
import {
  assemblePrompt,
  renderNegativeWithCurrentSelection,
  renderPrompt,
  renderPromptWithCurrentAffixes
} from "./prompt.js";
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
      camera: { framing: "wide shot", angle: "", perspective: "from side", focus: [] },
      sharedComposition: { interaction: ["holding hands"], spatialRelation: "leaning together on the sofa" },
      characters: [{
        name: "Alice",
        label: "girl",
        appearance: "blonde hair, blue eyes",
        attire: "red dress",
        expression: "smiling",
        action: "reclining, looking at the other girl",
        composition: {
          position: "left side of the sofa",
          pose: "reclining into the cushions",
          actions: [],
          gaze: "looking toward the other girl"
        }
      }, {
        name: "Beth",
        label: "girl",
        appearance: "black hair, green eyes",
        attire: "white blouse, black skirt",
        expression: "gentle smile",
        action: "sitting upright, looking left",
        composition: {
          position: "right side of the sofa",
          pose: "sitting upright",
          actions: [],
          gaze: "looking left"
        }
      }],
      negative: "text; watermark!"
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe([
      "score_9, (detail:1.25)",
      "<lora:sofa:0.8>",
      "2girls",
      "left side of the sofa, reclining into the cushions, looking toward the other girl",
      "girl, blonde hair, blue eyes, red dress, smiling",
      "right side of the sofa, sitting upright, looking left",
      "girl, black hair, green eyes, white blouse, black skirt, gentle smile",
      "holding hands, leaning together on the sofa",
      "sunken living room, rainy evening, warm lamp light, soft shadows, intimate mood, green velvet sofa, low coffee table, rainy window, bookshelf, cream rug",
      "wide shot, from side",
      "cinematic finish"
    ].join(",\n\n"));
    expect(entry.negative).toBe("lowres, bad anatomy, extra fingers, malformed hands, text, watermark");
    expect(renderPrompt(entry.corePrompt, config.promptSyntax)).toBe([
      "2girls",
      "left side of the sofa, reclining into the cushions, looking toward the other girl",
      "girl, blonde hair, blue eyes, red dress, smiling",
      "right side of the sofa, sitting upright, looking left",
      "girl, black hair, green eyes, white blouse, black skirt, gentle smile",
      "holding hands, leaning together on the sofa",
      "sunken living room, rainy evening, warm lamp light, soft shadows, intimate mood, green velvet sofa, low coffee table, rainy window, bookshelf, cream rug",
      "wide shot, from side"
    ].join(",\n\n"));
    expect(entry.shotNegative).toBe("text; watermark!");
    expect(renderPrompt(entry.prompt, config.promptSyntax).match(/holding hands/g)).toHaveLength(1);
    expect(renderPrompt(entry.prompt, config.promptSyntax).match(/sitting upright/g)).toHaveLength(1);
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
      sharedComposition: { interaction: ["reaching for another"], spatialRelation: "hands nearly touching across the gap" },
      camera: { framing: "close-up", angle: "", perspective: "", focus: [] },
      characters: [{
        label: "girl",
        appearance: "black hair",
        action: "leaning forward",
        composition: {
          position: "foreground",
          pose: "leaning across the platform edge",
          actions: [],
          gaze: ""
        }
      }]
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe(
      "1girl, foreground, leaning across the platform edge, girl, black hair, reaching for another, railway platform, foggy dawn, close-up"
    );
  });

  test("uses legacy character and shared action tags only when atomic composition is missing", () => {
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
      "from the viewer's POV, the girl spins toward the viewer and fixes her gaze on the camera",
      "girl, short golden blonde hair, red eyes, annoyed, blush, turning around, marching toward viewer",
      "residential street, evening, warm amber streetlamp light, tense atmosphere, streetlamps, houses, paved sidewalk",
      "cowboy shot, low angle, pov"
    ].join(",\n\n"));
    expect(rendered).not.toContain("Jay");
    expect(rendered).toContain("turning around");
    expect(rendered).not.toContain("looking at viewer");
    expect(rendered.indexOf("cowboy shot")).toBeGreaterThan(rendered.indexOf("short golden blonde hair"));
  });

  test("renders atomic scene data once and rejects camera field leakage", () => {
    const config = { ...DEFAULT_CONFIG, promptSyntax: "comfyui" as const };
    const entry = assemblePrompt({ environment: {
      location: "quiet residential road",
      timeWeather: "dusk with falling cherry blossom petals",
      lightingMood: ["warm amber streetlamp rim light", "soft evening glow"],
      backgroundElements: ["cherry blossom trees", "lamplit pavement"]
    } }, {
      situation: "1girl",
      camera: {
        framing: "medium shot",
        angle: "eye level",
        perspective: "pov",
        focus: ["shallow depth of field", "rim light"],
        lighting: "streetlight behind her ear"
      } as any,
      action: "turning, glaring",
      sharedComposition: { interaction: [], spatialRelation: "" },
      characters: [{
        label: "girl",
        appearance: "short golden blonde hair, red eyes, white pupils, fair skin, round face",
        body: "petite, small breasts",
        attire: "black sailor uniform, red sailor ribbon, black pleated skirt, white pantyhose, brown loafers",
        expression: "suspicious, narrowed eyes, parted lips",
        action: "turning around, glaring, leaning inward",
        composition: {
          position: "center frame",
          pose: "leaning forward with both hands clasped behind her back",
          actions: ["mid-turn toward the viewer"],
          gaze: "looking directly at the viewer",
          lighting: "golden hair rim-lit by a streetlamp"
        } as any
      }]
    }, config, 1, 1);

    const rendered = renderPrompt(entry.prompt, config.promptSyntax);
    expect(rendered).toBe([
      "1girl",
      "center frame, leaning forward with both hands clasped behind her back, mid-turn toward the viewer, looking directly at the viewer",
      "girl, short golden blonde hair, red eyes, white pupils, fair skin, round face, petite, small breasts, black sailor uniform, red sailor ribbon, black pleated skirt, white pantyhose, brown loafers, suspicious, narrowed eyes, parted lips",
      "quiet residential road, dusk with falling cherry blossom petals, warm amber streetlamp rim light, soft evening glow, cherry blossom trees, lamplit pavement",
      "medium shot, eye level, pov, shallow depth of field"
    ].join(",\n\n"));
    expect(rendered).not.toContain("streetlight behind her ear");
    expect(rendered).not.toContain("turning around");
    expect(rendered).not.toContain("glaring");
    expect(rendered.match(/mid-turn/g)).toHaveLength(1);
  });
});

describe("perspective selection and projection", () => {
  test("uses the parser's per-shot choice in Adaptive Mode and projects only Creative visible tags", () => {
    const config = { ...DEFAULT_CONFIG, adaptiveMode: true, promptSyntax: "nai" as const };
    const entry = assemblePrompt({ environment: { location: "train carriage", timeWeather: "night" } }, {
      paragraph: 1,
      perspectiveMode: "creative",
      situation: "1girl",
      camera: { framing: "body-part focus", angle: "", perspective: "", focus: ["shallow depth of field"] },
      characters: [{
        name: "Mira",
        label: "girl",
        appearance: "long silver hair, blue eyes, fair skin",
        body: "tall, curvy",
        attire: "red coat, black skirt, leather boots",
        expression: "smile",
        renderScope: "close view of her red sleeve brushing the window",
        visibleTags: "girl, red sleeve, fingertips, window reflection",
        composition: { position: "foreground", pose: "", actions: ["touching the glass"], gaze: "" }
      }]
    }, config, 1, 1);
    const rendered = renderPrompt(entry.prompt, config.promptSyntax);

    expect(entry).toMatchObject({ perspectiveMode: "creative", perspectiveSource: "adaptive" });
    expect(rendered).toContain("red sleeve, fingertips, window reflection");
    expect(rendered).not.toContain("long silver hair");
    expect(rendered).not.toContain("blue eyes");
    expect(rendered).not.toContain("black skirt");
    expect(rendered).not.toContain("leather boots");
  });

  test("manual perspective overrides an incompatible parser value", () => {
    const config = { ...DEFAULT_CONFIG, adaptiveMode: false, perspectiveMode: "static" as const };
    const entry = assemblePrompt({}, { perspectiveMode: "creative", situation: "1girl", characters: [{ label: "girl", appearance: "blue hair" }] }, config, 1, 1);
    expect(entry).toMatchObject({ perspectiveMode: "static", perspectiveSource: "manual" });
    expect(renderPrompt(entry.prompt, config.promptSyntax)).toContain("blue hair");
  });

  test("locks Static Anima prompts to a simple foreground pose and readable visual-novel background", () => {
    const config = {
      ...DEFAULT_CONFIG,
      adaptiveMode: false,
      perspectiveMode: "static" as const,
      promptSyntax: "comfyui" as const
    };
    const entry = assemblePrompt({
      environment: {
        location: "school courtyard",
        timeWeather: "sunny afternoon",
        lightingMood: ["soft daylight"],
        backgroundElements: ["school windows", "flower beds"]
      }
    }, {
      perspectiveMode: "dynamic",
      situation: "1girl",
      camera: {
        framing: "close-up",
        angle: "dutch angle",
        perspective: "pov",
        focus: ["motion blur"]
      },
      action: "running, reaching",
      characters: [{
        label: "girl",
        appearance: "long black hair, blue eyes",
        attire: "blue school uniform",
        expression: "gentle smile",
        action: "running, reaching",
        composition: {
          position: "far background",
          pose: "lunging forward",
          actions: ["reaching toward the viewer"],
          gaze: "looking toward the viewer"
        }
      }],
      sharedComposition: {
        interaction: ["grabbing the viewer's hand"],
        spatialRelation: "rushing into the foreground"
      }
    }, config, 1, 1);
    const rendered = renderPrompt(entry.prompt, config.promptSyntax);

    expect(rendered).toContain([
      "slightly forward from the background",
      "holding a simple stable pose",
      "looking toward the viewer"
    ].join(", "));
    expect(rendered).toContain("school courtyard, sunny afternoon, soft daylight, school windows, flower beds");
    expect(rendered).toEndWith("medium shot, eye level, straight-on, deep focus");
    expect(rendered).not.toContain("running");
    expect(rendered).not.toContain("reaching");
    expect(rendered).not.toContain("lunging");
    expect(rendered).not.toContain("grabbing");
    expect(rendered).not.toContain("dutch angle");
    expect(rendered).not.toContain("motion blur");
  });

  test("falls back to Dynamic when an adaptive parser omits or misspells its choice", () => {
    const config = { ...DEFAULT_CONFIG, adaptiveMode: true };
    const entry = assemblePrompt({}, { perspectiveMode: "cinematic", situation: "1girl" }, config, 1, 1);
    expect(entry).toMatchObject({ perspectiveMode: "dynamic", perspectiveSource: "adaptive" });
  });
});

describe("prompt compatibility and normalization", () => {
  test("reapplies current preset layers around an unchanged generated prompt for rerolls", () => {
    const config = {
      ...DEFAULT_CONFIG,
      promptSyntax: "comfyui" as const,
      customPositivePrefix: "current custom; prefix",
      customPositiveSuffix: "current suffix!",
      customNegative: "current custom negative;",
      promptPresets: [{
        id: "current",
        name: "Current",
        positivePrefix: "current preset; quality",
        negativePrefix: "current preset negative;"
      }],
      activePromptPresetId: "current"
    };
    const core = "1girl,\n\ncenter frame, turning toward the viewer,\n\ngirl, blonde hair";

    expect(renderPromptWithCurrentAffixes(core, "ordered", config)).toBe([
      "current preset, quality",
      "current custom, prefix",
      core,
      "current suffix"
    ].join(",\n\n"));
    expect(renderNegativeWithCurrentSelection("text, watermark", "ordered", config)).toBe(
      "current preset negative, current custom negative, text, watermark"
    );
  });

  test("restores stable Default formatting without experimental punctuation normalization", () => {
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
      supplement: "Centered against a tall canvas; soft rim light!",
      negative: "text;"
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe([
      "<lora:ink:0.75>; (quality:1.5); 1.2::sharp focus::",
      "portrait;, 1girl, standing!",
      "studio; night.",
      "girl, blue hair",
      "Centered against a tall canvas, soft rim light",
      "finish?"
    ].join(",\n"));
    expect(entry.negative).toBe("bad hands; lowres!, text;");
  });

  test("normalizes supplement punctuation for NovelAI without changing surrounding legacy tags", () => {
    const config = { ...DEFAULT_CONFIG, promptStyle: "default" as const, promptSyntax: "nai" as const };
    const entry = assemblePrompt({ place: "studio; night." }, {
      situation: "1girl",
      characters: [{ label: "girl", appearance: "blue hair" }],
      supplement: "Seen through a mirror;;; framed by flowers?"
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe(
      "1girl, studio; night., girl, blue hair, Seen through a mirror, framed by flowers"
    );
    expect(parserInstruction(config)).toContain("Separate supplement phrases with commas, never semicolons");
  });
});

describe("Anima parser contract and visual distinctness", () => {
  test("requests composition and budgeted structured environment without requesting supplement", () => {
    const instruction = parserInstruction(DEFAULT_CONFIG);

    expect(instruction).toContain('"composition": {');
    expect(instruction).toContain('"position": "string"');
    expect(instruction).toContain('"actions": ["string"]');
    expect(instruction).toContain('"sharedComposition": {');
    expect(instruction).toContain('"interaction": ["string"]');
    expect(instruction).toContain('"camera": {');
    expect(instruction).toContain('"environment": {');
    expect(instruction).toContain('"perspectiveMode": "creative | static | dynamic"');
    expect(instruction).toContain('"renderScope": "string"');
    expect(instruction).toContain('"visibleTags": "string"');
    expect(instruction).toContain("exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements");
    expect(instruction).toContain("Preserve the source's explicit action, direction of movement, visible emotional state, and interpersonal tone");
    expect(instruction).toContain("Do not put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle");
    expect(instruction).toContain("Do not output legacy shot.action or characters[].action fields");
    expect(instruction).toContain("camera.framing must be empty or exactly one of");
    expect(instruction).toContain("A fact must have exactly one owner");
    expect(instruction).toContain("never collapse an object into a string");
    expect(instruction).toContain("never infer romance, calm, menace, or another emotional tone from lighting alone");
    expect(instruction).toContain("unless Creative deliberately isolates a smaller visual anchor");
    expect(instruction).not.toContain('"supplement": "string"');
  });

  test("includes character/shared composition and environment fields in exact visual keys", () => {
    const shot = {
      paragraph: 1,
      camera: { framing: "medium shot", angle: "eye level", perspective: "from side", focus: [] },
      characters: [{ expression: "smile", composition: { position: "left side", pose: "sitting", actions: [], gaze: "looking right" } }],
      sharedComposition: { interaction: ["holding hands"], spatialRelation: "side by side" }
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
    const [differentCamera] = normalizeScenePayload({ scenes: [{
      environment,
      shots: [{ ...shot, camera: { ...shot.camera, framing: "close-up" } }]
    }] });
    const [differentComposition] = normalizeScenePayload({ scenes: [{
      environment,
      shots: [{
        ...shot,
        characters: [{ expression: "smile", composition: { position: "right side", pose: "sitting", actions: [], gaze: "looking left" } }]
      }]
    }] });
    const [differentProjection] = normalizeScenePayload({ scenes: [{
      environment,
      shots: [{
        ...shot,
        perspectiveMode: "creative",
        characters: [{
          expression: "smile",
          composition: { position: "left side", pose: "sitting", actions: [], gaze: "looking right" },
          renderScope: "only the window reflection",
          visibleTags: "blue eyes, window reflection"
        }]
      }]
    }] });

    expect(exactVisualKey(first)).not.toBe(exactVisualKey(different));
    expect(exactVisualKey(first)).not.toBe(exactVisualKey(differentCamera));
    expect(exactVisualKey(first)).not.toBe(exactVisualKey(differentComposition));
    expect(exactVisualKey(first)).not.toBe(exactVisualKey(differentProjection));
  });

  test("silently drops removed legacy cleanup configuration keys", () => {
    const config = normalizeConfig({ danbooruCleanup: true, danbooruEndpoint: "http://legacy.invalid" });

    expect(config).toEqual(DEFAULT_CONFIG);
    expect("danbooruCleanup" in config).toBe(false);
    expect("danbooruEndpoint" in config).toBe(false);
  });
});
