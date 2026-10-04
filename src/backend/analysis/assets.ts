/**
 * Assets tab / picker RPCs: asset list (AM `priorityAssets.getPage`), selections and references (AM `Hy` L97762),
 * metadata inspection (AM reader `Int` L87689), meta-check records, uploads and reference crops.
 */
import {
  CROP_ASSET_NAME_PREFIX,
  STORAGE_PATHS,
  normalizeAssetRef,
  randomUuid,
  type AssetFilter,
  type AssetListItem,
  type AssetPage,
  type AssetRef,
  type CropReference,
  type MetadataSummary,
  type RpcParams,
  type StoredAssetRef,
} from "../../shared/contract/index.js";
import { fail } from "../rpc/errors.js";
import type { AmSource, BackendServices, CharacterImageAsset } from "../services/types.js";
import { AM, amFn } from "./core/index.js";
import { AmConfigStore, loadAmConfigParts, metadataCachePath, mutateAmConfig, type AmConfig } from "./bridge/config-store.js";
import { createAmPriorityAssets, type AmAssetEntry } from "./bridge/asset-index.js";
import { STORAGE_ASSET_PREFIX, base64ToBytes, bytesToBase64, openAnalysisSession, readAssetBytes } from "./bridge/session.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const AM_FILTER: Record<Exclude<AssetFilter, "generated">, string> = {
  all: "all",
  candidate: "candidate",
  chat: "chat-generated",
  outfit: "outfit-generated",
  original: "original",
};

/** Asset list of one roster row / member (AM picker pages; cursor = offset). */
export async function listAssets(services: BackendServices, params: RpcParams<"assets.list">): Promise<AssetPage> {
  const { characterId } = params;
  const [parts, images] = await Promise.all([loadAmConfigParts(services, characterId), services.sources.listCharacterImages(characterId, { includeGenerated: true }).catch(() => [] as CharacterImageAsset[])]);
  const rawSource = await services.sources.buildSource(characterId, parts.document);
  const source = (amFn("rI")(rawSource, parts.document.customCharacters, "all") ?? rawSource) as AmSource;
  const store = new AmConfigStore(services, characterId, parts, "assets");
  const index = createAmPriorityAssets(store, (id) => (id === source.id ? source : null));
  const promptKey = params.promptKey ?? "";
  const memberKey = params.memberKey ?? memberKeyOf(source, promptKey) ?? source.members[0]?.key ?? characterId;
  const descriptor = { sourceId: characterId, memberKey, promptKey, metadataOnly: params.metadataOnly === true };
  const entries: AmAssetEntry[] =
    params.filter === "generated"
      ? [...pageAll(index, { ...descriptor, filter: "chat-generated" }), ...pageAll(index, { ...descriptor, filter: "outfit-generated" })]
      : pageAll(index, { ...descriptor, filter: AM_FILTER[params.filter] ?? "all" });
  const candidates = promptKey ? new Set(pageAll(index, { ...descriptor, filter: "candidate" }).map((e) => e.assetKey)) : new Set<string>();
  const selection = promptKey ? new Set((AM.Ai(parts.document.characterPrompt.assetSelections[promptKey]?.selectedAssets ?? []) as Any[]).map((a) => AM.Wt(a))) : new Set<string>();
  const byKey = new Map<string, CharacterImageAsset>();
  for (const image of images) {
    byKey.set(image.imageId, image);
    if (image.asset?.key) byKey.set(image.asset.key, image);
  }
  const offset = Math.max(0, Number.parseInt(params.cursor ?? "0", 10) || 0);
  const limit = Math.max(1, Math.min(500, Math.floor(params.limit ?? 60)));
  const items: AssetListItem[] = entries.slice(offset, offset + limit).map((entry) => {
    const image = byKey.get(entry.asset.key);
    return {
      asset: normalizeAssetRef(entry.asset),
      kind: entry.generatedKind,
      url: image?.url ?? "",
      thumbnailUrl: image?.thumbnailUrl || image?.url || "",
      ...(image?.width ? { width: image.width } : {}),
      ...(image?.height ? { height: image.height } : {}),
      ...(entry.metadataState === "unknown" ? {} : { hasMetadata: entry.hasMetadata }),
      selected: selection.has(entry.assetKey),
      candidate: candidates.has(entry.assetKey),
    };
  });
  return { items, nextCursor: offset + limit < entries.length ? String(offset + limit) : null, total: entries.length };
}

