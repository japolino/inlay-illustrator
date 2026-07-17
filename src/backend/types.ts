export type CharacterJson = {
  name?: unknown;
  label?: unknown;
  age?: unknown;
  identity?: unknown;
  appearance?: unknown;
  body?: unknown;
  attire?: unknown;
  expression?: unknown;
  action?: unknown;
  composition?: unknown;
};

export type EnvironmentJson = {
  location?: unknown;
  timeWeather?: unknown;
  lightingMood?: unknown;
  backgroundElements?: unknown;
};

export type ShotJson = {
  paragraph?: unknown;
  camera?: unknown;
  situation?: unknown;
  action?: unknown;
  characters?: CharacterJson[];
  sharedComposition?: unknown;
  supplement?: unknown;
  negative?: unknown;
};

export type SceneJson = ShotJson & { place?: unknown; environment?: EnvironmentJson; shots?: ShotJson[] };
export type ParsedPayload = { scenes?: SceneJson[] };

export type AssembledPrompt = {
  /** Ordered tag and prose sections, rendered with syntax-specific separators. */
  sections: string[];
};

export type PromptEntry = {
  prompt: AssembledPrompt;
  negative: string;
  paragraph: number;
  parserParagraph: number;
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
  paragraph: number;
  parameters: Record<string, unknown>;
};

export type State = {
  characterAppearance: Record<string, string>;
  generated: Record<string, unknown>;
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
};

export type GeneratedRecord = {
  chatId: string;
  messageId: string;
  swipeId: number;
  prompts: string[];
  paragraphs: number[];
  imageIds: string[];
  imageUrls: string[];
  rawJson: ParsedPayload;
  createdAt: string;
};
