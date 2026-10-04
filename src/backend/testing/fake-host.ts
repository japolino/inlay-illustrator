/**
 * In-memory fake of the Spindle backend API (`SpindleHost`) for unit tests. No real Lumiverse needed.
 *
 * Covers what the backend services use: userStorage, generate.raw/quiet (scripted), imageGen, connections, images,
 * characters, world_books (+entries, getGlobal), personas, chats, chat.getMessages/updateMessage, sendToFrontend capture,
 * onFrontendMessage, on(event) registry with emit, registerInterceptor capture, permissions, log capture.
 *
 * Usage:
 *   const fake = createFakeHost();
 *   fake.addCharacter({ id: "c1", name: "Alice", world_book_ids: ["wb1"] });
 *   fake.scriptLlm({ content: '{"ok":true}' });
 *   const services = createServices(fake.host, fake.userId);
 *
 * Everything is plain data on the returned object, so tests can inspect and mutate it directly.
 */
import type {
  CharacterDTO,
  ChatDTO,
  ChatMessageDTO,
  ConnectionProfileDTO,
  ImageDTO,
  ImageGenConnectionDTO,
  ImageGenRequestDTO,
  ImageGenResultDTO,
  PersonaDTO,
  WorldBookDTO,
  WorldBookEntryDTO,
} from "lumiverse-spindle-types";
import type { SpindleHost } from "../services/types.js";

/** One scripted reply: a value (returned), an Error (thrown) or a function of the request. */
export type Scripted<TReq, TRes> = TRes | Error | ((request: TReq, call: number) => TRes | Promise<TRes>);

export interface FakeGenerateCall {
  kind: "raw" | "quiet";
  input: Record<string, unknown>;
}
export interface FakeImageGenCall {
  input: ImageGenRequestDTO & Record<string, unknown>;
  result?: ImageGenResultDTO;
}
export interface FakeSent {
  payload: unknown;
  userId: string | undefined;
}
export interface FakeLog {
  level: "info" | "warn" | "error";
  message: string;
}
export type FakeChatMessage = ChatMessageDTO & { role?: "system" | "user" | "assistant"; metadata?: Record<string, unknown> };

/** A 1x1 transparent PNG (base64, no prefix). */
export const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export interface FakeHost {
  /** The object to inject (typed as the real Spindle API). */
  host: SpindleHost;
  userId: string;

  /* userStorage */
  files: Map<string, string | Uint8Array>;
  /** Paths that fail on read/write (simulated I/O errors). */
  failingPaths: Set<string>;
  storageOps: Array<{ op: "read" | "write" | "delete" | "list"; path: string }>;

  /* LLM */
  llmConnections: ConnectionProfileDTO[];
  generateCalls: FakeGenerateCall[];
  /** FIFO of scripted replies; when empty, `defaultLlmReply` is used. */
  llmQueue: Array<Scripted<Record<string, unknown>, unknown>>;
  defaultLlmReply: Scripted<Record<string, unknown>, unknown>;
  scriptLlm(...replies: Array<Scripted<Record<string, unknown>, unknown>>): void;

  /* image generation */
  imageConnections: ImageGenConnectionDTO[];
  imageModels: Record<string, Array<{ id: string; label: string }>>;
  imageGenCalls: FakeImageGenCall[];
  imageGenQueue: Array<Scripted<ImageGenRequestDTO, ImageGenResultDTO>>;
  scriptImageGen(...replies: Array<Scripted<ImageGenRequestDTO, ImageGenResultDTO>>): void;

  /* images */
  images: Map<string, ImageDTO>;
  deletedImageIds: string[];
  addImage(image: Partial<ImageDTO> & { id: string }): ImageDTO;

  /* content */
  characters: Map<string, CharacterDTO>;
  worldBooks: Map<string, WorldBookDTO>;
  worldBookEntries: Map<string, WorldBookEntryDTO>;
  globalWorldBookIds: string[];
  personas: Map<string, PersonaDTO>;
  activePersonaId: string | null;
  chats: Map<string, ChatDTO>;
  activeChatId: string | null;
  messages: Map<string, FakeChatMessage[]>;
  messageUpdates: Array<{ chatId: string; messageId: string; patch: Record<string, unknown> }>;
  addCharacter(character: Partial<CharacterDTO> & { id: string }): CharacterDTO;
  addWorldBook(book: Partial<WorldBookDTO> & { id: string }, entries?: Array<Partial<WorldBookEntryDTO> & { id: string }>): WorldBookDTO;
  addPersona(persona: Partial<PersonaDTO> & { id: string }): PersonaDTO;
  addChat(chat: Partial<ChatDTO> & { id: string; character_id: string }, messages?: Array<Partial<FakeChatMessage> & { id: string }>): ChatDTO;

  /* frontend channel */
  sent: FakeSent[];
  frontendHandlers: Array<(payload: unknown, userId: string, frontendSessionId?: string) => void>;
  /** Called synchronously for every sendToFrontend (e.g. to auto-answer fetch-bridge requests). */
  onSend: ((payload: unknown, userId: string | undefined) => void) | null;
  /** Deliver a message as if the frontend sent it. */
  sendFromFrontend(payload: unknown, frontendSessionId?: string): void;
  sentOfType(type: string): unknown[];

  /* events / interceptors / permissions / log */
  eventHandlers: Map<string, Set<(payload: unknown, userId?: string) => unknown>>;
  emit(event: string, payload: unknown): Promise<unknown[]>;
  interceptors: Array<{ handler: unknown; options: unknown }>;
  granted: Set<string>;
  logs: FakeLog[];
}

