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
import type { AtelierChangedEvent, AtelierState } from "../../shared/contract/atelier.js";
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
  /** Bumped by `resync()`: chat-side views re-read every message state they show. */
  resyncCount: number;
  /** Maid Atelier state (`atelier.get`), loaded on demand by the Atelier and the chat toolbar guideline menu. */
  atelier: AtelierState | null;
  atelierState: LoadState;
  atelierError: RpcError | null;
  /** Last `atelier.changed` event (the Atelier compares it with its drafts). */
  atelierEvent: AtelierChangedEvent | null;
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
    documentRevision: {},
    resyncCount: 0,
    atelier: null,
    atelierState: "idle",
    atelierError: null,
    atelierEvent: null
  };
}

export type NoticeTone = "info" | "success" | "warning" | "danger";
export interface AppNotice { tone: NoticeTone; message: string; key?: string; durationMs?: number }
type NoticeSink = (notice: AppNotice) => void;

const isLive = (status: JobStatus) => status === "queued" || status === "running";
function remove<T>(list: T[], item: T): void {
  const index = list.indexOf(item);
  if (index >= 0) list.splice(index, 1);
}

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
/**
 * A finished job id is remembered this long: a job list read before the finish (resync, recover) or a late progress
 * event never brings it back as running.
 */
const FINISHED_TOMBSTONE_TTL_MS = 60_000;
/** A break in the event sequence (backend restart, dropped events) re-reads the state after this delay (one read per burst). */
const STREAM_BREAK_RESYNC_MS = 1_000;
/** Failed analysis jobs wait for their error to be dismissed; beyond this many the oldest are dropped. */
const MAX_UNDISMISSED_ANALYSIS_ERRORS = 10;

export class AppController {
  readonly client: RpcClient;
  readonly store = new Store<AppState>(createInitialAppState());
  readonly surface: "overlay" | "drawer" | "chat";
  private readonly noticeSinks = new Set<NoticeSink>();
  private readonly disposers: Array<() => void> = [];
  private workspaceRequest = 0;
  /** A `document.changed` arrived while a load was in flight: load once more when it ends. */
  private reloadPending = false;
  private initPromise: Promise<void> | null = null;
  /** jobId -> finish time of generation / analysis jobs (see FINISHED_TOMBSTONE_TTL_MS). */
  private readonly finishedJobs = new Map<string, number>();
  /** Bumped by every status read or `status.changed`: an older `session.getStatus` answer is dropped. */
  private statusRequest = 0;
  private breakTimer: ReturnType<typeof setTimeout> | null = null;
  /** Config patches in flight (oldest first) and the last config the backend sent. */
  private readonly configPatches: Array<{ patch: DeepPartial<InlayConfig> }> = [];
  private committedConfig: InlayConfig | null = null;
  /** Chat image settings in flight (oldest first) and the last value the backend sent. */
  private readonly chatSettingsPending: Array<{ settings: ChatImageGenerationSettings }> = [];
  private committedChatSettings: ChatImageGenerationSettings | null = null;

