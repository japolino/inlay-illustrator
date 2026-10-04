/**
 * Frontend state layer: one {@link AppController} per frontend (shared by the overlay, the drawer launcher
 * and the chat-side UI). It owns the RPC client, a global {@link Store} of backend-backed state, event
 * wiring (status/config/document/jobs/notices) and the common mutations. Screens use the hooks below.
 */
import { createContext } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type {
  AnalysisKind,
  BackendStatus,
  CharacterSummary,
  DeepPartial,
  GenerationJobSnapshot,
  JobStatus,
  OutfitImageResult,
  ProgressInfo,
  RowNotice,
  RpcError,
  RpcEventName,
  RpcEvents,
  WorkspaceSnapshot
} from "../../shared/contract/rpc.js";
import type { ChatImageGenerationSettings, InlayConfig, UiState } from "../../shared/contract/config.js";
import { RpcCallError, toRpcError, type CallOptions, type ClientMethod, type ClientParams, type ClientResult, type RpcClient } from "../rpc/client.js";
import { Store, useSelector } from "./store.js";

export type LoadState = "idle" | "loading" | "ready" | "error";

export interface AnalysisJobState {
  jobId: string;
  kind: AnalysisKind;
  characterId: string;
  status: JobStatus;
  progress: ProgressInfo;
  rows: RowNotice[];
  message?: string;
  error?: RpcError;
  startedAt: number;
  finishedAt?: number;
}

export interface OutfitJobState {
  jobId: string;
  progress: ProgressInfo | null;
  result?: OutfitImageResult;
  error?: RpcError;
  done: boolean;
}

export interface AppState {
  /** Handshake state with the backend. */
  connection: LoadState;
  connectionError: RpcError | null;
  status: BackendStatus | null;
  config: InlayConfig | null;
  chatImageGeneration: ChatImageGenerationSettings | null;
  uiState: UiState | null;
  characters: CharacterSummary[] | null;
  charactersState: LoadState;
  /** Character shown in the overlay workspace (defaults to the active chat character). */
  selectedCharacterId: string | null;
  workspace: WorkspaceSnapshot | null;
  workspaceState: LoadState;
  workspaceError: RpcError | null;
  analysisJobs: Record<string, AnalysisJobState>;
  outfitJobs: Record<string, OutfitJobState>;
  generationJobs: Record<string, GenerationJobSnapshot>;
  /** Bumped on `chatData.changed` per chat (chat-side UI and zoom re-read history). */
  chatDataRevision: Record<string, number>;
  /** Bumped on `document.changed` per character. */
  documentRevision: Record<string, number>;
}

export function createInitialAppState(): AppState {
  return {
    connection: "idle",
    connectionError: null,
    status: null,
    config: null,
    chatImageGeneration: null,
    uiState: null,
    characters: null,
    charactersState: "idle",
    selectedCharacterId: null,
    workspace: null,
    workspaceState: "idle",
    workspaceError: null,
    analysisJobs: {},
    outfitJobs: {},
    generationJobs: {},
    chatDataRevision: {},
    documentRevision: {}
  };
}

export type NoticeTone = "info" | "success" | "warning" | "danger";
export interface AppNotice { tone: NoticeTone; message: string; key?: string; durationMs?: number }
type NoticeSink = (notice: AppNotice) => void;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Deep merge used for optimistic config patches (arrays replace). */
export function mergePatch<T>(base: T, patch: unknown): T {
  if (!isObject(base) || !isObject(patch)) return (patch === undefined ? base : (patch as T));
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = isObject(value) && isObject(out[key]) ? mergePatch(out[key], value as never) : value;
  }
  return out as T;
}

const FINISHED_JOB_TTL_MS = 30_000;

export class AppController {
  readonly client: RpcClient;
  readonly store = new Store<AppState>(createInitialAppState());
  readonly surface: "overlay" | "drawer" | "chat";
  private readonly noticeSinks = new Set<NoticeSink>();
  private readonly disposers: Array<() => void> = [];
  private workspaceRequest = 0;
  private initPromise: Promise<void> | null = null;

