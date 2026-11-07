/**
 * Analysis runs: each kind drives the VERBATIM Asset Maid controller from the slice with port adapters
 * (bridge/session.ts) and maps its snapshot onto `analysis.progress` / `analysis.finished`.
 * Controller names/lines are AM 0.9.89.5 (`0.9.89.5.pretty.js`); the UI origin lines are still 0.9.88 lines.
 *
 * | kind                | AM controller / entry                                   | UI origin (0.9.88 line)       |
 * |---------------------|---------------------------------------------------------|-------------------------------|
 * | character-prompts   | `Gwt.analyzePrompts` L136363 (promptOrder only)          | Assets tab L154025            |
 * | references          | `f0t.analyzeReferences` L137819; text mode -> `Gwt` with explicit promptKeys | Prompts tab L154250 |
 * | persona             | `o0t.analyze` L137235 (`assetSelection:"analysis"`)       | Assets tab persona view L154036 |
 * | asset-matching      | `C0t.analyzeMatching` L138757 (force / onlyPromptKeys)   | L154336, L155673              |
 * | metadata-check      | `Pwt.analyzeMetadata` L135775                             | L145272, L154345              |
 * | artist-extraction   | `wwt.extractArtistPrompt` L135474                         | Artists tab L150269           |
 * | representative-pick | `Fve` L134052 (no LLM) + toast `ewt` L134836              | L155676                       |
 * | reclassification    | `dhe` L98781 with the prompts adapter `Ddt` L107990 (personas: `oIt` L149087) | Prompts tab L154235 |
 * | charx-regex         | `h0t.analyzeRegex` L138174, scripts = Lumiverse regex scripts | settings                  |
 * | outfit-autopick     | Inlay addition (autopick.ts): naming scheme + contact sheets, no AM controller | Prompts tab |
 */
import { rpcError, type AnalysisStartParams, type JobStatus, type ProgressInfo, type RowNotice } from "../../shared/contract/index.js";
import { fail } from "../rpc/errors.js";
import { AM, amFn } from "./core/index.js";
import { buildPersonaCatalog, createAmAnalyzer, openAnalysisSession, rememberVisionSupport, type AnalysisSession } from "./bridge/session.js";
import { amLabel, amMessage } from "./labels.js";
import type { JobContext, JobOutcome } from "./jobs.js";
import { runCharxRegex } from "./charx-regex.js";
import { runOutfitAutoPick } from "./autopick.js";
import { loreBodiesByPromptKey, withOutfitEvidence } from "./outfit-evidence.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** AM final labels that mean "nothing to analyse" (status success, nothing written). */
const NOTHING_LABELS = new Set([
  "분석할 이미지가 선택되지 않았습니다.",
  "분석할 로어북 본문이 없습니다",
  "분석 가능한 로어북 본문이 없습니다",
  "선택한 이미지에서 분석할 정보를 찾지 못했습니다.",
  "분석할 페르소나가 없습니다",
  "분석할 프롬프트가 없습니다",
  "변경된 로어북 선택이 없습니다.",
]);

export function snapshotProgress(snap: Any): ProgressInfo {
  // Asset matching (AM `C0t`) reports phase units while running; its activity row shows those (AM 0.9.89.5 L138579).
  const phase = snap?.status === "running" && Number(snap?.totalPhaseUnits) > 0;
  const pairs: Array<[string, string]> = phase
    ? [["completedPhaseUnits", "totalPhaseUnits"]]
    : [["completedAnalysisUnits", "totalAnalysisUnits"], ["completed", "total"], ["completedMetadata", "totalMetadata"], ["completedBatches", "totalBatches"]];
  const progress: ProgressInfo = { ...amLabel(String(snap?.label ?? "")) };
  for (const [d, t] of pairs) {
    if (Number(snap?.[t]) > 0) {
      progress.done = Number(snap[d]) || 0;
      progress.total = Number(snap[t]);
      break;
    }
  }
  if (phase) progress.fraction = Math.min(1, progress.done! / progress.total!);
  else if (Number.isFinite(snap?.progress)) progress.fraction = Math.max(0, Math.min(1, Number(snap.progress)));
  if (snap?.retry && Number(snap.retry.total) > 0) progress.retry = { attempt: Number(snap.retry.attempt) || 0, total: Number(snap.retry.total) };
  return progress;
}

