/**
 * Outfit / reference image generation (spec/novelai.md §9 F): AM `fOt.generate` L178913 (characters), `hOt.generate`
 * L179147 (personas), manual editor controller L105242-105640 (history of 8 results `qct`, nsfw prefix `Yct`, add/replace).
 * The prompt recipe runs on the verbatim AM helpers (`Ky` artist, `ki` charx settings, `xj` pose tags, `uOt`/`pOt` part
 * weights, `g2` provider codec, `C7` NSFW prefix); the request goes to Lumiverse through `ImageService.generate`.
 */
import {
  addOutfit,
  compileMainPrompt,
  createEmptyCharacterDocument,
  createGeneratedAssetName,
  toStoredAssetRef,
  normalizeFormCollection,
  patchOutfit,
  randomUuid,
  resolveCharacterForms,
  resolvePersonaForms,
  type AssetRef,
  type FormCollection,
  type OutfitImageDraft,
  type OutfitImageResult,
  type OutfitImageTarget,
  type ProgressInfo,
  type RpcParams,
  type RpcResult,
} from "../../shared/contract/index.js";
import { applyNonArtistWeightToRequest } from "../../engine/compose/weights.js";
import { fail, isAbortLike, toRpcError } from "../rpc/errors.js";
import type { BackendServices, ImageGenerateRequest } from "../services/types.js";
import { AM, amFn } from "./core/index.js";
import { buildAmConfig, loadAmConfigParts } from "./bridge/config-store.js";
import { buildRuntimeSource, bytesToBase64, readAssetBytes } from "./bridge/session.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export const OUTFIT_IMAGE_WIDTH = 832;
export const OUTFIT_IMAGE_HEIGHT = 1216;
/** AM `qct` L105242. */
export const OUTFIT_HISTORY_LIMIT = 8;

export const CHARACTER_OUTFIT_HISTORY_PATH = (characterId: string) => `characters/${encodeURIComponent(characterId)}/outfit-images.json`;
export const PERSONA_OUTFIT_HISTORY_PATH = "config/persona-outfit-images.json";

interface HistoryFile {
  version: 1;
  /** `<promptKey|personaId>|<formId>|<outfitId>` -> newest first. */
  targets: Record<string, OutfitImageResult[]>;
}

const historyKey = (target: OutfitImageTarget, formId: string, outfitId?: string) => `${target.kind === "character" ? target.promptKey : target.personaId}|${formId}|${outfitId ?? ""}`;
const historyPath = (target: OutfitImageTarget) => (target.kind === "character" ? CHARACTER_OUTFIT_HISTORY_PATH(target.characterId) : PERSONA_OUTFIT_HISTORY_PATH);
const emptyHistory = (): HistoryFile => ({ version: 1, targets: {} });

export interface OutfitPromptPlan {
  positivePrompt: string;
  negativePrompt: string;
  /** NovelAI char caption (AM `characterPrompts[0]`). */
  characterPrompt: string;
  characterNegativePrompt: string;
  provider: string;
  anima: boolean;
  artist: Any;
  charx: Any;
  referenceAllowed: boolean;
  novelAIOverrides: Record<string, unknown>;
  nonArtistConfig: Record<string, unknown>;
}

/** Context resolved from the target (form, outfit, names, character reference). */
export interface OutfitTargetContext {
  sourceId: string;
  promptKey: string;
  characterName: string;
  collection: FormCollection;
  formId: string;
  gender: string;
  humanlike: boolean;
  mainPrompt: string;
  formNegativePrompt: string;
  reference: AssetRef | null;
  persona: boolean;
}

