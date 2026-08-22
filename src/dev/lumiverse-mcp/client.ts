/**
 * Lightweight HTTP client for a running Lumiverse instance.
 *
 * This module exists only to support the Inlay Illustrator live integration
 * test driver. It talks to Lumiverse's existing HTTP API with normal user
 * credentials and keeps no state beyond the session token needed for
 * subsequent requests.
 *
 * Credentials come exclusively from environment variables (LUMIVERSE_URL,
 * LUMIVERSE_USERNAME, LUMIVERSE_PASSWORD). They are never accepted as tool
 * arguments and never included in error messages or result artifacts.
 */

export type FetchLike = typeof fetch;

export type WebSocketLike = {
  onopen: ((event: any) => unknown) | null;
  onmessage: ((event: any) => unknown) | null;
  onerror: ((event: any) => unknown) | null;
  onclose: ((event: any) => unknown) | null;
  send(data: string): void;
  close(): void;
};

export type WebSocketFactory = (url: string, headers: Record<string, string>) => WebSocketLike;

export type LumiverseClientOptions = {
  baseUrl: string;
  username: string;
  password: string;
  fetchFn?: FetchLike;
  webSocketFactory?: WebSocketFactory;
  debug?: (message: string, details?: unknown) => void;
};

export type CharacterSummaryRecord = {
  id: string;
  name: string;
  tags: string[];
  updated_at: number;
  image_id: string | null;
};

/** Full character record from GET /api/v1/characters/:id. */
export type CharacterRecord = {
  id: string;
  name: string;
  tags?: unknown;
  image_id?: string | null;
  avatar_path?: string | null;
  folder?: string | null;
  creator?: string | null;
  creator_notes?: string | null;
  description?: string | null;
  personality?: string | null;
  scenario?: string | null;
  system_prompt?: string | null;
  first_mes?: string | null;
  mes_example?: string | null;
  post_history_instructions?: string | null;
  alternate_greetings?: unknown;
  extensions?: unknown;
  created_at?: number | string;
  updated_at?: number | string;
  user_id?: string;
};

export type ExtensionRecord = {
  id: string;
  identifier?: string;
  name?: string;
  status?: string;
  enabled?: boolean;
};

export type ExtensionStatusEvent = {
  status: string;
  error?: string;
  chatId: string;
  at: number;
};

export type ExtensionStatusMonitor = {
  close(): void;
  events(): ExtensionStatusEvent[];
};

export type ExtensionMessageResponse = Record<string, unknown> & {
  type?: string;
  requestId?: string;
};

export type ChatRecord = {
  id: string;
  character_id: string | null;
  name: string;
  metadata: Record<string, unknown>;
  created_at: number;
  updated_at: number;
};

export type MessageRecord = {
  id: string;
  chat_id: string;
  index_in_chat: number;
  is_user: boolean;
  name: string;
  content: string;
  send_date: number;
  swipe_id: number;
  swipes: (string | null)[];
  extra: Record<string, unknown>;
  parent_message_id: string | null;
  created_at: number;
};

export type Paginated<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};

export type GenerateStatusResponse = {
  active: boolean;
  generationId?: string;
  status?: "assembling" | "council" | "waiting" | "streaming" | "completed" | "stopped" | "error" | "reasoning";
  content?: string;
  error?: string;
  completedMessageId?: string;
  targetMessageId?: string;
  startedAt?: number;
  completedAt?: number;
  model?: string;
};

export type DryRunResponse = {
  messages?: unknown[];
  breakdown?: unknown[];
  parameters?: Record<string, unknown>;
  model?: string;
  provider?: string;
  usage?: Record<string, unknown>;
  tokenCount?: Record<string, unknown>;
};

/** Thrown for non-2xx responses and protocol problems. Never carries secrets. */
export class LumiverseError extends Error {
  readonly status: number | null;
  readonly path: string;
  constructor(message: string, path: string, status: number | null) {
    super(message);
    this.name = "LumiverseError";
    this.path = path;
    this.status = status;
  }
}

export class LumiverseClient {
  readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly fetchFn: FetchLike;
  private readonly webSocketFactory: WebSocketFactory;
  private readonly debug: (message: string, details?: unknown) => void;
  private authCookie = "";
  private bearerToken = "";
  private authPromise: Promise<void> | null = null;

  constructor(options: LumiverseClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.username = options.username;
    this.password = options.password;
    this.fetchFn = options.fetchFn ?? fetch;
    this.webSocketFactory = options.webSocketFactory ?? ((url, headers) => new WebSocket(url, { headers } as never));
    this.debug = options.debug ?? (() => undefined);
  }

