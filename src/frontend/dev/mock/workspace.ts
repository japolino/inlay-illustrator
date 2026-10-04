/**
 * Dev mock handlers for the workspace tabs (assets, picker, crops, metadata, analysis jobs, prompts/forms,
 * artists, personas, outfit images). Owner: workspace-tabs sub-agent. Data lives in the shared MockDb;
 * area-private state goes to `db.extra.workspace`.
 */
import {
  addOutfit,
  assetIdentity,
  formCollectionRevision,
  listNovelAIArtists,
  normalizeAssetRef,
  normalizeFormCollection,
  patchForm,
  patchOutfit,
  personaPromptKey,
  resolveCharacterForms,
  resolvePersonaForms,
  toStoredAssetRef,
  type AssetRef,
  type FormCollection,
  type StoredAssetRef
} from "../../../shared/contract/character.js";
import type {
  AnalysisKind,
  AnalysisStartParams,
  AssetFilter,
  AssetListItem,
  JobStatus,
  OutfitImageResult,
  OutfitImageTarget,
  PersonaSummary,
  ProgressInfo,
  RowNotice
} from "../../../shared/contract/rpc.js";
import type { MockContext, MockHandlers } from "../mock-backend.js";
import { buildSnapshot } from "./core.js";
import { documentFor, findCharacter, svgImage, type MockDb } from "./fixtures.js";

interface MockJob { jobId: string; kind: AnalysisKind; characterId: string; status: JobStatus; progress: ProgressInfo; cancelled: boolean }
interface WorkspaceMockState {
  jobs: Record<string, MockJob>;
  uploads: Record<string, AssetListItem[]>;
  outfitHistory: Record<string, OutfitImageResult[]>;
  /** Step duration of simulated jobs (ms, before timeScale). */
  jobStepMs: number;
  jobSteps: number;
  seq: number;
}

/** Area state inside the shared db (scenes may tune `jobStepMs`). */
export function workspaceMockState(db: MockDb): WorkspaceMockState {
  return ((db.extra.workspace as WorkspaceMockState | undefined) ??= { jobs: {}, uploads: {}, outfitHistory: {}, jobStepMs: 600, jobSteps: 5, seq: 0 });
}

function allAssets(db: MockDb, characterId: string): AssetListItem[] {
  const state = workspaceMockState(db);
  return [...(findCharacter(db, characterId)?.assets ?? []), ...(state.uploads[characterId] ?? [])];
}

function findAssetItem(db: MockDb, asset: AssetRef | StoredAssetRef): AssetListItem | undefined {
  const id = assetIdentity(asset);
  for (const c of db.characters) {
    const hit = allAssets(db, c.summary.characterId).find((item) => assetIdentity(item.asset) === id);
    if (hit) return hit;
  }
  for (const list of Object.values(workspaceMockState(db).uploads)) {
    const hit = list.find((item) => assetIdentity(item.asset) === id);
    if (hit) return hit;
  }
  return undefined;
}

function candidateWords(db: MockDb, characterId: string, promptKey?: string): string[] {
  if (!promptKey) return [];
  const snapshot = buildSnapshot(db, characterId);
  const row = snapshot.roster.find((r) => r.promptKey === promptKey);
  if (!row) return [];
  return [...row.recognitionKeys, ...row.title.split(/[\s()]+/u)].map((w) => w.toLowerCase()).filter((w) => w.length >= 2);
}

function matchesFilter(item: AssetListItem, filter: AssetFilter, words: string[]): boolean {
  const candidate = words.some((w) => item.asset.name.toLowerCase().includes(w.replace(/\s+/gu, "")) || item.asset.name.toLowerCase().includes(w));
  switch (filter) {
    case "candidate": return candidate && item.kind === "original";
    case "chat": return item.kind === "chat";
    case "outfit": return item.kind === "outfit";
    case "original": return item.kind === "original";
    case "generated": return item.kind !== "original";
    default: return true;
  }
}

function touchDoc(ctx: MockContext, characterId: string, reason: string): void {
  const doc = documentFor(ctx.db, characterId);
  doc.updatedAt = new Date().toISOString();
  ctx.emit("document.changed", { characterId, updatedAt: doc.updatedAt, reason });
}

