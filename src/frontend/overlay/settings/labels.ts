/**
 * English labels of the settings pages (Asset Maid 0.9.88 settings area, spec/ui.md §4).
 * Korean originals are in the trailing comments (see extract/ui/labels.json) so a Korean locale can be added later.
 * Keep every settings label in this module.
 */
import type { AnalysisKind, JobStatus } from "../../../shared/contract/rpc.js";

/** Shared frame / save controls (`axt` header 143521, `gxt` 145470). */
export const COMMON_LABELS = {
  saveChanges: "Save setting changes", // 설정 변경 저장
  unsavedChanges: "Unsaved setting changes", // 저장되지 않은 설정 변경 있음
  saveFailed: (message: string) => `Settings save failed: ${message}`, // 설정 저장 실패: …
  saved: "Settings saved.",
  loading: "Loading settings", // (sr-only)
  loadFailed: "Could not load the settings.",
  reload: "Reload", // 다시 불러오기
  selected: "Selected", // 선택됨
  cancel: "Cancel", // 취소
  add: "Add", // 추가
  edit: "Edit", // 편집
  save: "Save", // 저장
  delete: "Delete", // 삭제
  close: "Close", // 닫기
  copy: "Copy",
  copied: "Copied", // 복사 완료
  later: "Later",
  notAvailableYet: "Not available yet in Inlay Illustrator.",
  seconds: (n: number) => `${n}s`, // N초
  times: (n: number) => `${n}×`, // N회
  defaultOption: "Default", // 기본값
  noCharacter: "Open a chat or pick a character in the rail to edit its settings.",
  connectionDefault: "Lumiverse default connection",
  connectionModel: (model: string) => (model ? `Connection model (${model})` : "Connection model"),
  existingValue: (value: string) => `${value} (existing setting)` // (기존 설정)
} as const;

/** Page titles (`C0t` 143549, `Fwe` 145639). */
export const PAGE_TITLES = {
  "analysis-profile": "Analysis settings", // 분석설정
  charx: "Current character settings", // 현재 charx 설정
  "all-charx": "All characters settings", // 전체 charx 설정
  model: "Model settings", // 모델설정
  "image-model": "Image generation model settings", // 이미지 생성 모델 설정
  system: "System settings", // 시스템설정
  logs: "Run logs" // 실행 로그
} as const;

/* ---------------------------------------------------------------------------------------------- */
/* Analysis settings (`R0t` 141557, `jwe` 141579, `Nwe` 141681)                                   */
/* ---------------------------------------------------------------------------------------------- */

