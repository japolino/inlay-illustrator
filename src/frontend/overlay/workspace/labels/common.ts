/**
 * English labels shared by the workspace tabs (form editor, base prompt editor, outfits, outfit generation,
 * asset picker, crop dialog, metadata inspector, analysis toasts). Korean originals from Asset Maid in comments
 * (spec/ui.md §2 and §3; extract/ui/labels.json). Keep every shared workspace label here.
 */
export const COMMON_LABELS = {
  analyze: "Analyze", // 분석
  reference: "Reference", // 레퍼런스
  active: "Active", // 활성
  negative: "Negative", // 네거티브
  close: "Close", // 닫기
  cancel: "Cancel", // 취소
  save: "Save", // 저장
  delete: "Delete", // 삭제
  edit: "Edit", // 편집
  zoom: "Zoom", // 확대
  zoomImage: "Zoom image", // 이미지 확대
  zoomOf: (name: string) => `Zoom ${name}`, // ${name} 확대
  crop: "Crop", // 크롭
  cropOf: (name: string) => `Crop ${name}`, // ${name} 크롭
  selectReference: "Select reference", // 레퍼런스 선택
  selectReferenceOf: (name: string) => `Select reference for ${name}`, // ${name} 레퍼런스 선택
  aiGenerated: "AI generated", // AI 생성
  generating: "Generating", // 생성 중
  retry: "Retry", // 재시도
  defaultBadge: "Default", // 기본
  loading: "Loading…",
  noSearchResults: "No search results.", // 검색 결과가 없습니다.
  notTextApplied: "Not applied to body analysis", // 본문 분석에는 적용되지 않습니다
  unsavedChanges: (label: string) => `${label} · has unsaved changes`, // ${n} · 저장되지 않은 변경 있음
  savingLabel: (label: string) => `${label} in progress`, // ${n} 중
  retrySave: (label: string, error: string) => `${label} retry: ${error}`, // ${n} 다시 시도: ${r}
  saveConflict: "The data changed elsewhere. Your edits are kept; save again to overwrite.",
  savedNotice: "Saved.",
  maidLibraryUnavailable: "Maid Library is not available in Inlay Illustrator." // (port: community sharing dropped)
} as const;

/** Evidence mode toggle (`rce` 62139, options `I$` 62134). */
export const EVIDENCE_LABELS = {
  group: "Analysis input", // 분석 입력
  image: { label: "Image", title: "Recommended · image first · falls back to meta·body if unavailable" }, // 이미지 / 권장 · 이미지 우선 · 사용할 수 없으면 메타·본문
  metadata: { label: "Meta", title: "Meta first · else image·body" }, // 메타 / 메타 우선 · 없으면 이미지·본문
  text: { label: "Body", title: "Lorebook body only" } // 본문 / 로어북 본문만 사용
} as const;

export const GENDER_LABELS = {
  group: "Gender", // 성별
  characterGender: "Character gender", // 캐릭터 성별
  personaGender: "Persona gender", // 페르소나 성별
  female: "Female", // 여성
  male: "Male", // 남성
  unknown: "Unset", // 미선택
  unknownShort: "Unknown" // 미상
} as const;

export const RATING_LABELS = { group: "Content rating", sfw: "SFW", nsfw: "NSFW" } as const; // 콘텐츠 등급

