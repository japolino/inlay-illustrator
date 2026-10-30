/**
 * Webtoon strip run (experimental webtoon mode): planner call -> code validation -> one NovelAI V5 image per image
 * panel (sequential, through the engine dispatcher and the ImageService queue; frame-break panels: cut-out + inpainted background)
 * -> layout, persisted after every step so
 * the chat view shows panels as they finish. Also single-panel reroll and text edits.
 * Vision check (vision.ts, when available): each stored take is checked in the background while the next panel draws;
 * face boxes are stored on the take, and a failed identity check gets one redraw (new seed, boosted identity tags),
 * drawn in the same sequential queue; the better-scoring take is shown.
 */
import { rpcError, type ChatDataDocument, type ComicFormat, type InlayConfig, type RpcError, type WebtoonPanelCheck, type WebtoonPanelTake, type WebtoonStripView } from "../../shared/contract/index.js";
import { isAbortLike, RpcFailure, toRpcError } from "../rpc/errors.js";
import type { BackendServices, ChatInfo } from "../services/types.js";
import { sleep } from "../services/util.js";
import type { BackendModules } from "../rpc/types.js";
import { openAutoGeneration, type AutoGeneration } from "../pipeline/auto.js";
import type { EnginePort } from "../pipeline/engine-port.js";
import { base64ToBytes, buildNovelAIRequest, bytesToBase64 } from "../pipeline/providers.js";
import type { ChatMessageView } from "../pipeline/host-chat.js";
import { buildPlannerPrompt, chosenOutfits, webtoonPanelRange, webtoonPanelTarget } from "./planner-prompt.js";
import { buildPanelRequest, CUTOUT_NEGATIVE, engineImageRequest, type PanelRequest, type WebtoonStyle } from "./panel-request.js";
import { buildMangaPlannerPrompt } from "./manga-planner-prompt.js";
import { isMonochromeStyle, monoCast, monoPanel, stripColours, withMonoTags } from "./manga-style.js";
import { mangaHardOk, validateMangaStoryboard } from "./manga-validate.js";
import { castFor, loadWebtoonContext, validationRoster, type RosterCharacter, type WebtoonContext } from "./roster.js";
import { profileGroups, resolveLooks, type ResolvedLooks } from "./looks.js";
import { isFurry } from "./panel-request.js";
import { characterGrid, decodePng, encodePng, flattenOver, frameBreakInputs, type RgbaImage } from "./cutout.js";
import type { ImagePanel } from "./storyboard-schema.js";
import { hardOk, validateStoryboard } from "./storyboard-validate.js";
import { createStripDocument, readStrip, stripView, takeOf, updateStrip, type PlannerCall, type WebtoonStripDocument } from "./store.js";
import { boostedRequest, checkPanel, visionConnection, type CastIdentity } from "./vision.js";

const MAX_PLANNER_CALLS = 3;
/** NovelAI Opus allows one generation at a time per account: "429 Concurrent generation is locked" while another client
 * (another tab, another app) draws. The dispatcher's quick retries are not enough; wait like the bench did. */
const LOCK_WAIT_MS = 4000;
const LOCK_RETRIES = 8;
const CONCURRENT_LOCK = /\b429\b|concurrent generation/iu;
/** One planner call may take 2 minutes (bench source c: 132 s). */
const PLANNER_TIMEOUT_MS = 300_000;
/** NovelAI V5 inpainting model (0 Anlas on Opus at panel sizes; nai-alpha bench). */
const INPAINT_MODEL = "nai-diffusion-5-full-inpainting";

export interface WebtoonDeps {
  services: BackendServices;
  engine: EnginePort;
  /** Outfit image generator of free-generated characters (as in normal mode); without it they are created tags-only. */
  getModules?: () => BackendModules;
  now?: () => number;
  /** Wait between attempts while NovelAI reports a concurrent generation (tests). */
  lockWaitMs?: number;
}

export interface WebtoonProgress {
  stage: "planning" | "generating" | "committing";
  /** Manga pages (toast wording). */
  manga?: boolean;
  /** Panels finished / total (generating). */
  done?: number;
  total?: number;
}

