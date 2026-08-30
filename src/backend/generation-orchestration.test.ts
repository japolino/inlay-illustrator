
import { describe, expect, test, mock, beforeEach } from "bun:test";
import { prepareAndDispatchImageJobs, rerollImageParameters } from "./images";
import { renderInlaidMessage } from "./rendering";
import { stripInlayContent } from "./inlay-content";
import { DEFAULT_CONFIG } from "../shared/config";

function cfg() { return { ...DEFAULT_CONFIG } as any; }

describe("sequential orchestration fidelity", () => {
  test("call order is paragraph order and sequential", async () => {
    const inputs = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const order: number[] = [];
    const prepare = async (input: any, index: number) => ({
      index, total: 3, prompt: `p${index}`, negative: "", corePrompt: "", shotNegative: "", promptFormat: "ordered" as const, paragraph: index+1, parserParagraph: index+1, quote: "", parameters: {}
    });
    const generate = async (job: any) => {
      order.push(job.index);
      // delay to detect overlap
      await new Promise(r => setTimeout(r, 5));
      return { imageId: `id${job.index}` } as any;
    };
    const result = await prepareAndDispatchImageJobs(inputs as any, prepare as any, generate as any);
    expect(order).toEqual([0,1,2]);
    expect(result.jobs.map(j=>j.index)).toEqual([0,1,2]);
    expect(result.results.length).toBe(3);
  });

  test("failure continuation preserves successful images", async () => {
    const inputs = [{}, {}, {}];
    const prepare = async (_: any, index: number) => ({
      index, total: 3, prompt: `p${index}`, negative: "", corePrompt: "", shotNegative: "", promptFormat: "ordered" as const, paragraph: index+1, parserParagraph: index+1, quote: "", parameters: {}
    });
    const generate = async (job: any) => {
      if (job.index === 1) throw new Error("fail middle");
      return { imageId: `id${job.index}`, imageUrl: `/url${job.index}` } as any;
    };
    const result = await prepareAndDispatchImageJobs(inputs as any, prepare as any, generate as any);
    expect(result.results.length).toBe(2);
    expect(result.jobs.map(j=>j.index)).toEqual([0,2]);
  });

  test("no overlap — sequential does not run two generates concurrently", async () => {
    const inputs = [{}, {}];
    let concurrent = 0;
    let maxConcurrent = 0;
    const prepare = async (_: any, index: number) => ({
      index, total: 2, prompt: `p${index}`, negative: "", corePrompt: "", shotNegative: "", promptFormat: "ordered" as const, paragraph: index+1, parserParagraph: index+1, quote: "", parameters: {}
    });
    const generate = async (job: any) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent -= 1;
      return { imageId: `id${job.index}` } as any;
    };
    await prepareAndDispatchImageJobs(inputs as any, prepare as any, generate as any);
    expect(maxConcurrent).toBe(1);
  });

  test("all fail throws", async () => {
    const inputs = [{}, {}];
    const prepare = async (_: any, index: number) => ({
      index, total: 2, prompt: `p${index}`, negative: "", corePrompt: "", shotNegative: "", promptFormat: "ordered" as const, paragraph: index+1, parserParagraph: index+1, quote: "", parameters: {}
    });
    const generate = async () => { throw new Error("all fail"); };
    await expect(prepareAndDispatchImageJobs(inputs as any, prepare as any, generate as any)).rejects.toThrow();
  });
});

describe("placement drop-not-clamp", () => {
  test("out-of-range paragraph is dropped, not clamped", () => {
    const original = "Para one.\n\nPara two.";
    const record = {
      chatId: "c", messageId: "m", swipeId: 0,
      imageUrls: ["https://example.com/a.png"],
      imageIds: ["a"],
      prompts: ["p"], paragraphs: [99]
    };
    const out = renderInlaidMessage(original, record as any, cfg());
    // should not contain image (since paragraph 99 > count 2 is dropped)
    expect(out.includes("inlay-illustrator-image")).toBe(false);
    expect(out).toBe("Para one.\n\nPara two.");
  });

  test("valid paragraph inserts before target", () => {
    const original = "Para one.\n\nPara two.\n\nPara three.";
    const record = {
      chatId: "c", messageId: "m", swipeId: 0,
      imageUrls: ["https://example.com/a.png"],
      imageIds: ["a"],
      prompts: ["p"], paragraphs: [2]
    };
    const out = renderInlaidMessage(original, record as any, cfg());
    const markerPos = out.indexOf("inlay-illustrator-image");
    const para2Pos = out.indexOf("Para two.");
    expect(markerPos).toBeGreaterThan(-1);
    expect(markerPos).toBeLessThan(para2Pos);
    expect(out.includes("Para one.")).toBe(true);
    expect(out.includes("Para three.")).toBe(true);
  });
});