/** Form header / editor (`Ape` 97382, `kpe` 97323). */
export const FORM_LABELS = {
  select: "Form select", // 폼 선택
  prefix: "Form :", // 폼 :
  defaultTitle: (label: string) => `Default form · ${label}`, // 기본 폼 · ${label}
  humanlike: "Humanlike", // 인간형
  freeform: "Free-form", // 자유형
  outfitsCount: (n: number) => `Outfits ${n}`, // 의상 ${n}
  actions: "Form actions", // 폼 작업
  setDefault: "Set as default", // 기본으로 지정
  deleteForm: "Delete form", // 폼 삭제
  deleteConfirm: (n: number) => `Delete ${n} outfits`, // 의상 ${n}개 삭제
  deleteConfirmAria: (n: number) => `Confirm deleting the form and ${n} outfits`, // 폼과 의상 ${n}개 삭제 확인
  deleteConfirmTitle: (n: number) => `${n} child outfits are deleted too`, // 하위 의상 ${n}개도 함께 삭제됩니다
  editForm: "Edit form", // 폼 편집
  addForm: "Add form", // 폼 추가
  editTitle: (label: string) => `${label} edit`, // ${label} 편집
  name: "Form name", // 폼 이름
  humanlikeTitle: "Applies humanlike pose·body crop·outfit grammar to this form", // 사람형 자세·신체 크롭·의상 문법을 이 폼에 적용합니다
  description: "Form description", // 폼 설명
  descriptionPlaceholder: "Description (optional)", // 설명 (선택)
  defaultFormLabel: "Basic", // 기본
  formN: (n: string) => `Form ${n}`, // 폼 ${n}
  resetPrompts: "Reset main and negative prompt", // 메인 및 네거티브 프롬프트 초기화
  negativeCaption: "Negative" // 네거티브
} as const;

/** Structured base prompt editor (`IT` 95437, `Fat` 95568). */
export const BASE_PROMPT_LABELS = {
  section: "Structured character base prompt", // 구조화 캐릭터 베이스 프롬프트
  nav: "Base prompt groups", // 베이스 프롬프트 그룹
  combined: "Combined base prompt", // 종합 베이스 프롬프트
  groupPrompt: (group: string) => `${group} prompt`, // ${group} 프롬프트
  none: "None", // 선택 안 함
  breastMaleTitle: "Breast size is not edited for male forms", // 남성 폼에서는 가슴 크기를 편집하지 않습니다
  tagPlaceholder: "tag, tag", // 태그, 태그
  groups: {
    final: "Combined", // 종합
    identity: "Identity", // 고유
    hair: "Hair", // 머리
    eyes: "Eyes", // 눈
    breast: "Breast", // 가슴
    other: "Other" // 기타
  } as Record<string, string>,
  fields: {
    "identity.character_tag": { label: "Character tag", placeholder: "e.g. hatsune miku" }, // 캐릭터 태그 / 예: hatsune miku
    "hair.color": { label: "Color", placeholder: "e.g. black hair" }, // 색
    "hair.length": { label: "Length", placeholder: "Select hair length" }, // 길이 / 머리 길이 선택
    "hair.style": { label: "Style", placeholder: "e.g. ponytail" }, // 스타일
    "head.other": { label: "Other", placeholder: "e.g. horns, animal ears" }, // 기타
    "eyes.color": { label: "Color", placeholder: "e.g. blue eyes" }, // 색
    "eyes.structure": { label: "Shape", placeholder: "e.g. slit pupils" }, // 형태
    "body.breast_size": { label: "Size", placeholder: "Select breast size" }, // 크기 / 가슴 크기 선택
    "body.skin": { label: "Skin", placeholder: "e.g. dark skin" }, // 피부
    "body.build": { label: "Build", placeholder: "e.g. muscular female" }, // 체형
    "body.proportions": { label: "Proportions", placeholder: "e.g. wide hips" }, // 비율
    "marks.distinctive": { label: "Body marks", placeholder: "e.g. body tattoo" }, // 신체 표식
    "nonhuman.features": { label: "Other body", placeholder: "e.g. wings, tail" }, // 기타 신체
    custom: { label: "Other prompt", placeholder: "Tags or prompt fragments" } // 기타 프롬프트 / 태그 또는 프롬프트 조각
  } as Record<string, { label: string; placeholder: string }>,
  otherGroupPlaceholder: "skin, build, proportions, marks, wings·tail, other prompt" // 피부, 체형, 비율, 표식, 날개·꼬리, 기타 프롬프트
} as const;