/** AM positive / negative recipe (fOt L178940-178953, hOt L179153-179167). */
export function buildOutfitPrompt(config: Any, ctx: OutfitTargetContext, draft: OutfitImageDraft): OutfitPromptPlan {
  const provider = config.runtime.generationProvider;
  const charx = AM.ki(config, ctx.sourceId);
  const anima = AM.Nc(provider) === true;
  const artist = AM.Ky(config, { sourceId: ctx.sourceId, promptKey: ctx.persona ? `persona:${ctx.promptKey}` : ctx.promptKey });
  const parts = { head: draft.head, top: draft.top, bottom: draft.bottom, legs: draft.legs, feet: draft.feet, humanlike: ctx.humanlike };
  const gender = ctx.gender === "male" ? "1boy" : ctx.gender === "female" ? "1girl" : "";
  const pose = ctx.humanlike === false ? AM.xj.freeform : AM.xj.humanlike;
  let positivePrompt: string;
  let negativePrompt: string;
  let mainPrompt: string;
  if (ctx.persona) {
    mainPrompt = draft.nsfw ? AM.e4(["nsfw", ctx.mainPrompt]) : ctx.mainPrompt;
    positivePrompt = AM.e4([artist.prompt, gender, ...pose, anima ? "" : charx.fixedPositivePrompt, mainPrompt, AM.pOt(config, parts)]);
    if (!positivePrompt) fail("bad-request", "No prompt available for persona outfit generation.", { messageKo: "페르소나 의상 생성에 사용할 프롬프트가 없습니다." });
    negativePrompt = AM.e4([anima ? "" : charx.negativePrompt, anima ? "" : artist.negativePrompt, ctx.formNegativePrompt]);
  } else {
    mainPrompt = AM.Yct(ctx.mainPrompt, draft.nsfw === true);
    positivePrompt = AM.Cq([artist.prompt, gender, ...pose, anima ? "" : charx.fixedPositivePrompt, mainPrompt, AM.uOt(config, parts)]);
    if (!positivePrompt) fail("bad-request", "No prompt available for outfit generation.", { messageKo: "의상 생성에 사용할 프롬프트가 없습니다." });
    negativePrompt = anima ? "" : AM.Cq([charx.negativePrompt, artist.negativePrompt]);
  }
  const referenceAllowed = AM.Tu(provider, config.novelai.characterReferenceEnabled, config.runtime.comfyuiCharacterReferenceEnabled) === true;
  return {
    positivePrompt,
    negativePrompt,
    characterPrompt: mainPrompt || ctx.characterName || ctx.promptKey || (ctx.persona ? "persona" : "character"),
    characterNegativePrompt: ctx.formNegativePrompt,
    provider,
    anima,
    artist,
    charx,
    referenceAllowed,
    novelAIOverrides: { ...(artist.novelAIOverrides ?? {}) },
    nonArtistConfig: { nonArtistPromptWeight: artist.nonArtistPromptWeight, nonArtistPromptWeightArtist: { id: artist.id, name: artist.name, positive: artist.prompt, negative: artist.negativePrompt } },
  };
}

/** AM `qge` L111082 provider prompt: `g2` codec (anima prefixes) + `C7` NSFW prefix policy. */
export function providerPromptFor(config: Any, plan: OutfitPromptPlan): { positivePrompt: string; negativePrompt: string } {
  const provider = plan.provider;
  const prompt = AM.C7(
    AM.g2({
      provider,
      plan: { globalPositive: plan.positivePrompt.trim(), bodyAction: "", negativePrompt: plan.negativePrompt, characters: [] },
      novelAIModel: config.novelai.naiModel,
      comfyUIProfile: provider === "comfy-ui" ? AM.t7(config.runtime.comfyuiWorkflowProfileId) : null,
      outfitReferenceEnabled: false,
      animaPositivePrefix: plan.charx.animaPositivePrompt,
      animaNegativePrefix: plan.charx.animaNegativePrompt,
    }),
    plan.charx.nsfwAlwaysEnabled === true,
  );
  return { positivePrompt: String(prompt.positivePrompt ?? ""), negativePrompt: String(prompt.negativePrompt ?? "") };
}

