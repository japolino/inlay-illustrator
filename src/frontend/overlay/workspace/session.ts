/**
 * Workspace tab session state that is not part of the shell's WorkspaceUiStore (AM GIt local state 154485):
 * evidence modes, reclassification mode, assets view, persona analysis selection, picker return target,
 * outfit generation sessions, key manager, form selection / outfit form filter, crop requests, artist dock.
 * One store per AppController, partitioned by character id. Memory only (like Asset Maid's React state).
 */
import type { EvidenceMode } from "../../../shared/contract/character.js";
import type { OutfitImageResult, OutfitImageTarget } from "../../../shared/contract/rpc.js";
import { Store, useSelector } from "../../state/store.js";

export type ReturnTarget = "closed" | "outfit" | "outfit-generation" | "persona-outfit" | "persona-outfit-generation";

export interface GenerationDraft {
  label: string;
  description: string;
  head: string;
  top: string;
  bottom: string;
  legs: string;
  feet: string;
  nsfw: boolean;
  gender: "female" | "male" | "unknown";
}

export interface GenerationSession {
  /** Session id (changes on every open). */
  id: number;
  target: OutfitImageTarget;
  formId: string;
  outfitId?: string;
  /** Form collection revision at open (AM `collectionRevision`). */
  collectionRevision: string;
  draft: GenerationDraft;
  replaceCurrent: boolean;
  seed: string;
  seedFixed: boolean;
  useReference: boolean;
  referenceType: "character" | "style" | "character&style";
  strength: number;
  fidelity: number;
  jobId: string | null;
  results: OutfitImageResult[];
  shownResultId: string | null;
  selectedResultIds: string[];
  savedResultIds: string[];
  historyExpanded: boolean;
  saving: boolean;
  error: string | null;
}

export interface SourceSession {
  assetsView: "charx" | "persona";
  personaSelection: string[];
  evidence: { assets: EvidenceMode; prompts: EvidenceMode; persona: EvidenceMode };
  reclass: { prompts: boolean; persona: boolean };
  returnTarget: ReturnTarget;
  generation: GenerationSession | null;
  keyManagerOpen: boolean;
  /** Selected form per row (prompt key or `persona::<id>`). */
  formSelection: Record<string, string>;
  /** Outfit pane form filter per row ("all" or a form id). */
  outfitFormFilter: Record<string, string>;
  /** Incremented by the picker dock crop button (AM `cropRequest`). */
  cropRequest: number;
  /** Direct crop from a prompt row reference card (AM `PO` -> `qxt`). */
  directCrop: { key: string; formId: string } | null;
  artists: { mode: "text" | "image"; expanded: boolean; editingId: string };
  /** Finished analysis jobs the user closed. */
  dismissedJobs: string[];
  /** Row notices (success) the user consumed. */
  filterRefresh: Record<string, number>;
  /** Representative pick result shown as a pill. */
  pickResult: { text: string; tone: "success" | "warning" } | null;
}

export function defaultSourceSession(): SourceSession {
  return {
    assetsView: "charx",
    personaSelection: [],
    evidence: { assets: "image", prompts: "image", persona: "image" },
    reclass: { prompts: false, persona: false },
    returnTarget: "closed",
    generation: null,
    keyManagerOpen: false,
    formSelection: {},
    outfitFormFilter: {},
    cropRequest: 0,
    directCrop: null,
    artists: { mode: "text", expanded: false, editingId: "" },
    dismissedJobs: [],
    filterRefresh: {},
    pickResult: null
  };
}

const NONE = "__none__";

export class WorkspaceSessionStore {
  readonly store = new Store<Record<string, SourceSession>>({});
  private nextGenerationId = 1;

  get(characterId: string | null): SourceSession {
    return this.store.get()[characterId ?? NONE] ?? DEFAULT;
  }

  update(characterId: string | null, patch: Partial<SourceSession> | ((s: SourceSession) => Partial<SourceSession>)): void {
    const key = characterId ?? NONE;
    const current = this.get(characterId);
    const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
    this.store.set({ ...this.store.get(), [key]: next });
  }

  updateGeneration(characterId: string | null, patch: Partial<GenerationSession> | ((g: GenerationSession) => Partial<GenerationSession>)): void {
    this.update(characterId, (s) => (s.generation ? { generation: { ...s.generation, ...(typeof patch === "function" ? patch(s.generation) : patch) } } : {}));
  }

  openGeneration(characterId: string | null, input: Omit<GenerationSession, "id" | "jobId" | "results" | "shownResultId" | "selectedResultIds" | "savedResultIds" | "historyExpanded" | "saving" | "error">): void {
    this.update(characterId, { generation: { ...input, id: this.nextGenerationId++, jobId: null, results: [], shownResultId: null, selectedResultIds: [], savedResultIds: [], historyExpanded: false, saving: false, error: null } });
  }

  closeGeneration(characterId: string | null): void {
    this.update(characterId, { generation: null });
  }

  bumpFilter(characterId: string | null, scope: string): void {
    this.update(characterId, (s) => ({ filterRefresh: { ...s.filterRefresh, [scope]: (s.filterRefresh[scope] ?? 0) + 1 } }));
  }
}
const DEFAULT = defaultSourceSession();

const stores = new WeakMap<object, WorkspaceSessionStore>();
export function sessionStoreFor(owner: object): WorkspaceSessionStore {
  let store = stores.get(owner);
  if (!store) stores.set(owner, (store = new WorkspaceSessionStore()));
  return store;
}

export function useSourceSession(sessions: WorkspaceSessionStore, characterId: string | null): SourceSession {
  return useSelector(sessions.store, (all) => all[characterId ?? NONE]) ?? DEFAULT;
}
