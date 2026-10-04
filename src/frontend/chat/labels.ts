/**
 * English labels of the chat-side UI (footer, image edge controls, pending placeholder, runtime toasts,
 * generation-count panel, runtime error dialog). Korean originals (Asset Maid 0.9.88) in trailing comments,
 * spec/ui.md §5-§6. Keep every chat-side string here so a Korean locale can be added later.
 */
import { CHAT_FOOTER_LABELS } from "../../shared/contract/chat-dom.js";

/** Replaces `{name}` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) => (key in values ? String(values[key]) : match));
}

export const FOOTER_LABELS = {
  initial: CHAT_FOOTER_LABELS.initial.en, // 이 메시지의 이미지 분석 및 생성
  reroll: CHAT_FOOTER_LABELS.reroll.en, // 이 메시지를 새로 분석하여 모두 다시 생성
  retry: CHAT_FOOTER_LABELS.retry.en, // 실패한 분석 또는 이미지 생성을 이어서 재시도
  stop: "Stop analysis or generation", // 분석 또는 생성을 중지
  revisionPrevious: CHAT_FOOTER_LABELS.revisionPrevious.en, // 이전 생성 회차
  revisionNext: CHAT_FOOTER_LABELS.revisionNext.en, // 다음 생성 회차
  revisionGroup: CHAT_FOOTER_LABELS.revisionGroup.en, // 메시지 이미지 생성 회차 {i}/{n}
  allSlotsDeleted: CHAT_FOOTER_LABELS.allSlotsDeleted.en, // 이 회차의 이미지 슬롯이 모두 삭제되었습니다.
  footerGroup: "Image generation for this message" // (port) footer region label
} as const;

export const EDGE_LABELS = {
  previous: CHAT_FOOTER_LABELS.historyPrevious.en, // 이전 이미지
  next: CHAT_FOOTER_LABELS.historyNext.en, // 다음 이미지
  group: CHAT_FOOTER_LABELS.historyGroup.en, // 이미지 히스토리 {i}/{n}
  controls: CHAT_FOOTER_LABELS.imageControls.en, // 이미지 제어
  regenerate: CHAT_FOOTER_LABELS.regenerate.en, // 이미지 재생성
  regenerating: CHAT_FOOTER_LABELS.regenerating.en, // 이미지 재생성 중
  openZoom: "Open image viewer" // (port) 확대 보기
} as const;

export const PENDING_LABELS = {
  generating: CHAT_FOOTER_LABELS.generating.en, // 이미지 생성 중
  preparing: "Preparing image generation" // 이미지 생성 준비 중
} as const;

/** Error toasts raised by chat-side clicks (spec/ui.md §5.1.4, §5.1.6). */
export const CHAT_ERROR_LABELS = {
  regenerateFailed: CHAT_FOOTER_LABELS.regenerateFailed.en, // 이미지 재생성 실패
  generateFailed: CHAT_FOOTER_LABELS.generateFailed.en, // 채팅 이미지 생성 실패
  historyFailed: "Could not switch the image", // (port) 이미지 전환 실패
  revisionFailed: "Could not switch the generation revision", // (port) 생성 회차 전환 실패
  cancelFailed: "Could not stop the generation", // (port) 생성 중지 실패
  noChat: "Open a chat first." // (port) 채팅을 먼저 여세요.
} as const;

/** Generation phase labels (`jye` 114241) used as toast detail. */
export const PHASE_LABELS: Record<string, string> = {
  planned: "Analysis waiting", // 분석 대기
  "analyzing-preset": "Analyzer analyzing", // Analyzer 분석중
  "analyzing-modifiers": "Modifier correcting", // Modifier 보정중
  planning: "AI analysis complete", // AI 분석 완료
  generating: "Generating image", // 이미지 생성중
  committing: "Finishing generation" // 생성 마무리 중
};

