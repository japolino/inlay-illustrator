/**
 * RPC handlers owned by the `analysis` module: workspace load, roster, recognition keys, custom characters, prompts tab,
 * assets / picker, analysis jobs, unique tags, outfit images. Logic lives in src/backend/analysis/*.
 * Snapshot-returning writes reload the workspace after the write (AM re-projects the workspace on every config change).
 */
import type { CustomCharacter } from "../../../shared/contract/index.js";
import { fail } from "../errors.js";
import type { HandlerGroup, RpcContext } from "../types.js";
import {
  applyUniqueTags,
  createCustomCharacterEntry,
  loadWorkspaceSnapshot,
  promoteCustomCharacters,
  removeCustomCharacterEntry,
  saveForms,
  setAnalyzeEnabled,
  setCustomCharactersRegistered,
  setCustomCharactersWorkspaceEnabled,
  setFramingWeights,
  setRecognitionKeys,
  setReferenceEnabled,
  setRosterActive,
  setRosterRegistered,
  setSeed,
  setSourceConnected,
  updateCustomCharacterEntry,
} from "../../analysis/workspace.js";
import { assetUrl, clearMetadataRecords, clearSelections, inspectMetadata, listAssets, saveCrop, setReference, setSelection, uploadAsset } from "../../analysis/assets.js";
import type { AnalysisController } from "../../analysis/index.js";

function analysis(ctx: RpcContext): AnalysisController {
  const module = (ctx.modules as { analysis?: AnalysisController }).analysis;
  if (!module) fail("internal", "The analysis module is not running.");
  return module;
}

function requireId(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) fail("bad-request", `${name} is required.`);
  return value;
}

/** Optional document revision guard sent by the UI (`baseUpdatedAt`, not in the contract params yet). */
function base(params: unknown): string | undefined {
  const v = (params as { baseUpdatedAt?: unknown }).baseUpdatedAt;
  return typeof v === "string" && v ? v : undefined;
}