function personaForms(db: MockDb, personaId: string): FormCollection {
  return resolvePersonaForms(db.config.characterPrompt.personaSettings, db.config.characterPrompt.personaGender, personaId);
}
function setPersonaForms(db: MockDb, personaId: string, collection: FormCollection): void {
  const settings = db.config.characterPrompt.personaSettings;
  settings.profiles[personaId] = { ...(settings.profiles[personaId] ?? {}), forms: collection };
}

function characterForms(db: MockDb, characterId: string, promptKey: string): FormCollection {
  return resolveCharacterForms(documentFor(db, characterId).characterPrompt, promptKey);
}
function setCharacterForms(db: MockDb, characterId: string, promptKey: string, collection: FormCollection): void {
  documentFor(db, characterId).characterPrompt.characterForms[promptKey] = normalizeFormCollection(collection);
}

function personaSummaries(db: MockDb): PersonaSummary[] {
  return db.personas.map((p) => ({
    personaId: p.personaId,
    name: p.name,
    avatarUrl: p.avatarUrl,
    description: p.description,
    isActive: p.personaId === db.activePersonaId,
    isBound: p.personaId === db.activePersonaId && !!db.status.activeChatId,
    profile: db.config.characterPrompt.personaSettings.profiles[p.personaId] ?? null,
    forms: personaForms(db, p.personaId)
  }));
}

function targetKey(target: OutfitImageTarget, formId: string, outfitId?: string): string {
  return target.kind === "character" ? `c:${target.characterId}:${target.promptKey}:${formId}:${outfitId ?? ""}` : `p:${target.personaId}:${formId}:${outfitId ?? ""}`;
}

const ANALYSIS_TEXT: Record<AnalysisKind, { running: string; done: string }> = {
  "character-prompts": { running: "Prompt AI analysis", done: "Prompt analysis complete" },
  references: { running: "Prompt image AI analysis", done: "Reference analysis complete" },
  persona: { running: "Persona image analysis", done: "Persona analysis complete" },
  "asset-matching": { running: "Classifying assets", done: "Asset classification complete" },
  "metadata-check": { running: "Checking meta", done: "Meta check complete" },
  "artist-extraction": { running: "AI analyzing artist prompt", done: "Artist prompt extraction complete" },
  reclassification: { running: "AI reclassifying", done: "AI reclassification complete" },
  "unique-tag-search": { running: "Searching unique tags", done: "Unique tag search complete" },
  "representative-pick": { running: "Picking representative images", done: "Representative images picked" },
  "charx-regex": { running: "Analyzing charx regex", done: "charx regex analysis complete" }
};

