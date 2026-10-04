/**
 * In-memory `BackendServices` for unit tests of the pipeline / analysis modules (no host, no real storage).
 *
 *   const fx = createFakeServices();
 *   fx.llmReplies.push({ characters: [] });            // next llm.complete parsed value
 *   fx.characters.push({ characterId: "c1", name: "Alice", ... });
 *   await myController(fx.services, ...);
 *   expect(fx.events).toContainEqual(...);
 *
 * Override any service (or single methods) with `createFakeServices({ llm: { complete: async () => ... } })`.
 * Storage keeps normalized documents in maps and enforces the same revision guard as the real service.
 */
import {
  createDefaultUiState,
  createEmptyCharacterDocument,
  createEmptyChatData,
  DEFAULT_CHAT_IMAGE_GENERATION_SETTINGS,
  generationProviderFromLumiverse,
  normalizeCharacterDocument,
  normalizeChatData,
  normalizeConfig,
  promptCodecForProvider,
  type CharacterDocument,
  type ChatDataDocument,
  type ChatImageGenerationSettings,
  type InlayConfig,
  type RpcEventName,
  type RpcEvents,
  type UiState,
} from "../../shared/contract/index.js";
import { parseLenientJson } from "../../engine/text/json.js";
import { fail } from "../rpc/errors.js";
import { createRunLog } from "../services/run-log.js";
import type {
  AmSource,
  BackendServices,
  CharacterImageAsset,
  CharacterInfo,
  ChatInfo,
  EventBus,
  ImageBytesService,
  ImageGenerateRequest,
  ImageGenerateResult,
  ImageService,
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmService,
  PersonaInfo,
  RunLog,
  SourcesService,
  SpindleHost,
  StorageService,
  WorldBookInfo,
} from "../services/types.js";
import { createFakeHost, TINY_PNG_BASE64, type FakeHost } from "./fake-host.js";

export interface FakeServicesOverrides {
  host?: SpindleHost;
  userId?: string;
  storage?: Partial<StorageService>;
  llm?: Partial<LlmService>;
  images?: Partial<ImageService>;
  imageBytes?: Partial<ImageBytesService>;
  sources?: Partial<SourcesService>;
  events?: Partial<EventBus>;
  log?: Partial<RunLog>;
  /** Initial global config (normalized). */
  config?: unknown;
}

