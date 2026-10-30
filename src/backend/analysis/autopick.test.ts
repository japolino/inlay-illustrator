import { describe, expect, test } from "bun:test";
import { createEmptyCharacterDocument, deleteOutfit, proposedParts, resolveCharacterForms, type AutoPickTags } from "../../shared/contract/index.js";
import type { AmSource, CharacterImageAsset, LlmCompleteRequest } from "../services/types.js";
import { AnalysisJobs } from "./jobs.js";
import { AUTOPICK_PATH, applyAutoPick, dedupeParts, getAutoPick, namedAssets, outfitText, readAutoPickState, representativeScore, runOutfitAutoPick } from "./autopick.js";
import { ALICE, BOB, CHAR, asset, buildTestSource, createAnalysisFixture, lore } from "./testing/fixtures.js";
import { projectRoster } from "./workspace.js";

const NAMES = [
  "alice_uniform_neutral.webp", "alice_uniform_angry.webp", "alice_uniform_smile.webp", "alice_uniform_cowgirl_orgasm.webp",
  "alice_dress_happy.webp", "alice_dress_default.webp",
  "alice_nude_neutral.webp",
  "bob_suit_neutral.png", "bob_suit_angry.png",
  "Town Square.webp", "icon_1.png",
];

function images(names = NAMES): CharacterImageAsset[] {
  return names.map((n) => {
    const a = asset(n);
    return { asset: a, kind: "original", origin: "risu-asset", imageId: a.key, name: n, url: `/img/${a.key}`, thumbnailUrl: `/img/${a.key}?size=sm` };
  });
}

function source(): AmSource {
  const s = buildTestSource();
  s.members[0]!.lorebooks = [
    lore("e1", "Alice", ["alice"], "Alice has long red hair.\n- Uniform: white sailor shirt, navy pleated skirt, white knee socks, brown loafers\n- Dress: a yellow sundress"),
    lore("e2", "Bob", ["bob"], "Bob is a tall man. He wears a grey suit and black shoes."),
    lore("e3", "Alice Attire", [], "suit: not relevant\nuniform (winter): add black tights"),
  ];
  return s;
}

function fixture(names = NAMES) {
  const fx = createAnalysisFixture({ sources: { buildSource: async () => source() } });
  fx.characterImages[CHAR] = images(names);
  return fx;
}

const SCHEME = {
  regex: "^(?<character>[a-z]+)_(?<outfit>[a-z]+)_(?:(?<pose>cowgirl|missionary)_(?<state>orgasm|cum)|(?<expression>[a-z ]+))$",
  single_character_key: "",
  character_aliases: { alice: ALICE, bob: BOB, ghost: "not-a-key" },
  notes: "character_outfit_expression",
};

const run = (fx: ReturnType<typeof fixture>, params: Record<string, unknown>) =>
  new AnalysisJobs(fx.services).start("outfit-autopick", CHAR, (ctx) => runOutfitAutoPick(ctx, { kind: "outfit-autopick", characterId: CHAR, ...params }, { retryDelaysMs: [0, 0, 0] })).done;

