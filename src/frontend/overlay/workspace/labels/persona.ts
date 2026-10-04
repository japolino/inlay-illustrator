/** English labels of the Persona tab (spec/ui.md §3.3). Korean originals in comments. */
export const PERSONA_LABELS = {
  title: "Persona", // 페르소나
  search: "Persona search", // 페르소나 검색
  loading: "Loading personas", // 페르소나 불러오는 중
  empty: "No personas available.", // 사용할 수 있는 페르소나가 없습니다.
  noMatch: "No personas match the conditions.", // 조건에 맞는 페르소나가 없습니다.
  activeInChat: "Active in current chat", // 현재 채팅 활성
  globalDefault: "Global default", // 전역 기본
  referenceTitle: "Apply this persona's reference to persona-only images", // 페르소나 단독 이미지에 이 페르소나의 레퍼런스 적용
  outfitEdit: "Outfit edit", // 의상 편집
  outfitEditOf: (name: string) => `${name} outfit edit`, // ${name} 의상 편집
  resetOf: (name: string) => `${name} prompt reset`, // ${name} 프롬프트 초기화
  save: "Save persona", // 페르소나 저장
  filter: "Persona display filter", // 페르소나 표시 필터
  bulkReferenceTitle: "Toggle reference use for all persona rows", // 모든 페르소나 행의 레퍼런스 사용을 일괄 전환
  analyze: "Persona analysis", // 페르소나 분석
  stopAnalyze: "Cancel persona analysis", // 페르소나 분석 취소
  analyzeTitle: "Persona prompt·outfit analysis", // 페르소나 프롬프트·의상 분석
  reclassTitle: "Reclassify analysis-checked areas across all personas·forms in the list", // 목록의 모든 페르소나·폼에서 분석 체크한 영역 재분류
  outfitPaneTitle: "Persona outfit prompt", // 페르소나 의상 프롬프트
  outfitFrame: (name: string) => `Persona outfit prompt : ${name}`, // 페르소나 의상 프롬프트 : ${name}
  outfitSave: "Save persona outfits", // 페르소나 의상 저장
  outfitBulkPromote: (n: number) => `Bulk-promote ${n} AI generated persona outfits`, // AI 생성 페르소나 의상 ${n}개 일괄 승격
  outfitBulkPromoteTitle: (n: number) => n > 0 ? `Promote ${n} ready AI generated persona outfits to registered outfits` : "No AI generated persona outfits to promote", // 준비된 AI 생성 페르소나 의상 …
  outfitNew: "New persona outfit generation", // 새 페르소나 의상 생성
  outfitAdd: "Add persona outfit", // 페르소나 의상 추가
  outfitGenerate: "Generate outfit image", // 의상 이미지 생성
  generationPaneTitle: "Persona outfit generation", // 페르소나 의상 생성
  generationFrame: (name: string) => `Persona outfit generation : ${name}`, // 페르소나 의상생성 : ${name}
  backToList: "Back to persona outfit list", // 페르소나 의상 목록으로 돌아가기
  generationResult: "Persona outfit generation result", // 페르소나 의상 생성 결과
  generationPrompt: "Persona outfit prompt", // 페르소나 의상 프롬프트
  generationInfo: "Persona outfit generation info", // 페르소나 의상 생성 정보
  noBody: "No persona body.", // 페르소나 본문이 없습니다.
  generationHistory: "Persona outfit generation history", // 페르소나 의상 생성 히스토리
  replaceSave: "Replace current persona outfit", // 현재 페르소나 의상 대체
  addSave: "Add new persona outfit", // 새 페르소나 의상 추가
  generateImage: "Generate persona outfit image", // 페르소나 의상 이미지 생성
  personaN: (n: number) => `Persona ${n}` // Persona ${n}
} as const;