  constructor(client: RpcClient, options: { surface?: "overlay" | "drawer" | "chat" } = {}) {
    this.client = client;
    this.surface = options.surface ?? "overlay";
    this.wireEvents();
    this.disposers.push(client.onStreamBreak(() => this.scheduleBreakResync()));
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
        this.statusRequest += 1;
        this.store.patch({ status: hello.status });
        const [cfg] = await Promise.all([this.call("config.get", {}), this.loadCharacters()]);
        this.applyServerConfig(cfg);
        this.store.patch({ uiState: cfg.uiState, connection: "ready" });
        void this.recoverActiveJobs();
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

  /** Jobs that were already running before this page loaded (Stop buttons, spinners, footer busy). */
  private async recoverActiveJobs(): Promise<void> {
    const [analysis, generation] = await Promise.all([
      this.call("analysis.listActive", {}).catch(() => ({ jobs: [] })),
      this.call("generation.listActive", {}).catch(() => ({ jobs: [] }))
    ]);
    for (const job of analysis.jobs) {
      if (this.state.analysisJobs[job.jobId] || this.isFinishedJob(job.jobId)) continue;
      this.upsertAnalysisJob({ jobId: job.jobId, kind: job.kind, characterId: job.characterId, status: job.status, progress: job.progress, rows: [], startedAt: Date.now() });
    }
    const generationJobs = { ...this.state.generationJobs };
    for (const job of generation.jobs) if (!generationJobs[job.jobId] && isLive(job.status) && !this.isFinishedJob(job.jobId)) generationJobs[job.jobId] = job;
    this.store.patch({ generationJobs });
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
    if (this.reloadPending && request === this.workspaceRequest && characterId === this.state.selectedCharacterId) {
      this.reloadPending = false;
      void this.selectCharacter(characterId);
    }
  }

  /**
   * The character's stored data changed (document write, or an analysis that wrote only the metadata cache / global
   * persona settings): bump the revision (personas, charx settings refetch) and reload the workspace snapshot.
   */
  private documentChanged(characterId: string): void {
    this.bump("documentRevision", characterId);
    if (characterId !== this.state.selectedCharacterId) return;
    if (this.state.workspaceState === "loading") this.reloadPending = true;
    else void this.selectCharacter(characterId);
  }

  /**
   * Applies a backend status. When the active chat moves to another character, the workspace follows it, so
   * per-character settings (artist, prompts) are edited for the chat the user is in.
   */
  setStatus(status: BackendStatus): void {
    const previous = this.state.status;
    this.store.patch({ status });
    const active = status.activeCharacterId;
    if (active && active !== previous?.activeCharacterId && active !== this.state.selectedCharacterId) void this.selectCharacter(active);
  }

  reloadWorkspace(): Promise<void> {
    return this.selectCharacter(this.state.selectedCharacterId, { reload: true });
  }

  /**
   * Re-reads everything the backend keeps current through events, for when the page was disconnected (events sent
   * meanwhile are lost): status, settings, running jobs (a job that ended meanwhile loses its spinner), the open chat's
   * data and the workspace. Does nothing before the first handshake; a failed read keeps the current state.
   */
  async resync(): Promise<void> {
    if (this.state.connection !== "ready") return;
    const statusRequest = ++this.statusRequest;
    try {
      const [status, cfg, analysis, generation] = await Promise.all([
        this.call("session.getStatus", {}),
        this.call("config.get", {}),
        this.call("analysis.listActive", {}),
        this.call("generation.listActive", {})
      ]);
      if (statusRequest === this.statusRequest) this.setStatus(status);
      this.applyServerConfig(cfg);
      this.store.patch({ uiState: cfg.uiState });
      const running = new Set(analysis.jobs.map((job) => job.jobId));
      const analysisJobs: Record<string, AnalysisJobState> = {};
      for (const [jobId, job] of Object.entries(this.state.analysisJobs)) if (job.finishedAt !== undefined || running.has(jobId)) analysisJobs[jobId] = job;
      for (const job of analysis.jobs) {
        const existing: AnalysisJobState | undefined = analysisJobs[job.jobId];
        // The lists may predate a finish received while they were read: a finished job stays finished.
        if (existing?.finishedAt !== undefined || this.isFinishedJob(job.jobId)) continue;
        analysisJobs[job.jobId] = { ...existing, jobId: job.jobId, kind: job.kind, characterId: job.characterId, status: job.status, progress: job.progress, rows: existing?.rows ?? [], startedAt: existing?.startedAt ?? Date.now() };
      }
      const generationJobs: Record<string, GenerationJobSnapshot> = {};
      for (const job of generation.jobs) if (isLive(job.status) && !this.isFinishedJob(job.jobId)) generationJobs[job.jobId] = job;
      this.store.patch({ analysisJobs, generationJobs, resyncCount: this.state.resyncCount + 1 });
      const activeChatId = this.state.status?.activeChatId;
      if (activeChatId) this.bump("chatDataRevision", activeChatId);
      if (this.state.selectedCharacterId) await this.reloadWorkspace();
    } catch {
      // Still disconnected or a read failed: the next reconnect or visibility change tries again.
    }
  }

  /** Host reconnect, tab shown again, event stream break: re-reads the state, or retries a failed handshake. */
  reconnect(): Promise<void> {
    return this.state.connection === "error" ? this.init() : this.resync();
  }

  /** Re-reads the backend status (chat switch). An answer older than a later status read or event is dropped. */
  async refreshStatus(): Promise<void> {
    const request = ++this.statusRequest;
    try {
      const status = await this.call("session.getStatus", {});
      if (request === this.statusRequest) this.setStatus(status);
    } catch {
      // The next switch, status.changed or resync brings the status.
    }
  }

  /** The generation / analysis job finished recently: a job list naming it as running is older than that. */
  isFinishedJob(jobId: string): boolean {
    const now = Date.now();
    for (const [id, at] of this.finishedJobs) if (now - at > FINISHED_TOMBSTONE_TTL_MS) this.finishedJobs.delete(id);
    return this.finishedJobs.has(jobId);
  }

  private scheduleBreakResync(): void {
    if (this.breakTimer) return;
    this.breakTimer = setTimeout(() => {
      this.breakTimer = null;
      void this.reconnect();
    }, STREAM_BREAK_RESYNC_MS);
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

  /**
   * Settings read from the backend (config.get, an answer, a `*.changed` echo). Optimistic changes still in flight stay
   * on top, so the echo of an older change does not revert a newer one.
   */
  applyServerConfig(values: { config?: InlayConfig; chatImageGeneration?: ChatImageGenerationSettings }): void {
    if (values.config) this.committedConfig = values.config;
    if (values.chatImageGeneration) this.committedChatSettings = values.chatImageGeneration;
    this.showConfig();
  }

  private showConfig(): void {
    const config = this.committedConfig && this.configPatches.reduce((c, entry) => mergePatch(c, entry.patch), this.committedConfig);
    const chat = this.chatSettingsPending.at(-1)?.settings ?? this.committedChatSettings;
    this.store.patch({ ...(config ? { config } : {}), ...(chat ? { chatImageGeneration: chat } : {}) });
  }

  /**
   * Optimistic config patch: applied locally at once, then the normalized result. A failure drops this patch only (the
   * last backend config with the other patches in flight on top) and throws.
   */
  async updateConfigStrict(patch: DeepPartial<InlayConfig>): Promise<InlayConfig> {
    const entry = { patch };
    this.configPatches.push(entry);
    const current = this.state.config;
    if (current) this.store.patch({ config: mergePatch(current, patch) });
    try {
      const { config } = await this.call("config.update", { patch });
      remove(this.configPatches, entry);
      this.applyServerConfig({ config });
      return config;
    } catch (error) {
      remove(this.configPatches, entry);
      this.showConfig();
      throw error;
    }
  }

  /** {@link updateConfigStrict}; an error becomes a toast (null). */
  async updateConfig(patch: DeepPartial<InlayConfig>): Promise<InlayConfig | null> {
    try {
      return await this.updateConfigStrict(patch);
    } catch (error) {
      this.notifyError(error);
      return null;
    }
  }

  /** Optimistic chat image settings (the newest value in flight is shown); a failure drops this value only. */
  async setChatImageGeneration(settings: ChatImageGenerationSettings): Promise<string | null> {
    const entry = { settings };
    this.chatSettingsPending.push(entry);
    this.store.patch({ chatImageGeneration: settings });
    try {
      const result = await this.call("chatImageGeneration.set", { settings });
      remove(this.chatSettingsPending, entry);
      this.applyServerConfig({ chatImageGeneration: result.settings });
      return result.notice;
    } catch (error) {
      remove(this.chatSettingsPending, entry);
      this.showConfig();
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

  private atelierRequest = 0;
  /** Loads (or reloads) the Maid Atelier state. Concurrent calls keep the newest answer only. */
  async loadAtelier(): Promise<AtelierState | null> {
    const request = ++this.atelierRequest;
    if (!this.state.atelier) this.store.patch({ atelierState: "loading", atelierError: null });
    try {
      const { state } = await this.call("atelier.get", {});
      if (request === this.atelierRequest) this.store.patch({ atelier: state, atelierState: "ready", atelierError: null });
      return state;
    } catch (error) {
      if (request === this.atelierRequest) this.store.patch({ atelierState: "error", atelierError: toRpcError(error) });
      return null;
    }
  }

  /** Applies an Atelier state returned by a write (an older store revision never replaces a newer one). */
  applyAtelier(state: AtelierState): void {
    const current = this.state.atelier;
    if (current && current.storeRevision > state.storeRevision) return;
    this.atelierRequest += 1;
    this.store.patch({ atelier: state, atelierState: "ready", atelierError: null });
  }

  /** Developer mode is a config field (AM `ui.developerModeEnabled`). */
  setDeveloperMode(enabled: boolean): Promise<InlayConfig | null> {
    return this.updateConfig({ ui: { developerModeEnabled: enabled } });
  }

  /** Starts an analysis job and tracks it in `analysisJobs`. */
  async startAnalysis(params: ClientParams<"analysis.start">): Promise<string | null> {
    try {
      const { jobId } = await this.call("analysis.start", params);
      // An early analysis.progress event may already have created the job.
      if (!this.state.analysisJobs[jobId]) this.upsertAnalysisJob({ jobId, kind: params.kind, characterId: params.characterId, status: "queued", progress: { label: "Queued" }, rows: [], startedAt: Date.now() });
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

  /** The user closed a failed job's error: drops the job (failed jobs are not cleaned up on their own). */
  dismissAnalysisJob(jobId: string): void {
    if (!(jobId in this.state.analysisJobs)) return;
    const jobs = { ...this.state.analysisJobs };
    delete jobs[jobId];
    this.store.patch({ analysisJobs: jobs });
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
    if (this.breakTimer) clearTimeout(this.breakTimer);
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

  private dropOldAnalysisErrors(): void {
    const errors = Object.values(this.state.analysisJobs)
      .filter((job) => job.finishedAt !== undefined && job.status === "error")
      .sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0));
    if (errors.length <= MAX_UNDISMISSED_ANALYSIS_ERRORS) return;
    const jobs = { ...this.state.analysisJobs };
    for (const job of errors.slice(0, errors.length - MAX_UNDISMISSED_ANALYSIS_ERRORS)) delete jobs[job.jobId];
    this.store.patch({ analysisJobs: jobs });
  }

  private bump(field: "chatDataRevision" | "documentRevision", key: string): void {
    const map = this.state[field];
    this.store.patch({ [field]: { ...map, [key]: (map[key] ?? 0) + 1 } } as Partial<AppState>);
  }

  private wireEvents(): void {
    this.on("status.changed", (status) => {
      this.statusRequest += 1;
      this.setStatus(status);
    });
    this.on("config.changed", ({ config }) => this.applyServerConfig({ config }));
    this.on("chatImageGeneration.changed", ({ settings }) => this.applyServerConfig({ chatImageGeneration: settings }));
    this.on("document.changed", ({ characterId }) => this.documentChanged(characterId));
    this.on("chatData.changed", ({ chatId }) => this.bump("chatDataRevision", chatId));
    this.on("atelier.changed", (event) => {
      this.store.patch({ atelierEvent: event });
      const current = this.state.atelier;
      if (this.state.atelierState !== "idle" && (!current || current.storeRevision < event.storeRevision)) void this.loadAtelier();
    });
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
      this.finishedJobs.set(payload.jobId, Date.now());
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
      // A failed job stays until its error modal is dismissed (the overlay may be closed, or an older error open).
      if (payload.status === "error") this.dropOldAnalysisErrors();
      else this.scheduleJobCleanup("analysisJobs", payload.jobId);
      // Some analyses write only the metadata cache or global persona settings (no document.changed).
      if (payload.characterId) this.documentChanged(payload.characterId);
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
      // A progress delivered after the finish would bring the job back as running for good.
      if (this.isFinishedJob(job.jobId)) return;
      this.store.patch({ generationJobs: { ...this.state.generationJobs, [job.jobId]: job } });
    });
    this.on("generation.finished", ({ jobId }) => {
      this.finishedJobs.set(jobId, Date.now());
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
 * Data and error are kept with the params they belong to: other params (or null) never show them.
 */
export function useRpcQuery<M extends ClientMethod>(method: M, params: ClientParams<M> | null, deps: unknown[] = []): QueryState<ClientResult<M>> {
  const app = useApp();
  const [result, setResult] = useState<{ key: string | null; data?: ClientResult<M>; error: RpcError | null }>({ key: null, error: null });
  const [loading, setLoading] = useState(params !== null);
  const key = params === null ? null : JSON.stringify(params);
  const run = useRef(0);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const keyRef = useRef(key);
  keyRef.current = key;

  const reload = useCallback(async () => {
    const current = paramsRef.current;
    const currentKey = keyRef.current;
    // Counted even when skipped, so an answer still in flight for the previous params is dropped.
    const id = ++run.current;
    if (current === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await app.call(method, current);
      if (id !== run.current) return;
      setResult({ key: currentKey, data, error: null });
    } catch (caught) {
      if (id !== run.current) return;
      setResult((previous) => ({ key: currentKey, data: previous.key === currentKey ? previous.data : undefined, error: toRpcError(caught) }));
    } finally {
      if (id === run.current) setLoading(false);
    }
  }, [app, method]);

  useEffect(() => {
    void reload();
  }, [key, reload, ...deps]);

  const setData = useCallback((next: ClientResult<M> | ((previous: ClientResult<M> | undefined) => ClientResult<M>)) => {
    const target = keyRef.current;
    setResult((previous) => {
      const own = previous.key === target ? previous : { key: target, error: null };
      return { ...own, data: typeof next === "function" ? (next as (p: ClientResult<M> | undefined) => ClientResult<M>)(own.data) : next };
    });
  }, []);

  const own = result.key === key;
  return { data: own ? result.data : undefined, error: own ? result.error : null, loading: loading || (key !== null && !own), reload, setData };
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
  const [running, setRunning] = useState(0);
  const [error, setError] = useState<RpcError | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const run = useCallback(async (params: ClientParams<M>) => {
    setRunning((n) => n + 1);
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
      setRunning((n) => n - 1);
    }
  }, [app, method]);
  return { run, pending: running > 0, error, reset: () => setError(null) };
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