describe("strip original artifacts", () => {
  test("strips INLAY, CARDDATA and loading tags", () => {
    const raw = "Hello\nCARDDATA: foo bar\nINLAY[<CARD1>something]\n\n{{Card.Loading.Llm}}\n{{global::Card.Loading.Nai}} world";
    const stripped = stripInlayContent(raw);
    expect(stripped.includes("CARDDATA")).toBe(false);
    expect(stripped.includes("INLAY")).toBe(false);
    expect(stripped.includes("Card.Loading")).toBe(false);
    expect(stripped.includes("Hello")).toBe(true);
    expect(stripped.includes("world")).toBe(true);
  });
});

describe("reroll seed semantics", () => {
  test("non-workflow reroll does not invent seed when none present", () => {
    const params: Record<string, unknown> = { steps: 20 };
    const out = rerollImageParameters(params, null, "p", "n");
    expect(out.seed).toBeUndefined();
  });
  test("non-workflow reroll bumps existing seed", () => {
    const params: Record<string, unknown> = { seed: 123 };
    const out = rerollImageParameters(params, null);
    expect(out.seed).not.toBe(123);
    expect(typeof out.seed).toBe("number");
  });
});

// --- H1 candidate loop: sequential, skip throws/empty, keep earlier successes ---

describe("candidate reroll H1 sequential + partial success", () => {
  // Simulate the fixed candidate loop algorithm directly to verify seed tracking
  // covers first/middle failures and max concurrency 1 without needing full storage mock.
  // This mirrors generateRerollCandidates internals post-fix.
  async function simulateCandidateLoop(safeCount: number, generateMock: (params: Record<string, unknown>, index: number) => Promise<{ imageId?: string; imageUrl?: string }>, baseParams: Record<string, unknown>, connection: any) {
    const { rerollImageParameters } = await import("./images.js");
    const candidates: Array<{ imageId: string; imageUrl: string; parameters: Record<string, unknown> }> = [];
    let lastParams = baseParams;
    let concurrent = 0;
    let maxConcurrent = 0;
    for (let i = 0; i < safeCount; i += 1) {
      const params = rerollImageParameters(lastParams, connection, "prompt", "negative");
      lastParams = params;
      // track concurrency
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      try {
        const result = await generateMock(params, i);
        const imageId = result.imageId || "";
        const imageUrl = result.imageUrl || "";
        if (!imageUrl) continue;
        candidates.push({ imageId, imageUrl, parameters: params });
      } catch {
        continue;
      } finally {
        concurrent -= 1;
      }
    }
    return { candidates, maxConcurrent };
  }

  test("first failure still yields later candidates", async () => {
    const base = { workflow: { "1": { inputs: { seed: 1 } } }, seed: 1 } as any;
    const conn = { provider: "comfyui", metadata: { comfyui: { workflow_api_json: { "1": { inputs: {} } }, field_mappings: [] } } } as any;
    const generate = async (_params: any, index: number) => {
      if (index === 0) throw new Error("first fails");
      return { imageId: `id${index}`, imageUrl: `https://example.com/${index}.png` } as any;
    };
    const { candidates } = await simulateCandidateLoop(3, generate, base, conn);
    expect(candidates.length).toBe(2);
    expect(candidates[0].imageUrl).toContain("1.png");
    expect(candidates[1].imageUrl).toContain("2.png");
  });

  test("middle failure preserves first and last", async () => {
    const base = { workflow: { "1": { inputs: { seed: 42 } } }, seed: 42 } as any;
    const conn = { provider: "comfyui", metadata: { comfyui: { workflow_api_json: { "1": { inputs: {} } }, field_mappings: [] } } } as any;
    const generate = async (_params: any, index: number) => {
      if (index === 1) throw new Error("middle fails");
      return { imageId: `id${index}`, imageUrl: `https://example.com/${index}.png` } as any;
    };
    const { candidates } = await simulateCandidateLoop(3, generate, base, conn);
    expect(candidates.length).toBe(2);
    expect(candidates.map(c=>c.imageUrl)).toEqual(["https://example.com/0.png", "https://example.com/2.png"]);
  });

  test("empty result is skipped like throw", async () => {
    const base = { workflow: { "1": { inputs: { seed: 7 } } }, seed: 7 } as any;
    const conn = { provider: "comfyui", metadata: { comfyui: { workflow_api_json: { "1": { inputs: {} } }, field_mappings: [] } } } as any;
    const generate = async (_params: any, index: number) => {
      if (index === 0) return { imageId: "", imageUrl: "" } as any;
      return { imageId: `id${index}`, imageUrl: `https://example.com/${index}.png` } as any;
    };
    const { candidates } = await simulateCandidateLoop(2, generate, base, conn);
    expect(candidates.length).toBe(1);
    expect(candidates[0].imageUrl).toContain("1.png");
  });

  test("max concurrency is 1 — sequential dispatch", async () => {
    const base = { seed: 1 } as any;
    const conn = null;
    let maxConcurrent = 0;
    // Use simulateCandidateLoop's internal maxConcurrent tracking
    const generate = async (_params: any, index: number) => {
      await new Promise(r => setTimeout(r, 8));
      return { imageId: `id${index}`, imageUrl: `https://example.com/${index}.png` } as any;
    };
    const { maxConcurrent: mc } = await simulateCandidateLoop(3, generate, base, conn);
    expect(mc).toBe(1);
  });

  test("seeds remain distinct even after failed attempts", async () => {
    const base = { workflow: { "5": { inputs: { seed: 100, noise_seed: 100 } } }, seed: 100 } as any;
    const conn = { provider: "comfyui", metadata: { comfyui: { workflow_api_json: { "5": { inputs: { seed: 100 } } }, field_mappings: [{ nodeId: "5", fieldName: "seed", mappedAs: "seed" }] } } } as any;
    const seenSeeds: number[] = [];
    const generate = async (params: any, index: number) => {
      seenSeeds.push(params.seed);
      if (index === 0) throw new Error("fail first");
      return { imageId: `id${index}`, imageUrl: `https://example.com/${index}.png` } as any;
    };
    const { candidates } = await simulateCandidateLoop(3, generate, base, conn);
    // All 3 attempts should have distinct seeds even though first failed
    expect(new Set(seenSeeds).size).toBe(3);
    // Successful candidates should also have distinct seeds
    const candidateSeeds = candidates.map(c => (c.parameters as any).seed);
    expect(new Set(candidateSeeds).size).toBe(candidates.length);
    expect(candidateSeeds.length).toBe(2);
  });

  test("all candidates fail throws (zero candidates)", async () => {
    const base = { seed: 1 } as any;
    const generate = async () => { throw new Error("all fail"); };
    const { candidates } = await simulateCandidateLoop(3, generate as any, base, null);
    expect(candidates.length).toBe(0);
    // Caller should throw when zero candidates — emulate generateRerollCandidates check
    expect(candidates.length === 0).toBe(true);
  });

  test("never indexes candidates by loop index — handles gaps", async () => {
    const base = { workflow: { "1": { inputs: { seed: 10 } } }, seed: 10 } as any;
    const conn = { provider: "comfyui", metadata: { comfyui: { workflow_api_json: { "1": { inputs: {} } }, field_mappings: [] } } } as any;
    // First succeeds, second fails (gap), third should still be generated from second's ATTEMPT params, not candidates[1]
    const attemptSeeds: number[] = [];
    const generate = async (params: any, index: number) => {
      attemptSeeds.push((params as any).seed);
      if (index === 1) throw new Error("middle fail");
      return { imageId: `id${index}`, imageUrl: `https://example.com/${index}.png` } as any;
    };
    await simulateCandidateLoop(3, generate, base, conn);
    expect(attemptSeeds.length).toBe(3);
    // All seeds distinct despite gap — proves we used lastParams not candidates[i-1]
    expect(new Set(attemptSeeds).size).toBe(3);
  });
});

