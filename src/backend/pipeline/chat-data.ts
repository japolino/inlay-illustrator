/**
 * Pure helpers over the chat data document (contract chat.ts / history.ts): plans <-> Image History tree, the bake
 * selection of a message, and the per-message UI state of the chat controls.
 */
import {
  commitRevision,
  compareHistoryEntries,
  createIllustrationPlan,
  foldTreeIntoStore,
  illustrationMessageKey,
  imageIdFromResultUrl,
  imageResultUrl,
  listRevisionSlots,
  nextIllustrationAttempt,
  plansFromHistoryTree,
  reconcilePlanWithTree,
  renderIllustrationBlock,
  workflowFromPlan,
  type BakeBlock,
  type ChatDataDocument,
  type ChatMessageUiState,
  type ChatRevisionUi,
  type ChatSlotUi,
  type CountPolicy,
  type GenerationJobSnapshot,
  type HistoryEntry,
  type HistoryTree,
  type IllustrationPlan,
  type IllustrationPlanEntry,
  type RpcError,
} from "../../shared/contract/index.js";

/** Plan of a message: stored plan, else derived from the tree, else a fresh default plan (AM `plans.ensure` / `wSt`). */
export function ensurePlan(doc: ChatDataDocument, historyId: string, messageIndex: number, count: unknown = 1): IllustrationPlan {
  const key = illustrationMessageKey(historyId);
  const stored = doc.plans[key];
  if (stored) return reconcilePlanWithTree(stored, doc.history);
  const fromTree = plansFromHistoryTree(doc.history).find((p) => p.key === key);
  return fromTree ?? createIllustrationPlan({ messageId: historyId, messageIndex }, count);
}

/** Read-only plan lookup (no default). */
export function findPlan(doc: ChatDataDocument, planKey: string): IllustrationPlan | null {
  const stored = doc.plans[planKey];
  if (stored) return reconcilePlanWithTree(stored, doc.history);
  return plansFromHistoryTree(doc.history).find((p) => p.key === planKey) ?? null;
}

/** AM `yq` 171741: distinct slot count of entries. */
export function distinctSlotCount(entries: readonly IllustrationPlanEntry[]): number {
  return new Set(entries.map((e) => e.slotId.trim()).filter(Boolean)).size;
}
/** AM `fPt` 171738. */
export function expectedSlotCount(plan: Pick<IllustrationPlan, "slots" | "requestedCount">): number {
  return Math.min(plan.slots.length, Math.max(1, plan.requestedCount));
}
/** AM `pPt` 171747: parent revision of a new revision. */
export function parentRevisionFor(plan: IllustrationPlan, selected = ""): string {
  const chosen = selected ? plan.revisions.find((r) => r.revisionId === selected) : undefined;
  if (chosen) return chosen.revisionId;
  const active = plan.revisions.find((r) => r.revisionId === plan.activeRevisionId);
  return active ? active.revisionId : ([...plan.revisions].reverse().find((r) => r.entries.length > 0 || r.deletedSlotIndices?.length)?.revisionId ?? "");
}
/** AM `cIe` 171756: merge entries by slot (later wins), ordered by slot index. */
export function mergeEntries(base: readonly IllustrationPlanEntry[], next: readonly IllustrationPlanEntry[]): IllustrationPlanEntry[] {
  const map = new Map<string, IllustrationPlanEntry>();
  base.forEach((e) => map.set(e.slotId, e));
  next.forEach((e) => map.set(e.slotId, e));
  return [...map.values()].sort((a, b) => a.slotIndex - b.slotIndex);
}

/**
 * AM `he` 171892-171961: commit the plan's active revision into the tree (`commitRevision`, mode illustration, workflow
 * `Z_e(plan)`); entries already in the tree are kept, new entries get `createdAt = revision.createdAt + i`.
 */
