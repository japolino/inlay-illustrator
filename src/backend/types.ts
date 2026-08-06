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

/**
 * Shot-only rendering priority. This never becomes character or environment
 * memory; it selects the small subset of factual scene data that should
 * dominate a Dynamic image.
 */
export type ShotPlanJson = {
  primaryAction?: unknown;
  secondaryCue?: unknown;
  staging?: unknown;
};

export type CharacterJson = {
  name?: unknown;
  label?: unknown;
  age?: unknown;
  identity?: unknown;
  appearance?: unknown;
  body?: unknown;
  attire?: unknown;
  /** True when attire was plausibly inferred for this scene instead of sourced from durable character facts. */
  attireInferred?: unknown;
  /** Stable visual fields explicitly changed by the current numbered source. */
  visualChanges?: unknown;
  expression?: unknown;
  action?: unknown;
  composition?: CharacterCompositionJson | string;
  /** Shot-only framing note. Never persisted into character memory. */
  renderScope?: unknown;
  /** Shot-only rendering projection containing only traits actually visible in frame. */
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
  shotPlan?: ShotPlanJson | string;
  situation?: unknown;
  action?: unknown;
  characters?: CharacterJson[];
  sharedComposition?: SharedCompositionJson | string;
  supplement?: unknown;
  negative?: unknown;
};

export type SceneJson = ShotJson & {
  place?: unknown;
  environment?: EnvironmentJson;
  /** Environment fields explicitly changed by the current numbered source. */
  environmentChanges?: unknown;
  shots?: ShotJson[];
};

/**
 * Non-rendered continuity snapshot after the final numbered paragraph. This
 * lets narrative state advance even when the final paragraph is not selected
 * for illustration.
 */
export type TerminalVisualStateJson = {
  paragraph?: unknown;
  environment?: EnvironmentJson;
  place?: unknown;
  environmentChanges?: unknown;
  characters?: CharacterJson[];
};

export type ParsedPayload = {
  /** Optional whole-message promotional key visual. It is rendered above the prose, not assigned to a paragraph. */
  cover?: SceneJson;
  scenes?: SceneJson[];
  terminalState?: TerminalVisualStateJson;
};

export type CreativeConcept = {
  id: string;
  paragraph: number;
  /** Identity-safe focal category. Missing only on legacy persisted concepts. */
  subjectType?: "object" | "environment" | "shadow" | "silhouette" | "reflection" | "fragment" | "spatial";
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
  /** Cover entries render above the message; paragraph entries keep their numbered source placement. */
  placement?: "cover" | "paragraph";
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
  placement?: "cover" | "paragraph";
  paragraph: number;
  parserParagraph?: number;
  perspectiveMode?: PerspectiveMode;
  perspectiveSource?: "adaptive" | "manual";
  creativeConcept?: CreativeConcept;
  creativeCandidates?: CreativeConcept[];
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
  previousVisualState?: PreviousVisualState;
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
  operationId?: string;
  generationStatus?: GenerationStatus;
};

export type PreviousVisualCharacter = {
  name: string;
  label: string;
  age: string;
  appearance: string;
  body: string;
  attire: string;
  attireInferred: boolean;
};

export type PreviousVisualState = {
  characters: PreviousVisualCharacter[];
  environment: {
    location: string;
    timeWeather: string;
    lightingMood: string[];
    backgroundElements: string[];
  };
  place: string;
  updatedAt: string;
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
  /** Placement per image. Missing entries on older records are treated as paragraph inlays. */
  placements?: Array<"cover" | "paragraph">;
  paragraphs: number[];
  imageIds: string[];
  imageUrls: string[];
  /** Stable per-prompt slots allow results to be persisted in completion order without changing narrative order. */
  slotStatuses?: GenerationSlotStatus[];
  slotErrors?: string[];
  operationId?: string;
  generationStatus?: GenerationStatus;
  /** Fingerprint of the narrative source, used to reject late results after an edit or swipe change. */
  sourceFingerprint?: string;
  rawJson: ParsedPayload;
  createdAt: string;
};

export type GenerationSlotStatus = "pending" | "generating" | "completed" | "failed" | "cancelled";
export type GenerationStatus = "pending" | "completed" | "failed" | "cancelled";


// ─── Spindle type augmentation ─────────────────────────────────────────
// lumiverse-spindle-types@0.6.2 predates the host's includeDataUrl option.
// Declared here so generation.ts can opt out of the base64 imageDataUrl RPC
// payload (host-side: Lumiverse spindle worker-host-image-gen-api, commit
// "feat(spindle): let extensions opt out of the base64 imageDataUrl payload";
// types-side: prolix-oc/lumiverse-spindle-types PR #38).
// Remove once the published types include the field.
declare module "lumiverse-spindle-types" {
  interface ImageGenRequestDTO {
    /** Ask the host to omit the base64 imageDataUrl from the result. The host still persists the image and returns imageId/imageUrl. */
    includeDataUrl?: boolean;
  }
}
