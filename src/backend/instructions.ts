import type { Config } from "../shared/config.js";

function coverDirectionContract(config: Config): string {
  if (!config.coverImageEnabled) return "";
  return [
    "## Cover Image / Key Visual",
    "cover is required and is one additional whole-message promotional prompt. It does not count toward minImages or maxImages and has no paragraph field because it is placed above the prose rather than beside any paragraph.",
    "Capture the current message's overall theme or emotional core, not a recreation of any specific scene or paragraph. Treat it like bold magazine-cover or album-art photography.",
    "Be daring. Unconventional framing, symbolic juxtaposition, foreground devices, reflections, silhouettes, extreme scale, or other narrative devices are encouraged even when that exact composition would never occur as a Scene.",
    "Keep every depicted identity, appearance trait, object, and thematic motif grounded in the current message or supplied continuity. Cinematic synthesis may rearrange source-supported visual elements, but it must not invent a new event, character identity, outfit, prop, location, or relationship.",
    "Make cover unmistakably distinct from every numbered Scene in composition, camera, focal arrangement, character selection, and environment treatment. Do not copy a Scene and merely change its angle.",
    "Do not add typography, titles, captions, logos, borders, watermarks, or readable text unless the client explicitly requests them.",
    "Use the same visible-only character detail, camera vocabulary, name privacy, negative-tag, and maximum-character rules as Scenes.",
    config.promptStyle === "anima"
      ? "Fill cover with the displayed structured cover fields. Its shotPlan is a concise rendering hierarchy for the promotional composition: primaryAction names the dominant visible relationship, secondaryCue is optional, and staging states the spatial arrangement. Cover has no perspectiveMode, paragraph, environmentChanges, or visualChanges."
      : "Fill cover with the displayed flat cover fields. Use supplement only for concise objective composition details that tags cannot express. Cover has no perspectiveMode, paragraph, or environmentChanges."
  ].join("\n");
}

export type ParserInstructionOptions = {
  hasPreviousVisualState?: boolean;
};

function coverSchema(config: Config): string[] {
  if (!config.coverImageEnabled) return [];
  if (config.promptStyle === "anima") {
    return [
      '  "cover": {',
      '    "environment": {',
      '      "location": "string",',
      '      "timeWeather": "string",',
      '      "lightingMood": ["string"],',
      '      "backgroundElements": ["string"]',
      "    },",
      '    "camera": {',
      '      "framing": "string",',
      '      "angle": "string",',
      '      "perspective": "string",',
      '      "focus": ["string"]',
      "    },",
      '    "shotPlan": {',
      '      "primaryAction": "string",',
      '      "secondaryCue": "string",',
      '      "staging": "string"',
      "    },",
      '    "situation": "string",',
      '    "characters": [',
      "      {",
      '        "name": "string",',
      '        "label": "string",',
      '        "age": "string",',
      '        "identity": "string",',
      '        "appearance": "string",',
      '        "body": "string",',
      '        "attire": "string",',
      '        "attireInferred": false,',
      '        "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
      '        "expression": "string",',
      '        "renderScope": "string",',
      '        "visibleTags": "string",',
      '        "composition": {',
      '          "position": "string",',
      '          "pose": "string",',
      '          "actions": ["string"],',
      '          "gaze": "string"',
      "        }",
      "      }",
      "    ],",
      '    "sharedComposition": {',
      '      "interaction": ["string"],',
      '      "spatialRelation": "string"',
      "    },",
      '    "negative": "string"',
      "  },"
    ];
  }
  return [
    '  "cover": {',
    '    "place": "string",',
    '    "camera": "string",',
    '    "situation": "string",',
    '    "action": "string",',
    '    "characters": [',
    "      {",
    '        "name": "string",',
    '        "label": "string",',
    '        "age": "string",',
    '        "identity": "string",',
    '        "appearance": "string",',
    '        "body": "string",',
    '        "attire": "string",',
    '        "attireInferred": false,',
    '        "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
    '        "expression": "string",',
    '        "renderScope": "string",',
    '        "visibleTags": "string",',
    '        "action": "string"',
    "      }",
    "    ],",
    '    "supplement": "string",',
    '    "negative": "string"',
    "  },"
  ];
}

