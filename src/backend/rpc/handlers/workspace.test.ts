import { describe, expect, test } from "bun:test";
import { createAnalysisModule } from "../../analysis/index.js";
import { ALICE, BOB, CHAR, createAnalysisFixture } from "../../analysis/testing/fixtures.js";
import type { RpcContext } from "../types.js";
import { RpcFailure } from "../errors.js";
import { workspaceHandlers as h } from "./workspace.js";

function context(overrides: Parameters<typeof createAnalysisFixture>[0] = {}) {
  const fx = createAnalysisFixture(overrides);
  const modules = createAnalysisModule(fx.services);
  const ctx = { ...fx.services, modules } as unknown as RpcContext;
  return { fx, ctx, modules };
}

const WORKSPACE_METHODS = [
  "workspace.load", "roster.setRegistered", "roster.setActive", "roster.setSourceConnected", "recognitionKeys.set",
  "customCharacters.create", "customCharacters.update", "customCharacters.remove", "customCharacters.setRosterRegistered", "customCharacters.setWorkspaceEnabled", "customCharacters.promote",
  "prompts.saveForms", "prompts.setReferenceEnabled", "prompts.setAnalyzeEnabled", "prompts.setSeed", "prompts.setFramingWeights",
  "assets.list", "assets.setSelection", "assets.clearSelections", "assets.setReference", "assets.inspectMetadata", "assets.clearMetadataRecords", "assets.upload", "assets.saveCrop", "assets.getUrl",
  "analysis.start", "analysis.cancel", "analysis.listActive", "uniqueTags.apply",
  "outfitImage.generate", "outfitImage.history", "outfitImage.save",
];