  get hasSession(): boolean {
    return this.authCookie.length > 0 || this.bearerToken.length > 0;
  }

  /** Returns the email variants tried during authentication, for diagnostics only. */
  private emailVariants(): string[] {
    return [`${this.username}@lumiverse.local`, this.username];
  }

  /**
   * Signs in through POST /api/auth/sign-in/email following the same sequence
   * as the parent repository's scripts/migrate-sillytavern.ts:
   * - try `<username>@lumiverse.local`, then the raw username,
   * - prefer the better-auth.session_token cookie from Set-Cookie,
   * - fall back to a token returned in the response body,
   * - send the resulting cookie / bearer token on subsequent requests.
   */
  async authenticate(): Promise<void> {
    if (this.authPromise) return this.authPromise;
    this.authPromise = this.authenticateInternal().catch((error) => {
      this.authPromise = null;
      throw error;
    });
    return this.authPromise;
  }

  private async authenticateInternal(): Promise<void> {
    const variants = this.emailVariants();
    const failures: string[] = [];
    for (const email of variants) {
      try {
        const response = await this.fetchFn(`${this.baseUrl}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: this.password }),
          redirect: "manual"
        });
        const setCookie = typeof response.headers.getSetCookie === "function"
          ? response.headers.getSetCookie()
          : (response.headers.get("set-cookie") || "").split(/,(?=\s*[A-Za-z][^=]*=)/);
        const sessionCookie = setCookie.find((cookie: string) => cookie.includes("better-auth.session_token"));
        if (sessionCookie) {
          this.authCookie = sessionCookie.split(";")[0].trim();
          this.debug("authenticated via session cookie", { variant: email });
          return;
        }
        if (response.ok) {
          const body = await response.json().catch(() => null);
          const token = body && typeof body === "object" && "token" in body ? String((body as { token: unknown }).token) : "";
          if (token) {
            this.authCookie = `better-auth.session_token=${token}`;
            this.bearerToken = token;
            this.debug("authenticated via body token", { variant: email });
            return;
          }
        }
        failures.push(`${email} (HTTP ${response.status})`);
      } catch (error) {
        failures.push(`${email} (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    throw new LumiverseError(
      `Lumiverse authentication failed. Tried: ${failures.join(", ")}. Check LUMIVERSE_URL, LUMIVERSE_USERNAME and LUMIVERSE_PASSWORD.`,
      "/api/auth/sign-in/email",
      null
    );
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.hasSession) return;
    await this.authenticate();
  }

  async request<T>(method: string, path: string, options: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    retryAuth?: boolean;
  } = {}): Promise<T> {
    await this.ensureAuthenticated();
    const url = new URL(`${this.baseUrl}${path}`);
    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
      }
    }
    const headers: Record<string, string> = {};
    if (this.authCookie) headers["Cookie"] = this.authCookie;
    if (this.bearerToken) headers["Authorization"] = `Bearer ${this.bearerToken}`;
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    this.debug(`http ${method} ${path}`, options.query ?? undefined);
    const response = await this.fetchFn(url.toString(), { method, headers, body, redirect: "follow" });
    if (!response.ok) {
      // A stale session may 401; re-authenticate once and retry.
      if (response.status === 401 && options.retryAuth !== false && this.hasSession) {
        this.authCookie = "";
        this.bearerToken = "";
        this.authPromise = null;
        this.debug("session rejected; re-authenticating", { path });
        return this.request<T>(method, path, { ...options, retryAuth: false });
      }
      const text = await response.text().catch(() => "");
      const detail = text.replace(/\s+/g, " ").trim().slice(0, 300);
      throw new LumiverseError(
        `Lumiverse ${method} ${path} returned ${response.status}${detail ? `: ${detail}` : ""}`,
        path,
        response.status
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json().catch(() => null)) as T;
  }

  /**
   * Transport-level reachability probe without authentication. Any HTTP
   * response (including 401) counts as reachable.
   */
  async probe(): Promise<boolean> {
    try {
      await this.fetchFn(`${this.baseUrl}/api/v1/settings`, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(5000)
      });
      return true;
    } catch {
      return false;
    }
  }

  async settings(): Promise<unknown> {
    return this.request<unknown>("GET", "/api/v1/settings");
  }

  async listExtensions(): Promise<ExtensionRecord[]> {
    const response = await this.request<{ extensions?: ExtensionRecord[] }>("GET", "/api/v1/spindle");
    return Array.isArray(response?.extensions) ? response.extensions : [];
  }