describe("outfit auto-picker: plan", () => {
  test("only the card's own named images, extension removed", () => {
    const list = [...images(["a_b_c.webp", "a_b_c.avif.avif"]), { ...images(["g.png"])[0]!, origin: "gallery" as const }, { ...images(["x.png"])[0]!, kind: "chat" as const }];
    expect(namedAssets(list).map((a) => a.stem)).toEqual(["a_b_c"]);
  });

  test("representatives: marker words and calm expressions first, scenes and nudity words last", () => {
    const score = (stem: string, expression: string) => representativeScore(stem, { expression }, false);
    expect(score("x_default", "default")).toBeLessThan(score("x_neutral", "neutral"));
    expect(score("x_neutral", "neutral")).toBeLessThan(score("x_smile", "smile"));
    expect(score("x_smile", "smile")).toBeLessThan(score("x_doggystyle", "doggystyle"));
    // A two-word expression is ranked as itself: a forced or seductive smile is no calm smile.
    expect(score("x_indifferent", "indifferent")).toBeLessThan(score("x_forced smile", "forced smile"));
    expect(score("x_indifferent", "indifferent")).toBeLessThan(score("x_seductive smile", "seductive smile"));
    expect(score("x_light smile", "light smile")).toBeLessThan(score("x_smile", "smile"));
    expect(representativeScore("x_nude", {}, false)).toBeGreaterThan(50);
    expect(representativeScore("x_nude", {}, true)).toBeLessThan(50);
  });

  test("one naming call groups every image by character and outfit; scenes never represent an outfit", async () => {
    const fx = fixture();
    fx.llmReplies.push(SCHEME);
    const out = await run(fx, { autopick: { phase: "plan" } });
    expect(out.status).toBe("success");
    expect(fx.llmRequests).toHaveLength(1);
    const sent = JSON.parse(fx.llmRequests[0]!.messages[1]!.content as string);
    expect(sent.sample_names).toContain("alice_uniform_neutral");
    expect(sent.roster.map((r: { prompt_key: string }) => r.prompt_key)).toContain(ALICE);
    const state = await readAutoPickState(fx.services, CHAR);
    expect(state.scheme?.coverage).toBeCloseTo(9 / 11);
    expect(state.scheme?.aliases).toEqual({ alice: ALICE, bob: BOB });
    expect(state.unmatched.sort()).toEqual(["Town Square", "icon_1"]);
    const by = Object.fromEntries(state.groups.map((g) => [`${g.promptKey === ALICE ? "alice" : "bob"}/${g.outfit}`, g]));
    expect(Object.keys(by).sort()).toEqual(["alice/dress", "alice/nude", "alice/uniform", "bob/suit"]);
    expect(by["alice/uniform"]!.assetCount).toBe(4);
    expect(by["alice/uniform"]!.candidates.map((c) => c.name)).toEqual(["alice_uniform_neutral", "alice_uniform_smile", "alice_uniform_angry"]);
    expect(by["alice/dress"]!.candidates[0]!.name).toBe("alice_dress_default");
    expect(by["alice/nude"]!.nude).toBe(true);
  });

  test("a low-coverage scheme gets one refinement call with the unmatched names", async () => {
    const fx = fixture();
    fx.llmReplies.push({ ...SCHEME, regex: "^(?<character>bob)_(?<outfit>[a-z]+)_(?<expression>[a-z]+)$" }, SCHEME);
    const out = await run(fx, { autopick: { phase: "plan" } });
    expect(out.status).toBe("success");
    expect(fx.llmRequests).toHaveLength(2);
    const second = JSON.parse(fx.llmRequests[1]!.messages[1]!.content as string);
    expect(second.previous_attempt.problem).toMatch(/matched 18%/);
    expect(second.previous_attempt.unmatched_sample).toContain("alice_uniform_neutral");
    expect((await readAutoPickState(fx.services, CHAR)).scheme?.calls).toBe(2);
  });

  test("a regex with escaped underscores, which unicode mode rejects, still groups the images", async () => {
    const regex = SCHEME.regex.replaceAll("_", String.raw`\_`);
    expect(() => new RegExp(regex, "iu")).toThrow();
    expect(() => new RegExp(regex, "i")).not.toThrow();
    const fx = fixture();
    fx.llmReplies.push({ ...SCHEME, regex });
    const out = await run(fx, { autopick: { phase: "plan" } });
    expect(out.status).toBe("success");
    expect(fx.llmRequests).toHaveLength(1);
    const state = await readAutoPickState(fx.services, CHAR);
    expect(state.scheme?.regex).toBe(regex);
    expect(state.scheme?.coverage).toBeCloseTo(9 / 11);
    expect(state.groups.map((g) => g.outfit).sort()).toEqual(["dress", "nude", "suit", "uniform"]);
  });

  test("a regex with an escaped apostrophe (Kael'is-style names) still groups the images", async () => {
    const regex = String.raw`^(?<character>[\w\']+)\.(?<outfit>\w+)\.(?<expression>\w+)$`;
    expect(() => new RegExp(regex, "iu")).toThrow();
    const fx = fixture(["Al'ice.uniform.neutral.webp", "Al'ice.uniform.bored.webp", "Al'ice.nude.bored.webp", "Bo'b.suit.neutral.webp"]);
    fx.llmReplies.push({ ...SCHEME, regex, character_aliases: { "al'ice": ALICE, "bo'b": BOB } });
    const out = await run(fx, { autopick: { phase: "plan" } });
    expect(out.status).toBe("success");
    const state = await readAutoPickState(fx.services, CHAR);
    expect(state.scheme?.coverage).toBe(1);
    expect(state.groups.map((g) => `${g.promptKey === ALICE ? "alice" : "bob"}/${g.outfit}`).sort()).toEqual(["alice/nude", "alice/uniform", "bob/suit"]);
  });

  test("an unusable scheme is no-evidence; 429s are retried", async () => {
    const fx = fixture();
    fx.llmReplies.push(new Error("Vertex AI generate failed (429): Resource exhausted"), { regex: "(unclosed", character_aliases: {} }, { regex: "^(?<who>x)$" });
    const out = await run(fx, { autopick: { phase: "plan" } });
    expect(out.status).toBe("no-evidence");
    expect(fx.llmRequests).toHaveLength(3);
  });

  test("re-planning keeps tags of images that are still candidates", async () => {
    const fx = fixture();
    fx.llmReplies.push(SCHEME);
    await run(fx, { autopick: { phase: "plan" } });
    const state = await readAutoPickState(fx.services, CHAR);
    const tags: AutoPickTags = { candidate: 1, framing: "cowboy shot", nude: false, explicit: false, legsVisible: false, feetVisible: false, label: "Sailor", outfit: { head: "", top: "white sailor shirt", bottom: "navy skirt", legs: "", feet: "" }, textLegs: "", textFeet: "", taggedAt: "" };
    await fx.services.storage.writeJson(AUTOPICK_PATH(CHAR), { ...state, groups: state.groups.map((g) => (g.outfit === "uniform" ? { ...g, tags } : g)) });
    fx.characterImages[CHAR] = images(NAMES.filter((n) => n !== "alice_uniform_neutral.webp"));
    fx.llmReplies.push(SCHEME);
    await run(fx, { autopick: { phase: "plan" } });
    const uniform = (await readAutoPickState(fx.services, CHAR)).groups.find((g) => g.outfit === "uniform")!;
    expect(uniform.candidates[0]!.name).toBe("alice_uniform_smile");
    expect(uniform.tags?.candidate).toBe(0);
  });
});

