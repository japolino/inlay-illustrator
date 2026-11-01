/**
 * Pure helpers of the Maid Atelier screens (AM 0.9.90; spec am990 spec/atelier-ui.md §5-§6). Everything that can be
 * decided without the DOM lives here so it is unit-testable: preset document access, ID / weight validation, rule JSON,
 * output order (AM `K_` / `Qst` / `ect` with the `FP` list-move diff and the `une` move apply), export selection,
 * error classification. The preset JSON itself is validated by the backend (`atelier.validateDocument`, AM `rZ`).
 */
import type { AtelierDocumentSelection, AtelierState, GuidelineKind, PresetDiagnostic } from "../../../shared/contract/atelier.js";
import type { RpcError } from "../../../shared/contract/rpc.js";
import { ATELIER_LABELS as L } from "./labels.js";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
export const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));
export const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/* ------------------------------------------------------------------------------------------------
 * Preset document shapes (AM `J3` allow lists, as95:1005-1101)
 * ---------------------------------------------------------------------------------------------- */

/** `[weight, tag]` prompt pair. The first pair is the main prompt, the rest are extra expressions (추가 표현). */
export type PromptPair = [number, string];
export type Scope = "scene" | "actor" | "female" | "male" | "interaction";
export const SCOPES: readonly Scope[] = ["scene", "actor", "female", "male"];
export type OutputFormat = "illustration" | "comic";
export interface FormatRestriction { enabled: boolean; selected?: OutputFormat[] }

export interface PresetOption {
  id: string;
  description?: string;
  prompt?: PromptPair[] | null;
  attributes?: Record<string, string>;
  enabled?: boolean;
  formatRestriction?: FormatRestriction;
  [key: string]: unknown;
}
export interface PresetGroup {
  id: string;
  description?: string;
  scope?: Scope | Scope[];
  subjects?: string[];
  usage?: string;
  order?: number;
  optionAttributes?: Record<string, string>;
  continuity?: boolean;
  prompt?: PromptPair[] | null;
  enabled?: boolean;
  requires?: { humanlike?: boolean };
  select?: { by?: "ai" | "local"; max?: number | null };
  options: PresetOption[];
  formatRestriction?: FormatRestriction;
  [key: string]: unknown;
}
export type ChannelKind = "free" | "text";
export interface PresetChannel {
  id: string;
  name?: string;
  kind: ChannelKind;
  scope: "scene" | "actor";
  instruction?: string;
  order: number;
  enabled?: boolean;
  formats?: OutputFormat[];
  maxTags?: number;
  maxLength?: number;
  rememberedMaxLength?: number;
  weight?: number;
  continuity?: boolean;
  [key: string]: unknown;
}
export type InteractionDestination = "relation" | "source" | "target" | "female" | "male";
export interface PresetInteraction {
  id: string;
  category?: string;
  description?: string;
  allowedModes?: string[];
  defaultMode?: string;
  destination?: string;
  promptTarget?: string;
  enabled?: boolean;
  detailGroups?: string[];
  prompt?: { tag?: PromptPair[] | null; [key: string]: unknown };
  [key: string]: unknown;
}
export type RuleWhen = "any" | "all" | "none";
export type RuleAction = "add" | "remove";
export type RuleAt = "current" | "source" | "target" | "scene" | "persona" | "actor";
export const RULE_AT: readonly RuleAt[] = ["current", "source", "target", "scene", "persona", "actor"];
export interface RuleRef { group?: string; options?: string[]; interaction?: string; at?: RuleAt }
export interface SelectionRule { when: RuleWhen; action: RuleAction; from: RuleRef[]; to: RuleRef[]; enabled?: boolean }
export type PresetRule = SelectionRule | Rec;
export interface PresetContent {
  definitions?: PresetGroup[];
  extend?: PresetGroup[];
  panels?: PresetGroup[];
  channels?: PresetChannel[];
  interactions?: PresetInteraction[];
  interactionCategories?: string[];
  rules?: PresetRule[];
  metadata?: Rec & { promptOrder?: boolean; promptOrderMoves?: Partial<Record<OrderTarget, ListMove[]>>; promptOrderTargets?: Rec };
  system?: Rec & { definitions?: Array<Rec & { id: string }> };
  [key: string]: unknown;
}
export interface PresetDocument { format: string; title?: string; content: PresetContent }

/** Parses a preset document (structure only; the backend validates the rest). */
export function parsePreset(json: string): { doc?: PresetDocument; error?: string } {
  try {
    const value = JSON.parse(json) as unknown;
    if (!isRec(value) || !isRec(value.content)) return { error: L.raw.invalid };
    return { doc: value as unknown as PresetDocument };
  } catch (error) {
    return { error: error instanceof Error ? error.message : L.raw.invalid };
  }
}

export const isContentEmpty = (content: unknown): boolean => !isRec(content) || Object.keys(content).length === 0;

/**
 * Editable document: an empty `content` means "the bundled baseline" (AM `nw`), so the editor starts from the baseline
 * content (keeping the document's own title).
 */
export function editableDocument(doc: PresetDocument, baseline: PresetDocument | null): PresetDocument {
  if (!isContentEmpty(doc.content) || !baseline) return clone(doc);
  return { ...clone(doc), content: clone(baseline.content) };
}

export const serializePreset = (doc: PresetDocument): string => JSON.stringify(doc);

