import { describe, expect, test } from "bun:test";
import { discoverWorkflowBindings, patchStudyWorkflow } from "./workflow.js";
import type { ApiWorkflow } from "./types.js";

function fixture(): ApiWorkflow {
  return {
    positive: { class_type: "PrimitiveStringMultiline", inputs: { value: "old positive" }, _meta: { title: "API INPUT - Positive Prompt · value" } },
    negative: { class_type: "PrimitiveStringMultiline", inputs: { value: "old negative" }, _meta: { title: "API INPUT - Negative Prompt · value" } },
    seed: { class_type: "Seed (rgthree)", inputs: { seed: -1 }, _meta: { title: "Seed adjustment" } },
    settings: { class_type: "KSampler Config (rgthree)", inputs: { steps_total: 25, cfg: 5 }, _meta: { title: "Sampler settings" } },
    save: { class_type: "SaveImage", inputs: { filename_prefix: "RisuAI/Img", images: ["decode", 0] }, _meta: { title: "Save Image" } }
  };
}

describe("image study workflow patching", () => {
  test("discovers named fields and patches a clone", () => {
    const source = fixture();
    const bindings = discoverWorkflowBindings(source);
    const patched = patchStudyWorkflow(source, bindings, {
      positive: "new positive",
      negative: "new negative",
      seed: 42,
      steps: 30,
      filenamePrefix: "InlayEval/run/case"
    });
    expect(bindings).toEqual({ positiveNodeId: "positive", negativeNodeId: "negative", seedNodeId: "seed", stepsNodeId: "settings", saveNodeId: "save" });
    expect(patched.positive.inputs?.value).toBe("new positive");
    expect(patched.negative.inputs?.value).toBe("new negative");
    expect(patched.seed.inputs?.seed).toBe(42);
    expect(patched.settings.inputs?.steps_total).toBe(30);
    expect(patched.save.inputs?.filename_prefix).toBe("InlayEval/run/case");
    expect(source.positive.inputs?.value).toBe("old positive");
    expect(source.save.inputs?.filename_prefix).toBe("RisuAI/Img");
  });

  test("rejects ambiguous prompt nodes", () => {
    const source = fixture();
    source.duplicate = structuredClone(source.positive);
    expect(() => discoverWorkflowBindings(source)).toThrow("exactly one positive API input");
  });
});
