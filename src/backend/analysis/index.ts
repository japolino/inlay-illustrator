/**
 * Asset analysis module (AM "에셋분석" area + prompts tab + outfit images): per-user controller registered into
 * `BackendModules.analysis`. Handlers: src/backend/rpc/handlers/workspace.ts.
 *
 * Layout:
 * - core/        generated verbatim slice of AssetMaid.pretty.js (analysis controllers, parsers, metadata reader, asset index)
 * - bridge/      adapters from port services to AM dependencies (config store, source catalog, priority assets, analyzer)
 * - workspace.ts roster projection + roster / custom character / prompts tab writes
 * - assets.ts    asset list, selections, references, metadata, uploads, crops
 * - runs.ts      analysis kinds -> AM controllers;  jobs.ts job registry + events;  labels.ts English labels
 * - outfit.ts    outfit / reference image generation
 */
import type { AnalysisKind, AnalysisStartParams, JobStatus, ProgressInfo } from "../../shared/contract/index.js";
import { fail } from "../rpc/errors.js";
import type { BackendModules } from "../rpc/types.js";
import type { BackendServices } from "../services/types.js";
import { AnalysisJobs } from "./jobs.js";
import { createOutfitImageController, type OutfitImageController } from "./outfit.js";
import { runAnalysis, SUPPORTED_ANALYSIS_KINDS } from "./runs.js";

export interface AnalysisController {
  start(params: AnalysisStartParams): { jobId: string };
  cancel(filter?: { jobId?: string; kind?: AnalysisKind; characterId?: string }): number;
  listActive(): { jobId: string; kind: AnalysisKind; characterId: string; status: JobStatus; progress: ProgressInfo }[];
  /** Resolves when the job finished (tests / internal callers). */
  wait(jobId: string): Promise<void>;
  outfitImages: OutfitImageController;
  dispose(): void;
}

declare module "../rpc/types.js" {
  interface BackendModules {
    analysis: AnalysisController;
  }
}

export function createAnalysisModule(services: BackendServices, _getModules?: () => Partial<BackendModules>): { analysis: AnalysisController } {
  const jobs = new AnalysisJobs(services);
  const done = new Map<string, Promise<unknown>>();
  const outfitImages = createOutfitImageController(services);
  const analysis: AnalysisController = {
    start(params) {
      if (!params || typeof params.characterId !== "string" || !params.characterId.trim()) fail("bad-request", "characterId is required.");
      if (!SUPPORTED_ANALYSIS_KINDS.has(params.kind)) {
        fail("unsupported", params.kind === "unique-tag-search" ? "Danbooru unique tag search is not available in this port." : `Analysis kind "${params.kind}" is not available yet.`, {
          detailCode: "ANALYSIS_KIND_UNSUPPORTED",
        });
      }
      const started = jobs.start(params.kind, params.characterId, (ctx) => runAnalysis(ctx, params));
      done.set(started.jobId, started.done.finally(() => done.delete(started.jobId)));
      return { jobId: started.jobId };
    },
    cancel(filter = {}) {
      return jobs.cancel(filter);
    },
    listActive() {
      return jobs.list();
    },
    async wait(jobId) {
      await done.get(jobId);
    },
    outfitImages,
    dispose() {
      jobs.dispose();
      outfitImages.dispose();
    },
  };
  return { analysis };
}

export { loadWorkspaceSnapshot } from "./workspace.js";
export type { OutfitImageController } from "./outfit.js";
