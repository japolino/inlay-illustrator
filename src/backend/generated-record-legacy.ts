import type { PerspectiveMode } from "../shared/config.js";
import type {
  AssembledPrompt,
  CreativeConcept,
  GenerationSlotStatus,
  GenerationStatus,
  ParsedPayload
} from "./types.js";

/**
 * Read-only migration shape for pre-V3 compact references. New code must use
 * GeneratedRecordReferenceV3 from generated-record.ts.
 */
export type LegacyGeneratedRecordReference = {
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

/**
 * Read-only migration shape for pre-V3 parallel-array records. It is isolated
 * here so legacy storage layout cannot leak back into runtime business types.
 */
export type LegacyGeneratedRecord = {
  chatId: string;
  messageId: string;
  swipeId: number;
  prompts: string[];
  negativePrompts: string[];
  perspectiveModes: PerspectiveMode[];
  perspectiveSources: Array<"adaptive" | "manual">;
  imageParameters?: Array<Record<string, unknown>>;
  corePrompts?: string[];
  shotNegatives?: string[];
  promptFormats?: Array<NonNullable<AssembledPrompt["format"]>>;
  creativeConcepts?: Array<CreativeConcept | null>;
  creativeConceptCandidates?: CreativeConcept[][];
  creativeConceptHistory?: string[][];
  placements?: Array<"cover" | "paragraph">;
  paragraphs: number[];
  imageIds: string[];
  imageUrls: string[];
  slotStatuses?: GenerationSlotStatus[];
  slotErrors?: string[];
  operationId?: string;
  generationStatus?: GenerationStatus;
  sourceFingerprint?: string;
  rawJson: ParsedPayload;
  createdAt: string;
};