function parserSchema(config: Config): string[] {
  const structuredAnima = config.promptStyle === "anima";
  const dynamicPossible = config.adaptiveMode || config.perspectiveMode === "dynamic";
  const perspectiveSchemaValue = config.adaptiveMode
    ? "creative | static | dynamic"
    : config.perspectiveMode;
  return structuredAnima ? [
    "{",
    ...coverSchema(config),
    '  "scenes": [',
    "    {",
    '      "environment": {',
    '        "location": "string",',
    '        "timeWeather": "string",',
    '        "lightingMood": ["string"],',
    '        "backgroundElements": ["string"]',
    "      },",
    '      "environmentChanges": ["location | timeWeather | lightingMood | backgroundElements"],',
    '      "shots": [',
    "        {",
    '          "paragraph": 0,',
    `          "perspectiveMode": "${perspectiveSchemaValue}",`,
    '          "camera": {',
    '            "framing": "string",',
    '            "angle": "string",',
    '            "perspective": "string",',
    '            "focus": ["string"]',
    "          },",
    ...(dynamicPossible ? [
      '          "shotPlan": {',
      '            "primaryAction": "string",',
      '            "secondaryCue": "string",',
      '            "staging": "string"',
      "          },"
    ] : []),
    '          "situation": "string",',
    '          "characters": [',
    "            {",
    '              "name": "string",',
    '              "label": "string",',
    '              "age": "string",',
    '              "identity": "string",',
    '              "appearance": "string",',
    '              "body": "string",',
    '              "attire": "string",',
    '              "attireInferred": false,',
    '              "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
    '              "visualChanges": ["age | appearance | body | attire"],',
    '              "expression": "string",',
    '              "renderScope": "string",',
    '              "visibleTags": "string",',
    '              "composition": {',
    '                "position": "string",',
    '                "pose": "string",',
    '                "actions": ["string"],',
    '                "gaze": "string"',
    "              }",
    "            }",
    "          ],",
    '          "sharedComposition": {',
    '            "interaction": ["string"],',
    '            "spatialRelation": "string"',
    "          },",
    '          "negative": "string"',
    "        }",
    "      ]",
    "    }",
    "  ],",
    '  "terminalState": {',
    '    "paragraph": 0,',
    '    "environment": {',
    '      "location": "string",',
    '      "timeWeather": "string",',
    '      "lightingMood": ["string"],',
    '      "backgroundElements": ["string"]',
    "    },",
    '    "environmentChanges": ["location | timeWeather | lightingMood | backgroundElements"],',
    '    "characters": [',
    "      {",
    '        "name": "string",',
    '        "label": "string",',
    '        "age": "string",',
    '        "appearance": "string",',
    '        "body": "string",',
    '        "attire": "string",',
    '        "attireInferred": false,',
    '        "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
    '        "visualChanges": ["age | appearance | body | attire"]',
    "      }",
    "    ]",
    "  }",
    "}"
  ] : [
    "{",
    ...coverSchema(config),
    '  "scenes": [',
    "    {",
    '      "place": "string",',
    '      "environmentChanges": ["place"],',
    '      "shots": [',
    "        {",
    '          "paragraph": 0,',
    `          "perspectiveMode": "${perspectiveSchemaValue}",`,
    '          "camera": "string",',
    '          "situation": "string",',
    '          "action": "string",',
    '          "characters": [',
    "            {",
    '              "name": "string",',
    '              "label": "string",',
    '              "age": "string",',
    '              "identity": "string",',
    '              "appearance": "string",',
    '              "body": "string",',
    '              "attire": "string",',
    '              "attireInferred": false,',
    '              "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
    '              "visualChanges": ["age | appearance | body | attire"],',
    '              "expression": "string",',
    '              "renderScope": "string",',
    '              "visibleTags": "string",',
    '              "action": "string"',
    "            }",
    "          ],",
    '          "supplement": "string",',
    '          "negative": "string"',
    "        }",
    "      ]",
    "    }",
    "  ],",
    '  "terminalState": {',
    '    "paragraph": 0,',
    '    "place": "string",',
    '    "environmentChanges": ["place"],',
    '    "characters": [',
    "      {",
    '        "name": "string",',
    '        "label": "string",',
    '        "age": "string",',
    '        "appearance": "string",',
    '        "body": "string",',
    '        "attire": "string",',
    '        "attireInferred": false,',
    '        "sources": {"age": "card_explicit | previous_memory | narrative_explicit | inferred", "appearance": "card_explicit | previous_memory | narrative_explicit | inferred", "body": "card_explicit | previous_memory | narrative_explicit | inferred", "attire": "card_explicit | previous_memory | narrative_explicit | inferred"},',
    '        "visualChanges": ["age | appearance | body | attire"]',
    "      }",
    "    ]",
    "  }",
    "}"
  ];
}

