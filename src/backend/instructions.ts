import type { Config } from "../shared/config.js";

function dynamicDirectionContract(): string {
  return [
    "### Dynamic shot direction",
    "Dynamic is a source-literal action illustration. Choose the one visible action or interaction that best represents the paragraph; do not try to give every simultaneous fact equal rendering priority.",
    "shotPlan is required for Dynamic. shotPlan.primaryAction is one concise role-bound subject-verb-object clause containing the primary action, its owner and target or object, and any explicit movement direction. Use visual roles such as left woman or right man, never names.",
    "shotPlan.secondaryCue is empty or one lower-priority visible cue such as a gaze direction, approaching hazard, environmental contact, or consequential reaction. It must not introduce a second competing relational action.",
    "shotPlan.staging is one concise spatial arrangement that makes the primary action readable. It contains no new action, camera, clothing, expression, or lighting information.",
    "Every shotPlan string is one atomic phrase with no comma, semicolon, or terminal punctuation. Combine closely related words inside one clause instead of listing clauses.",
    "shotPlan is a rendering projection of facts still owned by composition and sharedComposition. It may restate the selected facts for priority, but it never changes them and is never persisted as memory.",
    "Every Dynamic character must have a non-empty renderScope even for an ordinary full-body or upper-body view. renderScope describes what the chosen framing actually contains. Never leave it empty because the character is fully visible.",
    "For ordinary portrait through full-body Dynamic framing, the structured Anima renderer projects the complete baseline through visibility tiers: portrait and close-up keep head, face, neck, shoulders, and upper garments visible at the shoulders; medium close-up adds torso; upper-body and medium framings add arms and hands; cowboy shot adds hips and upper legs; full body and wide shot keep everything including footwear. visibleTags must still list the traits actually visible so framing can be audited, but for ordinary framings the renderer's tier projection is authoritative — never pad visibleTags with out-of-crop traits. For body-part focus, head-out-of-frame, eyes-out-of-frame, or another true fragment, visibleTags is the complete rendered identity projection and must omit every trait outside the crop.",
    "Per-character composition remains required after shot planning. Preserve position, body arrangement, gaze, and any secondary action not already represented by shotPlan. Do not duplicate the primary action merely to add emphasis.",
    "Choose framing that contains every source-critical visible fact. The renderer never injects a trait that is incompatible with the selected crop or viewing direction and may deterministically turn or widen an incompatible camera as a safety fallback. Use cowboy shot or full body when lower-body movement, a transformed limb, or specifically required lower attire must be verified; turn or widen the camera when a required face, eye, or body region would otherwise be hidden.",
    "Choose framing for the action and source-critical facts alone. Portrait or close-up is acceptable for face-and-shoulder beats, and decorative out-of-crop attire must remain omitted rather than forcing a wider camera.",
    "Camera direction must be compatible with the facts the image must prove. If an explicit facial expression, gaze, eye trait, or eye transformation is important, keep the face readable and do not use from behind. Do not combine a required face-visible fact with a camera that hides it.",
    "Preserve source-critical modifiers in the projection, especially material, color, partial visibility, and out-of-frame status. A partial bronze mechanical hand must not become a generic mechanical hand or a complete character.",
    "Choose a camera that clearly contains the primary action. Prefer a repeated suitable camera over a novel camera that crops out or obscures the action. Camera variety is secondary to action readability."
  ].join("\n");
}

function staticDirectionContract(): string {
  return [
    "### Static shot direction",
    "Static uses a visual-novel composition: a clearly readable scene background with one primary character slightly forward on a shallow foreground plane. Include additional characters only when the source cannot be represented faithfully without them; keep them on the same shallow plane.",
    "Static is fixed to a conventional medium shot at eye level, straight-on, with deep focus so the background remains readable. Do not use close-ups, wide shots, body-part crops, POV, high or low angles, dutch angles, dramatic lenses, motion blur, foreground occlusion, or action-centric framing.",
    "For one Static character, use slightly forward from the background as the position. For two characters, place one on the left and one on the right, both slightly forward on the same shallow plane; never give both an ambiguous identical position. Use a concrete source-supported resting body arrangement as the pose, an empty actions array, and a source-supported gaze or an empty gaze.",
    "A Static pose must state the visible body arrangement directly, such as standing upright with arms relaxed at sides or seated upright with hands resting in lap. Never write abstract meta-phrases such as simple pose, stable pose, holding a pose, or posing. Do not depict a mid-action pose.",
    "Every Static scene must provide a specific physical location and 2-3 concrete backgroundElements so the setting is visibly readable.",
    "Leave shotPlan absent. Static framing and pose constraints override requests for cinematography variation."
  ].join("\n");
}

