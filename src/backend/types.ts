import type { PerspectiveMode } from "../shared/config.js";

export type CharacterCompositionJson = {
  position?: unknown;
  pose?: unknown;
  actions?: unknown;
  gaze?: unknown;
};

export type SharedCompositionJson = {
  interaction?: unknown;
  spatialRelation?: unknown;
};

export type CameraJson = {
  framing?: unknown;
  angle?: unknown;
  perspective?: unknown;
  focus?: unknown;
};

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
  composition?: CharacterCompositionJson | string;
  /** Shot-only framing note. Never persisted into character memory. */
  renderScope?: unknown;
  /** Shot-only Creative projection containing only traits actually visible in frame. */
  visibleTags?: unknown;
};

export type EnvironmentJson = {
  location?: unknown;
  timeWeather?: unknown;
  lightingMood?: unknown;
  backgroundElements?: unknown;
};

export type ShotJson = {
  paragraph?: unknown;
  perspectiveMode?: unknown;
  camera?: CameraJson | string;
  situation?: unknown;
  action?: unknown;
  characters?: CharacterJson[];
  sharedComposition?: SharedCompositionJson | string;
  supplement?: unknown;
  negative?: unknown;
};

export type SceneJson = ShotJson & { place?: unknown; environment?: EnvironmentJson; shots?: ShotJson[] };
export type ParsedPayload = { scenes?: SceneJson[] };

export type CreativeConcept = {
  id: string;
  paragraph: number;
  anchor: string;
  concept: string;
  renderScope: string;
  camera: string;
  visibleCues: string[];
  score: number;
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
  perspectiveMode: PerspectiveMode;
  perspectiveSource: "adaptive" | "manual";
  creativeConcept?: CreativeConcept;
  creativeCandidates?: CreativeConcept[];
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
  perspectiveMode?: PerspectiveMode;
  perspectiveSource?: "adaptive" | "manual";
  creativeConcept?: CreativeConcept;
  creativeCandidates?: CreativeConcept[];
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
  negativePrompts: string[];
  perspectiveModes: PerspectiveMode[];
  perspectiveSources: Array<"adaptive" | "manual">;
  /** Exact provider parameters used per image, retained for reproducible rerolls. */
  imageParameters?: Array<Record<string, unknown>>;
  /** Generated prompt layer without user-selectable prefixes or suffixes. */
  corePrompts?: string[];
  /** Parser-provided negative layer without user-selectable preset/custom negatives. */
  shotNegatives?: string[];
  promptFormats?: Array<NonNullable<AssembledPrompt["format"]>>;
  /** Selected Creative concept per image, or null when the image did not use Creative. */
  creativeConcepts?: Array<CreativeConcept | null>;
  /** Candidate slate retained per image for conceptually varied sidecar reruns. */
  creativeConceptCandidates?: CreativeConcept[][];
  /** IDs of Creative concepts already used for each image slot. */
  creativeConceptHistory?: string[][];
  paragraphs: number[];
  imageIds: string[];
  imageUrls: string[];
  rawJson: ParsedPayload;
  createdAt: string;
};