export const ANALYSIS_LABELS = {
  profileGroup: "NovelAI analysis method", // NovelAI 분석 방식
  profiles: {
    "v5-hybrid": { label: "Asset Maid V5", description: "Builds the scene flexibly by combining natural language and tags." }, // 에셋 메이드 V5 / 자연어와 태그를 결합해 장면을 유연하게 구성합니다.
    "v4-5": { label: "Asset Maid V4.5", description: "Makes predictable results with verified presets." } // 에셋 메이드 V4.5 / 검증된 프리셋으로 예측 가능한 결과를 만듭니다.
  },
  sceneTitle: "Scene direction guide", // 장면 연출 지침
  imageRatioTitle: "Image ratio decision guide", // 이미지 비율 결정 지침
  selection: (title: string) => `${title} selection`, // `${title}` 선택
  addPreset: "Add preset", // 프리셋 추가
  addPresetAria: (title: string) => `${title} add preset`, // ${title} 프리셋 추가
  editPreset: "Edit preset", // 프리셋 편집
  editPresetAria: (name: string) => `${name} edit`, // ${name} 편집
  deletePreset: "Delete preset", // 프리셋 삭제
  confirmDeletePreset: "Confirm preset delete", // 프리셋 삭제 확인
  confirmDelete: "Confirm delete", // 삭제 확인
  deleteAria: (name: string) => `${name} delete`, // ${name} 삭제
  presetName: (title: string) => `${title} preset name`, // ${title} 프리셋 이름
  cancelEdit: "Cancel editing", // 편집 취소
  savePreset: "Save preset", // 프리셋 저장
  saveCustomInstruction: "Save custom instruction", // 커스텀 지침 저장
  newPreset: "New preset", // 새 프리셋
  customInstruction: "Preset custom instruction", // 프리셋 커스텀 지침
  customInstructionPlaceholder: "Enter the custom instruction to apply to the selected preset.", // 선택한 프리셋에 적용할 커스텀 지침을 입력하세요.
  presetOptions: "Preset options", // 프리셋 옵션
  countGroup: (label: string) => `${label} count`, // ${label} 수
  decrease: (label: string) => `${label} decrease`, // ${label} 감소
  increase: (label: string) => `${label} increase`, // ${label} 증가
  sizeCandidates: "Analyzer image size candidates", // Analyzer 이미지 크기 후보
  sizeHelpBefore: "Only checked sizes are used as image ratio candidates. Write instructions in the form", // 체크한 크기만 이미지 비율 선택 후보로 사용합니다. 지침은
  sizeHelpAfter: ".", // 형태로 작성하세요.
  /** Built-in preset button labels (`N0t` + data names). */
  builtInNames: {
    "scene-default": "Illustration", // 삽화
    "scene-comic": "Comic", // 만화 (preset name 카툰 연출)
    "scene-pov": "POV direction", // pov 연출
    "scene-ensemble": "Multi-character direction", // 다인 연출
    "image-ratio-default": "Default", // 기본
    "image-ratio-unspecified": "Unspecified" // 미지정
  } as Record<string, string>,
  /** Read-only descriptions of built-in presets (`TH` 141517). */
  builtInDescriptions: {
    "scene-default": "AI applies free, varied staging that follows the flow of the scene.", // 장면의 흐름에 맞춰 AI가 자유롭고 다양한 연출을 적용합니다.
    "scene-comic": "Splits one scene into several comic panels and stages the characters' actions and emotions vividly across the panels.", // 하나의 장면을 여러 만화 컷으로 구성하고, …
    "scene-pov": "Stages the scene in first person from the persona's view. The viewpoint stays with the persona even when other people appear.", // 페르소나의 시야를 기준으로 …
    "scene-ensemble": "Places the people who really take part in the scene together in one image where possible, and focuses on their relations and interaction.", // 현재 장면에 실제로 참여하는 인물들을 …
    "image-ratio-unspecified": "Picks the size that best fits the scene from the selected sizeId candidates, with no aspect-ratio preference." // 별도 비율 선호 없이 …
  } as Record<string, string>,
  /** Scene control labels (`ek`). */
  controls: {
    "comic.speech-bubble": "Speech bubbles", // 말풍선
    "comic.landscape": "Landscape", // 가로형
    "comic.minimum-panels": "Minimum panels" // 최소 컷
  } as Record<string, string>
} as const;

/* ---------------------------------------------------------------------------------------------- */
/* Current / all characters settings (`Fwe` 145511, `uxt` 144904, `mxt` 145084, `pxt`, `fxt`)       */
/* ---------------------------------------------------------------------------------------------- */