/** Outfit list / rows / dock (`mst`, `ust`, `zit`, `pst`, `Tit`). */
export const OUTFIT_LABELS = {
  panelTitle: "Outfit edit", // 의상 편집
  frameTitle: (title: string) => `Outfit prompts : ${title}`, // 의상 프롬프트 : ${title}
  formFilter: "Outfit form filter", // 의상 폼 필터
  showAll: "Show all", // 전체 표시
  empty: "No outfits registered. Start with the Add outfit button below.", // 등록된 의상이 없습니다. 하단의 의상 추가 버튼으로 시작하세요.
  generate: "Generate outfit", // 의상 생성
  generateOf: (id: string) => `Generate outfit ${id}`, // ${id} 의상 생성
  menu: "Outfit menu", // 의상 메뉴
  promoteRegistered: "Promote to registered outfit", // 등록 의상으로 승격
  promoteRegisteredDisabled: "Can be promoted after generation completes", // 생성 완료 후 승격할 수 있습니다
  promoteDefault: "Promote to default outfit", // 기본 의상으로 승격
  moveForm: "Move to another form", // 다른 폼으로 이동
  moveTo: (label: string) => `Move to ${label}`, // ${label}(으)로 이동
  current: "Current", // 현재
  currentForm: "Current form", // 현재 폼
  noOtherForm: "No other form to move to", // 이동할 다른 폼이 없습니다
  defaultCannotMove: "Default outfit cannot be moved", // 기본 의상은 이동할 수 없습니다
  deleteOutfit: "Delete outfit", // 의상 삭제
  selectReferenceOf: (id: string) => `Select reference for ${id}`, // ${id} 레퍼런스 선택
  name: "Outfit name", // 의상 이름
  description: "Outfit description", // 의상 설명
  parts: { head: "Head", top: "Top", bottom: "Bottom", legs: "Legs", feet: "Feet" } as Record<string, string>, // 머리 상의 하의 다리 발
  savePrompts: "Save prompts", // 프롬프트 저장
  bulkPromote: (n: number) => `Bulk-promote ${n} AI generated outfits`, // AI 생성 의상 ${n}개 일괄 승격
  bulkPromoteTitle: (n: number) => n > 0 ? `Promote ${n} ready AI generated outfits to registered outfits` : "No AI generated outfits to promote", // 준비된 AI 생성 의상 ${n}개를 등록 의상으로 승격 / 승격 가능한 AI 생성 의상이 없습니다
  generateNewTitle: "Generate a new outfit from an empty prompt", // 빈 프롬프트로 새 의상 생성
  selectFormFirst: "Select a form to add an outfit to", // 의상을 추가할 폼을 선택하세요
  addOutfit: "Add outfit", // 의상 추가
  outfitN: (n: number) => `Outfit ${n}`, // 의상 ${n}
  defaultOutfit: "Default outfit" // 기본 의상
} as const;

