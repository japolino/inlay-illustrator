/**
 * Image puppet (Inlay addition; not in Asset Maid): a subtle idle animation of a chat image (head tilt, breathing,
 * hand / held item bob, hair and appendage sway) drawn by a puppet warp in the browser.
 *
 * - `puppet.rig` asks the analysis model once per image for the movable parts (outline, pivot, parent); the backend
 *   cleans the answer with {@link sanitizePuppetRig} and stores it with the image (`puppets/<imageId>.json`).
 * - The chat side plays rigs whose `enabled` flag is on (the image's animate toggle), only while the image is on screen.
 * Coordinates are normalized to 0..1 over the image, `[x, y]`.
 */

export const PUPPET_PART_LABELS = ["torso", "head", "hair", "forearm", "item", "appendage"] as const;
export type PuppetPartLabel = (typeof PUPPET_PART_LABELS)[number];
export const PUPPET_APPENDAGE_KINDS = ["wing", "tail", "antenna", "ear", "ribbon", "cape"] as const;
export type PuppetAppendageKind = (typeof PUPPET_APPENDAGE_KINDS)[number];
/** Parts the renderer handles per image (three RGBA weight textures). */
export const PUPPET_MAX_PARTS = 12;
/** `puppet.get` batch size. */
export const PUPPET_GET_MAX_IDS = 64;

export interface PuppetPart {
  label: PuppetPartLabel;
  kind?: PuppetAppendageKind;
  /** 0-based character the part belongs to (breathing follows that character's torso). */
  character: number;
  /** [x0, y0, x1, y1] */
  box: [number, number, number, number];
  /** Silhouette polygon `[x, y]` (>= 3 points), or empty: an ellipse inscribed in `box`. */
  outline: Array<[number, number]>;
  /** Rotation / attachment point `[x, y]`. */
  pivot: [number, number];
  /** Index of the part this one hangs from; -1 = the character's body (torso). */
  parent: number;
  /** Forearm resting in or on something (pocket, hip, lap, table): it does not bob. */
  resting?: boolean;
}

export interface PuppetRig {
  version: 1;
  parts: PuppetPart[];
  /** Analysis model that drew the rig. */
  model: string;
  createdAt: string;
}

export type PuppetFailureCode = "comic" | "nothing-found" | "declined";

export const PUPPET_FAILURE_MESSAGES: Readonly<Record<PuppetFailureCode, string>> = Object.freeze({
  comic: "Comic pages with several panels can't be animated.",
  "nothing-found": "No character parts to animate were found in this image.",
  declined: "The analysis model declined to read this image.",
});

export interface PuppetState {
  imageId: string;
  /** none: never rigged; ready: rig stored; failed: the model found nothing usable (`failure`). */
  status: "none" | "ready" | "failed";
  /** Animate toggle of the image (plays while on screen). */
  enabled: boolean;
  rig?: PuppetRig;
  failure?: { code: PuppetFailureCode; message: string };
  updatedAt: string;
}

export function emptyPuppetState(imageId: string): PuppetState {
  return { imageId, status: "none", enabled: false, updatedAt: "" };
}

/* ------------------------------------------------------------------------------------------------
 * Rig cleanup (model answer -> PuppetPart[])
 * ---------------------------------------------------------------------------------------------- */

type Raw = Record<string, unknown>;

const LABEL_ALIASES: Record<string, { label: PuppetPartLabel; kind?: PuppetAppendageKind }> = {
  torso: { label: "torso" }, body: { label: "torso" }, chest: { label: "torso" },
  head: { label: "head" }, face: { label: "head" },
  hair: { label: "hair" },
  forearm: { label: "forearm" }, hand: { label: "forearm" }, arm: { label: "forearm" },
  item: { label: "item" }, object: { label: "item" }, prop: { label: "item" }, held_item: { label: "item" },
  appendage: { label: "appendage" },
  wing: { label: "appendage", kind: "wing" }, wings: { label: "appendage", kind: "wing" },
  tail: { label: "appendage", kind: "tail" },
  antenna: { label: "appendage", kind: "antenna" }, antennae: { label: "appendage", kind: "antenna" },
  ear: { label: "appendage", kind: "ear" }, ears: { label: "appendage", kind: "ear" },
  ribbon: { label: "appendage", kind: "ribbon" }, cape: { label: "appendage", kind: "cape" },
};

/** Which parts survive when a scene has more than PUPPET_MAX_PARTS (lower first). */
function priority(part: PuppetPart): number {
  if (part.label === "head") return 0;
  if (part.label === "forearm") return part.resting ? 6 : 1;
  return { item: 2, torso: 3, appendage: 4, hair: 5 }[part.label] ?? 7;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 4 decimals: ~0.1 px on a 1216 px image, and short rig files. */
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : NaN);

