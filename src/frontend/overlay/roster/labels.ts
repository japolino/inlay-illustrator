/** English labels of the roster sidebar, charx rail and custom character editor (Korean originals in comments). */
export const ROSTER_LABELS = {
  roster: "Roster", // 로스터
  registerPeople: "Register people", // 인물 등록
  loadModules: "Load modules", // 모듈 불러오기
  references: "References", // 참고자료
  characterTasks: "Character tasks", // 캐릭터 작업
  registrationMethod: "Person registration method", // 인물 등록 방식
  lorebook: "Lorebook", // 로어북
  custom: "Custom", // 커스텀
  sidebarSearch: "Sidebar person search", // 사이드바 인물 검색
  moduleSearch: "Module search", // 모듈 검색
  moduleSearchPlaceholder: "Search modules…", // 모듈 검색…
  listView: "List view", // 목록 보기
  gridView: "Grid view", // 그리드 보기
  sidebarFilter: "Sidebar display filter", // 사이드바 표시 필터
  addPerson: "Add person", // 인물 추가
  backToLorebooks: "Back to lorebooks", // 로어북으로 돌아가기
  expandRoster: "Expand roster", // 로스터 펼치기
  collapseRoster: "Collapse to sidebar", // 사이드바로 접기
  active: (n: number) => `Active ${n}`, // 활성 N
  registered: (n: number) => `Registered ${n}`, // 등록 N
  descriptionBadge: "Description", // 설명
  aiGenerated: "AI generated", // AI 생성
  selectAsReference: (title: string) => `${title} select as reference`, // ${title} 참고자료 선택
  info: "Info", // 정보
  infoOf: (title: string) => `${title} info`, // ${title} 정보
  removeFromRoster: "Remove from roster", // 로스터 제외
  removeFromRosterOf: (title: string) => `${title} remove from roster (unregister)`, // ${title} 로스터 제외 (등록 해제)
  removeFailed: "Could not remove from roster.", // 로스터에서 제외하지 못했습니다.
  personMenu: "Person menu", // 인물 메뉴
  personMenuOf: (title: string) => `${title} person menu`, // ${e} 인물 메뉴
  editPerson: "Edit person", // 인물 편집
  viewInfo: "View info", // 정보 보기
  promote: "Promote to registered person", // 등록 인물로 승격
  deletePerson: "Delete person", // 인물 삭제
  deleteConfirm: "Delete this person?", // 이 인물을 삭제할까요?
  confirmDelete: "Confirm delete", // 삭제 확인
  deleting: "Deleting…", // 삭제 중…
  cancel: "Cancel", // 취소
  closeLorebookInfo: "Close lorebook info", // 로어북 정보 닫기
  closeCustomInfo: "Close custom person info", // 커스텀 인물 정보 닫기
  close: "Close", // 닫기
  keys: "Keys", // 키
  noContent: "No content.", // 내용이 없습니다.
  recognitionKeys: "Plugin recognition keys", // 플러그인 인식 키
  appearance: "Appearance description", // 외형 설명
  loading: "Loading charx sidebar data", // charx 사이드바 데이터 불러오는 중
  emptyFiltered: "No people match the conditions.", // 조건에 맞는 인물이 없습니다.
  emptyCustom: "No custom people added.", // 추가된 커스텀 인물이 없습니다.
  emptyCharacters: "No people to show.", // 표시할 인물이 없습니다.
  emptyLorebooks: "No lorebooks to show.", // 표시할 로어북이 없습니다.
  emptyModulesSearch: "No search results.", // 검색 결과가 없습니다.
  emptyModules: "No modules to load.", // 불러올 모듈이 없습니다.
  noCharacter: "Open a character chat or pick a character in the rail.",
  // bulk (HT)
  registerAll: "Register all", // 전체 등록
  unregisterAll: "Unregister all", // 등록 해제
  registerSearch: "Register search results", // 검색 결과 등록
  unregisterSearch: "Unregister search results", // 검색 결과 해제
  registerShown: "Register shown results", // 표시 결과 등록
  unregisterShown: "Unregister shown results", // 표시 결과 해제
  activateAll: "Activate all", // 전체 활성
  deactivateAll: "Deactivate all", // 전체 비활성
  activateSearch: "Activate search results", // 검색 결과 활성
  deactivateSearch: "Deactivate search results", // 검색 결과 비활성
  activateShown: "Activate shown results", // 표시 결과 활성
  deactivateShown: "Deactivate shown results", // 표시 결과 비활성
  // filters
  filterActive: "Active", // 활성
  filterInactive: "Inactive", // 비활성
  filterRegistered: "Registered", // 등록
  filterUnregistered: "Unregistered", // 미등록
  filterSource: "Source", // 출처
  originAll: "All", // 전체
  originLorebook: "Lorebook", // 로어북
  originModule: "Module", // 모듈
  originCustom: "Custom", // 커스텀
  originAi: "AI generated", // AI 생성
  // modules
  moduleCounts: (entries: number, assets?: number) => (assets === undefined ? `Lorebooks ${entries}` : `Assets ${assets} · Lorebooks ${entries}`), // 에셋 N · 로어북 N
  moduleLoad: (name: string) => `${name} load`, // 불러오기
  moduleDisconnect: (name: string) => `${name} disconnect`, // 연결 해제
  moduleAttached: "Attached to the character",
  metaUnanalyzed: "Unanalyzed", // 미분석
  metaNone: "None", // 없음
  metaPresent: "Present", // 있음
  metaPartial: "Partial", // 부분
  // rail
  characterSelection: "Character selection", // 캐릭터 선택
  characterSelectionOf: (name: string) => `Character selection: ${name}`, // 캐릭터 선택: ${i}
  settings: "Inlay Illustrator settings", // Asset Maid 설정
  backToWorkspace: "Back to workspace", // 작업공간으로 돌아가기
  noCharacters: "No characters yet.",
  railLoading: "Loading characters"
} as const;