  async resolveExtensionId(identifier = "inlay-illustrator"): Promise<string> {
    const normalized = identifier.trim().toLowerCase();
    const canonical = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    const target = canonical(normalized);
    const extensions = await this.listExtensions();
    const match = extensions.find((extension) =>
      extension.id.toLowerCase() === normalized
      || canonical(extension.identifier) === target
      || canonical(extension.name) === target
      || canonical(extension.identifier).includes(target)
      || canonical(extension.name).includes(target)
    );
    if (!match) throw new LumiverseError(`Extension ${identifier} is not installed or visible.`, "/api/v1/spindle", 404);
    if (match.status && match.status !== "running") {
      throw new LumiverseError(`Extension ${match.identifier || match.name || match.id} is not running.`, "/api/v1/spindle", 409);
    }
    return match.id;
  }

  /**
   * Opens a WebSocket listener for the extension's live status events (the
   * same frontend channel the extension UI uses). Events arrive as the
   * extension runs: "Generating..." progress, and crucially
   * { status: "Error", error } when its pipeline fails (e.g. parser errors
   * after GENERATION_ENDED). The driver uses this to fail fast instead of
   * polling until timeout. Close with monitor.close() or after timeoutMs.
   */
  async openExtensionStatusMonitor(
    extensionId: string,
    chatId: string,
    timeoutMs = 180_000
  ): Promise<ExtensionStatusMonitor> {
    await this.ensureAuthenticated();
    const base = new URL(this.baseUrl);
    const wsUrl = `${base.protocol === "https:" ? "wss:" : "ws:"}//${base.host}/api/ws`;
    const headers: Record<string, string> = {};
    if (this.authCookie) headers.Cookie = this.authCookie;
    if (this.bearerToken) headers.Authorization = `Bearer ${this.bearerToken}`;
    const collected: ExtensionStatusEvent[] = [];
    const socket = this.webSocketFactory(wsUrl, headers);
    let sent = false;
    let closed = false;
    const timer = setTimeout(() => { try { socket.close(); } catch { /* ignore */ } }, Math.max(5_000, timeoutMs));
    socket.onopen = (_event) => undefined;
    socket.onmessage = (event) => {
      let message: Record<string, unknown>;
      try { message = JSON.parse(String(event.data)) as Record<string, unknown>; }
      catch { return; }
      if (message.event === "CONNECTED" && !sent) {
        // Status events are broadcast to every connected frontend automatically;
        // no subscription message is required. Keep the socket open to receive them.
        sent = true;
        return;
      }
      if (message.event !== "SPINDLE_FRONTEND_MSG") return;
      const wrapper = message.payload as Record<string, unknown> | undefined;
      if (!wrapper || wrapper.extensionId !== extensionId) return;
      const data = wrapper.data as Record<string, unknown> | undefined;
      if (!data || data.type !== "status") return;
      const eventChatId = String(data.chatId ?? "");
      if (eventChatId && eventChatId !== chatId) return;
      collected.push({
        status: String(data.status ?? ""),
        ...(data.error !== undefined ? { error: String(data.error) } : {}),
        chatId: eventChatId,
        at: Date.now()
      });
    };
    socket.onerror = (_event) => undefined;
    socket.onclose = (_event) => undefined;
    return {
      close() {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        try { socket.close(); } catch { /* ignore */ }
      },
      events() {
        return collected.slice();
      }
    };
  }

