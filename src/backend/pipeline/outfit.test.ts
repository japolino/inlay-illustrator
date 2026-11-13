import { describe, expect, test } from "bun:test";
import inputs from "../../engine/__fixtures__/v5/inputs.json";
import { buildV5AnalyzerMessages, buildV5AnalyzerRequest } from "../../engine/index.js";
import type { AnalyzerClientLike } from "../services/types.js";
import {
  augmentV5AnalyzerMessages,
  createRunOutfitIndex,
  FREEFORM_CLOTHING_POLICY,
  OutfitIndexRegistry,
  recordPreparedOutfits,
  reuseSameOutfits,
  type RunOutfitIndex,
  withOutfitAwareness,
  withoutAbsenceProposals,
} from "./outfit-awareness.js";
import { garmentsConflict, garmentsIn, isAbsenceChunk, isAbsencePart, legwearCoversFeet, partGarments, sameOutfit, withoutAbsence } from "./outfit-garments.js";
import { parseOutfitSegment, repairActorPrompt, repairBatchItems, replaceInStrings } from "./outfit-visibility.js";
import { clothingSentences, stripAbsenceFromAnalysis, TEXT_CLOTHING_ADDENDUM, withOutfitEvidence } from "../analysis/outfit-evidence.js";

const context = (inputs as { context: Record<string, unknown> }).context;

const one = (text: string, slot: "legs" | "feet") => {
  const found = garmentsIn(text, slot);
  expect(found.length).toBe(1);
  return found[0]!;
};

describe("garment vocabulary", () => {
  test("finds legwear and footwear phrases with their colors", () => {
    expect(garmentsIn("adjusting her black stockings over her knees", "legs").map((g) => [g.family, g.colors, g.text])).toEqual([["stockings", ["black"], "black stockings"]]);
    expect(garmentsIn("white knee-high socks and brown penny loafers", "legs").map((g) => g.family)).toEqual(["kneehighs"]);
    expect(garmentsIn("white knee-high socks and brown penny loafers", "feet").map((g) => [g.family, g.colors])).toEqual([["loafers", ["brown"]]]);
    expect(garmentsIn("black thighhighs, white thigh-high socks", "legs").map((g) => g.family)).toEqual(["thighhighs", "thighhighs"]);
  });

  test("does not read body parts or boots as garments", () => {
    expect(garmentsIn("bare heels resting against his collarbone", "feet")).toEqual([]);
    expect(garmentsIn("pumps her fist", "feet")).toEqual([]);
    expect(garmentsIn("lying across the wooden shoe cabinet by the shoe lockers", "feet")).toEqual([]);
    expect(garmentsIn("rummaging in the sock drawer", "legs")).toEqual([]);
    expect(garmentsIn("black knee-high boots", "legs")).toEqual([]);
    expect(one("black knee-high boots", "feet").family).toBe("boots");
    expect(one("red heels", "feet").family).toBe("heels");
  });

  test("conflicts: another garment type or disjoint colors for the same slot", () => {
    const socks = one("white knee-high socks", "legs");
    expect(garmentsConflict(socks, one("black stockings", "legs"))).toBe(true);
    expect(garmentsConflict(socks, one("black socks", "legs"))).toBe(true);
    expect(garmentsConflict(socks, one("socks", "legs"))).toBe(false);
    expect(garmentsConflict(socks, one("white socks", "legs"))).toBe(false);
    expect(garmentsConflict(one("black thighhighs", "legs"), one("dark stockings", "legs"))).toBe(false);
    const loafers = one("brown loafers", "feet");
    expect(garmentsConflict(loafers, one("shoes", "feet"))).toBe(false);
    expect(garmentsConflict(loafers, one("white sneakers", "feet"))).toBe(true);
    expect(garmentsConflict(loafers, one("black loafers", "feet"))).toBe(true);
  });

  test("absence chunks", () => {
    for (const t of ["bare legs", "barefoot", "0.8::bare legs::", "no shoes", "bare feet"]) expect(isAbsenceChunk(t)).toBe(true);
    for (const t of ["white socks", "bare-shouldered top", "completely nude"]) expect(isAbsenceChunk(t)).toBe(false);
    expect(withoutAbsence("white socks, bare legs")).toBe("white socks");
    expect(isAbsencePart("barefoot")).toBe(true);
    expect(isAbsencePart("bare thighs")).toBe(true);
    expect(isAbsencePart("black thigh straps, bare thighs")).toBe(false);
    expect(isAbsencePart("brown loafers")).toBe(false);
    expect(legwearCoversFeet("white knee-high socks")).toBe(true);
    expect(legwearCoversFeet("black leggings")).toBe(false);
  });
});

const UNIFORM = {
  top: "white sailor shirt, navy sailor collar, red neckerchief",
  bottom: "navy pleated skirt",
  legs: "white knee-high socks",
  feet: "brown loafers",
};
const IDENTITY = "female, alice, silver hair, long hair, blue eyes, thick thighs";

/** Actor prompt as the V5 compiler serializes it: tags (outfit span among them) + "\n" + natural language. */
function actorPrompt(before: string, outfit: string, after: string, nl: string) {
  const head = `${before}, `;
  const tags = `${head}${outfit}${after ? `, ${after}` : ""}`;
  return { prompt: `${tags}\n${nl}`, segment: { start: head.length, end: head.length + outfit.length } };
}