export const CHARX_LABELS = {
  allTitle: "All characters settings", // 전체 charx 설정
  charxTitle: "Character settings", // charx 설정
  resetAll: "Reset all per-character settings", // 모든 charx 개별 설정 초기화
  resetCurrent: "Reset current character settings", // 현재 charx 설정 초기화
  promptUnsaved: "Unsaved settings prompt changes", // 저장되지 않은 설정 프롬프트 변경 있음
  promptSaveFailed: (message: string) => `Settings prompt save failed: ${message}`, // 설정 프롬프트 저장 실패: …
  promptSave: "Save settings prompt", // 설정 프롬프트 저장
  promptSaveRetry: "Retry settings prompt save", // 설정 프롬프트 저장 재시도
  scopeAllNote: "These values apply to every character. An edit here replaces the per-character value of that field.",
  scopeCharxNote: "These values apply to this character only. Fields marked \"Custom\" differ from the all-characters value.",
  overrideBadge: "Custom", // (port) per-character value differs from all-characters
  overrideBadgeTitle: "This character uses its own value for this setting.",
  generationRules: "Generation rules", // 생성 규칙
  freeCharacter: { title: "Free character generation", description: "Creates appearance and default outfit for unregistered characters and adds them to the current character." }, // 인물 자유생성
  freeOutfit: { title: "Free outfit generation", description: "If no matching outfit exists, creates a new outfit and adds it to the current character." }, // 의상 자유생성
  stateAccumulation: { title: "State accumulation", description: "Carries character state into the next generation. When off, saved states are kept." }, // 상태 누적
  nsfwAlways: { title: "Always add NSFW", description: "Adds nsfw in front of every generation prompt." }, // NSFW 항상 추가
  analysisOutput: "Analysis & output", // 분석·출력
  rosterSelection: { title: "Roster pre-selection", description: "JEV pre-filters the characters and passes them to analysis. Recommended when many characters are registered. (JEV is not available yet.)" }, // 로스터 사전 선정
  fixedResolution: { title: "Fixed resolution", description: "Fixes the generated image resolution to the selected size." }, // 고정 해상도
  fixedResolutionSelect: "Select fixed resolution", // 고정 해상도 선택
  fixedResolutionUse: "Use fixed resolution", // 고정 해상도 사용
  customSize: "Custom", // 커스텀
  sizeLabel: (kind: "square" | "landscape" | "portrait", width: number, height: number) =>
    `${kind === "square" ? "Square" : kind === "landscape" ? "Landscape" : "Portrait"} ${width} × ${height}`, // 정사각형/가로/세로 W × H
  aiChoice: { title: "Character coordinates AI Choice", description: "Lets NovelAI decide character coordinates automatically." }, // 캐릭터 좌표 AI Choice
  nativeAssets: { title: "Show existing character assets", description: "Hides or shows the existing character images in chat." }, // 기존 charx 에셋 표시
  hide: "Hide", // 숨김
  show: "Show", // 표시
  commonPrompts: "Common prompts", // 공통 프롬프트
  animaPrompts: "Anima prompts", // Anima 프롬프트
  fixedPositive: "Fixed positive prompt", // 고정 긍정 프롬프트
  negative: "Negative prompt", // 네거티브 프롬프트
  charxAnalysis: "Character analysis", // charx 분석
  metadataCheck: { title: "Asset metadata check", description: "Only checks whether the original assets have NovelAI metadata." }, // 에셋 메타 확인
  metadataStates: { none: "None", partial: "Partial", available: "Present", deleted: "Deleted", unknown: "Not analyzed" }, // 없음 / 부분 / 있음 / 삭제됨 / 미분석
  deleteMetadataInline: "Delete current character metadata check record", // 현재 charx 메타 확인 기록 삭제
  deleteMetadataTitle: "Delete metadata check record", // 메타 확인 기록 삭제
  assetClassification: { title: "Asset classification", description: "Finds per-character asset candidates from lorebook content and file names." }, // 에셋 분류
  assetClassificationTitle: "Reclassifies lorebooks and asset candidates.", // 로어북과 에셋 후보를 다시 분류합니다.
  regex: { title: "Character asset regex", description: "Manages regexes that let the plugin recognize image notation in chat." }, // charx 에셋 정규식
  regexAnalyzeTitle: "Finds the chat image notation regex.", // 채팅 이미지 표기 정규식을 찾습니다.
  regexAdd: "Add regex entry", // 정규식 항목 추가
  regexInput: "Character asset regex", // charx 에셋 정규식
  regexEmpty: "No analyzed or added regexes.", // 분석되거나 추가된 정규식이 없습니다.
  regexLater: "Regex analysis and editing are not available yet in Inlay Illustrator.",
  analyze: "Analyze", // 분석
  stop: "Stop", // 중지
  stopAnalysis: "Stop analysis", // 분석 중지
  dataManagement: "Data management", // 데이터 관리
  metadataRecord: { title: "Metadata check record", description: "Keeps the original metadata and deletes only the check record and cache." }, // 메타 확인 기록
  recordPresent: "Record present", // 기록 있음
  noRecord: "No record", // 기록 없음
  resetCharacter: { title: "Reset current character", description: "Keeps chat and zoom images and resets settings and analysis records." }, // 현재 charx 초기화
  reset: "Reset", // 초기화
  resetConfirmTitle: "Reset current character", // 현재 charx 초기화
  resetConfirmDescription: "Keeps chat and zoom images, and resets this character's Asset Maid settings and analysis records. This cannot be undone.", // 채팅과 확대 이미지는 유지하고, …
  resetConfirmButton: "Reset character", // charx 초기화
  resetDone: "Character data was reset.",
  resetFailed: (message: string) => `Character reset failed: ${message}`, // charx 초기화 실패: …
  metadataDeleteFailed: (message: string) => `Metadata check record delete failed: ${message}`, // 메타 확인 기록 삭제 실패: …
  disabledInAll: "Available in the current character settings."
} as const;