async function resolveTargetContext(services: BackendServices, config: Any, target: OutfitImageTarget, formId: string, draft: OutfitImageDraft): Promise<OutfitTargetContext> {
  if (target.kind === "character") {
    const cp = config.characterPrompt;
    const collection = resolveCharacterForms(cp, target.promptKey);
    const form = collection.forms.find((f) => f.id === formId);
    if (!form) fail("not-found", "The target form no longer exists.", { messageKo: "대상 폼 또는 의상이 변경되어 생성 결과를 폐기했습니다." });
    let characterName = target.promptKey;
    try {
      const source = await buildRuntimeSource(services, target.characterId, null);
      for (const m of source.members) for (const l of m.lorebooks) if (amFn("Fs")(m, l) === target.promptKey) characterName = l.title || characterName;
    } catch {
      /* name only */
    }
    return {
      sourceId: target.characterId,
      promptKey: target.promptKey,
      characterName,
      collection,
      formId: form.id,
      gender: form.gender,
      humanlike: form.humanlike !== false,
      mainPrompt: compileMainPrompt(form.basePromptGroups, form.gender),
      formNegativePrompt: form.negativePrompt,
      reference: draft.useCharacterReference && form.reference?.defaultAsset ? (AM.pn(form.reference.defaultAsset) as AssetRef) : null,
      persona: false,
    };
  }
  const sourceId = target.characterId || (await services.sources.getActiveChat().catch(() => null))?.characterId || "";
  const settings = config.characterPrompt.personaSettings;
  const collection = resolvePersonaForms(settings, config.characterPrompt.personaGender, target.personaId);
  const form = collection.forms.find((f) => f.id === formId);
  if (!form) fail("not-found", "The target form no longer exists.");
  const persona = (await services.sources.listPersonas()).find((p) => p.personaId === target.personaId);
  const fallbackReference = persona?.avatarImageId ? { name: `${persona.name}.png`, key: persona.avatarImageId, extension: "png", sourceType: "persona", moduleId: "", moduleName: "" } : null;
  return {
    sourceId,
    promptKey: target.personaId,
    characterName: persona?.name ?? target.personaId,
    collection,
    formId: form.id,
    gender: form.gender,
    humanlike: form.humanlike !== false,
    mainPrompt: compileMainPrompt(form.basePromptGroups, form.gender),
    formNegativePrompt: form.negativePrompt,
    reference: draft.useCharacterReference ? ((form.reference?.defaultAsset ? AM.pn(form.reference.defaultAsset) : fallbackReference) as AssetRef | null) : null,
    persona: true,
  };
}

/** Bytes of a reference (the crop when the reference carries one). */
async function referenceBytes(services: BackendServices, asset: AssetRef): Promise<{ data: string; mimeType: string }> {
  const crop = asset.cropReference as { assetKey?: string; assetName?: string } | undefined;
  const source = crop?.assetKey ? { ...asset, key: crop.assetKey, name: crop.assetName ?? asset.name, extension: "png" } : asset;
  const bytes = await readAssetBytes(services, source);
  return { data: bytesToBase64(bytes.data), mimeType: bytes.mimeType };
}

/** Build the ImageService request (exported for tests). */
export async function buildOutfitImageRequest(services: BackendServices, target: OutfitImageTarget, formId: string, draft: OutfitImageDraft): Promise<{ request: ImageGenerateRequest; plan: OutfitPromptPlan; context: OutfitTargetContext }> {
  const characterId = target.kind === "character" ? target.characterId : target.characterId || (await services.sources.getActiveChat().catch(() => null))?.characterId || "";
  const imageTarget = await services.images.resolveTarget();
  const parts = characterId ? await loadAmConfigParts(services, characterId) : { global: await services.storage.loadConfig(), document: createEmptyCharacterDocument(""), metadata: {} };
  const config = buildAmConfig(parts);
  config.runtime = { ...config.runtime, generationProvider: imageTarget.generationProvider };
  config.novelai = { ...config.novelai, naiModel: imageTarget.model };
  if (!AM.up(imageTarget.generationProvider)) fail("unsupported", "The selected provider does not support outfit image generation.");
  const context = await resolveTargetContext(services, config, target, formId, draft);
  const plan = buildOutfitPrompt(config, context, draft);
  const prompt = providerPromptFor(config, plan);
  const useReference = !!(plan.referenceAllowed && draft.useCharacterReference && context.reference);
  const seed = draft.seedFixed ? String(draft.seed ?? "").trim() : "";
  const request: ImageGenerateRequest = {
    purpose: "outfit",
    prompt: prompt.positivePrompt,
    negativePrompt: prompt.negativePrompt,
    width: OUTFIT_IMAGE_WIDTH,
    height: OUTFIT_IMAGE_HEIGHT,
    seed,
    ...(characterId ? { ownerCharacterId: characterId } : {}),
  };
  if (imageTarget.generationProvider === "novelai") {
    // Non-artist weight (AM `Cut` in the NovelAI client) on the request texts + char caption.
    const body = {
      input: request.prompt,
      parameters: {
        negative_prompt: request.negativePrompt,
        v4_prompt: { caption: { base_caption: request.prompt, char_captions: [{ char_caption: plan.characterPrompt, centers: [{ x: 0.5, y: 0.5 }] }] } },
        v4_negative_prompt: { caption: { base_caption: request.negativePrompt, char_captions: [{ char_caption: plan.characterNegativePrompt, centers: [{ x: 0.5, y: 0.5 }] }] } },
      },
    };
    let weighted = body;
    try {
      weighted = applyNonArtistWeightToRequest(body, plan.nonArtistConfig).body as typeof body;
    } catch (error) {
      services.log.append("warn", "outfit-image", `Non-artist weight not applied: ${error instanceof Error ? error.message : String(error)}`);
    }
    request.prompt = weighted.input;
    request.negativePrompt = weighted.parameters.negative_prompt;
    const overrides = plan.novelAIOverrides as { steps?: number; scale?: number; cfgRescale?: number };
    request.novelai = {
      ...(overrides.steps !== undefined ? { steps: overrides.steps } : {}),
      ...(overrides.scale !== undefined ? { scale: overrides.scale } : {}),
      ...(overrides.cfgRescale !== undefined ? { cfgRescale: overrides.cfgRescale } : {}),
      useCoords: false,
      characters: [
        {
          prompt: weighted.parameters.v4_prompt.caption.char_captions[0]!.char_caption,
          negativePrompt: weighted.parameters.v4_negative_prompt.caption.char_captions[0]!.char_caption,
          center: { x: 0.5, y: 0.5 },
        },
      ],
      ...(useReference && context.reference
        ? {
            characterReferences: [
              {
                ...(await referenceBytes(services, context.reference)),
                type: config.novelai.characterReferenceType ?? "character",
                strength: Number.isFinite(config.novelai.characterReferenceStrength) ? config.novelai.characterReferenceStrength : 0.6,
                fidelity: Number.isFinite(config.novelai.characterReferenceFidelity) ? config.novelai.characterReferenceFidelity : 1,
              },
            ],
          }
        : {}),
    };
  } else if (imageTarget.generationProvider === "comfy-ui" && useReference && context.reference) {
    request.comfy = { sourceImage: await referenceBytes(services, context.reference) };
  }
  return { request, plan, context };
}

