import { describe, expect, test } from "bun:test";
import {
  adaptGeneratedRecord,
  isGeneratedRecordReferenceV3,
  isGeneratedRecordV3,
  toGeneratedRecordReferenceV3,
  toGeneratedRecordV3
} from "./generated-record.js";

function legacyRecord(): Record<string, unknown> {
  return {
    chatId: "chat-1",
    messageId: "message-1",
    swipeId: 2,
    prompts: ["first prompt", "second prompt"],
    negativePrompts: ["first negative", "second negative"],
    perspectiveModes: ["dynamic", "creative"],
    perspectiveSources: ["adaptive", "manual"],
    imageParameters: [{ seed: 10 }, { seed: 20 }],
    corePrompts: ["first core", "second core"],
    shotNegatives: ["first shot negative", "second shot negative"],
    promptFormats: ["ordered", "legacy"],
    creativeConcepts: [null, {
      id: "concept-2",
      paragraph: 5,
      anchor: "window",
      concept: "reflection",
      renderScope: "window only",
      camera: "close-up",
      visibleCues: ["rain"],
      score: 4
    }],
    creativeConceptCandidates: [[], []],
    creativeConceptHistory: [[], ["concept-2"]],
    placements: ["cover", "paragraph"],
    paragraphs: [0, 5],
    imageIds: ["image-1", ""],
    imageUrls: ["https://example.test/1.png", ""],
    slotStatuses: ["completed", "failed"],
    slotErrors: ["", "provider unavailable"],
    operationId: "operation-1",
    generationStatus: "failed",
    sourceFingerprint: "fingerprint",
    rawJson: { scenes: [] },
    createdAt: "2026-01-02T03:04:05.000Z"
  };
}