function creativeDirectionContract(): string {
  return [
    "### Creative shot direction",
    "Creative isolates a meaningful identity-safe visual anchor from the paragraph instead of showing the complete scene. Use a source-supported object, environment, shadow, unreadable silhouette, foreground layer, aftermath, unusual spatial relationship, or non-identifying body fragment.",
    "Creative must not focus on a recognizable face, facial feature, hair, hairstyle, outfit, or clothing detail.",
    "Creative must remain concrete and source-supported. renderScope states exactly what is in frame. visibleTags describes only the identity-safe anchor and contains no character-memory traits.",
    "shot.characters contains only people with an actually visible body part inside renderScope. If the selected Creative frame contains no person or body fragment, use an empty characters array; keep fully off-frame recurring people only in terminalState and never add placeholder out-of-frame shot characters.",
    "For a zero-character Creative frame, do not invent shot-level renderScope or visibleTags keys because they are not in the schema. The external binding supplies those render details after parsing; output only the normal declared shot fields with characters as an empty array.",
    "A supplied Creative candidate is binding. Copy its render scope faithfully, use its camera intent, and do not broaden it back into a recognizable character or the complete paragraph action.",
    "Leave shotPlan absent. Creative uses renderScope and the supplied concept as its rendering projection."
  ].join("\n");
}

function assetDirectionContract(): string {
  return [
    "### Asset shot direction",
    "Always `white background, simple background`. No location, lighting, weather, or prop tags."
  ].join("\n");
}

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

function perspectiveContract(config: Config): string {
  if (!config.adaptiveMode) {
    const contract = config.perspectiveMode === "creative"
      ? creativeDirectionContract()
      : config.perspectiveMode === "static"
        ? staticDirectionContract()
        : config.perspectiveMode === "asset"
          ? assetDirectionContract()
          : dynamicDirectionContract();
    return [
      "### Perspective mode - fixed",
      `Set perspectiveMode to exactly ${config.perspectiveMode} for every shot.`,
      contract,
      "perspectiveMode, renderScope, visibleTags, and shotPlan are shot-only rendering decisions. They never alter or replace complete appearance, body, attire, or environment continuity."
    ].join("\n");
  }
  return [
    "### Perspective mode - Adaptive router",
    "Choose perspectiveMode independently for every shot before filling any other shot field. It must be exactly creative, static, or dynamic.",
    "For batches with two or more shots, do not choose Creative for every shot. Include at least one Static or Dynamic shot, and choose each mode from the paragraph rather than from the availability of an optional concept.",
    "Use Creative only for a faithful identity-safe object, environment, shadow, unreadable silhouette, reflection, foreground layer, aftermath, unusual spatial relationship, or non-identifying fragment. If no such anchor exists, choose Static or Dynamic.",
    "Use Static for a stable readable visual-novel scene with a conventional medium shot, simple resting pose, and readable background.",
    "Use Dynamic for visible action, movement, interaction, urgency, or a cinematic change.",
    "Apply this precedence from source facts: a required visible action or movement chooses Dynamic; a no-character aftermath or identity-safe anchor may choose Creative; an otherwise stable character-and-background beat chooses Static. Do not use camera drama alone to turn a stable beat into Dynamic, and do not use Creative when it would omit the paragraph's only required visible action.",
    creativeDirectionContract(),
    staticDirectionContract(),
    dynamicDirectionContract(),
    "perspectiveMode, renderScope, visibleTags, and shotPlan are shot-only rendering decisions. They never alter or replace complete appearance, body, attire, or environment continuity."
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
    '        "visualChanges": ["age | appearance | body | attire"]',
    "      }",
    "    ]",
    "  }",
    "}"
  ];
}