export interface WebtoonRunRequest {
  chatId: string;
  chat: ChatInfo;
  messages: ChatMessageView[];
  /** Index into `messages`. */
  target: number;
  historyId: string;
  planKey: string;
  /** Clean text of the target swipe. */
  source: string;
  config: InlayConfig;
  chatData: ChatDataDocument;
  signal: AbortSignal;
  /** Throws when the target message/swipe is no longer current. */
  assertTarget: () => Promise<void>;
  onProgress: (progress: WebtoonProgress) => void;
  /** The strip document changed (the controller emits chatData.changed). */
  onChanged: () => void;
  /** Retry: keep the stored storyboard and draw only the panels without an image. */
  resume?: boolean;
  /** Manga pages instead of the webtoon strip (a retry keeps the stored strip's format). */
  format?: ComicFormat;
}

export interface WebtoonRunResult {
  status: "complete" | "error" | "cancelled";
  error?: RpcError;
  failedPanels: number;
}

const aborted = () => new DOMException("Webtoon generation was cancelled.", "AbortError");

async function requireNovelAI(services: BackendServices) {
  const target = await services.images.resolveTarget();
  if (target.generationProvider !== "novelai")
    throw new RpcFailure(rpcError("unsupported", "Webtoon mode needs a NovelAI image connection.", { retryable: false }));
  return target;
}

interface PanelInput { request: PanelRequest; style: WebtoonStyle; seed: string; chatId: string; characterId: string; config: InlayConfig; signal: AbortSignal }

/** Retry while NovelAI reports a concurrent generation on the account. */
async function waitOutLock<T>(deps: WebtoonDeps, signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (signal.aborted || attempt >= LOCK_RETRIES || !CONCURRENT_LOCK.test(toRpcError(error).message)) throw error;
      // A cancel ends the wait at once (sleep only rejects on abort).
      await sleep(deps.lockWaitMs ?? LOCK_WAIT_MS, signal).catch(() => {
        throw aborted();
      });
    }
  }
}

/** One panel image through the engine dispatcher (NovelAI adapter, ImageService queue, dispatcher retries). */
async function generatePanel(deps: WebtoonDeps, input: PanelInput): Promise<WebtoonPanelTake> {
  const target = await requireNovelAI(deps.services);
  const result = await waitOutLock(deps, input.signal, () =>
    deps.engine.dispatch(
      engineImageRequest(input.request, input.style, input.seed),
      {
        engineProvider: "novelai",
        purpose: "chat",
        connectionId: target.connectionId,
        model: target.model,
        ownerChatId: input.chatId,
        ownerCharacterId: input.characterId,
        forceNsfwPrefix: () => false,
      },
      input.config,
      { signal: input.signal },
    ),
  );
  const meta = (result.providerMetadata ?? {}) as Record<string, unknown>;
  const imageId = String(meta.imageId ?? result.requestId ?? "").trim();
  if (!imageId) throw new Error("The image provider returned no image id.");
  const now = (deps.now ?? Date.now)();
  return takeOf(imageId, String(result.seed ?? ""), Math.round(Number(result.width) || input.request.width), Math.round(Number(result.height) || input.request.height), now);
}

/**
 * One NovelAI image straight through the ImageService: the engine request has no field for the raw override (infill) or a
 * second model. Same request building as the engine's NovelAI adapter. Returns the result and its PNG bytes.
 */
async function drawDirect(deps: WebtoonDeps, input: PanelInput & { prompt: string; model: string; connectionId: string; rawOverride?: Record<string, unknown> }) {
  const build = buildNovelAIRequest(engineImageRequest({ ...input.request, prompt: input.prompt }, input.style, input.seed), {
    purpose: "chat",
    connectionId: input.connectionId,
    model: input.model,
    ownerChatId: input.chatId,
    ownerCharacterId: input.characterId,
    forceNsfwPrefix: () => false,
  });
  const { retries: _engineRetries, ...request } = build.request;
  const novelai = { ...request.novelai, ...(input.rawOverride ? { rawOverride: input.rawOverride } : {}) };
  const result = await waitOutLock(deps, input.signal, () => deps.services.images.generate({ ...request, novelai, includeData: true }, { signal: input.signal }));
  if (!result.dataBase64) throw new Error("The image provider returned no image data.");
  return { result, bytes: base64ToBytes(result.dataBase64) };
}