describe("outfit auto-picker: tag", () => {
  test("each garment stays in one part: one-pieces top, separate bottoms bottom, hosiery legs, footwear feet", () => {
    const parts = (p: Partial<Record<"head" | "top" | "bottom" | "legs" | "feet", string>>) => ({ head: "", top: "", bottom: "", legs: "", feet: "", ...p });
    // Live argon output for a sportswear sprite: the leggings are the bottom.
    expect(dedupeParts(parts({ top: "black cropped tank top", bottom: "white striped leggings, black jacket tied around waist", legs: "white striped leggings" })))
      .toEqual(parts({ top: "black cropped tank top", bottom: "white striped leggings, black jacket tied around waist" }));
    // A leotard repeated as bottom stays in top; the pantyhose stay in legs.
    expect(dedupeParts(parts({ top: "pink bunny leotard, white collar", bottom: "pink bunny leotard", legs: "sheer white pantyhose" })))
      .toEqual(parts({ top: "pink bunny leotard, white collar", legs: "sheer white pantyhose" }));
    // Tights under a skirt are hosiery; boots are footwear even when tagged on the legs too.
    expect(dedupeParts(parts({ bottom: "black skirt, black tights", legs: "black tights" }))).toEqual(parts({ bottom: "black skirt", legs: "black tights" }));
    expect(dedupeParts(parts({ legs: "black thighhigh boots", feet: "black thigh-high boots" }))).toEqual(parts({ feet: "black thigh-high boots" }));
    expect(dedupeParts(parts({ legs: "white socks", feet: "white socks, brown loafers" }))).toEqual(parts({ legs: "white socks", feet: "brown loafers" }));
    // Different garments are left alone.
    const different = parts({ bottom: "black leggings", legs: "white leggings", feet: "black boots" });
    expect(dedupeParts(different)).toEqual(different);
  });

  test("outfit text: own lines naming the outfit, then entries titled after the character, else clothing sentences", () => {
    const roster = projectRoster(source(), createEmptyCharacterDocument(CHAR, new Date(0)));
    const group = (promptKey: string, outfit: string) => ({ id: "", promptKey, characterToken: "", outfit, nude: false, assetCount: 1, candidates: [] });
    expect(outfitText(group(ALICE, "uniform"), roster)).toBe("Uniform: white sailor shirt, navy pleated skirt, white knee socks, brown loafers\nuniform (winter): add black tights");
    expect(outfitText(group(BOB, "suit"), roster)).toBe("Bob is a tall man. He wears a grey suit and black shoes.");
    expect(outfitText(group(BOB, ""), roster)).toBe("He wears a grey suit and black shoes.");
  });

  test("each sheet is one call; image garments and text legwear are stored apart, and the image wins", async () => {
    const fx = fixture();
    fx.llmReplies.push(SCHEME);
    await run(fx, { autopick: { phase: "plan" } });
    const state = await readAutoPickState(fx.services, CHAR);
    const uniform = state.groups.find((g) => g.outfit === "uniform")!;
    const suit = state.groups.find((g) => g.outfit === "suit")!;
    let request: LlmCompleteRequest | null = null;
    fx.llmReplies.push((r: LlmCompleteRequest) => {
      request = r;
      return {
        tiles: [
          { n: 1, framing: "cowboy shot", legs_visible: false, feet_visible: false, nude: false, explicit: false, outfit: { top: "white sailor shirt", bottom: "navy pleated skirt", legs: "" }, text_legs: "white knee socks", text_feet: "brown loafers", label: "Sailor Uniform" },
          { n: 2, framing: "full body", legs_visible: true, feet_visible: true, outfit: { top: "grey suit jacket", bottom: "grey trousers", feet: "brown shoes" }, text_legs: "", text_feet: "black shoes", label: "Grey Suit" },
        ],
      };
    });
    const out = await run(fx, { autopick: { phase: "tag", sheets: [{ image: "AAAA", mimeType: "image/jpeg", tiles: [{ groupId: uniform.id, candidate: 0 }, { groupId: suit.id, candidate: 1 }, { groupId: "gone", candidate: 0 }] }] } });
    expect(out.status).toBe("success");
    const user = request!.messages[1]!.content as Array<{ type: string; text?: string; data?: string }>;
    expect(user[1]).toEqual({ type: "image", data: "AAAA", mime_type: "image/jpeg" } as never);
    const listing = JSON.parse(user[0]!.text!);
    expect(listing.tile_count).toBe(3);
    expect(listing.tiles.map((t: { n: number }) => t.n)).toEqual([1, 2]);
    expect(listing.tiles[0]).toMatchObject({ character: "Alice", outfit_name: "uniform" });
    expect(listing.tiles[0].outfit_text).toContain("white knee socks");
    const after = await readAutoPickState(fx.services, CHAR);
    const u = after.groups.find((g) => g.id === uniform.id)!.tags!;
    const s = after.groups.find((g) => g.id === suit.id)!.tags!;
    expect(s.candidate).toBe(1);
    expect(proposedParts(u)).toEqual({ parts: { head: "", top: "white sailor shirt", bottom: "navy pleated skirt", legs: "white knee socks", feet: "brown loafers" }, fromText: ["legs", "feet"] });
    // Feet are visible (brown shoes): the text's black shoes never replace them.
    expect(proposedParts(s).parts.feet).toBe("brown shoes");
    expect(proposedParts(s).fromText).toEqual([]);
    // A garment the image already shows in another part is not added again from the text.
    const boots = { ...u, outfit: { ...u.outfit, legs: "black thighhigh boots" }, textLegs: "", textFeet: "black thigh-high boots" };
    expect(proposedParts(boots)).toMatchObject({ parts: { legs: "black thighhigh boots", feet: "" }, fromText: [] });
  });

  test("a sheet that keeps failing is reported, the others are kept", async () => {
    const fx = fixture();
    fx.llmReplies.push(SCHEME);
    await run(fx, { autopick: { phase: "plan" } });
    const g = (await readAutoPickState(fx.services, CHAR)).groups[0]!;
    const err = new Error("Vertex AI generate failed (429): Resource exhausted");
    fx.llmReplies.push(err, err, err, err, { tiles: [{ n: 1, outfit: { top: "t" }, label: "L" }] });
    const sheet = { image: "AA", mimeType: "image/jpeg", tiles: [{ groupId: g.id, candidate: 0 }] };
    const out = await run(fx, { autopick: { phase: "tag", sheets: [sheet, sheet] } });
    expect(out.status).toBe("partial");
    expect(out.message).toMatch(/1 sheet\(s\) failed/);
    expect((await readAutoPickState(fx.services, CHAR)).groups[0]!.tags?.label).toBe("L");
  });
});