/* ------------------------------------------------------------------------------------------------
 * Lists, ids, numbers
 * ---------------------------------------------------------------------------------------------- */

/** AM `WM`: splice from -> to (out-of-range or equal indices return the same list). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item as T);
  return next;
}

/** Target index of a drag from the pointer position over row rects (midpoint rule). */
export function dropIndex(rects: ReadonlyArray<{ top: number; height: number }>, y: number, from: number): number {
  let index = rects.length - 1;
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i]!;
    if (y < r.top + r.height / 2) { index = i; break; }
  }
  if (index > from && y < rects[index]!.top + rects[index]!.height / 2) index -= 1;
  return Math.max(0, Math.min(rects.length - 1, index));
}

const SEGMENT = /^[a-z][a-z0-9_-]*$/;
/** Tag group / scene ID check (AM `aH`): lowercase dot path; choice groups need 2+ segments; unique. */
export function validateGroupId(id: string, used: readonly string[], options: { current?: string; minSegments?: number } = {}): string | null {
  const value = id.trim();
  if (!value) return L.fields.idRequired;
  const segments = value.split(".");
  if (segments.some((s) => !SEGMENT.test(s))) return L.fields.idSegment;
  if (segments.length < (options.minSegments ?? 2)) return L.fields.idTwoSegments;
  if (value !== options.current && used.includes(value)) return L.fields.idInUse;
  return null;
}
/** User channel id (AM `ZP`): `custom.` + lowercase dot segments. */
export function validateChannelId(id: string, used: readonly string[], current?: string): string | null {
  const value = id.trim();
  if (!value) return L.fields.idRequired;
  if (!/^custom\.[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)*$/.test(value)) return L.fields.channelId;
  if (value !== current && used.includes(value)) return L.fields.idInUse;
  return null;
}
/** Interaction local id (AM `AH`): lowercase, digits, underscore, hyphen; unique. */
export function validateInteractionId(id: string, used: readonly string[], current?: string): string | null {
  const value = id.trim();
  if (!value) return L.fields.idRequired;
  if (value.includes(".")) return L.fields.interactionId;
  if (!/^[a-z0-9_-]+$/.test(value)) return L.fields.interactionChars;
  if (value !== current && used.includes(value)) return L.fields.idInUse;
  return null;
}
/** Interaction category (dot path, unique). */
export function validateCategory(value: string, existing: readonly string[], current?: string): string | null {
  const v = value.trim();
  if (!v || v.split(".").some((s) => !SEGMENT.test(s))) return L.interactions.categoryInvalid;
  if (v !== current && existing.includes(v)) return L.interactions.categoryExists;
  return null;
}
/** `base`, `base_2`, `base_3`, ... (AM `qb`). */
export function uniqueId(base: string, used: readonly string[]): string {
  if (!used.includes(base)) return base;
  for (let n = 2; ; n += 1) if (!used.includes(`${base}_${n}`)) return `${base}_${n}`;
}

/** Weight field (AM `rH`): number, with an informative warning when it is not 1. */
export function parseWeight(text: string): { value?: number; error?: string; warning?: string } {
  const t = text.trim();
  const value = Number(t);
  if (!t || !Number.isFinite(value) || value < 0 || value > 10) return { error: L.fields.weightInvalid(text) };
  return { value, ...(value < 1 ? { warning: L.fields.weightBelow } : value > 1 ? { warning: L.fields.weightAbove } : {}) };
}
/** Integer stepper (AM `sbe`). */
export function parseInteger(text: string, min: number, max?: number): { value?: number; error?: string } {
  const value = Number(text.trim());
  if (!text.trim() || !Number.isInteger(value) || value < min || (max !== undefined && value > max)) {
    return { error: max === undefined ? L.fields.minInteger(min) : L.fields.rangeInteger(min, max) };
  }
  return { value };
}

/* ------------------------------------------------------------------------------------------------
 * Prompts, scopes, formats
 * ---------------------------------------------------------------------------------------------- */

export function promptPairs(prompt: unknown): PromptPair[] {
  if (!Array.isArray(prompt)) return [];
  return prompt.filter((p): p is PromptPair => Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "string");
}
export const promptText = (prompt: unknown): string => promptPairs(prompt).map((p) => p[1]).join(", ");
/** Sets pair `index` (0 = main prompt). An empty main prompt with no extras gives `null` ("no output"). */
export function setPromptPair(prompt: unknown, index: number, pair: PromptPair | null): PromptPair[] | null {
  const pairs = promptPairs(prompt).map((p) => [p[0], p[1]] as PromptPair);
  if (pair) {
    while (pairs.length < index) pairs.push([1, ""]);
    pairs[index] = pair;
  } else pairs.splice(index, 1);
  if (pairs.length === 0 || (pairs.length === 1 && !pairs[0]![1].trim())) return null;
  return pairs;
}