export const workspaceHandlers: HandlerGroup = {
  /* workspace / roster */
  "workspace.load": (p, ctx) => loadWorkspaceSnapshot(ctx, requireId(p.characterId, "characterId"), { reload: p.reload === true }),
  "roster.setRegistered": async (p, ctx) => {
    await setRosterRegistered(ctx, requireId(p.characterId, "characterId"), p.items ?? [], p.registered === true);
    return loadWorkspaceSnapshot(ctx, p.characterId);
  },
  "roster.setActive": async (p, ctx) => {
    await setRosterActive(ctx, requireId(p.characterId, "characterId"), p.items ?? [], p.active === true);
    return loadWorkspaceSnapshot(ctx, p.characterId);
  },
  "roster.setSourceConnected": async (p, ctx) => {
    await setSourceConnected(ctx, requireId(p.characterId, "characterId"), requireId(p.worldBookId, "worldBookId"), p.connected === true);
    return loadWorkspaceSnapshot(ctx, p.characterId);
  },
  "recognitionKeys.set": async (p, ctx) => {
    await setRecognitionKeys(ctx, requireId(p.characterId, "characterId"), requireId(p.promptKey, "promptKey"), Array.isArray(p.keys) ? p.keys : []);
    return loadWorkspaceSnapshot(ctx, p.characterId);
  },

  /* custom characters */
  "customCharacters.create": async (p, ctx) => {
    const character: CustomCharacter = await createCustomCharacterEntry(ctx, requireId(p.characterId, "characterId"), p.input ?? { title: "", recognitionKeys: "" }, base(p));
    return { character, snapshot: await loadWorkspaceSnapshot(ctx, p.characterId) };
  },
  "customCharacters.update": async (p, ctx) => {
    const character = await updateCustomCharacterEntry(ctx, requireId(p.characterId, "characterId"), requireId(p.customId, "customId"), p.input ?? { title: "", recognitionKeys: "" }, base(p));
    return { character, snapshot: await loadWorkspaceSnapshot(ctx, p.characterId) };
  },
  "customCharacters.remove": async (p, ctx) => {
    await removeCustomCharacterEntry(ctx, requireId(p.characterId, "characterId"), requireId(p.customId, "customId"), base(p));
    return loadWorkspaceSnapshot(ctx, p.characterId);
  },
  "customCharacters.setRosterRegistered": async (p, ctx) => {
    await setCustomCharactersRegistered(ctx, requireId(p.characterId, "characterId"), p.customIds, p.registered === true);
    return loadWorkspaceSnapshot(ctx, p.characterId);
  },
  "customCharacters.setWorkspaceEnabled": async (p, ctx) => {
    await setCustomCharactersWorkspaceEnabled(ctx, requireId(p.characterId, "characterId"), p.customIds, p.enabled === true);
    return loadWorkspaceSnapshot(ctx, p.characterId);
  },
  "customCharacters.promote": async (p, ctx) => {
    await promoteCustomCharacters(ctx, requireId(p.characterId, "characterId"), p.customIds);
    return loadWorkspaceSnapshot(ctx, p.characterId);
  },

  /* prompts tab */
  "prompts.saveForms": (p, ctx) => saveForms(ctx, requireId(p.characterId, "characterId"), requireId(p.promptKey, "promptKey"), p.collection, String(p.baseRevision ?? "")),
  "prompts.setReferenceEnabled": async (p, ctx) => {
    await setReferenceEnabled(ctx, requireId(p.characterId, "characterId"), p.promptKeys ?? [], p.enabled === true, p.formId);
    return loadWorkspaceSnapshot(ctx, p.characterId);
  },
  "prompts.setAnalyzeEnabled": async (p, ctx) => {
    await setAnalyzeEnabled(ctx, requireId(p.characterId, "characterId"), p.promptKeys ?? [], p.enabled === true);
    return loadWorkspaceSnapshot(ctx, p.characterId);
  },
  "prompts.setSeed": async (p, ctx) => {
    await setSeed(ctx, requireId(p.characterId, "characterId"), requireId(p.promptKey, "promptKey"), String(p.seed ?? ""), p.fixed === true);
    return { ok: true };
  },
  "prompts.setFramingWeights": async (p, ctx) => {
    await setFramingWeights(ctx, requireId(p.characterId, "characterId"), p.weights ?? {});
    return { ok: true };
  },

  /* assets / picker */
  "assets.list": (p, ctx) => listAssets(ctx, { ...p, characterId: requireId(p.characterId, "characterId") }),
  "assets.setSelection": async (p, ctx) => {
    await setSelection(ctx, requireId(p.characterId, "characterId"), requireId(p.promptKey, "promptKey"), p.assets ?? []);
    return { ok: true };
  },
  "assets.clearSelections": async (p, ctx) => {
    await clearSelections(ctx, requireId(p.characterId, "characterId"), p.promptKeys);
    return { ok: true };
  },
  "assets.setReference": async (p, ctx) => {
    if (!p.target || typeof p.target !== "object") fail("bad-request", "target is required.");
    await setReference(ctx, p.target, p.asset ?? null);
    return { ok: true };
  },
  "assets.inspectMetadata": (p, ctx) => inspectMetadata(ctx, requireId(p.characterId, "characterId"), p.asset),
  "assets.clearMetadataRecords": async (p, ctx) => {
    await clearMetadataRecords(ctx, requireId(p.characterId, "characterId"), p.assetNames);
    return { ok: true };
  },
  "assets.upload": (p, ctx) => uploadAsset(ctx, p),
  "assets.saveCrop": (p, ctx) => saveCrop(ctx, { ...p, characterId: requireId(p.characterId, "characterId") }),
  "assets.getUrl": (p, ctx) => assetUrl(ctx, p.asset),

  /* analysis jobs */
  "analysis.start": (p, ctx) => analysis(ctx).start(p),
  "analysis.cancel": (p, ctx) => {
    analysis(ctx).cancel({ ...(p.jobId ? { jobId: p.jobId } : {}), ...(p.kind ? { kind: p.kind } : {}) });
    return { ok: true };
  },
  "analysis.listActive": (_p, ctx) => ({ jobs: analysis(ctx).listActive() }),
  "uniqueTags.apply": async (p, ctx) => {
    await applyUniqueTags(ctx, requireId(p.characterId, "characterId"), p.choices ?? []);
    return { ok: true };
  },

  /* outfit / reference images */
  "outfitImage.generate": (p, ctx) => analysis(ctx).outfitImages.generate(p),
  "outfitImage.history": (p, ctx) => analysis(ctx).outfitImages.history(p),
  "outfitImage.save": (p, ctx) => analysis(ctx).outfitImages.save(p),
};