describe("outfit span parsing", () => {
  test("plain, weighted and dropped parts", () => {
    const seg = `${UNIFORM.top}, 0.3::${UNIFORM.bottom}::`;
    expect(parseOutfitSegment(seg, UNIFORM)).toEqual([
      { part: "top", text: UNIFORM.top, weight: 1 },
      { part: "bottom", text: UNIFORM.bottom, weight: 0.3 },
    ]);
    expect(parseOutfitSegment(`${UNIFORM.top}, ${UNIFORM.bottom}, 0.8::${UNIFORM.legs}::`, UNIFORM)?.map((e) => [e.part, e.weight])).toEqual([
      ["top", 1],
      ["bottom", 1],
      ["legs", 0.8],
    ]);
    expect(parseOutfitSegment("something else, navy pleated skirt", UNIFORM)).toBeNull();
  });

  test("multi-tag parts weighted per tag, as the V5 compiler renders them", () => {
    const suit = { top: "white dress shirt, black jacket", bottom: "black slacks, black belt", feet: "black loafers" };
    expect(parseOutfitSegment("white dress shirt, black jacket, 0.3::black slacks::, 0.3::black belt::", suit)).toEqual([
      { part: "top", text: suit.top, weight: 1 },
      { part: "bottom", text: suit.bottom, weight: 0.3 },
    ]);
    expect(parseOutfitSegment("white dress shirt, black jacket, 0.3::black slacks::, 0.8::black belt::", suit)).toBeNull();
    const { prompt, segment } = actorPrompt("male, bob, kneeling", "white dress shirt, black jacket, 0.3::black slacks::, 0.3::black belt::", "", "his knees on the rug, stepping on his own shoelace.");
    const r = repairActorPrompt({ prompt, segment, parts: suit, framing: "upper_body" })!;
    expect(r.prompt.split("\n")[0]).toBe("male, bob, kneeling, white dress shirt, black jacket, black slacks, black belt, black loafers");
  });
});

