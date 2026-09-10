import { describe, expect, test } from "bun:test";
import archivedCard from "../../references/original-module/card.json";
import { DEFAULT_CONFIG, normalizeConfig } from "../shared/config.js";
import { parserInstruction } from "./instructions.js";
import { resolveIllustrationPlan } from "./shot-resolution.js";
import {
  assemblePrompt,
  compilePrompt,
  projectDynamicVisibleTags,
  renderNegativeWithCurrentSelection,
  renderPrompt,
  renderPromptWithCurrentAffixes
} from "./prompt.js";
import type { IllustrationInput, PlannedShot } from "./domain.js";
import { exactVisualKey, normalizeAtomicCompositionTerms, normalizeScenePayload } from "./scenes.js";

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
      "1girl, foreground, leaning across the platform edge, girl, black hair, reaching for another, railway platform, foggy dawn, upper body"
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

  test("anonymizes unique first names in shared composition", () => {
    const config = { ...DEFAULT_CONFIG, promptSyntax: "nai" as const };
    const entry = assemblePrompt({ environment: {
      location: "train platform",
      timeWeather: "rainy evening",
      lightingMood: ["overcast light"],
      backgroundElements: ["departing train"]
    } }, {
      situation: "1girl, 1boy",
      camera: { framing: "medium shot", angle: "eye level", perspective: "three-quarter view", focus: [] },
      sharedComposition: {
        interaction: ["Rhea gripping Evan's sleeve"],
        spatialRelation: "Rhea stands close beside Evan"
      },
      characters: [
        { name: "Rhea Calder", label: "girl", composition: { position: "left", pose: "standing", actions: [], gaze: "" } },
        { name: "Evan Dorne", label: "boy", composition: { position: "right", pose: "leaning back", actions: [], gaze: "" } }
      ]
    }, config, 1, 1);

    const rendered = renderPrompt(entry.prompt, config.promptSyntax);
    expect(rendered).not.toContain("Rhea");
    expect(rendered).not.toContain("Evan");
    expect(rendered).toContain("the girl gripping the boy's sleeve");
    expect(rendered).toContain("the girl stands close beside the boy");
  });

  test("removes shared interactions already owned by an individual composition", () => {
    const config = { ...DEFAULT_CONFIG, promptSyntax: "nai" as const };
    const entry = assemblePrompt({ environment: {
      location: "train compartment",
      timeWeather: "rainy evening",
      lightingMood: ["soft interior light"],
      backgroundElements: ["train seat"]
    } }, {
      situation: "1girl, 1boy",
      camera: { framing: "medium close-up", angle: "eye level", perspective: "straight-on", focus: [] },
      sharedComposition: { interaction: ["bandaging"], spatialRelation: "seated close together" },
      characters: [{
        name: "Rhea Calder",
        label: "girl",
        composition: { position: "left", pose: "seated", actions: ["bandaging the boy's injured palm"], gaze: "looking at the injured palm" }
      }]
    }, config, 1, 1);

    const rendered = renderPrompt(entry.prompt, config.promptSyntax);
    expect(rendered.match(/bandaging/g)).toHaveLength(1);
    expect(rendered).toContain("seated close together");
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
      "girl, short golden blonde hair, red eyes, white pupils, fair skin, round face, small breasts, black sailor uniform, red sailor ribbon, suspicious, narrowed eyes, parted lips",
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
    expect(rendered).toContain("fingertips, window reflection");
    expect(rendered).not.toContain("red sleeve");
    expect(rendered).not.toContain("long silver hair");
    expect(rendered).not.toContain("blue eyes");
    expect(rendered).not.toContain("black skirt");
    expect(rendered).not.toContain("leather boots");
    expect(rendered).not.toContain("touching the glass");
  });

  test("makes a selected Creative concept authoritative over the parser's complete composition", () => {
    const config = { ...DEFAULT_CONFIG, perspectiveMode: "creative" as const, promptSyntax: "nai" as const };
    const selectedConcept = {
      id: "creative-finger-shadow",
      paragraph: 1,
      subjectType: "shadow" as const,
      anchor: "finger shadow",
      concept: "interlaced finger shadows cross an empty desk",
      renderScope: "only interlaced finger shadows and the empty desk surface",
      camera: "tight oblique detail",
      visibleCues: ["interlaced shadows", "desk surface"],
      score: 94
    };
    const entry = assemblePrompt({
      environment: {
        location: "classroom",
        timeWeather: "afternoon",
        backgroundElements: ["desks", "chalkboard"]
      }
    }, {
      paragraph: 1,
      situation: "1girl",
      characters: [{
        label: "girl",
        renderScope: "face and both hands filling the frame",
        visibleTags: "red eye, white pupil, fingers, black sailor uniform, red ribbon",
        composition: {
          position: "center frame",
          pose: "standing upright",
          actions: ["covering her entire face with both hands"],
          gaze: "looking at viewer"
        }
      }, {
        label: "boy",
        renderScope: "the second character standing behind her",
        visibleTags: "boy, black hair, school uniform",
        composition: { position: "background", pose: "standing", actions: [], gaze: "looking forward" }
      }],
      sharedComposition: { interaction: ["standing together"], spatialRelation: "side by side" }
    }, config, 1, 1, selectedConcept);
    const rendered = renderPrompt(entry.prompt, config.promptSyntax);

    expect(entry.creativeConcept).toEqual(selectedConcept);
    expect(rendered).toContain(selectedConcept.renderScope);
    expect(rendered).toContain(selectedConcept.camera);
    expect(rendered).toContain("interlaced shadows, desk surface");
    expect(rendered).not.toContain("1girl");
    expect(rendered).not.toContain("face and both hands filling the frame");
    expect(rendered).not.toContain("standing upright");
    expect(rendered).not.toContain("covering her entire face");
    expect(rendered).not.toContain("black sailor uniform");
    expect(rendered).not.toContain("second character");
    expect(rendered).not.toContain("classroom");
    expect(rendered).not.toContain("standing together");
  });

  test("keeps the exact Creative anchor and visible cues when the frame contains no character", () => {
    const config = { ...DEFAULT_CONFIG, perspectiveMode: "creative" as const, promptSyntax: "comfyui" as const };
    const selectedConcept = {
      id: "creative-spear",
      paragraph: 1,
      subjectType: "object" as const,
      anchor: "snapped spear",
      concept: "snapped spear across a sword groove",
      renderScope: "only the snapped spear and fresh sword groove in sand",
      camera: "low ground-level detail",
      visibleCues: ["fresh sword groove", "drifting dust"],
      score: 94
    };
    const entry = assemblePrompt({}, {
      paragraph: 1,
      perspectiveMode: "creative",
      situation: "other",
      characters: []
    }, config, 1, 1, selectedConcept);
    const rendered = renderPrompt(entry.prompt, config.promptSyntax);

    expect(rendered).toBe([
      "only the snapped spear and fresh sword groove in sand",
      "snapped spear, fresh sword groove, drifting dust",
      "low ground-level detail"
    ].join(",\n\n"));
    expect(rendered).not.toContain("other");
  });

  test("manual perspective overrides an incompatible parser value", () => {
    const config = { ...DEFAULT_CONFIG, adaptiveMode: false, perspectiveMode: "static" as const };
    const entry = assemblePrompt({}, { perspectiveMode: "creative", situation: "1girl", characters: [{ label: "girl", appearance: "blue hair" }] }, config, 1, 1);
    expect(entry).toMatchObject({ perspectiveMode: "static", perspectiveSource: "manual" });
    expect(renderPrompt(entry.prompt, config.promptSyntax)).toContain("blue hair");
  });

  test("restores Original Asset Mode as a one-character viewer-facing white-background prompt", () => {
    const config = {
      ...DEFAULT_CONFIG,
      adaptiveMode: false,
      perspectiveMode: "asset" as const,
      promptSyntax: "comfyui" as const
    };
    const entry = assemblePrompt({
      environment: {
        location: "busy market",
        timeWeather: "rainy evening",
        lightingMood: ["neon light"],
        backgroundElements: ["fruit stalls"]
      }
    }, {
      perspectiveMode: "dynamic",
      situation: "2girls, nsfw",
      camera: { framing: "wide shot", angle: "high angle", perspective: "from behind", focus: [] },
      characters: [{
        name: "Mira",
        label: "girl",
        appearance: "black hair, blue eyes",
        attire: "red dress",
        composition: { position: "center frame", pose: "standing", actions: ["holding a book"], gaze: "looking away" }
      }, {
        name: "Nia",
        label: "girl",
        appearance: "red hair, green eyes",
        attire: "blue coat",
        composition: { position: "left side", pose: "waving", actions: [], gaze: "looking at viewer" }
      }]
    }, config, 1, 1);
    const rendered = renderPrompt(entry.prompt, config.promptSyntax);

    expect(entry).toMatchObject({ perspectiveMode: "asset", perspectiveSource: "manual" });
    expect(rendered).toContain("1girl, solo, nsfw");
    expect(rendered).toContain("black hair, blue eyes");
    expect(rendered).not.toContain("red hair");
    expect(rendered).toContain("looking at viewer");
    expect(rendered).not.toContain("looking away");
    expect(rendered).toContain("white background, simple background");
    expect(rendered).not.toContain("busy market");
    expect(rendered).not.toContain("fruit stalls");
    expect(rendered).toContain("portrait, cowboy shot");
    expect(rendered).not.toContain("wide shot");
  });

  test("never accepts Asset as an Adaptive per-shot choice", () => {
    const config = { ...DEFAULT_CONFIG, adaptiveMode: true, perspectiveMode: "asset" as const };
    const entry = assemblePrompt({}, { perspectiveMode: "asset", situation: "1girl" }, config, 1, 1);
    expect(entry).toMatchObject({ perspectiveMode: "dynamic", perspectiveSource: "adaptive" });
  });

  test("projects Dynamic into one prioritized action block with spatial context and framing-projected identity", () => {
    const config = {
      ...DEFAULT_CONFIG,
      adaptiveMode: false,
      perspectiveMode: "dynamic" as const,
      promptSyntax: "comfyui" as const
    };
    const entry = assemblePrompt({
      environment: {
        location: "inside a train corridor",
        timeWeather: "rainy evening",
        lightingMood: ["cold rainy light", "tense reflected light"],
        backgroundElements: ["closing doorway", "partial bronze mechanical hand", "brass handrail"]
      }
    }, {
      perspectiveMode: "dynamic",
      situation: "1girl, 1boy",
      camera: {
        framing: "medium shot",
        angle: "eye level",
        perspective: "from side",
        focus: ["motion blur"]
      },
      shotPlan: {
        primaryAction: "left man pulls right woman forward by her wrist while running left",
        secondaryCue: "right woman looks backward at the partial bronze mechanical hand",
        staging: "left man leads with right woman one step behind"
      },
      characters: [{
        name: "Rhea Calder",
        label: "girl",
        age: "mature female",
        appearance: "tan skin, long white braid, golden eyes, scar through left eyebrow",
        body: "tall",
        attire: "navy officer coat, white shirt, red sash, black trousers, knee-high black boots",
        expression: "tense",
        renderScope: "upper body visible behind the running man",
        visibleTags: "long white braid, navy officer coat, red sash",
        composition: {
          position: "right side",
          pose: "running",
          actions: ["running left"],
          gaze: "looking backward"
        }
      }, {
        name: "Evan Dorne",
        label: "boy",
        age: "mature male",
        appearance: "messy short black hair, green eyes, freckles",
        body: "lean build",
        attire: "gray hooded jacket, dark jeans, white sneakers",
        expression: "urgent",
        renderScope: "full upper body leading at the left",
        visibleTags: "messy short black hair, gray hooded jacket",
        composition: {
          position: "left side",
          pose: "running",
          actions: ["running left", "pulling the girl's wrist"],
          gaze: "looking forward"
        }
      }],
      sharedComposition: {
        interaction: ["holding wrists"],
        spatialRelation: "the man runs one step ahead"
      }
    }, config, 1, 1);
    const rendered = renderPrompt(entry.prompt, config.promptSyntax);

    expect(rendered).toBe([
      "1girl, 1boy",
      "medium shot, eye level, from side, motion blur",
      "left man pulls right woman forward by her wrist while running left, right woman looks backward at the partial bronze mechanical hand, left man leads with right woman one step behind",
      "right side, running, looking backward",
      "girl, mature female, tan skin, long white braid, golden eyes, scar through left eyebrow, navy officer coat, white shirt, red sash, tense",
      "left side, running, looking forward",
      "boy, mature male, messy short black hair, green eyes, freckles, lean build, gray hooded jacket, urgent",
      "inside a train corridor, rainy evening, cold rainy light, closing doorway, partial bronze mechanical hand, brass handrail"
    ].join(",\n\n"));
    expect(rendered.match(/pulls|pulling/g)).toHaveLength(1);
    expect(rendered).toContain("golden eyes");
    expect(rendered).not.toContain("black trousers");
    expect(rendered).not.toContain("knee-high black boots");
    expect(rendered).not.toContain("dark jeans");
    expect(rendered).not.toContain("white sneakers");
    expect(rendered).not.toContain("holding wrists");
    expect(rendered).toContain("brass handrail");
    expect(entry.corePrompt.sections).toHaveLength(8);
  });

  test("keeps Dynamic action priority when natural shared detail is disabled and omits facial state from a fragment crop", () => {
    const config = {
      ...DEFAULT_CONFIG,
      adaptiveMode: false,
      perspectiveMode: "dynamic" as const,
      promptSyntax: "nai" as const,
      supplement: false
    };
    const entry = assemblePrompt({
      environment: {
        location: "inside a train corridor",
        timeWeather: "rainy evening",
        lightingMood: ["cold window light"],
        backgroundElements: ["closing doorway"]
      }
    }, {
      perspectiveMode: "dynamic",
      situation: "1girl",
      camera: { framing: "body-part focus", angle: "eye level", perspective: "from side", focus: [] },
      shotPlan: {
        primaryAction: "woman's gloved hand grips a brass rail",
        secondaryCue: "",
        staging: "the hand fills the foreground"
      },
      characters: [{
        label: "girl",
        age: "mature female",
        appearance: "long white braid, golden eyes",
        attire: "navy officer coat, black leather gloves",
        expression: "furious, glaring",
        renderScope: "only the hand detail",
        visibleTags: "black leather glove, navy sleeve",
        composition: {
          position: "foreground",
          pose: "arm extended",
          actions: ["gripping the brass rail"],
          gaze: ""
        }
      }]
    }, config, 1, 1);
    const rendered = renderPrompt(entry.prompt, config.promptSyntax);

    expect(rendered).toContain("woman's gloved hand grips a brass rail");
    expect(rendered).toContain("black leather glove, navy sleeve");
    expect(rendered).toContain("inside a train corridor, rainy evening");
    expect(rendered).not.toContain("cold window light");
    expect(rendered).not.toContain("closing doorway");
    expect(rendered).not.toContain("mature female");
    expect(rendered).not.toContain("furious");
    expect(rendered).not.toContain("golden eyes");
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
          pose: "standing upright with arms relaxed at sides",
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
      "standing upright with arms relaxed at sides",
      "looking toward the viewer"
    ].join(", "));
    expect(rendered).toContain("school courtyard, sunny afternoon, soft daylight, school windows, flower beds");
    expect(rendered).toEndWith("medium shot, eye level, straight-on, deep focus");
    expect(rendered).not.toContain("running");
    expect(rendered).not.toContain("reaching");
    expect(rendered).not.toContain("grabbing");
    expect(rendered).not.toContain("dutch angle");
    expect(rendered).not.toContain("motion blur");

    const fallback = assemblePrompt({
      environment: {
        location: "school courtyard",
        timeWeather: "sunny afternoon",
        backgroundElements: ["school windows", "flower beds"]
      }
    }, {
      situation: "1girl",
      characters: [{ label: "girl", appearance: "black hair", composition: { pose: "" } }]
    }, config, 1, 1);
    expect(renderPrompt(fallback.prompt, config.promptSyntax)).toContain(
      "slightly forward from the background, standing upright with arms relaxed at sides"
    );
    const legacyAmbiguousPose = assemblePrompt({
      environment: {
        location: "school courtyard",
        timeWeather: "sunny afternoon",
        backgroundElements: ["school windows", "flower beds"]
      }
    }, {
      situation: "1girl",
      characters: [{
        label: "girl",
        appearance: "black hair",
        composition: { pose: "holding a simple stable pose", actions: [] }
      }]
    }, config, 1, 1);
    const legacyAmbiguousPrompt = renderPrompt(legacyAmbiguousPose.prompt, config.promptSyntax);
    expect(legacyAmbiguousPrompt).toContain("standing upright with arms relaxed at sides");
    expect(legacyAmbiguousPrompt).not.toContain("holding a simple stable pose");

    const noNaturalDetail = assemblePrompt({
      environment: {
        location: "school courtyard",
        timeWeather: "sunny afternoon",
        lightingMood: ["soft daylight"],
        backgroundElements: ["school windows", "flower beds"]
      }
    }, {
      situation: "1girl",
      characters: [{
        label: "girl",
        appearance: "black hair",
        composition: { pose: "standing upright with arms relaxed at sides", actions: [] }
      }]
    }, { ...config, supplement: false }, 1, 1);
    const noNaturalDetailPrompt = renderPrompt(noNaturalDetail.prompt, config.promptSyntax);
    expect(noNaturalDetailPrompt).toContain("school courtyard, sunny afternoon, school windows, flower beds");
    expect(noNaturalDetailPrompt).not.toContain("soft daylight");
  });

  test("places two Static characters in stable left and right visual-novel lanes", () => {
    const config = {
      ...DEFAULT_CONFIG,
      adaptiveMode: false,
      perspectiveMode: "static" as const,
      promptSyntax: "nai" as const
    };
    const entry = assemblePrompt({
      environment: {
        location: "castle gatehouse",
        timeWeather: "morning",
        backgroundElements: ["stone arch"]
      }
    }, {
      situation: "2people",
      characters: [
        { label: "woman", appearance: "white braid", composition: { pose: "lunging", actions: ["swinging a sword"] } },
        { label: "man", appearance: "black hair", composition: { pose: "running", actions: ["raising a shield"] } }
      ]
    }, config, 1, 1);
    const rendered = renderPrompt(entry.prompt, config.promptSyntax);

    expect(rendered).toContain("left side slightly forward from the background, lunging");
    expect(rendered).toContain("right side slightly forward from the background, running");
    expect(rendered).not.toContain("swinging");
    expect(rendered).not.toContain("raising a shield");
  });

  test("falls back to Dynamic when an adaptive parser omits or misspells its choice", () => {
    const config = { ...DEFAULT_CONFIG, adaptiveMode: true };
    const entry = assemblePrompt({}, { perspectiveMode: "cinematic", situation: "1girl" }, config, 1, 1);
    expect(entry).toMatchObject({ perspectiveMode: "dynamic", perspectiveSource: "adaptive" });
  });
});