/** Outfit image generation (`bst`, `yst`, `gst`). */
export const GENERATION_LABELS = {
  panelTitle: "Outfit generation", // 의상 생성
  frameTitle: (title: string) => `Outfit generation: ${title}`, // 의상생성: ${title}
  backToList: "Back to outfit list", // 의상 목록으로 돌아가기
  result: "Outfit generation result", // 의상 생성 결과
  placeholder: "The generated result appears here.", // 생성 결과가 여기에 표시됩니다.
  zoomGenerated: "Zoom generated image", // 생성 이미지 확대
  prompts: "Outfit prompt", // 의상 프롬프트
  info: "Outfit generation info", // 의상 생성 정보
  referenceType: "Reference type", // 레퍼런스 타입
  referenceTypes: { character: "Character", style: "Style", "character&style": "Character + Style" } as Record<string, string>, // 캐릭터 / 스타일 / 캐릭터 + 스타일
  strength: "Strength", // 강도
  fidelity: "Fidelity", // 충실도
  name: "Name", // 이름
  description: "Description", // 설명
  collapseHistory: "Collapse generation history", // 생성 히스토리 접기
  expandHistory: "Expand generation history", // 생성 히스토리 펼치기
  history: "Outfit generation history", // 의상 생성 히스토리
  seedTarget: (seed: string, selected: boolean) => `Seed ${seed} ${selected ? "deselect" : "select"} as save target`, // 시드 ${seed} 저장 대상 선택/해제
  seedTitle: (seed: string) => `Seed ${seed}`,
  saved: "Saved", // 저장됨
  shown: "Shown", // 표시
  replaceSave: "Replace current outfit with selected image", // 선택한 이미지로 현재 의상 대체
  addSave: (n: number) => `Add ${n} selected outfit images`, // 선택한 의상 이미지 ${n}개 추가
  replace: "Replace", // 대체
  replaceTitle: "On: replace current outfit · Off: add new", // 켜면 현재 의상 교체 · 끄면 새로 추가
  selectedN: (n: number) => `Selected ${n}`, // 선택 ${n}
  seedBadge: (seed: string) => `Seed ${seed || "—"}`,
  currentSeed: (seed: string) => `Current seed ${seed}`, // 현재 시드 ${seed}
  noSeed: "No generated seed", // 생성된 시드 없음
  fixed: "Fixed", // 고정
  generateImage: "Generate outfit image", // 의상 이미지 생성
  unsupported: "The selected provider does not support outfit image generation.",
  targetChanged: "Target form or outfit changed; generated result discarded.", // 대상 폼 또는 의상이 변경되어 생성 결과를 폐기했습니다.
  saveAborted: "Target form or outfit changed; save aborted." // 대상 폼 또는 의상이 변경되어 저장을 중단했습니다.
} as const;

/** Asset picker (`Zwe`, `Uxt`, `Lxt`, `$wt`). */
export const PICKER_LABELS = {
  title: {
    selection: (r: string) => `Outfit selection · ${r}`, // 의상 선택 · ${r}
    personaSelection: (r: string) => `Asset selection · ${r}`, // 에셋 선택 · ${r}
    characterReference: (r: string) => `Reference : ${r}`, // 레퍼런스 : ${r}
    outfitReference: (r: string) => `Outfit reference : ${r}`, // 의상 레퍼런스 : ${r}
    personaReference: (r: string) => `Persona reference : ${r}`, // 페르소나 레퍼런스 : ${r}
    personaOutfitReference: (r: string) => `Persona outfit reference : ${r}`, // 페르소나 의상 레퍼런스 : ${r}
    artist: "Select artist image" // 작가 이미지 선택
  },
  paneTitle: {
    selection: "Asset select", // 에셋 선택
    characterReference: "Select character reference", // 캐릭터 레퍼런스 선택
    outfitReference: "Select outfit reference", // 의상 레퍼런스 선택
    personaReference: "Select persona reference", // 페르소나 레퍼런스 선택
    personaOutfitReference: "Select persona outfit reference", // 페르소나 의상 레퍼런스 선택
    artist: "Select artist image" // 작가 이미지 선택
  },
  count: (n: number) => `${n} items`, // ${n}개
  filters: { all: "All", candidate: "Candidates", chat: "Chat", outfit: "Outfit", original: "Original", generated: "Generated" } as Record<string, string>, // 전체 후보 채팅 의상 원본 생성
  filterGroup: "Asset filter",
  hasMeta: "Has meta", // 메타 있음
  calculating: "Calculating candidate assets.", // 후보 에셋을 계산하고 있습니다.
  empty: "No images to display.", // 표시할 이미지가 없습니다.
  select: (name: string) => `Select ${name}`, // ${name} 선택
  deselect: (name: string) => `Deselect ${name}`, // ${name} 선택 해제
  classify: "Asset classification", // 에셋 분류
  stopClassify: "Stop asset classification", // 에셋 분류 중지
  classifyTitle: "Re-classify lorebooks and asset candidates.", // 로어북과 에셋 후보를 다시 분류합니다.
  keys: "Recognition keys", // 인식키
  keysOpen: "Open recognition keys", // 인식키 열기
  keysClose: "Close recognition keys", // 인식키 닫기
  noLorebook: "No lorebook selected", // 선택한 로어북이 없습니다
  metaCheck: "Meta check", // 메타 확인
  stopMetaCheck: "Stop meta check", // 메타 확인 중지
  cropReference: "Reference crop", // 레퍼런스 크롭
  outfitDone: "Outfit reference selection complete", // 의상 레퍼런스 선택 완료
  backPrevious: "Back to previous workspace", // 이전 작업영역으로 돌아가기
  closeWorkspace: "Close workspace", // 작업영역 닫기
  upload: "Upload image",
  uploadFailed: "Could not upload the image.",
  loadMore: "Load more",
  keyManager: "Asset classification key management", // 에셋 분류 키 관리
  keyHelp1: "Asset classification keys are plugin-only keys that link characters to original assets.", // 에셋 분류 키는 캐릭터와 원본 에셋을 연결하는 플러그인 전용 키입니다.
  keyHelp2: "If AI analysis is not possible or you want to classify manually, edit keys based on asset file names.", // AI 분석이 불가하거나 직접 분류하려면 에셋 파일명을 기준으로 키를 편집하세요.
  keyCancel: "Cancel matching key edit", // 매칭 키 편집 취소
  keySave: "Save matching keys", // 매칭 키 저장
  keyField: (title: string) => `${title || "Current lorebook"} matching keys`, // ${title || "현재 로어북"} 매칭 키
  keyPlaceholder: "key, key, key...", // 키, 키, 키...
  keySelectFirst: "Select a lorebook to manage." // 관리할 로어북을 선택하세요.
} as const;