/** Effects of a finished analysis on the mock data. Returns the finished message. */
function applyAnalysis(ctx: MockContext, params: AnalysisStartParams): { message: string; rows: RowNotice[] } {
  const { db } = ctx;
  const doc = documentFor(db, params.characterId);
  const cp = doc.characterPrompt;
  const keys = params.promptKeys ?? [];
  const rows: RowNotice[] = [];
  switch (params.kind) {
    case "character-prompts":
    case "references": {
      let filled = 0;
      for (const key of keys) {
        const collection = characterForms(db, params.characterId, key);
        const form = collection.forms.find((f) => f.id === collection.defaultFormId)!;
        if (!Object.keys(form.basePromptGroups).length) {
          setCharacterForms(db, params.characterId, key, patchForm(collection, form.id, { basePromptGroups: { "hair.color": ["brown hair"], "hair.length": ["long hair"], "eyes.color": ["brown eyes"] } }));
          filled += 1;
          rows.push({ promptKey: key, status: "success", outfitCount: 1 });
        } else rows.push({ promptKey: key, status: params.kind === "references" ? "success" : "no_evidence" });
      }
      return { message: `${ANALYSIS_TEXT[params.kind].done} · ${keys.length} characters · no info ${keys.length - filled}`, rows };
    }
    case "persona":
      return { message: `Persona analysis complete · ${params.personaIds?.length ?? 0} prompts · 0 outfits · no info 0`, rows };
    case "representative-pick": {
      let images = 0;
      const names: string[] = [];
      const snapshot = buildSnapshot(db, params.characterId);
      for (const key of keys) {
        const words = candidateWords(db, params.characterId, key);
        const current = cp.assetSelections[key]?.selectedAssets ?? [];
        const pick = allAssets(db, params.characterId).find((item) => matchesFilter(item, "candidate", words) && !current.some((c) => assetIdentity(c) === assetIdentity(item.asset)));
        if (!pick) continue;
        const next = [...current, toStoredAssetRef(pick.asset)];
        cp.assetSelections[key] = { selectedAssets: next, selectedAssetNames: next.map((a) => a.name) };
        images += 1;
        names.push(snapshot.roster.find((r) => r.promptKey === key)?.title ?? key);
      }
      const text = images > 0 ? `Added ${images} images to ${names.length} people · ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}` : "No representative image to add · 0 candidates with unclear outfit";
      return { message: text, rows };
    }
    case "artist-extraction": {
      const list = db.config.characterPrompt.artistPrompts as unknown as Record<string, unknown>[];
      const id = `artist_${Date.now().toString(36)}`;
      list.push({ id, title: "Extracted style", prompt: "artist:example, 1.2::painterly::", negativePrompt: "", origin: "analysis", sourceName: findCharacter(db, params.characterId)?.summary.name ?? "" });
      cp.selectedArtistId = id;
      return { message: "Artist prompt extraction complete · Extracted style", rows };
    }
    case "metadata-check":
      return { message: "Meta check complete · 3/9", rows };
    case "asset-matching":
      return { message: `Asset classification complete · ${keys.length} prompts · 0 rules · no body identity evidence 0`, rows };
    default:
      return { message: ANALYSIS_TEXT[params.kind].done, rows };
  }
}

async function runJob(ctx: MockContext, job: MockJob, params: AnalysisStartParams): Promise<void> {
  const state = workspaceMockState(ctx.db);
  const total = Math.max(1, params.promptKeys?.length ?? params.personaIds?.length ?? state.jobSteps);
  const steps = state.jobSteps;
  const label = ANALYSIS_TEXT[job.kind].running;
  const rowsRunning: RowNotice[] = (params.promptKeys ?? []).map((promptKey) => ({ promptKey, status: "running" }));
  // Let the start response reach the client before the first progress event.
  await ctx.delay(250);
  for (let step = 0; step <= steps; step += 1) {
    if (job.cancelled) break;
    job.status = "running";
    const done = Math.round((step / steps) * total);
    job.progress = { label: `${label} · ${total} characters`, done, total, fraction: step / steps };
    ctx.emit("analysis.progress", { jobId: job.jobId, kind: job.kind, characterId: job.characterId, status: "running", progress: job.progress, rows: rowsRunning });
    await ctx.delay(state.jobStepMs);
  }
  if (job.cancelled) {
    job.status = "cancelled";
    ctx.emit("analysis.finished", { jobId: job.jobId, kind: job.kind, characterId: job.characterId, status: "cancelled", message: `${ANALYSIS_LABEL_CANCEL[job.kind] ?? "Analysis cancelled"}` });
    return;
  }
  const { message, rows } = applyAnalysis(ctx, params);
  job.status = "success";
  ctx.emit("analysis.progress", { jobId: job.jobId, kind: job.kind, characterId: job.characterId, status: "success", progress: { label: message, done: total, total, fraction: 1 }, rows });
  ctx.emit("analysis.finished", { jobId: job.jobId, kind: job.kind, characterId: job.characterId, status: "success", message });
  touchDoc(ctx, job.characterId, `analysis:${job.kind}`);
}
const ANALYSIS_LABEL_CANCEL: Partial<Record<AnalysisKind, string>> = {
  "character-prompts": "Prompt analysis cancelled",
  persona: "Persona analysis cancelled",
  references: "Reference analysis cancelled",
  "asset-matching": "Asset classification cancelled",
  "metadata-check": "Meta check cancelled",
  "artist-extraction": "Artist prompt extraction cancelled"
};

