import type { Config } from "../shared/config.js";

export function parserInstruction(config: Config): string {
  const maxCharacters = config.mode === "asset" ? 1 : config.maxCharacters;
  const animaIllustration = config.mode === "illustration" && config.promptStyle === "anima";
  const shotInstruction = config.mode === "asset"
    ? [
      "Asset mode: generate exactly one shot for each [P#] paragraph.",
      "Each shot must contain exactly one visible character.",
      "Force place to include white background, simple background.",
      "Favor clean reusable character portrait tags over narrative scene illustration tags."
    ].join("\n")
    : [
      `Generate ${config.minImages}-${config.maxImages} shots total when possible.`,
      "Choose the most visually consequential changes, actions, interactions, or emotional beats across the entire current source; do not favor earlier paragraphs merely because they appear first.",
      "Each additional shot must differ from the other shots in at least two of these dimensions: (1) perspective or framing, (2) focal subject or visible action, and (3) composition, depth, or foreground occlusion.",
      "If the source contains too few distinct visual beats, create alternate shots of the same paragraph with genuinely different cinematography. Do not invent narrative events.",
      "Distinct shots may reference the same paragraph. Order shots by their visual importance, not paragraph number."
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
  const schema = animaIllustration ? [
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
    '              "action": "string",',
    '              "composition": "string"',
    "            }",
    "          ],",
    '          "sharedComposition": "string",',
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
  const naturalDetail = animaIllustration
    ? [
      "### Natural Composition",
      "characters[].composition is always required. Describe that character's spatial position, pose, visible action, gaze, and relationships in concise natural language.",
      "Do not repeat a character's action tags when composition already expresses the same action; action is only a fallback for missing composition.",
      config.supplement
        ? "Use shot.sharedComposition for concise natural-language interaction or relationship detail shared by multiple characters."
        : "Leave shot.sharedComposition empty. Character composition remains required.",
      "Do not use names in composition prose. Identify people by visual position such as left girl, right boy, foreground character, or background character.",
      "Use concise objective visual phrases, not narration, invisible emotion, smell, sound, or internal sensation.",
      "Environment target budget: exactly one location, exactly one time/weather phrase, 1-2 lighting/mood snippets, and 1-3 background elements.",
      "Each environment snippet must be concise and contain no comma, semicolon, or terminal punctuation.",
      config.supplement
        ? "Populate lightingMood and backgroundElements within the target budget."
        : "Leave lightingMood and backgroundElements empty. Still populate location and timeWeather."
    ].join("\n")
    : config.supplement
      ? [
        "### Natural Language Supplement",
        "In supplement, describe the image in natural language for visible details that tags cannot express well, such as detailed composition, framing, character positions, interactions, unusual vantage points, or objective atmosphere/lighting.",
        "Use concise, minimal, telegraphic sentences. Be objective, not subjective interpretation.",
        "Do not use supplement for smell, sound, internal sensations, invisible emotions, or prose narration."
      ].join("\n")
      : "Do not include supplement text.";
  return [
    "# Image Tagging System",
    "Tag the current message's paragraphs as Danbooru-style English image prompts. Output a single JSON object.",
    "## JSON Format",
    schema.join("\n"),
    "- negative is optional. All other fields are required, though values may be empty strings when a field does not apply.",
    "- These are the ONLY allowed fields. Adding any unlisted field is a schema violation.",
    "## Scenes & Shots",
    "Scene = shots sharing one physical location.",
    "- Same location means same scene, multiple shots.",
    animaIllustration ? "- Location change means a new scene with its own environment." : "- Location change means a new scene with its own place.",
    "Shot = one distinct visual moment: interaction, emotion, significant action, or clear framing change. Prefer closer framing over wide shots. Shots are independent, so repeat tags if the scene has not changed.",
    shotInstruction,
    "Paragraph mapping: current message uses [P#] numbering.",
    "- Each shot's paragraph must reference an existing [P#].",
    "- Never invent paragraph numbers outside the visible range.",
    "- Tag ONLY the current message. Recent context is for continuity only.",
    "## Tag Rules",
    "Use common, objective, visualizable Danbooru-style English tags. Do not invent tags; use simpler well-known equivalents if unsure. Do not use metaphors for tags.",
    animaIllustration
      ? "Tag fields are comma-separated tags. composition and sharedComposition are concise natural language. Environment arrays contain one comma-free visual snippet per item."
      : "All fields are comma-separated tags except supplement, which is a short objective visual sentence.",
    `Character limit: max ${maxCharacters} visible character(s) per shot. Characters outside the limit should be represented only by visible partial body parts, such as out of frame, hand, arm, or legs. Do not output their expressions or attire. Only output visible body parts and actions when needed.`,
    config.mode === "asset" ? "Asset mode requires one character in characters[] for every shot, no group shots, no narrative background beyond a simple white background." : "",
    "Repeat tags if the situation or scene has not changed. Shots are independent, so repeated tags across shots are expected for stable appearance, attire, location, and persistent actions.",
    config.mode === "illustration" ? "Continuity does not require repeating camera angle, framing, composition, depth, or occlusion. Vary those deliberately between shots while preserving narrative facts." : "",
    animaIllustration
      ? "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields include expression, action, composition, camera, situation, sharedComposition, environment, and negative."
      : "Current visual baseline memory fields are label, age, appearance, body, and attire. Scene-only fields are expression, action, camera, situation, place, supplement, and negative.",
    "## Field Reference",
    animaIllustration ? "### environment - scene-level" : "### place - scene-level",
    animaIllustration
      ? "environment.location is one physical location phrase; timeWeather is one time/weather phrase; lightingMood targets 1-2 snippets; backgroundElements targets 1-3 prominent visual props or setting details."
      : "Start with interior or exterior when location is known, then add location, mood, lighting, time, weather, and prominent props. Prominent props should be color + object. Define once per scene; all shots in the scene share identical place.",
    animaIllustration
      ? "Do not include character names, actions, expressions, clothing, body traits, or camera framing in environment."
      : "Do not include character names, actions, expressions, clothing, body traits, or camera framing in place.",
    "### camera - shot-level",
    "Perspective tags: from above, from behind, from below, from side, high up, sideways, straight-on, upside-down, pov.",
    "Framing tags: portrait, upper body, cowboy shot, feet out of frame, full body, wide shot, lower body, head out of frame, eyes out of frame, close-up, body-part focus.",
    "Use camera only for perspective and framing. Do not include actions, expressions, appearance, clothing, subject counts, or place.",
    "### situation - shot-level",
    "Strictly use character count/composition tags such as 1girl, 2girls, 1boy, 1girl, 1boy, other, solo, group, and nsfw only when explicitly visual.",
    "The total number of people should match the visible characters being described/tagged.",
    "Do not include names, numeric ages, appearance, attire, expression, action, camera, or place.",
    "### label",
    "Use girl, boy, or other regardless of age. For out-of-frame partial characters, use label plus out of frame and visible part, such as boy, out of frame, hand.",
    "### name - required",
    "Character name from the narrative. If unnamed, use a consistent identifier such as girl A, boy B, shopkeeper, guard, or stranger. Never empty; this is used for cross-message appearance tracking.",
    "Do not put character names in label, age, appearance, body, attire, expression, action, composition, situation, camera, place, environment, sharedComposition, supplement, or negative.",
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
    "Do not include names, attire, expression, pose, action, camera, place, or supplement in appearance.",
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
    "Do not include posture, gaze direction, clothing, body, action, camera, place, or names in expression.",
    "### action",
    animaIllustration
      ? "Use shot.action only as tag fallback when sharedComposition is empty or disabled. Use characters[].action only as tag fallback when that character's composition is empty."
      : "Use shot.action for global or relationship action that applies to the whole shot, such as two characters holding hands or one character guiding another.",
    animaIllustration
      ? "Put each character's spatial position, pose, action, gaze, and relationship in characters[].composition instead of duplicating it as action tags."
      : "Use characters[].action for a single character's posture, gaze, pose, interactions, and visible actions. Use multiple tags if needed.",
    "Posture examples: standing, sitting on chair, on back, kneeling, spread legs, all fours, squatting, on stomach, on side.",
    "Gaze examples: looking at viewer, looking away, looking at another.",
    "Interaction examples: arm hug, leaning, heads together, carrying, piggyback, holding hands.",
    "Do not duplicate camera, place, situation counts, appearance, body, attire, or expression. Do not put the same action in multiple fields.",
    "### negative - optional",
    "Only if the client explicitly specifies negative prompt tags. Never infer negative tags.",
    naturalDetail,
    "## Repetition is Consistency",
    "- If a detail appears in one shot and persists, tag it in all subsequent shots.",
    "- If an action or attire is still in motion or still present, repeat it in later shots.",
    config.mode === "illustration" ? "- Preserve a continuous pov only when the narrative establishes an ongoing viewpoint. Otherwise choose the strongest perspective for each visual beat." : "",
    "- appearance + body + attire must be identical for the same character across all shots unless the current message explicitly changes their present visual state.",
    "## Data Priority",
    "1. Client comments or explicit user instructions in the current message override all instructions.",
    "2. Current message [P#] paragraphs are authoritative for scene content. Never restore outdated clothing, props, location, or actions from context.",
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
