/**
 * Pure helpers of the zoom viewer: chat image groups and stepping (AM `stepChatImage`/`stepChatImageRevision`),
 * `$` mention trigger / insert / filter (AM `Exe` 161809, `Pkt` 161877, `Akt` 161864 via the shared Hangul
 * matcher), coordinate-board geometry (AM `gkt`/`ykt`/`vkt`/`bkt`, 161591-161616) and small formatters.
 */
import type { ChatMessageUiState } from "../../shared/contract/chat-dom.js";
import { IMAGE_SIZE_PRESETS, type CustomImageSize } from "../../shared/contract/config.js";
import type { RosterItem, ZoomPromptSection } from "../../shared/contract/rpc.js";
import { matchRank } from "../lib/text-match.js";
import { AI_EDIT_MAX_LENGTH, MENTION_MAX_QUERY } from "./labels.js";

/* ------------------------------------------------------------------------------------------------
 * Chat image groups
 * ---------------------------------------------------------------------------------------------- */

export interface ZoomImageItem {
  /** `<messageKey>::<revisionId>::<slotId>::<entryId>` (AM ChatImageItem.itemId). */
  itemId: string;
  slotId: string;
  slotIndex: number;
  messageKey: string;
  messageId: string;
  revisionId: string;
  entryId: string;
  url: string;
  width: number;
  height: number;
  kind: "original" | "generated";
  assetName: string;
}
export interface ZoomImageGroup {
  groupId: string;
  messageKey: string;
  messageId: string;
  /** 1-based position among messages with images. */
  ordinal: number;
  revisionId: string;
  /** 0-based. */
  revisionPosition: number;
  revisionCount: number;
  revisionIds: string[];
  items: ZoomImageItem[];
}

/** Groups (one per message with images, chat order as given) with the selected entry of each slot. */
export function buildImageGroups(states: readonly ChatMessageUiState[]): ZoomImageGroup[] {
  const groups: ZoomImageGroup[] = [];
  for (const state of states) {
    const items: ZoomImageItem[] = [];
    for (const slot of state.slots) {
      const entry = slot.entries.find((e) => e.entryId === slot.selectedEntryId) ?? slot.entries[slot.entries.length - 1];
      if (!entry) continue;
      items.push({
        itemId: `${state.messageKey}::${state.activeRevisionId}::${slot.slotId}::${entry.entryId}`,
        slotId: slot.slotId,
        slotIndex: slot.slotIndex,
        messageKey: state.messageKey,
        messageId: state.messageId,
        revisionId: state.activeRevisionId,
        entryId: entry.entryId,
        url: entry.url,
        width: entry.width,
        height: entry.height,
        kind: entry.kind,
        assetName: entry.assetName
      });
    }
    if (items.length === 0 && state.revisions.length < 2) continue;
    const revisionIds = state.revisions.map((r) => r.revisionId);
    groups.push({
      groupId: `message:${state.messageKey}`,
      messageKey: state.messageKey,
      messageId: state.messageId,
      ordinal: groups.length + 1,
      revisionId: state.activeRevisionId,
      revisionPosition: Math.max(0, revisionIds.indexOf(state.activeRevisionId)),
      revisionCount: revisionIds.length,
      revisionIds,
      items
    });
  }
  return groups;
}

export function flattenItems(groups: readonly ZoomImageGroup[]): ZoomImageItem[] {
  return groups.flatMap((g) => g.items);
}

/** Cyclic step through all chat images (wraps; null when fewer than 2). */
export function stepItem(items: readonly ZoomImageItem[], currentSlotId: string, delta: number): ZoomImageItem | null {
  if (items.length < 2) return null;
  const index = items.findIndex((item) => item.slotId === currentSlotId);
  const from = index >= 0 ? index : 0;
  return items[(((from + delta) % items.length) + items.length) % items.length] ?? null;
}