function assetFromStored(db: MockDb, stored: StoredAssetRef | null): StoredAssetRef | null {
  if (!stored) return null;
  const hit = findAssetItem(db, stored);
  return hit ? { ...toStoredAssetRef(hit.asset), ...(stored.cropReference ? { cropReference: stored.cropReference } : {}) } : stored;
}

export function workspaceMockHandlers(): MockHandlers {
  return {
    /* assets / picker */
    "assets.list": ({ characterId, promptKey, filter, metadataOnly, cursor, limit }, { db }) => {
      const words = candidateWords(db, characterId, promptKey);
      const items = allAssets(db, characterId)
        .filter((item) => matchesFilter(item, filter, words) && (!metadataOnly || item.hasMetadata))
        .map((item) => ({ ...item, candidate: matchesFilter(item, "candidate", words) }));
      const start = Number(cursor ?? 0) || 0;
      const size = limit ?? 30;
      return { items: items.slice(start, start + size), nextCursor: start + size < items.length ? String(start + size) : null, total: items.length };
    },
    "assets.setSelection": ({ characterId, promptKey, assets }, ctx) => {
      const cp = documentFor(ctx.db, characterId).characterPrompt;
      cp.assetSelections[promptKey] = { selectedAssets: assets, selectedAssetNames: assets.map((a) => a.name) };
      touchDoc(ctx, characterId, "asset-selection");
      return { ok: true };
    },
    "assets.clearSelections": ({ characterId, promptKeys }, ctx) => {
      const cp = documentFor(ctx.db, characterId).characterPrompt;
      for (const key of promptKeys ?? Object.keys(cp.assetSelections)) delete cp.assetSelections[key];
      touchDoc(ctx, characterId, "asset-selection");
      return { ok: true };
    },
    "assets.setReference": ({ target, asset }, ctx) => {
      const { db } = ctx;
      const stored = assetFromStored(db, asset);
      if (target.kind === "persona") {
        let c = personaForms(db, target.personaId);
        const formId = target.formId ?? c.defaultFormId;
        if (target.outfitId) c = patchOutfit(c, formId, target.outfitId, { referenceAsset: stored });
        else {
          const form = c.forms.find((f) => f.id === formId);
          c = patchForm(c, formId, { reference: { ...(form?.reference ?? {}), defaultAsset: stored } });
        }
        setPersonaForms(db, target.personaId, c);
        return { ok: true };
      }
      if (target.kind === "artist-extraction") {
        const cp = documentFor(db, target.characterId).characterPrompt;
        if (stored) cp.artistExtractionAssetBySourceId[target.characterId] = stored;
        else delete cp.artistExtractionAssetBySourceId[target.characterId];
        touchDoc(ctx, target.characterId, "artist-extraction");
        return { ok: true };
      }
      let c = characterForms(db, target.characterId, target.promptKey);
      if (target.kind === "character-outfit") c = patchOutfit(c, target.formId, target.outfitId, { referenceAsset: stored });
      else {
        const form = c.forms.find((f) => f.id === target.formId);
        c = patchForm(c, target.formId, { reference: { ...(form?.reference ?? {}), defaultAsset: stored } });
      }
      setCharacterForms(db, target.characterId, target.promptKey, c);
      touchDoc(ctx, target.characterId, "reference");
      return { ok: true };
    },
    "assets.inspectMetadata": ({ asset }, { db }) => {
      const item = findAssetItem(db, asset);
      if (!item?.hasMetadata) return { hasMetadata: false, summary: null };
      return {
        hasMetadata: true,
        summary: {
          assetName: asset.name,
          provider: "NovelAI",
          width: item.width ?? 832,
          height: item.height ?? 1216,
          prompt: "1girl, solo, school uniform, classroom, smile, looking at viewer",
          negativePrompt: "lowres, bad anatomy",
          characterPrompts: [{ prompt: "girl, long black hair, brown eyes", negative: "", center: { x: 0.5, y: 0.5 } }],
          comment: { steps: 28, scale: 5, sampler: "k_euler_ancestral", seed: 123456789 }
        }
      };
    },
    "assets.clearMetadataRecords": () => ({ ok: true }),
    "assets.upload": ({ characterId, personaId, fileName, mimeType, dataBase64 }, { db }) => {
      const state = workspaceMockState(db);
      const owner = characterId ?? personaId ?? "global";
      const name = fileName.replace(/\.[^.]+$/u, "") || "upload";
      const asset = normalizeAssetRef({ name, key: `upload-${++state.seq}-${name}`, extension: fileName.split(".").pop() ?? "png", sourceType: "upload", characterTarget: characterId ? { chaId: characterId } : undefined });
      const url = `data:${mimeType};base64,${dataBase64}`;
      (state.uploads[owner] ??= []).push({ asset, kind: "original", url, thumbnailUrl: url, selected: false, candidate: false });
      return { asset };
    },
    "assets.saveCrop": ({ characterId, asset, cropRect, sourceSize, dataBase64 }, { db }) => {
      const state = workspaceMockState(db);
      const name = `__asset_maid_crop_${++state.seq}`;
      const crop = { version: 1, assetName: name, assetKey: `crop-${state.seq}`, extension: "png" as const, cropRect, sourceSize };
      const url = `data:image/png;base64,${dataBase64}`;
      (state.uploads[`crop:${characterId}`] ??= []).push({ asset: { ...normalizeAssetRef({ name, key: crop.assetKey, extension: "png" }) }, kind: "original", url, thumbnailUrl: url, selected: false, candidate: false });
      return { asset: { ...asset, cropReference: crop } };
    },
    "assets.getUrl": ({ asset }, { db }) => {
      const crop = (asset.cropReference ?? null) as { assetKey?: string } | null;
      if (crop?.assetKey) {
        const hit = findAssetItem(db, { name: "", key: crop.assetKey });
        if (hit) return { url: hit.url };
      }
      const item = findAssetItem(db, asset);
      if (item) return { url: item.url };
      const persona = db.personas.find((p) => `persona-avatar-${p.personaId}` === asset.key);
      if (persona?.avatarUrl) return { url: persona.avatarUrl };
      return { url: svgImage(asset.name || asset.key, 260) };
    },

    /* analysis */
    "analysis.start": (params, ctx) => {
      const state = workspaceMockState(ctx.db);
      const running = Object.values(state.jobs).find((j) => (j.status === "running" || j.status === "queued") && j.characterId === params.characterId && j.kind === params.kind);
      if (running) ctx.fail("busy", "Another task is in progress. Run again after it finishes.", { messageKo: "다른 작업이 진행 중입니다. 완료 후 다시 실행해 주세요." });
      const jobId = `job-${params.kind}-${++state.seq}`;
      const job: MockJob = { jobId, kind: params.kind, characterId: params.characterId, status: "queued", progress: { label: "Queued" }, cancelled: false };
      state.jobs[jobId] = job;
      void runJob(ctx, job, params);
      return { jobId };
    },
    "analysis.cancel": ({ jobId, kind }, { db }) => {
      for (const job of Object.values(workspaceMockState(db).jobs)) if (job.jobId === jobId || (kind && job.kind === kind)) job.cancelled = true;
      return { ok: true };
    },
    "analysis.listActive": (_p, { db }) => ({
      jobs: Object.values(workspaceMockState(db).jobs).filter((j) => j.status === "running" || j.status === "queued").map((j) => ({ jobId: j.jobId, kind: j.kind, characterId: j.characterId, status: j.status, progress: j.progress }))
    }),
    "uniqueTags.apply": ({ characterId, choices }, ctx) => {
      for (const choice of choices) {
        const c = characterForms(ctx.db, characterId, choice.promptKey);
        const form = c.forms.find((f) => f.id === choice.formId);
        if (!form) continue;
        setCharacterForms(ctx.db, characterId, choice.promptKey, patchForm(c, form.id, { basePromptGroups: { ...form.basePromptGroups, "identity.character_tag": choice.tag ? [choice.tag] : [] } }));
      }
      touchDoc(ctx, characterId, "unique-tags");
      return { ok: true };
    },

    /* prompts */
    "prompts.saveForms": ({ characterId, promptKey, collection, baseRevision }, ctx) => {
      const current = characterForms(ctx.db, characterId, promptKey);
      if (formCollectionRevision(current) !== baseRevision) ctx.fail("conflict", "The prompts changed elsewhere.");
      setCharacterForms(ctx.db, characterId, promptKey, collection);
      touchDoc(ctx, characterId, "prompts");
      const saved = characterForms(ctx.db, characterId, promptKey);
      return { collection: saved, revision: formCollectionRevision(saved) };
    },
    "prompts.setReferenceEnabled": ({ characterId, promptKeys, formId, enabled }, ctx) => {
      for (const key of promptKeys) {
        let c = characterForms(ctx.db, characterId, key);
        for (const form of c.forms) if (!formId || form.id === formId) c = patchForm(c, form.id, { reference: { ...(form.reference ?? {}), enabled } });
        setCharacterForms(ctx.db, characterId, key, c);
      }
      touchDoc(ctx, characterId, "prompts");
      return buildSnapshot(ctx.db, characterId, ctx);
    },
    "prompts.setAnalyzeEnabled": ({ characterId, promptKeys, enabled }, ctx) => {
      const cp = documentFor(ctx.db, characterId).characterPrompt;
      for (const key of promptKeys) cp.assetMetadata[key] = { ...(cp.assetMetadata[key] ?? {}), analyzeEnabled: enabled };
      return buildSnapshot(ctx.db, characterId, ctx);
    },
    "prompts.setSeed": ({ characterId, promptKey, seed, fixed }, { db }) => {
      documentFor(db, characterId).characterPrompt.seedSettings[promptKey] = { seed, fixed };
      return { ok: true };
    },
    "prompts.setFramingWeights": () => ({ ok: true }),

    /* artists */
    "artists.list": ({ characterId }, { db }) => {
      const doc = characterId ? documentFor(db, characterId) : null;
      const anima = db.config.animaArtists;
      return {
        novelai: listNovelAIArtists(db.config.characterPrompt.artistPrompts),
        anima,
        selectedNovelAIId: doc?.characterPrompt.selectedArtistId || "detail_anime_illustration_style",
        selectedAnimaId: (characterId && (doc?.animaArtistId ?? anima.selection.bySourceId[characterId])) || anima.selection.defaultId
      };
    },
    "artists.upsertNovelAI": ({ entry }, { db }) => {
      const list = db.config.characterPrompt.artistPrompts as unknown as { id: string }[];
      const id = entry.id || `artist_${Date.now().toString(36)}`;
      const next = { ...entry, id };
      const index = list.findIndex((e) => e.id === id);
      if (index >= 0) list[index] = next;
      else list.push(next);
      return { entry: next };
    },
    "artists.deleteNovelAI": ({ id }, { db }) => {
      const cp = db.config.characterPrompt as unknown as { artistPrompts: { id: string }[] };
      cp.artistPrompts = cp.artistPrompts.filter((e) => e.id !== id);
      return { ok: true };
    },
    "artists.upsertAnima": ({ entry }, { db }) => {
      const list = db.config.animaArtists.entries;
      const id = entry.id || `anima_artist_${list.length + 1}`;
      const next = { ...entry, id };
      const index = list.findIndex((e) => e.id === id);
      if (index >= 0) list[index] = next;
      else list.push(next);
      return { entry: next };
    },
    "artists.deleteAnima": ({ id }, { db }) => {
      const a = db.config.animaArtists;
      a.entries = a.entries.filter((e) => e.id !== id);
      if (a.selection.defaultId === id) a.selection.defaultId = "none";
      for (const [k, v] of Object.entries(a.selection.bySourceId)) if (v === id) a.selection.bySourceId[k] = "none";
      for (const doc of Object.values(db.documents)) if (doc.animaArtistId === id) doc.animaArtistId = "none";
      return { ok: true };
    },
    "artists.select": ({ list, artistId, characterId }, ctx) => {
      if (list === "novelai") {
        if (characterId) documentFor(ctx.db, characterId).characterPrompt.selectedArtistId = artistId;
      } else if (characterId) {
        documentFor(ctx.db, characterId).animaArtistId = artistId;
        ctx.db.config.animaArtists.selection.bySourceId[characterId] = artistId;
      } else ctx.db.config.animaArtists.selection.defaultId = artistId;
      return { ok: true };
    },

    /* personas */
    "personas.list": (_p, { db }) => ({ personas: personaSummaries(db) }),
    "personas.saveForms": ({ personaId, collection, baseRevision }, ctx) => {
      const current = personaForms(ctx.db, personaId);
      if (formCollectionRevision(current) !== baseRevision) ctx.fail("conflict", "The persona changed elsewhere.");
      setPersonaForms(ctx.db, personaId, normalizeFormCollection(collection));
      const saved = personaForms(ctx.db, personaId);
      return { collection: saved, revision: formCollectionRevision(saved) };
    },
    "personas.setSettings": (patch, { db }) => {
      const cp = db.config.characterPrompt;
      if (patch.personaGender) cp.personaGender = patch.personaGender;
      if (patch.malePersonaPrompt !== undefined) cp.malePersonaPrompt = patch.malePersonaPrompt;
      if (patch.malePersonaNegativePrompt !== undefined) cp.malePersonaNegativePrompt = patch.malePersonaNegativePrompt;
      if (patch.selectedPersonaKey !== undefined) cp.personaSettings.selectedPersonaKey = patch.selectedPersonaKey;
      return { ok: true };
    },

    /* outfit images */
    "outfitImage.generate": ({ target, formId, outfitId, draft }, ctx) => {
      const state = workspaceMockState(ctx.db);
      const jobId = `outfit-${++state.seq}`;
      void (async () => {
        for (let step = 1; step <= 4; step += 1) {
          ctx.emit("outfitImage.progress", { jobId, progress: { label: "Generating outfit image", done: step, total: 4, fraction: step / 4 } });
          await ctx.delay(state.jobStepMs);
        }
        const seed = draft.seedFixed && draft.seed ? draft.seed : String(Math.floor(1e9 * ((state.seq * 0.618) % 1)));
        const label = [draft.top, draft.bottom].filter(Boolean).join(" / ") || draft.label || "outfit";
        const url = svgImage(label.slice(0, 24), (state.seq * 47) % 360, 512, 768);
        const result: OutfitImageResult = { resultId: `res-${state.seq}-${seed}`, imageId: `img-gen-${state.seq}`, url, seed, width: 832, height: 1216, positivePrompt: label, negativePrompt: "", createdAt: new Date().toISOString() };
        (state.outfitHistory[targetKey(target, formId, outfitId)] ??= []).unshift(result);
        state.outfitHistory[targetKey(target, formId, outfitId)]!.splice(8);
        (state.uploads.__generated ??= []).push({ asset: normalizeAssetRef({ name: `${label}.__am__.outfit.${result.resultId}`, key: result.imageId, extension: "png", sourceType: "generated" }), kind: "outfit", url, thumbnailUrl: url, selected: false, candidate: false });
        ctx.emit("outfitImage.finished", { jobId, result });
      })();
      return { jobId };
    },
    "outfitImage.history": ({ target, formId, outfitId }, { db }) => ({ results: workspaceMockState(db).outfitHistory[targetKey(target, formId, outfitId)] ?? [] }),
    "outfitImage.save": ({ target, formId, outfitId, resultIds, mode, draft }, ctx) => {
      const { db } = ctx;
      const results = (workspaceMockState(db).outfitHistory[targetKey(target, formId, outfitId)] ?? []).filter((r) => resultIds.includes(r.resultId));
      let c = target.kind === "character" ? characterForms(db, target.characterId, target.promptKey) : personaForms(db, target.personaId);
      const fields = { label: draft.label, description: draft.description ?? "", head: draft.head, top: draft.top, bottom: draft.bottom, legs: draft.legs, feet: draft.feet };
      results.forEach((result, index) => {
        const ref: StoredAssetRef = { name: `outfit.__am__.outfit.${result.resultId}`, key: result.imageId, ext: "png", sourceType: "generated" };
        if (mode === "replace" && outfitId && index === 0) c = patchOutfit(c, formId, outfitId, { ...fields, referenceAsset: ref, imageAsset: ref, candidateEnabled: true });
        else c = addOutfit(c, formId, { label: draft.label || `${outfitId ?? "outfit"}_${index + 1}`, patch: { ...fields, referenceAsset: ref, imageAsset: ref, candidateEnabled: true } }).collection;
      });
      if (target.kind === "character") {
        setCharacterForms(db, target.characterId, target.promptKey, c);
        touchDoc(ctx, target.characterId, "outfit-image");
      } else setPersonaForms(db, target.personaId, c);
      return { collection: c };
    }
  };
}