/** Reference crop dialogs (`Vwe` 146266, `Gxt` 147058). */
export const CROP_LABELS = {
  title: "Reference crop", // 레퍼런스 크롭
  description: "Drag on the image to create a new frame; drag inside to move; corners and edges resize.", // 이미지 위에서 드래그해 새 프레임을 만들고, 프레임 내부는 이동하며 모서리와 변은 크기를 조절합니다.
  canvas: (name: string) => `${name} reference crop frame`, // ${name} 레퍼런스 크롭 프레임
  details: (w: number, h: number, sw: number, sh: number) => `Original ${w}×${h} · Selection ${sw}×${sh}`, // 원본 ${W}×${H} · 선택 ${w}×${h}
  loading: "Loading image.", // 이미지를 불러오는 중입니다.
  selectAll: "Select all", // 전체 선택
  saveAll: "Save all", // 모두 저장
  save: "Save crop", // 크롭 저장
  createFailed: "Could not create the crop image.", // 크롭 이미지를 생성하지 못했습니다.
  canvasFailed: "Could not initialize crop canvas.", // 크롭 Canvas를 초기화하지 못했습니다.
  loadFailed: "Could not load the reference image.", // 레퍼런스 이미지를 불러오지 못했습니다.
  busy: "Another save is in progress." // 다른 저장 작업이 진행 중입니다.
} as const;

/** Metadata badge + inspector (`CT` 96950, `Iit` 96992). */
export const METADATA_LABELS = {
  none: "None", // 없음
  present: "Present", // 있음
  view: "View meta", // 메타 보기
  viewOf: (name: string) => `View meta of ${name}`, // ${name} 메타 보기
  sectionOf: (name: string) => `${name} metadata`, // ${name} 메타데이터
  close: "Close asset metadata", // 에셋 메타데이터 닫기
  loading: "Loading meta…", // 메타 불러오는 중…
  readFailed: "Could not read metadata.", // 메타데이터를 읽지 못했습니다.
  empty: "No NovelAI metadata to display.", // 표시할 NovelAI 메타데이터가 없습니다.
  fields: {
    provider: "Provider",
    size: "Size",
    main: "Main prompt", // 메인 프롬프트
    negative: "Negative", // 네거티브
    characterPrompt: (i: number) => `Character ${i} prompt`, // 캐릭터 ${i} 프롬프트
    characterNegative: (i: number) => `Character ${i} negative`, // 캐릭터 ${i} 네거티브
    characterCoords: (i: number) => `Character ${i} coordinates`, // 캐릭터 ${i} 좌표
    comment: "Comment"
  }
} as const;

