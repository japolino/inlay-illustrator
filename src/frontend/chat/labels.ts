/**
 * English labels of the chat-side UI (footer, image edge controls, runtime toasts,
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

/** Animate toggle over each image (Inlay addition: puppet rig + live warp, src/frontend/puppet). */
export const PUPPET_LABELS = {
  animate: "Animate image", // 이미지 움직이기
  stop: "Stop animation", // 애니메이션 중지
  rigging: "Preparing the animation", // 애니메이션 준비 중
  retry: "Click to try again.", // 다시 시도하려면 클릭하세요.
  reducedMotion: "Animation paused: your system asks for reduced motion.", // 동작 줄이기 설정으로 애니메이션이 일시 중지되었습니다.
  failedTitle: "This image can't be animated", // 이 이미지는 움직일 수 없습니다
  rigFailed: "Could not animate the image", // 이미지 애니메이션 실패
  toggleFailed: "Could not change the animation", // 애니메이션 변경 실패
  unavailable: "This browser can't play image animations (WebGL is unavailable).", // 이 브라우저에서는 이미지 애니메이션을 재생할 수 없습니다.
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

/** JEV roster row under a generation toast (`sCt` 176461). */
export const JEV_LABELS = {
  message: "Roster preparation", // 로스터 준비
  badgeTitle: "Narrows the cast roster passed to the analysis.", // 분석에 전달할 등장 인물 로스터를 추립니다.
  checking: "Checking characters · {a}/{t}", // 인물 확인 · {a}/{t}
  actors: "Characters {n}", // 인물 {n}
  selected: "Selection complete", // 선정 완료
  failed: "Failed", // 실패
  stopped: "Stopped", // 중지됨
  failedDetail: "Roster selection failed." // 로스터 선정 실행에 실패했습니다.
} as const;

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
  stoppedNotice: "Image generation stopped", // 이미지 생성 중지됨
  // Retry error details (AM 0.9.89.5 `ygt` 115452, `lSe` 177298, toast `TOt` 179144).
  retryFailed: "{stage} · Request attempt {n} failed", // {stage} · 요청 {n}차 실패
  imageNumber: "Image {n}", // {n}번 이미지
  errorCode: "Error code: {v}", // 오류 코드: {v}
  provider: "Provider: {v}", // 공급자: {v}
  model: "Model: {v}", // 모델: {v}
  requestId: "Request ID: {v}", // 요청 ID: {v}
  showPreviousErrors: "Show previous errors ({n})", // 이전 오류 {n}건 보기
  hidePreviousErrors: "Hide previous errors ({n})", // 이전 오류 {n}건 접기
  copyErrorLog: "Copy error log", // 오류 로그 복사
  copied: "Copied", // 복사됨
  copyFailed: "Copy failed · Select the error text manually.", // 복사 실패 · 오류 내용을 직접 선택해 주세요.
  hideDetails: "Hide details" // 상세 접기
} as const;

/** Stage names of retry errors (`GenerationRetryError.stage` carries AM's Korean text). */
export const RETRY_STAGE_LABELS: Record<string, string> = {
  "이미지 생성": "Image generation", // 이미지 생성
  "분석·생성": "Analysis & generation", // 분석·생성
  "초기 결정": "Initial decision" // 초기 결정
};
/** Split detail step `세부{n} 분석`. */
export const RETRY_DETAIL_STAGE_LABEL = "Detail {n} analysis";

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
  dragHint: "Drag to move", // (port) 끌어서 이동
  generateLatest: "Generate images for the latest message", // (port) replaces the removed floating button
  noEligibleMessage: "No assistant message to illustrate.", // (port)
  openOverview: "Open this character in Inlay Illustrator", // (port)
  resolution: "Generation resolution", // 생성 해상도
  resolutionButton: "Generation resolution: {value}", // 생성 해상도: {value}
  resolutionMenu: "Generation resolution", // 생성 해상도
  resolutionAuto: "Auto", // 자동
  aiCoordinates: "AI coordinates", // AI 좌표 지정
  aiCoordinatesTitle: "On: the analysis AI places each character. Off: NovelAI places characters." // (port) 켜면 분석 AI가 캐릭터 좌표를 지정, 끄면 NovelAI 자동 배치
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