export function parserInstruction(config: Config, options: ParserInstructionOptions = {}): string {
  return buildCompactParserInstruction(config, options);
}


/**
 * Normal Mode keeps a small quality addendum for difficult ownership,
 * continuity, and identity cases. Structural rules stay in the shared schema
 * and compact core instead of being repeated field by field.
 */
function normalQualityContract(config: Config, hasPreviousVisualState: boolean): string {
  const structuredAnima = config.promptStyle === "anima";
  return [
    "## Normal Mode Quality Contract",
    "Preserve explicit source facts exactly: action owner and target, movement direction, visible emotion, interpersonal tone, colors, materials, counts, partial visibility, and out-of-frame status. Never romanticize conflict or replace a distinctive action with a generic pose.",
    structuredAnima
      ? "Give every visible action exactly one owner. Individual actions belong in that character's composition.actions; shared contact belongs in sharedComposition.interaction; shotPlan may prioritize but not change those facts. Preserve source-critical environmental contact such as water around boots or vines around an arm."
      : "Give every action exactly one owner. Keep individual actions on the character and shared contact at shot level; never duplicate or reassign them.",
    "Keep durable fields separate. appearance contains hair, eyes, skin, species and permanent identifying features; body contains build, proportions and persistent anatomy; attire contains only worn clothing and accessories; expression contains transient facial state. Held weapons, parcels, tools and active props belong in action or composition, not attire.",
    "Species fidelity is literal. Preserve every stated ear, tail, horn, wing, muzzle, fur color or pattern, limb count, digitigrade trait, and human-versus-anthropomorphic distinction. Do not infer companion anatomy: kemonomimi ears and tail do not imply a muzzle or body fur, while an explicitly furry character keeps its stated fur and muzzle.",
    "For visible clothing, preserve each stated layer, color, material and style, including uniforms, corporate clothing and streetwear. Never invent wardrobe from occupation, genre, school, species or setting. If attire is genuinely absent, choose one conservative outfit and mark attireInferred=true with sources.attire=inferred.",
    "A current-source transformation that remains visible after the final paragraph belongs in appearance or body and terminalState, even when magical or described as temporary. Preserve every unchanged baseline field and change only fields explicitly replaced by the source.",
    "Continuity moves forward only. Never copy a later transformation, prop, attire, action or environment backward into an earlier shot. Later unselected paragraphs still update terminalState.",
    "Choose a camera that contains the facts the image must prove. A required face or eye must stay visible; lower-body action or attire needs a sufficiently wide crop; a true fragment must omit every out-of-crop identity trait.",
    "Environment uses source-supported physical details only. Do not infer romance, calm, menace or another emotional tone from lighting or genre.",
    hasPreviousVisualState
      ? "When Previous Visual State exists, unchanged character baseline fields stay empty with no visualChanges marker so deterministic inheritance preserves them; explicit replacements carry the complete new field and its marker."
      : "Without Previous Visual State, repeat complete stable character baselines across shots until the source explicitly changes them."
  ].join("\n");
}