  constructor(client: RpcClient, options: { surface?: "overlay" | "drawer" | "chat" } = {}) {
    this.client = client;
    this.surface = options.surface ?? "overlay";
    this.wireEvents();
  }

  get state(): AppState {
    return this.store.get();
  }

  /** Typed RPC call (thin wrapper so screens only need the controller). */
  call<M extends ClientMethod>(method: M, params: ClientParams<M>, options?: CallOptions): Promise<ClientResult<M>> {
    return this.client.call(method, params, options);
  }

  /** Handshake + initial loads. Safe to call many times (one run at a time; re-runs after an error). */
  init(): Promise<void> {
    if (this.initPromise && this.state.connection !== "error") return this.initPromise;
    this.store.patch({ connection: "loading", connectionError: null });
    this.initPromise = (async () => {
      try {
        const hello = await this.call("session.hello", { protocol: 1, clientId: this.client.clientId, surface: this.surface });
        this.store.patch({ status: hello.status });
        const [cfg] = await Promise.all([this.call("config.get", {}), this.loadCharacters()]);
        this.store.patch({ config: cfg.config, chatImageGeneration: cfg.chatImageGeneration, uiState: cfg.uiState, connection: "ready" });
        if (!this.state.selectedCharacterId) {
          const preferred = hello.status.activeCharacterId ?? this.state.characters?.[0]?.characterId ?? null;
          if (preferred) await this.selectCharacter(preferred);
        }
      } catch (error) {
        this.store.patch({ connection: "error", connectionError: toRpcError(error) });
      }
    })();
    return this.initPromise;
  }

  async loadCharacters(): Promise<void> {
    this.store.patch({ charactersState: "loading" });
    try {
      const { characters } = await this.call("workspace.listCharacters", {});
      this.store.patch({ characters, charactersState: "ready" });
    } catch (error) {
      this.store.patch({ charactersState: "error" });
      this.notifyError(error);
    }
  }

  /** Switches the workspace character and loads its snapshot. */
  async selectCharacter(characterId: string | null, options: { reload?: boolean } = {}): Promise<void> {
    const changed = characterId !== this.state.selectedCharacterId;
    this.store.patch({ selectedCharacterId: characterId, ...(changed ? { workspace: null } : {}) });
    if (!characterId) {
      this.store.patch({ workspaceState: "idle", workspaceError: null });
      return;
    }
    const request = ++this.workspaceRequest;
    this.store.patch({ workspaceState: "loading", workspaceError: null });
    try {
      const snapshot = await this.call("workspace.load", { characterId, reload: options.reload });
      if (request !== this.workspaceRequest) return;
      this.store.patch({ workspace: snapshot, workspaceState: "ready" });
    } catch (error) {
      if (request !== this.workspaceRequest) return;
      this.store.patch({ workspaceState: "error", workspaceError: toRpcError(error) });
    }
  }

  reloadWorkspace(): Promise<void> {
    return this.selectCharacter(this.state.selectedCharacterId, { reload: true });
  }

  /** Replaces the current snapshot with one returned by a mutation (ignored when the character changed). */
  applyWorkspace(snapshot: WorkspaceSnapshot): void {
    if (snapshot.characterId !== this.state.selectedCharacterId) return;
    this.store.patch({ workspace: snapshot, workspaceState: "ready", workspaceError: null });
  }

  /** Runs a mutation that returns a WorkspaceSnapshot and applies it. Errors become toasts and are rethrown. */
  async mutateWorkspace<M extends ClientMethod>(method: M, params: ClientParams<M>): Promise<ClientResult<M>> {
    try {
      const result = await this.call(method, params);
      const snapshot: unknown = isObject(result) && "snapshot" in result ? (result as unknown as { snapshot: WorkspaceSnapshot }).snapshot : result;
      if (isObject(snapshot) && typeof (snapshot as { characterId?: unknown }).characterId === "string" && "roster" in snapshot) {
        this.applyWorkspace(snapshot as unknown as WorkspaceSnapshot);
      }
      return result;
    } catch (error) {
      this.notifyError(error);
      throw error;
    }
  }