/** Model `[y, x]` in 0..1000 -> `[x, y]` in 0..1. */
function point(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const y = num(value[0]), x = num(value[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [clamp01(x / 1000), clamp01(y / 1000)] : null;
}

/** Model `[ymin, xmin, ymax, xmax]` in 0..1000 -> `[x0, y0, x1, y1]` in 0..1 (null when degenerate). */
function box(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const [a, b, c, d] = value.slice(0, 4).map(num) as [number, number, number, number];
  if (![a, b, c, d].every(Number.isFinite)) return null;
  const x0 = clamp01(Math.min(b, d) / 1000), x1 = clamp01(Math.max(b, d) / 1000);
  const y0 = clamp01(Math.min(a, c) / 1000), y1 = clamp01(Math.max(a, c) / 1000);
  return x1 - x0 >= 0.01 && y1 - y0 >= 0.01 ? [x0, y0, x1, y1] : null;
}

function defaultPivot(label: PuppetPartLabel, b: [number, number, number, number]): [number, number] {
  const cx = (b[0] + b[2]) / 2;
  if (label === "head") return [cx, b[3]];
  if (label === "torso") return [cx, b[3]];
  return [cx, (b[1] + b[3]) / 2];
}

/**
 * Model answer -> parts, or why nothing can be animated. Coordinates are clamped, degenerate parts dropped, pivots far
 * outside their part pulled back, parents re-indexed (cycles and missing parents become -1), at most one torso per
 * character, and the most visible parts kept when there are more than PUPPET_MAX_PARTS.
 */
export function sanitizePuppetRig(raw: unknown): { parts: PuppetPart[] } | { failure: PuppetFailureCode } {
  const answer = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : Array.isArray(raw) ? { parts: raw } : {}) as Raw;
  if (answer.comic === true || num(answer.panels) > 1) return { failure: "comic" };
  const list = Array.isArray(answer.parts) ? (answer.parts as unknown[]) : [];
  const kept: Array<{ part: PuppetPart; source: number; rawParent: number }> = [];
  const torsoOf = new Set<number>();
  list.forEach((item, source) => {
    if (!item || typeof item !== "object") return;
    const r = item as Raw;
    const alias = LABEL_ALIASES[String(r.label ?? "").trim().toLowerCase()];
    const b = box(r.box_2d ?? r.box);
    if (!alias || !b) return;
    const character = Math.max(0, Math.trunc(num(r.character)) || 0);
    if (alias.label === "torso") {
      if (torsoOf.has(character)) return;
      torsoOf.add(character);
    }
    const kindRaw = String(r.kind ?? "").trim().toLowerCase();
    const kind = alias.kind ?? (PUPPET_APPENDAGE_KINDS as readonly string[]).find((k) => kindRaw === k || kindRaw === `${k}s`) as PuppetAppendageKind | undefined;
    const outline = (Array.isArray(r.outline) ? r.outline : []).map(point).filter((p): p is [number, number] => !!p).slice(0, 80);
    const distinct = new Set(outline.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`)).size;
    let pivot = point(r.pivot) ?? defaultPivot(alias.label, b);
    const padX = (b[2] - b[0]) * 0.5, padY = (b[3] - b[1]) * 0.5;
    pivot = [Math.min(b[2] + padX, Math.max(b[0] - padX, pivot[0])), Math.min(b[3] + padY, Math.max(b[1] - padY, pivot[1]))];
    const part: PuppetPart = {
      label: alias.label,
      character,
      box: b.map(round4) as PuppetPart["box"],
      outline: distinct >= 3 ? outline.map(([x, y]) => [round4(x), round4(y)] as [number, number]) : [],
      pivot: [round4(pivot[0]), round4(pivot[1])],
      parent: -1,
    };
    if (alias.label === "appendage" && kind) part.kind = kind;
    if (alias.label === "forearm" && r.resting === true) part.resting = true;
    const parentRaw = num(r.attached_to ?? r.parent);
    kept.push({ part, source, rawParent: Number.isInteger(parentRaw) ? parentRaw : -1 });
  });
  const chosen = [...kept]
    .sort((a, b) => priority(a.part) - priority(b.part) || a.part.character - b.part.character || a.source - b.source)
    .slice(0, PUPPET_MAX_PARTS)
    .sort((a, b) => a.source - b.source);
  const indexOfSource = new Map(chosen.map((c, i) => [c.source, i]));
  const parts = chosen.map((c) => ({ ...c.part, parent: c.part.label === "torso" ? -1 : (indexOfSource.get(c.rawParent) ?? -1) }));
  parts.forEach((p, i) => {
    if (p.parent === i || (p.parent >= 0 && parts[p.parent]!.label === "torso")) p.parent = -1;
  });
  parts.forEach((p, i) => {
    // Cut only a part the walk comes back to; a part merely hanging from a loop keeps its parent (the loop's
    // lowest-index member still sees it intact on its own turn and cuts it).
    const seen = new Set([i]);
    for (let at = p.parent; at >= 0; at = parts[at]!.parent) {
      if (at === i) {
        p.parent = -1;
        break;
      }
      if (seen.has(at)) break;
      seen.add(at);
    }
  });
  if (!parts.some((p) => p.label !== "torso")) return { failure: "nothing-found" };
  return { parts };
}