export function scopesOf(group: Pick<PresetGroup, "scope" | "subjects">): Scope[] {
  if (group.scope !== undefined) return [group.scope].flat() as Scope[];
  return (group.subjects ?? []).map((s) => (s === "global" ? "scene" : s)) as Scope[];
}
/** Scope write (AM `pV`): female/male are dropped when actor is chosen; a single scope is stored as a string. */
export function scopeValue(scopes: readonly Scope[]): Scope | Scope[] | undefined {
  const unique = [...new Set(scopes)].filter((s) => !scopes.includes("actor") || (s !== "female" && s !== "male"));
  if (unique.length === 0) return undefined;
  return unique.length === 1 ? unique[0] : unique;
}
export function formatOf(item: { formatRestriction?: FormatRestriction; formats?: OutputFormat[] }): "common" | OutputFormat | "invalid" {
  if (item.formats !== undefined) return item.formats.length === 1 ? item.formats[0]! : "invalid";
  const r = item.formatRestriction;
  if (!r || !r.enabled) return "common";
  return r.selected?.length === 1 ? r.selected[0]! : "invalid";
}

/** Tri-state of an "active" header over the shown rows (AM `hg`). */
export function triState(values: readonly boolean[]): boolean | "mixed" {
  if (values.length === 0) return false;
  if (values.every(Boolean)) return true;
  return values.some(Boolean) ? "mixed" : false;
}