/** Condensed per-mode direction contract shared by Normal and Fast Mode. */
function fastPerspectiveContract(config: Config): string {
  const dynamic = [
    "### Dynamic shot direction",
    "shotPlan is required for Dynamic. shotPlan.primaryAction is one concise comma-free role-bound subject-verb-object clause naming the primary action, its owner (visual role such as left woman), target or object, and movement direction. secondaryCue is empty or one lower-priority visible cue. staging is one comma-free spatial arrangement with no new action.",
    "Every Dynamic character needs renderScope (what the crop actually contains) and visibleTags (only stable appearance, body, and attire traits visible in that crop; no expression, action, camera, environment, names, or subject counts).",
    "composition and sharedComposition retain full factual action ownership; shotPlan only selects what dominates the rendered image.",
    "Choose framing that contains the primary action and every source-critical visible fact; prefer a repeated suitable camera over a novel camera that crops out the action."
  ].join("\n");
  const stat = [
    "### Static shot direction",
    "Fixed to a conventional medium shot at eye level, straight-on, with deep focus. No close-ups, wide shots, body-part crops, POV, high or low angles, dutch angles, motion blur, or action-centric framing.",
    "One Static character sits slightly forward from a readable background; two characters are left and right on the same shallow plane. Pose is one concrete source-supported resting body arrangement, never an abstract phrase such as simple pose. composition.actions is an empty array.",
    "Every Static scene needs a specific physical location and 2-3 concrete backgroundElements.",
    "Leave shotPlan absent."
  ].join("\n");
  const creat = [
    "### Creative shot direction",
    "Isolate one identity-safe visual anchor from the paragraph: object, environment, shadow, silhouette, reflection, foreground layer, aftermath, unusual spatial relationship, or non-identifying body fragment. Never a recognizable face, hairstyle, outfit, or clothing detail.",
    "renderScope and visibleTags belong ONLY inside a character object in shot.characters and never at the shot or scene level. shot.characters contains only people with an actually visible body part inside renderScope; for a zero-character Creative frame use an empty characters array and do NOT add shot-level renderScope or visibleTags keys, because they are not in the schema.",
    "Populate the complete environment object even when the Creative renderer will omit it from the prompt: exactly one location, exactly one time/weather phrase, 1-2 lightingMood snippets, and 1-3 backgroundElements.",
    "Leave shotPlan absent."
  ].join("\n");
  const asset = "### Asset shot direction\nAlways `white background, simple background`. No location, lighting, weather, or prop tags.";
  const fixed = "perspectiveMode, renderScope, visibleTags, and shotPlan are shot-only rendering decisions; they never alter complete appearance, body, attire, or environment continuity.";
  if (!config.adaptiveMode) {
    const contract = config.perspectiveMode === "creative"
      ? creat
      : config.perspectiveMode === "static"
        ? stat
        : config.perspectiveMode === "asset"
          ? asset
          : dynamic;
    return ["### Perspective mode - fixed", `Set perspectiveMode to exactly ${config.perspectiveMode} for every shot.`, contract, fixed].join("\n");
  }
  return [
    "### Perspective mode - Adaptive router",
    "Choose perspectiveMode independently for every shot: exactly creative, static, or dynamic. Do not choose Creative for every shot in a multi-shot batch.",
    "Use Creative only for a faithful identity-safe anchor; use Static for a stable readable scene; use Dynamic for visible action or movement. A required visible action chooses Dynamic; an identity-safe no-character anchor may choose Creative; otherwise choose Static.",
    creat,
    stat,
    dynamic,
    fixed
  ].join("\n");
}

/**
 * Compact single-pass parser instruction shared by Normal and Fast Mode.
 * Normal Mode adds only the difficult quality rules that cannot be enforced
 * deterministically after parsing.
 */
