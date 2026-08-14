import type { PerspectiveMode } from "../shared/config.js";
import { IllustrationPlanSchema } from "./domain.js";
import type { IllustrationPlan } from "./domain.js";
import type { LegacyGeneratedRecord, LegacyGeneratedRecordReference } from "./generated-record-legacy.js";
import type {
  CreativeConcept,
  GenerationSlotStatus,
  GenerationStatus,
  ParsedPayload
} from "./types.js";

/** The canonical, non-parallel representation of one generated image. */
export type GeneratedRecordSlot = {
  prompt: string;
  negativePrompt: string;
  perspectiveMode: PerspectiveMode;
  perspectiveSource: "adaptive" | "manual";
  paragraph: number;
  imageId: string;
  imageUrl: string;
  imageParameters?: Record<string, unknown>;
  corePrompt?: string;
  shotNegative?: string;
  promptFormat?: "legacy" | "ordered";
  creativeConcept?: CreativeConcept | null;
  creativeConceptCandidates?: CreativeConcept[];
  creativeConceptHistory?: string[];
  placement: "cover" | "paragraph";
  status: GenerationSlotStatus;
  error?: string;
};

/**
 * Version 3 keeps all values that belong to an image together. Parallel-array
 * records deliberately do not form part of this type; they are accepted only
 * by the migration adapter below.
 */
export type GeneratedRecordV3 = {
  schemaVersion: 3;
  chatId: string;
  messageId: string;
  swipeId: number;
  slots: GeneratedRecordSlot[];
  operationId?: string;
  generationStatus?: GenerationStatus;
  sourceFingerprint?: string;
  rawJson: ParsedPayload;
  /** Validated canonical plan when the record was produced through the typed boundary. */
  illustrationPlan?: IllustrationPlan;
  createdAt: string;
};

/** A compact slot retained in continuity state when the full record is external. */
export type GeneratedRecordReferenceSlot = Pick<
  GeneratedRecordSlot,
  "paragraph" | "imageId" | "imageUrl"
> & Partial<Pick<GeneratedRecordSlot, "status">>;

export type GeneratedRecordReferenceV3 = {
  storageVersion: 3;
  recordPath: string;
  chatId: string;
  messageId: string;
  swipeId: number;
  slots: GeneratedRecordReferenceSlot[];
  createdAt: string;
  operationId?: string;
  generationStatus?: GenerationStatus;
};

export type AdaptedGeneratedRecord = GeneratedRecordV3 | GeneratedRecordReferenceV3;
export type GeneratedRecordAdapterInput =
  | LegacyGeneratedRecord
  | LegacyGeneratedRecordReference
  | GeneratedRecordV3
  | GeneratedRecordReferenceV3;

