/**
 * Maid Atelier labels (Asset Maid 0.9.90 "메이드 아틀리에"). English text with the Korean original in a trailing comment.
 * Spec: am990 spec/atelier-ui.md §6.2. Tests assert on these constants, not on literal text.
 */

export const ATELIER_LABELS = {
  shell: {
    title: "Maid Atelier", // 메이드 아틀리에
    navigation: (detail: string) => `Maid Atelier · ${detail}`, // 메이드 아틀리에 · {x}
    openAtelier: "Maid Atelier", // Maid Atelier
    openAtelierAria: "Switch to Maid Atelier", // Maid Atelier로 전환
    backToWorkspace: "Inlay Illustrator", // Asset Maid
    backToWorkspaceAria: "Switch to Inlay Illustrator", // Asset Maid로 전환
    menu: "Maid Atelier menu", // 메이드 아틀리에 메뉴
    content: "Maid Atelier content", // 메이드 아틀리에 콘텐츠
    collapseWork: "Collapse work area", // 작업영역 접기
    exit: "Exit plugin", // 플러그인 나가기
    settings: "Inlay Illustrator settings", // Asset Maid 설정
    showGuide: "Show guide", // 사용법 보기
    hideGuide: "Hide guide", // 사용법 닫기
    loading: "Loading the Maid Atelier", // 메이드 아틀리에 불러오는 중
    loadFailed: "The Maid Atelier could not be loaded.",
    retry: "Retry", // 다시 시도
    back: "Back", // 뒤로
  },
  tabs: {
    expressions: "Expression elements", // 표현요소
    interactions: "Interactions", // 상호작용
    scenes: "Scene definitions", // 장면정의
    rules: "Rules", // 규칙
    guidelineKind: "Guideline kind", // 생성지침 종류
    scene: "Directing", // 연출지침
    imageRatio: "Ratio", // 비율지침
    free: "Free generation", // 자유생성
  },
  save: {
    unsaved: "Unsaved changes", // 저장되지 않은 변경
    clean: "No text changes", // 텍스트 변경 없음
    typing: "Typing", // 입력 중
    failed: "Save failed", // 저장 실패
    checkLatest: "Check latest values", // 최신값 확인 필요
    saving: "Saving", // 저장 중
    retry: "Retry save", // 저장 재시도
    save: "Save changes", // 변경 저장
    saved: "Saved", // 저장됨
    guardTitle: "Save changes?", // 변경 내용을 저장할까요?
    guardDescription: "There are unsaved changes.", // 저장하지 않은 변경이 있습니다.
    cancel: "Cancel", // 취소
    discard: "Discard", // 버리기
    saveAndContinue: "Save and continue", // 저장 후 이동
    autoNote: "Settings changed in the table are saved automatically.", // 표에서 바꾼 설정은 자동 저장됩니다
  },
  recovery: {
    conflict: "The preset's saved base changed. Keep the draft, then load the latest values.", // 프리셋의 저장 기준이 달라졌습니다. 초안을 보관한 뒤 최신 값을 불러오세요.
    reload: "Reload", // 다시 불러오기
    saveEdits: "Save edits", // 수정 내용 저장
    retry: "Retry save", // 저장 재시도
    keepAndLoad: "Keep draft, load latest", // 초안 보관 후 최신값 불러오기
    kept: (n: number) => `Kept drafts (${n})`, // 보관된 초안 (n)
    keptNote: "Kept in this window; the original is untouched and a recovery copy is created.", // 이 창에 보관 중 · 원본은 유지하고 복구본 생성
    exportAll: "Export all drafts as JSON", // 전체 초안 JSON 내보내기
    createCopy: (name: string) => `Create ${name} recovery copy`, // {name} 복구본 만들기
    copyName: (name: string) => `${name} recovery`, // {name} 복구본
    notFound: "The kept draft could not be found.", // 보관된 초안을 찾을 수 없습니다.
    guidelineChanged: "The guideline was changed in another screen. The draft is kept; compare it with the latest content.", // 다른 화면에서 지침이 변경되었습니다. 초안은 유지됩니다. 최신 내용과 비교해주세요.
    freeChanged: "The free-generation guideline was changed in another screen. The draft is kept; compare it with the latest content.", // 다른 화면에서 자유생성 지침이 변경되었습니다. ...
    useLatest: "Use latest", // 최신 값 사용
    overwrite: "Overwrite with my draft", // 내 초안으로 덮어쓰기
    pendingDefaults: "Some edits target items removed from the defaults and are not applied. The edits are kept.", // 기본값에서 삭제되어 적용되지 않는 변경이 있습니다. 수정 내용은 보관됩니다.
    readFailure: "Part of the Atelier file could not be read. Writes to it are blocked until it is repaired.",
    repair: "Back up and reset this part", // port: atelier.repair
    readError: "This preset could not be read. Repair it as raw JSON.", // documentReadError
  },
  sidebar: {
    presets: "Presets", // Presets
    guidelines: "Generation guidelines", // 생성지침
    openOrder: "Open output order", // 출력 순서 열기
    backToPresets: "Back to presets", // 프리셋 목록으로 돌아가기
    add: "Add", // 추가
    addAria: "Add preset", // 프리셋 추가
    import: "Import", // 가져오기
    importAria: "Import JSON", // JSON 가져오기
    useForGeneration: "Use for generation", // 생성에 사용
    inUse: "In use", // 사용중
    inUseAria: "Used for generation", // 생성에 사용중
    builtIn: "Built-in", // 기본 제공
    userDocument: "User document", // 사용자 문서
    menu: (name: string) => `${name} menu`, // {name} 메뉴
    rename: "Rename", // 이름 변경
    renameField: (name: string) => `${name} preset name`, // {name} 프리셋 이름
    confirm: "Confirm", // 확인
    duplicate: "Duplicate", // 복제
    exportJson: "Export JSON", // JSON 내보내기
    restoreOriginal: "Restore provided original", // 제공 원본으로 복원
    delete: "Delete", // 삭제
    openRaw: "Open raw JSON", // 원문 열기
    nameRequired: "Enter a name.", // 이름을 입력해주세요.
    renameFailed: "The name could not be saved.", // 이름을 저장하지 못했습니다.
    restoreTitle: "Restore the provided original", // 제공 원본으로 되돌리기
    restoreDescription: (name: string) => `The saved edits of ${name} are replaced with the provided original.`, // {name}의 저장된 편집 내용을 제공 원본으로 바꿉니다.
    deleteTitle: "Delete preset", // 프리셋 삭제
    deleteDescription: (name: string) => `${name} will be deleted.`, // {name}을 삭제합니다.
    deleteActiveDescription: (name: string) => `${name} will be deleted and the default preset is used for generation.`, // {name}을 삭제하고 기본 프리셋을 생성에 사용합니다.
    defaultPresetName: "Default preset", // 기본 프리셋
    newPreset: "New preset", // 새 프리셋
    copyName: (name: string) => `${name} copy`, // {name} 복사본
  },
  importing: {
    title: "Import JSON", // JSON 가져오기
    tooLarge: "The file must be 2 MiB or smaller.", // 파일은 2 MiB 이하여야 합니다.
    readFailed: "The file could not be read. Choose it again.", // 파일을 읽지 못했습니다. 다시 선택해주세요.
    saveFailed: "The import could not be saved. Try again.", // 가져오기를 저장하지 못했습니다. 다시 시도해주세요.
    imported: (name: string) => `Imported ${name}.`,
    merged: (n: number) => `${n} bundled guideline${n === 1 ? " was" : "s were"} added to the guideline lists.`,
    close: "Close", // 닫기
  },
  exporting: {
    title: "Export JSON", // JSON 내보내기
    description: "Choose the guidelines to bundle with the preset.",
    scene: "Directing guidelines", // 연출지침
    imageRatio: "Ratio guidelines", // 비율지침
    character: "Character free generation", // 인물 자유생성
    outfit: "Outfit free generation", // 의상 자유생성
    none: "No guidelines to bundle.",
    export: "Export", // 내보내기
    exporting: "Exporting", // 내보내는 중
    fileDescription: "Directing preset JSON", // 연출 프리셋 JSON
    done: (file: string) => `Saved ${file}.`,
  },
  raw: {
    title: "Preset JSON source", // 프리셋 JSON 원문
    backup: "Back up raw", // 원문 백업
    save: "Save", // 저장
    close: "Close raw editor",
    invalid: "The JSON is not valid.",
  },
  table: {
    filter: (col: string) => `${col} filter`, // {col} 분류 필터
    selected: (n: number) => `${n} selected`, // n개 선택
    clear: "Clear search and filters", // 검색·필터 해제
    noMatch: "No items match the search or filters.", // 검색·필터에 맞는 항목이 없습니다.
    count: (shown: number, total: number) => `${shown} / ${total}`,
    allActive: "All active", // 전체 활성
    someActive: "Some active", // 일부 활성
    controlShown: "Control all shown items", // 현재 표시된 항목 전체 제어
    nothingToChange: "There are no items to change.", // 변경할 항목이 없습니다.
    active: "Active", // 활성
    inactive: "Inactive, excluded from generation", // 비활성 · 생성에서 제외
    requiredGroup: "Required system definitions are always active.", // 필수 시스템 정의는 항상 활성화됩니다.
    duplicate: "Duplicate", // 복제
    delete: "Delete", // 삭제
    confirmDelete: "Confirm delete", // 삭제 확정
    cancelDelete: "Cancel delete", // 삭제 취소
    reorder: (row: string) => `Reorder ${row}`, // {row} 순서 변경
    moveUp: "Move up", // 위로 이동
    moveDown: "Move down", // 아래로 이동
    notSet: "Not set", // 미설정
    system: "System", // 시스템
    systemFixed: (x: string) => `${x} · system fixed`, // {x} · 시스템 고정
    readOnly: "Read-only", // 읽기전용
    checkSettings: "Check settings", // 설정 확인
    edit: (x: string) => `Edit ${x}`,
  },
  fields: {
    weight: "Weight", // 가중치
    weightBelow: "below 1", // 1 미만
    weightAbove: "above 1", // 1 초과
    weightCheck: "check", // 확인 필요
    weightInvalid: (v: string) => `A valid number is required: ${v}`, // 올바른 숫자가 필요합니다: {v}
    maxSelect: "Maximum selections", // 최대 선택
    noLimit: "No limit", // 제한 없음
    minInteger: (n: number) => `Enter an integer of ${n} or more.`, // {n} 이상의 정수를 입력해주세요.
    rangeInteger: (a: number, b: number) => `Enter an integer from ${a} to ${b}.`, // {a}~{b} 범위의 정수를 입력해주세요.
    idSegment: "Each segment starts with a lowercase letter and uses lowercase letters, digits, underscores (and hyphens).", // 각 단계는 영문 소문자로 시작하고 소문자·숫자·밑줄(·하이픈)을 사용하세요.
    idTwoSegments: "Choice IDs need two or more segments.", // 선택형 ID는 두 단계 이상 입력하세요.
    idInUse: "This ID is already in use.", // 이미 사용 중인 ID입니다.
    idRequired: "Enter an ID.", // ID를 입력하세요.
    channelId: "Channel IDs start with custom. and use lowercase dot segments.", // 각 단계는 영문 소문자로 시작하고 … (custom.)
    interactionId: "Enter the ID as category.item.", // 분류.항목 형식의 ID를 입력하세요...
    interactionChars: "IDs may only use lowercase letters, digits, underscores and hyphens.", // ID에는 소문자·숫자·밑줄·하이픈만 사용할 수 있습니다.
    prompt: "Prompt", // 프롬프트
    noOutput: "No output", // 출력 없음
    extraExpressions: "Extra expressions", // 추가 표현
    addExpression: "Add expression", // 표현 추가
    removeExpression: (id: string, n: number) => `Delete ${id} extra expression ${n}`, // {id} 추가 표현 n 삭제
    description: "Description", // 설명
    format: "Format", // 표현 방식
    formatRestrict: "Restrict format", // 표현 방식 제한
    illustration: "Illustration", // 삽화
    comic: "Comic", // 만화
    common: "Common", // 공통
    formatRequired: "Turn the restriction off or choose the format to apply.", // 제한을 끄거나 적용할 표현 방식을 선택해주세요.
  },
  expressions: {
    scope: "Expression scope", // 표현요소 범위
    scopePreset: "Preset", // 프리셋
    scopeSystem: "System", // 시스템
    kind: "Expression kind", // 표현요소 종류
    tagGroups: "Tag groups", // 태그그룹
    freeTags: "Free tags", // 자유태그
    naturalLanguage: "Natural language", // 자연어
    search: "Search expression elements", // 표현요소 검색
    searchPlaceholder: "Search ID, option, prompt", // ID·옵션·프롬프트 검색
    colId: "ID",
    colOptions: "Options", // 옵션
    colScope: "Scope", // 적용
    colContinuity: "Continuity", // 참고
    colFormat: "Format", // 표현
    colLinks: "Links", // 연결
    unlinked: "Unlinked", // 미연결
    usesPrevious: "Uses previous selection", // 이전 선택 참고
    noPrevious: "Does not use previous selection", // 이전 선택 참고 안 함
    addGroup: "Add tag group", // 태그 그룹 추가
    unnamedGroup: "Unnamed tag group", // 이름 없는 태그 그룹
    emptyGroups: "No tag groups to show.", // 표시할 태그그룹이 없습니다.
    addGroupHint: "Add a tag group.", // 태그 그룹을 추가해주세요.
    editGroup: (id: string) => `Edit tag group ${id}`, // {id} 태그 그룹 편집
    channelTable: "Channel table", // 채널 테이블
    channelList: "Expression channel list", // 표현요소 채널 목록
    colChannel: "Channel", // 채널
    used: "Used", // 사용
    notUsed: "Not used", // 안 함
    addChannel: "Add channel", // 채널 추가
    emptyChannels: "No channels to show.", // 표시할 채널이 없습니다.
    addFreeHint: "Add a free tag channel.", // 자유태그 채널을 추가해주세요.
    addTextHint: "Add a natural language channel.", // 자연어 채널을 추가해주세요.
    editChannel: (id: string) => `Edit channel ${id}`, // {id} 채널 편집
    systemNote: "System definitions can only be switched on or off and reordered in the output order.", // 시스템 정의는 출력 순서만 변경할 수 있습니다.
    standalone: "Standalone scene", // 독립 장면
  },
  scopes: {
    scene: "Scene", // 장면
    actor: "Character", // 인물
    female: "Female", // 여성
    male: "Male", // 남성
    interaction: "Interaction", // 상호작용
    legacy: (x: string) => `Existing scope: ${x}`, // 기존 범위: {x}
    pickOne: "Choose one scope to change it.", // 변경하려면 범위를 하나 선택해주세요.
  },
  tagGroup: {
    id: "Tag group ID", // 태그 그룹 ID
    tabs: "Tag group settings", // 태그 그룹 설정
    optionsTab: "Options", // 옵션
    settingsTab: "Group settings", // 그룹설정
    optionTable: "Tag group option table", // 태그 그룹 옵션 테이블
    addOption: "Add option", // 옵션 추가
    emptyOptions: "Add an option.", // 옵션을 추가해주세요.
    optionDetail: "Option detail", // 옵션 상세
    closeDetail: "Close option detail", // 옵션 상세 닫기
    sceneDescription: "Scene description", // 장면 설명
    lastOption: "This is the last selectable option. Delete the tag group or add another option first.", // 마지막 선택 가능한 옵션입니다. ...
    restoreDefaults: "Restore defaults", // 기본값 복원
    scope: "Scope", // 적용 범위
    humanlikeOnly: "Humanoid only", // 인간형만 사용
    usePrevious: "Use previous selection", // 이전 선택 참고
    selection: "Selection", // 선택 방식
    single: "Single", // 단일
    multiple: "Multiple", // 복수
    chooser: "Chooser", // 선택 주체
    byAi: "AI chooses", // AI 선택
    byRules: "Applied by rules only", // 규칙으로만 적용
    commonPrompt: "Common prompt", // 공통 프롬프트
    attributes: "Common option attributes", // 공통 옵션 속성
    attributesNote: "Applies to the common prompt and the options. Values set on an option win.", // 공통 프롬프트와 옵션에 적용합니다. 옵션에서 지정한 값이 우선합니다.
    optionAttributes: "Option attributes",
    description: "Description the AI reads to choose", // 설명
    deleteGroup: "Delete tag group",
    links: (n: number) => `${n} link${n === 1 ? "" : "s"} · shared group`, // 연결 n개 · 공유 그룹
    linkedInteractions: (n: number) => `${n} linked interaction${n === 1 ? "" : "s"}`, // 연결된 상호작용 n개
    readOnly: "This tag group is read-only.",
  },
  attributes: {
    key: "Key",
    value: "Value", // 값 입력
    builtIn: "Built-in attributes", // 기본 제공 속성
    add: "Add attribute", // 속성 추가
    remove: "Delete attribute", // 속성 삭제
    duplicate: "The attribute key is empty or duplicated.", // 속성 키가 비어 있거나 중복됩니다.
    empty: "No attributes.",
  },
  channel: {
    freeId: "Free tag ID", // 자유태그 ID
    textId: "Natural language ID", // 자연어 ID
    name: "Name",
    maxTags: "Maximum tags", // 최대 태그 수
    weight: "Output weight", // 출력 가중치
    limit: "Output limit", // 출력 상한
    maxLength: "Output limit characters", // 출력 상한 글자 수
    guideline: "Writing guideline", // 생성 지침
    usePrevious: "Use previous selection", // 이전 선택 참고
    newFree: "custom.free.new",
    newText: "custom.text.new",
  },
  interactions: {
    tabs: "Interaction view", // port
    basics: "Basics", // 기본설정
    subGroups: "Sub-groups", // 하위그룹
    search: "Search interactions and sub-options", // 상호작용·하위 옵션 검색
    searchPlaceholder: "Search name, ID, sub-option", // 이름·ID·하위 옵션 검색
    categoryList: "Interaction category list", // 상호작용 분류 목록
    colCategory: "Category", // 분류
    colItems: "Items", // 항목
    addCategory: "Add category", // 분류 추가
    emptyCategories: "Add an interaction category.", // 상호작용 분류를 추가해주세요.
    categoryAll: (c: string) => `All of ${c}`, // {c} 분류 전체
    emptyCategoryToggle: "An empty category has no items to activate.", // 빈 분류에는 활성화할 항목이 없습니다.
    aiRowTitle: "AI interaction composition", // AI 상호작용 구성
    aiRowText: "If no defined interaction fits the situation, the AI composes one freely.", // 상황에 맞는 상호작용 정의가 없으면 AI가 자유롭게 구성합니다
    uncategorized: "Uncategorized", // 미분류
    editCategory: (c: string) => `Edit interaction category ${c}`, // {c} 상호작용 분류 편집
    categoryName: "Category ID",
    categoryInvalid: "The category must be a valid dot path.", // 분류는 유효한 dot path여야 합니다.
    categoryExists: "This category already exists. Enter another category ID.", // 이미 존재하는 분류입니다. ...
    deleteWithItems: (n: number) => `${n} interaction${n === 1 ? "" : "s"} will be deleted too.`, // 상호작용 n개 함께 삭제
    deleteWithRules: (n: number) => `${n} related rule${n === 1 ? "" : "s"} will be deleted too.`, // 관련 규칙 n개 함께 삭제
    listOf: (c: string) => `${c} interactions`, // {c} 상호작용
    colDirection: "Direction", // 방향
    colSubGroups: "Sub-groups", // 하위 그룹
    has: "Has", // 있음
    none: "None", // 없음
    subGroupCount: (n: number) => `${n} sub-group${n === 1 ? "" : "s"}`, // 하위 그룹 n개
    addInteraction: "Add interaction", // 상호작용 추가
    emptyInteractions: "Add an interaction.", // 상호작용을 추가해주세요.
    unnamed: "Unnamed interaction", // 이름 없는 상호작용
    backToList: "Back to the interaction list", // 상호작용 목록으로 돌아가기
    mutual: "Mutual", // 상호
    directed: "One-way", // 단방향
    mixed: "Mixed", // 혼합
    id: "Interaction ID", // 상호작용 ID
    direction: "Direction", // 방향
    directionMutual: "Mutual (A ↔ B)",
    directionDirected: "Actor → Target (A → B)", // 행동 주체 → 행동 대상
    target: "Output target", // 출력 대상
    both: "Both", // 양쪽
    relation: "Relation", // 관계
    source: "Actor", // 행동 주체
    targetSide: "Target", // 행동 대상
    legacyValue: (v: string) => `${v} (existing)`, // {v} (기존)
    promptTable: "Interaction prompt table", // 상호작용 프롬프트 테이블
    linkGroups: "Link extra expressions", // 추가 표현 연결
    pickExisting: "Pick an existing group", // 기존 그룹 선택
    createGroup: "Create group", // 그룹 만들기
    linked: "Linked shared groups", // 연결된 공유 그룹
    sharedNote: "Activating a shared group applies to every linked interaction.", // 공유 그룹 활성은 연결된 모든 상호작용에 적용됩니다.
    unlink: "Unlink", // 연결 해제
    emptyLinks: "Link or add a shared group.", // 공유 그룹을 연결하거나 추가해주세요.
    aiMayCreate: "The AI may create interactions that are not defined here.",
  },
  scenes: {
    table: "Scene definition table", // 장면정의 테이블
    tableDescription: "Scene definition list. Choose an ID to edit it in the work area.", // 장면정의 목록. ID를 선택하면 작업영역에서 편집합니다.
    add: "Add scene definition", // 장면정의 추가
    empty: "Add a scene definition.", // 장면정의를 추가해주세요.
    search: "Search ID, description, prompt", // ID·설명·프롬프트 검색
    aiRowTitle: "AI scene composition", // AI 장면 구성
    aiRowText: "If no scene definition fits the situation, the AI composes one freely.", // 상황에 맞는 장면정의가 없으면 AI가 자유롭게 구성합니다
    id: "Scene ID", // 장면 ID
    description: "Scene description", // 장면 설명
    prompt: "Scene prompt", // 장면 프롬프트
    weight: "Scene weight", // 장면 가중치
    groupOff: "The group is off and does not apply. Option settings are preserved.", // 그룹이 꺼져 있어 적용되지 않습니다. 옵션 설정은 보존됩니다.
    unnamed: "Unnamed scene", // 이름 없는 장면
  },
  rules: {
    scope: "Rule scope", // 규칙 범위
    directing: "Directing rules", // 연출규칙
    common: "Common rules", // 공통규칙
    priority: "Upper rules win", // 위쪽 규칙 우선
    jsonView: "View JSON", // JSON 보기
    tableView: "Back to rule list", // 규칙 목록으로
    jsonLabel: (preset: string) => `${preset} common rules JSON`, // {preset} 통합 규칙 JSON
    format: "Format", // 정렬
    applyJson: "Apply JSON",
    jsonInvalid: "Check the rule JSON format.", // 규칙 JSON 형식을 확인해주세요.
    jsonTopLevel: "Enter only a rules array at the top level.", // 최상위에는 rules 배열만 입력하세요.
    duplicateIds: (ids: string) => `Duplicate rule IDs: ${ids}`, // 중복 규칙 ID: …
    references: (n: number) => `Reference check: ${n}`, // 참조 확인 n개
    missingInteraction: (x: string) => `Interaction ${x} could not be found.`, // 상호작용 {x}을 찾을 수 없습니다.
    missingGroup: (x: string) => `Tag group ${x} could not be found.`, // 태그 그룹 {x}을 찾을 수 없습니다.
    missingOption: (g: string, o: string) => `${g} / ${o} could not be found.`, // {group} / {option}을 찾을 수 없습니다.
    table: "Preset rules", // 프리셋 규칙
    colPriority: "Priority", // 우선순위
    colWhen: "When", // 조건
    colFrom: "Condition objects", // 조건 개체
    colAction: "Action", // 문법
    colTo: "Target objects", // 대상 개체
    any: "Any selected", // 하나 이상 선택
    all: "All selected", // 모두 선택
    none: "None selected", // 모두 미선택
    add: "Add", // 추가
    remove: "Remove", // 제거
    addRule: "Add rule", // 규칙 추가
    search: "Search rules", // 규칙 검색
    searchPlaceholder: "Search object ID", // 개체 ID 검색
    empty: "Add a common rule.", // 공통규칙을 추가해주세요.
    legacy: " · old grammar — edit in JSON", //  · 기존 문법 — JSON에서 편집
    channelWarning: "Free tags and natural language are controlled per channel only. A rule naming individual content keeps its source and blocks the whole run.", // 자유태그·자연어는 채널 전체만 제어합니다. ...
    rowLabel: (n: number) => `Rule ${n}`,
    directingPick: "Directing to edit", // 편집할 연출
    directingTable: "Generation guideline rules", // 생성지침 규칙
    directingEmpty: "Add a directing rule.", // 연출규칙을 추가해주세요.
    directingNote: "Directing rules belong to a directing guideline. Edit them as JSON; incomplete rules are kept as drafts.",
    directingJson: (name: string) => `${name} directing rules JSON`,
    incomplete: (ids: string) => `Incomplete rules kept as drafts: ${ids}`,
    saveRules: "Save rules",
    effect: "Effect",
    condition: "Condition",
    enabledRule: "Rule active",
  },
  picker: {
    title: "Object selection", // 개체 선택
    close: "Close object selection", // 개체 선택 닫기
    apply: "Apply", // 적용
    addTo: (n: string) => `Add ${n}`, // {n} 추가
    editItem: (n: string, i: number) => `Edit ${n} ${i}`, // {n} n 편집
    moreItems: (label: string, n: number) => `${label} and ${n} more`, // {label} 외 n
    position: "Target position", // 대상 / 개체 위치
    current: "Current object", // 현재 개체
    source: "Actor", // 행동 주체
    target: "Target", // 행동 대상
    scene: "Scene", // 장면
    persona: "Persona", // 페르소나
    actor: "All characters", // 등장 인물 전체
    sourceTargetNote: "Actor and target are offered when an interaction or one of its sub-groups is part of the condition.", // source·target은 상호작용 또는 그 하위그룹을 조건으로 ...
    search: "Search rule objects", // 규칙 개체 검색
    searchPlaceholder: "Search name, path, option", // 이름·경로·옵션 검색
    wholeGroup: "Whole group", // 그룹 전체
    selectedCount: (n: number) => `${n} selected`, // 선택됨 n
    empty: "No selectable objects.", // 선택 가능한 개체가 없습니다.
    noResults: "No results.", // 검색 결과가 없습니다.
    kindGroup: "Tag group",
    kindInteraction: "Interaction",
    kindChannel: "Channel",
    remove: "Remove object", // 연결 해제
  },
  order: {
    main: "Main prompt", // 메인 프롬프트
    actor: "Character prompt", // 캐릭터 프롬프트
    restore: "Restore default order", // 순서 기본값 복원
    tagLane: (t: string) => `${t} tag output order`, // {메인|캐릭터} 태그 출력 순서
    textLane: (t: string) => `${t} natural-language output order`, // … 자연어 출력 순서
    rating: "Rating", // rating
    count: "People count", // 인원수
    artist: "Artist tags", // 작가태그
    base: "Base prompt", // 기본 프롬프트
    outfit: "Outfit prompt", // 의상 프롬프트
    kindGroup: "Group tag", // 그룹태그
    kindFree: "Free tags", // 자유태그
    kindText: "Natural language", // 자연어
    kindInteraction: "Interaction", // 상호작용
    disabled: " · inactive", //  · 비활성
    interactionRow: "Interactions", // 상호작용
  },
  guidelines: {
    kindScene: "Directing guideline", // 연출지침
    kindRatio: "Ratio guideline", // 비율지침
    kindCharacter: "Character free-generation guideline", // 인물 자유생성 지침
    kindOutfit: "Outfit free-generation guideline", // 의상 자유생성 지침
    freeKind: "Free generation kind", // 자유생성 종류
    character: "Character", // 인물생성
    outfit: "Outfit", // 의상생성
    illustrationOnly: "Illustration only", // 삽화전용
    search: (kind: string) => `Search ${kind}`, // {kind} 검색
    searchPlaceholder: "Search name or guideline", // 이름·지침 검색
    table: (kind: string) => `${kind} table`, // {kind} 테이블
    colSelect: "Use", // 선택
    colName: "Name", // 이름
    colFormat: "Format", // 표현
    colText: "Guideline", // 지침
    useForGeneration: (kind: string) => `Use this ${kind} for generation`, // 생성에 사용할 {kind}
    inUse: "In use", // 사용중
    add: (kind: string) => `Add ${kind}`, // {kind} 추가
    empty: (kind: string) => `Add a ${kind}.`, // {kind}을 추가해주세요.
    defaultKept: "The default guideline must be kept.", // 기본 지침은 유지해야 합니다.
    defaultFixed: "The default guideline is fixed.", // 기본 지침은 고정값입니다.
    defaultFormatFixed: "The format of a default guideline is fixed.", // 기본 지침의 표현 방식은 고정값입니다.
    referenced: "Delete or reconnect the rules that reference this directing first.", // 이 연출을 참조하는 규칙을 먼저 삭제하거나 재연결해주세요.
    saveBeforeRestore: "Save or discard the unsaved edits before restoring.", // 미저장 편집을 저장하거나 버린 뒤 복원해주세요.
    name: "Guideline name", // 지침 이름
    ratioName: "Ratio guideline name", // 비율지침 이름
    text: "Generation guideline", // 생성 지침
    relatedRules: "Related rules", // 관련 규칙
    delete: "Delete guideline", // 지침 삭제
    deleteDescription: "This guideline and its own rules are deleted. If another guideline references it, clean up those links first.", // 이 지침과 소유 규칙을 삭제합니다. ...
    duplicate: "Duplicate",
    restore: "Restore default options", // 기본 옵션 복원
    restoreTitle: "Restore defaults", // 기본값으로 되돌리기
    restoreDefault: "The guideline body is reset to empty. Format and rules are kept.", // 지침 본문을 빈값으로 되돌립니다. 표현 방식과 규칙은 유지합니다.
    restoreProvided: "Format, guideline body and provided rules are restored. Rules you added are kept.", // 표현 방식·지침 본문·제공 규칙을 복원합니다. 사용자 추가 규칙은 유지합니다.
    allowedSizes: "Allowed ratios", // 허용 비율
    sizeRequired: "Choose at least one image size.", // 이미지 크기를 하나 이상 선택해주세요.
    custom: "custom",
    characterCriteria: "Character creation criteria", // 인물 생성 기준
    outfitCriteria: "Outfit criteria", // 의상 생성 기준
    characterDesign: "Character base design", // 인물 베이스 디자인 기준
    outfitDesign: "Outfit design", // 의상 디자인 기준
    freeName: (x: string) => `${x} name`, // {x} 이름
    firstOutfitNote: (name: string) => `The first outfit uses the selected outfit design guideline: ${name}`, // 최초 의상은 선택한 의상 디자인 기준을 적용합니다: {name}
    outfitNote: "Applies to the first outfit of a character and to new outfits of existing characters.", // 인물 최초 의상과 기존 인물의 새 의상에 공통 적용합니다.
    restoreField: (label: string) => `Restore ${label} default`, // {label} 기본값 복원
    freeEmpty: "Enter the free-generation guideline or restore the default.", // 자유생성 지침을 입력하거나 기본값으로 복원해주세요.
    save: "Save", // 저장
    discard: "Discard",
    notFound: "The guideline could not be found.", // 지침을 찾을 수 없습니다.
    defaultBadge: "Default",
    providedBadge: "Provided",
    executionTitle: "Format controls",
    speechBubble: "Speech bubbles", // 말풍선
    povHands: "POV hands", // POV 손
    comicFrame: "Comic frame",
    frameNone: "None",
    frameThin: "Thin",
    frameBold: "Bold",
    legacyImport: "Import previous directions again",
    legacyImported: (n: number) => `${n} previous direction${n === 1 ? "" : "s"} imported.`,
  },
  help: {
    toggle: "Help",
  },
} as const;