/** Cyclic step inside a list of ids (history entries, revisions). */
export function stepId(ids: readonly string[], current: string, delta: number): string | null {
  if (ids.length < 2) return null;
  const index = Math.max(0, ids.indexOf(current));
  return ids[(((index + delta) % ids.length) + ids.length) % ids.length] ?? null;
}

/* ------------------------------------------------------------------------------------------------
 * `$` mentions
 * ---------------------------------------------------------------------------------------------- */

export interface MentionTrigger { start: number; query: string }
export interface MentionCandidate { id: string; name: string; ownerName?: string; searchKeys: string[] }

/** AM `Exe`: last `$` before the caret, no newline in between, query at most 40 chars. */
export function findMentionTrigger(text: string, caret: number): MentionTrigger | null {
  const head = text.slice(0, Math.max(0, Math.min(caret, text.length)));
  const start = head.lastIndexOf("$");
  if (start < 0) return null;
  const query = head.slice(start + 1);
  if (/[\r\n]/u.test(query) || query.length > MENTION_MAX_QUERY) return null;
  return { start, query };
}

/** AM `Pkt`: replaces `$query` with the plain name. Null when the result exceeds 2000 chars. */
export function insertMention(text: string, trigger: MentionTrigger, caret: number, name: string): { text: string; caret: number } | null {
  const next = text.slice(0, trigger.start) + name + text.slice(caret);
  if (next.length > AI_EDIT_MAX_LENGTH) return null;
  return { text: next, caret: trigger.start + name.length };
}

/**
 * AM `Akt`: keep candidates whose name or search keys match the query (substring, jamo, chosung).
 * Order: best match rank (prefix, substring, jamo/chosung), then candidate order.
 */