describe("GeneratedRecord V3 migration adapter", () => {
  test("zips a legacy record's parallel arrays into canonical slots", () => {
    const migrated = toGeneratedRecordV3(legacyRecord());

    expect(migrated).not.toBeNull();
    expect(migrated?.schemaVersion).toBe(3);
    expect(migrated?.slots).toHaveLength(2);
    expect(migrated?.slots[0]).toEqual({
      prompt: "first prompt",
      negativePrompt: "first negative",
      perspectiveMode: "dynamic",
      perspectiveSource: "adaptive",
      paragraph: 0,
      imageId: "image-1",
      imageUrl: "https://example.test/1.png",
      imageParameters: { seed: 10 },
      corePrompt: "first core",
      shotNegative: "first shot negative",
      promptFormat: "ordered",
      creativeConcept: null,
      creativeConceptCandidates: [],
      creativeConceptHistory: [],
      placement: "cover",
      status: "completed"
    });
    expect(migrated?.slots[1]?.error).toBe("provider unavailable");
    expect(migrated).not.toHaveProperty("prompts");
    expect(isGeneratedRecordV3(migrated)).toBe(true);
  });

  test("applies documented legacy defaults for absent slot-era arrays", () => {
    const legacy = legacyRecord();
    delete legacy.placements;
    delete legacy.slotStatuses;
    delete legacy.slotErrors;

    const migrated = toGeneratedRecordV3(legacy);

    expect(migrated?.slots.map((slot) => slot.placement)).toEqual(["paragraph", "paragraph"]);
    expect(migrated?.slots.map((slot) => slot.status)).toEqual(["completed", "pending"]);
  });

  test("rejects ragged required and optional arrays instead of silently misaligning slots", () => {
    const requiredRagged = legacyRecord();
    requiredRagged.imageUrls = ["https://example.test/1.png"];
    expect(toGeneratedRecordV3(requiredRagged)).toBeNull();

    const optionalRagged = legacyRecord();
    optionalRagged.slotStatuses = ["completed"];
    expect(toGeneratedRecordV3(optionalRagged)).toBeNull();

    const invalidStatus = legacyRecord();
    invalidStatus.slotStatuses = ["complete-ish", "failed"];
    expect(toGeneratedRecordV3(invalidStatus)).toBeNull();
  });

  test("migrates a V2 reference to compact V3 reference slots", () => {
    const migrated = toGeneratedRecordReferenceV3({
      storageVersion: 2,
      recordPath: "illustrator/generated/chat-1/record.json",
      chatId: "chat-1",
      messageId: "message-1",
      swipeId: 0,
      paragraphs: [1, 7],
      imageIds: ["image-1", ""],
      imageUrls: ["https://example.test/1.png", ""],
      createdAt: "2026-01-02T03:04:05.000Z",
      generationStatus: "pending"
    });

    expect(migrated).toEqual({
      storageVersion: 3,
      recordPath: "illustrator/generated/chat-1/record.json",
      chatId: "chat-1",
      messageId: "message-1",
      swipeId: 0,
      slots: [
        { paragraph: 1, imageId: "image-1", imageUrl: "https://example.test/1.png", status: "completed" },
        { paragraph: 7, imageId: "", imageUrl: "", status: "pending" }
      ],
      createdAt: "2026-01-02T03:04:05.000Z",
      operationId: undefined,
      generationStatus: "pending"
    });
    expect(isGeneratedRecordReferenceV3(migrated)).toBe(true);
    expect(migrated).not.toHaveProperty("paragraphs");
  });

  test("keeps full records and references distinct at the compatibility boundary", () => {
    const record = adaptGeneratedRecord(legacyRecord());
    const reference = adaptGeneratedRecord({
      storageVersion: 2,
      recordPath: "record.json",
      chatId: "chat-1",
      messageId: "message-1",
      swipeId: 0,
      paragraphs: [],
      imageIds: [],
      imageUrls: [],
      createdAt: "2026-01-02T03:04:05.000Z"
    });

    expect(isGeneratedRecordV3(record)).toBe(true);
    expect(isGeneratedRecordReferenceV3(record)).toBe(false);
    expect(isGeneratedRecordReferenceV3(reference)).toBe(true);
    expect(adaptGeneratedRecord({ prompts: [] })).toBeNull();
  });

  test("accepts V3 input idempotently without returning its mutable slot array", () => {
    const original = toGeneratedRecordV3(legacyRecord());
    const adapted = adaptGeneratedRecord(original);

    expect(adapted).toEqual(original);
    expect(adapted).not.toBe(original);
    if (adapted && "schemaVersion" in adapted && original) {
      expect(adapted.slots).not.toBe(original.slots);
    }
  });

  test("rejects malformed optional V3 slot metadata at the runtime boundary", () => {
    const valid = toGeneratedRecordV3(legacyRecord());
    expect(valid).not.toBeNull();
    if (!valid) return;

    expect(isGeneratedRecordV3({
      ...valid,
      slots: [{ ...valid.slots[0], perspectiveMode: "cinematic" }]
    })).toBe(false);
    expect(isGeneratedRecordV3({
      ...valid,
      slots: [{ ...valid.slots[0], imageParameters: "not-an-object" }]
    })).toBe(false);
  });


  test("migrates an early persisted record that predates slot-era metadata arrays", () => {
    const migrated = toGeneratedRecordV3({
      chatId: "chat-early",
      messageId: "message-early",
      swipeId: 1,
      prompts: ["early prompt"],
      paragraphs: [1],
      imageIds: ["early-id"],
      imageUrls: ["/early.png"],
      rawJson: { scenes: [] },
      createdAt: "2025-11-01T00:00:00.000Z"
    });

    expect(migrated).not.toBeNull();
    expect(migrated?.slots[0]).toMatchObject({
      prompt: "early prompt",
      negativePrompt: "",
      perspectiveMode: "dynamic",
      perspectiveSource: "manual",
      paragraph: 1,
      imageId: "early-id",
      imageUrl: "/early.png",
      status: "completed"
    });
    expect(isGeneratedRecordV3(migrated)).toBe(true);
  });


  test("accepts and preserves an optional validated canonical plan", () => {
    const base = toGeneratedRecordV3(legacyRecord());
    expect(base).not.toBeNull();
    if (!base) return;
    const plan = {
      version: 1,
      shots: [{
        paragraph: 1,
        plan: { mode: "dynamic", primaryAction: "she runs" },
        camera: { framing: "wide shot", angle: "eye level", perspective: "", focus: [] },
        cameraText: "",
        situation: "",
        action: "",
        characters: [],
        sharedComposition: { interaction: [], spatialRelation: "" },
        supplement: "",
        environment: { location: "", timeWeather: "", lightingMood: [], backgroundElements: [] },
        place: "",
        negative: ""
      }],
      initialContinuity: {
        characters: [],
        environment: { location: "", timeWeather: "", lightingMood: [], backgroundElements: [] },
        place: ""
      },
      continuityDeltas: [],
      terminalContinuity: {
        characters: [],
        environment: { location: "", timeWeather: "", lightingMood: [], backgroundElements: [] },
        place: ""
      }
    };
    const withPlan = { ...base, illustrationPlan: plan };

    expect(isGeneratedRecordV3(withPlan)).toBe(true);
    expect(isGeneratedRecordV3({ ...withPlan, illustrationPlan: { ...plan, version: 2 } })).toBe(false);
  });

});