/**
 * Frame-break panel (nai-alpha route 4): the character drawn on a transparent background, the scene inpainted around it,
 * the cut-out drawn over the flattened result. Both images are uploaded; the two raw generations are deleted.
 * Skipped (throws) when the connection's saved parameters cannot be read: our raw override would replace a saved one.
 */
async function generateFrameBreakPanel(deps: WebtoonDeps, input: PanelInput): Promise<WebtoonPanelTake> {
  const { services } = deps;
  const target = await requireNovelAI(services);
  if (!target.connectionDefaultsReadable) throw new Error("The NovelAI connection's saved parameters could not be read, so a saved raw override would be replaced.");
  const generated: string[] = [];
  try {
    const { cutout } = input.request;
    const cutRequest = {
      ...input.request,
      negativePrompt: `${input.request.negativePrompt}, ${CUTOUT_NEGATIVE}`,
      characters: input.request.characters.map((c, i) => ({ ...c, prompt: cutout!.characters[i] ?? c.prompt })),
    };
    const cut = await drawDirect(deps, { ...input, request: cutRequest, prompt: cutout!.prompt, model: target.model, connectionId: target.connectionId });
    generated.push(cut.result.imageId);
    const fb = await frameBreakInputs(await decodePng(cut.bytes));
    const rawOverride = { action: "infill", parameters: { image: bytesToBase64(fb.source), mask: bytesToBase64(fb.mask), add_original_image: true, inpaintImg2ImgStrength: 1, noise: 0 } };
    const bg = await drawDirect(deps, { ...input, seed: cut.result.seed, prompt: input.request.prompt, model: INPAINT_MODEL, connectionId: target.connectionId, rawOverride });
    generated.push(bg.result.imageId);
    const panel = flattenOver(await decodePng(bg.bytes), fb.cutout);
    const upload = async (image: RgbaImage, name: string) =>
      (await services.host.images.upload(
        { data: await encodePng(image), filename: `${name}.png`, mime_type: "image/png", owner_chat_id: input.chatId, ...(input.characterId ? { owner_character_id: input.characterId } : {}) },
        services.userId,
      )).id;
    const panelId = await upload(panel, `webtoon-panel-${input.request.panelId}`);
    const cutoutId = await upload(fb.display, `webtoon-cutout-${input.request.panelId}`);
    // Uploads are served by the session route only (the public results route serves image-gen files).
    const url = (id: string) => `/api/v1/images/${encodeURIComponent(id)}`;
    return {
      ...takeOf(panelId, cut.result.seed, panel.width, panel.height, (deps.now ?? Date.now)()),
      url: url(panelId),
      cutout: { imageId: cutoutId, url: url(cutoutId), bbox: fb.info.bbox!, mask: characterGrid(fb.cutout) },
    };
  } finally {
    if (generated.length) void services.images.deleteImages(generated.filter(Boolean)).catch(() => undefined);
  }
}

/** A frame-break panel falls back to the plain panel when either step fails. */
async function drawPanel(deps: WebtoonDeps, input: PanelInput): Promise<WebtoonPanelTake> {
  if (input.request.cutout) {
    try {
      return await generateFrameBreakPanel(deps, input);
    } catch (error) {
      if (input.signal.aborted || isAbortLike(error)) throw error;
      deps.services.log.append("warn", "webtoon", `Panel ${input.request.panelId}: frame-break skipped, drawing the plain panel`, { error: toRpcError(error).message });
    }
  }
  return generatePanel(deps, input);
}