describe("workspace handler group", () => {
  test("covers exactly the analysis-owned methods", () => {
    expect(Object.keys(h).sort()).toEqual([...WORKSPACE_METHODS].sort());
  });

  test("roster + custom character round trip returns snapshots", async () => {
    const { ctx } = context();
    let snap = await h["roster.setRegistered"]!({ characterId: CHAR, items: [{ memberKey: CHAR, selectionId: "wb1:e1" }], registered: true }, ctx);
    expect(snap.roster.find((r) => r.promptKey === ALICE)?.registered).toBe(true);
    const created = await h["customCharacters.create"]!({ characterId: CHAR, input: { title: "Carol", recognitionKeys: "carol" } }, ctx);
    expect(created.snapshot.roster.some((r) => r.promptKey === created.character.id && r.kind === "custom")).toBe(true);
    snap = await h["customCharacters.setRosterRegistered"]!({ characterId: CHAR, customIds: "all", registered: false }, ctx);
    expect(snap.roster.find((r) => r.promptKey === created.character.id)?.registered).toBe(false);
    const error = await (async () => h["workspace.load"]!({ characterId: "" }, ctx))().catch((e) => e);
    expect((error as RpcFailure).error.code).toBe("bad-request");
  });

  test("assets.list pages candidates and originals; selection marks items", async () => {
    const { ctx } = context();
    await h["roster.setRegistered"]!({ characterId: CHAR, items: [{ memberKey: CHAR, selectionId: "wb1:e1" }, { memberKey: CHAR, selectionId: "wb1:e2" }], registered: true }, ctx);
    const candidates = await h["assets.list"]!({ characterId: CHAR, promptKey: ALICE, filter: "candidate" }, ctx);
    expect(candidates.items.map((i) => i.asset.name).sort()).toEqual(["alice_angry.png", "alice_smile.png"]);
    expect(candidates.items.every((i) => i.candidate && i.thumbnailUrl.startsWith("/thumb/"))).toBe(true);
    await h["assets.setSelection"]!({ characterId: CHAR, promptKey: ALICE, assets: [{ name: "alice_smile.png", key: "img-alice_smile.png", ext: "png" }] }, ctx);
    const all = await h["assets.list"]!({ characterId: CHAR, promptKey: ALICE, filter: "all", limit: 2 }, ctx);
    expect(all.total).toBe(4);
    expect(all.items).toHaveLength(2);
    expect(all.nextCursor).toBe("2");
    const page2 = await h["assets.list"]!({ characterId: CHAR, promptKey: ALICE, filter: "all", limit: 2, cursor: all.nextCursor }, ctx);
    expect(page2.nextCursor).toBeNull();
    const selected = [...all.items, ...page2.items].filter((i) => i.selected).map((i) => i.asset.name);
    expect(selected).toEqual(["alice_smile.png"]);
    const bob = await h["assets.list"]!({ characterId: CHAR, promptKey: BOB, filter: "candidate" }, ctx);
    expect(bob.items.map((i) => i.asset.name)).toEqual(["bob_default.png"]);
    await h["assets.clearSelections"]!({ characterId: CHAR }, ctx);
    const after = await h["workspace.load"]!({ characterId: CHAR }, ctx);
    expect(after.roster.find((r) => r.promptKey === ALICE)?.selectedAssetCount).toBe(0);
  });

  test("assets.setReference writes form reference and the artist extraction asset", async () => {
    const { ctx, fx } = context();
    await h["assets.setReference"]!({ target: { kind: "character-form", characterId: CHAR, promptKey: ALICE, formId: "form_default" }, asset: { name: "alice_smile.png", key: "img-alice_smile.png", ext: "png" } }, ctx);
    const forms = fx.documents.get(CHAR)!.characterPrompt.characterForms[ALICE]!;
    expect(forms.forms[0]!.reference?.defaultAsset?.key).toBe("img-alice_smile.png");
    await h["assets.setReference"]!({ target: { kind: "artist-extraction", characterId: CHAR }, asset: { name: "bob_default.png", key: "img-bob_default.png", ext: "png" } }, ctx);
    expect(fx.documents.get(CHAR)!.characterPrompt.artistExtractionAssetBySourceId[CHAR]?.key).toBe("img-bob_default.png");
  });

  test("uploads fall back to extension storage; crops are stored and readable", async () => {
    const { ctx, fx } = context();
    const png = "iVBORw0KGgo=";
    const up = await h["assets.upload"]!({ characterId: CHAR, fileName: "ref.png", mimeType: "image/png", dataBase64: png }, ctx);
    expect(up.asset.sourceType).toBe("upload");
    const crop = await h["assets.saveCrop"]!({ characterId: CHAR, asset: up.asset, cropRect: { x: 0, y: 0, width: 1, height: 1 }, sourceSize: { width: 2, height: 2 }, dataBase64: png }, ctx);
    const ref = crop.asset.cropReference as { assetKey: string; assetName: string };
    expect(ref.assetName).toMatch(/^__asset_maid_crop_.*\.png$/);
    expect([...fx.binary.keys()].some((k) => k.startsWith(`characters/${CHAR}/reference-crops/`))).toBe(true);
    const url = await h["assets.getUrl"]!({ asset: { ...crop.asset, key: ref.assetKey } }, ctx);
    expect(url.url.startsWith("data:image/png;base64,") || url.url.length > 0).toBe(true);
  });

  test("analysis.start: unsupported kinds, job listing and finish event", async () => {
    const { ctx, fx, modules } = context();
    const error = await (async () => h["analysis.start"]!({ kind: "unique-tag-search", characterId: CHAR }, ctx))().catch((e) => e);
    expect((error as RpcFailure).error.code).toBe("unsupported");
    const { jobId } = await h["analysis.start"]!({ kind: "representative-pick", characterId: CHAR }, ctx);
    expect((await h["analysis.listActive"]!({} as never, ctx)).jobs.some((j) => j.jobId === jobId)).toBe(true);
    await modules.analysis.wait(jobId);
    const fin = fx.events.find((e) => e.event === "analysis.finished")!.payload as { jobId: string; status: string };
    expect(fin.jobId).toBe(jobId);
    modules.analysis.dispose();
  });

  test("representative pick adds one default-outfit image per registered character (AM sve)", async () => {
    const { ctx, fx, modules } = context();
    await h["roster.setRegistered"]!({ characterId: CHAR, items: [{ memberKey: CHAR, selectionId: "wb1:e1" }, { memberKey: CHAR, selectionId: "wb1:e2" }], registered: true }, ctx);
    const { jobId } = await h["analysis.start"]!({ kind: "representative-pick", characterId: CHAR }, ctx);
    await modules.analysis.wait(jobId);
    const fin = fx.events.find((e) => e.event === "analysis.finished")!.payload as { status: string; message: string };
    expect(fin.status).toBe("success");
    expect(fin.message).toMatch(/^Added 2 images for 2 people/);
    const sel = fx.documents.get(CHAR)!.characterPrompt.assetSelections;
    expect(sel[BOB]?.selectedAssets.map((a) => a.name)).toEqual(["bob_default.png"]);
    expect(sel[ALICE]?.selectedAssets).toHaveLength(1);
  });
});
