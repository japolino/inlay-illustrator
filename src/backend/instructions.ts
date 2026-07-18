import type { Config } from "../shared/config.js";

export function parserInstruction(config: Config): string {
  const maxCharacters = config.maxCharacters;
  const structuredAnima = config.promptStyle === "anima";
  const fixedStatic = !config.adaptiveMode && config.perspectiveMode === "static";
  const staticBackgroundPossible = fixedStatic || config.adaptiveMode;
  const shotInstruction = [
    `Generate ${config.minImages}-${config.maxImages} shots total when possible.`,
    "Choose the most visually consequential changes, actions, interactions, or emotional beats across the entire current source; do not favor earlier paragraphs merely because they appear first.",
    fixedStatic
      ? "Keep the visual-novel framing fixed across Static shots. Distinguish additional shots through source-supported changes in primary character, expression, simple pose, or background instead of dramatic cinematography."
      : "Each additional shot must differ from the other shots in at least two of these dimensions: (1) perspective or framing, (2) focal subject or visible action, and (3) composition, depth, or foreground occlusion.",
    fixedStatic
      ? "If the source contains too few distinct stable paragraphs, return fewer shots. Do not repeat a paragraph, invent narrative events, or switch to action-centric framing."
      : "If the source contains too few distinct visual paragraphs, return fewer shots. Do not repeat a paragraph or invent narrative events.",
    "Every shot must reference a different source paragraph. Never return two shots for the same paragraph. Order shots by their visual importance, not paragraph number.",
    structuredAnima
      ? "Preserve the source's explicit action, direction of movement, visible emotional state, and interpersonal tone. Never replace irritation, fear, conflict, or urgency with romance, serenity, or another inferred mood."
      : ""
  ].join("\n");
  const perspectiveInstruction = [
    "### Perspective mode - required per shot",
    config.adaptiveMode
      ? "Choose perspectiveMode independently for every shot before filling any other shot field. It must be exactly creative, static, or dynamic."
      : `Set perspectiveMode to exactly ${config.perspectiveMode} for every shot.`,
    config.adaptiveMode
      ? "For batches with two or more shots, do not choose Creative for every shot. Include at least one Static or Dynamic shot, and choose each mode from the paragraph rather than from the availability of an optional concept."
      : "",
    "Creative isolates a meaningful identity-safe visual anchor from the paragraph instead of showing the complete scene. Use a source-supported object, environment, shadow, unreadable silhouette, foreground layer, aftermath, unusual spatial relationship, or non-identifying body fragment.",
    "Creative must not focus on a recognizable face, facial feature, hair, hairstyle, outfit, or clothing detail. If the paragraph has no faithful identity-safe anchor, use Static or Dynamic in Adaptive mode.",
    "Creative must remain concrete and source-supported. Use renderScope to state what is actually in frame. visibleTags must describe only the identity-safe anchor and must not contain character-memory traits.",
    "After Creative is chosen, its supplied Creative candidate is binding. Copy its render scope faithfully, use its camera intent, and do not broaden it back into a recognizable character or the complete paragraph action.",
    "Dynamic follows the current scene's visible action, movement, interaction, and strongest cinematic viewpoint.",
    "Static uses a visual-novel composition: a clearly readable scene background with one primary character slightly forward on a shallow foreground plane. Include additional characters only when the source cannot be represented faithfully without them; keep them on the same shallow plane.",
    "Static is fixed to a conventional medium shot at eye level, straight-on, with deep focus so the background remains readable. Do not use close-ups, wide shots, body-part crops, POV, high or low angles, dutch angles, dramatic lenses, motion blur, foreground occlusion, or action-centric framing.",
    "For Static character composition, use slightly forward from the background as the position, a concrete source-supported resting body arrangement as the pose, an empty actions array, and a source-supported gaze or an empty gaze.",
    "A Static pose must state the visible body arrangement directly, such as standing upright with arms relaxed at sides or seated upright with hands resting in lap. Never write abstract meta-phrases such as simple pose, stable pose, holding a pose, or posing. Do not depict a mid-action pose.",
    "Every scene containing a Static shot must provide a specific physical location and 2-3 concrete backgroundElements so the setting is visibly readable; generic labels such as indoor or outdoor are not sufficient locations.",
    "These Static framing and pose constraints override any batch-wide request for cinematography variation whenever perspectiveMode is static.",
    "perspectiveMode, renderScope, and visibleTags are shot-only rendering decisions. They never alter or replace the complete appearance, body, and attire memory fields."
  ].join("\n");
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
  const schema = structuredAnima ? [
    "{",
    '  "scenes": [',
    "    {",
    '      "environment": {',
    '        "location": "string",',
    '        "timeWeather": "string",',
    '        "lightingMood": ["string"],',
    '        "backgroundElements": ["string"]',
    "      },",
    '      "shots": [',
    "        {",
    '          "paragraph": 0,',
    '          "perspectiveMode": "creative | static | dynamic",',
    '          "camera": {',
    '            "framing": "string",',
    '            "angle": "string",',
    '            "perspective": "string",',
    '            "focus": ["string"]',
    "          },",
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
    "  ]",
    "}"
  ] : [
    "{",
    '  "scenes": [',
    "    {",
    '      "place": "string",',
    '      "shots": [',
    "        {",
    '          "paragraph": 0,',
    '          "perspectiveMode": "creative | static | dynamic",',
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
    "  ]",
    "}"
  ];
  const naturalDetail = structuredAnima
    ? [
      "### Atomic Natural Composition",
      "characters[].composition is always required and must use its four atomic fields. The renderer joins them once in this exact order: position, pose, actions, gaze.",
      "For Creative, still populate composition for structured memory and validation, but renderScope is authoritative and replaces composition in the rendered prompt when present.",
      "composition.position is one concise spatial phrase describing where the character is in frame.",
      "composition.pose is one concise phrase describing the character's static body pose.",
      "composition.actions contains 0-3 concise phrases covering every visible action and movement direction exactly once. Use present visual phrasing such as mid-turn toward the viewer, not mixed completed and ongoing tenses.",
      "composition.gaze is one concise gaze-direction phrase, or empty when no gaze is visible.",
      "Each atomic phrase must be independently visual, comma-free, free of semicolons and terminal punctuation, and must not repeat a fact from another composition field.",
      "Do not put lighting, atmosphere, background, depth of field, lens effects, framing, camera angle, appearance, attire, or facial-expression adjectives in any composition field.",
      config.supplement
        ? "Use sharedComposition.interaction for shared contact or combined actions only, and spatialRelation for one spatial relationship phrase. Do not repeat individual character actions."
        : "Use sharedComposition.interaction only for source-required shared contact or combined actions, and leave spatialRelation empty. The renderer keeps interaction as a compact action fallback while omitting shared prose.",
      "Do not use any character or persona names in composition fields, including the name of an out-of-frame POV character. Say viewer, camera, left girl, right boy, foreground character, or background character.",
      "Use concise objective visual phrases, not narration, invisible emotion, smell, sound, or internal sensation.",
      "Environment target budget: exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements.",
      "Each environment snippet must be concise and contain no comma, semicolon, or terminal punctuation.",
      config.supplement
        ? "Populate lightingMood and backgroundElements within the target budget."
        : staticBackgroundPossible
          ? "Leave lightingMood empty. Populate 2-3 backgroundElements for every scene containing a Static shot, and leave backgroundElements empty for scenes without a Static shot. Still populate location and timeWeather."
          : "Leave lightingMood and backgroundElements empty. Still populate location and timeWeather."
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
      ? "- negative is optional. All other fields and nested objects are required. Use empty strings or arrays inside the required objects when a field does not apply; never collapse an object into a string."
      : "- negative is optional. All other fields are required, though values may be empty strings when a field does not apply.",
    "- These are the ONLY allowed fields. Adding any unlisted field is a schema violation.",
    "## Scenes & Shots",
    "Scene = shots sharing one physical location.",
    "- Same location means same scene, multiple shots.",
    structuredAnima ? "- Location change means a new scene with its own environment." : "- Location change means a new scene with its own place.",
    fixedStatic
      ? "Shot = one distinct stable visual-novel moment: a readable background plus a foreground character, simple pose, and visible expression. Shots are independent, so repeat tags if the scene has not changed."
      : "Shot = one distinct visual moment: interaction, emotion, significant action, or clear framing change. Prefer closer framing over wide shots. Shots are independent, so repeat tags if the scene has not changed.",
    shotInstruction,
    "Paragraph mapping: current message uses [P#] numbering.",
    "- Each shot's paragraph must reference an existing [P#].",
    "- Never invent paragraph numbers outside the visible range.",
    "- Tag ONLY the current message. Recent context is for continuity only.",
    "## Tag Rules",
    "Use common, objective, visualizable Danbooru-style English tags. Do not invent tags; use simpler well-known equivalents if unsure. Do not use metaphors for tags.",
    structuredAnima
      ? "Tag fields are comma-separated tags. Atomic composition and sharedComposition values are concise comma-free natural-language phrases. Environment arrays contain one comma-free visual snippet per item."
      : "All fields are comma-separated tags except supplement, which is a short objective visual sentence.",
    `Character limit: max ${maxCharacters} character object(s) per shot. Do not add another character object beyond this limit; refer to an additional anonymous out-of-frame person only through visible composition when the source requires it. For every character object, keep the complete known baseline in appearance, body, and attire even when Creative shows only a partial crop. visibleTags is the separate visible-only rendering projection.`,
    "Repeat tags if the situation or scene has not changed. Shots are independent, so repeated tags across shots are expected for stable appearance, attire, location, and persistent actions.",
    "Continuity does not require repeating camera angle, framing, composition, depth, or occlusion. Vary those deliberately between shots while preserving narrative facts.",
    "Before returning the batch, compare all Dynamic camera objects as a camera ledger. Do not repeat the same framing + angle + perspective tuple across Dynamic shots unless the current numbered source explicitly establishes a continuous camera or POV. Sharing one camera value is allowed, and sharing angle + perspective is allowed when framing genuinely differs.",
    perspectiveInstruction,
    structuredAnima
      ? "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields include expression, composition, camera, situation, sharedComposition, environment, and negative."
      : "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields are expression, action, camera, situation, place, supplement, and negative.",
    "## Field Reference",
    structuredAnima ? "### environment - scene-level" : "### place - scene-level",
    structuredAnima
      ? "environment.location is one physical location phrase; timeWeather is one time/weather phrase; lightingMood targets 1-2 snippets; backgroundElements targets 1-3 prominent visual props or setting details. Static scenes require a specific physical location and 2-3 backgroundElements."
      : "Start with interior or exterior when location is known, then add location, mood, lighting, time, weather, and prominent props. Prominent props should be color + object. Define once per scene; all shots in the scene share identical place.",
    structuredAnima
      ? "Do not include character names, actions, expressions, clothing, body traits, or camera framing in environment. Use only source-supported visual atmosphere; never infer romance, calm, menace, or another emotional tone from lighting alone."
      : "Do not include character names, actions, expressions, clothing, body traits, or camera framing in place.",
    "### camera - shot-level",
    structuredAnima
      ? "camera.framing must be empty or exactly one of: portrait, close-up, medium close-up, upper body, medium shot, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, body-part focus."
      : "Framing tags: portrait, upper body, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, close-up, body-part focus.",
    structuredAnima
      ? "camera.angle must be empty or exactly one of: eye level, low angle, high angle, dutch angle."
      : "Perspective tags: from above, from behind, from below, from side, high up, sideways, straight-on, upside-down, pov.",
    structuredAnima ? "camera.perspective must be empty or exactly one of: straight-on, from above, from behind, from below, from side, sideways, three-quarter view, pov." : "",
    structuredAnima ? "camera.focus may contain at most two values chosen only from: shallow depth of field, deep focus, background blur, foreground blur, motion blur, fisheye, wide-angle lens, telephoto lens." : "",
    structuredAnima
      ? "Do not add any other camera keys or camera values. Lighting, streetlamps, atmosphere, actions, expressions, appearance, clothing, subject counts, and place never belong in camera."
      : "Use camera only for perspective and framing. Do not include actions, expressions, appearance, clothing, subject counts, or place.",
    structuredAnima ? "Choose framing that can visibly contain the complete focal action unless Creative deliberately isolates a smaller visual anchor." : "",
    "### situation - shot-level",
    "Strictly use character count/composition tags such as 1girl, 2girls, 1boy, 1girl, 1boy, other, solo, group, and nsfw only when explicitly visual.",
    "The total number of people should match the visible characters being described/tagged.",
    "Do not include names, numeric ages, appearance, attire, expression, action, camera, or place.",
    "### label",
    "Use girl, boy, or other regardless of age. For out-of-frame partial characters, use label plus out of frame and visible part, such as boy, out of frame, hand.",
    "### name - required",
    "Character name from the narrative. If unnamed, use a consistent identifier such as girl A, boy B, shopkeeper, guard, or stranger. Never empty; this is used for cross-message appearance tracking.",
    structuredAnima
      ? "Do not put character names in label, age, appearance, body, attire, expression, action, composition, situation, camera, place, environment, sharedComposition, supplement, or negative."
      : "Do not put character names in label, age, appearance, body, attire, expression, action, situation, camera, place, supplement, or negative.",
    "### age",
    "Visual age category only: child, aged down, mature male, mature female, aged up, or old. Based on appearance only.",
    "If characters appear late teens to early thirties, leave age blank.",
    "Never output numeric ages such as 18, 21, or 25.",
    "### identity",
    "Legacy/private recognition tags that are not part of the rolling baseline memory. Leave empty unless a non-clothing trait does not fit appearance or body.",
    "Use identity only for durable traits that help recognize the character across chats: species/race, notable scars or tattoos, distinctive non-clothing accessories only if permanent, or named archetype traits when visually stable.",
    "Do not include names, attire, expression, pose, action, camera, place, or supplement in identity.",
    "### appearance",
    "Identity traits: hair, eyes, skin, species/race, and distinguishing features.",
    "Hair: length, color, style. Always include when known.",
    "Eyes: color, shape, and visual modifiers such as heterochromia, tareme, tsurime, jitome, empty eyes, or dashed eyes. Always include when known.",
    "Skin: color and visible texture, such as dark skin, tan, red skin, metal skin, see-through body, or patchwork skin.",
    "Other: freckles, facial hair, scars, tattoos with location, symbol in eye, elf, demon, furry, androgynous, and other persistent identity traits.",
    structuredAnima
      ? "Do not include names, attire, expression, pose, action, camera, place, supplement, blush, flushed cheeks, tears, sweat, or any other transient state in appearance."
      : "Do not include names, attire, expression, pose, action, camera, place, or supplement in appearance.",
    "### body",
    "Physique, height, body shape, build, and persistent body traits. Exclude normal/default traits.",
    "Examples: muscular, toned, skinny, plump, fat, curvy, petite, shortstack, pear-shaped figure, giant, tall, short, flat chest, small breasts, medium breasts, large breasts, broad shoulders, wide hips, thick thighs.",
    "appearance + body + attire form the rolling character baseline. Copy the SAME tags for the same character across all shots unless the current message clearly changes their present visual state. Camera framing never justifies omitting known baseline traits.",
    "Do not include clothing, expression, action, camera, place, or supplement in body.",
    "### attire",
    "All visible clothing and accessories, or visible lack of clothing, with color, material, and style for each.",
    "Disassemble uniforms into individual items. Always include color details using color names. Do not use vague color traits like colorful or gradient unless the text clearly describes them.",
    "Examples: white loose button-up shirt, black silk dress, side slit, sleeveless, long sleeves, oversized, gray tight jeans, pleated mini skirt, white ankle socks, bare feet, red baseball cap, small blue gem necklace, open shirt, torn clothes, unzipped, midriff.",
    "Use no shirt, no pants, bare feet, or similar absence tags when visually relevant.",
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
    "- If a detail appears in one shot and persists, tag it in all subsequent shots.",
    "- If an action or attire is still in motion or still present, repeat it in later shots.",
    "- Preserve a continuous pov only when the narrative establishes an ongoing viewpoint. Otherwise choose the strongest perspective for each visual beat.",
    "- appearance + body + attire must be identical for the same character across all shots unless the current message explicitly changes their present visual state.",
    "## Data Priority",
    "1. Client comments or explicit user instructions in the current message override all instructions.",
    structuredAnima
      ? "2. Current message [P#] paragraphs are authoritative for scene content, action, visible emotion, interpersonal tone, and movement direction. Never soften, romanticize, or replace those facts with an inferred atmosphere. Never restore outdated clothing, props, location, or actions from context."
      : "2. Current message [P#] paragraphs are authoritative for scene content. Never restore outdated clothing, props, location, or actions from context.",
    config.characterTagContextEnabled ? "3. Character tag history is the current visual baseline for returning characters: label, age, appearance, body, and base attire." : "",
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