export function textMatches(query: string, ...values: unknown[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((v) => (typeof v === "string" ? v : JSON.stringify(v ?? "")).toLowerCase().includes(q));
}

/* ------------------------------------------------------------------------------------------------
 * Document edits
 * ---------------------------------------------------------------------------------------------- */

export function groupsOf(doc: PresetDocument): PresetGroup[] {
  return (doc.content.definitions ?? []).filter((g) => g.usage !== "interaction_detail");
}
export function detailGroupsOf(doc: PresetDocument): PresetGroup[] {
  return (doc.content.definitions ?? []).filter((g) => g.usage === "interaction_detail");
}
/** The scene-definition group (AM panel group `panel.group`). */
export const PANEL_GROUP_ID = "panel.group";
export function scenesOf(doc: PresetDocument): PresetOption[] {
  return doc.content.panels?.[0]?.options ?? [];
}
export function usedGroupIds(doc: PresetDocument, systemIds: readonly string[] = []): string[] {
  return [...(doc.content.definitions ?? []).map((g) => g.id), ...(doc.content.panels ?? []).map((g) => g.id), ...systemIds];
}

/** New tag group (AM `PH`): AI chooses one option of the actor scope. */
export function newGroup(doc: PresetDocument, systemIds: readonly string[], detail = false): PresetGroup {
  const id = uniqueId(detail ? "detail.group" : "custom.group", usedGroupIds(doc, systemIds));
  return {
    id,
    ...(detail ? { usage: "interaction_detail", scope: "interaction" as Scope } : { scope: "actor" as Scope }),
    order: 100,
    select: { by: "ai", max: 1 },
    options: [{ id: "option", prompt: null }],
  };
}
export function newChannel(doc: PresetDocument, kind: ChannelKind): PresetChannel {
  const used = (doc.content.channels ?? []).map((c) => c.id);
  return { id: uniqueId(`custom.${kind === "free" ? "tags" : "text"}`, used), kind, scope: "actor", instruction: "", order: 100 };
}
export function newInteraction(doc: PresetDocument, category?: string): PresetInteraction {
  const used = (doc.content.interactions ?? []).map((i) => i.id);
  return { id: uniqueId("interaction", used), ...(category ? { category } : {}), allowedModes: ["mutual"], destination: "relation", prompt: { tag: null } };
}
export function newRule(): SelectionRule {
  return { when: "any", from: [], action: "add", to: [] };
}

/** Adds a scene definition (AM `addPanel`): creates the panel group on first use. */
export function addScene(doc: PresetDocument): { doc: PresetDocument; id: string } {
  const next = clone(doc);
  const panels = (next.content.panels ??= []);
  if (!panels[0]) panels.push({ id: PANEL_GROUP_ID, subjects: ["global"], order: 100, select: { by: "local", max: null }, options: [] });
  const used = panels[0]!.options.map((o) => o.id);
  const id = uniqueId("scene", used);
  panels[0]!.options.push({ id, description: "", prompt: null });
  return { doc: next, id };
}

/** Interaction mode (AM `$_`): mutual / directed / both (legacy mixed). */
export function interactionMode(item: PresetInteraction): "mutual" | "directed" | "both" {
  const modes = item.allowedModes ?? (item.defaultMode ? [item.defaultMode] : ["mutual"]);
  if (modes.includes("mutual") && modes.includes("directed")) return "both";
  return modes.includes("directed") ? "directed" : "mutual";
}
/** Direction change resets the output target to relation (AM interaction editor). */
export function setInteractionMode(item: PresetInteraction, mode: "mutual" | "directed"): PresetInteraction {
  const next: PresetInteraction = { ...item, allowedModes: [mode], destination: "relation" };
  delete next.defaultMode;
  delete next.promptTarget;
  return next;
}

/** System group patch (`content.system.definitions[{id, enabled}]`; AM keeps required ones on). */
export function setSystemGroupEnabled(doc: PresetDocument, id: string, enabled: boolean): PresetDocument {
  const next = clone(doc);
  const system = (next.content.system ??= {});
  const list = (system.definitions ??= []);
  let entry = list.find((d) => d.id === id);
  if (!entry) list.push((entry = { id }));
  if (enabled) delete entry.enabled;
  else entry.enabled = false;
  if (Object.keys(entry).length === 1) system.definitions = list.filter((d) => d !== entry);
  if (!system.definitions!.length) delete system.definitions;
  if (!Object.keys(system).length) delete next.content.system;
  return next;
}

/* ------------------------------------------------------------------------------------------------
 * Baseline system catalogue (normalized V5 raw config; read-only)
 * ---------------------------------------------------------------------------------------------- */

/** System groups that can be ordered / toggled (AM `HS` + `Sm`, as95:12891-12916). */
export const ORDERABLE_SYSTEM_GROUPS: readonly string[] = [
  "pose.contact_surface", "environment.setting", "environment.time", "environment.weather", "environment.condition", "gaze.direction",
  "pose.body", "pose.refinement", "expression.general", "expression.blush", "expression.tear", "expression.eye.reaction",
  "expression.eye.openness", "expression.mouth.detail", "expression.mouth.openness", "effect.motion", "state.hair.condition",
  "state.body.surface", "state.body.reaction", "state.clothing.condition", "state.clothing.arrangement", "camera.view", "framing.presence",
];
/** Ordered system channels (AM `$f`); `E2e` ones are fixed and never listed. */
export const SYSTEM_CHANNELS: Readonly<Record<string, { kind: ChannelKind; scope: "scene" | "actor" }>> = {
  "scene.free.location": { kind: "free", scope: "scene" },
  "scene.free.object": { kind: "free", scope: "scene" },
  "actor.free.object": { kind: "free", scope: "actor" },
  "scene.text.location": { kind: "text", scope: "scene" },
  "actor.text.pose": { kind: "text", scope: "actor" },
  "actor.text.dialogue": { kind: "text", scope: "actor" },
};

export interface SystemGroupView { id: string; scopes: Scope[]; order: number; options: PresetOption[]; enabled: boolean; continuity: boolean; prompt: string }
export interface SystemChannelView { id: string; kind: ChannelKind; scope: "scene" | "actor"; order: number; instruction: string }
export interface SystemCatalog { groups: SystemGroupView[]; channels: SystemChannelView[]; ids: string[] }

export function systemCatalog(raw: Rec | null, doc: PresetDocument | null): SystemCatalog {
  const library = isRec(raw?.modifierLibrary) ? (raw!.modifierLibrary as Rec) : {};
  const closed = Array.isArray(library.closed) ? (library.closed as Rec[]) : [];
  const patches = new Map((doc?.content.system?.definitions ?? []).map((d) => [d.id, d]));
  const groups: SystemGroupView[] = closed
    .filter((g) => typeof g.id === "string" && ORDERABLE_SYSTEM_GROUPS.includes(g.id))
    .map((g) => {
      const patch: Partial<PresetGroup> & Record<string, unknown> = patches.get(g.id as string) ?? {};
      const options = Array.isArray(patch.options) ? (patch.options as PresetOption[]) : Array.isArray(g.options) ? (g.options as PresetOption[]) : [];
      return {
        id: g.id as string,
        scopes: scopesOf({ subjects: (g.subjects as string[]) ?? [] }),
        order: Number(patch.order ?? g.order ?? 100),
        options,
        enabled: patch.enabled !== false,
        continuity: patch.continuity === true,
        prompt: options.map((o) => promptText(o.prompt)).filter(Boolean).join(" · "),
      };
    });
  const channels: SystemChannelView[] = [];
  for (const [list, kind] of [[library.freeTags, "free"], [library.naturalLanguage, "text"]] as const) {
    for (const c of Array.isArray(list) ? (list as Rec[]) : []) {
      const id = String(c.id);
      if (!SYSTEM_CHANNELS[id]) continue;
      channels.push({ id, kind, scope: SYSTEM_CHANNELS[id]!.scope, order: Number(c.order ?? 100), instruction: String(c.instruction ?? "") });
    }
  }
  return { groups, channels, ids: closed.map((g) => String(g.id)) };
}

/* ------------------------------------------------------------------------------------------------
 * Output order (AM `K_` 121926, `Qst`, `ect`, list moves `FP` as95:51, apply `une`)
 * ---------------------------------------------------------------------------------------------- */

export type OrderTarget = "main" | "actor";
export type OrderLane = "tag" | "instruction";
export interface ListMove { id: string; before: string[]; after: string[] }
export interface OrderRow { key: string; id: string; kind: "group" | ChannelKind | "interaction"; system: boolean; order: number; enabled: boolean; targets: OrderTarget[] }

const targetsOfScopes = (scopes: readonly string[]): OrderTarget[] => {
  const t: OrderTarget[] = [];
  if (scopes.some((s) => s === "scene" || s === "global")) t.push("main");
  if (scopes.some((s) => s !== "scene" && s !== "global")) t.push("actor");
  return t;
};
export const laneOf = (row: Pick<OrderRow, "kind">): OrderLane => (row.kind === "text" ? "instruction" : "tag");

/** AM `pne`: interaction first, natural language last, system before preset, groups before channels, then order. */
function compareRows(a: OrderRow, b: OrderRow, legacy: boolean): number {
  return (
    +(b.kind === "interaction") - +(a.kind === "interaction") ||
    +(a.kind === "text") - +(b.kind === "text") ||
    (legacy ? 0 : Number(b.system) - Number(a.system)) ||
    (legacy ? 0 : +(a.kind !== "group") - +(b.kind !== "group")) ||
    a.order - b.order
  );
}

/** AM `une`: applies list moves (anchor before, else after, else end). */
export function applyMoves<T>(list: readonly T[], moves: readonly ListMove[] | undefined, key: (item: T) => string): T[] {
  const next = [...list];
  for (const move of moves ?? []) {
    const at = next.findIndex((item) => key(item) === move.id);
    if (at < 0) continue;
    const [item] = next.splice(at, 1);
    const before = move.before.find((id) => next.some((x) => key(x) === id));
    const after = move.after.find((id) => next.some((x) => key(x) === id));
    next.splice(before !== undefined ? next.findIndex((x) => key(x) === before) : after !== undefined ? next.findIndex((x) => key(x) === after) + 1 : next.length, 0, item as T);
  }
  return next;
}

/** AM `FP` for id lists: the moves (longest increasing subsequence kept in place) that turn `before` into `after`. */
export function listMoves(before: readonly string[], after: readonly string[]): ListMove[] {
  if (sameJson(before, after)) return [];
  const n = [...after];
  const a = [...before.filter((id) => n.includes(id)), ...n.filter((id) => !before.includes(id))];
  const chains: string[][] = [];
  for (let c = 0; c < n.length; c += 1) {
    let best: string[] = [];
    for (let d = 0; d < c; d += 1) if (a.indexOf(n[d]!) < a.indexOf(n[c]!) && chains[d]!.length > best.length) best = chains[d]!;
    chains.push([...best, n[c]!]);
  }
  const keep = new Set(chains.reduce((longest, chain) => (chain.length > longest.length ? chain : longest), [] as string[]));
  const moves: ListMove[] = [];
  for (let c = n.length - 1; c >= 0; c -= 1) if (!keep.has(n[c]!)) moves.push({ id: n[c]!, before: n.slice(c + 1), after: n.slice(0, c).reverse() });
  return moves;
}

/** All order rows of a document, default-sorted (no moves). */
function baseRows(doc: PresetDocument, system: SystemCatalog): OrderRow[] {
  const rows: OrderRow[] = [];
  for (const g of system.groups) rows.push({ key: `group:${g.id}`, id: g.id, kind: "group", system: true, order: g.order, enabled: g.enabled, targets: targetsOfScopes(g.scopes) });
  for (const c of system.channels) rows.push({ key: `channel:${c.id}`, id: c.id, kind: c.kind, system: true, order: c.order, enabled: true, targets: [c.scope === "scene" ? "main" : "actor"] });
  for (const g of groupsOf(doc)) rows.push({ key: `group:${g.id}`, id: g.id, kind: "group", system: false, order: Number(g.order ?? 100), enabled: g.enabled !== false, targets: targetsOfScopes(scopesOf(g)) });
  for (const c of doc.content.channels ?? []) rows.push({ key: `channel:${c.id}`, id: c.id, kind: c.kind, system: false, order: Number(c.order ?? 100), enabled: c.enabled !== false, targets: [c.scope === "scene" ? "main" : "actor"] });
  rows.push({ key: "interaction", id: "interaction", kind: "interaction", system: true, order: -1, enabled: true, targets: ["actor"] });
  return rows;
}

/** Rows of one target in output order (AM `K_(…, target).filter(targets.includes(target))`). */
export function orderRows(doc: PresetDocument, system: SystemCatalog, target: OrderTarget): OrderRow[] {
  const meta = doc.content.metadata ?? {};
  const legacy = !!meta.promptOrder && !meta.promptOrderMoves;
  const sorted = baseRows(doc, system).sort((a, b) => compareRows(a, b, legacy)).filter((r) => r.targets.includes(target));
  return applyMoves(sorted, meta.promptOrderMoves?.[target], (r) => r.key);
}

/** AM `Qst`: moves `fromKey` to the slot of `toKey` within one lane; stores the diff from the default order. */
export function movePromptOrder(doc: PresetDocument, system: SystemCatalog, target: OrderTarget, lane: OrderLane, fromKey: string, toKey: string): PresetDocument {
  const rows = orderRows(doc, system, target);
  const laneRows = rows.filter((r) => laneOf(r) === lane);
  const from = laneRows.findIndex((r) => r.key === fromKey);
  const to = laneRows.findIndex((r) => r.key === toKey);
  if (from < 0 || to < 0 || from === to) return doc;
  const moved = moveItem(laneRows, from, to);
  let i = 0;
  const after = rows.map((r) => (laneOf(r) === lane ? moved[i++]!.key : r.key));
  const defaults = orderRows({ ...doc, content: { ...doc.content, metadata: { ...doc.content.metadata, promptOrder: false, promptOrderMoves: undefined } } }, system, target).map((r) => r.key);
  const previous = (doc.content.metadata?.promptOrderMoves?.[target] ?? []).filter((m) => !defaults.includes(m.id));
  const moves = [...listMoves(defaults, after), ...previous];
  const next = clone(doc);
  const metadata = (next.content.metadata ??= {});
  metadata.promptOrder = true;
  metadata.promptOrderMoves = { ...metadata.promptOrderMoves, [target]: moves };
  return next;
}

/** AM `ect`: drops the moves of one target. */
export function restorePromptOrder(doc: PresetDocument, target: OrderTarget): PresetDocument {
  const next = clone(doc);
  const metadata = next.content.metadata;
  if (!metadata) return next;
  const moves = { ...metadata.promptOrderMoves };
  const targets = { ...metadata.promptOrderTargets };
  delete moves[target];
  delete targets[target];
  if (Object.keys(moves).length) metadata.promptOrderMoves = moves;
  else delete metadata.promptOrderMoves;
  if (Object.keys(targets).length) metadata.promptOrderTargets = targets;
  else delete metadata.promptOrderTargets;
  if (metadata.promptOrderMoves || metadata.promptOrderTargets) metadata.promptOrder = true;
  else delete metadata.promptOrder;
  if (!Object.keys(metadata).length) delete next.content.metadata;
  return next;
}

/* ------------------------------------------------------------------------------------------------
 * Rules (common rules table + JSON, AM `Uct` / `H_` / `ict` / `vO`)
 * ---------------------------------------------------------------------------------------------- */

/** AM `Vl`: a selection rule (`when/action/from/to`) as opposed to the legacy match/apply form. */
export function isSelectionRule(rule: unknown): rule is SelectionRule {
  return isRec(rule) && ("from" in rule || "to" in rule || "action" in rule) && !("match" in rule);
}
export const formatRulesJson = (rules: readonly PresetRule[]): string => JSON.stringify({ rules }, null, 2);

/** AM `H_`: `{rules: [...]}` only, objects only, no duplicate ids. */
export function parseRulesJson(text: string): { rules?: PresetRule[]; error?: string } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: L.rules.jsonInvalid };
  }
  if (!isRec(value) || !Array.isArray(value.rules) || Object.keys(value).some((k) => k !== "rules")) return { error: L.rules.jsonTopLevel };
  if (value.rules.some((r) => !isRec(r))) return { error: L.rules.jsonInvalid };
  const ids = (value.rules as Rec[]).map((r) => r.id).filter((id): id is string => typeof id === "string");
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) return { error: L.rules.duplicateIds(dupes.join(", ")) };
  return { rules: value.rules as PresetRule[] };
}