function pageAll(index: ReturnType<typeof createAmPriorityAssets>, descriptor: Any): AmAssetEntry[] {
  const count = index.getViewSnapshot(descriptor).count;
  return count ? index.getPage(descriptor, 0, count) : [];
}

function memberKeyOf(source: AmSource, promptKey: string): string | null {
  if (!promptKey) return null;
  for (const member of source.members) for (const lore of member.lorebooks) if (amFn("Fs")(member, lore) === promptKey) return member.key;
  return null;
}

/** AM selection target (`nb` L133066 shape). */
function selectionTarget(characterId: string, promptKey: string) {
  return { kind: "asset-selection", sourceId: characterId, memberKey: "", lorebookId: "", promptKey, formId: "form_default", personaKey: "", outfitId: "" };
}

export async function setSelection(services: BackendServices, characterId: string, promptKey: string, assets: StoredAssetRef[]): Promise<void> {
  if (!promptKey) fail("bad-request", "promptKey is required.");
  await mutateAmConfig(services, characterId, (c) => AM.Hy(c, selectionTarget(characterId, promptKey), assets.map((a) => AM.pn(a))), { reason: "asset-selection" });
}

/** AM `cve` L133144 ("clear all image selections"). */
export async function clearSelections(services: BackendServices, characterId: string, promptKeys?: string[]): Promise<void> {
  await mutateAmConfig(
    services,
    characterId,
    (c) => {
      const keys = promptKeys?.length ? promptKeys : Object.keys(c.characterPrompt.assetSelections ?? {});
      return keys.reduce((acc: AmConfig, pk) => {
        const current = AM.yf(acc, selectionTarget(characterId, pk));
        return current.assets.length || current.assetNames.length ? AM.Hy(acc, selectionTarget(characterId, pk), []) : acc;
      }, c);
    },
    { reason: "asset-selection" },
  );
}

type ReferenceTarget = RpcParams<"assets.setReference">["target"];

/** Picker reference targets -> AM `Hy` kinds (character-reference / outfit-reference / persona-* / artist-reference). */
export async function setReference(services: BackendServices, target: ReferenceTarget, asset: StoredAssetRef | null): Promise<void> {
  const list = asset ? [AM.pn(asset)] : [];
  if (target.kind === "persona") {
    const characterId = (target as { characterId?: string }).characterId || (await services.sources.getActiveChat())?.characterId;
    if (!characterId) fail("bad-request", "Open a chat (or pass characterId) to set a persona reference: persona references are stored per character.");
    const amTarget = target.outfitId
      ? { kind: "persona-outfit-reference", sourceId: characterId, personaKey: target.personaId, formId: target.formId ?? "form_default", outfitId: target.outfitId }
      : { kind: "persona-reference", sourceId: characterId, personaKey: target.personaId, formId: target.formId ?? "" };
    await mutateAmConfig(services, characterId, (c) => AM.Hy(c, amTarget, list), { reason: "persona-reference" });
    return;
  }
  const characterId = target.characterId;
  const amTarget =
    target.kind === "artist-extraction"
      ? { kind: "artist-reference", sourceId: characterId, memberKey: "", promptKey: "", formId: "", outfitId: "" }
      : target.kind === "character-form"
        ? { kind: "character-reference", sourceId: characterId, promptKey: target.promptKey, formId: target.formId, outfitId: "" }
        : { kind: "outfit-reference", sourceId: characterId, promptKey: target.promptKey, formId: target.formId, outfitId: target.outfitId };
  await mutateAmConfig(services, characterId, (c) => AM.Hy(c, amTarget, list), { reason: "reference" });
}

/** AM metadata reader `inspect` (PNG tEXt/iTXt/zTXt NovelAI `Comment`, SD parameters, JPEG/WebP EXIF; summary `cB`). */
export async function inspectMetadata(services: BackendServices, characterId: string, asset: AssetRef): Promise<{ hasMetadata: boolean; summary: MetadataSummary | null; raw?: unknown }> {
  const session = await openAnalysisSession(services, characterId, { reason: "metadata" });
  try {
    const result = await session.metadata.inspect(AM.pn(asset));
    return { hasMetadata: result.hasMetadata === true, summary: (result.summary ?? null) as MetadataSummary | null, ...(result.raw ? { raw: result.raw } : {}) };
  } finally {
    session.dispose();
  }
}