/* ---------------------------------------------------------------------------------------------- */
/* Model settings (`axt` model panel 143574, `K0t` message test 142288)                            */
/* ---------------------------------------------------------------------------------------------- */

export const MODEL_LABELS = {
  connectionSection: "Analyzer connection",
  connection: "Connection profile", // (port) replaces 제공자 / 요청 URL / API 키
  connectionAria: "Main model connection profile", // 메인 모델 제공자
  connectionHint: "Asset Maid analysis uses a Lumiverse connection profile. Provider, URL and API key are set in Lumiverse.",
  noConnections: "No Lumiverse connection profiles found.",
  model: "Model", // 모델
  modelAria: "Select model", // 공식 모델 선택
  modelsLoading: "Loading the model list…",
  modelsFailed: "Could not load the model list. The saved model is kept.",
  temperature: "Temperature", // 온도
  reasoning: "Reasoning", // 추론
  reasoningAria: "Reasoning mode", // 추론 모드
  reasoningModes: { inherit: "Server default", off: "Off (None)", custom: "On" }, // 서버 기본값 / 사용 안 함 (None) / 사용
  effort: "Reasoning effort", // 추론 강도
  efforts: { minimal: "Minimal", low: "Low", medium: "Medium", high: "High", xhigh: "Very high", max: "Max" }, // 최소 낮음 중간 높음 매우 높음 최대
  timeout: "Timeout ms", // 타임아웃 ms
  maxTokens: "Max output tokens",
  maxTokensHint: "0 = provider default",
  jsonMode: "JSON mode",
  jsonModeHint: "Ask the provider for JSON output when it supports it.",
  vision: "Image input",
  visions: { auto: "Detect automatically", supported: "Supported", unsupported: "Not supported" },
  messageTest: "Message test", // 메시지 테스트
  resetTest: "Reset test", // 테스트 초기화
  send: "Send message", // 메시지 전송
  stopSend: "Stop sending", // 전송 중지
  testMessage: "Test message", // 테스트 메시지
  testPlaceholder: "Enter a message to test.", // 테스트할 메시지를 입력하세요.
  testDefault: "Hello. Please give a short greeting.", // 안녕하세요. 짧게 인사해 주세요.
  testResult: "Test result", // 테스트 결과
  modelAnswer: "Model answer", // 모델 답변
  waiting: "Waiting for a response.", // 응답을 기다리고 있습니다.
  done: (seconds: string) => `Response complete · ${seconds}s`, // 응답 완료 · x.xx초
  cancelled: "Request cancelled.", // 요청을 취소했습니다.
  sendFailed: "Could not send the message. Check the connection and model settings.", // 메시지를 전송하지 못했습니다. …
  emptyMessage: "Enter a message to test.", // 테스트할 메시지를 입력하세요.
  draftNote: "The test uses your unsaved changes.",
  savedOnlyNote: "The test uses the saved settings. Save your changes first.",
  copyAnswer: "Copy answer", // 답변 복사
  copiedAnswer: "Copied.", // 복사했습니다.
  copyFailed: "Could not copy. Select the answer and copy it manually.", // 복사하지 못했습니다. …
  jev: "JEV",
  jevDescription: "Connection for roster pre-selection · enable it in character settings", // 로스터 사전 선정용 연결 · 사용 여부는 charx 설정에서 지정
  jevModel: "Model", // 모델
  jevLater: "The TypeSafe JEV pre-selection is not available yet. It may be added later."
} as const;

