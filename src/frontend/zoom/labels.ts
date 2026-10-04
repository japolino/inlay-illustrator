/**
 * English labels of the zoom viewer / image workspace and the chat state window (spec/ui.md §5.3-§5.6).
 * Korean originals (Asset Maid 0.9.88) in trailing comments. Keep every zoom string here.
 */
export { fill } from "../chat/labels.js";

export const ZOOM_LABELS = {
  dialog: "Image viewer", // (port) 이미지 확대 보기
  close: "Close", // 닫기
  closeMobile: "Close zoom UI", // 확대 UI 닫기
  openInfo: "Open info", // 정보 열기
  closeInfo: "Close info", // 정보 닫기
  openAnalysis: "Open analysis", // 분석 열기
  closeAnalysis: "Close analysis", // 분석 닫기
  hideSidebar: "Hide sidebar", // 사이드바 숨기기
  showSidebar: "Show sidebar", // 사이드바 표시
  previousImage: "Previous image", // 이전 이미지
  nextImage: "Next image", // 다음 이미지
  cannotLoad: "Cannot load the image.", // 이미지를 불러올 수 없습니다.
  loadingImage: "Loading image", // (port) 이미지 불러오는 중
  chatImages: "Chat images", // 채팅 이미지
  none: "None", // 없음
  messageImages: "Message {n} images", // 메시지 {n} 이미지
  message: "Message {n}", // (port) 메시지 {n}
  revisionGroup: "Message {n} generation revision {i}/{k}", // 메시지 {n} 생성 회차 {i}/{k}
  previousRevision: "Previous generation round", // 이전 생성 회차
  nextRevision: "Next generation round", // 다음 생성 회차
  saveImage: "Save current image", // 현재 이미지 저장
  generationLog: "Generation log", // 생성 기록
  deleteLogImage: "Delete generation log image", // 생성 기록 이미지 삭제
  deleteLogConfirmTitle: "Delete this image from the generation log?", // (port) 생성 기록에서 이 이미지를 삭제할까요?
  deleteLogConfirmDescription: "The image file is removed when no other message uses it.", // (port)
  delete: "Delete", // 삭제
  cancel: "Cancel", // 취소
  original: "Original", // 원본
  generated: "Generated", // 생성
  promptSourceBadge: "TAG", // TAG
  imageSaved: "Image saved.", // 이미지를 저장했습니다.
  downloadStarted: "Image download started.", // 이미지 다운로드를 시작했습니다.
  saveFailed: "Image save failed · {error}", // 이미지 저장 실패 · {error}
  /* info panel */
  info: "Info", // 정보
  promptList: "Prompt list", // 프롬프트 목록
  editPrompt: "Edit prompt", // 프롬프트 편집
  aiEdit: "Edit prompt with AI", // AI로 프롬프트 수정
  cancelEdit: "Cancel prompt edit", // 프롬프트 편집 취소
  savePrompt: "Save prompt", // 프롬프트 저장
  importSeed: "Import only the seed of the current log", // 현재 기록의 시드만 가져오기
  importSeedTitle: "Imports the seed of the current log.", // 현재 기록의 시드를 가져옵니다.
  importPrompts: "Import the prompt of the current log", // 현재 기록의 프롬프트 가져오기
  importPromptsTitle: "Imports the prompt of the current log.", // 현재 기록의 프롬프트를 가져옵니다.
  resetDrafts: "Discard prompt and coordinate drafts", // (port) 프롬프트·좌표 초안 버리기
  draftActive: "Draft", // (port) 초안
  loadingSettings: "Loading image generation settings", // 이미지 생성 설정 불러오는 중
  checkingMetadata: "Checking generation metadata…", // 생성 메타데이터 확인 중…
  metadataError: "Could not read image generation metadata.", // 이미지 생성 메타데이터를 읽지 못했습니다.
  metadataEmpty: "No generation metadata to show.", // 표시할 생성 메타데이터가 없습니다.
  historicalLocked: "This image belongs to an older generation round. Switch to the active round to edit it.", // (port)
  mainPrompt: "Main prompt", // Main prompt
  positivePrompt: "Positive prompt", // Positive prompt
  actorPrompt: "{label} prompt", // {label} prompt
  negative: "Negative", // 네거티브
  negativePlaceholder: "Negative prompt", // 네거티브 프롬프트
  negativeAria: "{label} Negative", // {label} 네거티브
  include: "Include", // 포함
  includeTitle: "Uncheck to exclude this character from the regeneration request.", // 해제하면 이 캐릭터를 재생성 요청에서 제외합니다.
  includeSr: "{n}. {label}", // {n}번 {label}
  provider: "Provider", // 제공자
  coordinate: "Coordinate", // 좌표
  aiChoice: "AI Choice", // AI Choice
  editCoordinate: "{label} Edit coordinate", // {label} 좌표 편집
  cancelCoordinate: "{label} Cancel coordinate edit", // {label} 좌표 편집 취소
  editCoordinateTitle: "Edit all character coordinates on the zoomed image", // 확대 이미지에서 모든 캐릭터 좌표 편집
  cancelCoordinateTitle: "Discard all unsaved coordinate changes", // 저장하지 않은 모든 좌표 변경 취소
  /* generation footer */
  seed: "SEED", // SEED
  noSeed: "No seed", // Seed 없음
  fix: "Fix", // 고정
  fixSeedTitle: "Keep seed on regeneration", // 재생성시 시드 고정
  imageSize: "Image size", // 이미지 크기
  custom: "Custom", // 커스텀
  regenerate: "Regenerate", // 재생성
  regenerateTitle: "Regenerate the image with the current settings.", // 현재 설정으로 이미지를 재생성합니다.
  generationSettings: "Generation settings", // 생성 설정
  regenerationStarted: "Regeneration started.", // (port) 재생성을 시작했습니다.
  /* analyzer */
  analysis: "Analysis", // 분석
  copyAnalysis: "Copy analysis text", // 분석 텍스트 복사
  copied: "Copied", // 복사 완료
  noAnalyzer: "No Analyzer data.", // Analyzer 데이터가 없습니다.
  /* coordinate board */
  coordinateBoard: "Character coordinate edit board", // 캐릭터 좌표 편집 보드
  setCoordinates: "Set coordinates", // 좌표지정
  cancelCoordinates: "Cancel coordinate edit", // 좌표 편집 취소
  saveCoordinates: "Save coordinates", // 좌표 저장
  saveCoordinatesTitle: "Save all character coordinates", // 모든 캐릭터 좌표 저장
  preparingCanvas: "Preparing coordinate canvas…", // 좌표 캔버스 준비 중…
  markerUnassigned: "{n}. {label} AI Choice, drag up to set a coordinate", // {n}번 {label} AI Choice, 위로 끌어 좌표 지정
  markerToAiChoice: "{n}. {label} switch to AI Choice", // {n}번 {label} AI Choice로 전환
  markerAt: "{n}. {label} coordinate {x} x {y}", // {n}번 {label} 좌표 {x} x {y}
  /* slot delete */
  deleteSlot: "Delete image slot…", // 이미지 슬롯 삭제…
  deleteSlotTitle: "Delete this image slot?", // 이미지 슬롯을 삭제할까요?
  deleteSlotDescription: "The slot and its entire history will be deleted.", // 슬롯과 모든 슬롯의 히스토리가 삭제됩니다.
  deleteSlotIrreversible: "This cannot be undone.", // 삭제 후에는 되돌릴 수 없습니다.
  deleteSlotSummary: "{n} images · generation round {r}", // (port) 이미지 {n}장 · {r}회차
  deleteSlotLast: "This is the last image slot of the round.", // (port)
  deleting: "Deleting…", // 삭제 중…
  slotDeleted: "Slot deleted · registrations cleaned {removed} · kept (shared) {shared} · kept (unverifiable) {unknown} · cleanup failed {failed}", // 슬롯 삭제 완료 · 등록 정리 {removed} · 공유 보존 {shared} · 확인 불가 보존 {unknown} · 정리 실패 {failed}
  slotDeletedPartial: "Slot deleted but some image registration cleanup failed.", // 슬롯은 삭제됐지만 일부 이미지 등록 정리가 실패했습니다.
  /* mobile */
  tools: "Zoomed image tools", // 확대 이미지 도구
  dockImages: "Images", // 이미지
  dockLog: "Log", // 기록
  dockPrompt: "Prompt", // 프롬프트
  dockSettings: "Settings", // 설정
  closePanel: "Close panel", // 패널 닫기
  /* chat state */
  chatState: "Accumulated state of the current chat", // 현재 채팅의 누적 상태
  chatStateShort: "Chat state", // (port) 채팅 상태
  loadingState: "Loading state", // 상태 불러오는 중
  refreshState: "Refresh state", // 상태 새로고침
  refresh: "Refresh", // 새로고침
  clearActor: "Clear {actor}", // (port) {actor} 상태 지우기
  clearAll: "Clear all state", // (port) 모든 상태 지우기
  clearConfirm: "Clear the accumulated state?", // (port)
  clearConfirmDescription: "Stored tags are removed from this chat. New replies can add them again.", // (port)
  stateEmpty: "No state stored for this chat yet.", // (port) 저장된 상태가 없습니다.
  groupCum: "Fluid location", // 사정 위치
  groupInjury: "Injury", // 부상
  stateCount: "{n} turns", // (port)
  /* errors */
  noTarget: "The image slot no longer exists.", // (port)
  regenerateFailed: "Image regeneration failed", // 이미지 재생성 실패
  deleteFailed: "Could not delete the image", // (port) 이미지 삭제 실패
  saveDraftFailed: "Could not save the edit", // (port) 편집 저장 실패
  busyOther: "Another image operation is running." // 다른 이미지 작업이 진행 중입니다.
} as const;