export interface RuleObjectCatalog {
  groups: Array<{ id: string; options: string[]; system: boolean; detail: boolean }>;
  interactions: string[];
  channels: Array<{ id: string; kind: ChannelKind }>;
}
export function ruleObjectCatalog(doc: PresetDocument, system: SystemCatalog): RuleObjectCatalog {
  return {
    groups: [
      ...system.groups.map((g) => ({ id: g.id, options: g.options.map((o) => o.id), system: true, detail: false })),
      ...(doc.content.definitions ?? []).map((g) => ({ id: g.id, options: g.options.map((o) => o.id), system: false, detail: g.usage === "interaction_detail" })),
    ],
    interactions: (doc.content.interactions ?? []).map((i) => i.id),
    channels: [...system.channels.map((c) => ({ id: c.id, kind: c.kind })), ...(doc.content.channels ?? []).map((c) => ({ id: c.id, kind: c.kind }))],
  };
}

/** AM `ict`: reference check of selection rules against the object catalogue (system ids are trusted). */
export function checkRuleReferences(rules: readonly PresetRule[], catalog: RuleObjectCatalog, systemIds: readonly string[] = []): string[] {
  const problems: string[] = [];
  for (const rule of rules) {
    if (!isSelectionRule(rule)) continue;
    for (const ref of [...(rule.from ?? []), ...(rule.to ?? [])]) {
      if (ref.interaction && !catalog.interactions.includes(ref.interaction)) problems.push(L.rules.missingInteraction(ref.interaction));
      if (!ref.group) continue;
      const group = catalog.groups.find((g) => g.id === ref.group);
      if (!group) {
        if (!catalog.channels.some((c) => c.id === ref.group) && !systemIds.includes(ref.group)) problems.push(L.rules.missingGroup(ref.group));
        continue;
      }
      if (group.system && group.options.length === 0) continue;
      for (const option of ref.options ?? []) if (!group.options.includes(option)) problems.push(L.rules.missingOption(ref.group, option));
    }
  }
  return [...new Set(problems)];
}