describe("visibility tier projection", () => {
  const dynamicConfig = {
    ...DEFAULT_CONFIG,
    adaptiveMode: false,
    perspectiveMode: "dynamic" as const,
    promptSyntax: "comfyui" as const
  };

  const baselineCharacter = {
    name: "Rhea Calder",
    label: "girl",
    age: "mature female",
    appearance: "black hair, blue eyes",
    body: "tall",
    attire: "red jacket, black skirt, white thighhighs, brown boots",
    expression: "tense"
  };

  const dynamicShot = (camera: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    perspectiveMode: "dynamic",
    situation: "1girl",
    camera,
    shotPlan: { primaryAction: "girl stands in the center", secondaryCue: "", staging: "the girl fills the frame" },
    characters: [baselineCharacter],
    sharedComposition: { interaction: [], spatialRelation: "" },
    ...extra
  });

  function renderCharacter(camera: unknown, extra: Record<string, unknown> = {}): string {
    const entry = assemblePrompt(
      { environment: { location: "courtyard", timeWeather: "sunny", lightingMood: [], backgroundElements: [] } },
      dynamicShot(camera, extra) as never,
      dynamicConfig,
      1,
      1
    );
    return renderPrompt(entry.prompt, dynamicConfig.promptSyntax);
  }

  test("projection and camera repair do not mutate the parsed baseline or shot", () => {
    const shot = dynamicShot(
      { framing: "portrait", angle: "eye level", perspective: "straight-on", focus: [] },
      { shotPlan: { primaryAction: "the girl kicks with her brown boot", secondaryCue: "", staging: "the girl fills the frame" } }
    );
    const before = JSON.stringify(shot);
    assemblePrompt(
      { environment: { location: "courtyard", timeWeather: "sunny", lightingMood: [], backgroundElements: [] } },
      shot as never,
      dynamicConfig,
      1,
      1
    );
    expect(JSON.stringify(shot)).toBe(before);
    expect(shot.characters).toEqual([baselineCharacter]);
  });

  test("portrait projection drops lower-body and footwear traits", () => {
    const rendered = renderCharacter({ framing: "portrait", angle: "eye level", perspective: "straight-on", focus: [] });
    expect(rendered).toContain("black hair, blue eyes, red jacket");
    expect(rendered).not.toContain("tall");
    expect(rendered).not.toContain("curvy");
    expect(rendered).not.toContain("black skirt");
    expect(rendered).not.toContain("thighhighs");
    expect(rendered).not.toContain("brown boots");
  });

  test("cowboy shot keeps hips and legs but drops footwear", () => {
    const rendered = renderCharacter({ framing: "cowboy shot", angle: "eye level", perspective: "straight-on", focus: [] });
    expect(rendered).toContain("black skirt");
    expect(rendered).toContain("white thighhighs");
    expect(rendered).not.toContain("brown boots");
  });

  test("full body keeps the complete baseline including footwear", () => {
    const rendered = renderCharacter({ framing: "full body", angle: "eye level", perspective: "straight-on", focus: [] });
    expect(rendered).toContain("red jacket, black skirt, white thighhighs, brown boots");
  });

  test("from behind hides face traits but keeps hair and upper-body attire", () => {
    const rendered = renderCharacter({ framing: "upper body", angle: "eye level", perspective: "from behind", focus: [] });
    expect(rendered).toContain("black hair");
    expect(rendered).toContain("red jacket");
    expect(rendered).not.toContain("blue eyes");
    expect(rendered).not.toContain("tense");
  });

  test("eyes-out-of-frame fragments use visibleTags without restoring eye traits", () => {
    const rendered = renderCharacter(
      { framing: "eyes out of frame", angle: "eye level", perspective: "straight-on", focus: [] },
      { characters: [{ ...baselineCharacter, renderScope: "eyes out of frame", visibleTags: "black hair, blue eyes, red jacket" }] }
    );
    expect(rendered).toContain("black hair, red jacket");
    expect(rendered).not.toContain("blue eyes");
    expect(rendered).not.toContain("tense");
  });

  test("head-out-of-frame fragments reject contradictory head and face visibleTags", () => {
    const rendered = renderCharacter(
      { framing: "head out of frame", angle: "eye level", perspective: "straight-on", focus: [] },
      { characters: [{ ...baselineCharacter, renderScope: "head out of frame", visibleTags: "black hair, blue eyes, red jacket, brown boots" }] }
    );
    expect(rendered).toContain("red jacket, brown boots");
    expect(rendered).not.toContain("black hair");
    expect(rendered).not.toContain("blue eyes");
    expect(rendered).not.toContain("tense");
  });

  test("source-critical lower-body action widens the camera instead of injecting into a portrait", () => {
    const rendered = renderCharacter(
      { framing: "portrait", angle: "eye level", perspective: "straight-on", focus: [] },
      { shotPlan: { primaryAction: "the girl kicks with her brown boot", secondaryCue: "", staging: "the girl faces the viewer" } }
    );
    expect(rendered).toContain("full body, eye level, straight-on");
    expect(rendered).toContain("brown boots");
    expect(rendered).toContain("black skirt");
    expect(rendered).not.toContain("portrait, eye level");
  });

  test("stale legacy action cannot widen a structured Dynamic shot", () => {
    const rendered = renderCharacter(
      { framing: "portrait", angle: "eye level", perspective: "straight-on", focus: [] },
      {
        action: "the girl kicks with her brown boot",
        shotPlan: { primaryAction: "the girl smiles", secondaryCue: "", staging: "the girl fills the frame" }
      }
    );
    expect(rendered).toContain("portrait, eye level, straight-on");
    expect(rendered).not.toContain("brown boots");
    expect(rendered).not.toContain("kicks with her brown boot");
  });

  test("keeps global identity traits while dropping a localized tail from portraits", () => {
    const rendered = renderCharacter(
      { framing: "portrait", angle: "eye level", perspective: "straight-on", focus: [] },
      { characters: [{ ...baselineCharacter, identity: "furry, wolf girl, fluffy tail", attire: "blue jacket, black skirt, brown boots" }] }
    );
    expect(rendered).toContain("furry, wolf girl");
    expect(rendered).not.toContain("fluffy tail");
    expect(rendered).toContain("blue jacket");
    expect(rendered).not.toContain("black skirt");
  });

  test("missing framing keeps the complete baseline", () => {
    const rendered = renderCharacter({ angle: "eye level", perspective: "straight-on", focus: [] });
    expect(rendered).toContain("red jacket, black skirt, white thighhighs, brown boots");
  });

  test("parser visibleTags add in-crop traits but cannot defeat the crop", () => {
    const rendered = renderCharacter(
      { framing: "medium shot", angle: "eye level", perspective: "straight-on", focus: [] },
      { characters: [{ ...baselineCharacter, visibleTags: "black hair, red jacket, brown boots" }] }
    );
    expect(rendered).toContain("red jacket");
    expect(rendered).not.toContain("brown boots");
  });

  test("from behind removes standalone facial appearance vocabulary", () => {
    const rendered = renderCharacter(
      { framing: "upper body", angle: "eye level", perspective: "from behind", focus: [] },
      { characters: [{ ...baselineCharacter, appearance: "black hair, heterochromia, tareme, beauty mark" }] }
    );
    expect(rendered).toContain("black hair");
    expect(rendered).not.toContain("heterochromia");
    expect(rendered).not.toContain("tareme");
    expect(rendered).not.toContain("beauty mark");
  });

  test("portrait retains common upper garments and face accessories", () => {
    const rendered = renderCharacter(
      { framing: "portrait", angle: "eye level", perspective: "straight-on", focus: [] },
      { characters: [{ ...baselineCharacter, attire: "red blazer, gold earrings, black eyepatch, gold brooch" }] }
    );
    expect(rendered).toContain("red blazer");
    expect(rendered).toContain("gold earrings");
    expect(rendered).toContain("black eyepatch");
    expect(rendered).toContain("gold brooch");
  });

  test("explicit adult marker survives face occlusion in an NSFW shot", () => {
    const rendered = renderCharacter(
      { framing: "full body", angle: "eye level", perspective: "from behind", focus: [] },
      { situation: "1girl, nsfw" }
    );
    expect(rendered).toContain("girl, mature female, black hair");
    expect(rendered).not.toContain("blue eyes");
    expect(rendered).not.toContain("tense");
  });

  test("shared color words cannot make cropped attire source-critical", () => {
    const rendered = renderCharacter(
      { framing: "portrait", angle: "eye level", perspective: "straight-on", focus: [] },
      { shotPlan: { primaryAction: "the black-haired girl smiles", secondaryCue: "", staging: "she stands before a black doorway" } }
    );
    expect(rendered).toContain("black hair");
    expect(rendered).not.toContain("black skirt");
  });

  test("source-critical eyes turn a rear camera instead of emitting an incompatible view", () => {
    const rendered = renderCharacter(
      { framing: "upper body", angle: "eye level", perspective: "from behind", focus: [] },
      { shotPlan: { primaryAction: "her blue eyes flash", secondaryCue: "", staging: "the girl fills the frame" } }
    );
    expect(rendered).toContain("upper body, eye level, three-quarter view");
    expect(rendered.match(/blue eyes/g)).toHaveLength(2);
    expect(rendered).toContain("tense");
    expect(rendered).not.toContain("from behind");
  });

  test("body-part focus widens when its projection cannot show the critical action", () => {
    const rendered = renderCharacter(
      { framing: "body-part focus", angle: "eye level", perspective: "from side", focus: [] },
      {
        shotPlan: { primaryAction: "the girl kicks with her brown boot", secondaryCue: "", staging: "the girl fills the frame" },
        characters: [{ ...baselineCharacter, renderScope: "close view of her gloved hand", visibleTags: "black glove, red sleeve" }]
      }
    );
    expect(rendered).toContain("full body, eye level, from side");
    expect(rendered).toContain("brown boots");
    expect(rendered).not.toContain("body-part focus");
  });

  test("global camera repair does not broaden another character's fragment scope", () => {
    const entry = assemblePrompt(
      { environment: { location: "courtyard", timeWeather: "sunny", lightingMood: [], backgroundElements: [] } },
      {
        perspectiveMode: "dynamic",
        situation: "1girl, 1boy",
        camera: { framing: "upper body", angle: "eye level", perspective: "from behind", focus: [] },
        shotPlan: { primaryAction: "the girl's blue eyes flash", secondaryCue: "the boy raises one hand", staging: "the girl stands ahead of the boy" },
        characters: [baselineCharacter, {
          label: "boy",
          age: "mature male",
          appearance: "short red hair, green eyes",
          body: "lean build",
          attire: "blue jacket, black trousers, brown boots",
          expression: "worried",
          renderScope: "close view of his gloved hand",
          visibleTags: "black glove, blue sleeve"
        }],
        sharedComposition: { interaction: [], spatialRelation: "" }
      } as never,
      dynamicConfig,
      1,
      1
    );
    const rendered = renderPrompt(entry.prompt, dynamicConfig.promptSyntax);
    expect(rendered).toContain("upper body, eye level, three-quarter view");
    expect(rendered).toContain("boy, black glove, blue sleeve");
    expect(rendered).not.toContain("short red hair");
    expect(rendered).not.toContain("green eyes");
    expect(rendered).not.toContain("blue jacket");
  });

  test("body-part focus treats natural renderScope prose as a strict fragment", () => {
    const rendered = renderCharacter(
      { framing: "body-part focus", angle: "eye level", perspective: "from side", focus: [] },
      { characters: [{ ...baselineCharacter, renderScope: "close view of her gloved hand", visibleTags: "black glove, red sleeve" }] }
    );
    expect(rendered).toContain("girl, black glove, red sleeve");
    expect(rendered).not.toContain("black hair");
    expect(rendered).not.toContain("blue eyes");
    expect(rendered).not.toContain("black skirt");
    expect(rendered).not.toContain("brown boots");
    expect(rendered).not.toContain("tense");
  });

  test("body-part focus with missing visibleTags fails closed instead of leaking the baseline", () => {
    const rendered = renderCharacter(
      { framing: "body-part focus", angle: "eye level", perspective: "from side", focus: [] },
      { characters: [{ ...baselineCharacter, renderScope: "close crop of her hand", visibleTags: "" }] }
    );
    expect(rendered).toContain("girl");
    expect(rendered).not.toContain("black hair");
    expect(rendered).not.toContain("blue eyes");
    expect(rendered).not.toContain("red jacket");
    expect(rendered).not.toContain("brown boots");
    expect(rendered).not.toContain("tense");
  });

  test("projectDynamicVisibleTags projects the baseline through the framing visibility tiers", () => {
    const character = {
      label: "girl",
      appearance: "long white braid, blue eyes, pale skin",
      body: "tall, curvy",
      attire: "red jacket, black skirt, knee-high brown boots"
    };
    expect(projectDynamicVisibleTags(character, { framing: "portrait", angle: "eye level", perspective: "straight-on", focus: [] }))
      .toBe("long white braid, blue eyes, pale skin, red jacket");
    expect(projectDynamicVisibleTags(character, { framing: "medium shot", angle: "eye level", perspective: "straight-on", focus: [] }))
      .toBe("long white braid, blue eyes, pale skin, curvy, red jacket");
    expect(projectDynamicVisibleTags(character, { framing: "full body", angle: "eye level", perspective: "straight-on", focus: [] }))
      .toBe("long white braid, blue eyes, pale skin, tall, curvy, red jacket, black skirt, knee-high brown boots");
  });

  test("projectDynamicVisibleTags returns empty for fragment framings so nothing leaks out of crop", () => {
    const character = {
      label: "girl",
      appearance: "long white braid, blue eyes",
      body: "tall",
      attire: "red jacket, black skirt"
    };
    expect(projectDynamicVisibleTags(character, { framing: "body-part focus", angle: "eye level", perspective: "from side", focus: [] })).toBe("");
    expect(projectDynamicVisibleTags(character, { framing: "head out of frame", angle: "eye level", perspective: "straight-on", focus: [] })).toBe("");
    expect(projectDynamicVisibleTags(character, { framing: "eyes out of frame", angle: "eye level", perspective: "straight-on", focus: [] })).toBe("");
  });

  test("projectDynamicVisibleTags respects from-behind occlusions and eye hiding", () => {
    const character = {
      label: "girl",
      appearance: "long white braid, blue eyes",
      attire: "red jacket"
    };
    const fromBehind = projectDynamicVisibleTags(
      character,
      { framing: "medium shot", angle: "eye level", perspective: "from behind", focus: [] },
      "upper body visible from behind"
    );
    expect(fromBehind).not.toContain("blue eyes");
    expect(fromBehind).toContain("long white braid");
    expect(fromBehind).toContain("red jacket");
  });

  test("compound footwear remains footwear in cowboy shots", () => {
    const rendered = renderCharacter(
      { framing: "cowboy shot", angle: "eye level", perspective: "straight-on", focus: [] },
      { characters: [{ ...baselineCharacter, attire: "red jacket, black skirt, white thighhighs, knee-high brown boots" }] }
    );
    expect(rendered).toContain("black skirt");
    expect(rendered).toContain("white thighhighs");
    expect(rendered).not.toContain("knee-high brown boots");
  });

  test("portrait keeps shoulders but drops full-figure proportions", () => {
    const rendered = renderCharacter(
      { framing: "portrait", angle: "eye level", perspective: "straight-on", focus: [] },
      { characters: [{ ...baselineCharacter, body: "broad shoulders, tall, curvy" }] }
    );
    expect(rendered).toContain("broad shoulders");
    expect(rendered).not.toContain("tall");
    expect(rendered).not.toContain("curvy");
  });

  test("legacy string cameras receive the same projection", () => {
    const rendered = renderCharacter("portrait, eye level, straight-on");
    expect(rendered).toContain("black hair");
    expect(rendered).toContain("red jacket");
    expect(rendered).not.toContain("black skirt");
    expect(rendered).not.toContain("brown boots");
  });

  test("feet-out and lower-body masks project complementary regions", () => {
    const feetOut = renderCharacter({ framing: "feet out of frame", angle: "eye level", perspective: "straight-on", focus: [] });
    expect(feetOut).toContain("black skirt");
    expect(feetOut).toContain("white thighhighs");
    expect(feetOut).not.toContain("brown boots");

    const lowerBody = renderCharacter({ framing: "lower body", angle: "eye level", perspective: "straight-on", focus: [] });
    expect(lowerBody).toContain("black skirt, white thighhighs, brown boots");
    expect(lowerBody).not.toContain("black hair");
    expect(lowerBody).not.toContain("blue eyes");
    expect(lowerBody).not.toContain("tense");
  });

  test("fragment renderScope still uses the parser projection as authority", () => {
    const entry = assemblePrompt(
      { environment: { location: "courtyard", timeWeather: "sunny", lightingMood: [], backgroundElements: [] } },
      {
        perspectiveMode: "dynamic",
        situation: "1girl",
        camera: { framing: "body-part focus", angle: "eye level", perspective: "from side", focus: [] },
        shotPlan: { primaryAction: "the hand grips a rail", secondaryCue: "", staging: "the hand fills the foreground" },
        characters: [{
          label: "girl",
          age: "mature female",
          appearance: "black hair, blue eyes",
          attire: "navy coat, black leather gloves",
          expression: "furious",
          renderScope: "only the hand detail",
          visibleTags: "black leather glove, navy sleeve",
          composition: { position: "foreground", pose: "arm extended", actions: ["gripping the rail"], gaze: "" }
        }],
        sharedComposition: { interaction: [], spatialRelation: "" }
      } as never,
      dynamicConfig,
      1,
      1
    );
    const rendered = renderPrompt(entry.prompt, dynamicConfig.promptSyntax);
    expect(rendered).toContain("black leather glove, navy sleeve");
    expect(rendered).not.toContain("blue eyes");
    expect(rendered).not.toContain("furious");
  });
});

