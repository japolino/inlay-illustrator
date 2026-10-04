/**
 * English UI strings of the chat pipeline with the Korean Asset Maid originals (spec/ui.md §5.2, pipeline errors).
 * One module so a Korean locale can be added later.
 */
import type { GenerationPhase, ProgressInfo, RpcError } from "../../shared/contract/index.js";
import { rpcError } from "../../shared/contract/index.js";

export interface Label {
  en: string;
  ko: string;
}

/** AM `jye` 114241 (phase / status -> label). */
export const PHASE_LABELS = Object.freeze({
  queued: { en: "Preparing image generation", ko: "이미지 생성 준비 중" },
  planned: { en: "Preparing image generation", ko: "이미지 생성 준비 중" },
  "analyzing-preset": { en: "Analyzer analyzing", ko: "Analyzer 분석중" },
  "analyzing-modifiers": { en: "Modifier correcting", ko: "Modifier 보정중" },
  planning: { en: "AI analysis complete", ko: "AI 분석 완료" },
  generating: { en: "Generating image", ko: "이미지 생성중" },
  committing: { en: "Finishing generation", ko: "생성 마무리 중" },
  completed: { en: "Image generation complete", ko: "이미지 생성 완료" },
  failed: { en: "Image generation failed", ko: "이미지 생성 실패" },
  cancelled: { en: "Image generation cancelled", ko: "이미지 생성 취소됨" },
  stopped: { en: "Image generation stopped", ko: "이미지 생성 중지됨" },
  active: { en: "Processing image generation", ko: "이미지 생성 처리 중" },
} satisfies Record<string, Label>);

/** AM `uht` 114284: ComfyUI provider stages override the label while active. */
export const COMFY_STAGE_LABELS = Object.freeze({
  connecting: { en: "Connecting to ComfyUI", ko: "Comfy UI 연결 중" },
  uploading: { en: "Sending input to ComfyUI", ko: "Comfy UI 입력 전송 중" },
  queued: { en: "Waiting for ComfyUI", ko: "Comfy UI 생성 대기 중" },
  downloading: { en: "Receiving the ComfyUI result", ko: "Comfy UI 결과 수신 중" },
  generating: { en: "ComfyUI generating", ko: "Comfy UI 생성 중" },
} satisfies Record<string, Label>);

/** Pipeline messages (Asset Maid originals in `ko`). */
export const PIPELINE_TEXT = Object.freeze({
  noSlots: {
    en: "Could not find a paragraph position to insert images. Check the message body.",
    ko: "이미지를 삽입할 문단 위치를 찾지 못했습니다. 메시지 본문을 확인해 주세요.",
  },
  noCandidates: { en: "No character candidates are available for generation.", ko: "생성에 사용할 캐릭터 후보가 없습니다." },
  emptyContent: { en: "The message has no text to generate from.", ko: "생성에 사용할 메시지 본문이 없습니다." },
  messageMissing: { en: "The target character message could not be found.", ko: "대상 캐릭터 메시지를 찾을 수 없습니다." },
  noInsertableSlot: { en: "There is no paragraph slot to insert images into.", ko: "삽입 가능한 문단 슬롯이 없습니다." },
  failedCount: { en: "{n} image(s) failed to generate.", ko: "{n}장 생성에 실패했습니다." },
  splitNeedsV5: {
    en: "Split analysis is supported with V5 only. Choose fixed or range.",
    ko: "분할 분석은 V5에서 지원합니다. 고정 또는 범위를 선택하세요.",
  },
  busy: { en: "This message already has an image job running.", ko: "이미 생성 중인 작업입니다." },
  targetChanged: { en: "Chat response target is no longer current.", ko: "Chat response target is no longer current." },
  slotMismatch: {
    en: "Generated illustration does not reference a current message slot_number.",
    ko: "Generated illustration does not reference a current DB message slot_number.",
  },
  regenerationRunning: { en: "Regeneration of this image is already running.", ko: "이 이미지의 재생성이 이미 진행 중입니다." },
  deleteBusy: { en: "Image work is running. Delete after it finishes.", ko: "이미지 작업이 진행 중입니다. 작업 완료 후 삭제해 주세요." },
  deleteRunning: { en: "Deletion is already running.", ko: "이미 삭제 중입니다." },
  revisionMissing: { en: "The edited image could not be generated.", ko: "수정된 이미지를 생성하지 못했습니다." },
  editInstructionEmpty: { en: "Enter what to change.", ko: "수정할 내용을 입력하세요." },
  interrupted: { en: "Image generation was interrupted (the backend restarted). Retry to continue.", ko: "이미지 생성이 중단되었습니다." },
  generationIncomplete: { en: "Image generation could not be completed.", ko: "이미지 생성을 완료하지 못했습니다." },
  noRestartSnapshot: {
    en: "No saved count settings for this job. Use regenerate all instead.",
    ko: "원래 장수 설정 기록이 없습니다. 전체 다시 생성을 사용하세요.",
  },
} satisfies Record<string, Label>);

export function formatLabel(label: Label, values: Record<string, string | number> = {}): Label {
  const fill = (s: string) => s.replace(/\{(\w+)\}/gu, (_m, k: string) => String(values[k] ?? `{${k}}`));
  return { en: fill(label.en), ko: fill(label.ko) };
}

/** Progress for a phase (AM `dht` 114252 fractions, `Jy = 0.04`). */
export function phaseProgress(
  phase: GenerationPhase | "queued" | "completed" | "failed" | "cancelled",
  detail: { imageIndex?: number; imageCount?: number; regenerate?: boolean; providerStage?: string; retry?: { attempt: number; total: number } } = {},
): ProgressInfo {
  const stage = detail.providerStage as keyof typeof COMFY_STAGE_LABELS | undefined;
  const label: Label =
    phase === "generating" && stage && COMFY_STAGE_LABELS[stage] ? COMFY_STAGE_LABELS[stage] : (PHASE_LABELS as Record<string, Label>)[phase] ?? PHASE_LABELS.active;
  const count = Math.max(1, detail.imageCount ?? 1);
  const step = (1 - 0.04) / (count + 2);
  let fraction = 0.04;
  if (detail.regenerate) {
    fraction = phase === "analyzing-preset" || phase === "analyzing-modifiers" ? 0.28 : phase === "planning" ? 0.5 : phase === "committing" ? 0.97 : phase === "generating" ? 0.6 + 0.36 * Math.min(1, (detail.imageIndex ?? 0) / count) : 0.03;
  } else if (phase === "planning") fraction = 0.04 + 2 * step;
  else if (phase === "committing") fraction = 0.99;
  else if (phase === "generating") fraction = Math.min(0.99, 0.04 + step * (2 + Math.min(count, detail.imageIndex ?? 0)));
  if (phase === "completed") fraction = 1;
  if (phase === "failed" || phase === "cancelled") fraction = 0;
  const progress: ProgressInfo = { label: label.en, labelKo: label.ko, fraction };
  if (phase === "generating" && detail.imageCount) Object.assign(progress, { done: Math.min(detail.imageCount, detail.imageIndex ?? 0), total: detail.imageCount });
  if (detail.retry) progress.retry = detail.retry;
  return progress;
}

export function labelError(code: RpcError["code"], label: Label, extra: Omit<RpcError, "code" | "message" | "messageKo"> = {}): RpcError {
  return rpcError(code, label.en, { messageKo: label.ko, ...extra });
}
