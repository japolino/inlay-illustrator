import { describe, expect, test } from "bun:test";
import type { RosterItem } from "../../shared/contract/index.js";
import { parseProfileRequest, rowFor, sharedProfilesChannel, staleRequestMade, wantedEndpoint } from "./shared-profiles.js";

const row = (title: string, extra: Partial<RosterItem> = {}): RosterItem =>
  ({ promptKey: `k:${title}`, kind: "lore", memberKey: "m", selectionId: title, title, keys: [], primaryKeys: [], secondaryKeys: [], recognitionKeys: [], content: "", score: 0, registered: false, workspaceEnabled: false, mainPrompt: "", analyzeEnabled: true, selectedAssetCount: 0, thumbnailUrl: null, ...extra }) as RosterItem;

describe("shared profiles", () => {
  test("channels: the owner's endpoint and the reader's request", () => {
    expect(sharedProfilesChannel("U1")).toBe("profiles.u1");
    expect(sharedProfilesChannel(undefined)).toBe("profiles.owner");
    expect(wantedEndpoint("gambit", "u1")).toBe("gambit.inlay.wanted.u1");
  });

  test("a request is validated and capped", () => {
    expect(parseProfileRequest(null)).toBeNull();
    expect(parseProfileRequest({ version: 2, characterId: "abc", people: [{ name: "A" }] })).toBeNull();
    expect(parseProfileRequest({ version: 1, characterId: "bad id", people: [{ name: "A" }] })).toBeNull();
    expect(parseProfileRequest({ version: 1, characterId: "ABC-1", people: [{ name: "  Wren  ", aliases: ["W", 3], description: "a  red scarf" }, { name: "" }] })).toEqual({
      version: 1,
      characterId: "abc-1",
      people: [{ name: "Wren", aliases: ["W"], description: "a red scarf" }],
    });
  });

  test("a profile made without the lorebook gives way to the entry, unless someone has edited it", () => {
    const roster = [row("\u2764 Wren Ashby"), row("Corvin", { kind: "custom" })];
    const wren = { name: "Wren Ashby", description: "Wren Ashby: a clerk." };
    const made = { id: "c1", title: "Wren Ashby", appearanceDescription: "Wren Ashby: a clerk." };
    const edited = { id: "c2", title: "Wren Ashby", appearanceDescription: "Wren Ashby: a clerk with a red scarf." };
    expect(staleRequestMade([made, edited], roster, [wren]).map((c) => c.id)).toEqual(["c1"]);
    // A newer request says more than the older one did: it's still what a request wrote.
    expect(staleRequestMade([made, edited], roster, [{ name: "Wren Ashby", description: "Wren Ashby: a clerk. From the story: ink on her cuffs." }]).map((c) => c.id)).toEqual(["c1"]);
    // Nobody in the lorebooks: the custom character is all they have.
    expect(staleRequestMade([{ id: "c3", title: "Corvin", appearanceDescription: "Corvin: a monk." }], roster, [{ name: "Corvin", description: "Corvin: a monk." }])).toEqual([]);
    // No description to compare: it can't be told apart from one a person wrote.
    expect(staleRequestMade([made], roster, [{ name: "Wren Ashby" }])).toEqual([]);
  });

  test("a person is found by title, then keys, then the title's first word; profiled rows win ties", () => {
    const roster = [row("Wren Ashby"), row("The Manor", { keys: ["wren"] }), row("Corvin", { kind: "custom" }), row("Corvin", { mainPrompt: "corvin (original)" }), row("Card", { kind: "description" })];
    expect(rowFor(roster, { name: "Wren" })?.title).toBe("The Manor");
    expect(rowFor([row("Wren Ashby")], { name: "Wren" })?.title).toBe("Wren Ashby");
    expect(rowFor(roster, { name: "corvin" })?.mainPrompt).toBe("corvin (original)");
    expect(rowFor(roster, { name: "Card" })).toBeNull();
    expect(rowFor(roster, { name: "Nobody", aliases: ["Lord Corvin"] })).toBeNull();
  });
});