export interface FakeServices {
  services: BackendServices;
  /** The fake host behind `services.host` (only when no host override was given). */
  fakeHost: FakeHost | null;
  /* storage state */
  config: { value: InlayConfig };
  documents: Map<string, CharacterDocument>;
  chatData: Map<string, ChatDataDocument>;
  json: Map<string, unknown>;
  binary: Map<string, Uint8Array>;
  /* llm */
  /** Next replies of `llm.complete`: a value (becomes `parsed`; strings become `raw` too), an Error (thrown) or a function. */
  llmReplies: Array<unknown | Error | ((request: LlmCompleteRequest) => unknown)>;
  llmRequests: LlmCompleteRequest[];
  visionSupported: { value: boolean };
  /* images */
  imageRequests: ImageGenerateRequest[];
  imageReplies: Array<Partial<ImageGenerateResult> | Error>;
  deletedImageIds: string[];
  /* sources */
  characters: CharacterInfo[];
  worldBooks: Record<string, WorldBookInfo[]>;
  personas: PersonaInfo[];
  activePersonaId: { value: string | null };
  chats: ChatInfo[];
  activeChatId: { value: string | null };
  characterImages: Record<string, CharacterImageAsset[]>;
  /* events */
  events: Array<{ event: RpcEventName; payload: unknown }>;
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function emptySource(characterId: string, name: string): AmSource {
  return {
    id: characterId,
    index: 0,
    characterTarget: { chaId: characterId },
    name,
    type: "character",
    chatCount: 0,
    attachedModuleIds: [],
    activeModuleIds: [],
    sharedModuleAssets: [],
    chatGeneratedAssets: [],
    previewAsset: null,
    assetGeneration: `${characterId}:0`,
    members: [
      {
        sourceId: characterId,
        id: characterId,
        key: characterId,
        name,
        aliases: [name.toLowerCase()],
        sourceSummary: "",
        lorebooks: [],
        originalAssets: [],
        outfitGeneratedAssets: [],
        chatGeneratedAssets: [],
        assetCount: 0,
        previewAsset: null,
        characterIndex: 0,
        characterTarget: { chaId: characterId },
      },
    ],
  };
}

export function createFakeServices(overrides: FakeServicesOverrides = {}): FakeServices {
  const fakeHost = overrides.host ? null : createFakeHost({ userId: overrides.userId });
  const host = overrides.host ?? fakeHost!.host;
  const userId = overrides.userId ?? fakeHost?.userId ?? "user-1";

  const fx: FakeServices = {
    services: undefined as unknown as BackendServices,
    fakeHost,
    config: { value: normalizeConfig(overrides.config ?? {}) },
    documents: new Map(),
    chatData: new Map(),
    json: new Map(),
    binary: new Map(),
    llmReplies: [],
    llmRequests: [],
    visionSupported: { value: true },
    imageRequests: [],
    imageReplies: [],
    deletedImageIds: [],
    characters: [],
    worldBooks: {},
    personas: [],
    activePersonaId: { value: null },
    chats: [],
    activeChatId: { value: null },
    characterImages: {},
    events: [],
  };

  let chatImageSettings: ChatImageGenerationSettings = clone(DEFAULT_CHAT_IMAGE_GENERATION_SETTINGS);
  let uiState: UiState = createDefaultUiState();

  const events: EventBus = {
    emit<E extends RpcEventName>(event: E, payload: RpcEvents[E]) {
      fx.events.push({ event, payload: clone(payload) });
    },
    ...overrides.events,
  };
  const log: RunLog = { ...createRunLog({ events }), ...overrides.log };

  const storage: StorageService = {
    async readJson<T>(path: string, fallback: T) {
      return fx.json.has(path) ? clone(fx.json.get(path) as T) : fallback;
    },
    async writeJson(path, value) {
      fx.json.set(path, clone(value));
    },
    async updateJson<T>(path: string, fallback: T, mutate: (current: T) => T | Promise<T>) {
      const next = await mutate(fx.json.has(path) ? clone(fx.json.get(path) as T) : fallback);
      fx.json.set(path, clone(next));
      return next;
    },
    async readBinary(path) {
      return fx.binary.get(path) ?? null;
    },
    async writeBinary(path, data) {
      fx.binary.set(path, new Uint8Array(data));
    },
    async delete(path) {
      for (const map of [fx.json, fx.binary] as Map<string, unknown>[]) for (const key of [...map.keys()]) if (key === path || key.startsWith(path.endsWith("/") ? path : `${path}/`)) map.delete(key);
    },
    async list(prefix) {
      return [...fx.json.keys(), ...fx.binary.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.endsWith("/") || prefix === "" ? prefix.length : prefix.length + 1));
    },
    async loadConfig() {
      return clone(fx.config.value);
    },
    async updateConfig(mutate) {
      fx.config.value = normalizeConfig(await mutate(clone(fx.config.value)));
      return clone(fx.config.value);
    },
    async loadChatImageGenerationSettings() {
      return clone(chatImageSettings);
    },
    async saveChatImageGenerationSettings(settings) {
      chatImageSettings = clone(settings);
      return { settings: clone(settings), notice: "" };
    },
    async loadUiState() {
      return clone(uiState);
    },
    async saveUiState(state) {
      uiState = clone(state);
    },
    async loadCharacterDocument(characterId) {
      return clone(fx.documents.get(characterId) ?? createEmptyCharacterDocument(characterId));
    },
    async hasCharacterDocument(characterId) {
      return fx.documents.has(characterId);
    },
    async updateCharacterDocument(characterId, mutate, options = {}) {
      const current = fx.documents.get(characterId) ?? createEmptyCharacterDocument(characterId);
      if (options.expectedUpdatedAt !== undefined && options.expectedUpdatedAt !== current.updatedAt) {
        fail("conflict", "The character data changed in another window. Reload and try again.", { detailCode: "ASSET_MAID_CHARX_EXTERNAL_CHANGE" });
      }
      const mutated = await mutate(clone(current));
      const next = normalizeCharacterDocument(mutated, characterId).value;
      let at = new Date().toISOString();
      if (at <= current.updatedAt) at = new Date(Date.parse(current.updatedAt) + 1).toISOString();
      next.updatedAt = at;
      fx.documents.set(characterId, next);
      events.emit("document.changed", { characterId, updatedAt: next.updatedAt, reason: options.reason ?? "update" });
      return clone(next);
    },
    async loadChatData(chatId) {
      return clone(fx.chatData.get(chatId) ?? createEmptyChatData(chatId));
    },
    async updateChatData(chatId, mutate) {
      const current = fx.chatData.get(chatId) ?? createEmptyChatData(chatId);
      const next = normalizeChatData(await mutate(clone(current)), chatId).data;
      next.updatedAt = new Date().toISOString();
      fx.chatData.set(chatId, next);
      return clone(next);
    },
    async factoryReset() {
      fx.config.value = normalizeConfig({});
      fx.documents.clear();
      fx.chatData.clear();
      fx.json.clear();
      fx.binary.clear();
    },
    async resetCharacter(characterId) {
      fx.documents.delete(characterId);
    },
    ...overrides.storage,
  };