let imageCounter = 0;

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

async function runScripted<TReq, TRes>(entry: Scripted<TReq, TRes>, request: TReq, call: number): Promise<TRes> {
  if (entry instanceof Error) throw entry;
  if (typeof entry === "function") return (entry as (r: TReq, c: number) => TRes | Promise<TRes>)(request, call);
  return entry;
}

function abortErr(): DOMException {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function createFakeHost(options: { userId?: string; granted?: string[] } = {}): FakeHost {
  const userId = options.userId ?? "user-1";
  const now = () => Date.now();

  const fake = {} as FakeHost;
  fake.userId = userId;
  fake.files = new Map();
  fake.failingPaths = new Set();
  fake.storageOps = [];
  fake.llmConnections = [];
  fake.generateCalls = [];
  fake.llmQueue = [];
  fake.defaultLlmReply = { content: "{}", finish_reason: "stop", usage: {} };
  fake.scriptLlm = (...replies) => { fake.llmQueue.push(...replies); };
  fake.imageConnections = [];
  fake.imageModels = {};
  fake.imageGenCalls = [];
  fake.imageGenQueue = [];
  fake.scriptImageGen = (...replies) => { fake.imageGenQueue.push(...replies); };
  fake.images = new Map();
  fake.deletedImageIds = [];
  fake.characters = new Map();
  fake.worldBooks = new Map();
  fake.worldBookEntries = new Map();
  fake.globalWorldBookIds = [];
  fake.personas = new Map();
  fake.activePersonaId = null;
  fake.chats = new Map();
  fake.activeChatId = null;
  fake.messages = new Map();
  fake.messageUpdates = [];
  fake.sent = [];
  fake.frontendHandlers = [];
  fake.onSend = null;
  fake.eventHandlers = new Map();
  fake.interceptors = [];
  fake.granted = new Set(options.granted ?? ["generation", "interceptor", "image_gen", "chat_mutation", "images", "chats", "characters", "personas", "world_books", "app_manipulation"]);
  fake.logs = [];

  fake.addImage = (image) => {
    const dto: ImageDTO = {
      original_filename: `${image.id}.png`,
      mime_type: "image/png",
      width: null,
      height: null,
      has_thumbnail: false,
      url: `/api/v1/images/${image.id}`,
      specificity: "full" as ImageDTO["specificity"],
      owner_extension_identifier: null,
      owner_character_id: null,
      owner_chat_id: null,
      created_at: now(),
      ...image,
    };
    fake.images.set(dto.id, dto);
    return dto;
  };
  fake.addCharacter = (character) => {
    const dto: CharacterDTO = {
      name: character.id,
      description: "",
      personality: "",
      scenario: "",
      first_mes: "",
      mes_example: "",
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      tags: [],
      alternate_greetings: [],
      creator: "",
      image_id: null,
      world_book_ids: [],
      extensions: {},
      created_at: now(),
      updated_at: now(),
      ...character,
    };
    fake.characters.set(dto.id, dto);
    return dto;
  };
  fake.addWorldBook = (book, entries = []) => {
    const dto: WorldBookDTO = { name: book.id, description: "", metadata: {}, created_at: now(), updated_at: now(), ...book };
    fake.worldBooks.set(dto.id, dto);
    entries.forEach((entry, index) => {
      const e: WorldBookEntryDTO = {
        world_book_id: dto.id,
        uid: entry.id,
        key: [],
        keysecondary: [],
        content: "",
        comment: "",
        position: 0,
        depth: 4,
        role: null,
        order_value: index,
        selective: false,
        constant: false,
        disabled: false,
        group_name: "",
        group_override: false,
        group_weight: 100,
        probability: 100,
        scan_depth: null,
        exclude_greeting: false,
        case_sensitive: false,
        match_whole_words: false,
        automation_id: null,
        use_regex: false,
        prevent_recursion: false,
        exclude_recursion: false,
        delay_until_recursion: false,
        priority: 0,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        selective_logic: 0,
        use_probability: false,
        vectorized: false,
        extensions: {},
        created_at: now(),
        updated_at: now(),
        ...entry,
      };
      fake.worldBookEntries.set(e.id, e);
    });
    return dto;
  };
  fake.addPersona = (persona) => {
    const dto: PersonaDTO = { name: persona.id, title: "", description: "", image_id: null, attached_world_book_id: null, folder: "", is_default: false, metadata: {}, created_at: now(), updated_at: now(), ...persona };
    fake.personas.set(dto.id, dto);
    return dto;
  };
  fake.addChat = (chat, messages = []) => {
    const dto: ChatDTO = { name: chat.id, metadata: {}, created_at: now(), updated_at: now(), ...chat };
    fake.chats.set(dto.id, dto);
    fake.messages.set(
      dto.id,
      messages.map((m, index) => ({
        chat_id: dto.id,
        index_in_chat: index,
        is_user: false,
        name: "",
        content: "",
        send_date: now(),
        swipe_id: 0,
        swipes: [m.content ?? ""],
        swipe_dates: [0],
        extra: {},
        parent_message_id: null,
        branch_id: null,
        created_at: now(),
        ...m,
      })),
    );
    return dto;
  };
  fake.sendFromFrontend = (payload, frontendSessionId) => {
    for (const handler of [...fake.frontendHandlers]) handler(payload, userId, frontendSessionId);
  };
  fake.sentOfType = (type) => fake.sent.map((s) => s.payload).filter((p) => !!p && typeof p === "object" && (p as { type?: unknown }).type === type);
  fake.emit = async (event, payload) => {
    const results: unknown[] = [];
    for (const handler of [...(fake.eventHandlers.get(event) ?? [])]) results.push(await handler(payload, userId));
    return results;
  };

  const storageCheck = (op: "read" | "write" | "delete" | "list", rawPath: string): string => {
    const path = normalizeSlashes(rawPath);
    fake.storageOps.push({ op, path });
    if (fake.failingPaths.has(path)) throw new Error(`Simulated storage failure: ${path}`);
    return path;
  };
  const underPrefix = (prefix: string) => {
    const p = normalizeSlashes(prefix);
    const dir = p === "" || p.endsWith("/") ? p : `${p}/`;
    return [...fake.files.keys()].filter((k) => k.startsWith(dir));
  };

  const userStorage = {
    async read(path: string) {
      const p = storageCheck("read", path);
      const v = fake.files.get(p);
      if (v === undefined) throw new Error("File not found");
      return typeof v === "string" ? v : new TextDecoder().decode(v);
    },
    async write(path: string, data: string) {
      const p = storageCheck("write", path);
      fake.files.set(p, String(data));
    },
    async readBinary(path: string) {
      const p = storageCheck("read", path);
      const v = fake.files.get(p);
      if (v === undefined) throw new Error("File not found");
      return typeof v === "string" ? new TextEncoder().encode(v) : v;
    },
    async writeBinary(path: string, data: Uint8Array) {
      const p = storageCheck("write", path);
      fake.files.set(p, new Uint8Array(data));
    },
    async delete(path: string) {
      const p = storageCheck("delete", path);
      fake.files.delete(p);
      for (const k of underPrefix(p)) fake.files.delete(k);
    },
    async list(prefix?: string) {
      const p = storageCheck("list", prefix ?? "");
      const dir = p === "" || p.endsWith("/") ? p : `${p}/`;
      // Like the host: recursive, relative to the prefix directory.
      return underPrefix(p).map((k) => k.slice(dir.length));
    },
    async exists(path: string) {
      const p = normalizeSlashes(path);
      return fake.files.has(p) || underPrefix(p).length > 0;
    },
    async mkdir() {},
    async move(from: string, to: string) {
      const f = normalizeSlashes(from);
      const v = fake.files.get(f);
      if (v === undefined) throw new Error("File not found");
      fake.files.delete(f);
      fake.files.set(normalizeSlashes(to), v);
    },
    async stat(path: string) {
      const p = normalizeSlashes(path);
      const v = fake.files.get(p);
      const dir = underPrefix(p).length > 0;
      return { exists: v !== undefined || dir, isFile: v !== undefined, isDirectory: dir, sizeBytes: v === undefined ? 0 : typeof v === "string" ? v.length : v.byteLength, modifiedAt: new Date(0).toISOString() };
    },
    async getJson<T>(path: string, opts?: { fallback?: T }) {
      try {
        return JSON.parse(await userStorage.read(path)) as T;
      } catch {
        if (opts && "fallback" in opts) return opts.fallback as T;
        throw new Error(`Failed to parse JSON from ${path}`);
      }
    },
    async setJson(path: string, value: unknown, opts?: { indent?: number }) {
      await userStorage.write(path, JSON.stringify(value, null, opts?.indent ?? 2));
    },
  };

  const generate = async (kind: "raw" | "quiet", input: Record<string, unknown>) => {
    const call = fake.generateCalls.length;
    fake.generateCalls.push({ kind, input });
    const signal = input.signal as AbortSignal | undefined;
    if (signal?.aborted) throw abortErr();
    const entry = fake.llmQueue.length ? fake.llmQueue.shift()! : fake.defaultLlmReply;
    const work = runScripted(entry, input, call);
    if (!signal) return work;
    return new Promise((resolve, reject) => {
      const onAbort = () => reject(abortErr());
      signal.addEventListener("abort", onAbort, { once: true });
      work.then(
        (v) => { signal.removeEventListener("abort", onAbort); resolve(v); },
        (e) => { signal.removeEventListener("abort", onAbort); reject(e); },
      );
    });
  };

  const host = {
    userStorage,
    storage: userStorage,
    generate: {
      raw: (input: Record<string, unknown>) => generate("raw", input),
      quiet: (input: Record<string, unknown>) => generate("quiet", input),
    },
    connections: {
      async list() { return fake.llmConnections.map((c) => ({ ...c })); },
      async get(id: string) { const c = fake.llmConnections.find((x) => x.id === id); return c ? { ...c } : null; },
    },
    imageGen: {
      async generate(input: ImageGenRequestDTO & Record<string, unknown>) {
        const call: FakeImageGenCall = { input: JSON.parse(JSON.stringify(input)) };
        fake.imageGenCalls.push(call);
        const index = fake.imageGenCalls.length - 1;
        const entry: Scripted<ImageGenRequestDTO, ImageGenResultDTO> = fake.imageGenQueue.length
          ? fake.imageGenQueue.shift()!
          : () => {
              imageCounter += 1;
              const id = `gen-${imageCounter}`;
              const connection = fake.imageConnections.find((c) => c.id === input.connection_id) ?? fake.imageConnections.find((c) => c.is_default) ?? fake.imageConnections[0];
              return { imageDataUrl: input.includeDataUrl === false ? "" : `data:image/png;base64,${TINY_PNG_BASE64}`, model: String(input.model || connection?.model || ""), provider: connection?.provider ?? "novelai", imageId: id, imageUrl: `/api/v1/image-gen/results/${id}` };
            };
        const result = await runScripted(entry, input, index);
        call.result = result;
        if (result.imageId && !fake.images.has(result.imageId)) {
          fake.addImage({ id: result.imageId, url: result.imageUrl ?? `/api/v1/image-gen/results/${result.imageId}`, owner_extension_identifier: "inlay_illustrator", owner_character_id: (input.owner_character_id as string) ?? null, owner_chat_id: (input.owner_chat_id as string) ?? null });
        }
        return result;
      },
      async listConnections() { return fake.imageConnections.map((c) => ({ ...c })); },
      async getConnection(id: string) { const c = fake.imageConnections.find((x) => x.id === id); return c ? { ...c } : null; },
      async getModels(id: string) { return fake.imageModels[id] ?? []; },
      async getProviders() { return []; },
    },
    images: {
      async list(opts: { characterId?: string; chatId?: string; onlyOwned?: boolean; limit?: number; offset?: number } = {}) {
        let data = [...fake.images.values()];
        if (opts.characterId) data = data.filter((i) => i.owner_character_id === opts.characterId);
        if (opts.chatId) data = data.filter((i) => i.owner_chat_id === opts.chatId);
        if (opts.onlyOwned) data = data.filter((i) => i.owner_extension_identifier === "inlay_illustrator");
        const total = data.length;
        const offset = opts.offset ?? 0;
        return { data: data.slice(offset, offset + (opts.limit ?? 100)), total };
      },
      async get(id: string) { const i = fake.images.get(id); return i ? { ...i } : null; },
      async delete(id: string) {
        if (!fake.images.has(id)) return false;
        fake.images.delete(id);
        fake.deletedImageIds.push(id);
        return true;
      },
      async deleteMany(ids: string[]) {
        let n = 0;
        for (const id of ids) if (fake.images.delete(id)) { n += 1; fake.deletedImageIds.push(id); }
        return n;
      },
      async upload(input: { originalFilename?: string; mimeType?: string }) {
        imageCounter += 1;
        return fake.addImage({ id: `upload-${imageCounter}`, original_filename: input.originalFilename ?? "upload.png", mime_type: input.mimeType ?? "image/png" });
      },
      async uploadFromDataUrl(_dataUrl: string, name?: unknown) {
        imageCounter += 1;
        return fake.addImage({ id: `upload-${imageCounter}`, original_filename: typeof name === "string" ? name : "upload.png" });
      },
    },
    characters: {
      async list(opts: { limit?: number; offset?: number } = {}) {
        const all = [...fake.characters.values()];
        const offset = opts.offset ?? 0;
        return { data: all.slice(offset, offset + (opts.limit ?? 50)), total: all.length };
      },
      async get(id: string) { const c = fake.characters.get(id); return c ? JSON.parse(JSON.stringify(c)) : null; },
      async update(id: string, input: Record<string, unknown>) {
        const c = fake.characters.get(id);
        if (!c) throw new Error("Character not found");
        const next = { ...c, ...input, extensions: { ...c.extensions, ...((input.extensions as Record<string, unknown>) ?? {}) } } as CharacterDTO;
        fake.characters.set(id, next);
        return next;
      },
    },
    world_books: {
      async list(opts: { limit?: number; offset?: number } = {}) {
        const all = [...fake.worldBooks.values()];
        const offset = opts.offset ?? 0;
        return { data: all.slice(offset, offset + (opts.limit ?? 50)), total: all.length };
      },
      async get(id: string) { return fake.worldBooks.get(id) ?? null; },
      entries: {
        async list(worldBookId: string, opts: { limit?: number; offset?: number } = {}) {
          const all = [...fake.worldBookEntries.values()].filter((e) => e.world_book_id === worldBookId);
          const offset = opts.offset ?? 0;
          return { data: all.slice(offset, offset + (opts.limit ?? 50)), total: all.length };
        },
        async get(id: string) { return fake.worldBookEntries.get(id) ?? null; },
      },
      async getGlobal() { return [...fake.globalWorldBookIds]; },
      async getActivated() { return []; },
    },
    personas: {
      async list(opts: { limit?: number; offset?: number } = {}) {
        const all = [...fake.personas.values()];
        const offset = opts.offset ?? 0;
        return { data: all.slice(offset, offset + (opts.limit ?? 50)), total: all.length };
      },
      async get(id: string) { return fake.personas.get(id) ?? null; },
      async getDefault() { return [...fake.personas.values()].find((p) => p.is_default) ?? null; },
      async getActive() { return fake.activePersonaId ? fake.personas.get(fake.activePersonaId) ?? null : null; },
      async getWorldBook(id: string) {
        const p = fake.personas.get(id);
        return p?.attached_world_book_id ? fake.worldBooks.get(p.attached_world_book_id) ?? null : null;
      },
    },
    chats: {
      async list(opts: { characterId?: string; limit?: number; offset?: number } = {}) {
        let all = [...fake.chats.values()];
        if (opts.characterId) all = all.filter((c) => c.character_id === opts.characterId || (Array.isArray(c.metadata?.character_ids) && (c.metadata.character_ids as string[]).includes(opts.characterId!)));
        const offset = opts.offset ?? 0;
        return { data: all.slice(offset, offset + (opts.limit ?? 50)), total: all.length };
      },
      async get(id: string) { return fake.chats.get(id) ?? null; },
      async getActive() { return fake.activeChatId ? fake.chats.get(fake.activeChatId) ?? null : null; },
    },
    chat: {
      async getMessages(chatId: string) {
        return (fake.messages.get(chatId) ?? []).map((m) => ({ ...m, role: m.role ?? (m.is_user ? "user" : "assistant"), extra: m.extra ?? {} }));
      },
      async updateMessage(chatId: string, messageId: string, patch: Record<string, unknown>) {
        fake.messageUpdates.push({ chatId, messageId, patch });
        const list = fake.messages.get(chatId) ?? [];
        const m = list.find((x) => x.id === messageId);
        if (!m) throw new Error("Message not found");
        if (typeof patch.content === "string") {
          m.content = patch.content;
          m.swipes = [...m.swipes];
          m.swipes[m.swipe_id] = patch.content;
        }
        if (Array.isArray(patch.swipes)) m.swipes = [...(patch.swipes as string[])];
        if (typeof patch.swipe_id === "number") m.swipe_id = patch.swipe_id;
        if (patch.metadata && typeof patch.metadata === "object") m.metadata = { ...(patch.metadata as Record<string, unknown>) };
      },
    },
    on(event: string, handler: (payload: unknown, userId?: string) => unknown) {
      let set = fake.eventHandlers.get(event);
      if (!set) fake.eventHandlers.set(event, (set = new Set()));
      set.add(handler);
      return () => set!.delete(handler);
    },
    registerInterceptor(handler: unknown, options?: unknown) {
      const entry = { handler, options };
      fake.interceptors.push(entry);
      return () => { const i = fake.interceptors.indexOf(entry); if (i >= 0) fake.interceptors.splice(i, 1); };
    },
    sendToFrontend(payload: unknown, uid?: string) {
      fake.sent.push({ payload, userId: uid });
      fake.onSend?.(payload, uid);
    },
    onFrontendMessage(handler: (payload: unknown, userId: string, frontendSessionId?: string) => void) {
      fake.frontendHandlers.push(handler);
      return () => { const i = fake.frontendHandlers.indexOf(handler); if (i >= 0) fake.frontendHandlers.splice(i, 1); };
    },
    permissions: {
      async getGranted() { return [...fake.granted]; },
      has(permission: string) { return fake.granted.has(permission); },
      onDenied() { return () => undefined; },
      onChanged() { return () => undefined; },
    },
    log: {
      info(message: string) { fake.logs.push({ level: "info", message }); },
      warn(message: string) { fake.logs.push({ level: "warn", message }); },
      error(message: string) { fake.logs.push({ level: "error", message }); },
    },
  };
  fake.host = host as unknown as SpindleHost;
  return fake;
}

/** Auto-answer fetch-bridge requests from a URL -> response table (base64 image or JSON). */
export function answerFetchBridge(
  fake: FakeHost,
  table: Record<string, { data?: string; mimeType?: string; json?: unknown; error?: string; status?: number }>,
): void {
  fake.onSend = (payload) => {
    const p = payload as { type?: string; requestId?: string; url?: string };
    if (!p || p.type !== "inlay-illustrator:fetch-request" || !p.requestId || !p.url) return;
    const reply = table[p.url] ?? { error: `No fake response for ${p.url}`, status: 404 };
    queueMicrotask(() => fake.sendFromFrontend({ type: "inlay-illustrator:fetch-response", requestId: p.requestId, ...reply }));
  };
}
