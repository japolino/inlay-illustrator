/**
 * Zoom viewer session (AM controller `ikt` 159189-161441, ported onto the RPC contract): current target,
 * details (`zoom.getDetails`), chat image groups (`chatDom.getMessageStates`), and every action of the viewer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { AiPromptEditRequest, RegenerationOverrides, RpcError, SlotDeletionPreview, ZoomDetails, ZoomPromptSection } from "../../shared/contract/rpc.js";
import { toRpcError } from "../rpc/client.js";
import type { AppController } from "../state/app-state.js";
import { useSelector } from "../state/store.js";
import { fill, ZOOM_LABELS } from "./labels.js";
import { buildImageGroups, downloadName, flattenItems, stepId, stepItem, type Center, type ZoomImageGroup, type ZoomImageItem } from "./model.js";

export interface ZoomTarget { chatId: string; slotId: string; entryId?: string; messageKey?: string }
export interface SaveStatus { tone: "success" | "danger"; label: string; detail?: string }

export interface ZoomSession {
  target: ZoomTarget;
  details: ZoomDetails | null;
  error: RpcError | null;
  loading: boolean;
  groups: ZoomImageGroup[];
  items: ZoomImageItem[];
  /** Name of the running operation (locks the UI), or null. */
  busy: string | null;
  /** A regeneration of this message is running. */
  regenerating: boolean;
  saveStatus: SaveStatus | null;
  slotDeletion: SlotDeletionPreview | null;
  slotDeleting: boolean;
  /** Viewed revision is not the message's active one (edits locked unless developer mode). */
  historical: boolean;
  selectItem(item: ZoomImageItem): void;
  stepItem(delta: number): void;
  stepRevision(group: ZoomImageGroup, delta: number): Promise<void>;
  selectEntry(entryId: string): void;
  stepHistory(delta: number): void;
  setSeedFixed(fixed: boolean): Promise<void>;
  setSizeId(sizeId: number): Promise<void>;
  setIncluded(actorIndex: number, included: boolean): Promise<void>;
  savePrompts(sections: ZoomPromptSection[]): Promise<boolean>;
  /** Artist for the next regeneration (main / provider card select; AM zoom artist choices). */
  setArtist(artistId: string): Promise<void>;
  /** Outfit of one actor for the next regeneration (actor card select). */
  setOutfit(actorKey: string, outfitId: string): Promise<void>;
  saveCenters(centers: (Center | null)[]): Promise<boolean>;
  clearDraft(part: "prompts" | "coordinates" | "all"): Promise<void>;
  importViewed(what: "prompts" | "seed"): Promise<void>;
  regenerate(): Promise<void>;
  deleteEntry(): Promise<void>;
  requestSlotDeletion(): Promise<void>;
  cancelSlotDeletion(): void;
  confirmSlotDeletion(): Promise<void>;
  requestAiEdit(request: AiPromptEditRequest): Promise<boolean>;
  download(): void;
  reload(): Promise<void>;
}