  /**
   * Uses Lumiverse's authenticated WebSocket bridge—the same fixed channel as
   * an extension frontend—to send one backend message and await its correlated
   * response. The MCP tools expose only allowlisted Inlay operations.
   */
  async extensionMessage<T extends ExtensionMessageResponse>(
    extensionId: string,
    payload: Record<string, unknown>,
    options: { responseType: string; requestId?: string; timeoutMs?: number }
  ): Promise<T> {
    await this.ensureAuthenticated();
    const base = new URL(this.baseUrl);
    const wsUrl = `${base.protocol === "https:" ? "wss:" : "ws:"}//${base.host}/api/ws`;
    const headers: Record<string, string> = {};
    if (this.authCookie) headers.Cookie = this.authCookie;
    if (this.bearerToken) headers.Authorization = `Bearer ${this.bearerToken}`;
    const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? 15_000, 120_000));
    this.debug("websocket extension request", { extensionId, responseType: options.responseType });

    return new Promise<T>((resolve, reject) => {
      const socket = this.webSocketFactory(wsUrl, headers);
      let settled = false;
      let sent = false;
      const finish = (error?: Error, value?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { socket.close(); } catch { /* ignore close failures */ }
        if (error) reject(error);
        else resolve(value as T);
      };
      const timer = setTimeout(() => finish(new LumiverseError(
        `Timed out waiting for extension response ${options.responseType}.`,
        "/api/ws",
        null
      )), timeoutMs);
      socket.onopen = (_event) => undefined;
      socket.onmessage = (event) => {
        let message: Record<string, unknown>;
        try { message = JSON.parse(String(event.data)) as Record<string, unknown>; }
        catch { return; }
        if (message.event === "AUTH_ERROR") {
          finish(new LumiverseError("Lumiverse WebSocket authentication failed.", "/api/ws", 401));
          return;
        }
        if (message.event === "CONNECTED" && !sent) {
          sent = true;
          socket.send(JSON.stringify({ type: "SPINDLE_BACKEND_MSG", extensionId, payload }));
          return;
        }
        if (message.event !== "SPINDLE_FRONTEND_MSG") return;
        const wrapper = message.payload as Record<string, unknown> | undefined;
        if (!wrapper || wrapper.extensionId !== extensionId) return;
        const data = wrapper.data as ExtensionMessageResponse | undefined;
        if (!data || data.type !== options.responseType) return;
        if (options.requestId && data.requestId !== options.requestId) return;
        finish(undefined, data as T);
      };
      socket.onerror = (_event) => finish(new LumiverseError("Lumiverse WebSocket request failed.", "/api/ws", null));
      socket.onclose = (_event) => {
        if (!settled) finish(new LumiverseError("Lumiverse WebSocket closed before the extension responded.", "/api/ws", null));
      };
    });
  }

  async listCharacters(options: { search?: string; limit?: number; offset?: number } = {}): Promise<Paginated<CharacterSummaryRecord>> {
    return this.request<Paginated<CharacterSummaryRecord>>("GET", "/api/v1/characters/summary", {
      query: { search: options.search, limit: options.limit, offset: options.offset }
    });
  }

  async getCharacter(characterId: string): Promise<CharacterRecord> {
    return this.request<CharacterRecord>("GET", `/api/v1/characters/${encodeURIComponent(characterId)}`);
  }

  async createChat(input: { character_id: string; name?: string }): Promise<ChatRecord> {
    return this.request<ChatRecord>("POST", "/api/v1/chats", { body: input });
  }

  async listMessages(chatId: string, options: { limit?: number; offset?: number; tail?: boolean } = {}): Promise<Paginated<MessageRecord>> {
    return this.request<Paginated<MessageRecord>>("GET", `/api/v1/chats/${encodeURIComponent(chatId)}/messages`, {
      query: { limit: options.limit, offset: options.offset, tail: options.tail === undefined ? undefined : options.tail }
    });
  }

  async getMessage(chatId: string, messageId: string): Promise<MessageRecord> {
    // Some Lumiverse versions do not expose a single-message GET route and
    // answer with a 200/empty (or 404) payload. Fall back to the tail list,
    // which every supported version implements.
    try {
      const message = await this.request<MessageRecord | null>(
        "GET",
        `/api/v1/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`
      );
      if (message && typeof message === "object" && typeof message.id === "string") return message;
      this.debug("single-message GET returned no usable payload; using tail list", { messageId });
    } catch (error) {
      this.debug("single-message GET failed; using tail list", {
        messageId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    const page = await this.listMessages(chatId, { tail: true, limit: 50 });
    const found = (Array.isArray(page.data) ? page.data : []).find((entry) => entry.id === messageId);
    if (!found) {
      throw new LumiverseError(`Message ${messageId} not found in chat ${chatId}.`, `/api/v1/chats/${chatId}/messages`, 404);
    }
    return found;
  }

  async createMessage(chatId: string, input: { is_user: boolean; name: string; content: string }): Promise<MessageRecord> {
    return this.request<MessageRecord>("POST", `/api/v1/chats/${encodeURIComponent(chatId)}/messages`, { body: input });
  }

  async startGeneration(input: {
    chat_id: string;
    user_input?: string;
    connection_id?: string;
    persona_id?: string;
    preset_id?: string;
    generation_type?: string;
  }): Promise<{ generationId: string }> {
    return this.request<{ generationId: string }>("POST", "/api/v1/generate", { body: input });
  }

  async dryRun(input: {
    chat_id: string;
    user_input?: string;
    connection_id?: string;
    persona_id?: string;
    preset_id?: string;
    generation_type?: string;
  }): Promise<DryRunResponse> {
    return this.request<DryRunResponse>("POST", "/api/v1/generate/dry-run", { body: input });
  }

  async generationStatus(chatId: string, known?: { generationId?: string; contentLen?: number; reasoningLen?: number }): Promise<GenerateStatusResponse> {
    return this.request<GenerateStatusResponse>("GET", `/api/v1/generate/status/${encodeURIComponent(chatId)}`, {
      query: {
        generationId: known?.generationId,
        contentLen: known?.contentLen,
        reasoningLen: known?.reasoningLen
      }
    });
  }
}