/** Delete meta-check records (AM `clearMetadataAvailability(sourceId)` / `clearMetadataAvailabilityRecords(sourceId, keys)`). */
export async function clearMetadataRecords(services: BackendServices, characterId: string, recordKeys?: string[]): Promise<void> {
  await services.storage.updateJson<Record<string, unknown>>(metadataCachePath(characterId), {}, (current) => {
    if (!recordKeys?.length) return {};
    const next = { ...(current ?? {}) };
    for (const key of recordKeys) delete next[key];
    return next;
  });
}

const EXT_BY_MIME: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" };

/** Upload a reference image: a Lumiverse image when the host allows it, else userStorage `uploads/` (`storage:` key). */
export async function uploadAsset(services: BackendServices, params: RpcParams<"assets.upload">): Promise<{ asset: AssetRef }> {
  const data = base64ToBytes(params.dataBase64.replace(/^data:[^,]*,/u, ""));
  if (!data.length) fail("bad-request", "The uploaded image is empty.");
  const extension = (params.fileName.split(".").pop() || EXT_BY_MIME[params.mimeType] || "png").toLowerCase();
  const name = params.fileName || `upload.${extension}`;
  const target = params.characterId ? { characterTarget: { chaId: params.characterId } } : {};
  try {
    const image = await services.host.images.upload({ data, filename: name, mime_type: params.mimeType, ...(params.characterId ? { owner_character_id: params.characterId } : {}) }, services.userId);
    return { asset: { name, key: image.id, extension, sourceType: "upload", moduleId: "", moduleName: "", ...target } };
  } catch (error) {
    services.log.append("warn", "assets", `Image upload through the host failed, storing the upload in extension storage: ${error instanceof Error ? error.message : String(error)}`);
  }
  const path = STORAGE_PATHS.upload(randomUuid(), extension);
  await services.storage.writeBinary(path, data);
  return { asset: { name, key: `${STORAGE_ASSET_PREFIX}${path}`, extension, sourceType: "upload", moduleId: "", moduleName: "", ...target } };
}

/** Save a reference crop (AM `ac` 33978 crop reference + `__asset_maid_crop_*` PNG) under `characters/<id>/reference-crops/`. */
export async function saveCrop(services: BackendServices, params: RpcParams<"assets.saveCrop">): Promise<{ asset: AssetRef }> {
  const data = base64ToBytes(params.dataBase64.replace(/^data:[^,]*,/u, ""));
  if (!data.length) fail("bad-request", "The crop image is empty.");
  const cropName = `${CROP_ASSET_NAME_PREFIX}${randomUuid()}`;
  const path = STORAGE_PATHS.characterReferenceCrop(params.characterId, cropName);
  await services.storage.writeBinary(path, data);
  const cropReference: CropReference = {
    version: 1,
    assetName: `${cropName}.png`,
    assetKey: `${STORAGE_ASSET_PREFIX}${path}`,
    extension: "png",
    cropRect: params.cropRect,
    sourceSize: params.sourceSize,
  } as CropReference;
  return { asset: { ...normalizeAssetRef(params.asset), cropReference } };
}

/** URL for an asset: host image URL, or a data URL for extension-storage assets. */
export async function assetUrl(services: BackendServices, asset: AssetRef): Promise<{ url: string }> {
  if (asset.key?.startsWith(STORAGE_ASSET_PREFIX)) {
    const bytes = await readAssetBytes(services, asset);
    return { url: `data:${bytes.mimeType};base64,${bytesToBase64(bytes.data)}` };
  }
  try {
    const image = await services.host.images.get(asset.key, services.userId);
    if (image?.url) return { url: image.url };
  } catch {
    /* fall through */
  }
  const chaId = asset.characterTarget?.chaId;
  if (chaId) {
    const images = await services.sources.listCharacterImages(chaId, { includeGenerated: true }).catch(() => [] as CharacterImageAsset[]);
    const hit = images.find((i) => i.imageId === asset.key || i.asset?.key === asset.key);
    if (hit) return { url: hit.url };
  }
  fail("not-found", `Image not found: ${asset.name || asset.key}`, { messageKo: `이미지를 읽지 못했습니다: ${asset.name || asset.key}` });
}