describe("prompt compatibility and normalization", () => {
  test("retains in-frame legacy identity traits while projecting localized details", () => {
    const config = { ...DEFAULT_CONFIG, perspectiveMode: "dynamic" as const };
    const entry = assemblePrompt({}, {
      paragraph: 1,
      situation: "1girl",
      camera: { framing: "medium shot", angle: "eye level", perspective: "straight-on", focus: [] },
      characters: [{
        name: "Vexa",
        label: "girl",
        identity: "furry, wolf girl, gray fur, white muzzle, wolf ears, fluffy tail",
        appearance: "amber eyes",
        body: "slim",
        attire: "blue jacket",
        composition: { position: "center frame", pose: "standing", actions: [], gaze: "looking at viewer" }
      }]
    }, config, 1, 1);

    const rendered = renderPrompt(entry.prompt, config.promptSyntax);
    expect(rendered).toContain(
      "girl, furry, wolf girl, gray fur, white muzzle, wolf ears, amber eyes, slim, blue jacket"
    );
    expect(rendered).not.toContain("fluffy tail");
  });

  test("normalizes camera-facing subject orientation to viewer-facing composition", () => {
    const payload = normalizeAtomicCompositionTerms({
      scenes: [{
        shots: [{
          paragraph: 1,
          characters: [{
            name: "Nyra Vale",
            composition: {
              position: "reclining on sofa facing camera",
              pose: "legs angled toward camera",
              actions: ["reaching past camera"],
              gaze: "eyes closed in pleasure"
            }
          }]
        }]
      }]
    });
    const composition = payload.scenes?.[0].shots?.[0].characters?.[0].composition;
    expect(composition).toEqual({
      position: "reclining on sofa facing viewer",
      pose: "legs angled toward viewer",
      actions: ["reaching past viewer"],
      gaze: ""
    });
  });

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
    expect(parserInstruction(config)).toContain("Separate phrases with commas, never semicolons");
  });
});