function outcomeOf(snap: Any, returned: unknown): JobOutcome {
  const label = String(snap?.label ?? "");
  const error = String(snap?.error ?? "").trim();
  const { message, messageKo } = amMessage(label || error);
  const status: JobStatus =
    snap?.status === "cancelled"
      ? "cancelled"
      : snap?.status === "error" || (returned === false && snap?.status !== "success")
        ? "error"
        : NOTHING_LABELS.has(label)
          ? "no-evidence"
          : error
            ? "partial"
            : "success";
  const out: JobOutcome = { status, message: message || (status === "success" ? "Done." : status), ...(messageKo ? { messageKo } : {}) };
  if (error && status !== "cancelled") {
    const e = amMessage(error);
    out.error = rpcError(status === "error" ? "provider-error" : "provider-error", e.message, { ...(e.messageKo ? { messageKo: e.messageKo } : {}), retryable: true });
  }
  return out;
}

/** Subscribe to an AM controller, forward progress + row notices, run, flush the store, map the final snapshot. */
export async function driveAmController(ctx: JobContext, session: AnalysisSession, controller: Any, invoke: () => Promise<unknown>, rowKeys: string[] = []): Promise<JobOutcome> {
  let last: ProgressInfo = { label: "Starting", fraction: 0 };
  const pendingRows = new Map<string, RowNotice>();
  const flushRows = () => {
    const rows = [...pendingRows.values()];
    pendingRows.clear();
    ctx.progress(last, rows);
  };
  const unsubscribe = controller.subscribe(() => {
    last = snapshotProgress(controller.getSnapshot());
    flushRows();
  });
  const rowUnsubs: Array<() => void> =
    typeof controller.subscribeRowNotice === "function"
      ? rowKeys.map((key) =>
          controller.subscribeRowNotice(key, () => {
            const n = controller.getRowNotice(key);
            pendingRows.set(key, { promptKey: key, status: n.status, ...(Number.isFinite(n.outfitCount) ? { outfitCount: n.outfitCount } : {}) });
            queueMicrotask(() => pendingRows.size && flushRows());
          }),
        )
      : [];
  const onAbort = () => controller.cancel();
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  try {
    // AM controllers only cancel a run they already started, so a cancel that came in while the session was opening stops here.
    ctx.signal.throwIfAborted();
    const returned = await invoke();
    await session.store.flushSave().catch((error) => {
      throw Object.assign(new Error(`Saving the analysis results failed: ${error instanceof Error ? error.message : String(error)}`), { code: "storage-error" });
    });
    if (pendingRows.size) flushRows();
    return outcomeOf(controller.getSnapshot(), returned);
  } catch (error) {
    // The job ends once the writes the run queued have landed (a reset waits for that), even when the controller threw.
    await session.store.settle();
    throw error;
  } finally {
    ctx.signal.removeEventListener("abort", onAbort);
    unsubscribe?.();
    rowUnsubs.forEach((u) => u?.());
    controller.dispose?.();
    session.dispose();
  }
}

/** Run `build` for an open session; dispose the session if it throws (before `driveAmController` owns it). */
async function prepared<T>(session: AnalysisSession, build: () => T | Promise<T>): Promise<T> {
  try {
    return await build();
  } catch (error) {
    session.dispose();
    throw error;
  }
}

async function open(ctx: JobContext, reason: string): Promise<AnalysisSession> {
  const session = await openAnalysisSession(ctx.services, ctx.characterId, { reason });
  const supported = await ctx.services.llm.supportsVision().catch(() => null);
  rememberVisionSupport(session.store.getCurrentSnapshot().analysis, supported);
  return session;
}

/** `loreFor`: character text by prompt key; enables the Inlay outfit evidence layer (outfit-evidence.ts). */
function analyzer(ctx: JobContext, purpose: string, loreFor?: (promptKey: string) => string | undefined) {
  const client = createAmAnalyzer(ctx.services, {
    purpose,
    onRetry: (info) => ctx.progress({ label: `Retrying (${info.attempt}/${info.total})`, labelKo: "재시도", retry: { attempt: info.attempt, total: info.total } }),
  });
  if (!loreFor) return client;
  return withOutfitEvidence(client, loreFor, ({ evidenceTargets, completedParts, strippedParts }) =>
    ctx.services.log.append(
      "info",
      "analysis",
      `Outfit analysis: text clothing evidence for ${evidenceTargets} target(s), ${completedParts} legs/feet part(s) completed from text, ${strippedParts} absence part(s) removed.`,
    ),
  );
}