export function commitPlanToTree(tree: HistoryTree, plan: IllustrationPlan): HistoryTree {
  const revision = plan.revisions.find((r) => r.revisionId === plan.activeRevisionId);
  if (!revision) return tree;
  const entryById = new Map(plan.revisions.flatMap((r) => r.entries).map((e) => [e.entryId, e] as const));
  const slotById = new Map(plan.slots.map((s) => [s.slotId, s] as const));
  const slotIds = [...new Set(revision.entries.map((e) => e.slotId))];
  const existingRevision = tree.messagesByKey[plan.key]?.revisions.find((r) => r.revisionId === revision.revisionId);
  return commitRevision(tree, {
    message: { messageKey: plan.key, messageId: plan.messageId, messageIndex: plan.messageIndex, mode: "illustration", workflow: workflowFromPlan(plan) },
    revision: {
      revisionId: revision.revisionId,
      parentRevisionId: revision.parentRevisionId,
      status: revision.status,
      requestedCount: Math.max(1, revision.requestedCount),
      error: revision.error,
      createdAt: revision.createdAt,
      ...(revision.deletedSlotIndices?.length ? { deletedSlotIndices: [...revision.deletedSlotIndices] } : {}),
    },
    slots: slotIds.flatMap((slotId) => {
      const known = existingRevision?.slotsById[slotId]?.entryIds ?? [];
      const ids = [...new Set([...known, ...revision.entries.filter((e) => e.slotId === slotId).map((e) => e.entryId)])];
      if (!ids.length) return [];
      const planSlot = slotById.get(slotId);
      const selected = revision.entries.find((e) => e.slotId === slotId);
      const entries: HistoryEntry[] = ids.map((id, i) => {
        const existing = tree.entriesById[id];
        if (existing) return existing;
        const e = entryById.get(id);
        const assetName = e?.assetName?.trim() || (id.startsWith("generated:") ? id.slice(10) : "");
        if (!assetName) throw new Error(`Image History illustration asset is missing: ${id}`);
        return {
          entryId: id,
          slotId,
          kind: "generated",
          assetName,
          ...(e?.savedPath ? { savedPath: e.savedPath, extension: e.extension || "png" } : {}),
          createdAt: revision.createdAt + i,
          width: Math.max(0, Math.round(Number(e?.width) || 0)),
          height: Math.max(0, Math.round(Number(e?.height) || 0)),
          ...(e?.generationOrigin ? { generationOrigin: e.generationOrigin } : {}),
          ...(e?.parentEntryId ? { parentEntryId: e.parentEntryId } : {}),
        };
      });
      return [{ slot: { slotId, messageKey: plan.key, slotIndex: planSlot?.index ?? selected?.slotIndex ?? 0 }, entries, entryIds: ids, defaultEntryId: selected?.entryId ?? ids.at(-1)! }];
    }),
    activate: true,
  });
}

/** Write a plan + tree into the document and keep the store in sync (contract write order). Mutates `doc`. */
export function storePlanAndTree(doc: ChatDataDocument, plan: IllustrationPlan | null, tree: HistoryTree = doc.history): void {
  doc.history = tree;
  if (plan) doc.plans[plan.key] = reconcilePlanWithTree({ ...plan, chatKey: tree.chatKey }, tree);
  doc.store = foldTreeIntoStore(doc.store, tree);
}

/* ------------------------------------------------------------------------------------------------
 * Bake selection
 * ---------------------------------------------------------------------------------------------- */

export interface BakeSelection {
  revisionId: string;
  blocks: BakeBlock[];
  entryCount: number;
}

/**
 * Blocks of the message's active revision (default entry per slot). `imageIndex` = document order.
 * Asset Maid baked the projection of the selected revision (AM `ce` 172533 / `oIe`).
 */
export function bakeSelection(doc: ChatDataDocument, planKey: string, input: { chatId: string; messageId: string; swipeIndex: number; widthPercent: number }): BakeSelection {
  const message = doc.history.messagesByKey[planKey];
  if (!message || !message.activeRevisionId) return { revisionId: "", blocks: [], entryCount: 0 };
  const slots = listRevisionSlots(doc.history, planKey, message.activeRevisionId);
  const blocks = slots.map((s, i): BakeBlock => {
    const entries = [...s.entries].sort(compareHistoryEntries);
    const e = s.defaultEntry;
    const imageId = imageIdFromResultUrl(e.savedPath) ?? "";
    return {
      slotIndex: s.slot.slotIndex,
      html: renderIllustrationBlock({
        chatId: input.chatId,
        messageId: input.messageId,
        swipeId: input.swipeIndex,
        messageKey: planKey,
        revisionId: message.activeRevisionId,
        slotId: s.slot.slotId,
        slotIndex: s.slot.slotIndex,
        entryId: e.entryId,
        assetName: e.assetName,
        imageId,
        ...(e.savedPath ? { url: e.savedPath } : {}),
        ...(e.width ? { width: e.width } : {}),
        ...(e.height ? { height: e.height } : {}),
        entryIndex: Math.max(1, entries.findIndex((x) => x.entryId === e.entryId) + 1),
        entryCount: entries.length,
        canRegenerate: entries.some((x) => x.kind === "generated"),
        imageIndex: i,
        widthPercent: input.widthPercent,
      }),
    };
  });
  return { revisionId: message.activeRevisionId, blocks, entryCount: blocks.length };
}

