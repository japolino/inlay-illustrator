// Hand-written checks of the split-analysis units. 0.9.89.5 names l5/eve/Fyt/$yt/Kyt = 0.9.90 B4/Jxe/abt/ibt/obt;
// Asset Maid 0.9.91 removed Jxe (phase contract v8) in favour of uwe_91 (v10, slot_context-based initial/detail
// texts, n90 @162029) and added $vt_91 (initial-plan note normalisation, @161979), qvt_91/Yxe (8 MiB response
// limit, @162040), gyt_91 (deduplicated scene paragraphs + index slot_context, @163328) and byt_91 (history
// validation outcome promise wrapped around every analyzer run, @163504).
import { describe, expect, test } from "bun:test";
import {
  $vt_91,
  B4,
  Yxe,
  abt,
  byt_91,
  gyt_91,
  ibt,
  qvt_91,
  uwe_91,
} from "../core/asset-maid-core.js";

describe("Domain 3: Split Analysis Pipeline & Multi-Depiction", () => {
  test("Split analysis phase contract is version 10 and speaks in slot_context indices", () => {
    expect(uwe_91.version).toBe(10);
    expect(Object.isFrozen(uwe_91)).toBe(true);
    expect(uwe_91.initial).toContain(
      "Choose image_count distinct slot numbers from slot_context; before and after are zero-based indices into the scene paragraph array.",
    );
    expect(uwe_91.initial).toContain("Leave pose, expression, camera, coordinates, modifiers and tags for detail.");
    expect(uwe_91.detail).toContain("Read the locked definitions and slot_context before/after source paragraphs");
    expect(uwe_91.detail).toContain("Never borrow unassigned slots to fill coverage.");
  });

  test("Split detail preamble uses universal multi-depiction fyt text", () => {
    expect(abt).toContain(
      "Preserve locked actor_roster entries; append distinct actorIds only for additional depictions of locked candidateKey/form/outfit definitions.",
    );
    expect(abt).toContain(
      "In every preset, additional depictions in one image, one panel or across panels may repeat the same identity and effective outfit",
    );
  });

  const candidateAlice = {
    candidateKey: "alice",
    appearanceForms: [
      { formRef: "normal", formId: "normal", outfits: [{ outfitRef: "casual", outfitId: "casual" }] },
    ],
    defaultFormRef: "normal",
  };

  const candidateBob = {
    candidateKey: "bob",
    appearanceForms: [
      { formRef: "suit", formId: "suit", outfits: [{ outfitRef: "formal", outfitId: "formal" }] },
    ],
    defaultFormRef: "suit",
  };

  test("N2 / e5 supports multiple visible depictions sharing candidateKey with distinct actorIds", () => {
    const lockedPlan = {
      actor_roster: [
        { actorId: "actor_1", candidateKey: "alice", formRef: "normal", outfit: { id: "casual" } },
      ],
      occurrences: [
        { actorId: "actor_1", placementIndex: 0, outfit: { id: "casual" } },
      ],
    };

    // Candidate has 2 depictions of Alice in the detail response
    const detailResponse = {
      actor_roster: [
        { actorId: "actor_1", candidateKey: "alice", formRef: "normal" },
        { actorId: "actor_2", candidateKey: "alice", formRef: "normal" }, // additional depiction sharing candidateKey with distinct actorId
      ],
      occurrences: [
        { actorId: "actor_1", placementIndex: 0 },
        { actorId: "actor_2", placementIndex: 1 },
      ],
      frame_placement: {
        items: [
          { actorId: "actor_1", center: { x: 0.2, y: 0.5 } },
          { actorId: "actor_2", center: { x: 0.8, y: 0.5 } },
        ],
      },
      actor_detail: [
        { actorId: "actor_1", placementIndex: 0 },
        { actorId: "actor_2", placementIndex: 1 },
      ],
    };

    const resolved = B4(detailResponse, [candidateAlice], lockedPlan, false);
    expect(resolved.actor_roster.length).toBe(2);
    expect(resolved.actor_roster[0].actorId).toBe("actor_1");
    expect(resolved.actor_roster[0].candidateKey).toBe("alice");
    expect(resolved.actor_roster[1].actorId).toBe("actor_2");
    expect(resolved.actor_roster[1].candidateKey).toBe("alice");
    expect(resolved.actor_roster[1].outfit).toEqual({ id: "casual" });
  });

  test("ambiguity check for locked roster candidates throws 확정 등장 개체 참조가 모호합니다", () => {
    // Two locked occurrences of alice in locked plan
    const lockedPlan = {
      actor_roster: [
        { actorId: "actor_1", candidateKey: "alice", formRef: "normal" },
        { actorId: "actor_2", candidateKey: "alice", formRef: "normal" },
      ],
      occurrences: [
        { actorId: "actor_1", placementIndex: 0 },
        { actorId: "actor_2", placementIndex: 1 },
      ],
    };

    // Detail provides candidateKey without specifying actorId when multiple available
    const detailResponse = {
      actor_roster: [
        { candidateKey: "alice" }, // Ambiguous: which locked alice?
      ],
      occurrences: [{ placementIndex: 0 }],
      frame_placement: { items: [{ placementIndex: 0 }] },
      actor_detail: [{ placementIndex: 0 }],
    };

    expect(() => B4(detailResponse, [candidateAlice], lockedPlan, false)).toThrow(
      "확정 등장 개체 참조가 모호합니다: alice",
    );
  });

  test("ambiguity check for form/outfit variations throws 추가 등장 개체의 폼·의상 상속이 모호합니다", () => {
    // Locked roster has two alices with differing forms/outfits
    const candidateAliceMultiForm = {
      candidateKey: "alice",
      appearanceForms: [
        { formRef: "normal", formId: "normal", outfits: [{ outfitRef: "casual", outfitId: "casual" }] },
        { formRef: "battle", formId: "battle", outfits: [{ outfitRef: "armor", outfitId: "armor" }] },
      ],
      defaultFormRef: "normal",
    };

    const lockedPlan = {
      actor_roster: [
        { actorId: "actor_1", candidateKey: "alice", formRef: "normal", outfit: { id: "casual" } },
        { actorId: "actor_2", candidateKey: "alice", formRef: "battle", outfit: { id: "armor" } },
      ],
      occurrences: [
        { actorId: "actor_1", placementIndex: 0 },
        { actorId: "actor_2", placementIndex: 1 },
      ],
    };

    // Additional depiction of alice without formRef specified when multiple locked variations exist
    const detailResponse = {
      actor_roster: [
        { actorId: "actor_1", candidateKey: "alice" },
        { actorId: "actor_2", candidateKey: "alice" },
        { candidateKey: "alice" }, // Additional depiction, but which form/outfit to inherit?
      ],
      occurrences: [{ placementIndex: 0 }, { placementIndex: 1 }, { placementIndex: 2 }],
      frame_placement: { items: [{ placementIndex: 0 }, { placementIndex: 1 }, { placementIndex: 2 }] },
      actor_detail: [{ placementIndex: 0 }, { placementIndex: 1 }, { placementIndex: 2 }],
    };

    expect(() => B4(detailResponse, [candidateAliceMultiForm], lockedPlan, false)).toThrow(
      "추가 등장 개체의 폼·의상 상속이 모호합니다.",
    );
  });

  test("coverage check throws 확정 인물 목록의 coverage 불일치 when locked actor is missing", () => {
    const lockedPlan = {
      actor_roster: [
        { actorId: "actor_1", candidateKey: "alice", formRef: "normal" },
        { actorId: "actor_2", candidateKey: "bob", formRef: "suit" },
      ],
      occurrences: [
        { actorId: "actor_1", placementIndex: 0 },
        { actorId: "actor_2", placementIndex: 1 },
      ],
    };

    // Detail omits bob
    const detailResponse = {
      actor_roster: [
        { actorId: "actor_1", candidateKey: "alice", formRef: "normal" },
      ],
      occurrences: [{ actorId: "actor_1", placementIndex: 0 }],
      frame_placement: { items: [{ actorId: "actor_1" }] },
      actor_detail: [{ actorId: "actor_1", placementIndex: 0 }],
    };

    expect(() => B4(detailResponse, [candidateAlice, candidateBob], lockedPlan, false)).toThrow(
      "확정 인물 목록의 coverage 불일치",
    );
  });

  test("unmatched interaction actor reference pass-through allows external actor references", () => {
    const lockedPlan = {
      actor_roster: [
        { actorId: "actor_1", candidateKey: "alice", formRef: "normal" },
      ],
      occurrences: [
        { actorId: "actor_1", placementIndex: 0 },
      ],
    };

    // Interaction references actor_1 and an unmatched external identity (e.g. background crowd or narrator)
    const detailResponse = {
      actor_roster: [
        { actorId: "actor_1", candidateKey: "alice", formRef: "normal" },
      ],
      occurrences: [{ actorId: "actor_1", placementIndex: 0 }],
      interaction: {
        items: [
          {
            sourceActorId: "actor_1",
            targetActorId: "unmatched_stranger",
            interactionIndex: 0,
          },
        ],
      },
      frame_placement: { items: [{ actorId: "actor_1" }] },
      actor_detail: [{ actorId: "actor_1", placementIndex: 0 }],
    };

    // With locked plan, interaction pass-through (P = true) preserves "unmatched_stranger"
    const resolved = B4(detailResponse, [candidateAlice], lockedPlan, false);
    expect(resolved.interaction.items[0].sourceActorId).toBe("actor_1");
    expect(resolved.interaction.items[0].targetActorId).toBe("unmatched_stranger");
  });

  test("fgt validates multi-depiction detail responses successfully", () => {
    const candidateRoster = [candidateAlice];
    const plan = {
      illustrations: [
        {
          slot_number: 1,
          actor_roster: [
            { actorId: "actor_1", candidateKey: "alice", formRef: "normal", outfit: { id: "casual" } },
          ],
          occurrences: [
            { actorId: "actor_1", placementIndex: 0, outfit: { id: "casual" } },
          ],
        },
      ],
    };

    const detailPayload = {
      illustrations: [
        {
          slot_number: 1,
          actor_roster: [
            { actorId: "actor_1", candidateKey: "alice", formRef: "normal" },
            { actorId: "actor_2", candidateKey: "alice", formRef: "normal" }, // additional depiction sharing candidateKey with distinct actorId
          ],
          occurrences: [
            { actorId: "actor_1", placementIndex: 0 },
            { actorId: "actor_2", placementIndex: 1 },
          ],
          frame_placement: {
            items: [
              { actorId: "actor_1", center: { x: 0.3, y: 0.5 } },
              { actorId: "actor_2", center: { x: 0.7, y: 0.5 } },
            ],
          },
          actor_detail: [
            { actorId: "actor_1", placementIndex: 0 },
            { actorId: "actor_2", placementIndex: 1 },
          ],
        },
      ],
    };

    const result = ibt(detailPayload, { plan, assignedSlots: [1] } as any, false, candidateRoster as any);
    expect(result.illustrations.length).toBe(1);
    expect(result.illustrations[0].actor_roster.length).toBe(2);
    expect(result.illustrations[0].actor_roster[1].actorId).toBe("actor_2");
  });
});