async function plan(deps: WebtoonDeps, prompt: string, images: { min: number; max: number }, signal: AbortSignal, manga = false): Promise<{ raw: unknown; model: string; calls: PlannerCall[] }> {
  const calls: PlannerCall[] = [];
  let model = "";
  for (let attempt = 0; attempt < MAX_PLANNER_CALLS; attempt += 1) {
    if (signal.aborted) throw aborted();
    const started = Date.now();
    try {
      const result = await deps.services.llm.complete(
        { purpose: "webtoon-planner", messages: [{ role: "user", content: prompt }], responseMode: "json", settings: { timeoutMs: PLANNER_TIMEOUT_MS }, retries: 0 },
        { signal },
      );
      model = result.model;
      const ok = manga ? mangaHardOk(result.parsed, images) : hardOk(result.parsed, images);
      calls.push({ ms: result.latencyMs, finishReason: result.finishReason, parsed: true, hardOk: ok });
      if (ok) return { raw: result.parsed, model, calls };
    } catch (error) {
      if (signal.aborted || isAbortLike(error)) throw error;
      calls.push({ ms: Date.now() - started, finishReason: "", parsed: false, hardOk: false, error: toRpcError(error).message });
    }
  }
  const last = calls.at(-1);
  throw Object.assign(
    new RpcFailure(rpcError("provider-error", last?.error ? `The webtoon planner failed: ${last.error}` : `The webtoon planner returned no usable storyboard (${images.min} to ${images.max} image panels).`, { retryable: true })),
    { calls, model },
  );
}

/** The free character generation store of the speaking character, or null (unavailable: the planner adds no characters). */
async function openAuto(deps: WebtoonDeps, characterId: string): Promise<AutoGeneration | null> {
  try {
    return await openAutoGeneration(deps.services, deps.getModules, characterId);
  } catch (error) {
    deps.services.log.append("warn", "webtoon", "Free character generation is unavailable for this strip.", { error: toRpcError(error).message });
    return null;
  }
}

/**
 * New story characters of the planner through normal mode's autoCharacter path (AM QOt): stored as AI-generated custom
 * characters of the speaking character (reused by later strips and normal mode); the strip's cast uses their identity key.
 * A failure leaves them in this strip only.
 */
async function createStrangers(deps: WebtoonDeps, auto: AutoGeneration, context: WebtoonContext, resolved: ResolvedLooks, req: WebtoonRunRequest): Promise<void> {
  const byKey = new Map<string, RosterCharacter & { identityTags: string[] }>(resolved.strangers.map((s, i) => [`webtoon_free_${i + 1}`, s]));
  try {
    const prepared = await auto.autoCharacter.prepare({
      actors: [...byKey].map(([candidateKey, s]) => ({
        candidateKey,
        label: s.name,
        sex: s.gender || "unknown",
        profile: {
          recognitionKeys: [s.name],
          humanlike: !isFurry(s.identity),
          basePromptGroups: profileGroups(s.identityTags),
          defaultOutfit: { name: s.outfits[0]!.label, ...s.outfits[0]!.outfit },
        },
      })),
      signal: req.signal,
      owner: req,
      sourceId: context.characterId,
      knownIdentities: context.knownIdentities,
    });
    for (const p of prepared) {
      const s = byKey.get(p.candidateKey);
      if (s) s.key = p.identityKey;
    }
    await auto.autoCharacter.settle();
    resolved.log.push(`new characters: ${resolved.strangers.map((s) => `${s.name} (${s.key})`).join(", ")}`);
  } catch (error) {
    if (req.signal.aborted || isAbortLike(error)) throw error;
    deps.services.log.append("warn", "webtoon", "New characters could not be stored; they are drawn in this strip only.", { error: toRpcError(error).message });
  }
}

/** What the vision check of one run needs (see vision.ts). */
interface VisionRun {
  deps: WebtoonDeps;
  connectionId: string;
  cast: CastIdentity[];
  /** Manga in greyscale: no hair colour / glasses checks. */
  mono: boolean;
  chatId: string;
  historyId: string;
  signal: AbortSignal;
  onChanged: () => void;
}

/** The vision check for this run, or null (host without images in Decisions, no TypeSafe connection, lookup error): coordinates only. */
async function visionRun(deps: WebtoonDeps, config: InlayConfig, run: Omit<VisionRun, "deps" | "connectionId">): Promise<VisionRun | null> {
  try {
    const connectionId = await visionConnection(deps.services, config);
    return connectionId ? { deps, connectionId, ...run } : null;
  } catch (error) {
    deps.services.log.append("warn", "webtoon", "Vision check unavailable, balloons placed by coordinates", { error: toRpcError(error).message });
    return null;
  }
}

