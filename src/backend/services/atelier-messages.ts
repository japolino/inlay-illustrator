/**
 * English versions of the Asset Maid 0.9.90 Atelier error messages. The verbatim core throws the Korean originals
 * (spec atelier-data §1-§2, atelier-ui §4); the backend answers with English `message` and the original in
 * `messageKo`. Unknown messages stay as they are (English = original).
 */

const EXACT: Readonly<Record<string, string>> = Object.freeze({
  "저장된 메이드 아틀리에 목록 형식이 올바르지 않습니다.": "The stored Atelier list is invalid.",
  "프리셋의 저장 기준이 달라졌습니다. 초안을 보관한 뒤 최신 값을 불러오세요.": "The preset's saved base changed. Keep your draft, then load the latest values.",
  "활성 연출 프리셋을 찾을 수 없습니다.": "The active directing preset was not found.",
  "파일은 2 MiB 이하여야 합니다.": "The file must be 2 MiB or smaller.",
  "중첩 또는 항목 수 한도를 초과했습니다.": "The JSON exceeds the nesting or item count limit.",
  "예약된 키는 사용할 수 없습니다.": "Reserved keys cannot be used.",
  "asset-maid-preset 형식과 content 객체가 필요합니다.": "An asset-maid-preset format and a content object are required.",
  "배열이 필요합니다.": "An array is required.",
  "규칙은 content.rules에서 관리하세요.": "Manage rules in content.rules.",
  "continuity는 엔진 내부 정책입니다.": "continuity is an internal engine policy.",
  "지원 종료된 참고 설정입니다. 출력 규칙을 사용하세요.": "This reference setting is no longer supported. Use output rules.",
  "modifier 또는 interaction 하나를 지정하세요.": "Specify one modifier or interaction.",
  "candidate는 remove에만 적용됩니다.": "candidate applies to remove only.",
  "표현 방식 제한은 삽화 또는 만화 하나를 선택해야 합니다.": "The format restriction must select either illustration or comic.",
  "지침 이름과 본문을 확인해주세요.": "Check the guideline name and text.",
  "지원하지 않는 지침 필드입니다.": "Unsupported guideline field.",
  "삽화 또는 만화를 선택해주세요.": "Choose illustration or comic.",
  "추가 지침 형식이 올바르지 않습니다.": "The additional instruction is invalid.",
  "사용자 이미지 크기 형식이 올바르지 않습니다.": "The custom image size is invalid.",
  "이미지 크기를 하나 이상 선택해주세요.": "Select at least one image size.",
  "지침 목록 형식이 올바르지 않습니다.": "The guideline list is invalid.",
  "기본 지침과 선택 항목이 필요합니다.": "A default guideline and a selection are required.",
  "출력 방식별 지침 선택이 올바르지 않습니다.": "The per-output-mode guideline selection is invalid.",
  "잘못된 지침 ID입니다.": "Invalid guideline id.",
  "기본 지침의 표현 방식은 고정값입니다.": "The format of a default guideline is fixed.",
  "기본 지침은 유지해야 합니다.": "Default guidelines must be kept.",
  "기본 지침은 고정값입니다.": "The default guideline is fixed.",
  "미저장 편집을 저장하거나 버린 뒤 복원해주세요.": "Save or discard unsaved edits before restoring.",
  "다른 화면에서 지침이 변경되었습니다. 초안은 유지됩니다. 최신 내용과 비교해주세요.": "The guideline was changed in another screen. Your draft is kept; compare it with the latest content.",
  "다른 화면에서 자유생성 지침이 변경되었습니다. 초안은 유지됩니다. 최신 내용과 비교해주세요.": "The free-generation guideline was changed in another screen. Your draft is kept; compare it with the latest content.",
  "다른 화면에서 연출이 변경되었습니다. 최신 내용을 확인해주세요.": "The direction was changed in another screen. Check the latest content.",
  "이 연출을 참조하는 규칙을 먼저 삭제하거나 재연결해주세요.": "Delete or relink the rules that reference this direction first.",
  "지침을 찾을 수 없습니다.": "Guideline not found.",
  "비율 지침을 찾을 수 없습니다.": "Ratio guideline not found.",
  "연출 옵션을 찾을 수 없습니다.": "Directing option not found.",
  "복제할 지침을 찾을 수 없습니다.": "The guideline to duplicate was not found.",
  "연출 옵션 ID·이름·기본값을 확인해주세요.": "Check the directing option id, name and default.",
  "규칙 ID와 연출 조건 개체가 필요합니다.": "A rule id and a direction condition are required.",
  "대상 개체를 하나 이상 선택해주세요.": "Select at least one target.",
  "지원하지 않는 적용 문법입니다.": "Unsupported effect syntax.",
  "규칙이 참조하는 연출이 없습니다.": "The direction referenced by the rule does not exist.",
  "고정 시스템 항목은 연출 규칙으로 변경할 수 없습니다.": "Fixed system items cannot be changed by directing rules.",
  "자유생성 지침 형식을 확인해주세요.": "Check the free-generation guideline format.",
  "자유생성 프리셋 목록을 확인해주세요.": "Check the free-generation preset list.",
  "선택한 자유생성 지침을 찾을 수 없습니다.": "The selected free-generation guideline was not found.",
  "지원하지 않는 지침 묶음 필드입니다.": "Unsupported guideline bundle field.",
  "프리셋 연출 규칙은 연출 ID별 목록이어야 합니다.": "Preset directing rules must be lists keyed by direction id.",
  "프리셋 연출 규칙의 기존 연출 참조를 확인해주세요.": "Check the built-in direction references of the preset directing rules.",
  "프리셋 규칙의 삽입 위치를 확인해주세요.": "Check the insert position of the preset rules.",
  "내보낼 연출지침을 찾을 수 없습니다.": "A directing guideline to export was not found.",
  "내보낼 비율지침을 찾을 수 없습니다.": "A ratio guideline to export was not found.",
  "내보낼 자유생성 지침을 찾을 수 없습니다.": "A free-generation guideline to export was not found.",
  "지침 목록과 선택 참조를 확인해주세요.": "Check the guideline list and the selected reference.",
  "출력 방식을 다시 선택해주세요.": "Choose the output mode again.",
  "생성지침을 다시 선택해주세요.": "Choose the generation guideline again.",
  "제공 기본 지침 참조를 확인해주세요.": "Check the provided default guideline reference.",
  "기본 지침 연결을 확인해주세요.": "Check the default guideline bindings.",
  "분석 지침 필드가 올바르지 않습니다.": "The analysis guideline fields are invalid.",
  "비율결정 지침과 크기 후보가 필요합니다.": "A ratio instruction and size candidates are required.",
  "지침 묶음 필드가 올바르지 않습니다.": "The guideline bundle fields are invalid.",
  "자유생성 지침을 입력하거나 기본값으로 복원해주세요.": "Enter the free-generation guideline or restore the default.",
});