export function parserInstruction(config: Config, options: ParserInstructionOptions = {}): string {
  if (config.fastMode) return parserInstructionFast(config, options);

  const fixedAsset = !config.adaptiveMode && config.perspectiveMode === "asset";
  const maxCharacters = fixedAsset ? 1 : config.maxCharacters;
  const structuredAnima = config.promptStyle === "anima";
  const hasPreviousVisualState = config.previousVisualStateEnabled && options.hasPreviousVisualState === true;
  const fixedStatic = !config.adaptiveMode && config.perspectiveMode === "static";
  const dynamicPossible = config.adaptiveMode || config.perspectiveMode === "dynamic";
  const creativePossible = config.adaptiveMode || config.perspectiveMode === "creative";
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
      : fixedStatic
      ? "If the source contains too few distinct stable paragraphs, return fewer shots. Do not repeat a paragraph, invent narrative events, or switch to action-centric framing."
      : "If the source contains too few distinct visual paragraphs, return fewer shots. Do not repeat a paragraph or invent narrative events.",
    fixedAsset ? "" : "Every shot must reference a different source paragraph. Never return two shots for the same paragraph. Order shots by their visual importance, not paragraph number.",
    structuredAnima
      ? "Preserve the source's explicit action, direction of movement, visible emotional state, and interpersonal tone. Never replace irritation, fear, conflict, or urgency with romance, serenity, or another inferred mood."
      : ""
  ].join("\n");
  const perspectiveInstruction = perspectiveContract(config);
  const source = config.originalReference
    ? [
      "Original Creation Tag:",
      config.originalCreationName || "(empty)",
      "Use full character names ONLY for the JSON name field.",
      "Output the character's name only: no parentheses, no creation tag, no source/work title, and no aliases.",
      "The extension adds the creation tag programmatically afterward.",
      "Do not include any parenthetical, source name, creation reference, title, or alias in name or any other field."
    ].join("\n")
    : "Use names only for the JSON name field as private memory keys. Names will not be included in final prompts. If not given, make a concise stable identifier that fits the description.";
  const schema = parserSchema(config);
  const naturalDetail = structuredAnima
    ? [
      "### Atomic Natural Composition",
      "characters[].composition is always required and must use its four atomic fields. The renderer joins them once in this exact order: position, pose, actions, gaze.",
      ...(creativePossible ? [
        "For Creative, still populate composition for structured memory and validation, but renderScope is authoritative and replaces composition in the rendered prompt when present.",
        "Creative never turns its object, environment, shadow, reflection, silhouette, or fragment anchor into a character. Include a named source character in shot.characters only when some part of that person is actually visible inside renderScope; keep fully off-frame recurring people in terminalState only.",
        "When a person or body fragment is visible, renderScope and visibleTags belong only inside that source character object. Never move them to the shot or scene, and never use the Creative anchor as characters[].name. For a zero-character external concept, characters remains empty and the external binding supplies scope and cues.",
        "Creative does not exempt scene continuity fields. Populate the complete environment object within its normal location, timeWeather, lightingMood, and backgroundElements budgets even when the Creative renderer will omit that environment from the current prompt."
      ] : []),
      ...(dynamicPossible ? [
        "For Dynamic, composition and sharedComposition retain complete factual action ownership while shotPlan selects only the primary action, optional secondary cue, and staging that should dominate the rendered image.",
        "For Dynamic, renderScope describes the actual crop and visibleTags contains only stable appearance, body, and attire traits visible within that crop. Do not put expression, pose, action, camera, environment, names, or subject-count tags in visibleTags."
      ] : []),
      "composition.position is one concise spatial phrase describing where the character is in frame.",
      "composition.pose is one concise comma-free phrase describing the character's static body pose. Fold compatible posture words together, such as leaning-forward running stance, instead of writing two comma-separated pose clauses.",
      "composition.actions contains 0-3 concise phrases covering every visible action and movement direction exactly once. Use present visual phrasing such as mid-turn toward the viewer, not mixed completed and ongoing tenses.",
      "When the source states a direction such as left, right, upward, downward, forward, backward, toward, or away, keep that direction in the same composition.actions phrase. Never reduce running left to running or climbing upward to climbing.",
      "Preserve each distinctive visible action verb and its visible object or trigger in composition.actions. Never replace ducking away from falling glass with only crouching plus moving right, pulling a wrist with only running, or pushing a jammed door with only leaning forward.",
      "Preserve source-described environmental contact or encroachment that changes the visible beat, such as rising water around boots, smoke surrounding a face, or vines wrapping an arm. Put the environmental material in an appropriate environment snippet and keep its contact with the character explicit; do not reduce it to generic weather or omit it after preserving the character action.",
      "composition.gaze is one concise gaze-direction phrase, or empty when no gaze is visible. Closed eyes and emotional eye states belong only in expression; when eyes are closed, leave gaze empty.",
      "Each atomic phrase must be independently visual, comma-free, free of semicolons and terminal punctuation, and must not repeat a fact from another composition field.",
      "Do not put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle, appearance, attire, or facial-expression adjectives in any composition field.",
      config.supplement
        ? "Use sharedComposition.interaction for shared contact or combined actions only, and spatialRelation for one spatial relationship phrase. Do not repeat individual character actions."
        : "Use sharedComposition.interaction only for source-required shared contact or combined actions, and leave spatialRelation empty. The renderer keeps interaction as a compact action fallback while omitting shared prose.",
      "Do not use any character or persona names in composition fields, including the name of an out-of-frame POV character. Say viewer, left girl, right boy, foreground character, or background character. Use viewer rather than camera for subject orientation.",
      "Use concise objective visual phrases, not narration, invisible emotion, smell, sound, or internal sensation.",
      ...(fixedAsset
        ? [
          "Always `white background, simple background`. No location, lighting, weather, or prop tags.",
          "Put that exact value in environment.location. Leave timeWeather, lightingMood, and backgroundElements empty."
        ]
        : [
          "Environment target budget: exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements.",
          "Each environment snippet must be concise and contain no comma, semicolon, or terminal punctuation.",
          "Prefer the source's exact concrete noun phrase over a generic paraphrase: keep arrow-slit windows rather than windows, wet leaf rather than foliage, glass conservatory panes rather than walls, and tied used condom rather than object. Never add a plausible prop that the current paragraph does not establish.",
          hasPreviousVisualState
            ? "When the current source does not establish a new environment detail and Previous Visual State supplies it, copy that environment field exactly. If neither current source nor previous state establishes time/weather, choose one conservative visually coherent value supported by the setting; never write unknown or unspecified time."
            : "When the current source does not establish time/weather, choose one conservative visually coherent value supported by the setting; never write unknown or unspecified time.",
          config.supplement
            ? "Populate lightingMood and backgroundElements within the target budget."
            : staticBackgroundPossible
              ? "Leave lightingMood empty. Populate 2-3 backgroundElements for every scene containing a Static shot, and leave backgroundElements empty for scenes without a Static shot. Still populate location and timeWeather."
              : "Leave lightingMood and backgroundElements empty. Still populate location and timeWeather."
        ])
    ].join("\n")
    : config.supplement
      ? [
        "### Natural Language Supplement",
        "In supplement, describe the image in natural language for visible details that tags cannot express well, such as detailed composition, framing, character positions, interactions, unusual vantage points, or objective atmosphere/lighting.",
        "Use concise, minimal, telegraphic sentences. Be objective, not subjective interpretation.",
        "Separate supplement phrases with commas, never semicolons. Do not end supplement with sentence punctuation.",
        "Unusual framing and vantage points are welcome, such as viewed through an object, reflected in a mirror, or partially obscured by foreground elements.",
        "When describing multiple people, do not use names. Identify people by visual position such as left girl, right boy, foreground character, or background character.",
        "Do not use supplement for smell, sound, internal sensations, invisible emotions, or prose narration."
      ].join("\n")
      : "Do not include supplement text.";
  return [
    "# Image Tagging System",
    "Tag the current message's paragraphs as Danbooru-style English image prompts. Output a single JSON object.",
    "## JSON Format",
    schema.join("\n"),
    structuredAnima
      ? `- negative is optional. All other displayed fields and nested objects are required except shotPlan, which is required only for Dynamic and must be absent for Static or Creative. Use empty strings or arrays inside required objects when a field does not apply; never collapse an object into a string.`
      : "- negative is optional. All other fields are required, though values may be empty strings when a field does not apply.",
    "- These are the ONLY allowed fields. Adding any unlisted field is a schema violation.",
    coverDirectionContract(config),
    "## Scenes & Shots",
    "Scene = shots sharing one physical location.",
    "- Same location means same scene, multiple shots.",
    structuredAnima ? "- Location change means a new scene with its own environment." : "- Location change means a new scene with its own place.",
    "- When Non-authoritative Shot-Router Notes are present, create scenes and shots only for the selected [P#] references in those notes. Read every original numbered paragraph for continuity, but never turn an unselected paragraph into an illustration shot.",
    fixedAsset
      ? "Shot = one selected paragraph containing exactly one visible character. Shots are independent, so repeat tags if the scene has not changed."
      : fixedStatic
      ? "Shot = one distinct stable visual-novel moment: a readable background plus a foreground character, simple pose, and visible expression. Shots are independent, so repeat tags if the scene has not changed."
      : "Shot = one distinct visual moment: interaction, emotion, significant action, or clear framing change. Prefer closer framing over wide shots. Shots are independent, so repeat tags if the scene has not changed.",
    shotInstruction,
    "Paragraph mapping: current message uses [P#] numbering.",
    "- Paragraph references are 1-based. Copy the exact visible number after P; never convert to zero-based indices, renumber the source, or use paragraph 0.",
    "- Each shot's paragraph must reference an existing [P#].",
    "- Never invent paragraph numbers outside the visible range.",
    "- Tag ONLY the current message. Recent context is for continuity only.",
    "## Terminal Visual State",
    "terminalState is required, is never rendered, and never changes camera, composition, perspective, shot selection, or prompt content.",
    "Set terminalState.paragraph to the final original numbered paragraph, even when that paragraph is not selected for illustration.",
    structuredAnima
      ? "Read every original paragraph in order and record the physical environment and stable baselines of characters still present after the final paragraph. Use only environment, environmentChanges, and the listed stable character fields; never include action, expression, pose, camera, shotPlan, renderScope, visibleTags, or supplement."
      : "Read every original paragraph in order and record the final place and stable baselines of characters still present after the final paragraph. Use only place, environmentChanges, and the listed stable character fields; never include action, expression, pose, camera, renderScope, visibleTags, or supplement.",
    "Apply explicit location, attire, appearance, and body changes from unselected paragraphs to terminalState. Do not let an earlier illustrated paragraph overwrite a later narrative change.",
    "For unchanged returning baseline fields, follow the same Previous Visual State and visualChanges rules used by shot characters.",
    "## Tag Rules",
    "Use common, objective, visualizable Danbooru-style English tags. Never fabricate tag vocabulary; use simpler well-known equivalents if unsure. Conservative scene inference is allowed only where this contract explicitly permits it. Do not use metaphors for tags.",
    "Never output placeholder tags or phrases such as unknown, unspecified, not specified, unmentioned, undetermined, default clothing, or unspecified time. Leave genuinely nonvisual fields empty instead.",
    structuredAnima
      ? "Tag fields are comma-separated tags. Atomic composition and sharedComposition values are concise comma-free natural-language phrases. Environment arrays contain one comma-free visual snippet per item."
      : "All fields are comma-separated tags except supplement, which is a short objective visual sentence.",
    "Character names are private memory keys. Outside characters[].name, never write a full name or first name in any field, including situation, renderScope, visibleTags, composition, sharedComposition, camera, environment, place, supplement, or negative. Use visual descriptors such as left woman, right man, foreground character, or background character.",
    `Character limit: max ${maxCharacters} character object(s) per shot. Do not add another character object beyond this limit; refer to an additional anonymous out-of-frame person only through visible composition when the source requires it. Every character object resolves to the complete known baseline in appearance, body, and attire regardless of crop. renderScope and visibleTags are the separate shot-only rendering projection.`,
    hasPreviousVisualState
      ? "Previous Visual State is injected after parsing. For an unchanged returning character, leave age, appearance, body, and attire empty and leave visualChanges empty; the backend restores the exact stored baseline before rendering and persistence. For a new character, or when no matching previous character exists, output the complete baseline. For an explicit current-source change or a final user instruction that adds or replaces durable character tags, list that field in visualChanges and output its complete new value."
      : "Repeat stable appearance, body, and attire tags for returning characters. Shots are independent, so repeated baseline tags are expected.",
    "Continuity does not require repeating camera angle, framing, composition, depth, or occlusion. Vary those deliberately between shots while preserving narrative facts.",
    "Before returning the batch, compare Dynamic cameras as a soft camera ledger. When two equally suitable cameras would contain their focal actions, prefer different framing + angle + perspective tuples. Never choose a worse, more extreme, or action-cropping camera merely to create variety. Preserve a repeated camera when it is the clearest source-faithful choice or the source establishes continuous camera or POV.",
    perspectiveInstruction,
    structuredAnima
      ? "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields include expression, composition, renderScope, visibleTags, shotPlan, camera, situation, sharedComposition, environment, and negative."
      : "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields are expression, action, camera, situation, place, supplement, and negative.",
    "## Field Reference",
    "### visual continuity change markers",
    hasPreviousVisualState
      ? "When Previous Visual State exists, characters[].visualChanges must list only age, appearance, body, or attire fields explicitly changed by the current numbered source or by a final user instruction that requests durable character tags. An empty list means the backend injects those prior fields exactly; leave their raw values empty instead of paraphrasing or re-emitting them. Do not mark a field changed merely because you rephrased its tags."
      : "characters[].visualChanges may be empty when no prior visual state is supplied.",
    structuredAnima
      ? hasPreviousVisualState
        ? "environmentChanges must list only location, timeWeather, lightingMood, or backgroundElements explicitly changed by the current numbered source. Before copying anything, compare the current numbered source against Previous Visual State. Spatial transition language such as now inside, enters, exits, outside, later in, or moves to explicitly changes location; output the new location and backgroundElements and list both change markers. An empty list means copy prior values only when the current source truly leaves them unchanged."
        : "environmentChanges lists only location, timeWeather, lightingMood, or backgroundElements explicitly changed by the current numbered source."
      : hasPreviousVisualState
        ? "environmentChanges contains place only when the current numbered source explicitly changes the setting. Otherwise leave it empty and copy the prior place exactly."
        : "environmentChanges contains place only when the current numbered source explicitly changes the setting.",
    structuredAnima ? "### environment - scene-level" : "### place - scene-level",
    fixedAsset
      ? "Always `white background, simple background`. No location, lighting, weather, or prop tags."
      : structuredAnima
      ? "environment.location is one physical location phrase; timeWeather is one time/weather phrase; lightingMood targets 1-2 snippets; backgroundElements targets 1-3 prominent visual props or setting details. Static scenes require a specific physical location and 2-3 backgroundElements."
      : "Start with interior or exterior when location is known, then add location, mood, lighting, time, weather, and prominent props. Prominent props should be color + object. Define once per scene; all shots in the scene share identical place.",
    structuredAnima
      ? "Do not include character names, actions, expressions, clothing, body traits, or camera framing in environment. Use only source-supported visual atmosphere; never infer romance, calm, menace, or another emotional tone from lighting alone."
      : "Do not include character names, actions, expressions, clothing, body traits, or camera framing in place.",
    structuredAnima
      ? "Retain source-critical environment modifiers exactly enough to preserve identity and scale, such as partial bronze mechanical hand rather than mechanical hand."
      : "",
    "### camera - shot-level",
    structuredAnima
      ? "camera.framing must be empty or exactly one of: portrait, close-up, medium close-up, upper body, medium shot, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, body-part focus."
      : "Framing tags: portrait, upper body, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, close-up, body-part focus.",
    structuredAnima
      ? "camera.angle must be empty or exactly one of: eye level, low angle, high angle, dutch angle."
      : "Perspective tags: from above, from behind, from below, from side, high up, sideways, straight-on, upside-down, pov.",
    structuredAnima ? "camera.perspective must be empty or exactly one of: straight-on, from above, from behind, from below, from side, sideways, three-quarter view, pov." : "",
    structuredAnima ? "Never swap camera.angle and camera.perspective: three-quarter view belongs only in perspective, while eye level, low angle, high angle, and dutch angle belong only in angle." : "",
    structuredAnima ? "camera.focus may contain at most two values chosen only from: shallow depth of field, deep focus, background blur, foreground blur, motion blur, fisheye, wide-angle lens, telephoto lens." : "",
    structuredAnima
      ? "Do not add any other camera keys or camera values. Lighting, streetlamps, atmosphere, actions, expressions, appearance, clothing, subject counts, and place never belong in camera."
      : "Use camera only for perspective and framing. Do not include actions, expressions, appearance, clothing, subject counts, or place.",
    structuredAnima ? "Choose framing that can visibly contain the complete focal action unless Creative deliberately isolates a smaller visual anchor." : "",
    "### situation - shot-level",
    "Strictly use character count/composition tags such as 1girl, 2girls, 1boy, 1girl, 1boy, other, solo, group, and nsfw only when explicitly visual.",
    "The total number of people should match the visible characters being described/tagged.",
    dynamicPossible ? "For a Dynamic shot with exactly one complete visible character, include solo alongside the one-character count tag. Partial hands, arms, silhouettes, or off-frame POV owners do not increase the complete-character count." : "",
    "Do not include names, numeric ages, appearance, attire, expression, action, camera, or place.",
    "### label",
    "Use girl, boy, or other regardless of age. For out-of-frame partial characters, use label plus out of frame and visible part, such as boy, out of frame, hand.",
    "### name - required",
    "Character name from the narrative. If unnamed, use a consistent identifier such as girl A, boy B, shopkeeper, guard, or stranger. Never empty; this is used for cross-message appearance tracking.",
    "When the narrative provides a multi-word name, copy that full name exactly in characters[].name. Never shorten it to a first name, surname, nickname, or partial name.",
    structuredAnima
      ? "Do not put character names in label, age, appearance, body, attire, expression, action, composition, situation, camera, place, environment, sharedComposition, supplement, or negative."
      : "Do not put character names in label, age, appearance, body, attire, expression, action, situation, camera, place, supplement, or negative.",
    "### age",
    "Visual age category only: child, aged down, mature male, mature female, aged up, or old. Based on appearance only.",
    "If characters appear late teens to early thirties, leave age blank.",
    "Exception: when the current source explicitly identifies every participant in sexual content as an adult, never leave age blank. Use mature female, mature male, aged up, or another clearly adult nonnumeric visual category for each visible participant.",
    "That adult marker exception applies to every shot in an adult sexual sequence, including quiet setup shots before the explicit action. Repeat a clearly adult nonnumeric age category for each visible participant in every such shot.",
    "Never output numeric ages such as 18, 21, or 25.",
    "### identity",
    "Legacy compatibility field. Leave identity empty in new output.",
    "Put every durable recognition trait in appearance or body instead, including species/race, furry traits, fur color or pattern, muzzle, animal ears, horns, wings, tails, notable scars or tattoos, and permanent non-clothing accessories.",
    "Do not include names, attire, expression, pose, action, camera, place, or supplement in identity.",
    "### appearance",
    "Identity traits: hair, eyes, skin, species/race, and distinguishing features.",
    "Hair: length, color, style. Always include when known.",
    "Eyes: color, shape, and visual modifiers such as heterochromia, tareme, tsurime, jitome, empty eyes, or dashed eyes. Always include when known.",
    "Skin: color and visible texture, such as dark skin, tan, red skin, metal skin, see-through body, or patchwork skin.",
    "Other: freckles, facial hair, scars, tattoos with location, symbol in eye, elf, demon, furry, androgynous, and other persistent identity traits.",
    "A current-source transformation that remains visibly present after the final paragraph belongs in the complete appearance or body baseline and terminalState even when described as magical or temporary. Do not leave wings, changed eyes, horns, tails, or transformed limbs only in composition, visibleTags, or shotPlan.",
    structuredAnima
      ? "Do not include names, attire, expression, pose, action, camera, place, supplement, blush, flushed cheeks, tears, sweat, or any other transient state in appearance."
      : "Do not include names, attire, expression, pose, action, camera, place, or supplement in appearance.",
    "### body",
    "Physique, height, body shape, build, and persistent body traits. Exclude normal/default traits.",
    "Examples: muscular, toned, skinny, plump, fat, curvy, petite, shortstack, pear-shaped figure, giant, tall, short, flat chest, small breasts, medium breasts, large breasts, broad shoulders, wide hips, thick thighs.",
    hasPreviousVisualState
      ? "appearance + body + attire form the rolling character baseline. The backend restores unchanged stored fields exactly when visualChanges is empty. Camera framing affects only visibleTags and never changes the stored baseline."
      : "appearance + body + attire form the rolling character baseline. Copy the SAME tags for the same character across all shots unless the current message clearly changes their present visual state. Camera framing never justifies omitting known baseline traits.",
    "Do not include clothing, expression, action, camera, place, or supplement in body.",
    "### attire",
    "All visible clothing and accessories, or visible lack of clothing, with color, material, and style for each.",
    "Disassemble uniforms into individual items. Always include color details using color names. Do not use vague color traits like colorful or gradient unless the text clearly describes them.",
    "Examples: white loose button-up shirt, black silk dress, side slit, sleeveless, long sleeves, oversized, gray tight jeans, pleated mini skirt, white ankle socks, bare feet, red baseball cap, small blue gem necklace, open shirt, torn clothes, unzipped, midriff.",
    "Use no shirt, no pants, bare feet, or similar absence tags when visually relevant.",
    "If a visible character has no established attire in the current source, previous visual state, or durable baseline, choose one conservative visually coherent outfit supported by their role and setting. Set attireInferred to true. Copy attireInferred from previous visual state when retaining that inferred outfit; otherwise set it to false.",
    "Inferred attire is scene continuity only and must not become durable character memory.",
    "Do not include body traits, expressions, actions, camera, place, or names in attire.",
    "### expression",
    "Visible facial emotions and facial/eye states only: annoyed, angry, embarrassed, blush, grin, smile, crying, empty eyes, closed eyes.",
    structuredAnima ? "Prefer the current source's explicit visible emotion over inferred genre mood. Convert irritation or anger into concrete visible tags such as annoyed, angry, furrowed brows, glaring, clenched teeth, or open mouth when supported." : "",
    "Do not include posture, gaze direction, clothing, body, action, camera, place, or names in expression.",
    structuredAnima ? "### Atomic action ownership" : "### action",
    structuredAnima
      ? "Do not output legacy shot.action or characters[].action fields. Put each individual action only in that character's composition.actions. Put shared contact or combined action only in sharedComposition.interaction."
      : "Use shot.action for global or relationship action that applies to the whole shot, such as two characters holding hands or one character guiding another.",
    structuredAnima
      ? "A fact must have exactly one owner. Never repeat an individual action in sharedComposition and never repeat shared contact in a character's composition."
      : "Use characters[].action for a single character's posture, gaze, pose, interactions, and visible actions. Use multiple tags if needed.",
    "Posture examples: standing, sitting on chair, on back, kneeling, spread legs, all fours, squatting, on stomach, on side.",
    "Gaze examples: looking at viewer, looking away, looking at another.",
    "Interaction examples: arm hug, leaning, heads together, carrying, piggyback, holding hands.",
    structuredAnima
      ? "Do not duplicate camera, environment, situation counts, appearance, body, attire, or expression in composition actions."
      : "Do not duplicate camera, place, situation counts, appearance, body, attire, or expression. Do not put the same action in multiple fields.",
    "### negative - optional",
    "Only if the client explicitly specifies negative prompt tags. Never infer negative tags.",
    naturalDetail,
    "## Repetition is Consistency",
    hasPreviousVisualState
      ? "- Keep persistent facts represented in every resolved shot. Raw unchanged character baseline fields may remain empty only because Previous Visual State is injected deterministically before rendering; environment fields remain explicit."
      : "- If a detail appears in one shot and persists, tag it in all subsequent shots.",
    "- If an action or attire is still in motion or still present, repeat it in later shots.",
    "- Continuity moves forward only. Never copy a later paragraph's transformation, prop, attire, action, or environment detail backward into an earlier shot.",
    "- Preserve a continuous pov only when the narrative establishes an ongoing viewpoint. Otherwise choose the strongest perspective for each visual beat.",
    hasPreviousVisualState
      ? "- visualChanges must be empty for unchanged baseline fields and name only explicit current-source changes or final user-instruction baseline changes; deterministic inheritance preserves exact identity."
      : "- appearance + body + attire must be identical for the same character across all shots unless the current message explicitly changes their present visual state.",
    "## Data Priority",
    "1. Client comments or explicit user instructions in the current message override all instructions.",
    structuredAnima
      ? "2. Current message [P#] paragraphs are authoritative for scene content, action, visible emotion, interpersonal tone, and movement direction. Never soften, romanticize, or replace those facts with an inferred atmosphere. Never restore outdated clothing, props, location, or actions from context."
      : "2. Current message [P#] paragraphs are authoritative for scene content. Never restore outdated clothing, props, location, or actions from context.",
    hasPreviousVisualState ? "3. Previous Visual State is the immediate visual continuity layer. Leave unchanged raw character baseline values empty so the backend injects them exactly, and copy unchanged environment values explicitly; it never overrides an explicit current-source change or a final user-instruction baseline change marked in visualChanges." : "",
    config.characterTagContextEnabled ? `${hasPreviousVisualState ? "4" : "3"}. Character tag history is the durable visual baseline for returning characters: label, age, appearance, body, and explicit base attire.` : "",
    config.characterTagContextEnabled ? "Use previous character tags as a baseline for returning characters, including base attire. Preserve specific baseline tags when not contradicted, such as short cut, white pupils, small breasts, black high school uniform, red sailor ribbon, black skirt, and white pantyhose." : "",
    config.characterTagContextEnabled ? "The current message is authoritative for the character's present visual state. It can update the baseline when it clearly changes clothing, lack of clothing, appearance, or body traits." : "",
    "## Weights",
    "Weights such as {tag}, [tag], N::tag::, and (tag:N) control emphasis. Never add, remove, or modify client-specified weights. Copy them exactly when they are present in the source text.",
    "## Output Format",
    "- Output raw JSON only.",
    "- One JSON object. No XML, HTML, YAML, markdown fences, comments, or prose.",
    "- Double-quoted keys and values. No trailing commas.",
    "- Validate bracket balance: every { has }, every [ has ].",
    "- Positive tags only unless client says otherwise.",
    "- English only.",
    "## Character Names",
    source
  ].join("\n\n");
}