/**
 * Check a stored take and save the result on it. `redrawOf`: the take is the identity redraw of that take, and it is shown
 * instead when it scores better (and that take is still the one shown). Never throws.
 */
async function checkTake(v: VisionRun, panel: ImagePanel, take: WebtoonPanelTake, redrawOf?: { imageId: string; score: number }): Promise<WebtoonPanelCheck | null> {
  const { services } = v.deps;
  const check = await checkPanel(services, { connectionId: v.connectionId, imageId: take.imageId, width: take.width, height: take.height, panel, cast: v.cast, signal: v.signal, mono: v.mono });
  if (!check) return null;
  const id = String(panel.id);
  const chosen = !!redrawOf && check.score > redrawOf.score;
  try {
    await updateStrip(services.storage, v.chatId, v.historyId, (current) => {
      if (!current) throw new Error("The strip no longer exists.");
      const p = current.panels[id];
      const index = p ? p.takes.findIndex((t) => t.imageId === take.imageId) : -1;
      if (!p || index < 0) return current;
      p.takes[index]!.check = redrawOf ? { ...check, redraw: true } : check;
      if (chosen && p.takes[p.selected]?.imageId === redrawOf!.imageId) p.selected = index;
      return current;
    }, v.deps.now);
    v.onChanged();
  } catch (error) {
    services.log.append("warn", "webtoon", `Panel ${id}: the vision check could not be saved`, { error: toRpcError(error).message });
  }
  services.log.append("info", "webtoon", `Panel ${id}${redrawOf ? " (identity redraw)" : ""}: ${Object.keys(check.faces).length} face box(es), identity score ${check.score.toFixed(2)}${check.failed.length ? `, failed: ${check.failed.join("; ")}` : ""}${redrawOf ? (chosen ? ", shown" : ", first take kept") : ""}`);
  return check;
}

/** The one identity redraw of a panel: new seed, boosted identity tags; stored as another take (not shown until its check scores better). */
async function redrawIdentity(v: VisionRun, input: PanelInput, panel: ImagePanel, assertTarget?: () => Promise<void>): Promise<WebtoonPanelTake | null> {
  let take: WebtoonPanelTake;
  try {
    take = await drawPanel(v.deps, { ...input, request: boostedRequest(input.request, v.cast), seed: "" });
  } catch (error) {
    if (input.signal.aborted || isAbortLike(error)) throw error;
    v.deps.services.log.append("warn", "webtoon", `Panel ${panel.id}: identity redraw failed`, { error: toRpcError(error).message });
    return null;
  }
  await assertTarget?.();
  try {
    await updateStrip(v.deps.services.storage, v.chatId, v.historyId, (current) => {
      if (!current?.panels[String(panel.id)]) throw new Error("The strip no longer exists.");
      current.panels[String(panel.id)]!.takes.push(take);
      return current;
    }, v.deps.now);
  } catch (error) {
    v.deps.services.log.append("warn", "webtoon", `Panel ${panel.id}: the identity redraw could not be saved`, { error: toRpcError(error).message });
    return null;
  }
  v.onChanged();
  return take;
}