/** Short English help per screen (port replacement for the built-in manual pages, spec §6.4). */
export const ATELIER_HELP = {
  expressions:
    "Expression elements are what the AI can pick or write for an image. Tag groups hold options the AI chooses from (or that rules apply); free-tag channels let it write English tags; natural-language channels let it write an English sentence. The system scope shows the built-in elements: you can switch them on or off and reorder them in the output order.",
  interactions:
    "Interactions are actions between two people (actor → target, or mutual). Each has prompts and may link shared sub-groups for extra detail. When no defined interaction fits, the AI composes one freely.",
  scenes:
    "Scene definitions describe whole-scene situations the AI can choose by reading their description; the chosen definition adds its prompt. When none fits, the AI composes the scene freely.",
  guidelines:
    "Generation guidelines are global (not part of a preset). Directing guidelines steer how scenes are staged and own directing rules; ratio guidelines limit the allowed image sizes; free-generation guidelines define how new characters and outfits are created. The selected item of each kind is used for generation.",
  order:
    "The output order decides where each element's tags land in the main prompt and in each character prompt. Drag rows or use the move menu; rating, people count and artist tags (main) and base and outfit prompts (character) stay fixed.",
} as const;

/**
 * Rules guide (port translation of the native AM rules guide `_lt`, condensed): how a rule reads and what each part does.
 */
export const RULES_GUIDE = {
  intro:
    "A rule reads: when the condition objects are selected (any / all / none of them), add or remove the target objects. Rules are checked from the top; an upper rule wins over a lower one.",
  rows: [
    { term: "When · Any selected", text: "The rule fires when at least one condition object was chosen." },
    { term: "When · All selected", text: "The rule fires only when every condition object was chosen." },
    { term: "When · None selected", text: "The rule fires when none of the condition objects was chosen." },
    { term: "Action · Add", text: "Adds the target objects (options are forced on; a whole group lets the AI pick inside it)." },
    { term: "Action · Remove", text: "Removes the target objects from what the AI may choose or what is written." },
    { term: "Position", text: "Where an object is looked up or applied: current object, interaction actor or target, scene, persona, or all characters." },
    { term: "Channels", text: "Free-tag and natural-language channels can only be removed as a whole (target side)." },
  ],
  example: "Example: when gaze.direction / looking_at_viewer (any) → add expression.blush / blush at the current object.",
} as const;