describe("Anima parser contract and visual distinctness", () => {
  test("requests composition and budgeted structured environment without requesting supplement", () => {
    const instruction = parserInstruction(DEFAULT_CONFIG);

    expect(instruction).toContain('"composition": {');
    expect(instruction).toContain('"position": "string"');
    expect(instruction).toContain('"actions": ["string"]');
    expect(instruction).toContain('"sharedComposition": {');
    expect(instruction).toContain("Outside characters[].name, never write a full name or first name in any field");
    expect(instruction).toContain("Never romanticize conflict or replace a distinctive action with a generic pose");
    expect(instruction).toContain("water around boots");
    expect(instruction).toContain('"interaction": ["string"]');
    expect(instruction).toContain('"camera": {');
    expect(instruction).toContain('"environment": {');
    expect(instruction).toContain('"perspectiveMode": "dynamic"');
    expect(instruction).toContain('"shotPlan": {');
    expect(instruction).toContain('"primaryAction": "string"');
    expect(instruction).toContain('"renderScope": "string"');
    expect(instruction).toContain('"visibleTags": "string"');
    expect(instruction).toContain("Choose a camera that contains the facts the image must prove");
    expect(instruction).toContain("A required face or eye must stay visible");
    expect(instruction).toContain("a true fragment must omit every out-of-crop identity trait");
    expect(instruction).toContain("exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements");
    expect(instruction).toContain("Preserve explicit source facts exactly: action owner and target, movement direction, visible emotion, interpersonal tone");
    expect(instruction).toContain("Never put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle");
    expect(instruction).toContain("Individual actions belong in that character's composition.actions");
    expect(instruction).toContain("camera.framing must be empty or exactly one of");
    expect(instruction).toContain("Never swap them: from above and from side are perspectives");
    expect(instruction).toContain("gaze contains direction only");
    expect(instruction).toContain("Give every visible action exactly one owner");
    expect(instruction).toContain("one concise comma-free role-bound subject-verb-object clause");
    expect(instruction).not.toContain("### Static shot direction");
    expect(instruction).not.toContain("### Creative shot direction");
    expect(instruction).toContain("never collapse an object into a string");
    expect(instruction).toContain("Do not infer romance, calm, menace or another emotional tone");
    expect(instruction).toContain("Never copy a later transformation, prop, attire, action or environment backward into an earlier shot");
    expect(instruction).toContain("Prefer the source's exact concrete noun phrase over a generic paraphrase");
    const adaptiveInstruction = parserInstruction({ ...DEFAULT_CONFIG, adaptiveMode: true });
    expect(adaptiveInstruction).toContain("shot.characters contains only people with an actually visible body part");
    expect(adaptiveInstruction).toContain("a faithful identity-safe anchor");
    expect(adaptiveInstruction).toContain("A required visible action chooses Dynamic");
    expect(adaptiveInstruction).toContain("exactly creative, static, or dynamic");
    expect(adaptiveInstruction).not.toContain("### Asset shot direction");
    expect(instruction).toContain("give every visible participant mature female, mature male, aged up");
    expect(instruction).not.toContain("never removes the source character object");
    expect(instruction).not.toContain('"supplement": "string"');
  });

  test("uses Original's Asset instructions word for word only for fixed Asset Mode", () => {
    const assetInstruction = parserInstruction({
      ...DEFAULT_CONFIG,
      adaptiveMode: false,
      perspectiveMode: "asset"
    });

    const originalInstruction = (archivedCard.data.character_book.entries as Array<{ name?: string; content?: string }>)
      .find((entry) => entry.name === "Card.Image.axLLM")?.content || "";
    const exactAssetLines = [
      "One shot per selected paragraph, each containing exactly one visible character.",
      "Always `white background, simple background`. No location, lighting, weather, or prop tags."
    ];
    for (const line of exactAssetLines) {
      expect(originalInstruction).toContain(line);
      expect(assetInstruction).toContain(line);
    }
    expect(assetInstruction).toContain('"perspectiveMode": "asset"');
    expect(assetInstruction).toContain("Character limit: max 1 character object(s) per shot");
    expect(assetInstruction).not.toContain("### Dynamic shot direction");
    expect(assetInstruction).not.toContain("### Static shot direction");
    expect(assetInstruction).not.toContain("### Creative shot direction");
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
    const [differentShotPlan] = normalizeScenePayload({ scenes: [{
      environment,
      shots: [{
        ...shot,
        shotPlan: {
          primaryAction: "left girl pulls right girl upright",
          secondaryCue: "",
          staging: "left girl stands beside right girl"
        }
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
    expect(exactVisualKey(first)).not.toBe(exactVisualKey(differentShotPlan));
    expect(exactVisualKey(first)).not.toBe(exactVisualKey(differentProjection));
  });

  test("silently drops removed legacy cleanup configuration keys", () => {
    const config = normalizeConfig({ danbooruCleanup: true, danbooruEndpoint: "http://legacy.invalid" });

    expect(config).toEqual(DEFAULT_CONFIG);
    expect("danbooruCleanup" in config).toBe(false);
    expect("danbooruEndpoint" in config).toBe(false);
  });
});


describe("Character-field provenance contract", () => {
  test("requires evidence provenance, paired species completeness, and no conventional inventions", () => {
    const instruction = parserInstruction(DEFAULT_CONFIG);
    expect(instruction).toContain('"sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred"');
    expect(instruction).toContain("Set sources.age/appearance/body/attire independently");
    expect(instruction).toContain("Preserve every explicitly paired species feature");
    expect(instruction).toContain("Never invent hair length/style");
    expect(instruction).toContain("Explicit card attire uses attireInferred=false and card_explicit");
  });

  test("retains the same provenance and completeness policy in Fast Mode", () => {
    const instruction = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true });
    expect(instruction).toContain('"sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred"');
    expect(instruction).toContain("Set sources.age/appearance/body/attire independently");
    expect(instruction).toContain("Preserve every explicitly paired species feature");
    expect(instruction).toContain("Only card_explicit and previous_memory");
    expect(instruction).toContain("label is exactly girl, boy, or other");
    expect(instruction).toContain("Leave legacy identity empty");
    expect(instruction).toContain("Never output numeric ages");
  });
});

describe("Cover image parser contract", () => {
  test("gates the whole-message key visual schema and direction behind the toggle", () => {
    const disabled = parserInstruction(DEFAULT_CONFIG);
    const enabled = parserInstruction({ ...DEFAULT_CONFIG, coverImageEnabled: true, minImages: 2, maxImages: 4 });

    expect(disabled).not.toContain('"cover": {');
    expect(disabled).not.toContain("## Cover Image / Key Visual");
    expect(enabled).toContain('"cover": {');
    expect(enabled).toContain("## Cover Image / Key Visual");
    expect(enabled).toContain("overall theme or emotional core");
    expect(enabled).toContain("does not count toward minImages or maxImages");
    expect(enabled).toContain("has no paragraph field");
    expect(enabled).toContain("magazine-cover or album-art photography");
  });

  test("keeps the key visual contract in Fast Mode", () => {
    const instruction = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true, coverImageEnabled: true });
    expect(instruction).toContain('"cover": {');
    expect(instruction).toContain("## Cover Image / Key Visual");
    expect(instruction).toContain("one additional whole-message promotional prompt");
  });
});

describe("Fast Mode parser instruction", () => {
  test("keeps every required heading and schema element in the compact form", () => {
    const instruction = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true });

    expect(instruction).toContain("# Image Tagging System");
    expect(instruction).toContain("## JSON Format");
    expect(instruction).toContain("## Scenes & Shots");
    expect(instruction).toContain("## Terminal Visual State");
    expect(instruction).toContain("## Tag Rules");
    expect(instruction).toContain("## Output Format");
    expect(instruction).toContain("## Character Names");
    expect(instruction).toContain("terminalState");
    expect(instruction).toContain("perspectiveMode");
    expect(instruction).toContain("shotPlan");
    expect(instruction).toContain("## Data Priority");
  });

  test("keeps the configured shot-count requirement and the required schema fields", () => {
    const instruction = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true, minImages: 2, maxImages: 4 });
    expect(instruction).toContain("Generate 2-4 shots total when possible.");
    expect(instruction).toContain("visualChanges");
    expect(instruction).toContain("renderScope");
    expect(instruction).toContain("attireInferred");
  });

  test("keeps Normal within the compact budget while Fast remains smaller", () => {
    const full = parserInstruction(DEFAULT_CONFIG);
    const fast = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true });
    expect(fast.length).toBeLessThan(full.length);
    expect(full.length).toBeLessThan(18_000);
    expect(fast.length).toBeLessThan(14_000);
    expect(fast).toContain('"terminalState"');
  });

  test("gates the supplement guidance on the supplement config in Fast Mode", () => {
    const withSupplement = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true, promptStyle: "default", supplement: true });
    expect(withSupplement).toContain("Natural Language Supplement");
    const withoutSupplement = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true, promptStyle: "default", supplement: false });
    expect(withoutSupplement).toContain("Do not include supplement text.");
  });

  test("keeps the Original Creation Tag rules in Fast Mode when originalReference is enabled", () => {
    const instruction = parserInstruction({
      ...DEFAULT_CONFIG,
      fastMode: true,
      originalReference: true,
      originalCreationName: "Custom Creation"
    });
    expect(instruction).toContain("Original Creation Tag:");
    expect(instruction).toContain("Custom Creation");
    expect(instruction).toContain("no creation tag, no source/work title, and no aliases");
  });

  test("keeps the allowed camera value enums in the Fast Mode instruction", () => {
    const instruction = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true });
    expect(instruction).toContain("body-part focus");
    expect(instruction).toContain("three-quarter view");
    expect(instruction).toContain("shallow depth of field");
    const defaultStyle = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true, promptStyle: "default" });
    expect(defaultStyle).toContain("Framing tags:");
    expect(defaultStyle).toContain("Perspective tags:");
  });

  test("keeps Creative renderScope placement and environment budget rules in Fast Mode", () => {
    const instruction = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true, perspectiveMode: "creative" });
    expect(instruction).toContain("renderScope and visibleTags belong ONLY inside a character object");
    expect(instruction).toContain("do NOT add shot-level renderScope or visibleTags keys");
    expect(instruction).toContain("Populate the complete environment object even when the Creative renderer will omit it");
    expect(instruction).toContain("never leave timeWeather empty");
  });

  test("retains the mode-specific direction contract for Static and Dynamic requirements", () => {
    const staticFast = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true, perspectiveMode: "static" });
    expect(staticFast).toContain("Static shot direction");
    expect(staticFast).toContain("backgroundElements");

    const dynamicFast = parserInstruction({ ...DEFAULT_CONFIG, fastMode: true, perspectiveMode: "dynamic" });
    expect(dynamicFast).toContain("Dynamic shot direction");
    expect(dynamicFast).toContain("shotPlan.primaryAction");
  });
});


