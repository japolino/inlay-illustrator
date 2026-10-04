/**
 * English labels for Asset Maid analysis status texts (the Korean original stays in `labelKo` / `messageKo`).
 * AM builds these strings with template literals (iwt L135362, Awt L136832, bwt L136244, Mvt L134487, Uwt L137835,
 * $vt L134787, ope L96048); the table rewrites the fixed Korean phrases and keeps numbers, names and ratios.
 */
const HANGUL = /[\uac00-\ud7a3]/u;

const MODE: Record<string, string> = { 메타데이터: "metadata", 이미지: "image", 텍스트: "text" };
const mode = (k: string) => MODE[k] ?? k;

/** Ordered rewrites (full sentences first, then phrases, then counters). */
const RULES: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  // full sentences
  [/캐릭터가 변경되어 이전 캐릭터의 결과 적용을 중단했습니다\./gu, "The character changed, so applying the previous character's results was stopped."],
  [/캐릭터를 전환하는 중입니다\. 전환이 끝난 후 다시 저장해주세요\./gu, "Switching characters. Save again when the switch is done."],
  [/다른 작업이 진행 중입니다\. 완료 후 다시 실행해 주세요\./gu, "Another task is running. Run this again when it is done."],
  [/레퍼런스 AI 분석 결과가 없습니다\./gu, "The reference AI analysis returned no results."],
  [/AI 분석 결과가 없습니다\./gu, "The AI analysis returned no results."],
  [/이미지 분석을 메타 또는 본문으로 전환할 근거가 없습니다\./gu, "There is no metadata or lorebook body to use instead of the image analysis."],
  [/명시적 작가 태그를 확인할 NovelAI 메타데이터 이미지가 없습니다\./gu, "There is no NovelAI metadata image to read explicit artist tags from."],
  [/작가 프롬프트로 저장할 명시적 메타데이터 태그가 없습니다\./gu, "The metadata has no explicit tags to save as an artist prompt."],
  [/작가 프롬프트를 추출할 charx를 찾지 못했습니다\./gu, "The character to extract an artist prompt from was not found."],
  [/작가 프롬프트를 추출할 이미지가 없습니다\./gu, "There is no image to extract an artist prompt from."],
  [/재분류 배치 응답 형식을 확인할 수 없습니다\./gu, "The reclassification batch response has an unknown format."],
  [/재분류 요청에 실패했습니다\./gu, "The reclassification request failed."],
  [/재분류 응답에 누락되거나 유효하지 않은 폼이 있습니다\. 다시 실행해 주세요\./gu, "The reclassification response has missing or invalid forms. Run it again."],
  [/재분류 응답에 알 수 없거나 중복된 폼 ID가 있습니다\./gu, "The reclassification response has unknown or duplicate form IDs."],
  [/한 폼의 재분류 요청이 크기 제한을 초과했습니다\. 선택 영역을 줄인 뒤 다시 실행해 주세요\./gu, "The reclassification request of one form is too large. Select less and run it again."],
  [/선택 영역에 재분류할 프롬프트가 없습니다\./gu, "The selection has no prompts to reclassify."],
  [/선택한 이미지에서 분석할 정보를 찾지 못했습니다\./gu, "No information to analyse was found in the selected images."],
  [/분석 가능한 로어북 본문이 없습니다/gu, "No lorebook body can be analysed"],
  [/분석할 로어북 본문이 없습니다/gu, "No lorebook body to analyse"],
  [/분석할 이미지가 선택되지 않았습니다\./gu, "No images are selected for analysis."],
  [/분석할 페르소나가 없습니다/gu, "No persona to analyse"],
  [/분석할 프롬프트가 없습니다/gu, "No prompts to analyse"],
  [/변경된 로어북 선택이 없습니다\./gu, "The lorebook selection did not change."],
  [/분석 입력을 준비할 수 있는 페르소나가 없습니다/gu, "analysis: no persona has usable input"],
  [/: 분석 대상이 변경되었습니다\./gu, ": the analysis target changed."],
  [/ 분석 결과가 없습니다\./gu, ": no analysis result."],
  [/텍스트 fallback 본문이 없습니다\./gu, "no lorebook body for the text fallback."],
  [/AI 재분류를 중지했습니다\./gu, "AI reclassification stopped."],
  // artist extraction (Mvt)
  [/작가 프롬프트 추출 준비 중/gu, "Preparing artist prompt extraction"],
  [/작가 프롬프트 추출 완료/gu, "Artist prompt extracted"],
  [/작가 프롬프트 추출 실패/gu, "Artist prompt extraction failed"],
  [/작가 프롬프트 추출 취소됨/gu, "Artist prompt extraction cancelled"],
  [/작가 프롬프트 이미지 선택 중/gu, "Selecting the artist prompt image"],
  [/작가 프롬프트 메타데이터 확인 중/gu, "Checking artist prompt metadata"],
  [/작가 프롬프트 AI 분석 중/gu, "Artist prompt AI analysis"],
  [/작가 프롬프트 결과 적용 중/gu, "Applying the artist prompt"],
  // character prompt analysis (iwt)
  [/프롬프트 분석 일부 완료/gu, "Prompt analysis partly complete"],
  [/프롬프트 분석 완료/gu, "Prompt analysis complete"],
  [/프롬프트 분석 실패/gu, "Prompt analysis failed"],
  [/프롬프트 분석 취소됨/gu, "Prompt analysis cancelled"],
  [/프롬프트 분석 준비 중/gu, "Preparing prompt analysis"],
  [/직접 이미지 분석 준비 중/gu, "Preparing direct image analysis"],
  [/로어북 본문 분석 준비 중/gu, "Preparing lorebook body analysis"],
  [/프롬프트 메타데이터 분석 중/gu, "Analysing prompt metadata"],
  [/직접 이미지 입력 준비 중/gu, "Preparing image input"],
  [/프롬프트 이미지 준비 중/gu, "Preparing prompt images"],
  [/프롬프트 AI 분석 준비 중/gu, "Preparing prompt AI analysis"],
  [/프롬프트 AI 분석 중/gu, "Prompt AI analysis"],
  [/메타데이터 프롬프트 AI 분석 배치/gu, "Metadata prompt AI analysis batch"],
  [/로어북 본문 AI 분석 배치/gu, "Lorebook body AI analysis batch"],
  [/이미지 입력 준비 배치/gu, "Image input batch"],
  [/이미지 프롬프트 AI 분석 배치/gu, "Image prompt AI analysis batch"],
  [/완료 배치의 캐릭터 폼 판정 중/gu, "Resolving character forms of the finished batch"],
  [/이미지 대체 메타 확인 중/gu, "Checking metadata for the image fallback"],
  [/이미지 대체 메타 분석/gu, "Image fallback metadata analysis"],
  [/메타데이터 fallback/gu, "Metadata fallback"],
  [/텍스트 fallback/gu, "Text fallback"],
  [/(텍스트|메타데이터|이미지) AI 배치/gu, (_m, k) => `${mode(k)[0]!.toUpperCase()}${mode(k).slice(1)} AI batch`],
  // reference analysis (Awt)
  [/프롬프트 (메타데이터|이미지|텍스트) AI 분석 배치/gu, (_m, k) => `Prompt ${mode(k)} AI analysis batch`],
  [/프롬프트 (메타데이터|이미지|텍스트) AI 분석 준비 중/gu, (_m, k) => `Preparing prompt ${mode(k)} AI analysis`],
  [/프롬프트 (메타데이터|이미지|텍스트) AI 분석 중/gu, (_m, k) => `Prompt ${mode(k)} AI analysis`],
  [/프롬프트 (메타데이터|이미지|텍스트) 분석 완료/gu, (_m, k) => `Prompt ${mode(k)} analysis complete`],
  [/프롬프트 (메타데이터|이미지|텍스트) 분석 일부 완료/gu, (_m, k) => `Prompt ${mode(k)} analysis partly complete`],
  [/프롬프트 (메타데이터|이미지|텍스트) 분석 입력을 준비하지 못했습니다\./gu, (_m, k) => `Could not prepare the prompt ${mode(k)} analysis input.`],
  [/프롬프트 (메타데이터|이미지|텍스트) 분석 준비 중/gu, (_m, k) => `Preparing prompt ${mode(k)} analysis`],
  [/레퍼런스 분석 실패/gu, "Reference analysis failed"],
  [/레퍼런스 분석 완료/gu, "Reference analysis complete"],
  [/레퍼런스 분석 준비 중/gu, "Preparing reference analysis"],
  [/레퍼런스 분석 취소됨/gu, "Reference analysis cancelled"],
  // persona (bwt)
  [/페르소나 분석 실패/gu, "Persona analysis failed"],
  [/페르소나 분석 완료/gu, "Persona analysis complete"],
  [/페르소나 분석 일부 완료/gu, "Persona analysis partly complete"],
  [/페르소나 분석 취소됨/gu, "Persona analysis cancelled"],
  [/페르소나 폼 판정/gu, "Persona form resolution"],
  [/페르소나 (.+?) 근거 준비 중/gu, "Preparing evidence for persona $1"],
  [/페르소나 (.+?) 분석 준비 중/gu, "Preparing analysis of persona $1"],
  [/페르소나 (.+?) 분석 (\d+\/\d+)/gu, "Persona $1 analysis $2"],
  [/프롬프트 (\d+)개 · 의상 (\d+)개/gu, "$1 prompts · $2 outfits"],
  // asset matching (Uwt)
  [/에셋 분류 로컬 규칙 적용 중/gu, "Applying local asset classification rules"],
  [/파일명 기반 에셋 분류 보강 중/gu, "Refining asset classification from file names"],
  [/에셋 분류 준비 중/gu, "Preparing asset classification"],
  [/에셋 분류 완료/gu, "Asset classification complete"],
  [/에셋 분류 실패/gu, "Asset classification failed"],
  [/에셋 분류 취소됨/gu, "Asset classification cancelled"],
  [/에셋 분류 중/gu, "Classifying assets"],
  [/본문 식별 근거 없음/gu, "no identity evidence in the body"],
  // metadata check ($vt)
  [/메타 확인 준비 중/gu, "Preparing metadata check"],
  [/메타 확인 완료/gu, "Metadata check complete"],
  [/메타 확인 실패/gu, "Metadata check failed"],
  [/메타 확인 취소됨/gu, "Metadata check cancelled"],
  [/메타 확인 중/gu, "Checking metadata"],
  [/현재 charx/gu, "current character"],
  // reclassification (ope)
  [/AI 재분류 · 선택 영역 준비 중/gu, "AI reclassification · preparing the selection"],
  [/AI 재분류 완료/gu, "AI reclassification complete"],
  [/AI 재분류 중/gu, "AI reclassification"],
  // representative pick (hvt L133864)
  [/(\d+)명에 이미지 (\d+)장 추가/gu, "Added $2 images for $1 people"],
  [/추가할 대표 이미지 없음/gu, "No representative image to add"],
  [/의상 구분이 불명확한 후보 (\d+)장/gu, "$1 candidates with an unclear outfit"],
  [/대표 선택에서 제외된 후보 (\d+)장/gu, "$1 candidates excluded from the pick"],
  [/추가할 이미지 없음/gu, "No images to add"],
  // charx regex analysis (Owt)
  [/charx 정규식 분석 대상 확인 중/gu, "Character regex analysis · checking targets"],
  [/charx 정규식 분석 데이터가 이미 있습니다/gu, "Character regex analysis data already exists"],
  [/charx 정규식 분석 완료/gu, "Character regex analysis complete"],
  [/charx 정규식 분석 실패/gu, "Character regex analysis failed"],
  [/charx 정규식 분석 취소됨/gu, "Character regex analysis cancelled"],
  [/charx 정규식 분석 중/gu, "Character regex analysis"],
  [/감지 가능 (\d+)/gu, "detectable $1"],
  [/대상 없음 (\d+)/gu, "not applicable $1"],
  // counters
  [/정보 없음 (\d+)개/gu, "no info $1"],
  [/정보 없음 (\d+)명/gu, "no info $1 people"],
  [/(\d+)개 캐릭터/gu, "$1 characters"],
  [/(\d+)개 이미지/gu, "$1 images"],
  [/(\d+)개 프롬프트/gu, "$1 prompts"],
  [/(\d+)개 규칙/gu, "$1 rules"],
  [/(\d+)개 charx/gu, "$1 characters"],
  [/(\d+)명/gu, "$1 people"],
  [/(\d+)개/gu, "$1"],
  [/^배치 (\d+):/gu, "Batch $1:"],
  [/ 배치 (\d+):/gu, " batch $1:"],
  [/폼 (\d+)/gu, "Form $1"],
  [/기본 의상/gu, "Default outfit"],
  [/(메타데이터|이미지|텍스트)/gu, (_m, k) => mode(k)],
  [/준비 중/gu, "preparing"],
  [/완료/gu, "complete"],
  [/실패/gu, "failed"],
  [/취소됨/gu, "cancelled"],
];

/** English text for an AM status / error string (unchanged when it has no Korean). */
export function translateAmText(text: string): string {
  if (!text || !HANGUL.test(text)) return text;
  let out = text;
  for (const [re, rep] of RULES) out = out.replace(re, rep as never);
  return out;
}

/** `{label, labelKo}` pair for progress events. */
export function amLabel(text: string): { label: string; labelKo?: string } {
  const label = translateAmText(text);
  return label === text ? { label } : { label, labelKo: text };
}

/** `{message, messageKo}` pair for errors. */
export function amMessage(text: string): { message: string; messageKo?: string } {
  const message = translateAmText(text);
  return message === text ? { message } : { message, messageKo: text };
}