/** AM `vO`: a rule naming individual content of a free-tag / natural-language channel. */
export function ruleChannelWarning(rule: PresetRule, catalog: RuleObjectCatalog): boolean {
  if (!isSelectionRule(rule)) return false;
  return [...rule.from, ...rule.to].some((ref) => !!ref.group && catalog.channels.some((c) => c.id === ref.group) && (ref.options?.length ?? 0) > 0);
}

/** Source / target positions are offered only when the condition names an interaction (or one of its sub-groups). */
export function ruleAllowsActors(rule: SelectionRule, catalog: RuleObjectCatalog): boolean {
  return rule.from.some((ref) => !!ref.interaction || (!!ref.group && catalog.groups.some((g) => g.id === ref.group && g.detail)));
}

export function refLabel(ref: RuleRef): string {
  const base = ref.interaction ? ref.interaction : ref.group ?? "";
  const options = ref.options?.length ? ` / ${ref.options.join(", ")}` : "";
  return `${base}${options}`;
}
export function ruleMatches(rule: PresetRule, query: string): boolean {
  if (!isSelectionRule(rule)) return textMatches(query, rule);
  return textMatches(query, ...[...rule.from, ...rule.to].map(refLabel));
}

/* ------------------------------------------------------------------------------------------------
 * Guidelines
 * ---------------------------------------------------------------------------------------------- */

export interface GuidelineRow { id: string; name: string; text: string; selected: boolean; builtIn: boolean; outputMode?: "illustration" | "comic" }