export interface OutfitImageController {
  generate(params: RpcParams<"outfitImage.generate">): Promise<{ jobId: string }>;
  history(params: RpcParams<"outfitImage.history">): Promise<RpcResult<"outfitImage.history">>;
  save(params: RpcParams<"outfitImage.save">): Promise<RpcResult<"outfitImage.save">>;
  cancelAll(): void;
  dispose(): void;
}

export function createOutfitImageController(services: BackendServices): OutfitImageController {
  const jobs = new Map<string, AbortController>();
  let disposed = false;

  const progress = (jobId: string, p: ProgressInfo) => services.events.emit("outfitImage.progress", { jobId, progress: p });

  const appendHistory = async (target: OutfitImageTarget, formId: string, outfitId: string | undefined, result: OutfitImageResult) => {
    const key = historyKey(target, formId, outfitId);
    await services.storage.updateJson<HistoryFile>(historyPath(target), emptyHistory(), (current) => {
      const file = current && typeof current === "object" && current.targets ? current : emptyHistory();
      return { version: 1, targets: { ...file.targets, [key]: [result, ...(file.targets[key] ?? [])].slice(0, OUTFIT_HISTORY_LIMIT) } };
    });
  };

  const readHistory = async (target: OutfitImageTarget, formId: string, outfitId?: string): Promise<OutfitImageResult[]> => {
    const file = await services.storage.readJson<HistoryFile>(historyPath(target), emptyHistory());
    return [...(file?.targets?.[historyKey(target, formId, outfitId)] ?? [])];
  };

  return {
    async generate(params) {
      if (disposed) fail("internal", "The outfit image module was disposed.");
      const jobId = `outfit-${randomUuid()}`;
      const controller = new AbortController();
      jobs.set(jobId, controller);
      void (async () => {
        try {
          progress(jobId, { label: "Preparing outfit image", labelKo: "의상 이미지 생성 준비 중", fraction: 0 });
          const { request } = await buildOutfitImageRequest(services, params.target, params.formId, params.draft);
          controller.signal.throwIfAborted();
          progress(jobId, { label: "Generating outfit image", labelKo: "의상 이미지 생성 중", fraction: 0.1 });
          const generated = await services.images.generate(request, { signal: controller.signal, onProgress: (p) => progress(jobId, p) });
          const result: OutfitImageResult = {
            resultId: `${Date.now().toString(36)}-${generated.seed}-${randomUuid().slice(0, 8)}`,
            imageId: generated.imageId,
            url: generated.url,
            seed: String(generated.seed ?? ""),
            width: generated.width,
            height: generated.height,
            positivePrompt: request.prompt,
            negativePrompt: request.negativePrompt,
            createdAt: new Date().toISOString(),
          };
          await appendHistory(params.target, params.formId, params.outfitId, result);
          services.events.emit("outfitImage.finished", { jobId, result });
        } catch (error) {
          const rpc = isAbortLike(error) || controller.signal.aborted ? { code: "cancelled" as const, message: "Outfit image generation was cancelled." } : toRpcError(error);
          if (rpc.code !== "cancelled") services.log.append("error", "outfit-image", `Outfit image generation failed: ${rpc.message}`, rpc);
          services.events.emit("outfitImage.finished", { jobId, error: rpc });
        } finally {
          jobs.delete(jobId);
        }
      })();
      return { jobId };
    },

    async history(params) {
      return { results: await readHistory(params.target, params.formId, params.outfitId) };
    },

    /** Add selected results as new outfits, or replace the current outfit (editor L105560+). */
    async save(params) {
      // Results are looked up across the form (the editor may switch outfits between generate and save).
      const file = await services.storage.readJson<HistoryFile>(historyPath(params.target), emptyHistory());
      const prefix = historyKey(params.target, params.formId, "");
      const results = Object.entries(file?.targets ?? {}).flatMap(([key, list]) => (key.startsWith(prefix) ? list : []));
      const chosen = params.resultIds.map((id) => results.find((r) => r.resultId === id)).filter((r): r is OutfitImageResult => !!r);
      if (!chosen.length) fail("not-found", "The selected outfit images are no longer in the history.");
      const draft = params.draft;
      const persona = params.target.kind === "persona";
      const assetFor = (r: OutfitImageResult): AssetRef => ({
        name: createGeneratedAssetName({ label: `${draft.label || "Outfit"}`, kind: "outfit" }),
        key: r.imageId,
        extension: "png",
        sourceType: "generated",
        moduleId: "",
        moduleName: "",
        ...(params.target.kind === "character" ? { characterTarget: { chaId: params.target.characterId } } : {}),
      });
      const partsOf = { head: draft.head, top: draft.top, bottom: draft.bottom, legs: draft.legs, feet: draft.feet, ...(draft.description !== undefined ? { description: draft.description } : {}) };
      const apply = (collection: FormCollection): FormCollection => {
        let next = normalizeFormCollection(collection);
        if (params.mode === "replace") {
          const outfitId = params.outfitId ?? next.forms.find((f) => f.id === params.formId)?.defaultOutfitId ?? "";
          const stored = toStoredAssetRef(assetFor(chosen[0]!));
          next = patchOutfit(next, params.formId, outfitId, { ...partsOf, label: draft.label, ...(persona ? { imageAsset: stored } : { referenceAsset: stored, referenceEnabled: true }) } as Any);
        } else {
          for (const r of chosen) {
            const stored = toStoredAssetRef(assetFor(r));
            next = addOutfit(next, params.formId, { label: draft.label, patch: { ...partsOf, candidateEnabled: true, ...(persona ? { imageAsset: stored } : { referenceAsset: stored, referenceEnabled: true }) } as Any }).collection;
          }
        }
        return next;
      };
      if (params.target.kind === "character") {
        const { characterId, promptKey } = params.target;
        const base = await services.storage.loadCharacterDocument(characterId);
        let saved: FormCollection | null = null;
        await services.storage.updateCharacterDocument(
          characterId,
          (doc) => {
            const current = resolveCharacterForms(doc.characterPrompt, promptKey);
            saved = apply(current);
            return { ...doc, characterPrompt: { ...doc.characterPrompt, characterForms: { ...doc.characterPrompt.characterForms, [promptKey]: saved } } };
          },
          { expectedUpdatedAt: base.updatedAt, reason: "outfit-image" },
        );
        return { collection: saved! };
      }
      const personaId = params.target.personaId;
      let saved: FormCollection | null = null;
      await services.storage.updateConfig((config) => {
        const settings = config.characterPrompt.personaSettings;
        saved = apply(resolvePersonaForms(settings, config.characterPrompt.personaGender, personaId));
        const profile = { ...(settings.profiles[personaId] ?? {}), forms: saved };
        return { ...config, characterPrompt: { ...config.characterPrompt, personaSettings: { ...settings, profiles: { ...settings.profiles, [personaId]: profile } } } };
      });
      return { collection: saved! };
    },

    cancelAll() {
      for (const c of jobs.values()) c.abort();
    },
    dispose() {
      disposed = true;
      for (const c of jobs.values()) c.abort();
    },
  };
}