/* ---------------------------------------------------------------------------------------------- */
/* Image generation model settings (`axt` image-model panel 144098)                                */
/* ---------------------------------------------------------------------------------------------- */

export const IMAGE_LABELS = {
  connectionGroup: "Image generation model", // 이미지 생성 모델
  connection: "Image generation connection",
  connectionHint: "Images are made through a Lumiverse image generation connection. API key and URL are set in Lumiverse.",
  noConnections: "No Lumiverse image generation connections found.",
  providerKinds: {
    novelai: { label: "NovelAI", description: "Generates images with NovelAI through Lumiverse." }, // Novel Ai / NovelAI API로 이미지를 직접 생성합니다.
    "comfy-ui": { label: "ComfyUI", description: "Generates images with a ComfyUI workflow through Lumiverse." }, // Comfy UI / 로컬 Comfy UI 워크플로로 이미지를 생성합니다.
    generic: { label: "Other provider", description: "Generates images with the connection's provider. Reference images are not used." }
  },
  promptFormat: "Prompt format",
  codecs: { "novelai-structured": "NovelAI structured prompts", "anima-flat": "Anima flat prompts" },
  model: "Model", // NovelAI 모델
  modelAria: "Image generation model",
  testConnection: "Check connection", // Comfy UI 연결 확인
  connected: (ms: number) => `Connected · ${ms}ms`, // 연결됨 · Nms
  connectionFailed: "Connection failed", // 연결 실패
  novelaiBox: "NovelAI",
  referenceEnabled: "Enable reference", // 레퍼런스 활성화
  referenceV5Note: "NovelAI V5 models have no character reference.",
  referenceType: "Reference type", // 레퍼런스 타입
  referenceStrength: "Reference strength", // 레퍼런스 강도
  referenceFidelity: "Reference fidelity", // 레퍼런스 충실도
  sampler: "Sampler", // 샘플러
  samplerAria: "NovelAI sampler", // NovelAI 샘플러
  noiseSchedule: "Noise schedule", // 노이즈 스케줄
  noiseScheduleAria: "NovelAI noise schedule", // NovelAI 노이즈 스케줄
  steps: "Steps", // 스텝
  scale: "CFG scale", // CFG 스케일
  cfgRescale: "CFG rescale", // CFG 리스케일
  size: "Default size",
  sizeAria: "Default image size",
  customSize: "Custom", // 커스텀
  qualityToggle: "Quality toggle / Variety+", // 품질 토글 / Variety+
  useOrder: "Use character order", // 캐릭터 순서 사용
  useCoords: "Use coordinates when there are 2+ characters", // 캐릭터가 2명 이상일 때 좌표 사용
  comfyBox: "ComfyUI",
  workflowId: "Workflow id",
  workflowIdHint: "Saved Lumiverse ComfyUI workflow. Empty = the active workflow.",
  workflowIdAria: "ComfyUI workflow id",
  timeout: "Generation timeout", // 생성 제한 시간
  timeoutAria: "Image generation timeout (s)", // Comfy UI 생성 제한 시간(초)
  characterReference: "Enable character reference", // 레퍼런스 활성화
  outfitReference: "Enable outfit reference",
  genericBox: "Provider parameters",
  genericNote: "This provider uses the connection's own parameters. Asset Maid sends a flat prompt and no reference images."
} as const;