const PATTERNS: ReadonlyArray<[RegExp, (m: RegExpExecArray) => string]> = [
  [/^JSON 문법 오류: (.*)$/su, (m) => `JSON syntax error: ${m[1]}`],
  [/^연출 규칙의 그룹·옵션 참조를 확인해주세요: (.*)$/su, (m) => `Check the group / option references of the directing rules: ${m[1]}`],
  [/^프리셋 규칙의 연출을 찾을 수 없습니다: (.*)$/su, (m) => `The direction of a preset rule was not found: ${m[1]}`],
  [/^(.+) 지침 이름과 본문을 입력해주세요\.$/su, (m) => `Enter the name and text of the ${kindLabel(m[1]!)} guideline.`],
  [/^(.+) 디자인 기준을 입력해주세요\.$/su, (m) => `Enter the design criteria of the ${kindLabel(m[1]!)} guideline.`],
  [/^content\.analysis\.(.+): 분석 설정 형식 또는 참조가 올바르지 않습니다\.$/su, (m) => `content.analysis.${m[1]}: the analysis settings format or a reference is invalid.`],
  [/^(.+) 활성 전환: (.*)$/su, (m) => `${m[1]} activation: ${translateAtelierText(m[2]!)}`],
];

function kindLabel(ko: string): string {
  return ko === "인물 자유생성" ? "character free-generation" : ko === "의상생성" ? "outfit free-generation" : ko;
}

/** English text of one Korean Atelier message (unknown -> unchanged). */
export function translateAtelierText(ko: string): string {
  const exact = EXACT[ko];
  if (exact) return exact;
  for (const [re, fn] of PATTERNS) {
    const m = re.exec(ko);
    if (m) return fn(m);
  }
  // "<path>: <message>" lines of a validation error (one per diagnostic).
  const lines = ko.split("\n");
  if (lines.length > 1) return lines.map(translateAtelierText).join("\n");
  const colon = /^([^:\s][^:]*): (.+)$/su.exec(ko);
  if (colon) {
    const tail = translateAtelierText(colon[2]!);
    if (tail !== colon[2]) return `${colon[1]}: ${tail}`;
  }
  return ko;
}

/** `{message, messageKo}` for an error thrown by the Atelier core (messageKo only when the text was translated). */
export function atelierMessage(error: unknown): { message: string; messageKo?: string } {
  const ko = error instanceof Error ? error.message : String(error);
  const message = translateAtelierText(ko);
  return message === ko ? { message } : { message, messageKo: ko };
}