/* ------------------------------------------------------------------------------------------------
 * UI state (chatDom.getMessageStates)
 * ---------------------------------------------------------------------------------------------- */

export interface UiStateInput {
  chatId: string;
  messageId: string;
  swipeIndex: number;
  eligible: boolean;
  job?: GenerationJobSnapshot;
  regeneratingSlotIds?: ReadonlySet<string>;
  lastError?: RpcError;
  /** A message-level job runs (default: `job` is queued/running). Single-slot regenerations do not make the footer busy. */
  busy?: boolean;
}

export function messageUiState(doc: ChatDataDocument, input: UiStateInput): ChatMessageUiState {
  const historyId = `${input.messageId}@${input.swipeIndex}`;
  const planKey = illustrationMessageKey(historyId);
  const plan = findPlan(doc, planKey);
  const message = doc.history.messagesByKey[planKey];
  const revisions: ChatRevisionUi[] = (message?.revisions ?? []).map((r, i) => ({
    revisionId: r.revisionId,
    index: i + 1,
    status: r.status,
    entryCount: Object.keys(r.slotsById).length,
    deletedSlotIndices: [...(r.deletedSlotIndices ?? [])],
    createdAt: r.createdAt,
  }));
  const activeRevisionId = message?.activeRevisionId ?? "";
  const resolved = activeRevisionId ? listRevisionSlots(doc.history, planKey, activeRevisionId) : [];
  const slots: ChatSlotUi[] = resolved.map((s) => {
    const entries = [...s.entries].sort(compareHistoryEntries);
    return {
      slotId: s.slot.slotId,
      slotIndex: s.slot.slotIndex,
      entries: entries.map((e) => {
        const imageId = imageIdFromResultUrl(e.savedPath) ?? "";
        return {
          entryId: e.entryId,
          kind: e.kind,
          ...(e.generationOrigin ? { origin: e.generationOrigin } : {}),
          assetName: e.assetName,
          imageId,
          url: e.savedPath || (imageId ? imageResultUrl(imageId) : ""),
          width: e.width,
          height: e.height,
          createdAt: e.createdAt,
        };
      }),
      selectedEntryId: s.defaultEntry.entryId,
      canRegenerate: entries.some((e) => e.kind === "generated"),
      regenerating: input.regeneratingSlotIds?.has(s.slot.slotId) ?? false,
    };
  });
  const active = message?.revisions.find((r) => r.revisionId === activeRevisionId);
  const busy = input.busy ?? (!!input.job && (input.job.status === "queued" || input.job.status === "running"));
  return {
    chatId: input.chatId,
    messageId: input.messageId,
    swipeIndex: input.swipeIndex,
    messageKey: planKey,
    eligible: input.eligible,
    attempt: plan ? nextIllustrationAttempt(plan) : "initial",
    planStatus: busy ? "generating" : (plan?.status ?? "idle"),
    busy,
    ...(input.job ? { job: input.job } : {}),
    revisions,
    activeRevisionId,
    slots,
    allSlotsDeleted: !!active && slots.length === 0 && !!active.deletedSlotIndices?.length,
    ...(input.lastError ? { lastError: input.lastError } : plan?.status === "error" && plan.error ? { lastError: { code: "provider-error", message: plan.error, retryable: true } } : {}),
  };
}

/** Count policy carried by a plan for a new run (AM Or 173641-173643). */
export function planWithSlots(plan: IllustrationPlan, slots: IllustrationPlan["slots"], countPolicy: CountPolicy | null): IllustrationPlan {
  return { ...plan, slots, ...(countPolicy ? { countPolicy, requestedCount: Math.max(1, countPolicy.max) } : {}) };
}