export const EDITOR_LABELS = {
  addCharacter: "Add character", // 캐릭터 추가
  editCharacter: (title: string) => `Edit character · ${title || "No name"}`, // 캐릭터 편집 · … / 이름 없음
  unsaved: (title: string) => `${title || "Current character"}'s changes are not saved.`, // …의 변경 사항이 저장되지 않았습니다.
  saveAndOpen: "Save and open", // 저장 후 열기
  discardAndOpen: "Discard and open", // 변경 버리고 열기
  keepEditing: "Keep editing", // 계속 편집
  name: "Character name", // 캐릭터 이름
  namePlaceholder: "e.g. Aria", // 예: 아리아
  nameError: "Please enter the character name.", // 캐릭터 이름을 입력해주세요.
  keys: "Plugin recognition keys", // 플러그인 인식 키
  keysHint: "Used for the plugin's character recognition; write several variants.", // 플러그인의 캐릭터 인식에 사용되며 다양한 버전으로 적어주세요.
  keysPlaceholder: "e.g. Aria, aria", // 예: 아리아, aria
  keysError: "Please enter at least one recognition key.", // 인식 키를 하나 이상 입력해주세요.
  sharedKeys: (keys: string) => `Keys shared with other custom people: ${keys} — saving is still allowed.`, // 다른 커스텀 인물과 겹치는 키 … 저장은 가능합니다.
  appearance: "Appearance description", // 외형 설명
  appearancePlaceholder: "Used only for body analysis and not required. Write natural language, not a prompt. English is recommended.", // 본문 분석에만 사용되며 …
  deleteCharacter: "Delete character", // 캐릭터 삭제
  delete: "Delete", // 삭제
  confirmDeleteCharacter: "Confirm character delete", // 캐릭터 삭제 확인
  confirmDelete: "Confirm delete", // 삭제 확인
  cancelDeleteCharacter: "Cancel character delete", // 캐릭터 삭제 취소
  cancelDelete: "Cancel delete", // 삭제 취소
  cancelAdd: "Cancel character add", // 캐릭터 추가 취소
  cancelAddShort: "Cancel add", // 추가 취소
  cancelChanges: "Cancel character changes", // 캐릭터 변경 취소
  cancelChangesShort: "Cancel changes", // 변경 취소
  save: "Save character", // 캐릭터 저장
  saveChanges: "Save character changes", // 캐릭터 변경 저장
  saveShort: "Save", // 저장
  saving: "Saving", // 저장 중
  back: "Back", // 뒤로가기
  backTitle: "Return to previous work screen" // 이전 작업 화면으로 돌아가기
} as const;