/** Plan and draw the strip of one message swipe. Never throws for panel failures (they are counted). */
export async function runWebtoonStrip(deps: WebtoonDeps, req: WebtoonRunRequest): Promise<WebtoonRunResult> {
  const { services } = deps;
  const now = deps.now ?? Date.now;
  // `mutate` edits the stored strip in place, or returns a whole new document that replaces it.
  const write = async (mutate: (doc: WebtoonStripDocument) => WebtoonStripDocument | void) => {
    const doc = await updateStrip(services.storage, req.chatId, req.historyId, (current) => {
      const next = current ?? createStripDocument({ chatId: req.chatId, messageKey: req.planKey, historyId: req.historyId, characterId: "", sourceLength: req.source.length, now: now() });
      return mutate(next) ?? next;
    }, now);
    req.onChanged();
    return doc;
  };
  let doc: WebtoonStripDocument | null = null;
  let manga = req.format === "manga";
  // A new plan replaces the strip at once (status planning); until its storyboard is saved, a cancel or failure puts the
  // previous strip back instead of leaving an empty one.
  let previous: WebtoonStripDocument | null = null;
  let replanning = false;
  try {
    await requireNovelAI(services);
    previous = await readStrip(services.storage, req.chatId, req.historyId);
    const resume = req.resume && previous?.storyboard && previous.style && Object.keys(previous.requests).length;
    if (resume) manga = previous!.format === "manga";
    req.onProgress({ stage: "planning", manga });
    let style: WebtoonStyle;
    let characterId: string;
    if (resume) {
      // Retry: keep the storyboard, draw only the panels without an image.
      style = previous!.style!;
      characterId = previous!.characterId;
      doc = await write((d) => {
        d.status = "generating";
        delete d.error;
      });
    } else {
      replanning = !!previous?.storyboard;
      const context = await loadWebtoonContext(services, { ...req, format: manga ? "manga" : "webtoon" });
      style = context.style;
      characterId = context.characterId;
      // Manga follows the artist style's colour: a greyscale / monochrome style strips colour words from every prompt part.
      const mono = manga && isMonochromeStyle(style.style);
      // A fresh document: nothing of the previous strip (its format, mono or error) carries over into the new plan.
      doc = await write(() => ({
        ...createStripDocument({ chatId: req.chatId, messageKey: req.planKey, historyId: req.historyId, characterId, sourceLength: req.source.length, now: now(), revision: previous?.revision ?? 0 }),
        ...(manga ? { format: "manga" as const, mono } : {}),
      }));
      // Free character generation (normal mode's rule): the per-character setting and the autoCharacter store.
      const auto = context.knownIdentities ? await openAuto(deps, characterId) : null;
      try {
        const freeCharacters = !!auto;
        let planned: Awaited<ReturnType<typeof plan>>;
        try {
          const panels = webtoonPanelTarget(req.source.length);
          const prompt = manga
            ? buildMangaPlannerPrompt({ roster: context.roster, source: req.source, panels, mono, freeCharacters })
            : buildPlannerPrompt({ roster: context.roster, source: req.source, panels, freeCharacters });
          planned = await plan(deps, prompt, webtoonPanelRange(panels), req.signal, manga);
        } catch (error) {
          const meta = error as { calls?: PlannerCall[]; model?: string };
          if (meta.calls) await write((d) => void (d.planner = { model: meta.model ?? "", calls: meta.calls! }));
          throw error;
        }
        await req.assertTarget();
        const resolved = resolveLooks(planned.raw, context.roster, auto ? context.knownIdentities!.flatMap((k) => [k.name, ...k.keys]) : null);
        if (auto && resolved.strangers.length) await createStrangers(deps, auto, context, resolved, req);
        const roster = resolved.roster;
        const outfitLog: string[] = [...resolved.log];
        const outfits = { ...chosenOutfits(planned.raw, roster.filter((r) => !resolved.outfits[r.name]), outfitLog), ...resolved.outfits };
        const validate = manga ? validateMangaStoryboard : validateStoryboard;
        const validated = validate(structuredClone(planned.raw), validationRoster(roster, outfits), req.source);
        validated.log.unshift(...outfitLog);
        const cast = mono ? monoCast(castFor(roster, outfits)) : castFor(roster, outfits);
        const planImages = validated.storyboard.panels.filter((p): p is ImagePanel => p.kind === "image");
        const request = (p: ImagePanel) => (mono ? withMonoTags(buildPanelRequest(monoPanel(p), cast, context.style)) : buildPanelRequest(p, cast, context.style));
        doc = await write((d) => {
          d.planner = { model: planned.model, calls: planned.calls };
          d.storyboardRaw = planned.raw;
          d.storyboard = validated.storyboard;
          d.validation = { log: validated.log, stats: validated.stats };
          d.cast = roster.map((r) => {
            const look = resolved.looks.get(r.key);
            return { name: r.name, key: r.key, outfitId: cast.get(r.name)?.outfitId ?? r.currentOutfitId, gender: r.gender, identity: mono ? stripColours(r.identity) : r.identity, ...(look ? { look } : {}) };
          });
          d.style = context.style;
          d.requests = Object.fromEntries(planImages.map((p) => [String(p.id), request(p)]));
          d.panels = Object.fromEntries(planImages.map((p) => [String(p.id), { panelId: String(p.id), status: "pending", takes: [], selected: -1 }]));
          d.status = "generating";
        });
        replanning = false;
      } finally {
        auto?.dispose();
      }
    }
    const requests = doc.requests;
    const images = (doc.storyboard?.panels ?? []).filter((p): p is ImagePanel => p.kind === "image" && !!requests[String(p.id)]);
    const todo = images.filter((p) => doc!.panels[String(p.id)]?.status !== "done");

    // Vision checks run in the background while the next panel draws; identity redraws join the sequential NovelAI queue.
    const vision = await visionRun(deps, req.config, { cast: doc.cast, mono: !!doc.mono, chatId: req.chatId, historyId: req.historyId, signal: req.signal, onChanged: req.onChanged });
    const background = new Set<Promise<unknown>>();
    const redraws: Array<() => Promise<void>> = [];
    const inBackground = (work: Promise<unknown>) => {
      background.add(work);
      void work.finally(() => background.delete(work));
    };
    const drainRedraws = async () => {
      for (let job = redraws.shift(); job; job = redraws.shift()) await job();
    };
    const afterTake = (v: VisionRun, panel: ImagePanel, input: PanelInput, take: WebtoonPanelTake) =>
      inBackground(
        checkTake(v, panel, take).then((check) => {
          if (!check?.failed.length) return;
          redraws.push(async () => {
            const redraw = await redrawIdentity(v, input, panel, req.assertTarget);
            if (redraw) inBackground(checkTake(v, panel, redraw, { imageId: take.imageId, score: check.score }));
          });
        }),
      );

    let failed = 0;
    for (const [index, panel] of todo.entries()) {
      if (req.signal.aborted) throw aborted();
      const id = String(panel.id);
      req.onProgress({ stage: "generating", done: images.length - todo.length + index, total: images.length, manga });
      try {
        const input: PanelInput = { request: requests[id]!, style, seed: "", chatId: req.chatId, characterId, config: req.config, signal: req.signal };
        const take = await drawPanel(deps, input);
        await req.assertTarget();
        doc = await write((d) => {
          const p = d.panels[id]!;
          p.takes.push(take);
          p.selected = p.takes.length - 1;
          p.status = "done";
          delete p.error;
        });
        if (vision) afterTake(vision, panel, input, take);
      } catch (error) {
        // A lost target ends the run (as the check after planning does) instead of failing every remaining panel.
        if (req.signal.aborted || isAbortLike(error) || (error as { name?: unknown } | null)?.name === "ChatResponseTargetChangedError") throw error;
        failed += 1;
        const message = toRpcError(error).message;
        doc = await write((d) => {
          d.panels[id] = { ...d.panels[id]!, status: "error", error: message };
        });
        services.log.append("warn", "webtoon", `Panel ${id} failed`, { chatId: req.chatId, historyId: req.historyId, error: message });
      }
      await drainRedraws();
    }
    while (background.size || redraws.length) {
      await Promise.all([...background]);
      await drainRedraws();
    }
    req.onProgress({ stage: "committing", done: images.length - failed, total: images.length, manga });
    const error = failed ? rpcError("provider-error", `${failed} webtoon panel(s) failed to generate.`, { retryable: true }) : undefined;
    await write((d) => {
      d.status = failed ? "error" : "complete";
      if (error) d.error = error.message;
      else delete d.error;
    });
    return { status: failed ? "error" : "complete", ...(error ? { error } : {}), failedPanels: failed };
  } catch (e) {
    const cancelled = req.signal.aborted || isAbortLike(e);
    const error = cancelled ? undefined : toRpcError(e);
    if (replanning && previous) {
      const restored = previous;
      await updateStrip(services.storage, req.chatId, req.historyId, () => structuredClone(restored), now)
        .then(() => req.onChanged())
        .catch(() => undefined);
    } else {
      await write((d) => {
        d.status = cancelled ? "cancelled" : "error";
        if (error) d.error = error.message;
      }).catch(() => undefined);
    }
    return cancelled ? { status: "cancelled", failedPanels: 0 } : { status: "error", error: error!, failedPanels: 0 };
  }
}