describe("actor prompt repair", () => {
  test("restores legwear and footwear when the actor's text shows legs and feet, even in an upper-body crop", () => {
    const { prompt, segment } = actorPrompt(`${IDENTITY}, on back, legs up`, `${UNIFORM.top}, 0.3::${UNIFORM.bottom}::`, "", "both feet pressed together against the headboard.");
    const r = repairActorPrompt({ prompt, segment, parts: UNIFORM, framing: "upper_body" })!;
    expect(r).not.toBeNull();
    const outfit = `${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}, ${UNIFORM.feet}`;
    expect(r.prompt).toBe(`${IDENTITY}, on back, legs up, ${outfit}\nboth feet pressed together against the headboard.`);
    expect(r.prompt.slice(r.segment!.start, r.segment!.end)).toBe(outfit);
  });

  test("leaves the AM crop weights alone when nothing shows legs or feet", () => {
    const { prompt, segment } = actorPrompt(`${IDENTITY}, sitting, smile`, `${UNIFORM.top}, ${UNIFORM.bottom}, 0.8::${UNIFORM.legs}::`, "", "smiling at the camera across the table.");
    expect(repairActorPrompt({ prompt, segment, parts: UNIFORM, framing: "cowboy_shot" })).toBeNull();
  });

  test("feet as a unit or a place are not visibility cues", () => {
    for (const nl of ["standing at her full six-foot height.", "three feet from the mattress.", "sitting at the foot of the bed."]) {
      const { prompt, segment } = actorPrompt(`${IDENTITY}, standing`, `${UNIFORM.top}, ${UNIFORM.bottom}, 0.8::${UNIFORM.legs}::`, "", nl);
      expect(repairActorPrompt({ prompt, segment, parts: UNIFORM, framing: "cowboy_shot" })).toBeNull();
    }
  });

  test("body-type tags are not visibility cues", () => {
    const { prompt, segment } = actorPrompt(`${IDENTITY}, standing`, `${UNIFORM.top}, ${UNIFORM.bottom}, 0.8::${UNIFORM.legs}::`, "", "waving.");
    expect(repairActorPrompt({ prompt, segment, parts: { ...UNIFORM, legs: "black thighhighs" }, framing: "cowboy_shot" })).toBeNull();
  });

  test("shoes taken off: footwear removed, legwear kept, `no shoes` added", () => {
    const { prompt, segment } = actorPrompt(`${IDENTITY}, sitting`, `${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}, ${UNIFORM.feet}`, "", "kicked off her loafers by the bed, wiggling her toes.");
    const r = repairActorPrompt({ prompt, segment, parts: UNIFORM, framing: "full_body" })!;
    expect(r.prompt.split("\n")[0]).toBe(`${IDENTITY}, sitting, ${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}, no shoes`);
    expect(r.prompt.slice(r.segment!.start, r.segment!.end)).toBe(`${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}`);
    expect(r.changes).toContain("feet: removed (no shoes)");
  });

  test("barefoot: socks and shoes removed, `barefoot` added", () => {
    const { prompt, segment } = actorPrompt(`${IDENTITY}, lying`, `${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}`, "", "her bare feet dangling off the edge of the bed.");
    const r = repairActorPrompt({ prompt, segment, parts: UNIFORM, framing: "cowboy_shot" })!;
    expect(r.prompt.split("\n")[0]).toBe(`${IDENTITY}, lying, ${UNIFORM.top}, ${UNIFORM.bottom}, barefoot`);
    // The analyzer's own free tag is enough.
    const tagged = actorPrompt(`${IDENTITY}, lying, barefoot`, `${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}`, "", "dangling off the edge of the bed.");
    expect(repairActorPrompt({ ...tagged, parts: UNIFORM, framing: "cowboy_shot" })!.prompt.split("\n")[0]).toBe(`${IDENTITY}, lying, barefoot, ${UNIFORM.top}, ${UNIFORM.bottom}`);
  });

  test("another actor's bare or socked feet do not undress this actor", () => {
    const man = "male, bob, short hair";
    const suit = { top: "white dress shirt", bottom: "black trousers", feet: "black loafers" };
    for (const nl of [
      "kneeling by the bed, staring at the dangling bare feet.",
      "holding both white-socked feet in his palms.",
      "shoved back with his throat bracketed by both bare feet.",
      "carefully wiping the damp bare foot and between the toes.",
    ]) {
      const { prompt, segment } = actorPrompt(`${man}, kneeling`, `${suit.top}, ${suit.bottom}, ${suit.feet}`, "", nl);
      const r = repairActorPrompt({ prompt, segment, parts: suit, framing: "full_body" });
      expect(r?.prompt.split("\n")[0] ?? prompt.split("\n")[0]).toBe(`${man}, kneeling, ${suit.top}, ${suit.bottom}, ${suit.feet}`);
    }
    // ...nor make this actor's dropped footwear visible.
    const dropped = actorPrompt(`${man}, sitting, source#wiping foot`, `${suit.top}, 0.3::${suit.bottom}::`, "", "wiping the damp bare foot with a handkerchief.");
    expect(repairActorPrompt({ ...dropped, parts: suit, framing: "upper_body" })).toBeNull();
    // An action done with the actor's own foot still counts.
    const own = actorPrompt(`${IDENTITY}, sitting, source#pinning notebook by foot`, `${UNIFORM.top}, 0.3::${UNIFORM.bottom}::`, "", "reaching toward the table.");
    expect(repairActorPrompt({ ...own, parts: UNIFORM, framing: "upper_body" })!.changes).toContain("feet: dropped -> 1 (feet visible)");
  });

  test("absence parts are never restored and give way to legwear the text names", () => {
    const bare = { ...UNIFORM, legs: "bare legs", feet: "barefoot" };
    const { prompt, segment } = actorPrompt(`${IDENTITY}, lying`, `${UNIFORM.top}, ${UNIFORM.bottom}`, "", "both legs kicked up behind in white knee-high socks without shoes.");
    const r = repairActorPrompt({ prompt, segment, parts: bare, framing: "upper_body" })!;
    expect(r.prompt.split("\n")[0]).toBe(`${IDENTITY}, lying, ${UNIFORM.top}, ${UNIFORM.bottom}, no shoes`);
    const shown = actorPrompt(`${IDENTITY}, lying`, `${UNIFORM.top}, ${UNIFORM.bottom}, 0.8::bare legs::`, "", "white knee-high socks pulled up to her knees.");
    expect(repairActorPrompt({ ...shown, parts: bare, framing: "cowboy_shot" })!.prompt.split("\n")[0]).toBe(`${IDENTITY}, lying, ${UNIFORM.top}, ${UNIFORM.bottom}`);
  });

  test("someone else's bare feet do not change the actor", () => {
    const { prompt, segment } = actorPrompt(`${IDENTITY}, kneeling`, `${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}`, "", "staring at his bare feet.");
    // Her socks stay, no `barefoot`; "his bare feet" is no cue for her feet either.
    expect(repairActorPrompt({ prompt, segment, parts: UNIFORM, framing: "cowboy_shot" })).toBeNull();
    const own = actorPrompt(`${IDENTITY}, kneeling`, `${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}`, "", "staring at her own feet.");
    expect(repairActorPrompt({ ...own, parts: UNIFORM, framing: "cowboy_shot" })!.prompt.split("\n")[0]).toBe(`${IDENTITY}, kneeling, ${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}, ${UNIFORM.feet}`);
  });

  test("no shoes keeps socks registered as the feet part", () => {
    const office = { top: "white dress shirt", bottom: "black slacks", feet: "black dress socks" };
    const p = actorPrompt("male, bob, sitting", `${office.top}, 0.3::${office.bottom}::`, "", "flexing his heel to press his black-socked foot against the desk leg.");
    const r = repairActorPrompt({ ...p, parts: office, framing: "upper_body" })!;
    expect(r.prompt.split("\n")[0]).toBe(`male, bob, sitting, ${office.top}, ${office.bottom}, ${office.feet}, no shoes`);
  });

  test("interaction tags and handled body parts are the other actor's", () => {
    const man = "male, bob, black hair, short hair";
    const suit = { top: "white dress shirt, black jacket", bottom: "black slacks", feet: "black loafers" };
    // He receives her footjob and holds her ankles: none of it shows his feet.
    for (const [extra, nl] of [
      ["target#footjob", "seated on the bed edge, leaning back on both hands."],
      ["source#holding ankles", "holding both ankles with right hand and insteps with left hand, pressing bare soles against both cheeks."],
      ["kneeling", "right hand loosely gathering both bare ankles against his shoulder."],
      ["target#feet on face", "hands wrapped around both bare ankles. breathing warmly against bare soles."],
    ] as const) {
      const p = actorPrompt(`${man}, ${extra}`, `${suit.top}, 0.3::${suit.bottom}::`, "", nl);
      expect(repairActorPrompt({ ...p, parts: suit, framing: "upper_body" })?.changes ?? []).not.toContain("feet: dropped -> 1 (feet visible)");
    }
    // Done with or to her feet: they show without shoes, so her socks come back and her loafers do not.
    for (const [extra, nl] of [
      ["target#sucking toes", "lying back on the pillows."],
      ["source#footjob", "clamping her arches around him with knees bent high."],
    ] as const) {
      const p = actorPrompt(`${IDENTITY}, ${extra}`, `${UNIFORM.top}, 0.3::${UNIFORM.bottom}::`, "", nl);
      expect(repairActorPrompt({ ...p, parts: UNIFORM, framing: "upper_body" })!.prompt.split("\n")[0]).toBe(
        `${IDENTITY}, ${extra}, ${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}`,
      );
    }
    // Her own boots, on a pedal or pressed on him, are her footwear.
    const boots = { ...UNIFORM, feet: "black combat boots" };
    for (const [extra, nl] of [
      ["sitting", "behind the wheel with one boot resting on the clutch pedal."],
      ["source#trampling", "pressing heavy rubber boot tread flat against the center of his chest."],
      ["sitting", "sitting with spread boots on the metal chair."],
    ] as const) {
      const p = actorPrompt(`${IDENTITY}, ${extra}`, `${UNIFORM.top}, 0.3::${UNIFORM.bottom}::`, "", nl);
      expect(repairActorPrompt({ ...p, parts: boots, framing: "upper_body" })!.changes).toContain("feet: dropped -> 1 (feet visible)");
    }
  });

  test("natural language naming other legwear is rewritten to the registered part; footwear mentions stay", () => {
    const { prompt, segment } = actorPrompt(`${IDENTITY}, standing`, `${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}, ${UNIFORM.feet}`, "", "tugging at her black stockings, reaching into the locker for white sneakers.");
    const r = repairActorPrompt({ prompt, segment, parts: UNIFORM, framing: "full_body" })!;
    expect(r.prompt.split("\n")[1]).toBe("tugging at her white knee-high socks, reaching into the locker for white sneakers.");
    // Another actor's legwear is not hers.
    const his = actorPrompt(`${IDENTITY}, standing`, `${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}, ${UNIFORM.feet}`, "", "staring at his black socks.");
    expect(repairActorPrompt({ ...his, parts: UNIFORM, framing: "full_body" })).toBeNull();
  });

  test("compatible wording is kept", () => {
    const { prompt, segment } = actorPrompt(`${IDENTITY}, standing`, `${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}, ${UNIFORM.feet}`, "", "her white socks slipping down, shoes scuffed.");
    expect(repairActorPrompt({ prompt, segment, parts: UNIFORM, framing: "full_body" })).toBeNull();
  });

  test("explicit crops win: feet out of frame, portrait and other-body-part focus", () => {
    const base = actorPrompt(`${IDENTITY}, standing`, `${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}`, "", "rising on her toes.");
    expect(repairActorPrompt({ ...base, parts: UNIFORM, framing: "feet_out_of_frame" })).toBeNull();
    expect(repairActorPrompt({ ...base, parts: UNIFORM, framing: "", globalPositive: "1girl, feet out of frame, indoors" })).toBeNull();
    const portrait = actorPrompt(`${IDENTITY}, portrait`, UNIFORM.top, "", "crossing her legs.");
    expect(repairActorPrompt({ ...portrait, parts: UNIFORM, framing: "portrait" })).toBeNull();
    const hand = actorPrompt(`${IDENTITY}, hand focus`, UNIFORM.top, "", "her knee brushing his.");
    expect(repairActorPrompt({ ...hand, parts: UNIFORM, framing: "" })).toBeNull();
  });

  test("an unparsable outfit span keeps its structure but still gets natural-language fixes", () => {
    const prompt = `${IDENTITY}, custom outfit tags\ntugging at her black stockings.`;
    const r = repairActorPrompt({ prompt, segment: { start: IDENTITY.length + 2, end: IDENTITY.length + 21 }, parts: UNIFORM, framing: "cowboy_shot" })!;
    expect(r.prompt).toBe(`${IDENTITY}, custom outfit tags\ntugging at her white knee-high socks.`);
  });

  test("unknown outfits and completely nude actors are untouched", () => {
    const { prompt, segment } = actorPrompt(IDENTITY, "completely nude", "", "bare feet on the tiles.");
    expect(repairActorPrompt({ prompt, segment, parts: undefined })).toBeNull();
    expect(repairActorPrompt({ prompt, segment, parts: { top: "completely nude" } })).toBeNull();
  });
});