const BUILTIN_SCENES = ["default", "default-comic", "system-pov", "system-ensemble"];
export const isBuiltInGuideline = (kind: GuidelineKind, id: string): boolean => (kind === "scene" ? BUILTIN_SCENES.includes(id) : id === "default");
export const isFixedDefault = (kind: GuidelineKind, id: string): boolean => (kind === "scene" ? id === "default" || id === "default-comic" : id === "default");

/**
 * English display name of a guideline. Built-in guidelines carry their Korean names in the stored library (AM parity);
 * the UI shows the translated name while the stored name is untouched. User guidelines keep their own names.
 */
export function guidelineName(kind: GuidelineKind, id: string, name: string): string {
  const builtIn = BUILTIN_NAMES[kind]?.[id];
  return builtIn && (name === builtIn.ko || !name) ? builtIn.en : name;
}
const BUILTIN_NAMES: Partial<Record<GuidelineKind, Record<string, { ko: string; en: string }>>> = {
  scene: {
    default: { ko: "기본 삽화", en: "Default illustration" },
    "default-comic": { ko: "기본 만화", en: "Default comic" },
    "system-pov": { ko: "POV", en: "POV" },
    "system-ensemble": { ko: "다인", en: "Ensemble" },
  },
  imageRatio: { default: { ko: "기본", en: "Default" } },
  character: { default: { ko: "기본", en: "Default" } },
  outfit: { default: { ko: "기본", en: "Default" } },
};

export function guidelineRows(state: AtelierState, kind: GuidelineKind): GuidelineRow[] {
  if (kind === "scene" || kind === "imageRatio") {
    const list = state.library[kind];
    return Object.entries(list.items).map(([id, item]) => ({
      id,
      name: guidelineName(kind, id, item.name),
      text: item.instruction,
      selected: list.selected === id,
      builtIn: isBuiltInGuideline(kind, id),
      ...(kind === "scene" ? { outputMode: ((item as { outputMode?: "illustration" | "comic" }).outputMode ?? "illustration") } : {}),
    }));
  }
  const list = state.freeGeneration[kind];
  return Object.entries(list.items).map(([id, item]) => ({ id, name: guidelineName(kind, id, item.name), text: item.instruction ?? "", selected: list.selected === id, builtIn: id === "default" }));
}

/** AM `S8`: every non-built-in directing / ratio guideline and every free-generation item. */
export function defaultExportSelection(state: AtelierState): AtelierDocumentSelection {
  return {
    scene: Object.keys(state.library.scene.items).filter((id) => !isBuiltInGuideline("scene", id)),
    imageRatio: Object.keys(state.library.imageRatio.items).filter((id) => !isBuiltInGuideline("imageRatio", id)),
    freeGeneration: { character: Object.keys(state.freeGeneration.character.items), outfit: Object.keys(state.freeGeneration.outfit.items) },
  };
}

/** Restore dialog text (AM `wbe`): the default resets its body; provided guidelines restore format, body and rules. */
export function restoreDescription(id: string): string {
  return id === "default" || id === "default-comic" ? L.guidelines.restoreDefault : L.guidelines.restoreProvided;
}

/* ------------------------------------------------------------------------------------------------
 * Errors
 * ---------------------------------------------------------------------------------------------- */

export type AtelierErrorKind = "conflict" | "field-conflict" | "validation" | "limit" | "read" | "other";
export function errorKind(error: Pick<RpcError, "code" | "detailCode"> | null | undefined): AtelierErrorKind {
  if (!error) return "other";
  if (error.detailCode === "atelier-conflict") return "conflict";
  if (error.detailCode === "atelier-field-conflict") return "field-conflict";
  if (error.detailCode === "atelier-validation") return "validation";
  if (error.detailCode === "atelier-limit") return "limit";
  if (error.detailCode === "atelier-read") return "read";
  return "other";
}
export function errorDiagnostics(error: RpcError | null | undefined): PresetDiagnostic[] {
  const details = error?.details as { diagnostics?: PresetDiagnostic[] } | undefined;
  return Array.isArray(details?.diagnostics) ? details!.diagnostics.filter((d) => d.severity === "error") : [];
}
export function diagnosticText(d: PresetDiagnostic): string {
  return d.sourcePath ? `${d.sourcePath}: ${d.message}` : d.message;
}

/** UTF-8 size (the 2 MiB import limit, AM `YCe`). */
export const utf8Size = (text: string): number => new TextEncoder().encode(text).length;