/** New take of one panel (random seed); the new take is selected (older takes stay, see `selectWebtoonTake`). */
export async function rerollWebtoonPanel(
  deps: WebtoonDeps,
  req: { chatId: string; historyId: string; panelId: string; config: InlayConfig; signal: AbortSignal; onChanged: () => void },
): Promise<WebtoonStripView> {
  const doc = await readStrip(deps.services.storage, req.chatId, req.historyId);
  const request = doc?.requests[req.panelId];
  if (!doc || !request || !doc.style) throw new RpcFailure(rpcError("not-found", "This webtoon panel has no image request.", { retryable: false }));
  const input: PanelInput = { request, style: doc.style, seed: "", chatId: req.chatId, characterId: doc.characterId, config: req.config, signal: req.signal };
  const take = await drawPanel(deps, input);
  if (req.signal.aborted) throw aborted();
  let written = await updateStrip(deps.services.storage, req.chatId, req.historyId, (current) => {
    const d = current ?? doc;
    const p = d.panels[req.panelId] ?? { panelId: req.panelId, status: "pending" as const, takes: [], selected: -1 };
    p.takes.push(take);
    p.selected = p.takes.length - 1;
    p.status = "done";
    delete p.error;
    d.panels[req.panelId] = p;
    return d;
  }, deps.now);
  req.onChanged();
  // Same vision check as a strip run, awaited here (one panel): face boxes, and one identity redraw when the check fails.
  const panel = doc.storyboard?.panels.find((p): p is ImagePanel => p.kind === "image" && String(p.id) === req.panelId);
  const vision = panel ? await visionRun(deps, req.config, { cast: doc.cast, mono: !!doc.mono, chatId: req.chatId, historyId: req.historyId, signal: req.signal, onChanged: req.onChanged }) : null;
  if (vision && panel) {
    const check = await checkTake(vision, panel, take);
    if (check?.failed.length) {
      const redraw = await redrawIdentity(vision, input, panel);
      if (redraw) await checkTake(vision, panel, redraw, { imageId: take.imageId, score: check.score });
    }
    written = (await readStrip(deps.services.storage, req.chatId, req.historyId)) ?? written;
  }
  return stripView(written);
}