/** Image viewer (`h1` 62609). */
export const VIEWER_LABELS = {
  close: "Close image zoom", // 이미지 확대 닫기
  loadFailed: "Could not load the image." // 이미지를 불러오지 못했습니다.
} as const;

/** Analysis toast texts (`z9` 81571, `zde`, `TQe`) and analyzer error modal (`ape`). */
export const ANALYSIS_LABELS = {
  modes: { metadata: "Meta", image: "Image", text: "Body text" } as Record<string, string>, // 메타 / 이미지 / 텍스트
  status: { running: "Analyzing", success: "Analysis complete", cancelled: "Analysis cancelled", error: "Analysis failed" } as Record<string, string>, // 분석중 / 분석완료 / 분석취소 / 분석실패
  kinds: {
    "character-prompts": "Character prompt analysis", // 캐릭터 프롬프트 분석
    references: "Reference analysis", // 레퍼런스 분석
    persona: "Persona prompt analysis", // Persona 프롬프트 분석
    "asset-matching": "Asset classification", // 에셋 분류
    "metadata-check": "Meta check", // 메타 확인
    "artist-extraction": "Artist prompt extraction", // 작가 프롬프트 추출
    reclassification: "AI reclassification", // AI 재분류
    "unique-tag-search": "Unique tag search", // 고유태그검색
    "representative-pick": "Representative image pick", // 대표 이미지 선택
    "charx-regex": "charx regex analysis" // charx 정규식 분석
  } as Record<string, string>,
  errorTitles: {
    "asset-matching": "Asset & character matching error", // 에셋&캐릭터 매칭 오류
    "character-prompts": "Character prompt analysis error", // 캐릭터 프롬프트 분석 오류
    persona: "Persona prompt analysis error", // Persona 프롬프트 분석 오류
    references: "Reference analysis error", // 레퍼런스 분석 오류
    "artist-extraction": "Artist prompt extraction error", // 작가 프롬프트 추출 오류
    reclassification: "AI reclassification error" // AI 재분류 오류
  } as Record<string, string>,
  errorFallbackTitle: "AI analysis error", // AI 분석 오류
  errorDescription: "Check the error details and try again.", // 오류 내용을 확인하고 다시 시도하세요.
  errorDetails: "Error details", // 세부 오류
  errorUnknown: "Unknown AI analysis error.", // 알 수 없는 AI 분석 오류입니다.
  showError: "Show error details",
  queued: "Queued",
  stopTask: "Stop task", // 작업 중지
  closeNotice: "Close notice" // 알림 닫기
} as const;

/** Display filter groups (133879-133940). */
export const FILTER_GROUP_LABELS = {
  roster: { label: "Roster", yes: "Active", no: "Inactive" }, // 로스터 / 활성 / 비활성
  origin: { label: "Origin", all: "All", lorebook: "Lorebook", module: "Module", custom: "Custom", aiAuto: "AI generated" }, // 출처 / 전체 / 로어북 / 모듈 / 커스텀 / AI 생성
  assets: { label: "Assets", yes: "Selected", no: "Not selected" }, // 에셋 / 선택됨 / 미선택
  empty: { label: "Prompt", yes: "Has empty", no: "All filled" }, // 프롬프트 / 미입력 있음 / 모두 입력됨
  checked: { label: "Analysis check", yes: "Checked", no: "Unchecked" }, // 분석 체크 / 체크됨 / 미체크
  reference: { label: "Reference", yes: "Present", no: "None" } // 레퍼런스 / 있음 / 없음
} as const;