describe("batch item repair", () => {
  const { prompt, segment } = actorPrompt(`${IDENTITY}, on back, legs up`, `${UNIFORM.top}, 0.3::${UNIFORM.bottom}::`, "", "feet up on the desk.");
  const index = createRunOutfitIndex({});
  index.add("lore:alice", "", "outfit_1", UNIFORM);
  const actors = Object.freeze([Object.freeze({ actorId: "actor_1", actorIndex: 0, identityKey: "lore:alice", selectedFormId: "form_default", selectedOutfitId: "outfit_1", prompt })]);
  const item = {
    sourceImageToken: "tok",
    actors,
    promptPlan: { globalPositive: "1girl, upper body", selectedFraming: "upper_body", characters: [{ actorId: "actor_1", actorIndex: 0, prompt }] },
    promptSegments: { outfits: { actor_1: segment } },
    createNovelAIConfig: (seed: number) => ({ seed, characterPrompts: [{ prompt, uc: "" }] }),
    prepareProviderPrompt: () => ({ globalPositivePrompt: "1girl", characterPrompts: [{ actorIndex: 0, prompt, negativePrompt: "" }] }),
  };

  test("prompt closures, plan and segments follow the repaired prompt; actors keep their identity", () => {
    const logs: string[][] = [];
    const [out] = repairBatchItems([item], index, (l) => logs.push(l.changes)) as [typeof item];
    const repaired = `${IDENTITY}, on back, legs up, ${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}, ${UNIFORM.feet}\nfeet up on the desk.`;
    expect(out.promptPlan.characters[0]!.prompt).toBe(repaired);
    expect(out.createNovelAIConfig(7)).toEqual({ seed: 7, characterPrompts: [{ prompt: repaired, uc: "" }] });
    expect(out.prepareProviderPrompt().characterPrompts[0]!.prompt).toBe(repaired);
    const span = out.promptSegments.outfits.actor_1!;
    expect(repaired.slice(span.start, span.end)).toBe(`${UNIFORM.top}, ${UNIFORM.bottom}, ${UNIFORM.legs}, ${UNIFORM.feet}`);
    expect(out.actors).toBe(actors);
    expect(logs.length).toBe(1);
  });

  test("items without a known outfit, or without an index, are returned as they are", () => {
    const other = { ...item, actors: [{ ...actors[0]!, selectedOutfitId: "unknown" }] };
    expect(repairBatchItems([other], index)[0]).toBe(other);
    expect(repairBatchItems([item], undefined)[0]).toBe(item);
  });

  test("replaceInStrings leaves non-plain objects alone", () => {
    const bytes = new Uint8Array([1, 2]);
    expect(replaceInStrings({ a: ["x y"], b: bytes }, [["x", "z"]])).toEqual({ a: ["z y"], b: bytes });
  });
});