  /** Optimistic config patch: applied locally at once, replaced by the normalized result, rolled back on error. */
  async updateConfig(patch: DeepPartial<InlayConfig>): Promise<InlayConfig | null> {
    const before = this.state.config;
    if (before) this.store.patch({ config: mergePatch(before, patch) });
    try {
      const { config } = await this.call("config.update", { patch });
      this.store.patch({ config });
      return config;
    } catch (error) {
      if (before) this.store.patch({ config: before });
      this.notifyError(error);
      return null;
    }
  }

  async setChatImageGeneration(settings: ChatImageGenerationSettings): Promise<string | null> {
    const before = this.state.chatImageGeneration;
    this.store.patch({ chatImageGeneration: settings });
    try {
      const result = await this.call("chatImageGeneration.set", { settings });
      this.store.patch({ chatImageGeneration: result.settings });
      return result.notice;
    } catch (error) {
      this.store.patch({ chatImageGeneration: before });
      this.notifyError(error);
      return null;
    }
  }

  private uiStateTimer: ReturnType<typeof setTimeout> | null = null;
  /** Local UI state (layout, per-character tab) — saved debounced. */
  setUiState(next: UiState): void {
    this.store.patch({ uiState: next });
    if (this.uiStateTimer) clearTimeout(this.uiStateTimer);
    this.uiStateTimer = setTimeout(() => {
      this.uiStateTimer = null;
      this.call("uiState.set", { uiState: next }).catch(() => undefined);
    }, 400);
  }

  /** Developer mode is a config field (AM `ui.developerModeEnabled`). */
  setDeveloperMode(enabled: boolean): Promise<InlayConfig | null> {
    return this.updateConfig({ ui: { developerModeEnabled: enabled } });
  }

  /** Starts an analysis job and tracks it in `analysisJobs`. */
  async startAnalysis(params: ClientParams<"analysis.start">): Promise<string | null> {
    try {
      const { jobId } = await this.call("analysis.start", params);
      this.upsertAnalysisJob({ jobId, kind: params.kind, characterId: params.characterId, status: "queued", progress: { label: "Queued" }, rows: [], startedAt: Date.now() });
      return jobId;
    } catch (error) {
      this.notifyError(error);
      return null;
    }
  }

  async cancelAnalysis(jobId: string): Promise<void> {
    try {
      await this.call("analysis.cancel", { jobId });
    } catch (error) {
      this.notifyError(error);
    }
  }

  /** Running analysis jobs (optionally of one kind / character). */
  activeAnalysis(filter: { kind?: AnalysisKind; characterId?: string } = {}): AnalysisJobState[] {
    return Object.values(this.state.analysisJobs).filter((job) =>
      !job.finishedAt && (!filter.kind || job.kind === filter.kind) && (!filter.characterId || job.characterId === filter.characterId));
  }

  /** Toast / notice sinks (overlay toast store, chat-side toast stack). */
  onNotice(sink: NoticeSink): () => void {
    this.noticeSinks.add(sink);
    return () => this.noticeSinks.delete(sink);
  }

  notify(notice: AppNotice): void {
    for (const sink of [...this.noticeSinks]) {
      try {
        sink(notice);
      } catch (error) {
        console.error("[Inlay Illustrator] notice sink failed:", error);
      }
    }
  }

  notifyError(error: unknown, context?: string): void {
    const rpc = toRpcError(error);
    if (rpc.code === "cancelled") return;
    this.notify({ tone: "danger", message: context ? `${context}: ${rpc.message}` : rpc.message });
  }

  destroy(): void {
    for (const dispose of this.disposers.splice(0)) dispose();
    if (this.uiStateTimer) clearTimeout(this.uiStateTimer);
    this.noticeSinks.clear();
  }

  private on<E extends RpcEventName>(event: E, handler: (payload: RpcEvents[E]) => void): void {
    this.disposers.push(this.client.on(event, handler));
  }

  private upsertAnalysisJob(job: AnalysisJobState): void {
    this.store.patch({ analysisJobs: { ...this.state.analysisJobs, [job.jobId]: job } });
  }