describe("outfit auto-picker: apply and get", () => {
  async function planned() {
    const fx = fixture();
    fx.llmReplies.push(SCHEME);
    await run(fx, { autopick: { phase: "plan" } });
    return { fx, state: await readAutoPickState(fx.services, CHAR) };
  }

  test("accepted groups fill the empty default outfit, then add outfits with the reference image; existing references are skipped", async () => {
    const { fx, state } = await planned();
    const uniform = state.groups.find((g) => g.outfit === "uniform")!;
    const dress = state.groups.find((g) => g.outfit === "dress")!;
    const parts = { head: "", top: "white sailor shirt", bottom: "navy skirt", legs: "white knee socks", feet: "brown loafers" };
    const first = await applyAutoPick(fx.services, { characterId: CHAR, items: [{ groupId: uniform.id, candidate: 0, label: "Sailor Uniform", parts }, { groupId: dress.id, candidate: 1, label: "", parts: { ...parts, top: "yellow sundress", bottom: "" } }] });
    expect(first).toMatchObject({ added: 2, skipped: 0 });
    const forms = resolveCharacterForms(fx.documents.get(CHAR)!.characterPrompt, ALICE);
    const outfits = forms.forms[0]!.outfits;
    expect(outfits.map((o) => o.label)).toEqual(["Sailor Uniform", "dress"]);
    expect(outfits[0]).toMatchObject({ ...parts, referenceEnabled: true, candidateEnabled: true, sourceAssetName: "alice_uniform_neutral.webp" });
    expect(outfits[0]!.referenceAsset?.name).toBe("alice_uniform_neutral.webp");
    expect(outfits[1]!.referenceAsset?.name).toBe(dress.candidates[1]!.asset.name);
    expect(first.state.groups.find((g) => g.id === uniform.id)!.appliedOutfitId).toBe(outfits[0]!.id);
    const again = await applyAutoPick(fx.services, { characterId: CHAR, items: [{ groupId: uniform.id, candidate: 0, label: "Again", parts }] });
    expect(again).toMatchObject({ added: 0, skipped: 1 });
    expect(resolveCharacterForms(fx.documents.get(CHAR)!.characterPrompt, ALICE).forms[0]!.outfits).toHaveLength(2);
  });

  test("characters seen in the chat's images", async () => {
    const { fx } = await planned();
    await fx.services.storage.writeJson("chats/chat-1/pipeline.json", { records: { r1: { actors: [{ identityKey: BOB, promptKey: BOB }, { identityKey: "other::lore::x" }] } } });
    const got = await getAutoPick(fx.services, { characterId: CHAR, chatId: "chat-1" });
    expect(got.seenPromptKeys).toEqual([BOB]);
    expect(got.state.groups.length).toBe(4);
    expect((await getAutoPick(fx.services, { characterId: CHAR })).seenPromptKeys).toEqual([]);
  });

  test("an added outfit that is gone from the document (deleted, character reset) is no longer reported as added", async () => {
    const { fx, state } = await planned();
    const uniform = state.groups.find((g) => g.outfit === "uniform")!;
    const dress = state.groups.find((g) => g.outfit === "dress")!;
    const parts = { head: "", top: "white sailor shirt", bottom: "navy skirt", legs: "", feet: "" };
    const first = await applyAutoPick(fx.services, { characterId: CHAR, items: [{ groupId: uniform.id, candidate: 0, label: "Sailor Uniform", parts }, { groupId: dress.id, candidate: 0, label: "", parts }] });
    const ids = Object.fromEntries(first.state.groups.map((g) => [g.id, g.appliedOutfitId]));
    await fx.services.storage.updateCharacterDocument(CHAR, (doc) => {
      const collection = resolveCharacterForms(doc.characterPrompt, ALICE);
      return { ...doc, characterPrompt: { ...doc.characterPrompt, characterForms: { [ALICE]: deleteOutfit(collection, collection.forms[0]!.id, ids[dress.id]!) } } };
    });
    const applied = async () => Object.fromEntries((await getAutoPick(fx.services, { characterId: CHAR })).state.groups.filter((g) => g.id === uniform.id || g.id === dress.id).map((g) => [g.outfit, g.appliedOutfitId ?? null]));
    expect(await applied()).toEqual({ uniform: ids[uniform.id]!, dress: null });
    // Without the document no outfit exists, even when an autopick.json was left behind.
    await fx.services.storage.resetCharacter(CHAR);
    expect(await applied()).toEqual({ uniform: null, dress: null });
  });

  test("nothing to add is a bad request", async () => {
    const { fx } = await planned();
    await expect(applyAutoPick(fx.services, { characterId: CHAR, items: [{ groupId: "nope", candidate: 0, label: "", parts: { head: "", top: "", bottom: "", legs: "", feet: "" } }] })).rejects.toThrow(/No outfit to add/);
  });
});
