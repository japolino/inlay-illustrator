import { describe, expect, test } from "bun:test";
import { CHARACTER_DESCRIPTION_LORE_ID as DESC, createEmptyCharacterDocument, type CharacterDocument, type CustomCharacter } from "../../shared/contract/index.js";
import { createSourcesService } from "../services/sources.js";
import { createFakeHost } from "../testing/fake-host.js";
import { createFakeServices } from "../testing/fake-services.js";
import { dedupeGroupCast, type GroupCastMember } from "./group-cast.js";
import { createPipelineModule } from "./index.js";
import { createFakeEngine, finished, waitFor } from "./testing/fixtures.js";

const CHAT = "band-chat";
const customId = (n: number) => `character_00000000-0000-4000-8000-00000000000${n}`;
const custom = (n: number, title: string): CustomCharacter => ({ id: customId(n), title, recognitionKeys: [title], appearanceDescription: `${title} look.` });

function docWith(id: string, registered: string[]): CharacterDocument {
  const doc = createEmptyCharacterDocument(id);
  doc.characterPrompt.selectedLorebooks[id] = registered;
  return doc;
}

/**
 * Three cards of one band, as users build them: Alice's and Bob's cards register each other in their own lorebooks,
 * Bob's card also holds custom copies, and Carol's card registers nothing of its own. Lumiverse names group messages with
 * the cards' display names.
 */
function band() {
  const fake = createFakeHost();
  fake.addCharacter({ id: "alice", name: "Alice Liddell || Wonderland", description: "Singer with black hair.", world_book_ids: ["ab"], extensions: { alternate_character_name: "Alice" } });
  fake.addCharacter({ id: "bob", name: "Bob Stone || Wonderland", description: "Tall guitarist.", world_book_ids: ["bb"], extensions: { alternate_character_name: "Bob" } });
  fake.addCharacter({ id: "carol", name: "Carol Reed || Wonderland", description: "Youngest, plays bass.", extensions: { alternate_character_name: "Carol" } });
  fake.addWorldBook({ id: "ab", name: "Alice book" }, [
    { id: "ab-bob", comment: "Bob Stone", content: "Bob is tall." },
    { id: "ab-carol", comment: "Carol Reed", content: "Carol is young." },
    { id: "ab-duo", comment: "Bob / Carol", content: "Their duet costume." },
    { id: "ab-dana", comment: "Dana", key: ["Dana"], content: "Dana is a fan." },
  ]);
  fake.addWorldBook({ id: "bb", name: "Bob book" }, [
    { id: "bb-alice", comment: "Alice", key: ["Alice"], content: "Alice sings." },
    { id: "bb-carol", comment: "Carol", key: ["Carol"], content: "Carol plays bass." },
  ]);
  fake.addChat({ id: CHAT, character_id: "alice", metadata: { group: true, character_ids: ["alice", "bob", "carol"] } }, [
    { id: "u1", content: "We get on the bus.", is_user: true },
    { id: "m1", name: "Bob", content: "Bob tuned his guitar while Alice warmed up her voice.\n\nCarol swept the floor of the bus, humming." },
  ]);
  const docs: Record<string, CharacterDocument> = {
    alice: docWith("alice", [DESC, "ab:ab-bob", "ab:ab-carol", "ab:ab-duo", "ab:ab-dana"]),
    bob: docWith("bob", [DESC, "bb:bb-alice", "bb:bb-carol"]),
    carol: docWith("carol", []),
  };
  docs.bob!.customCharacters = [custom(1, "Alice Liddell"), custom(2, "Carol Reed"), custom(3, "Dana"), { ...custom(4, "Bob Stone"), workspaceEnabled: false }];
  return { fake, docs };
}

async function castOf(order: string[], docs: Record<string, CharacterDocument>, fake = band().fake) {
  const sources = createSourcesService({ host: fake.host, userId: fake.userId });
  const members: GroupCastMember[] = [];
  for (const id of order) members.push({ id, character: await sources.getCharacter(id), source: await sources.buildSource(id, docs[id]!, { chatId: CHAT }), document: docs[id]! });
  return { members, cast: dedupeGroupCast(members) };
}
const loreIds = (cast: ReturnType<typeof dedupeGroupCast>, id: string) => cast.sources.find((s) => s.id === id)!.members[0]!.lorebooks.map((l) => l.id).sort();