/** Runtime toast messages (`MCt` 177783 / `GCt` 177969, spec/ui.md §6.3.6). */
export const TOAST_LABELS = {
  waiting: "Analysis waiting", // 분석 대기
  analyzing: "Analyzing", // 분석중
  scenePlanning: "Scene planning", // 장면 계획중
  generating: "Generating asset", // 에셋 생성중
  complete: "Asset complete", // 에셋 완료
  failed: "Asset failed", // 에셋 실패
  analysisFailed: "Analysis failed", // 분석 실패
  stopped: "Stopped", // 중지됨
  regenWaiting: "Asset regeneration waiting", // 에셋 재생성 대기
  regenRunning: "Regenerating asset", // 에셋 재생성중
  regenComplete: "Asset regeneration complete", // 에셋 재생성 완료
  regenFailed: "Asset regeneration failed", // 에셋 재생성 실패
  regenStopped: "Asset regeneration stopped", // 에셋 재생성 중지됨
  images: "{n} images", // {n}장
  oneImage: "1 image", // 1장
  queue: "Queue {p}/{d}", // Queue {p}/{d}
  retryAttempt: "{a}/{t}", // · {a}/{t}
  jobNumber: "Job number {n}", // 작업 번호 {n}
  stop: "Stop analysis or generation", // 분석 또는 생성을 중지
  retry: "Continue retrying the failed analysis or asset generation", // 실패한 분석 또는 에셋 생성을 이어서 재시도
  restart: "Re-analyze from the initial decision", // 초기 결정부터 다시 분석
  dismiss: "Dismiss notification", // 알림 닫기
  showErrorDetails: "Show error details", // 오류 상세 보기
  hideErrorDetails: "Hide error details", // 오류 상세 접기
  notificationsRegion: "Image generation notifications", // (port) 이미지 생성 알림
  stoppedNotice: "Image generation stopped" // 이미지 생성 중지됨
} as const;

/** Generation-count panel (spec/ui.md §6.2.4). */
export const COUNT_LABELS = {
  section: "Global chat image generation settings", // 전역 채팅 이미지 생성 설정
  expand: "Expand global image generation settings", // 전역 이미지 생성 설정 펼치기
  collapse: "Collapse global image generation settings", // 전역 이미지 생성 설정 접기
  toggleValue: "{mode} {value} images", // {고정|범위|분할} {value}장
  auto: "Auto", // 자동
  manual: "Manual", // 수동
  toManual: "Switch to global manual generation", // 전역 수동 생성으로 변경
  toAuto: "Switch to global automatic generation", // 전역 자동 생성으로 변경
  retrySave: "Settings save failed: retry save", // 설정 저장 실패: 저장 재시도
  modeButton: "Select count mode: {mode}", // 장수 방식 선택: {mode}
  modeTitle: "Select count mode", // 장수 방식 선택
  modeMenu: "Count mode", // 장수 방식
  fixed: "Fixed", // 고정
  range: "Range", // 범위
  split: "Split", // 분할
  splitUnsupported: "Split analysis is supported on V5. Select fixed or range.", // 분할 분석은 V5에서 지원합니다. 고정 또는 범위를 선택하세요.
  count: "Generation count", // 생성 장수
  countDecrease: "Decrease generation count", // 생성 장수 감소
  countIncrease: "Increase generation count", // 생성 장수 증가
  min: "Minimum generation count", // 최소 생성 장수
  minDecrease: "Decrease minimum generation count", // 최소 생성 장수 감소
  minIncrease: "Increase minimum generation count", // 최소 생성 장수 증가
  max: "Maximum generation count", // 최대 생성 장수
  maxDecrease: "Decrease maximum generation count", // 최대 생성 장수 감소
  maxIncrease: "Increase maximum generation count", // 최대 생성 장수 증가
  total: "Total count", // 총 장수
  totalDecrease: "Decrease total count", // 총 장수 감소
  totalIncrease: "Increase total count", // 총 장수 증가
  batch: "Split count", // 분할 장수
  batchDecrease: "Decrease split count", // 분할 장수 감소
  batchIncrease: "Increase split count", // 분할 장수 증가
  sceneButton: "Select scene direction style", // 장면 연출 방식 선택
  sceneMenu: "Scene direction style", // 장면 연출 방식
  sceneIllustration: "Illustration", // 삽화
  sceneComic: "Comic", // 만화
  scenePov: "POV", // pov 연출
  sceneEnsemble: "Ensemble", // 다인 연출
  saveFailed: "Saving generation settings failed.", // 생성 설정 저장에 실패했습니다.
  dragHint: "Drag to move" // (port) 끌어서 이동
} as const;

/** Runtime error dialog (spec/ui.md §6.4). */
export const ERROR_DIALOG_LABELS = {
  kicker: "AI Error", // AI Error (English in source)
  close: "Close error dialog", // 오류 창 닫기
  closeTitle: "Close", // 닫기
  description: "The request could not be completed. Check the error below and try again.", // 요청을 완료하지 못했습니다. 아래 오류를 확인한 뒤 다시 시도해 주세요.
  apiKeyRequired: "NovelAI API key required", // NovelAI API 키가 필요합니다
  analysisFailed: "Chat image analysis failed", // 채팅 이미지 분석 실패
  imageFailed: "Image generation failed", // NovelAI 이미지 생성 실패 (port: provider-neutral)
  defaultTitle: "AI request failed", // AI 요청 실패
  defaultMessage: "An unknown error occurred.", // 알 수 없는 오류가 발생했습니다.
  requestIncomplete: "Could not complete the chat image request." // 채팅 이미지 요청을 완료하지 못했습니다.
} as const;