  const llm: LlmService = {
    async complete(request) {
      fx.llmRequests.push(clone(request));
      const started = Date.now();
      const reply = fx.llmReplies.length ? fx.llmReplies.shift() : request.responseMode === "json" ? {} : "ok";
      if (reply instanceof Error) throw reply;
      const value = typeof reply === "function" ? (reply as (r: LlmCompleteRequest) => unknown)(request) : reply;
      if (value instanceof Error) throw value;
      const raw = typeof value === "string" ? value : JSON.stringify(value);
      const parsed = request.responseMode === "json" ? (typeof value === "string" ? parseLenientJson(value) : clone(value)) : raw;
      const result: LlmCompleteResult = {
        raw,
        parsed,
        connectionId: "fake-llm",
        model: "fake-model",
        attempts: 1,
        usage: {},
        finishReason: "stop",
        jsonMode: request.responseMode === "json",
        imagesDropped: false,
        latencyMs: Date.now() - started,
      };
      return result;
    },
    analyzerClient(options = {}) {
      return {
        complete: async (_config, messages, opts = {}) => {
          const responseMode = (opts as { responseMode?: string }).responseMode === "text" ? "text" : "json";
          const result = await llm.complete({ purpose: options.purpose ?? "analyzer", messages: messages as LlmCompleteRequest["messages"], responseMode, retries: 0 }, { signal: (opts as { signal?: AbortSignal }).signal ?? options.signal });
          return { raw: result.raw, parsed: result.parsed };
        },
      };
    },
    async supportsVision() {
      return fx.visionSupported.value;
    },
    async listConnections() {
      return [{ id: "fake-llm", name: "Fake LLM", provider: "openai", model: "fake-model", isDefault: true, hasApiKey: true }];
    },
    async listModels() {
      return [{ id: "fake-model", label: "fake-model" }];
    },
    async testMessage() {
      return { ok: true, latencyMs: 1, reply: "Hello." };
    },
    ...overrides.llm,
  };