function buildCompactParserInstruction(config: Config, options: ParserInstructionOptions = {}): string {
  const fixedAsset = !config.adaptiveMode && config.perspectiveMode === "asset";
  const maxCharacters = fixedAsset ? 1 : config.maxCharacters;
  const structuredAnima = config.promptStyle === "anima";
  const hasPreviousVisualState = config.previousVisualStateEnabled && options.hasPreviousVisualState === true;
  const fixedStatic = !config.adaptiveMode && config.perspectiveMode === "static";
  const staticBackgroundPossible = fixedStatic || config.adaptiveMode;
  const shotInstruction = [
    fixedAsset
      ? "One shot per selected paragraph, each containing exactly one visible character."
      : `Generate ${config.minImages}-${config.maxImages} shots total when possible.`,
    "Choose the most visually consequential changes, actions, interactions, or emotional beats across the entire current source; do not favor earlier paragraphs merely because they appear first.",
    fixedAsset
      ? "Every shot must reference a different selected source paragraph. Never return two shots for the same paragraph."
      : fixedStatic
      ? "Keep the visual-novel framing fixed across Static shots. Distinguish additional shots through source-supported changes in primary character, expression, simple pose, or background instead of dramatic cinematography."
      : "Each additional shot must differ from the other shots in at least two of these dimensions: (1) perspective or framing, (2) focal subject or visible action, and (3) composition, depth, or foreground occlusion.",
    fixedAsset
      ? "Do not invent narrative events or add a second visible character."
      : "If the source contains too few distinct visual paragraphs, return fewer shots. Do not repeat a paragraph or invent narrative events.",
    fixedAsset ? "" : "Every shot must reference a different source paragraph. Never return two shots for the same paragraph. Order shots by their visual importance, not paragraph number.",
    structuredAnima
      ? "Preserve the source's explicit action, direction of movement, visible emotional state, and interpersonal tone. Never replace irritation, fear, conflict, or urgency with romance, serenity, or another inferred mood."
      : ""
  ].join("\n");
  const schema = parserSchema(config);
  return [
    "# Image Tagging System",
    "Tag the current message's paragraphs as Danbooru-style English image prompts. Output a single JSON object.",
    "## JSON Format",
    schema.join("\n"),
    structuredAnima
      ? "- negative is optional. All other displayed fields and nested objects are required except shotPlan, which is required only for Dynamic and must be absent for Static or Creative. Use empty strings or arrays inside required objects when a field does not apply; never collapse an object into a string."
      : "- negative is optional. All other fields are required, though values may be empty strings when a field does not apply.",
    "- These are the ONLY allowed fields. Adding any unlisted field is a schema violation.",
    coverDirectionContract(config),
    "## Scenes & Shots",
    "Scene = shots sharing one physical location.",
    "- Same location means same scene, multiple shots.",
    structuredAnima ? "- Location change means a new scene with its own environment." : "- Location change means a new scene with its own place.",
    "- Shot = one distinct visual moment: interaction, emotion, significant action, or clear framing change. Prefer closer framing over wide shots. Shots are independent, so repeat tags if the scene has not changed.",
    shotInstruction,
    "- When Non-authoritative Shot-Router Notes are present, create scenes and shots only for the selected [P#] references in those notes.",
    "- Paragraph references are 1-based. Copy the exact visible number after P; never convert to zero-based indices, renumber the source, or use paragraph 0. Never invent paragraph numbers outside the visible range.",
    "- Tag ONLY the current message. Recent context is for continuity only.",
    "## Terminal Visual State",
    "terminalState is required, is never rendered, and never changes camera, composition, perspective, shot selection, or prompt content.",
    "Set terminalState.paragraph to the final original numbered paragraph, even when that paragraph is not selected for illustration.",
    structuredAnima
      ? "Read every original paragraph in order and record the physical environment and stable baselines (label, age, appearance, body, attire, sources) of characters still present after the final paragraph. Use only environment, environmentChanges, and the listed stable character fields; never include action, expression, pose, camera, shotPlan, renderScope, visibleTags, or supplement."
      : "Read every original paragraph in order and record the final place and stable baselines of characters still present after the final paragraph. Use only place, environmentChanges, and the listed stable character fields; never include action, expression, pose, camera, renderScope, visibleTags, or supplement.",
    "Apply explicit location, attire, appearance, and body changes from unselected paragraphs to terminalState. Do not let an earlier illustrated paragraph overwrite a later narrative change.",
    "## Tag Rules",
    "Use common, objective, visualizable Danbooru-style English tags. Never fabricate tag vocabulary; use simpler well-known equivalents if unsure. Never output placeholder tags or phrases such as unknown, unspecified, not specified, unmentioned, undetermined, default clothing, or unspecified time; leave genuinely nonvisual fields empty instead.",
    structuredAnima
      ? "Tag fields are comma-separated tags. Atomic composition and sharedComposition values are concise comma-free natural-language phrases. Environment arrays contain one comma-free visual snippet per item."
      : "All fields are comma-separated tags except supplement, which is a short objective visual sentence.",
    "Character names are private memory keys. Outside characters[].name, never write a full name or first name in any field, including situation, renderScope, visibleTags, composition, sharedComposition, camera, environment, place, supplement, or negative. Use visual descriptors such as left woman, right man, foreground character, or background character.",
    `Character limit: max ${maxCharacters} character object(s) per shot. Do not add another character object beyond this limit; refer to an additional anonymous out-of-frame person only through visible composition when the source requires it.`,
    hasPreviousVisualState
      ? "Previous Visual State is injected after parsing. For an unchanged returning character, leave age, appearance, body, and attire empty and leave visualChanges empty; the backend restores the exact stored baseline before rendering and persistence. For a new character, or when no matching previous character exists, output the complete baseline. For an explicit current-source change or a final user instruction that adds or replaces durable character tags, list that field in visualChanges and output its complete new value."
      : "Repeat stable appearance, body, and attire tags for returning characters across all shots unless the current message clearly changes their present visual state.",
    "Set sources.age/appearance/body/attire independently to card_explicit, previous_memory, narrative_explicit, or inferred. Card facts must be directly stated in {{char}} Info; scene facts must be directly stated in [P#]; role-, genre-, species-, school-, or setting-based completion is inferred.",
    "Preserve every explicitly paired species feature (for example ears and tail) with stated color/count/type, but never infer an unstated companion feature.",
    "Never invent hair length/style, eye modifiers, clothing color/items, jewelry, pupil shape, or anatomy from conventions. Explicit card attire uses attireInferred=false and card_explicit; chosen clothing uses attireInferred=true and inferred.",
    "Only card_explicit and previous_memory fields may enter durable character memory. narrative_explicit fields remain in rolling Previous Visual State when visualChanges marks them, but never rewrite the canonical character-card baseline.",
    "Core fields: situation uses only source-supported visible count tags such as 1girl, 1boy, other, solo, or group and must match the complete visible people. label is exactly girl, boy, or other. Leave legacy identity empty; put durable species and recognition traits in appearance or body.",
    "age is a nonnumeric visual category. Usually leave it empty for late teens through early thirties. When explicit sexual content identifies participants as adults, give every visible participant mature female, mature male, aged up, or another clearly adult nonnumeric category in every shot of that sequence. Never output numeric ages.",
    "Continuity does not require repeating camera angle, framing, composition, depth, or occlusion. Vary those deliberately between shots while preserving narrative facts.",
    "Before returning the batch, compare Dynamic cameras as a soft camera ledger. When two equally suitable cameras would contain their focal actions, prefer different framing + angle + perspective tuples. Never choose a worse, more extreme, or action-cropping camera merely to create variety.",
    config.fastMode ? "" : normalQualityContract(config, hasPreviousVisualState),
    fastPerspectiveContract(config),
    structuredAnima
      ? "### Camera values"
      : "",
    structuredAnima
      ? "- camera.framing must be empty or exactly one of: portrait, close-up, medium close-up, upper body, medium shot, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, body-part focus. camera.angle must be empty or exactly one of: eye level, low angle, high angle, dutch angle. camera.perspective must be empty or exactly one of: straight-on, from above, from behind, from below, from side, sideways, three-quarter view, pov. Never swap them: from above and from side are perspectives; high angle and low angle are angles. camera.focus may contain at most two of: shallow depth of field, deep focus, background blur, foreground blur, motion blur, fisheye, wide-angle lens, telephoto lens. Do not add any other camera keys or values."
      : "- Framing tags: portrait, upper body, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, close-up, body-part focus. Perspective tags: from above, from behind, from below, from side, high up, sideways, straight-on, upside-down, pov.",
    structuredAnima
      ? "### Atomic Natural Composition"
      : config.supplement
      ? "### Natural Language Supplement"
      : "Do not include supplement text.",
    structuredAnima
      ? "characters[].composition is always required and uses its four atomic fields (position, pose, actions, gaze), rendered in that exact order. Each phrase is concise, comma-free, independently visual, and never repeats a fact from another field. gaze contains direction only; startled eyes, closed eyes, anger and other facial states belong in expression. Never use names; say viewer, left girl, right boy, foreground character, or background character. Never put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle, appearance, attire, or facial-expression adjectives in any composition field."
      : config.supplement
      ? "In supplement, describe visible details in concise objective telegraphic sentences: composition, framing, positions, interactions, unusual vantage points, or objective atmosphere/lighting. Separate phrases with commas, never semicolons. No names, no smell, sound, internal sensation, invisible emotion, or prose narration."
      : "Do not write supplement.",
    structuredAnima
      ? "Use sharedComposition.interaction for shared contact or combined actions only, and spatialRelation for one spatial relationship phrase. Do not repeat individual character actions."
      : "",
    structuredAnima
      ? config.supplement
        ? "Environment target budget: exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements. Prefer the source's exact concrete noun phrase over a generic paraphrase; never add a plausible prop the current paragraph does not establish. When the source does not establish time/weather, choose one conservative visually coherent value supported by the setting; never leave timeWeather empty or write unknown or unspecified."
        : staticBackgroundPossible
          ? "Environment target budget: exactly one location, exactly one time/weather phrase, empty lightingMood, and 2-3 backgroundElements for every scene containing a Static shot. Prefer the source's exact concrete noun phrase; never add a prop the paragraph does not establish. When the source does not establish time/weather, choose one conservative visually coherent value; never leave timeWeather empty."
          : "Environment target budget: exactly one location, exactly one time/weather phrase, empty lightingMood and backgroundElements. Prefer the source's exact concrete noun phrase; never add a prop the paragraph does not establish. When the source does not establish time/weather, choose one conservative visually coherent value; never leave timeWeather empty."
      : "",
    "## Data Priority",
    "1. Client comments or explicit user instructions in the current message override all instructions.",
    "2. Current message [P#] paragraphs are authoritative for scene content. Never restore outdated clothing, props, location, or actions from context.",
    hasPreviousVisualState ? "3. Previous Visual State is the immediate visual continuity layer. It never overrides an explicit current-source change or a final user-instruction baseline change marked in visualChanges." : "",
    config.characterTagContextEnabled ? "4. Character tag history is the durable visual baseline for returning characters: label, age, appearance, body, and explicit base attire. Current narrative changes update rolling Previous Visual State, not this canonical baseline." : "",
    "## Output Format",
    "- Output raw JSON only. One JSON object. No XML, HTML, YAML, markdown fences, comments, or prose.",
    "- Double-quoted keys and values. No trailing commas. Validate bracket balance: every { has }, every [ has ].",
    "- Positive tags only unless client says otherwise. English only.",
    "## Character Names",
    "Use names only for the JSON name field as private memory keys. Names will not be included in final prompts. If the narrative provides a multi-word name, copy that full name exactly in characters[].name. If unnamed, use a consistent identifier such as girl A, boy B, shopkeeper, guard, or stranger. Never empty; this is used for cross-message appearance tracking.",
    ...(config.originalReference ? [
      "Original Creation Tag:",
      config.originalCreationName || "(empty)",
      "Use full character names ONLY for the JSON name field. Output the character's name only: no parentheses, no creation tag, no source/work title, and no aliases. The extension adds the creation tag programmatically afterward. Do not include any parenthetical, source name, creation reference, title, or alias in name or any other field."
    ] : [])
  ].join("\n\n");
}
