/** English labels of the Assets tab (spec/ui.md §2). Korean originals in comments. */
export const ASSETS_LABELS = {
  title: "Asset analysis", // 에셋분석
  viewTabs: "Asset analysis target kind", // 에셋 분석 대상 종류
  viewCharx: "CharX",
  viewPersona: "Persona",
  searchCharx: "Body character search", // 본문 인물 검색
  searchPersona: "Persona search", // 페르소나 검색
  noResults: "No search results.", // 검색 결과가 없습니다.
  noMatch: "No people match the conditions.", // 조건에 맞는 인물이 없습니다.
  loadFailed: "Could not load the character workspace.", // 캐릭터 작업공간을 불러오지 못했습니다.
  noPersona: "No Persona available.", // 사용할 수 있는 Persona가 없습니다.
  noLorebook: "No lorebook selected.", // 선택한 로어북이 없습니다.
  noCharacter: "Select a character in the rail to start.",
  analysisDone: "Analysis complete · Manage prompts", // 분석 완료 · 프롬프트 관리
  noEvidence: "No information to analyze", // 분석할 정보 없음
  noImageToAdd: "No image to add", // 추가할 이미지 없음
  addNext: "Add next default-outfit image", // 다음 기본 의상 이미지 추가
  addNextOf: (title: string) => `${title} add next default-outfit image`, // ${title} 다음 기본 의상 이미지 추가
  clearRow: "Clear all image selections of this character", // 이 캐릭터의 이미지 선택 모두 해제
  clearRowOf: (title: string) => `${title} clear all image selections`, // ${title} 이미지 선택 모두 해제
  clearPersonaRow: "Clear all image selections of this persona", // 이 페르소나의 이미지 선택 모두 해제
  selectAssets: "Select assets", // 에셋 선택
  selectAssetsOf: (title: string) => `${title} select assets`, // ${title} 에셋 선택
  removeAsset: "Remove asset", // 에셋 제거
  removeAssetOf: (name: string) => `Remove ${name}`, // ${name} 제거
  exclude: "Exclude from roster", // 로스터 제외
  excludeOf: (title: string) => `${title} exclude from roster (unregister)`, // ${title} 로스터 제외 (등록 해제)
  excludeFailed: "Could not exclude from roster.", // 로스터에서 제외하지 못했습니다.
  rosterDisable: "Deactivate roster", // 로스터 비활성화
  rosterEnable: "Activate roster", // 로스터 활성화
  rosterFailed: "Roster change failed.", // 로스터 변경에 실패했습니다.
  autoPick: "Auto-select default-outfit image per character", // 캐릭터별 기본 의상 이미지 자동 선택
  autoPickTitle: "Automatically selects 1 default-outfit image per character. Existing selections are kept.", // 캐릭터마다 기본 의상 이미지 1장을 자동 선택합니다. 기존 선택은 유지됩니다.
  clearAll: "Clear all image selections", // 이미지 선택 모두 해제
  clearAllTitle: "Clears all image selections of the current analysis items.", // 현재 분석 항목의 이미지 선택을 모두 해제합니다.
  filter: "Asset analysis display filter", // 에셋분석 표시 필터
  unanalyzedShort: "Unanalyzed", // 미분석
  selectUnanalyzed: "Select unanalyzed", // 미분석선택
  selectUnanalyzedChars: "Select unanalyzed characters", // 미분석 캐릭터 선택
  selectUnanalyzedCharsTitle: (n: number) => n > 0 ? "Select only unanalyzed characters" : "No unanalyzed characters to select.", // 미분석 캐릭터만 선택 / 선택할 미분석 캐릭터가 없습니다.
  selectUnanalyzedPersonas: "Select unanalyzed personas", // 미분석 페르소나 선택
  selectUnanalyzedPersonasTitle: (n: number) => n > 0 ? "Select only unanalyzed personas" : "No unanalyzed personas to select.", // 미분석 페르소나만 선택 / 선택할 미분석 페르소나가 없습니다.
  stopAnalysis: "Stop prompt analysis", // 프롬프트 분석 중지
  analyzeCharx: "Analyze selected CharX prompts", // 선택 CharX 프롬프트 분석
  analyzeCharxTitle: "Analyze selected CharX prompts and outfits", // 선택 CharX 프롬프트와 의상 분석
  analyzePersona: "Analyze selected persona prompts", // 선택 페르소나 프롬프트 분석
  analyzePersonaTitle: "Analyze selected persona prompts and outfits", // 선택 페르소나 프롬프트와 의상 분석
  meta: {
    none: "None", // 없음
    partial: "Partial", // 부분
    available: "Present", // 있음
    deleted: "Deleted", // 삭제됨
    unknown: "Not analyzed", // 미분석
    checking: "Checking", // 확인 중
    sourceName: "Meta check", // 메타 확인
    unchecked: (n: number) => ` · unchecked assets ${n}`, // · 미확인 에셋 ${n}개
    deleteRecord: "Delete meta-check record", // 메타 확인 기록 삭제
    stop: "Stop check", // 확인 중지
    check: "Meta check", // 메타확인
    recheck: "Check again" // 다시 확인
  },
  pickResult: {
    added: (people: number, images: number, names: string) => `Added ${images} images to ${people} people · ${names}`, // ${p}명에 이미지 ${i}장 추가 · ${names}
    unclassified: (n: number) => `No representative image to add · ${n} candidates with unclear outfit`, // 추가할 대표 이미지 없음 · 의상 구분이 불명확한 후보 ${n}장
    withheld: (n: number) => `No representative image to add · ${n} candidates excluded from representative pick`, // 추가할 대표 이미지 없음 · 대표 선택에서 제외된 후보 ${n}장
    none: "No image to add" // 추가할 이미지 없음
  }
} as const;