/** File name for a downloaded JSON (characters `<>:"/\|?*` -> `_`). */
export const safeFileName = (name: string): string => name.replace(/[<>:"/\\|?*]/g, "_") || "preset";

/* ------------------------------------------------------------------------------------------------
 * Renames and deletes that keep references consistent (AM `iH` id remap, `hct` delete notes)
 * ---------------------------------------------------------------------------------------------- */

function mapRules(doc: PresetDocument, fn: (ref: RuleRef) => RuleRef): void {
  if (!doc.content.rules) return;
  doc.content.rules = doc.content.rules.map((rule) => (isSelectionRule(rule) ? { ...rule, from: rule.from.map(fn), to: rule.to.map(fn) } : rule));
}
const refersTo = (rule: PresetRule, test: (ref: RuleRef) => boolean): boolean => isSelectionRule(rule) && [...rule.from, ...rule.to].some(test);

/** Renames a tag group (definitions / panels) and every reference (interaction sub-groups, rules). */
export function renameGroup(doc: PresetDocument, from: string, to: string): PresetDocument {
  if (from === to) return doc;
  const next = clone(doc);
  for (const list of [next.content.definitions, next.content.panels]) for (const g of list ?? []) if (g.id === from) g.id = to;
  for (const i of next.content.interactions ?? []) if (i.detailGroups) i.detailGroups = i.detailGroups.map((g) => (g === from ? to : g));
  mapRules(next, (ref) => (ref.group === from ? { ...ref, group: to } : ref));
  return next;
}
export function renameOption(doc: PresetDocument, groupId: string, from: string, to: string): PresetDocument {
  if (from === to) return doc;
  const next = clone(doc);
  for (const list of [next.content.definitions, next.content.panels]) for (const g of list ?? []) if (g.id === groupId) for (const o of g.options) if (o.id === from) o.id = to;
  mapRules(next, (ref) => (ref.group === groupId && ref.options ? { ...ref, options: ref.options.map((o) => (o === from ? to : o)) } : ref));
  return next;
}
export function renameInteraction(doc: PresetDocument, from: string, to: string): PresetDocument {
  if (from === to) return doc;
  const next = clone(doc);
  for (const i of next.content.interactions ?? []) if (i.id === from) i.id = to;
  mapRules(next, (ref) => (ref.interaction === from ? { ...ref, interaction: to } : ref));
  return next;
}
export function renameChannel(doc: PresetDocument, from: string, to: string): PresetDocument {
  if (from === to) return doc;
  const next = clone(doc);
  for (const c of next.content.channels ?? []) if (c.id === from) c.id = to;
  mapRules(next, (ref) => (ref.group === from ? { ...ref, group: to } : ref));
  return next;
}

/** Rules that name a group (any option) or an interaction. */
export function rulesReferencing(doc: PresetDocument, target: { group?: string; interaction?: string }): number {
  return (doc.content.rules ?? []).filter((r) => refersTo(r, (ref) => (!!target.group && ref.group === target.group) || (!!target.interaction && ref.interaction === target.interaction))).length;
}
function dropRulesFor(doc: PresetDocument, test: (ref: RuleRef) => boolean): void {
  if (!doc.content.rules) return;
  doc.content.rules = doc.content.rules.filter((r) => !refersTo(r, test));
  if (!doc.content.rules.length) delete doc.content.rules;
}
/** Deletes a tag group, its links and the rules naming it. */
export function deleteGroup(doc: PresetDocument, id: string): PresetDocument {
  const next = clone(doc);
  next.content.definitions = (next.content.definitions ?? []).filter((g) => g.id !== id);
  if (!next.content.definitions.length) delete next.content.definitions;
  for (const i of next.content.interactions ?? []) if (i.detailGroups) {
    i.detailGroups = i.detailGroups.filter((g) => g !== id);
    if (!i.detailGroups.length) delete i.detailGroups;
  }
  dropRulesFor(next, (ref) => ref.group === id);
  return next;
}
export function deleteChannel(doc: PresetDocument, id: string): PresetDocument {
  const next = clone(doc);
  next.content.channels = (next.content.channels ?? []).filter((c) => c.id !== id);
  if (!next.content.channels.length) delete next.content.channels;
  dropRulesFor(next, (ref) => ref.group === id);
  return next;
}
export function deleteInteraction(doc: PresetDocument, id: string): PresetDocument {
  const next = clone(doc);
  next.content.interactions = (next.content.interactions ?? []).filter((i) => i.id !== id);
  if (!next.content.interactions.length) delete next.content.interactions;
  dropRulesFor(next, (ref) => ref.interaction === id);
  return next;
}
/** Deletes a category with its interactions and their rules (AM "n interactions / n related rules deleted too"). */
export function deleteCategory(doc: PresetDocument, category: string): PresetDocument {
  let next = clone(doc);
  for (const i of (next.content.interactions ?? []).filter((x) => (x.category ?? "") === category)) next = deleteInteraction(next, i.id);
  next.content.interactionCategories = (next.content.interactionCategories ?? []).filter((c) => c !== category);
  if (!next.content.interactionCategories.length) delete next.content.interactionCategories;
  return next;
}
export function renameCategory(doc: PresetDocument, from: string, to: string): PresetDocument {
  const next = clone(doc);
  next.content.interactionCategories = (next.content.interactionCategories ?? []).map((c) => (c === from ? to : c));
  for (const i of next.content.interactions ?? []) if ((i.category ?? "") === from) i.category = to;
  return next;
}
/** Categories in display order: declared ones, then ones only used by interactions. */
export function categoriesOf(doc: PresetDocument): string[] {
  const declared = doc.content.interactionCategories ?? [];
  const used = (doc.content.interactions ?? []).map((i) => i.category).filter((c): c is string => !!c);
  return [...new Set([...declared, ...used])];
}
/** Copy with fresh ids (AM duplicate: "<id>_copy"). */
export function duplicateGroup(doc: PresetDocument, id: string, systemIds: readonly string[] = []): { doc: PresetDocument; id: string } {
  const next = clone(doc);
  const list = next.content.definitions ?? [];
  const index = list.findIndex((g) => g.id === id);
  if (index < 0) return { doc, id };
  const copy = clone(list[index]!);
  copy.id = uniqueId(`${id}_copy`, usedGroupIds(next, systemIds));
  list.splice(index + 1, 0, copy);
  return { doc: next, id: copy.id };
}