  private scheduleJobCleanup(kind: "analysisJobs" | "outfitJobs", jobId: string): void {
    setTimeout(() => {
      const jobs = { ...this.state[kind] } as Record<string, unknown>;
      if (!(jobId in jobs)) return;
      delete jobs[jobId];
      this.store.patch({ [kind]: jobs } as Partial<AppState>);
    }, FINISHED_JOB_TTL_MS);
  }

  private bump(field: "chatDataRevision" | "documentRevision", key: string): void {
    const map = this.state[field];
    this.store.patch({ [field]: { ...map, [key]: (map[key] ?? 0) + 1 } } as Partial<AppState>);
  }

  private wireEvents(): void {
    this.on("status.changed", (status) => {
      const previous = this.state.status;
      this.store.patch({ status });
      if (previous && previous.activeCharacterId !== status.activeCharacterId && status.activeCharacterId && !this.state.selectedCharacterId) {
        void this.selectCharacter(status.activeCharacterId);
      }
    });
    this.on("config.changed", ({ config }) => this.store.patch({ config }));
    this.on("chatImageGeneration.changed", ({ settings }) => this.store.patch({ chatImageGeneration: settings }));
    this.on("document.changed", ({ characterId }) => {
      this.bump("documentRevision", characterId);
      if (characterId === this.state.selectedCharacterId && this.state.workspaceState !== "loading") void this.selectCharacter(characterId);
    });
    this.on("chatData.changed", ({ chatId }) => this.bump("chatDataRevision", chatId));
    this.on("analysis.progress", (payload) => {
      const existing = this.state.analysisJobs[payload.jobId];
      this.upsertAnalysisJob({
        jobId: payload.jobId,
        kind: payload.kind,
        characterId: payload.characterId,
        status: payload.status,
        progress: payload.progress,
        rows: payload.rows ?? existing?.rows ?? [],
        startedAt: existing?.startedAt ?? Date.now()
      });
    });
    this.on("analysis.finished", (payload) => {
      const existing = this.state.analysisJobs[payload.jobId];
      this.upsertAnalysisJob({
        jobId: payload.jobId,
        kind: payload.kind,
        characterId: payload.characterId,
        status: payload.status,
        progress: existing?.progress ?? { label: payload.message },
        rows: existing?.rows ?? [],
        message: payload.message,
        error: payload.error,
        startedAt: existing?.startedAt ?? Date.now(),
        finishedAt: Date.now()
      });
      this.scheduleJobCleanup("analysisJobs", payload.jobId);
    });
    this.on("outfitImage.progress", ({ jobId, progress }) => {
      this.store.patch({ outfitJobs: { ...this.state.outfitJobs, [jobId]: { ...this.state.outfitJobs[jobId], jobId, progress, done: false } } });
    });
    this.on("outfitImage.finished", ({ jobId, result, error }) => {
      const existing = this.state.outfitJobs[jobId];
      this.store.patch({ outfitJobs: { ...this.state.outfitJobs, [jobId]: { jobId, progress: existing?.progress ?? null, result, error, done: true } } });
      this.scheduleJobCleanup("outfitJobs", jobId);
    });
    this.on("generation.progress", (job) => {
      this.store.patch({ generationJobs: { ...this.state.generationJobs, [job.jobId]: job } });
    });
    this.on("generation.finished", ({ jobId }) => {
      const jobs = { ...this.state.generationJobs };
      delete jobs[jobId];
      this.store.patch({ generationJobs: jobs });
    });
    this.on("notice", (notice) => this.notify({ tone: notice.tone, message: notice.message, key: notice.key }));
    this.on("error", ({ error, context }) => this.notifyError(new RpcCallError(context ?? "event", error), context));
  }
}

/* ------------------------------------------------------------------------------------------------
 * Hooks
 * ---------------------------------------------------------------------------------------------- */

export const AppContext = createContext<AppController | null>(null);

export function useApp(): AppController {
  const app = useContext(AppContext);
  if (!app) throw new Error("AppContext is missing (wrap the tree in <AppContext.Provider value={controller}>).");
  return app;
}

/** Selects part of the global app state. */
export function useAppState<S>(selector: (state: AppState) => S): S {
  return useSelector(useApp().store, selector);
}

