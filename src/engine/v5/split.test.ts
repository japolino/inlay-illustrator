// Hand-written checks of the split-analysis multi-depiction units (0.9.89.5 names l5/eve/Fyt/$yt/Kyt = 0.9.90 B4/Jxe/abt/ibt/obt).
import { describe, expect, test } from "bun:test";
import {
  B4,
  Jxe,
  abt,
  ibt,
  obt,
} from "../core/asset-maid-core.js";

describe("Domain 3: Split Analysis Pipeline & Multi-Depiction", () => {
  test("Split analysis contract version is bumped to 8", () => {
    expect(Jxe.version).toBe(8);
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