describe("analyzer outfit awareness", () => {
  const index = createRunOutfitIndex(context);
  const build = buildV5AnalyzerRequest({ context: context as never, continuitySnapshot: null, config: { provider: "openai" }, userDirections: {} } as never);
  const messages = buildV5AnalyzerMessages(build.request as never, {}).messages as unknown as Array<{ role: "system" | "user" | "assistant"; content: unknown }>;
  const payloadOf = (ms: typeof messages) => JSON.parse(ms.find((m) => m.role === "user")!.content as string);

  test("the index maps wire IDs and identity keys to parts", () => {
    const original = payloadOf(messages);
    const alice = original.appearance_catalog.find((c: { forms: Array<{ outfits: string[] }> }) => c.forms[0]!.outfits.includes("Navy sailor school uniform"));
    expect(index.wire(alice.candidateKey, "", "Navy sailor school uniform")).toEqual({
      top: "white sailor shirt, navy sailor collar, red neckerchief",
      bottom: "navy pleated skirt",
      legs: "black thighhighs",
      feet: "brown loafers",
    });
    expect(index.parts("lore:alice", "", "outfit_1")?.legs).toBe("black thighhighs");
    expect(index.parts("lore:alice", "form_default", "outfit_1")?.feet).toBe("brown loafers");
  });

  test("adds outfit_parts and the part policy; outfit IDs and the rest of the payload stay", () => {
    const registry = new OutfitIndexRegistry();
    const release = registry.register(index);
    const augmented = augmentV5AnalyzerMessages(messages, (k, f, o) => registry.wire(k, f, o))!;
    release();
    expect(augmented).not.toBeNull();
    const before = payloadOf(messages);
    const after = payloadOf(augmented);
    for (const [i, entry] of before.appearance_catalog.entries()) {
      for (const [j, form] of entry.forms.entries()) {
        const next = after.appearance_catalog[i].forms[j];
        expect(next.outfits).toEqual(form.outfits);
        for (const id of form.outfits) expect(Object.keys(next.outfit_parts ?? {})).toContain(id);
      }
    }
    expect(after.response_contract.analysis_policy.outfits.part_contradiction).toContain("black stockings vs. white knee-high socks");
    expect(after.response_contract.analysis_policy.outfits.existing_match_instruction).toBe(before.response_contract.analysis_policy.outfits.existing_match_instruction);
    expect(after.response_contract.analysis_policy.freeform.clothing_in_natural_language).toBeTruthy();
    expect(after.response_contract.inputDefaults.outfit_parts).toBeTruthy();
    const strip = (p: Record<string, unknown>) => JSON.stringify({ ...p, appearance_catalog: undefined, response_contract: undefined });
    expect(strip(after)).toBe(strip(before));
    expect(augmented.find((m) => m.role === "system")).toBe(messages.find((m) => m.role === "system"));
  });

  test("the compact Argon contract (AM 0.9.91: freeform is one string) keeps upstream's text and gets the clothing rules and the part policy", () => {
    const compact = buildV5AnalyzerMessages(build.request as never, { argonContract: true }).messages as unknown as typeof messages;
    const before = payloadOf(compact).response_contract.analysis_policy;
    expect(typeof before.freeform).toBe("string");
    expect(typeof payloadOf(messages).response_contract.analysis_policy.freeform).toBe("object");
    const augmented = augmentV5AnalyzerMessages(compact, (k, f, o) => index.wire(k, f, o))!;
    const after = payloadOf(augmented).response_contract.analysis_policy;
    expect(after.freeform).toBe(`${before.freeform} ${Object.values(FREEFORM_CLOTHING_POLICY).join(" ")}`);
    expect(after.outfits.part_contradiction).toContain("black stockings vs. white knee-high socks");
    expect(after.outfits.select).toBe(before.outfits.select);
    for (const key of ["evidence", "continuity", "interactions", "frame_placement", "output"]) expect(after[key]).toBe(before[key]);
    // Applying it to an already augmented request adds nothing more.
    expect(payloadOf(augmentV5AnalyzerMessages(augmented, (k, f, o) => index.wire(k, f, o))!).response_contract.analysis_policy.freeform).toBe(after.freeform);
  });

  test("the cache partition the client sends gets the same parts and policy as the flat request", async () => {
    const payload = payloadOf(messages);
    const { analyzer_catalog, response_contract, appearance_catalog, ...live } = payload;
    const system = messages.find((m) => m.role === "system")!;
    const partition = {
      namespace: "test",
      cacheSegments: [
        { kind: "app-static", messages: [system] },
        { kind: "config-static", messages: [{ role: "user", content: `STATIC V5 ANALYZER CONFIG\n${JSON.stringify({ analyzer_catalog, response_contract })}` }] },
        { kind: "outfit-static", messages: [{ role: "user", content: `STATIC V5 APPEARANCE CATALOG\n${JSON.stringify({ appearance_catalog })}` }] },
      ],
      liveMessages: [{ role: "user", content: [{ type: "text", text: `CURRENT V5 ANALYSIS INPUT\n${JSON.stringify(live)}` }, { type: "image_url", image_url: { url: "data:," } }] }],
      // AM 0.9.91 `Vpe`: the transport applies it for Gemini 4 (llm.ts), so augmentation must hand it on untouched.
      prefixPreparation: { staticBlocksInSystem: true, instruction: "I", turns: [{ role: "user", content: 'V5 CACHE PREPARATION\n{"mode":"prepare"}' }, { role: "assistant", content: '{"ready":true}' }] },
    };
    const sent: Array<Record<string, unknown> | undefined> = [];
    const client: AnalyzerClientLike = { complete: async (_c, _ms, o) => (sent.push(o as Record<string, unknown>), { raw: "{}", parsed: {} }) };
    const registry = new OutfitIndexRegistry();
    const release = registry.register(index);
    await withOutfitAwareness(client, registry).complete({}, messages, { cachePartition: partition });
    release();
    const flat = payloadOf(augmentV5AnalyzerMessages(messages, (k, f, o) => index.wire(k, f, o))!);
    const out = sent[0]!.cachePartition as typeof partition;
    const body = (text: string, header: string) => (expect(text.startsWith(`${header}\n`)).toBe(true), JSON.parse(text.slice(header.length + 1)));
    expect(body(out.cacheSegments[1]!.messages[0]!.content as string, "STATIC V5 ANALYZER CONFIG").response_contract).toEqual(flat.response_contract);
    expect(body(out.cacheSegments[2]!.messages[0]!.content as string, "STATIC V5 APPEARANCE CATALOG").appearance_catalog).toEqual(flat.appearance_catalog);
    expect(out.cacheSegments[0]!.messages[0]).toBe(system);
    const liveParts = out.liveMessages[0]!.content as Array<Record<string, unknown>>;
    expect(liveParts[1]).toBe(partition.liveMessages[0]!.content[1]);
    expect(out.namespace).toBe("test");
    expect(out).not.toBe(partition);
    expect(out.prefixPreparation).toBe(partition.prefixPreparation);
    expect(out.liveMessages).toHaveLength(1);
    // Nothing registered: the partition passes through untouched.
    await withOutfitAwareness(client, registry).complete({}, messages, { cachePartition: partition });
    expect(sent[1]!.cachePartition).toBe(partition);
  });

  test("passes requests through when no run is registered or nothing matches", async () => {
    const seen: unknown[] = [];
    const client: AnalyzerClientLike = { complete: async (_c, ms) => (seen.push(ms), { raw: "{}", parsed: {} }) };
    const registry = new OutfitIndexRegistry();
    await withOutfitAwareness(client, registry).complete({}, messages);
    expect(seen[0]).toBe(messages);
    registry.register(createRunOutfitIndex({}));
    await withOutfitAwareness(client, registry).complete({}, messages);
    expect(seen[1]).toBe(messages);
    expect(augmentV5AnalyzerMessages([{ role: "user", content: "plain text" }], () => ({ legs: "x" }))).toBeNull();
  });

  test("array content: only the JSON text part is rewritten", () => {
    const user = messages.find((m) => m.role === "user")!;
    const image = { type: "image_url", image_url: { url: "data:image/png;base64,AA" } };
    const out = augmentV5AnalyzerMessages([{ role: "user", content: [{ type: "text", text: user.content as string }, image] }], (k, f, o) => index.wire(k, f, o))!;
    const parts = out[0]!.content as Array<Record<string, unknown>>;
    expect(parts[1]).toBe(image);
    expect(JSON.parse(parts[0]!.text as string).response_contract.inputDefaults.outfit_parts).toBeTruthy();
  });
});