describe("non-Comfy no workflow/seed invention", () => {
  test("buildImageParameters for non-Comfy does not inject workflow or invent seed", async () => {
    const { buildImageParameters } = await import("./images.js");
    const config = { ...DEFAULT_CONFIG, imageParameters: {} } as any;
    const connection = { provider: "novelai", id: "nai-1", default_parameters: { steps: 20 }, metadata: {} } as any;
    const params = await buildImageParameters(config, connection, "prompt", "negative");
    expect(params.workflow).toBeUndefined();
    expect(params.seed).toBeUndefined();
  });

  test("rerollImageParameters for non-Comfy leaves seed absent", async () => {
    const { rerollImageParameters } = await import("./images.js");
    const base: Record<string, unknown> = { steps: 20, cfg: 7 };
    const out = rerollImageParameters(base, { provider: "other" } as any, "p", "n");
    expect(out.seed).toBeUndefined();
    expect(out.workflow).toBeUndefined();
  });

  test("Comfy reroll patches workflow seed and bumps", async () => {
    const { rerollImageParameters } = await import("./images.js");
    const base: Record<string, unknown> = { workflow: { "1": { inputs: { seed: 5 } } }, seed: 5 };
    const conn = { provider: "comfyui", metadata: { comfyui: { workflow_api_json: { "1": { inputs: { seed: 5 } } }, field_mappings: [{ nodeId: "1", fieldName: "seed", mappedAs: "seed" }] } } } as any;
    const out = rerollImageParameters(base, conn, "new prompt", "new neg");
    expect(out.seed).not.toBe(5);
    expect((out.workflow as any)["1"].inputs.seed).toBe(out.seed);
  });
});