export function useZoomSession(app: AppController, initial: ZoomTarget, onClose: () => void, doc: Document): ZoomSession {
  const [target, setTarget] = useState<ZoomTarget>(initial);
  const [details, setDetails] = useState<ZoomDetails | null>(null);
  const [error, setError] = useState<RpcError | null>(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<ZoomImageGroup[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const [slotDeletion, setSlotDeletion] = useState<SlotDeletionPreview | null>(null);
  const [slotDeleting, setSlotDeleting] = useState(false);
  const [regenJobId, setRegenJobId] = useState<string | null>(null);
  const request = useRef(0);
  const targetRef = useRef(target);
  targetRef.current = target;
  const detailsRef = useRef(details);
  detailsRef.current = details;

  useEffect(() => setTarget(initial), [initial]);

  const chatRevision = useSelector(app.store, (s) => s.chatDataRevision[target.chatId] ?? 0);
  const jobs = useSelector(app.store, (s) => s.generationJobs);
  const items = useMemo(() => flattenItems(groups), [groups]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);

  const loadDetails = useCallback(async (next: ZoomTarget, keepOnError = false) => {
    const id = ++request.current;
    setLoading(true);
    try {
      let result: ZoomDetails;
      try {
        result = await app.call("zoom.getDetails", { chatId: next.chatId, slotId: next.slotId, ...(next.entryId ? { entryId: next.entryId } : {}) });
      } catch (caught) {
        // The viewed entry may be gone (deleted / pruned): fall back to the slot's selected entry.
        if (!next.entryId || toRpcError(caught).code !== "not-found") throw caught;
        result = await app.call("zoom.getDetails", { chatId: next.chatId, slotId: next.slotId });
      }
      if (id !== request.current) return;
      setDetails(result);
      setError(null);
    } catch (caught) {
      if (id !== request.current) return;
      if (!keepOnError) setDetails(null);
      setError(toRpcError(caught));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [app]);

  const loadGroups = useCallback(async (chatId: string) => {
    try {
      const { messages } = await app.call("chatDom.getMessageStates", { chatId });
      setGroups(buildImageGroups(messages));
      setGroupsLoaded(true);
    } catch {
      // keep the previous list
    }
  }, [app]);

  useEffect(() => {
    void loadDetails(target);
  }, [target.chatId, target.slotId, target.entryId]);
  useEffect(() => {
    void loadGroups(target.chatId);
  }, [target.chatId, chatRevision]);
  // Chat data changed elsewhere (re-bake, regeneration): refresh the viewed slot without dropping the view.
  const firstRevision = useRef(chatRevision);
  useEffect(() => {
    if (firstRevision.current === chatRevision) return;
    void loadDetails(targetRef.current, true);
  }, [chatRevision]);

  // Regeneration started here finished: show the newest entry of the slot.
  useEffect(() => {
    if (!regenJobId || jobs[regenJobId]) return;
    setRegenJobId(null);
    setTarget((t) => ({ ...t, entryId: undefined }));
    void loadDetails({ ...targetRef.current, entryId: undefined }, true);
  }, [jobs, regenJobId]);

  const regenerating = !!regenJobId || Object.values(jobs).some((job) => job.attemptKind === "regenerate" && (job.status === "running" || job.status === "queued") && !!details && job.messageKey === details.messageKey);
  const activeGroup = groups.find((g) => g.items.some((item) => item.slotId === target.slotId));
  const historical = !!details && !!activeGroup && activeGroup.revisionId !== details.revisionId;

  const run = useCallback(async <T,>(name: string, fn: () => Promise<T>, failure: string): Promise<T | undefined> => {
    setBusy(name);
    try {
      return await fn();
    } catch (caught) {
      app.notifyError(caught, failure);
      return undefined;
    } finally {
      setBusy(null);
    }
  }, [app]);

  const saveDraft = useCallback(async (overrides: RegenerationOverrides, name: string): Promise<boolean> => {
    const t = targetRef.current;
    const result = await run(name, () => app.call("zoom.saveDraft", { chatId: t.chatId, slotId: t.slotId, overrides }), ZOOM_LABELS.saveDraftFailed);
    if (!result) return false;
    setDetails((current) => (current && current.slotId === result.slotId && current.entryId !== result.entryId ? { ...result, entryId: current.entryId, url: current.url, history: current.history, assetName: current.assetName, kind: current.kind, width: current.width, height: current.height } : result));
    return true;
  }, [app, run]);

  const select = (item: ZoomImageItem) => setTarget({ chatId: targetRef.current.chatId, slotId: item.slotId, entryId: item.entryId, messageKey: item.messageKey });

  // The viewed slot was removed elsewhere (message / swipe / slot deleted, maybe in another tab): move to another chat
  // image, or close when the chat has none (qa #11: the viewer kept polling a dead slot).
  useEffect(() => {
    if (!groupsLoaded || loading || error?.code !== "not-found") return;
    if (items.some((i) => i.slotId === target.slotId)) return;
    const next = items.find((i) => i.messageKey === target.messageKey) ?? items[items.length - 1];
    if (next) select(next);
    else onClose();
  }, [groupsLoaded, loading, error, items]);

  const session: ZoomSession = {
    target,
    details,
    error,
    loading,
    groups,
    items,
    busy,
    regenerating,
    saveStatus,
    slotDeletion,
    slotDeleting,
    historical,
    selectItem: select,
    stepItem(delta) {
      if (busy) return;
      const next = stepItem(items, target.slotId, delta);
      if (next) select(next);
    },
    async stepRevision(group, delta) {
      const revisionId = stepId(group.revisionIds, group.revisionId, delta);
      if (!revisionId || busy) return;
      const ok = await run("revision", () => app.call("history.selectRevision", { chatId: target.chatId, messageKey: group.messageKey, revisionId }), ZOOM_LABELS.saveDraftFailed);
      if (ok === undefined) return;
      const { messages } = await app.call("chatDom.getMessageStates", { chatId: target.chatId }).catch(() => ({ messages: [] }));
      const nextGroups = buildImageGroups(messages);
      setGroups(nextGroups);
      const group2 = nextGroups.find((g) => g.messageKey === group.messageKey);
      const current = group.items.find((i) => i.slotId === target.slotId);
      const same = group2?.items.find((i) => current && i.slotIndex === current.slotIndex) ?? group2?.items[0];
      if (same) select(same);
    },
    selectEntry(entryId) {
      if (!details || entryId === details.entryId) return;
      setTarget({ ...targetRef.current, entryId });
      app.call("history.selectEntry", { chatId: target.chatId, slotId: target.slotId, entryId }).catch((error: unknown) => app.notifyError(error));
    },
    stepHistory(delta) {
      if (!details || busy) return;
      const next = stepId(details.history.map((h) => h.entryId), details.entryId, delta);
      if (next) session.selectEntry(next);
    },
    async setSeedFixed(fixed) {
      if (!details) return;
      await saveDraft({ seedFixed: fixed, seed: details.seed }, "seed");
    },
    async setSizeId(sizeId) {
      await saveDraft({ sizeId }, "size");
    },
    async setIncluded(actorIndex, included) {
      if (!details) return;
      const set = new Set(details.excludedCharacterIndexes);
      if (included) set.delete(actorIndex);
      else set.add(actorIndex);
      await saveDraft({ excludedCharacterIndexes: [...set].sort((a, b) => a - b) }, "include");
    },
    async setArtist(artistId) {
      if (!details || !artistId) return;
      await saveDraft({ artistId }, "artist");
    },
    async setOutfit(actorKey, outfitId) {
      if (!details || !actorKey || !outfitId) return;
      // The draft stores the whole map (shallow merge): send every actor's current choice plus the change.
      const outfitByActor: Record<string, string> = {};
      for (const s of details.sections) if (s.actorKey && s.selectedOutfitId) outfitByActor[s.actorKey] = s.selectedOutfitId;
      outfitByActor[actorKey] = outfitId;
      await saveDraft({ outfitByActor }, "outfit");
    },
    async savePrompts(sections) {
      return saveDraft({ sections: sections.map((s) => ({ id: s.id, value: s.value, negativeValue: s.negativeValue })) }, "prompts");
    },
    async saveCenters(centers) {
      return saveDraft({ centers }, "coordinates");
    },
    async clearDraft(part) {
      const t = targetRef.current;
      const result = await run("draft", () => app.call("zoom.clearDraft", { chatId: t.chatId, slotId: t.slotId, part }), ZOOM_LABELS.saveDraftFailed);
      if (result) setDetails(result);
    },
    async importViewed(what) {
      if (!details) return;
      const t = targetRef.current;
      const result = await run("import", () => app.call("zoom.importViewed", { chatId: t.chatId, slotId: t.slotId, entryId: details.entryId, what }), ZOOM_LABELS.saveDraftFailed);
      if (result) setDetails(result);
    },
    async regenerate() {
      if (!details || busy || regenerating) return;
      const overrides: RegenerationOverrides = {
        seedFixed: details.seedFixed,
        ...(details.seedFixed && details.seed ? { seed: details.seed } : {}),
        sizeId: details.sizeId,
        excludedCharacterIndexes: details.excludedCharacterIndexes
      };
      const result = await run("regenerate", () => app.call("generation.regenerateSlot", { chatId: details.chatId, messageKey: details.messageKey, slotId: details.slotId, entryId: details.entryId, overrides }), ZOOM_LABELS.regenerateFailed);
      if (result) setRegenJobId(result.jobId);
    },
    async deleteEntry() {
      if (!details || busy) return;
      const result = await run("delete", () => app.call("history.deleteEntry", { chatId: details.chatId, entryId: details.entryId }), ZOOM_LABELS.deleteFailed);
      if (!result) return;
      if (!result.fallbackEntryId) {
        onClose();
        return;
      }
      setTarget({ ...targetRef.current, entryId: result.fallbackEntryId });
      void loadGroups(target.chatId);
    },
    async requestSlotDeletion() {
      if (!details || busy) return;
      const preview = await run("slot-preview", () => app.call("history.prepareSlotDeletion", { chatId: details.chatId, messageKey: details.messageKey, slotId: details.slotId }), ZOOM_LABELS.deleteFailed);
      if (preview) setSlotDeletion(preview);
    },
    cancelSlotDeletion() {
      if (!slotDeleting) setSlotDeletion(null);
    },
    async confirmSlotDeletion() {
      const preview = slotDeletion;
      if (!preview || slotDeleting) return;
      setSlotDeleting(true);
      try {
        const result = await app.call("history.deleteSlot", { previewToken: preview.previewToken });
        // Image cleanup can fail transiently (storage / host): retry it once before reporting a partial result.
        if (result.cleanupId && result.cleanup.some((c) => c.status === "failed")) {
          const retried = await app.call("history.retryCleanup", { cleanupId: result.cleanupId }).catch(() => null);
          if (retried) result.cleanup = [...result.cleanup.filter((c) => c.status !== "failed"), ...retried.cleanup];
        }
        const count = (status: string) => result.cleanup.filter((c) => c.status === status).length;
        const failed = count("failed");
        app.notify({
          tone: failed > 0 ? "warning" : "success",
          message: failed > 0 ? ZOOM_LABELS.slotDeletedPartial : fill(ZOOM_LABELS.slotDeleted, { removed: count("removed"), shared: count("shared"), unknown: count("unknown"), failed }) + (result.projectionWarning ? ` · ${result.projectionWarning}` : "")
        });
        setSlotDeletion(null);
        // Next slot of the same message (higher index, else the last), else close.
        const group = groups.find((g) => g.messageKey === preview.messageKey);
        const remaining = group?.items.filter((i) => i.slotId !== preview.slotId) ?? [];
        const deletedIndex = group?.items.find((i) => i.slotId === preview.slotId)?.slotIndex ?? 0;
        const next = remaining.find((i) => i.slotIndex > deletedIndex) ?? remaining[remaining.length - 1];
        if (next) select(next);
        else onClose();
      } catch (caught) {
        app.notifyError(caught, ZOOM_LABELS.deleteFailed);
      } finally {
        setSlotDeleting(false);
      }
    },
    async requestAiEdit(edit) {
      if (!details) return false;
      const result = await run("ai-edit", async () => {
        const proposal = await app.call("zoom.requestAiPromptEdit", { chatId: details.chatId, slotId: details.slotId, entryId: details.entryId, request: edit }, { timeoutMs: 300_000 });
        return app.call("zoom.applyAiPromptEdit", { chatId: details.chatId, slotId: details.slotId, proposalId: proposal.proposalId });
      }, ZOOM_LABELS.regenerateFailed);
      if (!result) return false;
      setRegenJobId(result.jobId);
      return true;
    },
    download() {
      if (!details?.url) return;
      try {
        const anchor = doc.createElement("a");
        anchor.href = details.url;
        anchor.download = downloadName(details.assetName, details.url);
        anchor.rel = "noopener";
        anchor.style.display = "none";
        doc.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setSaveStatus({ tone: "success", label: ZOOM_LABELS.downloadStarted, detail: anchor.download });
      } catch (caught) {
        const message = toRpcError(caught).message;
        setSaveStatus({ tone: "danger", label: fill(ZOOM_LABELS.saveFailed, { error: message }), detail: message });
      }
    },
    reload: () => loadDetails(targetRef.current, true)
  };

  // Save status badge auto-clears after 4 s (AM `U`).
  useEffect(() => {
    if (!saveStatus) return undefined;
    const timer = setTimeout(() => setSaveStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  return session;
}