describe("character analysis outfit evidence", () => {
  const card =
    "Alice is a cheerful second-year student. She wears a navy sailor uniform with a pleated skirt, white knee-high socks and brown loafers. She loves cats.\nOn weekends: a yellow sundress and sandals.";

  test("clothing sentences of a character text", () => {
    expect(clothingSentences(card)).toEqual([
      "She wears a navy sailor uniform with a pleated skirt, white knee-high socks and brown loafers.",
      "On weekends: a yellow sundress and sandals.",
    ]);
    expect(clothingSentences("<p>Likes cats.</p> {{user}} is her friend.")).toEqual([]);
  });

  const request = (mode: string, sections = ["identity", "outfit"]) => [
    { role: "system", content: "SYSTEM" },
    {
      role: "user",
      content: [
        { type: "text", text: JSON.stringify({ characters: [{ analysis_id: "a1", prompt_key: "c1::lore::desc", evidence_mode: mode, output_sections: sections }], response_contract: {} }) },
        { type: "image", data: "AA", mimeType: "image/png" },
      ],
    },
  ];
  type Outfit = Record<string, string>;
  /** Asset-profile answer (`characters[].observations[].outfits[]`) for target a1. */
  const observed = (...outfits: Outfit[]) => ({ characters: [{ analysis_id: "a1", observations: [{ outfits }] }] });
  /** Reference-profile answer (`characters[].outfits[]`) for target a1. */
  const referenced = (...outfits: Outfit[]) => ({ characters: [{ analysis_id: "a1", outfits }] });
  const response = () => observed({ top: "white sailor shirt", bottom: "navy skirt", legs: "bare legs", feet: "barefoot, " }, { top: "completely nude", legs: "", feet: "no shoes" });
  type Sent = Array<{ role: string; content: unknown }>;
  /** A client that answers its calls in order (an Error answer throws). */
  const scripted = (...answers: unknown[]) => {
    const sent: Sent[] = [];
    return {
      sent,
      complete: async (_c: unknown, ms: Sent) => {
        const answer = answers[sent.push(ms) - 1];
        if (answer instanceof Error) throw answer;
        return { raw: "", parsed: answer };
      },
    };
  };
  const evidence = (k: string) => (k === "c1::lore::desc" ? card : undefined);
  const outfitsOf = (parsed: unknown) => {
    const c = (parsed as { characters: Array<{ outfits?: Outfit[]; observations?: Array<{ outfits: Outfit[] }> }> }).characters[0]!;
    return c.outfits ?? c.observations![0]!.outfits;
  };

  test("image-only answer first; empty legs/feet are completed from a second answer that had the text", async () => {
    const withText = observed({ top: "navy sailor uniform", bottom: "pleated skirt", legs: "white knee-high socks", feet: "brown loafers" }, { top: "completely nude", legs: "", feet: "barefoot" });
    const client = scripted(response(), withText);
    const applied: unknown[] = [];
    const ms = request("image");
    const out = await withOutfitEvidence(client, evidence, (info) => applied.push(info)).complete({}, ms, { diagnostic: { analysisKind: "reference-image" } });
    expect(client.sent).toHaveLength(2);
    expect(client.sent[0]).toBe(ms);
    const [system, user] = client.sent[1]!;
    expect(system!.content).toBe(`SYSTEM\n${TEXT_CLOTHING_ADDENDUM}`);
    const payload = JSON.parse((user!.content as Array<{ text: string }>)[0]!.text);
    expect(payload.characters[0].text_clothing_evidence[0]).toContain("white knee-high socks and brown loafers");
    expect((user!.content as unknown[])[1]).toEqual({ type: "image", data: "AA", mimeType: "image/png" });
    expect(applied).toEqual([{ evidenceTargets: 1, completedParts: 2, strippedParts: 3 }]);
    // Shown parts (top, bottom) stay the image-only answer's; the text answer's "barefoot" is absence, not a garment.
    expect(outfitsOf(out.parsed)).toEqual([
      { top: "white sailor shirt", bottom: "navy skirt", legs: "white knee-high socks", feet: "brown loafers" },
      { top: "completely nude", legs: "", feet: "" },
    ]);
  });

  test("legwear the image shows is never replaced by the text's", async () => {
    const client = scripted(referenced({ top: "blazer", legs: "black pantyhose", feet: "" }), referenced({ top: "blazer", legs: "brown pantyhose", feet: "brown loafers" }));
    const applied: unknown[] = [];
    const out = await withOutfitEvidence(client, evidence, (info) => applied.push(info)).complete({}, request("metadata"), { diagnostic: { analysisKind: "character-prompt" } });
    expect(outfitsOf(out.parsed)).toEqual([{ top: "blazer", legs: "black pantyhose", feet: "brown loafers" }]);
    expect(applied).toEqual([{ evidenceTargets: 1, completedParts: 1, strippedParts: 0 }]);
  });

  test("legs under full-length bottoms are not completed", async () => {
    const client = scripted(
      referenced({ top: "lab coat", bottom: "black tight pants, shiny black leggings", legs: "", feet: "" }, { top: "hoodie", bottom: "blue jeans", legs: "", feet: "sneakers" }),
      referenced({ top: "lab coat", bottom: "black pants", legs: "high-waisted black tights", feet: "black heels" }, { top: "hoodie", bottom: "jeans", legs: "white socks", feet: "sneakers" }),
    );
    const applied: unknown[] = [];
    const out = await withOutfitEvidence(client, evidence, (info) => applied.push(info)).complete({}, request("image"), { diagnostic: { analysisKind: "reference-image" } });
    expect(outfitsOf(out.parsed).map((o) => [o.legs, o.feet])).toEqual([
      ["", "black heels"],
      ["", "sneakers"],
    ]);
    expect(applied).toEqual([{ evidenceTargets: 1, completedParts: 1, strippedParts: 0 }]);

    const covered = scripted(referenced({ top: "hoodie", bottom: "grey sweatpants", legs: "", feet: "slippers" }));
    await withOutfitEvidence(covered, evidence).complete({}, request("image"), { diagnostic: { analysisKind: "reference-image" } });
    expect(covered.sent).toHaveLength(1);
  });

  test("no second request when legs and feet are filled, and the image-only answer stands when it fails", async () => {
    const full = scripted(referenced({ top: "blazer", legs: "black pantyhose", feet: "loafers" }));
    const applied: unknown[] = [];
    await withOutfitEvidence(full, evidence, (info) => applied.push(info)).complete({}, request("image"), { diagnostic: { analysisKind: "reference-image" } });
    expect(full.sent).toHaveLength(1);
    expect(applied).toEqual([{ evidenceTargets: 1, completedParts: 0, strippedParts: 0 }]);

    const failing = scripted(referenced({ top: "blazer", legs: "bare legs", feet: "" }), new Error("429"));
    const out = await withOutfitEvidence(failing, evidence).complete({}, request("image"), { diagnostic: { analysisKind: "reference-image" } });
    expect(failing.sent).toHaveLength(2);
    expect(outfitsOf(out.parsed)).toEqual([{ top: "blazer", legs: "", feet: "" }]);
  });

  test("gaps of a target without clothing text do not trigger a second request", async () => {
    const other = { characters: [{ analysis_id: "a2", outfits: [{ top: "hoodie", legs: "", feet: "" }] }] };
    const client = scripted(other);
    await withOutfitEvidence(client, evidence).complete({}, request("image"), { diagnostic: { analysisKind: "character-prompt" } });
    expect(client.sent).toHaveLength(1);
  });

  test("text mode, identity-only targets and other analysis kinds are left alone", async () => {
    const seen: unknown[] = [];
    const client = { complete: async (_c: unknown, ms: unknown) => (seen.push(ms), { raw: "", parsed: response() }) };
    const wrapped = withOutfitEvidence(client, () => card);
    for (const [mode, sections, kind] of [["text", ["outfit"], "character-prompt"], ["image", ["identity"], "character-prompt"], ["image", ["outfit"], "asset-matching"]] as const) {
      const ms = request(mode, [...sections]);
      const before = seen.length;
      const out = await wrapped.complete({}, ms, { diagnostic: { analysisKind: kind } });
      expect(seen.length - before).toBe(1);
      expect(seen.at(-1)).toBe(ms);
      if (kind === "asset-matching") expect(outfitsOf(out.parsed)[0]!.legs).toBe("bare legs");
    }
  });

  test("stripAbsenceFromAnalysis covers both response shapes and counts what it changed", () => {
    const parsed = response();
    expect(stripAbsenceFromAnalysis(parsed)).toBe(3);
    expect(stripAbsenceFromAnalysis(parsed)).toBe(0);
    const reference = referenced({ top: "shirt", legs: "bare legs, black thighhighs", feet: "barefoot" });
    expect(stripAbsenceFromAnalysis(reference)).toBe(2);
    expect(outfitsOf(reference)).toEqual([{ top: "shirt", legs: "black thighhighs", feet: "" }]);
  });
});

