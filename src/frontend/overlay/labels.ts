/**
 * English labels for the overlay shell (Korean originals from Asset Maid in
 * comments; see extract/ui/labels.json). Keep every shell label here so a
 * Korean locale can be added later.
 */
export const SHELL_LABELS = {
  appName: "Inlay Illustrator",
  workspaceNav: "Asset Maid workspace", // Asset Maid 작업공간
  close: "Close", // 닫기
  openSettings: "Open settings screen", // 설정 화면 열기
  settings: "Asset Maid settings", // Asset Maid 설정
  backToWorkspace: "Back to Asset Maid", // 에셋메이드로 돌아가기
  sidebarToggle: (label: string) => `${label} open/close`, // ${c} 열기/닫기
  sidebarClose: (label: string) => `${label} close`, // ${c} 닫기
  rosterList: "Lorebook list", // 로어북 목록
  settingsList: "Settings list", // 설정 목록
  characterSelection: "Character selection", // 캐릭터 선택
  noCharacter: "No character",
  noChat: "Open a chat to start.",
  rosterTitle: "Roster", // 로스터
  rosterPlaceholder: "Characters from the current card and its lorebooks appear here.",
  placeholderNote: "This screen is part of the Asset Maid port and is not available yet.",
  stopTask: "Stop task", // 작업 중지
  closeNotification: "Close notification", // 알림 닫기
  cancel: "Cancel", // 취소
  closeWorkspace: "Close workspace", // 작업영역 닫기
  backToWorkspaceShort: "Back to workspace", // 작업공간으로 돌아가기
  noCharacterSelected: "Pick a character in the rail, or open a character chat.",
  reload: "Reload", // 다시 불러오기
  loadingData: "Loading Asset Maid data", // Asset Maid 데이터 불러오는 중
  splitAdjust: "Main area / workspace width adjust", // 메인 영역과 작업 영역 너비 조절
  widthAdjust: (label: string) => `${label} width adjust`, // ${c} 너비 조절
  connectionFailed: "Could not reach the Inlay Illustrator backend.",
  retry: "Retry"
} as const;

export type WorkspaceTab = "assets" | "prompts" | "artists" | "persona";

/** Tab definitions (`lU`, AssetMaid.pretty.js 151701-151706). */
export const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string; mobileLabel: string; returnLabel: string; description: string }> = [
  { id: "assets", label: "Asset analysis", mobileLabel: "Assets", returnLabel: "Back to asset analysis", description: "Analyse character images and outfits." }, // 에셋분석 / 에셋 / 에셋분석으로 돌아가기
  { id: "prompts", label: "Prompts", mobileLabel: "Prompts", returnLabel: "Back to prompts", description: "Edit the prompts of registered people." }, // 프롬프트 / 프롬프트로 돌아가기
  { id: "artists", label: "Artist selection", mobileLabel: "Artists", returnLabel: "Back to artist selection", description: "Choose artist tags for image generation." }, // 작가선택 / 작가 / 작가선택으로 돌아가기
  { id: "persona", label: "Persona", mobileLabel: "Persona", returnLabel: "Back to persona", description: "Persona appearance and outfits." } // 페르소나 / 페르소나로 돌아가기
];

export type SettingsSection = "analysis-profile" | "charx" | "all-charx" | "model" | "image-model" | "system" | "logs";

/** Settings navigation (`yxt`/`bxt`, AssetMaid.pretty.js 145733-145752). Default item: "charx". */
export const SETTINGS_GROUPS: Array<{ label: string; items: Array<{ id: SettingsSection; label: string; developerOnly?: boolean }> }> = [
  { label: "Asset Maid", items: [{ id: "analysis-profile", label: "Analysis settings" }] }, // 분석설정
  {
    label: "Character",
    items: [
      { id: "charx", label: "Current character settings" }, // 현재 charx 설정
      { id: "all-charx", label: "All characters settings" } // 전체 charx 설정
    ]
  },
  {
    label: "System",
    items: [
      { id: "model", label: "Model settings" }, // 모델설정
      { id: "image-model", label: "Image generation model settings" }, // 이미지 생성 모델 설정
      { id: "system", label: "System settings" } // 시스템설정
    ]
  },
  { label: "Developer", items: [{ id: "logs", label: "Run logs", developerOnly: true }] } // 실행 로그
];

export const DEFAULT_SETTINGS_SECTION: SettingsSection = "charx";

/** @deprecated interim labels (settings sub-agent replaces them). */
export const SYSTEM_SETTINGS_LABELS = {
  displaySection: "In-chat display",
  fabCorner: "Floating button corner",
  fabCornerDescription: "Corner of the chat-side Inlay button.",
  imageAspect: "Image frame",
  imageAspectDescription: "Frame ratio of illustrations inside messages.",
  imageHeight: "Maximum image height",
  imageHeightDescription: "Percent of the viewport height.",
  alignment: "Align images left",
  alignmentDescription: "Otherwise images are centred.",
  diagnosticsSection: "Diagnostics",
  debugLogging: "Debug logging",
  debugLoggingDescription: "Write detailed stage logs to the extension log.",
  developerMode: "Developer mode",
  developerModeOn: "Developer mode is on. Run logs are visible in the settings list.",
  developerModeEnabled: "Developer mode enabled.",
  developerModeDisabled: "Developer mode disabled."
} as const;

export const LAUNCHER_LABELS = {
  title: "Inlay Illustrator",
  subtitle: "Scene illustrations and character assets (Asset Maid port).",
  open: "Open Inlay Illustrator",
  settings: "Open settings",
  status: "Status",
  backend: "Backend",
  ready: "Ready",
  connecting: "Connecting…",
  error: "Error",
  character: "Character",
  none: "None",
  imageProvider: "Image generation",
  notConnected: "No image connection",
  permissions: "Permissions",
  missing: (list: string) => `Missing: ${list}`,
  jobs: "Jobs",
  idle: "Idle",
  autoGeneration: "Automatic chat images", // 자동 생성
  autoGenerationHint: "Illustrate new assistant messages automatically.",
  fabCorner: "Floating button",
  inputBarLabel: "Inlay Illustrator",
  inputBarSubtitle: "Open the Asset Maid workspace"
} as const;