/** AI prompt edit panel (spec/ui.md §5.4.3). */
export const AI_EDIT_LABELS = {
  panel: "AI prompt edit", // (port) AI 프롬프트 수정
  resize: "Resize AI edit panel height", // AI 편집 패널 높이 조절
  submit: "Create revision", // 수정안 만들기
  submitMobile: "Edit and generate", // 수정해서 생성
  context: "AI edit context", // AI 수정 컨텍스트
  currentSeed: "Current seed {seed}", // 현재 시드 {seed}
  fix: "Fix", // 고정
  fixTitle: "Keep the current seed on regeneration", // 재생성시 현재 시드 고정
  i2i: "i2i", // i2i
  i2iTitle: "When on, the current image is used as the NovelAI i2i source.", // 켜면 현재 이미지를 NovelAI i2i 원본으로 사용합니다.
  i2iSettings: "Strength {s} Noise {n}", // Strength {s} Noise {n}
  i2iSettingsAria: "i2i settings, Strength {s}, Noise {n}", // i2i 설정, …
  i2iSettingsTitle: "Adjust i2i Strength and Noise", // i2i Strength와 Noise 조절
  i2iOnlyNovelAI: "i2i is available for NovelAI images.", // i2i는 NovelAI 이미지에서 사용할 수 있습니다.
  strength: "Strength", // Strength
  noise: "Noise", // Noise
  close: "Close AI edit", // AI 수정 닫기
  placeholder: "Enter what to change", // 수정할 내용을 입력하세요
  placeholderMobile: "How should it change?", // 어떻게 바꿀까요?
  instruction: "AI prompt edit request", // AI 프롬프트 수정 요청
  mentions: "Active character names", // 활성 캐릭터 이름
  mentionHint: "Type $ to insert a character name", // (port) $로 캐릭터 이름 넣기
  requesting: "Creating revision…", // (port) 수정안 만드는 중…
  emptyInstruction: "Enter what to change.", // 수정할 내용을 입력하세요.
  tooLong: "The AI image edit request must be 2,000 characters or less.", // AI 이미지 수정 요청은 2,000자 이하여야 합니다.
  failed: "AI prompt edit failed", // (port) AI 프롬프트 수정 실패
  options: "Options", // 옵션
  hideOptions: "Hide options", // 옵션 접기
  seedFixed: "Seed fixed", // Seed 고정
  seedRandom: "Seed random", // Seed 랜덤
  i2iOn: "i2i on", // i2i 켜짐
  i2iOff: "i2i off", // i2i 꺼짐
  i2iMobile: "Edit based on the current image (i2i)", // 현재 이미지를 바탕으로 수정 (i2i)
  hideKeyboard: "Hide keyboard" // 키보드 내리기
} as const;

export const AI_EDIT_MAX_LENGTH = 2000;
export const MENTION_MAX_QUERY = 40;
