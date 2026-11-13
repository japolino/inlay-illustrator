/**
 * RPC handlers of the Maid Atelier (AM 0.9.90 preset documents, guideline library, free-generation guidelines,
 * execution controls). Logic lives in src/backend/services/atelier.ts; method list in spec atelier-rpc.md.
 */
import { GUIDELINE_KINDS, type GuidelineKind } from "../../../shared/contract/index.js";
import { atelierServiceOf } from "../../services/atelier.js";
import { fail } from "../errors.js";
import type { HandlerGroup } from "../types.js";

function requireString(value: unknown, name: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) fail("bad-request", `${name} is required.`);
  return value;
}
function requireRevision(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) fail("bad-request", "baseRevision is required.");
  return value;
}
function requireKind(value: unknown): GuidelineKind {
  if (!GUIDELINE_KINDS.includes(value as GuidelineKind)) fail("bad-request", `Unknown guideline kind: ${String(value)}`);
  return value as GuidelineKind;
}
/** Optional id of the preset open in the Atelier (AM 0.9.91 guideline editing reads and writes that preset's rules). */
function presetOf(p: { presetId?: unknown }): { presetId?: string } {
  return p.presetId !== undefined ? { presetId: requireString(p.presetId, "presetId") } : {};
}

export const atelierHandlers: HandlerGroup = {
  "atelier.get": async (_p, ctx) => ({ state: await atelierServiceOf(ctx).getState() }),
  "atelier.getBaseline": (_p, ctx) => atelierServiceOf(ctx).baseline(),
  "atelier.validateDocument": (p, ctx) => atelierServiceOf(ctx).validateDocument(requireString(p.json, "json")),

  "atelier.documents.create": (p, ctx) =>
    atelierServiceOf(ctx).createDocument({ baseRevision: requireRevision(p.baseRevision), name: typeof p.name === "string" ? p.name : "", ...(p.duplicateOf !== undefined ? { duplicateOf: requireString(p.duplicateOf, "duplicateOf") } : {}), ...(p.json !== undefined ? { json: requireString(p.json, "json") } : {}) }),
  "atelier.documents.import": (p, ctx) =>
    atelierServiceOf(ctx).importDocument({ baseRevision: requireRevision(p.baseRevision), fileName: typeof p.fileName === "string" ? p.fileName : "", json: requireString(p.json, "json"), activate: p.activate !== false }),
  "atelier.documents.save": (p, ctx) => atelierServiceOf(ctx).saveDocument({ baseRevision: requireRevision(p.baseRevision), id: requireString(p.id, "id"), json: requireString(p.json, "json") }),
  "atelier.documents.rename": (p, ctx) => atelierServiceOf(ctx).renameDocument({ baseRevision: requireRevision(p.baseRevision), id: requireString(p.id, "id"), name: requireString(p.name, "name") }),
  "atelier.documents.delete": (p, ctx) => atelierServiceOf(ctx).deleteDocument({ baseRevision: requireRevision(p.baseRevision), id: requireString(p.id, "id") }),
  "atelier.documents.resetBuiltIn": (p, ctx) => atelierServiceOf(ctx).resetBuiltInDocument({ baseRevision: requireRevision(p.baseRevision) }),
  "atelier.documents.activate": (p, ctx) => atelierServiceOf(ctx).activateDocument({ baseRevision: requireRevision(p.baseRevision), id: requireString(p.id, "id") }),
  "atelier.documents.export": (p, ctx) => atelierServiceOf(ctx).exportDocument({ id: requireString(p.id, "id"), ...(typeof p.json === "string" ? { json: p.json } : {}), ...(p.selection ? { selection: p.selection } : {}) }),
  "atelier.documents.rawSource": (p, ctx) => atelierServiceOf(ctx).rawSource({ id: requireString(p.id, "id") }),

  "atelier.instructions.select": (p, ctx) => atelierServiceOf(ctx).selectGuideline({ kind: requireKind(p.kind), id: requireString(p.id, "id"), ...presetOf(p) }),
  "atelier.instructions.create": (p, ctx) => atelierServiceOf(ctx).createGuideline({ kind: requireKind(p.kind), ...(p.copyOf !== undefined ? { copyOf: requireString(p.copyOf, "copyOf") } : {}), ...presetOf(p) }),
  "atelier.instructions.remove": (p, ctx) => atelierServiceOf(ctx).removeGuideline({ kind: requireKind(p.kind), id: requireString(p.id, "id"), ...presetOf(p) }),
  "atelier.instructions.save": (p, ctx) => {
    if (!Array.isArray(p.edits)) fail("bad-request", "edits is required.");
    return atelierServiceOf(ctx).saveGuidelines({ kind: requireKind(p.kind), edits: p.edits.map((e) => ({ id: requireString(e?.id, "edits.id"), field: requireString(e?.field, "edits.field"), before: e.before, value: e.value })), ...presetOf(p) });
  },
  "atelier.instructions.setOutputMode": (p, ctx) => {
    if (p.mode !== "illustration" && p.mode !== "comic") fail("bad-request", "mode must be illustration or comic.");
    return atelierServiceOf(ctx).setOutputMode({ id: requireString(p.id, "id"), mode: p.mode, ...presetOf(p) });
  },
  "atelier.instructions.setSystems": (p, ctx) => {
    if (!p.systems || typeof p.systems !== "object" || Array.isArray(p.systems)) fail("bad-request", "systems is required.");
    return atelierServiceOf(ctx).setSystems({ systems: p.systems, ...presetOf(p) });
  },
  "atelier.instructions.setOption": (p, ctx) => atelierServiceOf(ctx).setOption({ id: requireString(p.id, "id"), optionId: requireString(p.optionId, "optionId"), value: p.value === true, ...presetOf(p) }),
  "atelier.instructions.setSizes": (p, ctx) => {
    if (!Array.isArray(p.allowedSizeIds)) fail("bad-request", "allowedSizeIds is required.");
    return atelierServiceOf(ctx).setSizes({ id: requireString(p.id, "id"), allowedSizeIds: p.allowedSizeIds, ...(Array.isArray(p.customSizes) ? { customSizes: p.customSizes } : {}), ...presetOf(p) });
  },
  "atelier.instructions.restore": (p, ctx) => atelierServiceOf(ctx).restoreGuideline({ id: requireString(p.id, "id"), expected: p.expected, ...presetOf(p) }),
  "atelier.instructions.importLegacyDirections": (p, ctx) => atelierServiceOf(ctx).importLegacyDirections({ baseRevision: requireRevision(p.baseRevision) }),

  "atelier.execution.set": (p, ctx) => {
    if (!p.patch || typeof p.patch !== "object") fail("bad-request", "patch is required.");
    return atelierServiceOf(ctx).setExecution({ patch: p.patch });
  },
  "atelier.execution.setMode": (p, ctx) => {
    if (p.mode !== "default" && p.mode !== "comic") fail("bad-request", "mode must be default or comic.");
    return atelierServiceOf(ctx).setExecutionMode({ mode: p.mode });
  },
  "atelier.repair": (p, ctx) => {
    if (p.confirm !== true) fail("bad-request", "This action needs an explicit confirmation (confirm: true).");
    if (p.part !== "catalog" && p.part !== "library" && p.part !== "freeGeneration") fail("bad-request", "part must be catalog, library or freeGeneration.");
    return atelierServiceOf(ctx).repair({ part: p.part });
  },
};