/* ---------------------------------------------------------------------------------------------- */
/* System settings (`axt` system panel 144596, `U0t` 142657)                                       */
/* ---------------------------------------------------------------------------------------------- */

export const SYSTEM_LABELS = {
  customSizes: "Custom resolutions", // 커스텀 해상도
  noCustomSizes: "No custom resolutions. Built-in sizes are always available.",
  addSize: "Add custom resolution", // 커스텀 해상도 추가
  sizeWidth: "Custom resolution width", // 커스텀 해상도 가로
  sizeHeight: "Custom resolution height", // 커스텀 해상도 세로
  editSize: "Edit custom resolution", // 커스텀 해상도 편집
  saveSize: "Save custom resolution", // 커스텀 해상도 저장
  deleteSize: "Delete custom resolution", // 커스텀 해상도 삭제
  sizeInvalid: "Enter integers from 64 to 2048 for width and height.", // 가로와 세로에 64~2048 사이의 정수를 입력하세요.
  sizeDuplicate: "This resolution is already registered.", // 이미 등록된 해상도입니다.
  queue: { title: "Sequential image generation queue", description: "Sets the wait time between image generation requests for all image providers." }, // 이미지 생성 순차 큐
  queueAria: "Sequential image generation call interval", // 이미지 생성 순차 호출 간격
  queueDecrease: "1 second less", // 1초 감소
  queueIncrease: "1 second more", // 1초 증가
  retry: { title: "Automatic retry on generation error", description: "Applies to AI generation, message regeneration and AI edit. 0 = no automatic retry." }, // 생성 오류 자동 재시도
  retryAria: "Automatic retry count on generation error", // 생성 오류 자동 재시도 횟수
  retryDecrease: "1 automatic retry less", // 자동 재시도 1회 감소
  retryIncrease: "1 automatic retry more", // 자동 재시도 1회 증가
  chatImageSize: { title: "Chat image size", description: "Sets the chat image width as a ratio of the message area." }, // 채팅 이미지 크기
  floatingCount: { title: "Floating count button", description: "Press and drag the count button to move it. Click it to open its settings." }, // 플로팅 장수 버튼
  resetPosition: "Reset position", // 위치 초기화
  floatingCountUse: "Use floating count button", // 플로팅 장수 버튼 사용
  popupProtection: { title: "Block clicks behind popups", description: "Off by default on iOS/iPadOS. If off, images behind a popup can get selected." }, // 팝업 뒤 클릭 방지
  popupProtectionUse: "Use click blocking behind popups", // 팝업 뒤 클릭 방지 사용
  nsfw: { title: "Always add NSFW", description: "Same value as the all-characters setting. Adds nsfw in front of every generation prompt." },
  developerMode: { title: "Developer mode", description: "Shows the run logs and the analysis button in the zoom UI." }, // 개발자 모드 / 확대 UI에 분석 버튼을 표시합니다.
  developerModeArea: "Developer mode settings area", // 개발자 모드 설정 영역
  developerModeUse: "Use developer mode", // 개발자 모드 사용
  developerModeEnabled: "Developer mode enabled.",
  developerModeDisabled: "Developer mode disabled.",
  chatImages: "Chat image generation",
  autoGeneration: { title: "Automatic generation", description: "Generates illustrations when an AI reply finishes." },
  countMode: { title: "Image count", description: "Number of illustrations per message." },
  countModes: { fixed: "Fixed", range: "Range" },
  count: "Image count",
  countDecrease: "1 image less",
  countIncrease: "1 image more",
  countMin: "Minimum count",
  countMax: "Maximum count",
  analysisMode: { title: "Analysis mode", description: "Split analysis plans a total count and analyses it in batches (Asset Maid V5)." },
  analysisModes: { single: "Single", split: "Split" },
  splitTotal: "Total count",
  splitBatch: "Batch size",
  dangerZone: "Reset",
  factoryReset: { title: "Factory reset", description: "Deletes all Inlay Illustrator settings and character data. Chats and generated images stay." },
  factoryResetButton: "Factory reset",
  factoryResetConfirmTitle: "Factory reset",
  factoryResetConfirmDescription: "All Inlay Illustrator settings and Asset Maid data of every character are deleted. Chats and generated images stay. This cannot be undone.",
  factoryResetDone: "All settings were reset."
} as const;