/** The text lookup of the outfit evidence layer, or none while `runtime.outfitAwarenessDisabled` is on. */
function outfitLore(session: AnalysisSession, loreFor: (promptKey: string) => string | undefined) {
  return (session.store.getCurrentSnapshot() as Any).runtime?.outfitAwarenessDisabled === true ? undefined : loreFor;
}

const sessionLore = (session: AnalysisSession) => outfitLore(session, (promptKey) => loreBodiesByPromptKey(session.source).get(promptKey));

const promptKeysOf = (session: AnalysisSession): string[] => session.source.members.flatMap((m) => m.lorebooks.map((l) => amFn("Is")(m, l) as string));

export async function runCharacterPrompts(ctx: JobContext, params: AnalysisStartParams, explicit = false): Promise<JobOutcome> {
  const session = await open(ctx, "asset-analysis");
  const controller = await prepared(session, () =>
    AM.ptt({
      sourceCatalog: session.sourceCatalog,
      metadata: session.metadata,
      images: session.images,
      analyzer: analyzer(ctx, "character-analysis", sessionLore(session)),
      config: session.store,
      priorityAssets: session.priorityAssets,
      ensureSourceHydrated: async () => {},
    }),
  );
  const order = params.promptKeys?.length ? params.promptKeys : undefined;
  return driveAmController(
    ctx,
    session,
    controller,
    () =>
      controller.analyzePrompts({
        scope: "current-source",
        sourceId: ctx.characterId,
        evidenceMode: params.evidenceMode ?? "image",
        overwriteExistingPrompts: false,
        runtimeSources: [session.source],
        ...(order ? { promptOrder: order } : {}),
        ...(explicit && order ? { promptKeys: order } : {}),
      }),
    promptKeysOf(session),
  );
}

export async function runReferences(ctx: JobContext, params: AnalysisStartParams): Promise<JobOutcome> {
  if ((params.evidenceMode ?? "image") === "text") return runCharacterPrompts(ctx, params, true);
  const session = await open(ctx, "reference-analysis");
  const controller = await prepared(session, () =>
    AM.Ntt({
      sourceCatalog: session.sourceCatalog,
      metadata: session.metadata,
      images: session.images,
      analyzer: analyzer(ctx, "reference-analysis", sessionLore(session)),
      config: session.store,
      priorityAssets: session.priorityAssets,
      ensureSourceHydrated: async () => {},
    }),
  );
  return driveAmController(ctx, session, controller, () =>
    controller.analyzeReferences({
      scope: "current-source",
      sourceId: ctx.characterId,
      evidenceMode: params.evidenceMode ?? "image",
      runtimeSources: [session.source],
      ...(params.promptKeys?.length ? { promptKeys: params.promptKeys } : {}),
    }),
  );
}

export async function runPersona(ctx: JobContext, params: AnalysisStartParams): Promise<JobOutcome> {
  const session = await open(ctx, "persona-analysis");
  const controller = await prepared(session, async () => {
    await session.sourceCatalog.refreshPersonas();
    const personas = await ctx.services.sources.listPersonas().catch(() => []);
    const personaText = (key: string) => personas.find((p) => p.personaId === key.replace(/^persona:+/, ""))?.description;
    return AM.Att({
      sourceCatalog: session.sourceCatalog,
      metadata: session.metadata,
      images: session.images,
      analyzer: analyzer(ctx, "persona-analysis", outfitLore(session, personaText)),
      config: session.store,
      referenceCrops: session.referenceCrops,
    });
  });
  return driveAmController(ctx, session, controller, () =>
    controller.analyze({ personaKeys: params.personaIds ?? [], assetSelection: "analysis", evidenceMode: params.evidenceMode ?? "image", sourceId: ctx.characterId }),
  );
}

export async function runAssetMatching(ctx: JobContext, params: AnalysisStartParams): Promise<JobOutcome> {
  const session = await open(ctx, "asset-matching");
  const controller = await prepared(session, () => AM.Hrt({ sourceCatalog: session.sourceCatalog, analyzer: analyzer(ctx, "asset-matching"), config: session.store, priorityAssets: session.priorityAssets }));
  return driveAmController(ctx, session, controller, () =>
    controller.analyzeMatching({
      scope: "current-source",
      sourceId: ctx.characterId,
      runtimeSources: [session.source],
      ...(params.force ? { force: true } : {}),
      ...(params.promptKeys?.length ? { onlyPromptKeys: params.promptKeys } : {}),
    }),
  );
}

