import { normalizeConfig } from "../../shared/config.js";
import type { PreviousVisualState } from "../../backend/types.js";
import type { SidecarScenario } from "./types.js";

function config(overrides: Parameters<typeof normalizeConfig>[0] = {}) {
  return normalizeConfig({
    minImages: 1,
    maxImages: 1,
    maxCharacters: 2,
    parserRetries: 0,
    preprocessingEnabled: false,
    promptStyle: "anima",
    promptSyntax: "comfyui",
    customPositivePrefix: "",
    customPositiveSuffix: "",
    customNegative: "",
    promptPresets: [],
    ...overrides
  });
}

const lioraIdrisMemory = {
  "Liora Venn": "woman, adult woman, long dark brown hair, amber eyes, athletic body, emerald silk robe",
  "Idris Vale": "man, adult man, short silver hair, blue eyes, lean muscular body, black lounge trousers"
};

const bedroomState: PreviousVisualState = {
  characters: [
    {
      name: "Liora Venn",
      label: "woman",
      age: "adult woman",
      appearance: "long dark brown hair, amber eyes",
      body: "athletic body",
      attire: "emerald silk robe",
      attireInferred: false
    },
    {
      name: "Idris Vale",
      label: "man",
      age: "adult man",
      appearance: "short silver hair, blue eyes",
      body: "lean muscular body",
      attire: "black lounge trousers",
      attireInferred: false
    }
  ],
  environment: {
    location: "private apartment bedroom",
    timeWeather: "night",
    lightingMood: ["warm bedside light"],
    backgroundElements: ["unmade bed", "emerald robe"]
  },
  place: "",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

/** New cross-genre stress fixtures. Explicit cases are consensual and adult-only. */
export const expandedSidecarScenarios: SidecarScenario[] = [
  {
    id: "nsfw_adult_women_action_ownership",
    description: "Explicit adult same-sex action must preserve the acting and receiving roles without duplication.",
    config: config(),
    paragraphs: [
      "In a locked private loft at night, consenting adult women Vela Rook and Cora Dain are completely nude. Vela kneels between Cora's spread legs and performs cunnilingus on Cora's exposed vulva while Cora reclines against the pillows and grips the bedsheet. Both are visibly aroused."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Vela Rook", "Cora Dain"] },
    expectations: [
      { paragraph: 1, character: "Vela Rook", field: "action", anyOf: ["cunnilingus", "oral sex", "licking vulva"], critical: true },
      { paragraph: 1, character: "Cora Dain", field: "action", anyOf: ["gripping bedsheet", "grips the bedsheet", "reclining"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["vulva", "cunnilingus", "oral sex"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["man", "penis", "child", "teen"], critical: true }
    ]
  },
  {
    id: "nsfw_bedroom_to_shower_transition",
    description: "An explicit adult scene transition must replace stale location and attire while preserving identity and action ownership.",
    config: config({ minImages: 2, maxImages: 2 }),
    characterMemory: lioraIdrisMemory,
    previousVisualState: bedroomState,
    recentContext: "Liora wore her emerald silk robe in the bedroom while Idris still wore black lounge trousers.",
    paragraphs: [
      "In their private apartment bedroom, consenting adults Liora Venn and Idris Vale remove the last of their clothing beside the unmade bed. Liora lets her emerald robe fall from her shoulders while Idris pulls off his black trousers.",
      "Minutes later under the running shower, both adults are fully nude. Idris stands behind Liora and penetrates her vagina from behind while Liora braces both palms against the tiled wall. Do not restore the robe, trousers, bed, or bedroom."
    ],
    expectedParagraphs: [1, 2],
    expectedCharacters: { 1: ["Liora Venn", "Idris Vale"], 2: ["Liora Venn", "Idris Vale"] },
    expectations: [
      { paragraph: 1, character: "Liora Venn", field: "action", anyOf: ["robe fall", "robe slide", "dropping robe", "removing robe", "slipping off robe"], critical: true },
      { paragraph: 2, field: "location", anyOf: ["shower", "bathroom"], noneOf: ["bedroom"], critical: true },
      { paragraph: 2, character: "Liora Venn", field: "attire", anyOf: ["nude", "naked", "no clothing"], noneOf: ["robe"], critical: true },
      { paragraph: 2, character: "Idris Vale", field: "attire", anyOf: ["nude", "naked", "no clothing"], noneOf: ["trousers"], critical: true },
      { paragraph: 2, character: "Idris Vale", field: "action", anyOf: ["penetrating", "penetration", "vaginal sex", "sex from behind"], critical: true },
      { paragraph: 2, field: "prompt", noneOf: ["unmade bed", "bedside light"], critical: true }
    ]
  },
  {
    id: "nsfw_consensual_restraint_pose",
    description: "Consensual adult restraint must remain visibly consensual and assign the restraint to the correct partner.",
    config: config(),
    paragraphs: [
      "In a private candlelit bedroom, consenting adult man Tomas Wren lies nude on his back with both wrists loosely tied to the headboard by a red silk scarf. Consenting adult woman Ilya Maren, also nude, straddles his hips and holds the loose end of the scarf while smiling reassuringly at him. The restraint is consensual and neither adult is afraid or injured."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Tomas Wren", "Ilya Maren"] },
    expectations: [
      { paragraph: 1, character: "Tomas Wren", field: "action", anyOf: ["wrists tied", "lying on back", "restrained"], critical: true },
      { paragraph: 1, character: "Ilya Maren", field: "action", anyOf: ["straddling", "holding scarf", "holding the loose end", "holds the loose end"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["red silk scarf", "consensual"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["afraid", "injured", "blood", "struggling"], critical: true }
    ]
  },
  {
    id: "static_medieval_gatehouse",
    description: "Static medieval framing must read as a visual-novel character layer over a concrete fortress background.",
    config: config({ perspectiveMode: "static" }),
    paragraphs: [
      "At blue dawn inside a fortress gatehouse, adult castellan Orla Fenn stands slightly forward with both hands resting calmly on the pommel of a sheathed sword. She wears a dark blue surcoat over chainmail, a brown leather belt, and black boots. Behind her, the raised portcullis frames a misty stone bridge and two unlit braziers. She looks sternly toward the viewer."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Orla Fenn"] },
    expectations: [
      { paragraph: 1, field: "location", anyOf: ["fortress gatehouse", "gatehouse"], critical: true },
      { paragraph: 1, character: "Orla Fenn", field: "attire", anyOf: ["dark blue surcoat", "chainmail", "brown leather belt", "black boots"], critical: true },
      { paragraph: 1, character: "Orla Fenn", field: "expression", anyOf: ["stern", "serious", "guarded"], critical: true },
      { paragraph: 1, field: "prompt", anyOf: ["raised portcullis", "stone bridge", "unlit braziers"], critical: true },
      { paragraph: 1, field: "prompt", noneOf: ["motion blur", "dutch angle", "close-up"], critical: true }
    ]
  },
  {
    id: "static_magical_archive",
    description: "Static magical framing must preserve a calm pose and readable supernatural background without converting it into an action shot.",
    config: config({ perspectiveMode: "static" }),
    paragraphs: [
      "Inside a quiet subterranean archive, adult archivist Veyra Moss sits upright slightly forward on a wooden chair with her hands folded in her lap. She wears a moss-green dress, cream shawl, and round bronze spectacles. Behind her, blue runes glow across stone shelves filled with sealed scroll cases, and a glass lantern rests on the desk. Her expression is thoughtful and wary."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Veyra Moss"] },
    expectations: [
      { paragraph: 1, field: "location", anyOf: ["subterranean archive", "archive"], critical: true },
      { paragraph: 1, character: "Veyra Moss", field: "attire", anyOf: ["moss-green dress", "cream shawl", "bronze spectacles"], critical: true },
      { paragraph: 1, field: "prompt", anyOf: ["blue runes", "stone shelves", "scroll cases", "glass lantern"], critical: true },
      { paragraph: 1, field: "prompt", anyOf: ["medium shot", "eye level", "straight-on", "deep focus"], critical: true }
    ]
  },
  {
    id: "creative_fight_aftermath",
    description: "Creative combat framing should isolate physical aftermath without showing either fighter or leaking their identity tags.",
    config: config({ perspectiveMode: "creative", preprocessingEnabled: false }),
    characterMemory: {
      "Kesta Rill": "woman, adult woman, long red braid, gray eyes, black leather armor, silver bracers",
      "Daro Nemm": "man, adult man, shaved head, dark skin, white tunic, bronze chestplate"
    },
    paragraphs: [
      "After Kesta Rill and Daro Nemm have moved beyond the ruined arena arch, neither fighter remains visible. A snapped spear lies across a fresh sword groove in the sand while two opposing trails of footprints disappear through the arch. Dust still drifts through a shaft of light."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: [] },
    expectations: [
      { paragraph: 1, field: "prompt", anyOf: ["snapped spear", "sword groove", "footprints", "drifting dust"], critical: true },
      { paragraph: 1, field: "prompt", noneOf: ["red braid", "gray eyes", "black leather armor", "shaved head", "white tunic", "bronze chestplate", "recognizable face"], critical: true }
    ]
  },
  {
    id: "creative_magic_reflection",
    description: "Creative magic framing should isolate an unusual reflected cue rather than render the complete caster.",
    config: config({ perspectiveMode: "creative", preprocessingEnabled: false }),
    characterMemory: { "Eris Lune": "woman, adult woman, short white hair, violet eyes, red velvet coat, black gloves" },
    paragraphs: [
      "Eris Lune stands outside the frame in a dark alchemy room. In a shallow silver bowl, the reflection of a floating violet sigil bends around concentric ripples, while one black-gloved fingertip barely touches the water at the extreme edge. No face or complete body is visible."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: [] },
    allowedCharacterSets: { 1: [[], ["Eris Lune"]] },
    expectations: [
      { paragraph: 1, field: "prompt", anyOf: ["silver bowl", "violet sigil", "concentric ripples", "black-gloved fingertip"], critical: true },
      { paragraph: 1, field: "prompt", noneOf: ["white hair", "violet eyes", "red velvet coat", "recognizable face", "complete body"], critical: true }
    ]
  },
  {
    id: "adaptive_medieval_escalation",
    description: "Adaptive medieval routing should distinguish a stable establishing portrait, a fight, and an empty aftermath.",
    config: config({ adaptiveMode: true, minImages: 3, maxImages: 3 }),
    paragraphs: [
      "At noon in a castle map room, adult captain Ysolde Marr stands calmly beside a table in a green tabard over steel mail while arrow-slit windows reveal the inner ward.",
      "On the battlement moments later, Ysolde drives her round shield upward to deflect a descending mace while stepping left. Stone chips burst from the parapet beside her.",
      "After Ysolde has descended the stairs, the battlement is empty. Her cracked round shield leans against the parapet beside fresh stone chips and a broken mace head."
    ],
    expectedParagraphs: [1, 2, 3],
    expectedCharacters: { 1: ["Ysolde Marr"], 2: ["Ysolde Marr"], 3: [] },
    expectedPerspectives: { 1: ["static"], 2: ["dynamic"], 3: ["creative"] },
    expectations: [
      { paragraph: 1, field: "location", anyOf: ["castle map room", "map room"], critical: true },
      { paragraph: 2, character: "Ysolde Marr", field: "action", anyOf: ["shield upward", "deflect", "blocking"], critical: true },
      { paragraph: 2, field: "payload", anyOf: ["descending mace", "mace", "stone chips"], critical: true },
      { paragraph: 3, field: "prompt", anyOf: ["cracked round shield", "broken mace head", "stone chips"], critical: true }
    ]
  },
  {
    id: "adaptive_magic_escalation",
    description: "Adaptive magical routing should separate a quiet readable setup, a visible transformation, and an identity-safe residual detail.",
    config: config({ adaptiveMode: true, minImages: 3, maxImages: 3 }),
    paragraphs: [
      "At dusk inside a glass conservatory, adult mage Tovan Reed stands quietly beside a stone planter wearing a brown coat, cream shirt, and dark trousers. Pale moths rest on the surrounding leaves.",
      "Tovan raises both arms as silver roots coil upward from the planter and luminous moth wings unfold from his back. His coat and clothing remain unchanged, and his expression is startled.",
      "After Tovan moves out of view, one luminous moth wing scale rests on a wet leaf beside a fading silver root. The empty conservatory glass reflects the last violet light."
    ],
    expectedParagraphs: [1, 2, 3],
    expectedCharacters: { 1: ["Tovan Reed"], 2: ["Tovan Reed"], 3: [] },
    expectedPerspectives: { 1: ["static"], 2: ["dynamic"], 3: ["creative"] },
    expectations: [
      { paragraph: 1, field: "location", anyOf: ["glass conservatory", "conservatory"], critical: true },
      { paragraph: 2, character: "Tovan Reed", field: "identityTraits", anyOf: ["luminous moth wings", "moth wings"], critical: true },
      { paragraph: 2, character: "Tovan Reed", field: "attire", anyOf: ["brown coat", "cream shirt", "dark trousers"], critical: true },
      { paragraph: 3, field: "prompt", anyOf: ["moth wing scale", "wet leaf", "fading silver root", "violet light"], critical: true }
    ]
  },
  {
    id: "medieval_drawbridge_duel",
    description: "A medieval sword fight must preserve handedness, movement direction, defensive ownership, and hostility.",
    config: config(),
    paragraphs: [
      "At dawn on a rain-slick castle drawbridge, adult knight Elara Voss lunges forward from the left with a longsword held in her right hand. Adult mercenary Bram Kest steps backward on the right and raises a round shield to block her strike. Elara wears dented silver plate over a blue gambeson; Bram wears brown leather armor and a red scarf. They are fighting as enemies, not flirting."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Elara Voss", "Bram Kest"] },
    expectations: [
      { paragraph: 1, character: "Elara Voss", field: "action", anyOf: ["lunging forward", "lunges forward", "sword strike", "attacking"], critical: true },
      { paragraph: 1, character: "Bram Kest", field: "action", anyOf: ["raising shield", "shield to block", "raised shield", "blocking", "steps backward", "stepping backward"], critical: true },
      { paragraph: 1, character: "Elara Voss", field: "attire", anyOf: ["silver plate", "blue gambeson"], critical: true },
      { paragraph: 1, field: "location", anyOf: ["castle drawbridge", "drawbridge"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["romantic", "flirting", "tender"], critical: true }
    ]
  },
  {
    id: "medieval_courtyard_to_chapel",
    description: "A medieval pursuit followed by a new interior scene must not leak exterior weather, combat posture, or removed armor.",
    config: config({ minImages: 2, maxImages: 2 }),
    paragraphs: [
      "During a snowy evening in a fortress courtyard, adult guard Maelin Thorne runs toward the chapel doors carrying a halberd. She wears a steel helmet, chainmail hauberk, green cloak, and mud-stained boots while arrows strike the stones behind her.",
      "Inside the candlelit chapel, Maelin has barred the doors, set down the halberd, removed her steel helmet and green cloak, and kneels beside the altar to bind a cut on her forearm. Do not show snow, flying arrows, the courtyard, the helmet, or the cloak."
    ],
    expectedParagraphs: [1, 2],
    expectedCharacters: { 1: ["Maelin Thorne"], 2: ["Maelin Thorne"] },
    expectations: [
      { paragraph: 1, character: "Maelin Thorne", field: "action", anyOf: ["running", "runs toward", "carrying halberd"], critical: true },
      { paragraph: 2, field: "location", anyOf: ["chapel"], noneOf: ["courtyard"], critical: true },
      { paragraph: 2, character: "Maelin Thorne", field: "attire", anyOf: ["chainmail", "hauberk", "mud-stained boots"], noneOf: ["steel helmet", "green cloak"], critical: true },
      { paragraph: 2, character: "Maelin Thorne", field: "action", anyOf: ["binding", "bandaging", "kneeling"], critical: true },
      { paragraph: 2, field: "prompt", noneOf: ["snow", "flying arrows"], critical: true }
    ]
  },
  {
    id: "medieval_partial_attacker",
    description: "A one-character medieval action shot must preserve a visible partial threat without inventing a complete opponent.",
    config: config({ maxCharacters: 1 }),
    paragraphs: [
      "Inside a torchlit stone stairwell, adult archer Sera Holt twists sharply left and catches an incoming axe on the wooden limb of her bow. Only the armored forearm and axe of the out-of-frame attacker enter from the right edge. Sera wears a dark green hood, quilted vest, leather bracers, and gray trousers. Do not show the attacker's face or full body."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Sera Holt"] },
    expectations: [
      { paragraph: 1, character: "Sera Holt", field: "action", anyOf: ["blocking", "incoming axe", "axe on the wooden limb", "twisting left"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["armored forearm", "partial arm", "incoming axe"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["attacker face", "full attacker", "second character"], critical: true }
    ]
  },
  {
    id: "magic_counterspell_ownership",
    description: "Opposed magical actions and colors must remain owned by the correct combatants.",
    config: config(),
    paragraphs: [
      "At night in a ruined observatory, adult mage Neris Quill stands on the left and thrusts her open palm forward, projecting a blue circular ward. Adult warlock Ovan Rusk attacks from the right with a twisting stream of orange fire from his staff. The fire crashes against Neris's ward between them. Neris wears white layered robes with a blue belt; Ovan wears a charcoal coat with brass clasps. They are bitter enemies."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Neris Quill", "Ovan Rusk"] },
    expectations: [
      { paragraph: 1, character: "Neris Quill", field: "action", anyOf: ["projecting", "blue ward", "raising ward", "blocking"], critical: true },
      { paragraph: 1, character: "Ovan Rusk", field: "action", anyOf: ["orange fire", "attacking", "casting fire", "fire stream"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["blue circular ward", "blue ward"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["orange fire"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["romantic", "friendly"], critical: true }
    ]
  },
  {
    id: "magic_transformation_continuity",
    description: "A current magical transformation must update only the stated appearance traits without replacing stable identity or attire.",
    config: config({ minImages: 2, maxImages: 2 }),
    characterMemory: {
      "Asha Fen": "woman, adult woman, dark skin, shoulder-length black curls, brown eyes, slim body, purple travel coat, cream tunic, black leggings, brown boots"
    },
    paragraphs: [
      "At twilight in a moonlit forest clearing, adult sorcerer Asha Fen raises a crystal seed between both hands. She has dark skin, shoulder-length black curls, brown eyes, and wears her purple travel coat over a cream tunic with black leggings and brown boots.",
      "The crystal seed bursts into green light. Asha remains the same adult woman in the same clothing, but the magic temporarily turns only her brown eyes luminous green and grows translucent leaf-shaped wings from her back. Her black curls, dark skin, body, coat, tunic, leggings, and boots do not change."
    ],
    expectedParagraphs: [1, 2],
    expectedCharacters: { 1: ["Asha Fen"], 2: ["Asha Fen"] },
    expectations: [
      { paragraph: 1, character: "Asha Fen", field: "action", anyOf: ["raising", "raises", "holding crystal seed", "holds the crystal seed"], critical: true },
      { paragraph: 2, character: "Asha Fen", field: "appearance", anyOf: ["luminous green eyes", "glowing green eyes"], critical: true },
      { paragraph: 2, character: "Asha Fen", field: "terminalIdentityTraits", anyOf: ["leaf-shaped wings", "translucent leaf wings", "translucent wings"], critical: true },
      { paragraph: 2, character: "Asha Fen", field: "appearance", anyOf: ["black curls", "black curly hair"], critical: true },
      { paragraph: 2, character: "Asha Fen", field: "attire", anyOf: ["purple travel coat", "cream tunic", "black leggings", "brown boots"], critical: true }
    ]
  },
  {
    id: "fight_boxing_action_ownership",
    description: "A fast sparring exchange must preserve which fighter attacks, which fighter evades, and the non-romantic athletic context.",
    config: config(),
    paragraphs: [
      "In a brightly lit boxing gym, adult boxer Jana Pike drives a left jab toward adult boxer Remy Sol's face. Remy slips his head to his right and raises his right glove to parry. Jana wears a red sports top, red shorts, and black gloves; Remy wears a blue sleeveless shirt, blue shorts, and white gloves. They are focused sparring partners, not a romantic couple."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Jana Pike", "Remy Sol"] },
    expectations: [
      { paragraph: 1, character: "Jana Pike", field: "action", anyOf: ["left jab", "jabbing", "punching"], critical: true },
      { paragraph: 1, character: "Remy Sol", field: "action", anyOf: ["slipping right", "slips his head", "parrying", "raising right glove"], critical: true },
      { paragraph: 1, field: "location", anyOf: ["boxing gym", "gym"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["romantic", "kissing", "embracing"], critical: true }
    ]
  },
  {
    id: "fight_pov_partial_weapon",
    description: "A POV fight with one named character must retain the partial foreground weapon and defensive movement.",
    config: config({ maxCharacters: 1 }),
    paragraphs: [
      "From the POV of an out-of-frame adult attacker in a rain-dark alley, adult courier Della Marr ducks low to her left beneath a metal pipe swinging in from the foreground right. Only the attacker's gloved hand and pipe are visible. Della wears a yellow raincoat, dark cargo pants, and red boots; her expression is alarmed and determined. Do not show a complete attacker."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Della Marr"] },
    expectations: [
      { paragraph: 1, character: "Della Marr", field: "action", anyOf: ["ducking left", "ducks low", "to her left", "low ducking", "dodging left"], critical: true },
      { paragraph: 1, character: "Della Marr", field: "expression", anyOf: ["alarmed", "determined"], critical: true },
      { paragraph: 1, field: "prompt", anyOf: ["pov", "foreground"], critical: true },
      { paragraph: 1, field: "payload", anyOf: ["gloved hand", "metal pipe", "partial hand"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["complete attacker", "attacker face", "second character"], critical: true }
    ]
  },
  {
    id: "dynamic_monster_magic_sword",
    description: "A sword-versus-magic monster beat must preserve weapon ownership, spell color, anatomy, and movement direction.",
    config: config(),
    paragraphs: [
      "At midnight in a shattered temple, adult knight Iona Vey steps forward on the left and raises a silver longsword in both hands to block a violet lightning bolt. On the right, the hulking basalt monster Ash Maw fires the bolt from the single crystal horn in its forehead; it has four stone arms, no wings, and a cracked glowing chest. Iona wears black plate armor over a crimson gambeson."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Iona Vey", "Ash Maw"] },
    expectations: [
      { paragraph: 1, character: "Iona Vey", field: "action", anyOf: ["raises a silver longsword", "raises silver longsword", "blocking", "block violet lightning", "blocks violet lightning", "steps forward"], critical: true },
      { paragraph: 1, character: "Ash Maw", field: "action", anyOf: ["fires", "violet lightning", "lightning bolt"], critical: true },
      { paragraph: 1, character: "Ash Maw", field: "identityTraits", anyOf: ["single crystal horn", "crystal horn"], critical: true },
      { paragraph: 1, character: "Ash Maw", field: "body", anyOf: ["four stone arms", "four arms"], critical: true },
      { paragraph: 1, field: "prompt", noneOf: ["bird wings", "bat wings", "feathered wings"], critical: true }
    ]
  },
  {
    id: "static_kemonomimi_corporate",
    description: "A corporate kemonomimi portrait must retain human anatomy plus explicit ears and tail without becoming a full furry.",
    config: config({ perspectiveMode: "static" }),
    paragraphs: [
      "In a glass corporate boardroom at noon, adult cat kemonomimi executive Mina Kade stands slightly forward beside a presentation table. She has human skin, a human face, short black hair, green eyes, black cat ears, and one black cat tail, with no muzzle and no body fur. She wears a charcoal business suit, white collared shirt, narrow green tie, and black loafers."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Mina Kade"] },
    expectations: [
      { paragraph: 1, field: "location", anyOf: ["corporate boardroom", "glass boardroom", "boardroom"], critical: true },
      { paragraph: 1, character: "Mina Kade", field: "identityTraits", anyOf: ["black cat ears", "cat ears"], critical: true },
      { paragraph: 1, character: "Mina Kade", field: "identityTraits", anyOf: ["black cat tail", "cat tail"], critical: true },
      { paragraph: 1, character: "Mina Kade", field: "attire", anyOf: ["charcoal business suit", "white collared shirt", "green tie"], critical: true },
      { paragraph: 1, field: "payload", noneOf: ["muzzle", "body fur", "fur-covered"], critical: true }
    ]
  },
  {
    id: "dynamic_furry_streetwear",
    description: "A full furry streetwear action shot must preserve species anatomy and layered modern clothing without collapsing into kemonomimi.",
    config: config(),
    paragraphs: [
      "At dusk on a neon pedestrian overpass, adult anthropomorphic fox courier Rook Sable vaults rightward over a concrete barrier while clutching a parcel under his left arm. He has orange fur, a white muzzle, black fox ears, digitigrade legs, and one bushy orange tail. He wears an oversized teal bomber jacket, black graphic hoodie, gray cargo shorts, striped crew socks, and red high-top sneakers."
    ],
    expectedParagraphs: [1],
    expectedCharacters: { 1: ["Rook Sable"] },
    expectations: [
      { paragraph: 1, character: "Rook Sable", field: "action", anyOf: ["vaults rightward", "vaulting right", "clutching a parcel", "parcel under his left arm"], critical: true },
      { paragraph: 1, character: "Rook Sable", field: "identityTraits", anyOf: ["orange fur", "white muzzle", "black fox ears", "bushy orange tail"], critical: true },
      { paragraph: 1, character: "Rook Sable", field: "body", anyOf: ["digitigrade legs", "digitigrade"], critical: true },
      { paragraph: 1, character: "Rook Sable", field: "attire", anyOf: ["teal bomber jacket", "black graphic hoodie", "gray cargo shorts", "red high-top sneakers"], critical: true },
      { paragraph: 1, field: "location", anyOf: ["pedestrian overpass", "neon overpass", "overpass"], critical: true }
    ]
  }
];