/** Demo data for previews: asset selections, a form reference and a persona profile (idempotent). */
export function seedWorkspaceDemo(db: MockDb): void {
  const state = workspaceMockState(db);
  if ((state as { seeded?: boolean }).seeded) return;
  (state as { seeded?: boolean }).seeded = true;
  const c1 = db.characters[0];
  if (!c1) return;
  const characterId = c1.summary.characterId;
  const doc = documentFor(db, characterId);
  const cp = doc.characterPrompt;
  const pick = (...names: string[]) => names.map((n) => c1.assets.find((a) => a.asset.name === n)).filter((a): a is AssetListItem => !!a).map((a) => toStoredAssetRef(a.asset));
  const keys = Object.keys(cp.characterForms);
  // Fixture forms use group names ("identity", "hair") instead of catalog field ids; give them real values.
  const demoGroups = [
    { "identity.character_tag": ["han seo-yeon"], "hair.color": ["black hair"], "hair.length": ["long hair"], "eyes.color": ["brown eyes"], custom: ["beauty mark"] },
    { "hair.color": ["brown hair"], "hair.length": ["short hair"], "hair.style": ["bob cut"], "eyes.color": ["green eyes"] }
  ];
  keys.slice(0, 2).forEach((key, i) => {
    const c = characterForms(db, characterId, key);
    setCharacterForms(db, characterId, key, patchForm(c, c.defaultFormId, { basePromptGroups: demoGroups[i], negativePrompt: i === 0 ? "short hair" : "" }));
  });
  if (keys[0]) {
    const sel = pick("seoyeon_default", "seoyeon_smile", "seoyeon_uniform");
    cp.assetSelections[keys[0]] = { selectedAssets: sel, selectedAssetNames: sel.map((a) => a.name) };
    const c = characterForms(db, characterId, keys[0]);
    const form = c.forms[0]!;
    let next = patchForm(c, form.id, { reference: { enabled: true, defaultAsset: sel[0] ?? null } });
    next = patchOutfit(next, form.id, form.outfits[0]!.id, { referenceAsset: sel[2] ?? null });
    setCharacterForms(db, characterId, keys[0], next);
  }
  if (keys[1]) {
    const sel = pick("mina_default", "mina_angry");
    cp.assetSelections[keys[1]] = { selectedAssets: sel, selectedAssetNames: sel.map((a) => a.name) };
  }
  for (const item of c1.assets) if (item.kind === "original" && item.asset.name.startsWith("seoyeon")) item.hasMetadata = item.asset.name !== "seoyeon_uniform";
  const persona = db.personas[0];
  if (persona) {
    db.config.characterPrompt.personaSettings.profiles[persona.personaId] = {
      forms: normalizeFormCollection({
        defaultFormId: "form_default",
        forms: [{ id: "form_default", label: "기본", description: "", humanlike: true, gender: "male", basePromptGroups: { "hair.color": ["black hair"], "hair.length": ["short hair"], "eyes.color": ["dark eyes"] }, negativePrompt: "", reference: null, defaultOutfitId: "outfit_default",
          outfits: [{ id: "outfit_default", label: "기본 의상", description: "", candidateEnabled: true, head: "", top: "school blazer, white shirt", bottom: "dark trousers", legs: "", feet: "loafers" }, { id: "outfit_casual", label: "Casual", description: "Weekend clothes", candidateEnabled: true, head: "cap", top: "hoodie", bottom: "jeans", legs: "", feet: "sneakers" }] }]
      })
    };
  }
}
