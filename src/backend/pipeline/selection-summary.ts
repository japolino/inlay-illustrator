/**
 * AI selection history of a generated image (AM 0.9.90 zoom "AI 선택 기록", `fye` @148924): the compact analyzer
 * record (`asset_maid_analysis`, AM `PDe`) is kept in the pipeline sidecar (`GenerationRecord.analysis`) and turned
 * into a `SelectionSummary` for `zoom.getDetails`. The verbatim summary builder emits Korean fallback labels; they
 * are translated here (ids and user text pass through unchanged).
 */
import { ANALYSIS_RECORD_MAX_BYTES, type GenerationAnalysisRecord, type SelectionSummary } from "../../shared/contract/index.js";
import { buildSelectionSummary } from "../../engine/v5/atelier.js";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});

/** Omitted record marker (AM `tA` reads it as `status: "omitted"`). */
const OMITTED = Object.freeze({ v: 1, p: "v5", om: "metadata_size" });

/**
 * The analysis record of a persisted image: the batch item's `analysisMetadata`, else the decision's embedded
 * `asset_maid_analysis`. Records above `ANALYSIS_RECORD_MAX_BYTES` are replaced by the omitted marker.
 */
export function analysisRecordOf(image: Rec): GenerationAnalysisRecord | undefined {
  const record = image.analysisMetadata ?? rec(image.decision).asset_maid_analysis;
  if (record === undefined || record === null) return undefined;
  let size = 0;
  try {
    size = JSON.stringify(record)?.length ?? 0;
  } catch {
    return { profile: "v5-hybrid", record: { ...OMITTED } };
  }
  return { profile: "v5-hybrid", record: size > ANALYSIS_RECORD_MAX_BYTES ? { ...OMITTED } : record };
}

const EXACT: Readonly<Record<string, string>> = Object.freeze({
  "장면 전체": "Whole scene",
  "장면 공통": "Scene",
  카메라: "Camera",
  "대상 기록 없음": "No target recorded",
  "컷 정보 없음": "No panel recorded",
  "이름 기록 없음": "No name recorded",
});

/** English version of one summary label. */
export function translateSelectionLabel(text: string): string {
  const exact = EXACT[text];
  if (exact) return exact;
  let out = text.replace(/ · 등장 (\d+)$/u, " · Appearance $1");
  out = out.replace(/^등장 (\d+)$/u, "Appearance $1");
  out = out.replace(/^컷 (\d+)$/u, "Panel $1");
  out = out.replace(/^인물 (.+?)( · |$)/u, "Character $1$2");
  return out;
}

/**
 * Summary of a stored record. `actorLabels[actorIndex]` = the actor's display name (record actors). Missing record ->
 * `status: "missing"`.
 */
export function selectionSummaryOf(analysis: GenerationAnalysisRecord | undefined, actors: ReadonlyArray<{ actorIndex: number; identityName: string }> = []): SelectionSummary {
  if (!analysis || analysis.record === undefined || analysis.record === null) return { status: "missing", scenes: [], interactions: [], sections: [], inventoryRecorded: false };
  const labels: Array<{ label?: string } | undefined> = [];
  for (const a of actors) if (Number.isInteger(a.actorIndex) && a.actorIndex >= 0 && a.identityName) labels[a.actorIndex] = { label: a.identityName };
  let raw: Rec;
  try {
    raw = buildSelectionSummary({ asset_maid_analysis: analysis.record }, labels);
  } catch {
    return { status: "missing", scenes: [], interactions: [], sections: [], inventoryRecorded: false };
  }
  const t = (v: unknown) => translateSelectionLabel(typeof v === "string" ? v : String(v ?? ""));
  const summary = raw as unknown as SelectionSummary;
  return {
    status: summary.status,
    inventoryRecorded: summary.inventoryRecorded === true,
    scenes: (summary.scenes ?? []).map((s) => ({ key: s.key, scope: t(s.scope), id: s.id })),
    interactions: (summary.interactions ?? []).map((i) => ({ ...i, id: t(i.id), source: t(i.source), target: t(i.target), panels: (i.panels ?? []).map(t) })),
    sections: (summary.sections ?? []).map((s) => ({ ...s, title: t(s.title) })),
  };
}