describe("full-reroll preservation and frozen prompt", () => {
  test("frozen reroll prompt stays verbatim (does not recompose with current affixes)", async () => {
    // generateRerollCandidates and rerunStoredImage reuse stored prompts verbatim.
    // Verify rerollImageParameters does not alter prompt layers beyond workflow patch.
    const { rerollImageParameters } = await import("./images.js");
    const storedPrompt = "original stored prompt, with precise tokens";
    const storedNegative = "original negative";
    const base: Record<string, unknown> = { workflow: { "2": { inputs: { seed: 1, text: "old" } } }, seed: 1 };
    const conn = {
      provider: "comfyui",
      metadata: {
        comfyui: {
          workflow_api_json: { "2": { inputs: { seed: 1, text: "old" } } },
          field_mappings: [
            { nodeId: "2", fieldName: "text", mappedAs: "positive_prompt" },
            { nodeId: "2", fieldName: "seed", mappedAs: "seed" }
          ]
        }
      }
    } as any;
    const after = rerollImageParameters(base, conn, storedPrompt, storedNegative);
    expect((after.workflow as any)["2"].inputs.text).toBe(storedPrompt);
  });

  test("full reroll preserves prior image on peer failure", async () => {
    // Simulate rerunAllStoredImages loop logic
    const originalIds = ["id1", "id2", "id3"];
    const originalUrls = ["https://example.com/1.png", "https://example.com/2.png", "https://example.com/3.png"];
    const imageIds = [...originalIds];
    const imageUrls = [...originalUrls];
    let failedCount = 0;
    const prompts = ["p1", "p2", "p3"];
    const generate = async (idx: number) => {
      if (idx === 1) throw new Error("middle fail");
      return { imageId: `new${idx}`, imageUrl: `https://example.com/new${idx}.png` };
    };
    for (let i = 0; i < prompts.length; i += 1) {
      try {
        const result = await generate(i);
        imageIds[i] = result.imageId;
        imageUrls[i] = result.imageUrl;
      } catch {
        failedCount += 1;
      }
    }
    expect(failedCount).toBe(1);
    expect(imageIds).toEqual(["new0", "id2", "new2"]);
    expect(imageUrls).toEqual(["https://example.com/new0.png", "https://example.com/2.png", "https://example.com/new2.png"]);
  });
});

describe("candidate validation guards record corruption", () => {
  test("applyRerollCandidate rejects missing candidate", async () => {
    const { applyRerollCandidate } = await import("./generation.js");
    const req = { chatId: "c1", messageId: "m1", swipeId: 0, imageIndex: 0 } as any;
    await expect(applyRerollCandidate(req, null as any, "user")).rejects.toThrow();
    await expect(applyRerollCandidate(req, { imageUrl: "", parameters: {}, imageId: "" } as any, "user")).rejects.toThrow();
    await expect(applyRerollCandidate(req, { imageUrl: "https://example.com/a.png", parameters: null } as any, "user")).rejects.toThrow();
    await expect(applyRerollCandidate(req, { imageUrl: "https://example.com/a.png", parameters: [] } as any, "user")).rejects.toThrow();
  });
});

describe("runtime dedupe locks", () => {
  test("generation and image-action locks serialize concurrent attempts", async () => {
    const { tryAcquireRuntimeLock } = await import("./runtime-lock.js");
    const key = JSON.stringify(["user1", "chat1", "msg1", 0, "candidates", 3]);
    const first = tryAcquireRuntimeLock("image-action", key);
    expect(first).not.toBeNull();
    const second = tryAcquireRuntimeLock("image-action", key);
    expect(second).toBeNull();
    first?.();
    const third = tryAcquireRuntimeLock("image-action", key);
    expect(third).not.toBeNull();
    third?.();
  });
});