  let imageCounter = 0;
  const images: ImageService = {
    async resolveTarget(o = {}) {
      const image = fx.config.value.image;
      const lumiverseProvider = image.provider || "novelai";
      const generationProvider = generationProviderFromLumiverse(lumiverseProvider);
      const model = o.model || image.model || "nai-diffusion-4-5-full";
      return {
        connectionId: o.connectionId || image.connectionId || "fake-image",
        connectionName: "Fake image",
        lumiverseProvider,
        generationProvider,
        promptCodec: promptCodecForProvider(generationProvider),
        model,
        isNovelAIV5: /^nai-diffusion-5/.test(model),
        comfyuiWorkflowId: image.comfyuiWorkflowId,
      };
    },
    async generate(request, options = {}) {
      if (options.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      fx.imageRequests.push(clone(request));
      const reply = fx.imageReplies.shift();
      if (reply instanceof Error) throw reply;
      const target = await images.resolveTarget({ connectionId: request.connectionId, model: request.model });
      imageCounter += 1;
      const imageId = reply?.imageId ?? `fake-image-${imageCounter}`;
      return {
        imageId,
        url: `/api/v1/image-gen/results/${imageId}`,
        width: request.width,
        height: request.height,
        seed: String(request.seed ?? imageCounter),
        provider: target.generationProvider,
        lumiverseProvider: target.lumiverseProvider,
        model: target.model,
        mimeType: "image/png",
        ...(request.includeData ? { dataBase64: TINY_PNG_BASE64 } : {}),
        sentParameters: {},
        attempts: 1,
        ...reply,
      };
    },
    async deleteImages(ids) {
      fx.deletedImageIds.push(...ids);
      return ids.map((imageId) => ({ imageId, status: "removed" as const }));
    },
    async listConnections() {
      return [];
    },
    async listModels() {
      return [];
    },
    async testConnection() {
      return { ok: true, latencyMs: 1 };
    },
    ...overrides.images,
  };

  const imageBytes: ImageBytesService = {
    async getImage() {
      return { data: TINY_PNG_BASE64, mimeType: "image/png" };
    },
    async getAsset() {
      return { data: TINY_PNG_BASE64, mimeType: "image/png" };
    },
    async getJson<T>() {
      return [] as unknown as T;
    },
    acceptFrontendMessage() {
      return false;
    },
    ...overrides.imageBytes,
  };

  const sources: SourcesService = {
    async listCharacters() {
      return fx.characters.map((c) => ({ characterId: c.characterId, name: c.name, avatarUrl: null, hasDocument: fx.documents.has(c.characterId), chatCount: 0, worldBookIds: [...c.worldBookIds] }));
    },
    async getCharacter(characterId) {
      const c = fx.characters.find((x) => x.characterId === characterId);
      if (!c) fail("not-found", `Character not found: ${characterId}`);
      return clone(c);
    },
    async getActiveChat() {
      return clone(fx.chats.find((c) => c.chatId === fx.activeChatId.value) ?? null);
    },
    async getChat(chatId) {
      const c = fx.chats.find((x) => x.chatId === chatId);
      if (!c) fail("not-found", `Chat not found: ${chatId}`);
      return clone(c);
    },
    async loadWorldBooks(characterId) {
      return clone(fx.worldBooks[characterId] ?? []);
    },
    async rosterSources(characterId, document) {
      const connected = new Set(document.characterPrompt.activeModules[characterId] ?? []);
      return (fx.worldBooks[characterId] ?? []).map((b) => ({ worldBookId: b.worldBookId, name: b.name, attached: b.scope === "character", connected: connected.has(b.worldBookId), entryCount: b.entries.length, scope: b.scope }));
    },
    async buildSource(characterId) {
      const c = fx.characters.find((x) => x.characterId === characterId);
      return emptySource(characterId, c?.name ?? characterId);
    },
    async listPersonas() {
      return clone(fx.personas);
    },
    async getActivePersona() {
      return clone(fx.personas.find((p) => p.personaId === fx.activePersonaId.value) ?? null);
    },
    async listCharacterImages(characterId) {
      return clone(fx.characterImages[characterId] ?? []);
    },
    invalidate() {},
    ...overrides.sources,
  };

  fx.services = { host, userId, storage, llm, images, imageBytes, sources, events, log };
  return fx;
}
