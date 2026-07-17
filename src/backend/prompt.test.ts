import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, normalizeConfig } from "../shared/config.js";
import { parserInstruction } from "./instructions.js";
import { assemblePrompt, renderPrompt } from "./prompt.js";
import { exactVisualKey, normalizeScenePayload } from "./scenes.js";

describe("ordered Anima prompt composition", () => {
  test("renders a multi-character sofa scene in exact hybrid order with ComfyUI blank lines", () => {
    const config = {
      ...DEFAULT_CONFIG,
      mode: "experimental" as const,
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
      "wide shot, from side",
      "left side of the sofa, reclining into the cushions, looking toward the other girl",
      "girl, blonde hair, blue eyes, red dress, smiling",
      "right side of the sofa, sitting upright, looking left",
      "girl, black hair, green eyes, white blouse, black skirt, gentle smile",
      "holding hands, leaning together on the sofa",
      "sunken living room, rainy evening, warm lamp light, soft shadows, intimate mood, green velvet sofa, low coffee table, rainy window, bookshelf, cream rug",
      "cinematic finish"
    ].join(",\n\n"));
    expect(entry.negative).toBe("lowres, bad anatomy, extra fingers, malformed hands, text, watermark");
    expect(renderPrompt(entry.prompt, config.promptSyntax).match(/holding hands/g)).toHaveLength(1);
    expect(renderPrompt(entry.prompt, config.promptSyntax).match(/sitting upright/g)).toHaveLength(1);
  });

  test("keeps character composition and location/time when natural/shared detail is disabled", () => {
    const config = { ...DEFAULT_CONFIG, mode: "experimental" as const, promptSyntax: "nai" as const, supplement: false };
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
      "1girl, close-up, foreground, leaning across the platform edge, girl, black hair, reaching for another, railway platform, foggy dawn"
    );
  });

  test("uses legacy character and shared action tags only when atomic composition is missing", () => {
    const config = { ...DEFAULT_CONFIG, mode: "experimental" as const, promptSyntax: "nai" as const };
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
    const config = { ...DEFAULT_CONFIG, mode: "experimental" as const, promptSyntax: "nai" as const };
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
    const config = { ...DEFAULT_CONFIG, mode: "experimental" as const, promptSyntax: "comfyui" as const };
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

  test("renders atomic scene data once and rejects camera field leakage", () => {
    const config = { ...DEFAULT_CONFIG, mode: "experimental" as const, promptSyntax: "comfyui" as const };
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
      "medium shot, eye level, pov, shallow depth of field",
      "center frame, leaning forward with both hands clasped behind her back, mid-turn toward the viewer, looking directly at the viewer",
      "girl, short golden blonde hair, red eyes, white pupils, fair skin, round face, petite, small breasts, black sailor uniform, red sailor ribbon, black pleated skirt, white pantyhose, brown loafers, suspicious, narrowed eyes, parted lips",
      "quiet residential road, dusk with falling cherry blossom petals, warm amber streetlamp rim light, soft evening glow, cherry blossom trees, lamplit pavement"
    ].join(",\n\n"));
    expect(rendered).not.toContain("streetlight behind her ear");
    expect(rendered).not.toContain("turning around");
    expect(rendered).not.toContain("glaring");
    expect(rendered.match(/mid-turn/g)).toHaveLength(1);
  });
});

describe("stable Illustration rollback", () => {
  test("uses the original place, action, and supplement parser contract", () => {
    const instruction = parserInstruction(DEFAULT_CONFIG);

    expect(instruction).toContain('"place": "string"');
    expect(instruction).toContain('"camera": "string"');
    expect(instruction).toContain('"action": "string"');
    expect(instruction).toContain('"supplement": "string"');
    expect(instruction).not.toContain('"composition": {');
    expect(instruction).not.toContain('"environment": {');
    expect(instruction).not.toContain("Atomic Natural Composition");
  });

  test("restores the original Anima section order, supplement placement, and ComfyUI separators", () => {
    const config = {
      ...DEFAULT_CONFIG,
      promptSyntax: "comfyui" as const,
      customPositiveSuffix: "finish!",
      customNegative: "bad hands; lowres!"
    };
    const entry = assemblePrompt({ place: "exterior, residential street, amber streetlight" }, {
      situation: "1girl",
      action: "turning around",
      camera: "medium close-up, from side",
      characters: [{
        label: "girl",
        appearance: "short blonde hair, red eyes",
        attire: "black sailor uniform",
        expression: "suspicious",
        action: "leaning inward, looking at viewer"
      }],
      supplement: "The girl is framed against the quiet road.",
      negative: "text;"
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe([
      "1girl",
      "girl, short blonde hair, red eyes, black sailor uniform, suspicious",
      "turning around, leaning inward, looking at viewer",
      "medium close-up, from side",
      "exterior, residential street, amber streetlight",
      "The girl is framed against the quiet road.",
      "finish!"
    ].join(",\n"));
    expect(entry.negative).toBe("bad hands; lowres!, text;");
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
      supplement: "Centered against a tall canvas.",
      negative: "text;"
    }, config, 1, 1);

    expect(renderPrompt(entry.prompt, config.promptSyntax)).toBe([
      "<lora:ink:0.75>; (quality:1.5); 1.2::sharp focus::",
      "portrait;, 1girl, standing!",
      "studio; night.",
      "girl, blue hair",
      "Centered against a tall canvas.",
      "finish?"
    ].join(",\n"));
    expect(entry.negative).toBe("bad hands; lowres!, text;");
  });
});

describe("Anima parser contract and visual distinctness", () => {
  test("requests composition and budgeted structured environment without requesting supplement", () => {
    const instruction = parserInstruction({ ...DEFAULT_CONFIG, mode: "experimental" });

    expect(instruction).toContain('"composition": {');
    expect(instruction).toContain('"position": "string"');
    expect(instruction).toContain('"actions": ["string"]');
    expect(instruction).toContain('"sharedComposition": {');
    expect(instruction).toContain('"interaction": ["string"]');
    expect(instruction).toContain('"camera": {');
    expect(instruction).toContain('"environment": {');
    expect(instruction).toContain("exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements");
    expect(instruction).toContain("Preserve the source's explicit action, direction of movement, visible emotional state, and interpersonal tone");
    expect(instruction).toContain("Do not put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle");
    expect(instruction).toContain("Do not output legacy shot.action or characters[].action fields");
    expect(instruction).toContain("camera.framing must be empty or exactly one of");
    expect(instruction).toContain("A fact must have exactly one owner");
    expect(instruction).toContain("never collapse an object into a string");
    expect(instruction).toContain("never infer romance, calm, menace, or another emotional tone from lighting alone");
    expect(instruction).toContain("Choose framing that can visibly contain the complete focal action");
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

    expect(exactVisualKey(first)).not.toBe(exactVisualKey(different));
    expect(exactVisualKey(first)).not.toBe(exactVisualKey(differentCamera));
    expect(exactVisualKey(first)).not.toBe(exactVisualKey(differentComposition));
  });

  test("silently drops removed legacy cleanup configuration keys", () => {
    const config = normalizeConfig({ danbooruCleanup: true, danbooruEndpoint: "http://legacy.invalid" });

    expect(config).toEqual(DEFAULT_CONFIG);
    expect("danbooruCleanup" in config).toBe(false);
    expect("danbooruEndpoint" in config).toBe(false);
  });
});