/* ---------------------------------------------------------------------------------------------- */
/* Run logs (`Ywt` 138206)                                                                         */
/* ---------------------------------------------------------------------------------------------- */

export const LOG_LABELS = {
  description: "Shows recent run diagnostics, newest first.", // 최근 실행 진단을 최신순으로 표시합니다.
  keyFilter: "Log key filter", // 로그 키 필터
  keyPrefix: "Key", // 키
  levelFilter: "Log level filter",
  levelPrefix: "Level",
  all: (count: number) => `All (${count})`, // 전체 (N)
  allLevels: "All levels",
  copyFiltered: "Copy filtered results", // 필터 결과 복사
  clear: "Clear log", // 로그 비우기
  entryCopy: (scope: string) => `${scope} copy from this log to the latest`, // ${type} 로그부터 최신 로그까지 복사
  entryCopyTitle: "Copy from this log to the latest", // 이 로그부터 최신 로그까지 복사
  details: "Detail data", // 상세 데이터
  loadFailed: (message: string) => `Log load failed: ${message}`, // 로그 불러오기 실패: …
  loading: "Loading log", // 로그 불러오는 중
  empty: "No saved run logs", // 저장된 실행 로그가 없습니다
  filteredEmpty: "No logs for the selected filter", // 선택한 필터의 로그가 없습니다
  noMessage: "(no message)", // (message 없음)
  levels: { debug: "Debug", info: "Info", warn: "Warning", error: "Error" },
  /** Scope labels (`nwe` 138071). Unknown scopes show the raw key. */
  scopes: {
    general: "Other", // 기타
    "asset-selection-persistence": "Asset selection save", // 에셋 선택 저장
    "ai-analysis": "AI analysis", // AI 분석
    "chat-lifecycle": "Chat response", // 채팅 응답
    "chat-image": "Chat image", // 채팅 이미지
    "comfyui-request": "ComfyUI request" // ComfyUI 요청
  } as Record<string, string>
} as const;

/* ---------------------------------------------------------------------------------------------- */
/* Analyzer error notices (`_xt` 145828 -> modal `ape` 96220)                                       */
/* ---------------------------------------------------------------------------------------------- */

export const ANALYZER_ERROR_LABELS = {
  eyebrow: "Analyzer",
  fallbackTitle: "AI analysis error", // AI 분석 오류
  close: "Close error modal", // 오류 모달 닫기
  description: "Check the error and try again.", // 오류 내용을 확인하고 다시 시도하세요.
  details: "Error details", // 세부 오류
  unknown: "Unknown AI analysis error.", // 알 수 없는 AI 분석 오류입니다.
  closeButton: "Close", // 닫기
  titles: {
    "asset-matching": "Asset & character matching error", // 에셋&캐릭터 매칭 오류
    "character-prompts": "Character prompt analysis error", // 캐릭터 프롬프트 분석 오류
    persona: "Persona prompt analysis error", // Persona 프롬프트 분석 오류
    references: "Reference analysis error", // 레퍼런스 분석 오류
    "artist-extraction": "Artist prompt extraction error", // 작가 프롬프트 추출 오류
    "metadata-check": "Asset metadata check error",
    reclassification: "AI reclassification error",
    "unique-tag-search": "Unique tag search error",
    "representative-pick": "Representative image error"
  } as Record<AnalysisKind, string>,
  /** Statuses that open the modal (AM skips idle, running and cancelled). */
  errorStatuses: ["error"] as JobStatus[]
} as const;