export async function runMetadataCheck(ctx: JobContext): Promise<JobOutcome> {
  const session = await open(ctx, "metadata-check");
  const controller = await prepared(session, () => AM.Vet({ config: session.store, sourceCatalog: session.sourceCatalog, metadata: session.metadata, priorityAssets: session.priorityAssets }));
  return driveAmController(ctx, session, controller, () => controller.analyzeMetadata({ scope: "current-source", sourceId: ctx.characterId }));
}

export async function runArtistExtraction(ctx: JobContext, params: AnalysisStartParams): Promise<JobOutcome> {
  const session = await open(ctx, "artist-extraction");
  const controller = await prepared(session, () => {
    if (params.asset) {
      // Same write as the picker target `artist-reference` (AM `artistExtractionAssetBySourceId[sourceId]`).
      const stored = amFn("cn")(params.asset);
      session.store.update(
        (c) => ({ ...c, characterPrompt: { ...c.characterPrompt, artistExtractionAssetBySourceId: { ...c.characterPrompt.artistExtractionAssetBySourceId, [ctx.characterId]: { ...stored, ext: stored.extension } } } }),
        { domains: ["asset-analysis"] },
      );
    }
    return AM.$et({
      sourceCatalog: session.sourceCatalog,
      metadata: session.metadata,
      analyzer: analyzer(ctx, "artist-extraction"),
      config: session.store,
      priorityAssets: session.priorityAssets,
      ensureSourceHydrated: async () => {},
    });
  });
  return driveAmController(ctx, session, controller, () => controller.extractArtistPrompt({ sourceId: ctx.characterId }));
}

/** AM `Fve` L134052 (no LLM): one default-outfit image per character; toast text `ewt` L134836. */
export async function runRepresentativePick(ctx: JobContext, params: AnalysisStartParams): Promise<JobOutcome> {
  const session = await open(ctx, "representative-pick");
  try {
    ctx.signal.throwIfAborted();
    const wanted = params.promptKeys?.length ? new Set(params.promptKeys) : null;
    const items = (amFn("LF")(session.source, session.store.getCurrentSnapshot().characterPrompt) as Any[]).filter((item) => !wanted || wanted.has(item.promptKey));
    ctx.progress({ label: "Selecting representative images", labelKo: "캐릭터별 기본 의상 이미지 자동 선택", done: 0, total: items.length });
    const result = AM.Epe({ priorityAssets: session.priorityAssets, config: session.store, sourceId: ctx.characterId, items });
    await session.store.flushSave();
    const toast = String(AM.iet(result));
    const { message, messageKo } = amMessage(toast);
    ctx.progress({ label: message, ...(messageKo ? { labelKo: messageKo } : {}), done: items.length, total: items.length, fraction: 1 });
    return { status: result.addedImages ? "success" : "no-evidence", message, ...(messageKo ? { messageKo } : {}) };
  } finally {
    await session.store.settle();
    session.dispose();
  }
}

/**
 * AI reclassification of checked areas (AM `dhe` L98781, adapters `Ddt` L107990 / `oIt` L149087). The checked areas are
 * the reference "analysis" checks stored on forms/outfits (AM `Zre` L34273), so the port passes the prompt keys (or
 * persona ids) as the editor targets. The draft session is the store itself (no separate drafts in the backend, so
 * `projectPending` is the identity).
 */