describe("0.9.91 split helpers", () => {
  test("$vt_91 normalises initial-plan notes and strips evidence/source quotes", () => {
    const out = $vt_91({
      slot_number: 2,
      sceneIntent: ["  Alice waves  ", "Alice waves", ""],
      temporal_state: " Morning ",
      stateConstraints: "Rain stopped",
      evidence: "quoted line",
      sourceQuote: "q",
      source_quote: "q2",
      occurrences: [],
    });
    expect(out.scene_intent).toBe("Alice waves");
    expect(out.temporal_state).toBe("Morning");
    expect(out.state_constraints).toEqual(["Rain stopped"]);
    expect("evidence" in out).toBe(false);
    expect("sourceQuote" in out).toBe(false);
    expect("source_quote" in out).toBe(false);
    expect(out.occurrences).toEqual([]);
  });

  test("$vt_91 joins multi-line intents and keeps an empty constraint list", () => {
    const out = $vt_91({ slot_number: 0, scene_intent: ["A", "B"], temporal_state: null, state_constraints: null });
    expect(out.scene_intent).toBe(["A", "B"].join(String.fromCharCode(10)));
    expect(out.temporal_state).toBe("");
    expect(out.state_constraints).toEqual([]);
  });

  test("gyt_91 deduplicates scene paragraphs and maps slot_context to indices", () => {
    const { scene, slot_context } = gyt_91([
      { slot_number: 0, before: "p0", after: "p1" },
      { slot_number: 1, before: "p1", after: "p2" },
      { slot_number: 2, before: "p2", after: "p2" },
    ]);
    expect(scene).toEqual(["p0", "p1", "p2"]);
    expect(slot_context).toEqual([
      { slot_number: 0, before: 0, after: 1 },
      { slot_number: 1, before: 1, after: 2 },
      { slot_number: 2, before: 2, after: 2 },
    ]);
  });

  test("qvt_91 / Yxe reject split responses above 8 MiB as non-retryable SPLIT_RESOURCE_LIMIT", () => {
    const big = "x".repeat(8 * 1024 * 1024 + 1);
    let caught: any;
    try {
      qvt_91(big);
    } catch (e) {
      caught = e;
    }
    expect(caught?.message).toBe("분할 분석 응답이 8MiB를 초과했습니다.");
    expect(caught?.code).toBe("SPLIT_RESOURCE_LIMIT");
    expect(caught?.retryable).toBe(false);
    expect(() => Yxe(big)).toThrow("분할 분석 응답이 8MiB를 초과했습니다.");
    expect(() => qvt_91("x".repeat(1024))).not.toThrow();
    expect(Yxe('{"illustrations":[]}') as unknown).toEqual({ illustrations: [] });
    expect(Yxe('{"conflict":"plan contradicts source"}') as unknown).toEqual({ conflict: "plan contradicts source" });
  });

  test("byt_91 resolves the history validation promise with undefined on success", async () => {
    let seen: Promise<string | undefined> | undefined;
    const value = await byt_91({}, async (validation: Promise<string | undefined>) => {
      seen = validation;
      return 7;
    });
    expect(value).toBe(7);
    expect(await seen).toBeUndefined();
  });

  test("byt_91 labels failures by stage and abort state", async () => {
    const run = async (input: any, error: unknown) => {
      let seen!: Promise<string | undefined>;
      await expect(
        byt_91(input, async (validation: Promise<string | undefined>) => {
          seen = validation;
          throw error;
        }),
      ).rejects.toBe(error);
      return seen;
    };
    expect(await run({}, new Error("boom"))).toBe("V5 분석 응답 검증 실패");
    expect(await run({ splitStage: { phase: "detail" } }, new Error("boom"))).toBe("분할 분석 응답 검증 실패");
    expect(await run({}, new SyntaxError("bad json"))).toBe("응답 형식 오류");
    const controller = new AbortController();
    controller.abort();
    expect(await run({ signal: controller.signal }, new Error("boom"))).toBe("요청 취소");
  });
});
