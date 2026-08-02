export type CharacterJson = {
  name?: unknown;
  label?: unknown;
  age?: unknown;
  appearance?: unknown;
  body?: unknown;
  attire?: unknown;
  expression?: unknown;
  action?: unknown;
  negative?: unknown;
};

export type ShotJson = {
  paragraph?: unknown;
  camera?: unknown;
  situation?: unknown;
  action?: unknown;
  characters?: CharacterJson[];
  supplement?: unknown;
  negative?: unknown;
  quote?: unknown;
};

export type SceneJson = ShotJson & {
  place?: unknown;
  shots?: ShotJson[];
};

export type ParsedPayload = {
  scenes?: SceneJson[];
};

export type AssembledPrompt = {
  /** Ordered tag and prose sections, rendered with syntax-specific separators. */
  sections: string[];
  /** Default prompt style keeps legacy formatting; Anima uses normalized ordered sections. */
  format?: "legacy" | "ordered";
};

export type PromptEntry = {
  prompt: AssembledPrompt;
  corePrompt: AssembledPrompt;
  shotNegative: string;
  negative: string;
  paragraph: number;
  parserParagraph: number;
  quote: string;
};

export type PreparedParagraph = { parserIndex: number; originalIndex: number; text: string };
export type NormalizedScene = { scene: SceneJson; shot: ShotJson; parserParagraph: number };

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  swipe_id?: unknown;
};

export type ParserContext = {
  systemContext: string;
  /** Stable references safe for the visual-beat preprocessing call. Lorebook prose is intentionally excluded. */
  preprocessingSystemContext?: string;
  recentContext: string;
  override: string;
  diagnostics: Record<string, unknown>;
};

export type ParserConnection = {
  id: string;
  name: string;
  provider: string;
  model: string;
};

export type ImageConnection = {
  id: string;
  name: string;
  provider: string;
  model: string;
  is_default?: boolean;
  default_parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type ComfyUIMapping = {
  nodeId: string;
  fieldName: string;
  mappedAs: string;
};

export type ComfyUIConfig = {
  workflow_json?: Record<string, unknown>;
  workflow_api_json?: Record<string, unknown>;
  field_mappings?: ComfyUIMapping[];
};

export type PreparedImageJob = {
  index: number;
  total: number;
  prompt: string;
  negative: string;
  corePrompt?: string;
  shotNegative?: string;
  promptFormat?: NonNullable<AssembledPrompt["format"]>;
  paragraph: number;
  parserParagraph?: number;
  quote?: string;
  parameters: Record<string, unknown>;
};

export type State = {
  characterAppearance: Record<string, string>;
  /**
   * Exact user-saved baselines. Automatic parser memory may create and update
   * characterAppearance entries, but it must never replace these values.
   */
  manualCharacterAppearance?: Record<string, string>;
  generated: Record<string, unknown>;
  /** Compact lookup for records stored outside the continuity-state document. */
  generatedImageIndex?: Record<string, { key: string; index: number }>;
  /** Ignored legacy state retained only until the next state write. */
  previousVisualState?: unknown;
};

export type GeneratedRecordReference = {
  storageVersion: 2;
  recordPath: string;
  chatId: string;
  messageId: string;
  swipeId: number;
  paragraphs: number[];
  imageIds: string[];
  imageUrls: string[];
  createdAt: string;
};

export type ParserGenerationRequest = {
  type: "raw";
  provider: string;
  model: string;
  connection_id: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  parameters?: Record<string, unknown>;
  reasoning: { source: "off" };
  userId?: string;
  signal?: AbortSignal;
};

export type GeneratedRecord = {
  chatId: string;
  messageId: string;
  swipeId: number;
  prompts: string[];
  negativePrompts: string[];
  quotes?: string[];
  /** Exact provider parameters used per image, retained for reproducible rerolls. */
  imageParameters?: Array<Record<string, unknown>>;
  /** Generated prompt layer without user-selectable prefixes or suffixes. */
  corePrompts?: string[];
  /** Parser-provided negative layer without user-selectable preset/custom negatives. */
  shotNegatives?: string[];
  promptFormats?: Array<NonNullable<AssembledPrompt["format"]>>;
  paragraphs: number[];
  imageIds: string[];
  imageUrls: string[];
  rawJson: ParsedPayload;
  createdAt: string;
};