/** Condensed per-mode direction contract used only by the Fast Mode instruction. */
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
 * Compact single-pass parser instruction for Fast Mode. Produces the exact
 * same ParsedPayload schema (shared via parserSchema) with the same required
 * headings, but drops the long field-reference prose, examples, weighting
 * guidance, and repeated explanations of the full instruction.
 */
export function parserInstructionFast(config: Config, options: ParserInstructionOptions = {}): string {
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
      ? "Read every original paragraph in order and record the physical environment and stable baselines (label, age, appearance, body, attire) of characters still present after the final paragraph. Use only environment, environmentChanges, and the listed stable character fields; never include action, expression, pose, camera, shotPlan, renderScope, visibleTags, or supplement."
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
    "Continuity does not require repeating camera angle, framing, composition, depth, or occlusion. Vary those deliberately between shots while preserving narrative facts.",
    "Before returning the batch, compare Dynamic cameras as a soft camera ledger. When two equally suitable cameras would contain their focal actions, prefer different framing + angle + perspective tuples. Never choose a worse, more extreme, or action-cropping camera merely to create variety.",
    fastPerspectiveContract(config),
    structuredAnima
      ? "### Camera values"
      : "",
    structuredAnima
      ? "- camera.framing must be empty or exactly one of: portrait, close-up, medium close-up, upper body, medium shot, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, body-part focus. camera.angle must be empty or exactly one of: eye level, low angle, high angle, dutch angle. camera.perspective must be empty or exactly one of: straight-on, from above, from behind, from below, from side, sideways, three-quarter view, pov. camera.focus may contain at most two of: shallow depth of field, deep focus, background blur, foreground blur, motion blur, fisheye, wide-angle lens, telephoto lens. Do not add any other camera keys or values."
      : "- Framing tags: portrait, upper body, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, close-up, body-part focus. Perspective tags: from above, from behind, from below, from side, high up, sideways, straight-on, upside-down, pov.",
    structuredAnima
      ? "### Atomic Natural Composition"
      : config.supplement
      ? "### Natural Language Supplement"
      : "Do not include supplement text.",
    structuredAnima
      ? "characters[].composition is always required and uses its four atomic fields (position, pose, actions, gaze), rendered in that exact order. Each phrase is concise, comma-free, independently visual, and never repeats a fact from another field. Never use names; say viewer, left girl, right boy, foreground character, or background character. Never put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle, appearance, attire, or facial-expression adjectives in any composition field."
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
    config.characterTagContextEnabled ? "4. Character tag history is the durable visual baseline for returning characters: label, age, appearance, body, and explicit base attire. The current message can update the baseline when it clearly changes clothing, lack of clothing, appearance, or body traits." : "",
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