describe("prepared outfits", () => {
  test("absence parts are dropped from proposals; completely nude stays", () => {
    const actors = [
      { requestKey: "a1", identityKey: "lore:alice", formId: "form_default", proposal: { name: "Bed", top: "white sailor shirt", legs: "bare legs", feet: "barefoot" } },
      { requestKey: "a2", identityKey: "lore:bob", proposal: { name: "Nude", top: "completely nude" } },
      { requestKey: "a3", identityKey: "lore:bob", selectedOutfitId: "o" },
    ];
    const out = withoutAbsenceProposals(actors) as typeof actors;
    expect(out[0]!.proposal).toEqual({ name: "Bed", top: "white sailor shirt", legs: "", feet: "" });
    expect(out[1]).toBe(actors[1]);
    expect(out[2]).toBe(actors[2]);
  });

  test("prepared outfits join the run index", () => {
    const index = createRunOutfitIndex({});
    recordPreparedOutfits(index, [{ requestKey: "a1", identityKey: "lore:alice", formId: "form_default" }], {
      a1: { id: "outfit_new", formId: "form_default", parts: [{ part: "top", prompt: "grey hoodie" }, { part: "legs", prompt: "black pantyhose" }] },
    });
    expect(index.parts("lore:alice", "form_default", "outfit_new")).toEqual({ top: "grey hoodie", legs: "black pantyhose" });
  });
});