describe("group chat cast", () => {
  test("one entry per group member: its own card when it registers itself, else the first copy; other people stay", async () => {
    const { fake, docs } = band();
    const { cast } = await castOf(["bob", "alice", "carol"], docs, fake);
    // Bob's card: its copy of Alice goes (Alice's card registers its description); its copy of Carol stays, the first one.
    expect(loreIds(cast, "bob")).toEqual([DESC, "bb:bb-carol"].sort());
    // Alice's card: its copies of Bob and Carol go; the duo entry (two members) and Dana (not a member) stay.
    expect(loreIds(cast, "alice")).toEqual([DESC, "ab:ab-duo", "ab:ab-dana"].sort());
    // Carol's own description is not registered, so it is no "own entry"; it stays in the source as plain lore.
    expect(loreIds(cast, "carol")).toEqual([DESC]);
    // Custom copies of Alice and Carol go; Dana and the inactive Bob copy are not touched.
    expect(cast.customCharacters.map((c) => c.title)).toEqual(["Dana", "Bob Stone"]);
    expect(cast.dropped.map((d) => `${d.cardId}:${d.title}->${d.memberId}`).sort()).toEqual(
      ["bob:Alice->alice", "alice:Bob Stone->bob", "alice:Carol Reed->carol", "bob:Alice Liddell->alice", "bob:Carol Reed->carol"].sort(),
    );
  });

  test("a member whose own entry is off in the roster keeps the first copy instead", async () => {
    const { fake, docs } = band();
    docs.bob!.characterPrompt.workspaceDisabledLorebooks.bob = [DESC];
    const { cast } = await castOf(["carol", "alice", "bob"], docs, fake);
    // Alice's copy of Bob is now his only active entry; Carol's first copy is on Alice's card (Carol, Alice, Bob order).
    expect(loreIds(cast, "alice")).toEqual([DESC, "ab:ab-dana", "ab:ab-carol", "ab:ab-bob", "ab:ab-duo"].sort());
    expect(loreIds(cast, "bob")).toEqual([DESC]);
    expect(cast.dropped.map((d) => `${d.cardId}:${d.title}`).sort()).toEqual(["bob:Alice", "bob:Alice Liddell", "bob:Carol", "bob:Carol Reed"].sort());
  });

  test("solo chats and casts without copies are returned as they are", async () => {
    const { fake, docs } = band();
    const solo = await castOf(["bob"], docs, fake);
    expect(solo.cast.sources[0]).toBe(solo.members[0]!.source);
    expect(solo.cast.dropped).toEqual([]);
    docs.alice!.characterPrompt.selectedLorebooks.alice = [DESC];
    docs.bob!.characterPrompt.selectedLorebooks.bob = [DESC];
    docs.bob!.customCharacters = [];
    const clean = await castOf(["bob", "alice"], docs, fake);
    expect(clean.cast.sources.map((s, i) => s === clean.members[i]!.source)).toEqual([true, true]);
  });

  test("group chat run: the speaker is found by display name and the analyzer gets one candidate per person", async () => {
    const { fake, docs } = band();
    fake.activeChatId = CHAT;
    const fx = createFakeServices({ host: fake.host, userId: fake.userId, config: { image: { provider: "novelai", model: "nai-diffusion-4-5-full", connectionId: "img-1" } } });
    for (const [id, doc] of Object.entries(docs)) fx.documents.set(id, doc);
    fx.services.sources = createSourcesService({ host: fake.host, userId: fake.userId, storage: fx.services.storage, log: fx.services.log });
    const engine = createFakeEngine();
    const { pipeline } = createPipelineModule(fx.services, undefined, { engine });
    try {
      const { jobId } = await pipeline.start({ chatId: CHAT, messageId: "m1", swipeIndex: 0 });
      await waitFor(() => finished(fx, jobId).length > 0);
      const run = engine.runs[0]!;
      expect(run.context.ownerCharacterId).toBe("bob");
      const context = (run.input as any).analyzerInput.context;
      expect(context.cacheSourceId).toBe("bob");
      expect(context.actorCandidates.map((c: any) => c.key).sort()).toEqual(
        [`bob::lore::${DESC}`, "bob::lore::bb:bb-carol", `alice::lore::${DESC}`, "alice::lore::ab:ab-duo", "alice::lore::ab:ab-dana", customId(3)].sort(),
      );
      // Bob's and Alice's descriptions answer to the display names written in the story.
      const hints = context.candidateSlots.flatMap((s: any) => s.actor_hints ?? []);
      expect(hints).toContain(`bob::lore::${DESC}`);
      expect(hints).toContain(`alice::lore::${DESC}`);
    } finally {
      pipeline.dispose();
    }
  });
});