export interface QueryState<T> {
  data: T | undefined;
  error: RpcError | null;
  loading: boolean;
  /** Re-runs the query. */
  reload: () => Promise<void>;
  /** Local overwrite (optimistic updates). */
  setData: (next: T | ((previous: T | undefined) => T)) => void;
}

/**
 * Runs an RPC query when `params` changes (by JSON identity). `params === null` skips the call.
 * `deps` adds extra re-run triggers (e.g. a document revision).
 */
export function useRpcQuery<M extends ClientMethod>(method: M, params: ClientParams<M> | null, deps: unknown[] = []): QueryState<ClientResult<M>> {
  const app = useApp();
  const [data, setDataState] = useState<ClientResult<M> | undefined>(undefined);
  const [error, setError] = useState<RpcError | null>(null);
  const [loading, setLoading] = useState(params !== null);
  const key = params === null ? null : JSON.stringify(params);
  const run = useRef(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const reload = useCallback(async () => {
    const current = paramsRef.current;
    if (current === null) {
      setLoading(false);
      return;
    }
    const id = ++run.current;
    setLoading(true);
    try {
      const result = await app.call(method, current);
      if (id !== run.current) return;
      setDataState(() => result);
      setError(null);
    } catch (caught) {
      if (id !== run.current) return;
      setError(toRpcError(caught));
    } finally {
      if (id === run.current) setLoading(false);
    }
  }, [app, method]);

  useEffect(() => {
    void reload();
  }, [key, reload, ...deps]);

  const setData = useCallback((next: ClientResult<M> | ((previous: ClientResult<M> | undefined) => ClientResult<M>)) => {
    setDataState((previous) => (typeof next === "function" ? (next as (p: ClientResult<M> | undefined) => ClientResult<M>)(previous) : next));
  }, []);

  return { data, error, loading, reload, setData };
}

export interface MutationState<M extends ClientMethod> {
  run: (params: ClientParams<M>) => Promise<ClientResult<M>>;
  pending: boolean;
  error: RpcError | null;
  reset: () => void;
}

/** Wraps a mutation: tracks `pending`/`error`; errors are also shown as toasts unless `silent`. */
export function useRpcMutation<M extends ClientMethod>(method: M, options: { silent?: boolean; onSuccess?: (result: ClientResult<M>) => void } = {}): MutationState<M> {
  const app = useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RpcError | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const run = useCallback(async (params: ClientParams<M>) => {
    setPending(true);
    setError(null);
    try {
      const result = await app.call(method, params);
      optionsRef.current.onSuccess?.(result);
      return result;
    } catch (caught) {
      const rpc = toRpcError(caught);
      setError(rpc);
      if (!optionsRef.current.silent) app.notifyError(caught);
      throw caught;
    } finally {
      setPending(false);
    }
  }, [app, method]);
  return { run, pending, error, reset: () => setError(null) };
}

export interface DraftState<T> {
  value: T;
  dirty: boolean;
  /** Replaces the draft. */
  set: (next: T | ((previous: T) => T)) => void;
  /** Drops local edits (back to the source). */
  reset: () => void;
}

/**
 * Local editable copy of a server value (Asset Maid edits forms/outfits client-side and saves the whole
 * collection). The draft follows `source` while it is clean; `key` switches the edited object.
 */
export function useDraft<T>(source: T, key: string, equals: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b)): DraftState<T> {
  const [state, setState] = useState<{ key: string; value: T; base: T }>(() => ({ key, value: source, base: source }));
  let current = state;
  if (state.key !== key || (equals(state.value, state.base) && !equals(state.base, source))) {
    current = { key, value: source, base: source };
  }
  useEffect(() => {
    if (current !== state) setState(current);
  });
  const set = useCallback((next: T | ((previous: T) => T)) => {
    setState((previous) => ({ ...previous, value: typeof next === "function" ? (next as (p: T) => T)(previous.value) : next }));
  }, []);
  const reset = useCallback(() => setState((previous) => ({ ...previous, value: previous.base })), []);
  const dirty = useMemo(() => !equals(current.value, current.base), [current.value, current.base]);
  return { value: current.value, dirty, set, reset };
}