describe("same outfit in other words", () => {
  const apron = { head: "white headdress", top: "emerald bib apron over white blouse", bottom: "black pleated skirt", legs: "white thighhighs", feet: "black loafers" };
  const combat = { head: "olive helmet with goggles", top: "blue combat shirt, dark plate carrier", bottom: "camouflage cargo pants" };

  test("garment phrases: nouns, colors and details", () => {
    expect(partGarments("emerald bib apron over white blouse")).toEqual([
      { noun: "apron", colors: ["green"] },
      { noun: "blouse", colors: ["white"] },
    ]);
    expect(partGarments("faded navy pullover hoodie with pouch pocket").map((g) => g.noun)).toEqual(["hoodie"]);
    expect(partGarments("black dresses, brown loafers, 0.3::grey trousers::").map((g) => g.noun)).toEqual(["dress", "loafer", "pants"]);
  });

  test("rewordings, shades and left-out details are the same outfit", () => {
    expect(sameOutfit(apron, { ...apron, top: "green cafe apron over white frilled blouse" })).toBe(true);
    expect(sameOutfit(combat, { head: "olive helmet", top: "blue combat shirt, olive plate carrier", bottom: "woodland camouflage cargo trousers" })).toBe(true);
    expect(sameOutfit({ top: "faded navy pullover hoodie with pouch pocket" }, { top: "faded navy hoodie" })).toBe(true);
    // A proposal may leave out legs or feet (cropped away); the registered outfit completes them.
    expect(sameOutfit(apron, { head: apron.head, top: apron.top, bottom: "black pleated miniskirt" })).toBe(true);
  });

  test("changed garments, colors or added parts are a new outfit", () => {
    expect(sameOutfit(apron, { ...apron, top: "white blouse" })).toBe(false);
    expect(sameOutfit(apron, { ...apron, bottom: "red pleated skirt" })).toBe(false);
    expect(sameOutfit(apron, { ...apron, legs: "black stockings" })).toBe(false);
    expect(sameOutfit(apron, { ...apron, legs: "white knee-high socks" })).toBe(false);
    expect(sameOutfit({ top: "grey hoodie" }, { top: "grey sweater" })).toBe(false);
    expect(sameOutfit({ top: "grey hoodie" }, { top: "grey hoodie", legs: "black pantyhose" })).toBe(false);
    expect(sameOutfit({ top: "school uniform", bottom: "skirt" }, { top: "school uniform" })).toBe(false);
    // A dropped accessory, and a shade word are no match either.
    expect(sameOutfit({ head: "black leather collar", bottom: "grey boxer shorts" }, { bottom: "grey boxer shorts" })).toBe(false);
    expect(sameOutfit({ bottom: "dark gray cotton boxer shorts" }, { bottom: "black cotton boxer shorts" })).toBe(false);
    // Absence is no garment: socks added to a "bare legs" outfit make a new outfit.
    expect(sameOutfit({ ...apron, legs: "bare legs" }, { ...apron, legs: "white thighhighs" })).toBe(false);
  });

  test("proposals select a registered look-alike or merge with an earlier one", () => {
    const registered = new Map<string, Array<[string, Record<string, string>]>>([["lore:alice\0form_default", [["outfit_maid", apron]]]]);
    const index = { outfits: (k: string, f: string) => registered.get(`${k}\0${f}`) ?? [] } as unknown as RunOutfitIndex;
    const actor = (requestKey: string, proposal: Record<string, string>, extra: Record<string, unknown> = {}) => ({
      requestKey,
      identityKey: "lore:alice",
      formId: "form_default",
      kind: "character",
      selectedOutfitId: "",
      proposal,
      ...extra,
    });
    const hoodie = { name: "Grey Hoodie", top: "grey hoodie", bottom: "black shorts" };
    const reuses: unknown[] = [];
    const out = reuseSameOutfits(
      index,
      [
        actor("a1", { name: "Green Apron", ...apron, top: "green cafe apron over white blouse" }),
        actor("a2", hoodie),
        actor("a3", { name: "Grey Pullover Hoodie", top: "grey pullover hoodie", bottom: "black shorts" }),
        actor("a4", { name: "Red Dress", top: "red dress" }),
        actor("a5", hoodie, { selectedOutfitId: "outfit_maid" }),
      ],
      (r) => reuses.push(r),
    ) as Array<Record<string, unknown>>;
    expect(out[0]).toEqual({ requestKey: "a1", identityKey: "lore:alice", formId: "form_default", kind: "character", selectedOutfitId: "outfit_maid" });
    expect(out[2]!.proposal).toBe(hoodie);
    expect(out[3]!.proposal).toEqual({ name: "Red Dress", top: "red dress" });
    expect(out[4]!.selectedOutfitId).toBe("outfit_maid");
    expect(reuses).toEqual([
      { identityKey: "lore:alice", proposal: "Green Apron", reused: "outfit_maid" },
      { identityKey: "lore:alice", proposal: "Grey Pullover Hoodie", reused: "Grey Hoodie" },
    ]);
  });
});