/** Show another take of one panel (a previous reroll); the strip is laid out again with that image's size. */
export async function selectWebtoonTake(
  deps: WebtoonDeps,
  req: { chatId: string; historyId: string; panelId: string; take: number; width?: number },
): Promise<WebtoonStripView> {
  const written = await updateStrip(deps.services.storage, req.chatId, req.historyId, (current) => {
    const panel = current?.panels[req.panelId];
    if (!current || !panel?.takes[req.take]) throw new RpcFailure(rpcError("not-found", "This webtoon panel take does not exist.", { retryable: false }));
    panel.selected = req.take;
    return current;
  }, deps.now);
  return stripView(written, req.width);
}

/** Replace the text of one text item (the original text again removes the override). */
export async function editWebtoonText(
  deps: WebtoonDeps,
  req: { chatId: string; historyId: string; panelId: string; textIndex: number; text: string; width?: number },
): Promise<WebtoonStripView> {
  const text = req.text.replace(/\s+/gu, " ").trim();
  if (!text) throw new RpcFailure(rpcError("bad-request", "The text is empty.", { retryable: false }));
  const written = await updateStrip(deps.services.storage, req.chatId, req.historyId, (current) => {
    const panel = current?.storyboard?.panels.find((p) => String(p.id) === req.panelId);
    const original = panel?.text[req.textIndex];
    if (!current || !original) throw new RpcFailure(rpcError("not-found", "This webtoon text item does not exist.", { retryable: false }));
    const key = `${req.panelId}:${req.textIndex}`;
    if (text === original.text) delete current.textOverrides[key];
    else current.textOverrides[key] = text;
    return current;
  }, deps.now);
  return stripView(written, req.width);
}
