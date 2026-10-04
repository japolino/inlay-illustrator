/** English labels of the Artists tab (spec/ui.md §3.2). Korean originals in comments. */
export const ARTISTS_LABELS = {
  titleNovelAI: "Artist select", // 작가 선택
  titleAnima: "Comfy UI artist select", // Comfy UI 작가선택
  selectOf: (title: string) => `${title} select`, // ${t} 선택
  editOf: (title: string) => `${title} edit`, // ${t} 편집
  settingsOf: (title: string) => `${title} settings`, // ${t} 설정
  deleteOf: (title: string) => `${title} delete`, // ${t} 삭제
  edit: "Edit", // 편집
  settings: "Settings", // 설정
  delete: "Delete", // 삭제
  emptyPrompt: "Empty prompt", // 빈 프롬프트
  presetTitles: { none: "None", detail_anime_illustration_style: "v5 verified style", comic_page_illustration_style: "Recommended comic style" } as Record<string, string>, // none / v5 검증 그림체 / 만화 추천 그림체
  presetDescriptions: {
    none: "Does not apply an artist prompt.", // 작가 프롬프트를 적용하지 않습니다.
    detail_anime_illustration_style: "Default style prompt for testing and verifying NovelAI V5.", // NovelAI V5 테스트와 검증을 위한 기본 그림체 프롬프트입니다.
    comic_page_illustration_style: "Default style prompt suited to cartoon and comic page staging." // 카툰·만화 페이지 연출에 적합한 기본 그림체 프롬프트입니다.
  } as Record<string, string>,
  expand: "Expand artist input", // 작가 입력 펼치기
  collapse: "Collapse artist input", // 작가 입력 접기
  textMode: "Text", // 텍스트
  textExpand: "Expand text input", // 텍스트 입력 펼치기
  textCollapse: "Collapse text input", // 텍스트 입력 접기
  imageMode: "Image", // 이미지
  imageExpand: "Expand image input", // 이미지 입력 펼치기
  imageCollapse: "Collapse image input", // 이미지 입력 접기
  fieldTitle: "Artist title", // 작가 제목
  fieldPositive: "Artist positive", // 작가 포지티브
  fieldNegative: "Artist negative · optional", // 작가 네거티브 · 선택 사항
  fieldNegativeAria: "Artist negative", // 작가 네거티브
  custom: "Custom", // 커스텀
  customAria: "Per-artist custom generation settings", // 작가별 커스텀 생성 설정
  stepDecrease: "STEPS decrease by 1", // STEPS 1 감소
  stepIncrease: "STEPS increase by 1", // STEPS 1 증가
  weight: "Non-artist weight", // 작가 외 가중치
  weightAria: "Apply non-artist weight", // 작가 외 가중치 적용
  weightTitle: "Multiplies all NAI positive/negative except the artist prompt. Existing weight 0.3 becomes 0.21 at ×0.7.", // 작가 프롬프트를 제외한 NAI 포지티브·네거티브 전체에 곱합니다. 기존 가중치 0.3은 ×0.7 적용 시 0.21이 됩니다.
  weightSlider: "Non-artist prompt multiplier", // 작가 외 프롬프트 배율
  editing: (title: string) => `“${title}” editing`, // “${t}” 편집 중
  configuring: (title: string) => `“${title}” configuring`, // “${t}” 설정 중
  cancelEdit: "Cancel artist prompt edit", // 작가 프롬프트 편집 취소
  add: "Add artist prompt", // 작가 프롬프트 추가
  save: "Save artist prompt", // 작가 프롬프트 저장
  extractImage: "Select artist extraction image", // 작가 추출 이미지 선택
  extract: "Extract artist prompt", // 작가 프롬프트 추출
  stopExtract: "Stop artist prompt extraction", // 작가 프롬프트 추출 중지
  animaExpand: "Expand Anima artist input", // Anima 작가 입력 펼치기
  animaCollapse: "Collapse Anima artist input", // Anima 작가 입력 접기
  animaName: "Artist name", // 작가 이름
  animaNameAria: "Comfy UI artist name", // Comfy UI 작가 이름
  animaTags: "e.g. @freng, @ciloranko, detailed eyes", // 예: @freng, @ciloranko, detailed eyes
  animaTagsAria: "Comfy UI artist tags", // Comfy UI 작가 태그
  animaCancel: "Cancel Anima artist tag edit", // Anima 작가 태그 편집 취소
  animaAdd: "Add Anima artist tag", // Anima 작가 태그 추가
  animaSave: "Save Anima artist tag", // Anima 작가 태그 저장
  addShort: "Add", // 추가
  saveShort: "Save", // 저장
  loadFailed: "Could not load the artist list."
} as const;