export function filterMentions(candidates: readonly MentionCandidate[], query: string): MentionCandidate[] {
  const ranked: Array<{ candidate: MentionCandidate; rank: number; index: number }> = [];
  candidates.forEach((candidate, index) => {
    let best = -1;
    for (const field of [candidate.name, ...candidate.searchKeys]) {
      const rank = matchRank(query, field);
      if (rank >= 0 && (best < 0 || rank < best)) best = rank;
    }
    if (best >= 0) ranked.push({ candidate, rank: best, index });
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map((r) => r.candidate);
}

/** Display name of a roster row: the part before " (" (e.g. "한서연 (Han Seo-yeon)" -> "한서연"). */
export function rosterDisplayName(title: string): string {
  const cut = title.indexOf(" (");
  return (cut > 0 ? title.slice(0, cut) : title).trim();
}

/** Mention candidates from the active roster (registered and enabled rows). */
export function mentionCandidates(roster: readonly RosterItem[], ownerName: string): MentionCandidate[] {
  const seen = new Set<string>();
  const out: MentionCandidate[] = [];
  for (const row of roster) {
    if (!row.registered || !row.workspaceEnabled || row.kind === "description") continue;
    const name = rosterDisplayName(row.title);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const alias = row.title !== name ? [row.title] : [];
    out.push({ id: row.promptKey, name, ownerName, searchKeys: [...alias, ...row.recognitionKeys] });
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Coordinate board
 * ---------------------------------------------------------------------------------------------- */

export interface Rect { left: number; top: number; width: number; height: number }
export interface Center { x: number; y: number }
export interface CoordinateMarker { actorIndex: number; ordinal: number; label: string; colorIndex: number; center: Center | null }

export const COORDINATE_MIN = 0.05;
export const COORDINATE_MAX = 0.95;
export const COORDINATE_STEP = 0.01;
/** Height of the AI Choice zone (AM `Wxe`). */
export const AI_CHOICE_ZONE = 64;

/** AM `gkt`: object-contain rect of the image inside the stage. */
export function containRect(stageWidth: number, stageHeight: number, naturalWidth: number, naturalHeight: number): Rect | null {
  if (!(stageWidth > 0 && stageHeight > 0 && naturalWidth > 0 && naturalHeight > 0)) return null;
  const scale = Math.min(stageWidth / naturalWidth, stageHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return { left: (stageWidth - width) / 2, top: (stageHeight - height) / 2, width, height };
}

/** AM `ik` + clamp: snap to 0.01 and clamp to 0.05..0.95. */
export function clampCoordinate(value: number): number {
  const snapped = Math.round(value / COORDINATE_STEP) * COORDINATE_STEP;
  return Math.round(Math.min(COORDINATE_MAX, Math.max(COORDINATE_MIN, snapped)) * 100) / 100;
}

/** AM `ykt`: pointer position (relative to the board = image rect) -> center. */
export function pointToCenter(board: { width: number; height: number }, x: number, y: number): Center {
  return { x: clampCoordinate(board.width > 0 ? x / board.width : 0.5), y: clampCoordinate(board.height > 0 ? y / board.height : 0.5) };
}

/** AM `bkt`: release below the image's bottom edge switches the marker to AI Choice. */
export function isRemovalPoint(board: { height: number }, y: number): boolean {
  return board.height > 0 && y / board.height >= 1;
}

/** AM `vkt`: top of the AI Choice zone relative to the board. */
export function aiChoiceZoneTop(rect: Rect, stageHeight: number, bottomInset = 0, zoneHeight = AI_CHOICE_ZONE): number {
  const bottom = Math.min(rect.top + rect.height, stageHeight - bottomInset - zoneHeight);
  return bottom - rect.top;
}

/** Parks unassigned markers in the AI Choice zone (AM: x from 28 px, step min(48, ...)). */
export function parkedX(index: number, count: number, width: number): number {
  if (count <= 1) return 28;
  const step = Math.max(0, Math.min(48, (width - Math.min(144, 0.42 * width) - 48) / (count - 1)));
  return 28 + index * step;
}

export function markersFromSections(sections: readonly ZoomPromptSection[]): CoordinateMarker[] {
  return sections
    .filter((s) => s.target === "actor")
    .map((s, i) => ({
      actorIndex: s.actorIndex ?? i,
      ordinal: i + 1,
      label: s.label || `#${i + 1}`,
      colorIndex: i % 8,
      center: typeof s.centerX === "number" && typeof s.centerY === "number" ? { x: s.centerX, y: s.centerY } : null
    }));
}

export function formatCenter(center: Center | null, aiChoice: string): string {
  return center ? `${center.x.toFixed(2)} x ${center.y.toFixed(2)}` : aiChoice;
}

/** Centers in actor order (null = AI Choice) for `zoom.saveDraft {centers}`. */
export function centersOf(markers: readonly CoordinateMarker[]): (Center | null)[] {
  const max = markers.reduce((m, marker) => Math.max(m, marker.actorIndex), -1);
  const out: (Center | null)[] = Array.from({ length: max + 1 }, () => null);
  for (const marker of markers) out[marker.actorIndex] = marker.center;
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Misc
 * ---------------------------------------------------------------------------------------------- */

export interface SizeOption { id: number; width: number; height: number; custom: boolean }

/** Image size options: presets then custom sizes (AM `Ns.IMAGE_SIZE_PRESETS` + `customImageSizes`). */
export function sizeOptions(custom: readonly CustomImageSize[] = []): SizeOption[] {
  return [
    ...IMAGE_SIZE_PRESETS.map((p) => ({ id: p.id, width: p.width, height: p.height, custom: false })),
    ...custom.map((c) => ({ id: c.id, width: c.width, height: c.height, custom: true }))
  ];
}

/** True when keyboard shortcuts must not fire (focus in an editable control or a listbox/menu). */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="slider"]');
}

/** File name for a downloaded image. */
export function downloadName(assetName: string, url: string): string {
  const base = (assetName.split(".__am__.")[0] || "illustration").replace(/[\\/:*?"<>|]+/gu, "_").slice(0, 80) || "illustration";
  const ext = /^data:image\/(png|jpe?g|webp|svg\+xml)/u.exec(url)?.[1]?.replace("svg+xml", "svg").replace("jpeg", "jpg") ?? "png";
  return `${base}.${ext}`;
}