describe("canonical compilePrompt boundary", () => {
  const input: IllustrationInput = {
    initialContinuity: {
      characters: [{
        name: "Asha Fen",
        label: "woman",
        age: "adult woman",
        appearance: "dark skin, curly black hair",
        body: "slim",
        attire: "purple travel coat",
        attireInferred: false
      }],
      environment: {
        location: "forest clearing",
        timeWeather: "moonlit twilight",
        lightingMood: ["soft moonlight"],
        backgroundElements: ["ancient trees"]
      },
      place: "beside an ancient oak"
    },
    shots: [{
      paragraph: 1,
      plan: {
        mode: "dynamic",
        primaryAction: "woman raises a crystal seed",
        staging: "woman centered in the clearing"
      },
      camera: { framing: "medium shot", angle: "eye level", perspective: "three-quarter view", focus: [] },
      situation: "1girl, solo, forest",
      characters: [{
        name: "Asha Fen",
        expression: "focused",
        composition: {
          position: "center frame",
          pose: "standing upright",
          actions: ["raising a crystal seed"],
          gaze: "looking at crystal seed"
        },
        renderScope: "upper body visible",
        visibleTags: ["dark skin", "curly black hair", "purple travel coat"]
      }],
      sharedComposition: { interaction: [], spatialRelation: "" },
      negative: ""
    } satisfies PlannedShot]
  };

  test("compiles a resolved shot to the same prompt as the legacy assembler", () => {
    const plan = resolveIllustrationPlan(input);
    const resolved = plan.shots[0];
    const legacy = assemblePrompt(
      {
        place: resolved.place,
        environment: resolved.environment,
        shots: [{
          paragraph: resolved.paragraph,
          perspectiveMode: "dynamic",
          camera: resolved.camera,
          shotPlan: { primaryAction: "woman raises a crystal seed", staging: "woman centered in the clearing" },
          situation: resolved.situation,
          characters: resolved.characters.map((character) => ({
            ...character,
            visibleTags: character.visibleTags.join(", ")
          })),
          sharedComposition: resolved.sharedComposition,
          negative: resolved.negative
        }]
      },
      { paragraph: resolved.paragraph, perspectiveMode: "dynamic", camera: resolved.camera, shotPlan: { primaryAction: "woman raises a crystal seed", staging: "woman centered in the clearing" }, situation: resolved.situation, characters: resolved.characters.map((character) => ({ ...character, visibleTags: character.visibleTags.join(", ") })), sharedComposition: resolved.sharedComposition, negative: resolved.negative },
      { ...DEFAULT_CONFIG, promptStyle: "anima" },
      resolved.paragraph,
      resolved.paragraph
    );

    const compiled = compilePrompt(resolved, { ...DEFAULT_CONFIG, promptStyle: "anima" });
    expect(renderPrompt(compiled.prompt, "nai")).toBe(renderPrompt(legacy.prompt, "nai"));
    expect(compiled.paragraph).toBe(resolved.paragraph);
  });
});
