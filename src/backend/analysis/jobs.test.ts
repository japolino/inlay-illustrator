import { describe, expect, test } from "bun:test";
import { rpcError } from "../../shared/contract/index.js";
import { RpcFailure } from "../rpc/errors.js";
import { createAnalysisModule } from "./index.js";
import { AM } from "./core/index.js";
import { AnalysisJobs } from "./jobs.js";
import { runAnalysis } from "./runs.js";
import { CHAR, createAnalysisFixture } from "./testing/fixtures.js";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return "ok";
  } catch (error) {
    return error instanceof RpcFailure ? error.error.code : String(error);
  }
};

describe("analysis jobs", () => {
  test("text-mode references and character-prompts drive the same AM controller: one at a time per character", async () => {
    const fx = createAnalysisFixture();
    const { analysis } = createAnalysisModule(fx.services);
    const first = analysis.start({ kind: "character-prompts", characterId: CHAR });
    expect(codeOf(() => analysis.start({ kind: "references", characterId: CHAR, evidenceMode: "text" }))).toBe("busy");
    // Image-mode references run their own controller.
    const second = analysis.start({ kind: "references", characterId: CHAR, evidenceMode: "image" });
    expect(codeOf(() => analysis.start({ kind: "character-prompts", characterId: CHAR }))).toBe("busy");
    expect(codeOf(() => analysis.start({ kind: "references", characterId: "other", evidenceMode: "text" }))).toBe("ok");
    analysis.cancel();
    await Promise.all([first, second].map((j) => analysis.wait(j.jobId)));
    analysis.dispose();
  });

  test("a save that fails after the cancel is reported as an error, a plain abort as cancelled", async () => {
    const fx = createAnalysisFixture();
    const jobs = new AnalysisJobs(fx.services);
    const failed = jobs.start("metadata-check", CHAR, async () => {
      jobs.cancel({ kind: "metadata-check" });
      throw new RpcFailure(rpcError("storage-error", "Could not write characters/c/asset-maid.json."));
    });
    expect(await failed.done).toMatchObject({ status: "error", error: { code: "storage-error" } });
    const aborted = jobs.start("metadata-check", CHAR, async (ctx) => {
      jobs.cancel({ kind: "metadata-check" });
      ctx.signal.throwIfAborted();
      return { status: "success", message: "" };
    });
    expect((await aborted.done).status).toBe("cancelled");
  });

  test("a run that fails before its controller starts still disposes the session (AM vision memo entry)", async () => {
    for (const kind of ["charx-regex", "persona"] as const) {
      const fx = createAnalysisFixture({
        sources: {
          getCharacter: async () => {
            throw new Error("host down");
          },
          listPersonas: async () => {
            throw new Error("host down");
          },
        },
      });
      fx.visionSupported.value = true;
      const before = AM.Qpe.size;
      const out = await new AnalysisJobs(fx.services).start(kind, CHAR, (ctx) => runAnalysis(ctx, { kind, characterId: CHAR })).done;
      expect(out.status).toBe("error");
      expect(AM.Qpe.size).toBe(before);
    }
  });
});