const SLOT_STATUSES = new Set<GenerationSlotStatus>([
  "pending",
  "generating",
  "completed",
  "failed",
  "cancelled"
]);
const GENERATION_STATUSES = new Set<GenerationStatus>(["pending", "completed", "failed", "cancelled"]);
const PERSPECTIVE_MODES = new Set<PerspectiveMode>(["creative", "static", "dynamic", "asset"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === "string";
}

function isSlotStatus(value: unknown): value is GenerationSlotStatus {
  return typeof value === "string" && SLOT_STATUSES.has(value as GenerationSlotStatus);
}

function inferredStatus(_imageId: string, imageUrl: string): GenerationSlotStatus {
  // This mirrors the pre-V3 fallback used by progressive generation records.
  return imageUrl ? "completed" : "pending";
}

function isReferenceSlot(value: unknown): value is GeneratedRecordReferenceSlot {
  return isObject(value)
    && Number.isInteger(value.paragraph)
    && Number(value.paragraph) >= 0
    && typeof value.imageId === "string"
    && typeof value.imageUrl === "string"
    && (value.status === undefined || isSlotStatus(value.status));
}

function isCreativeConcept(value: unknown): value is CreativeConcept {
  return isObject(value)
    && typeof value.id === "string"
    && Number.isInteger(value.paragraph)
    && typeof value.anchor === "string"
    && typeof value.concept === "string"
    && typeof value.renderScope === "string"
    && typeof value.camera === "string"
    && Array.isArray(value.visibleCues)
    && value.visibleCues.every((cue) => typeof cue === "string")
    && Number.isFinite(value.score);
}

function normalizeLegacyCreativeConcept(value: unknown, paragraph: number): CreativeConcept | null | undefined {
  if (value === null) return null;
  if (isCreativeConcept(value)) return value;
  if (!isObject(value) || typeof value.anchor !== "string" || typeof value.concept !== "string") return undefined;
  const subjectTypes = new Set(["object", "environment", "shadow", "silhouette", "reflection", "fragment", "spatial"]);
  const subjectType = typeof value.subjectType === "string" && subjectTypes.has(value.subjectType)
    ? value.subjectType as CreativeConcept["subjectType"]
    : undefined;
  return {
    id: typeof value.id === "string" && value.id ? value.id : `legacy-concept-p${paragraph}`,
    paragraph: Number.isInteger(value.paragraph) ? Number(value.paragraph) : paragraph,
    ...(subjectType ? { subjectType } : {}),
    anchor: value.anchor,
    concept: value.concept,
    renderScope: typeof value.renderScope === "string" ? value.renderScope : "",
    camera: typeof value.camera === "string" ? value.camera : "",
    visibleCues: Array.isArray(value.visibleCues)
      ? value.visibleCues.filter((cue): cue is string => typeof cue === "string")
      : [],
    score: Number.isFinite(value.score) ? Number(value.score) : 0
  };
}

function isRecordSlot(value: unknown): value is GeneratedRecordSlot {
  if (!isObject(value) || !isReferenceSlot(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.prompt === "string"
    && typeof candidate.negativePrompt === "string"
    && typeof candidate.perspectiveMode === "string"
    && PERSPECTIVE_MODES.has(candidate.perspectiveMode as PerspectiveMode)
    && (candidate.perspectiveSource === "adaptive" || candidate.perspectiveSource === "manual")
    && (candidate.placement === "cover" || candidate.placement === "paragraph")
    && isSlotStatus(candidate.status)
    && (candidate.imageParameters === undefined || isObject(candidate.imageParameters))
    && (candidate.corePrompt === undefined || typeof candidate.corePrompt === "string")
    && (candidate.shotNegative === undefined || typeof candidate.shotNegative === "string")
    && (candidate.promptFormat === undefined || candidate.promptFormat === "legacy" || candidate.promptFormat === "ordered")
    && (candidate.creativeConcept === undefined || candidate.creativeConcept === null || isCreativeConcept(candidate.creativeConcept))
    && (candidate.creativeConceptCandidates === undefined
      || (Array.isArray(candidate.creativeConceptCandidates) && candidate.creativeConceptCandidates.every(isCreativeConcept)))
    && (candidate.creativeConceptHistory === undefined
      || (Array.isArray(candidate.creativeConceptHistory) && candidate.creativeConceptHistory.every((id) => typeof id === "string")))
    && (candidate.error === undefined || typeof candidate.error === "string");
}

export function isGeneratedRecordV3(value: unknown): value is GeneratedRecordV3 {
  if (!isObject(value) || value.schemaVersion !== 3 || !Array.isArray(value.slots)) return false;
  return hasString(value, "chatId")
    && hasString(value, "messageId")
    && Number.isInteger(value.swipeId)
    && hasString(value, "createdAt")
    && isObject(value.rawJson)
    && (value.operationId === undefined || typeof value.operationId === "string")
    && (value.generationStatus === undefined
      || (typeof value.generationStatus === "string" && GENERATION_STATUSES.has(value.generationStatus as GenerationStatus)))
    && (value.sourceFingerprint === undefined || typeof value.sourceFingerprint === "string")
    && (value.illustrationPlan === undefined || IllustrationPlanSchema.safeParse(value.illustrationPlan).success)
    && value.slots.every(isRecordSlot);
}

export function isGeneratedRecordReferenceV3(value: unknown): value is GeneratedRecordReferenceV3 {
  if (!isObject(value) || value.storageVersion !== 3 || !Array.isArray(value.slots)) return false;
  return hasString(value, "recordPath")
    && hasString(value, "chatId")
    && hasString(value, "messageId")
    && Number.isInteger(value.swipeId)
    && hasString(value, "createdAt")
    && (value.operationId === undefined || typeof value.operationId === "string")
    && (value.generationStatus === undefined
      || (typeof value.generationStatus === "string" && GENERATION_STATUSES.has(value.generationStatus as GenerationStatus)))
    && value.slots.every(isReferenceSlot);
}

function legacyReference(value: Record<string, unknown>): value is LegacyGeneratedRecordReference {
  return value.storageVersion === 2
    && hasString(value, "recordPath")
    && hasString(value, "chatId")
    && hasString(value, "messageId")
    && Number.isFinite(value.swipeId)
    && hasString(value, "createdAt")
    && Array.isArray(value.paragraphs)
    && value.paragraphs.every(Number.isFinite)
    && Array.isArray(value.imageIds)
    && value.imageIds.every((item) => typeof item === "string")
    && Array.isArray(value.imageUrls)
    && value.imageUrls.every((item) => typeof item === "string");
}

function legacyRecord(value: Record<string, unknown>): value is LegacyGeneratedRecord {
  const validArray = (key: string, predicate: (item: unknown) => boolean): boolean =>
    Array.isArray(value[key]) && (value[key] as unknown[]).every(predicate);
  const validOptionalArray = (key: string, predicate: (item: unknown) => boolean): boolean =>
    value[key] === undefined || validArray(key, predicate);
  const isString = (item: unknown): boolean => typeof item === "string";
  return hasString(value, "chatId")
    && hasString(value, "messageId")
    && Number.isFinite(value.swipeId)
    && hasString(value, "createdAt")
    && isObject(value.rawJson)
    && validArray("prompts", isString)
    && validOptionalArray("negativePrompts", isString)
    && validOptionalArray("perspectiveModes", (item) => ["creative", "static", "dynamic", "asset"].includes(String(item)))
    && validOptionalArray("perspectiveSources", (item) => item === "adaptive" || item === "manual")
    && validArray("paragraphs", Number.isFinite)
    && validArray("imageIds", isString)
    && validArray("imageUrls", isString)
    && validOptionalArray("imageParameters", isObject)
    && validOptionalArray("corePrompts", isString)
    && validOptionalArray("shotNegatives", isString)
    && validOptionalArray("promptFormats", (item) => item === "legacy" || item === "ordered")
    && validOptionalArray("creativeConcepts", (item) => item === null || isObject(item))
    && validOptionalArray("creativeConceptCandidates", (item) => Array.isArray(item) && item.every(isObject))
    && validOptionalArray("creativeConceptHistory", (item) => Array.isArray(item) && item.every(isString))
    && validOptionalArray("placements", (item) => item === "cover" || item === "paragraph")
    && validOptionalArray("slotStatuses", isSlotStatus)
    && validOptionalArray("slotErrors", isString);
}

function sameLength(length: number, ...arrays: unknown[][]): boolean {
  return arrays.every((array) => array.length === length);
}

function copyOptional<T extends object, K extends keyof T>(
  target: Partial<T>,
  key: K,
  value: T[K] | undefined
): void {
  if (value !== undefined) target[key] = value;
}

/** Convert a full legacy parallel-array record. Returns null for invalid/ragged input. */
export function toGeneratedRecordV3(value: unknown): GeneratedRecordV3 | null {
  if (isGeneratedRecordV3(value)) {
    return { ...value, slots: value.slots.map((slot) => ({ ...slot })) };
  }
  if (!isObject(value) || !legacyRecord(value)) return null;

  const slotCount = value.prompts.length;
  const alignedArrays: unknown[][] = [value.paragraphs, value.imageIds, value.imageUrls];
  for (const array of [value.negativePrompts, value.perspectiveModes, value.perspectiveSources]) {
    if (array !== undefined) alignedArrays.push(array);
  }
  if (!sameLength(slotCount, ...alignedArrays)) return null;

  const optionalArrays: Array<unknown[] | undefined> = [
    value.imageParameters,
    value.corePrompts,
    value.shotNegatives,
    value.promptFormats,
    value.creativeConcepts,
    value.creativeConceptCandidates,
    value.creativeConceptHistory,
    value.placements,
    value.slotStatuses,
    value.slotErrors
  ];
  if (optionalArrays.some((array) => array !== undefined && (!Array.isArray(array) || array.length !== slotCount))) {
    return null;
  }

  const slots = value.prompts.map((prompt, index): GeneratedRecordSlot => {
    const imageId = value.imageIds[index]!;
    const imageUrl = value.imageUrls[index]!;
    const slot: GeneratedRecordSlot = {
      prompt,
      negativePrompt: value.negativePrompts?.[index] ?? "",
      perspectiveMode: value.perspectiveModes?.[index] ?? "dynamic",
      perspectiveSource: value.perspectiveSources?.[index] ?? "manual",
      paragraph: value.paragraphs[index]!,
      imageId,
      imageUrl,
      placement: value.placements?.[index] ?? "paragraph",
      status: value.slotStatuses?.[index] ?? inferredStatus(imageId, imageUrl)
    };
    copyOptional(slot, "imageParameters", value.imageParameters?.[index]);
    copyOptional(slot, "corePrompt", value.corePrompts?.[index]);
    copyOptional(slot, "shotNegative", value.shotNegatives?.[index]);
    copyOptional(slot, "promptFormat", value.promptFormats?.[index]);
    copyOptional(slot, "creativeConcept", normalizeLegacyCreativeConcept(value.creativeConcepts?.[index], slot.paragraph));
    const candidates = value.creativeConceptCandidates?.[index]
      ?.map((candidate) => normalizeLegacyCreativeConcept(candidate, slot.paragraph))
      .filter((candidate): candidate is CreativeConcept => candidate !== undefined && candidate !== null);
    copyOptional(slot, "creativeConceptCandidates", candidates);
    copyOptional(slot, "creativeConceptHistory", value.creativeConceptHistory?.[index]);
    const error = value.slotErrors?.[index];
    if (error) slot.error = error;
    return slot;
  });

  const migrated: GeneratedRecordV3 = {
    schemaVersion: 3,
    chatId: value.chatId,
    messageId: value.messageId,
    swipeId: value.swipeId,
    slots,
    operationId: value.operationId,
    generationStatus: value.generationStatus,
    sourceFingerprint: value.sourceFingerprint,
    rawJson: value.rawJson,
    createdAt: value.createdAt
  };
  return isGeneratedRecordV3(migrated) ? migrated : null;
}

/** Convert a compact V2 reference without pretending it is a hydrated record. */
export function toGeneratedRecordReferenceV3(value: unknown): GeneratedRecordReferenceV3 | null {
  if (isGeneratedRecordReferenceV3(value)) {
    return { ...value, slots: value.slots.map((slot) => ({ ...slot })) };
  }
  if (!isObject(value) || !legacyReference(value)) return null;
  const slotCount = value.paragraphs.length;
  if (!sameLength(slotCount, value.imageIds, value.imageUrls)) return null;

  const migrated: GeneratedRecordReferenceV3 = {
    storageVersion: 3,
    recordPath: value.recordPath,
    chatId: value.chatId,
    messageId: value.messageId,
    swipeId: value.swipeId,
    slots: value.paragraphs.map((paragraph, index) => {
      const imageId = value.imageIds[index]!;
      const imageUrl = value.imageUrls[index]!;
      return { paragraph, imageId, imageUrl, status: inferredStatus(imageId, imageUrl) };
    }),
    createdAt: value.createdAt,
    operationId: value.operationId,
    generationStatus: value.generationStatus
  };
  return isGeneratedRecordReferenceV3(migrated) ? migrated : null;
}

/**
 * Backwards-compatible adapter boundary. Callers receive only V3 shapes and
 * can distinguish external references with `isGeneratedRecordReferenceV3`.
 */
export function adaptGeneratedRecord(value: unknown): AdaptedGeneratedRecord | null {
  return toGeneratedRecordReferenceV3(value) ?? toGeneratedRecordV3(value);
}

export const migrateGeneratedRecordToV3 = adaptGeneratedRecord;
