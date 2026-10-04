/** English labels of the Prompts tab (spec/ui.md §3.1). Korean originals in comments. */
export const PROMPTS_LABELS = {
  title: "Prompts", // 프롬프트
  search: "Character search in body", // 본문 인물 검색
  noLorebook: "No lorebook selected.", // 선택한 로어북이 없습니다.
  noMatch: "No characters match the conditions.", // 조건에 맞는 인물이 없습니다.
  promote: "Promote to registered character", // 등록 인물로 승격
  outfitPrompt: "Outfit prompt", // 의상 프롬프트
  outfitPromptOf: (title: string) => `${title} outfit prompt`,
  savePrompts: "Save prompts", // 프롬프트 저장
  filter: "Prompt display filter", // 프롬프트 표시 필터
  bulkReferenceTitle: "Toggle reference use for the listed characters",
  modeToReclass: "Switch to AI reclassification", // AI 재분류로 전환
  modeToReference: "Switch to reference analysis", // 레퍼런스 분석으로 전환
  analyze: "Prompt analysis", // 프롬프트 분석
  stopAnalyze: "Stop prompt analysis", // 프롬프트 분석 중지
  analyzeTextTitle: "Analyze prompts·outfits from body", // 본문에서 프롬프트·의상 분석
  analyzeReferenceTitle: "Analyze prompts·outfits·artist from references", // 레퍼런스에서 프롬프트·의상·작가 분석
  reclass: "Reclassify checked areas", // 체크한 영역 재분류
  stopReclass: "Stop AI reclassification", // AI 재분류 중지
  reclassTitle: "Reclassify the analysis-checked areas across all characters·forms in the list", // 목록의 모든 캐릭터·폼에서 분석 체크한 영역 재분류
  rowAnalysisTitle: "Use this form's reference for analysis",
  saveFirst: "Save or cancel the data being edited first." // 편집 중인 데이터를 먼저 저장하거나 취소해주세요.
} as const;