export async function runReclassification(ctx: JobContext, params: AnalysisStartParams): Promise<JobOutcome> {
  const session = await open(ctx, "reclassification");
  const personaMode = !!params.personaIds?.length;
  const keys = personaMode ? params.personaIds! : params.promptKeys?.length ? params.promptKeys : promptKeysOf(session);
  const personas = personaMode ? (await prepared(session, () => buildPersonaCatalog(ctx.services))).records : [];
  const adapter = personaMode
    ? {
        domain: "settings",
        capture: (t: Any, r: Any) =>
          [...new Set(r.targets.map((n: Any) => n.promptKey))].flatMap((key) => {
            const persona = personas.find((p: Any) => p.key === key);
            if (!persona) throw new Error("재분류할 페르소나를 찾지 못했습니다.");
            const collection = AM.Il(t, persona.key);
            const enabled = (AM.Ek(t, r.sourceId, persona, "reclassification") as Any[]).filter((x) => x.enabled);
            const raw = AM.w_(AM.w_(t.characterPrompt.personaSettings.profiles[persona.key]).forms).forms;
            return collection.forms
              .map((form: Any) =>
                AM.zte(collection, raw, persona.key, form.id, {
                  base: enabled.some((x) => x.formId === form.id && x.outfitId === null),
                  outfits: new Set(enabled.filter((x) => x.formId === form.id && x.outfitId !== null).map((x) => x.outfitId)),
                }),
              )
              .filter((x: Any) => x.targets.length > 0);
          }),
        collection: (t: Any, r: string) => AM.d7(AM.Il(t, r), AM.w_(AM.w_(t.characterPrompt.personaSettings.profiles[r]).forms).forms),
        store: (t: Any, r: string, n: Any) => AM.vf(t, r, AM.N2(AM.w_(t.characterPrompt.personaSettings.profiles[r]).forms, AM.Il(t, r), n)),
        topics: () => ["reclassification"],
      }
    : { domain: "prompts", capture: (t: Any, r: Any) => AM.tTe(t, r.targets), collection: AM.nTe, store: AM.l7, topics: () => ["reclassification"] };
  const controller = await prepared(session, () =>
    AM.Bge({
      config: session.store,
      analyzer: analyzer(ctx, "prompt-reclassification"),
      blocked: () => false,
      drafts: { flush() {}, projectPending: (config: Any) => config },
      adapter,
      context: () => ({ sourceId: ctx.characterId, targets: keys.map((promptKey) => ({ promptKey })), generation: 0, available: keys.length > 0 }),
    }),
  );
  const unsubscribe = controller.subscribe(() => {
    const snap = controller.getSnapshot();
        ctx.progress({ ...amLabel(String(snap.message ?? "")), ...(snap.total ? { done: snap.completed, total: snap.total } : {}), ...(snap.retry ? { retry: { attempt: snap.retry.attempt, total: snap.retry.total }, retryCount: `${snap.retry.attempt}/${snap.retry.total}` } : {}) });
  });
  const onAbort = () => controller.cancel();
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  try {
    ctx.signal.throwIfAborted();
    await controller.start();
    await session.store.flushSave();
    const snap = controller.getSnapshot();
    const { message, messageKo } = amMessage(String(snap.message ?? ""));
    const status: JobStatus = ctx.signal.aborted ? "cancelled" : snap.activityStatus === "success" ? "success" : snap.activityStatus === "error" ? "error" : "no-evidence";
    return {
      status,
      message: message || status,
      ...(messageKo ? { messageKo } : {}),
      ...(status === "error" ? { error: rpcError("provider-error", message, { ...(messageKo ? { messageKo } : {}), retryable: true }) } : {}),
    };
  } catch (error) {
    await session.store.settle();
    throw error;
  } finally {
    ctx.signal.removeEventListener("abort", onAbort);
    unsubscribe?.();
    session.dispose();
  }
}

/**
 * The AM controller a run drives, which is the job registry's busy key: AM runs one controller at a time. Text-mode
 * references run `Gwt` like character-prompts; every other kind has its own controller.
 */
export function analysisLane(params: Pick<AnalysisStartParams, "kind" | "evidenceMode">): string {
  return params.kind === "references" && (params.evidenceMode ?? "image") === "text" ? "character-prompts" : params.kind;
}

export async function runAnalysis(ctx: JobContext, params: AnalysisStartParams): Promise<JobOutcome> {
  switch (params.kind) {
    case "character-prompts":
      return runCharacterPrompts(ctx, params, params.explicit === true);
    case "references":
      return runReferences(ctx, params);
    case "persona":
      return runPersona(ctx, params);
    case "asset-matching":
      return runAssetMatching(ctx, params);
    case "metadata-check":
      return runMetadataCheck(ctx);
    case "artist-extraction":
      return runArtistExtraction(ctx, params);
    case "representative-pick":
      return runRepresentativePick(ctx, params);
    case "reclassification":
      return runReclassification(ctx, params);
    case "charx-regex":
      return runCharxRegex(ctx, { force: params.force === true });
    case "outfit-autopick":
      return runOutfitAutoPick(ctx, params);
    default:
      return fail("unsupported", `Analysis kind "${params.kind}" is not available in this version.`);
  }
}

/** Kinds `analysis.start` accepts (validated before a job is created). */
export const SUPPORTED_ANALYSIS_KINDS = new Set(["character-prompts", "references", "persona", "asset-matching", "metadata-check", "artist-extraction", "representative-pick", "reclassification", "charx-regex", "outfit-autopick"]);
