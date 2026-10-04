/**
 * Inlay Illustrator backend (Asset Maid 0.9.88 port).
 *
 * - Per-user runtime (src/backend/runtime.ts): services (storage, LLM, images, image bytes, sources, events, run log),
 *   feature modules (chat pipeline, asset analysis) and the RPC router (src/shared/contract/rpc.ts).
 * - Interceptor: strips our baked illustration blocks (and decodes native-asset suppression carriers) before every LLM request.
 * - Host events: GENERATION_ENDED starts automatic illustration; message/chat/character events keep the pipeline consistent.
 * - Frontend channel: fetch-bridge answers and RPC envelopes (other messages are ignored).
 */
import { createAnalysisModule } from "./backend/analysis/index.js";
import { createPipelineModule, stripForInterceptor } from "./backend/pipeline/index.js";
import { createBackendRuntime, type ModuleFactory } from "./backend/runtime.js";
import type { SpindleHost } from "./backend/services/types.js";

declare const spindle: SpindleHost;

const pipelineModule: ModuleFactory = (services, getModules) => {
  const created = createPipelineModule(services, getModules);
  void created.pipeline.recover().catch((error: unknown) => services.log.append("warn", "pipeline", `Recovery failed: ${errorText(error)}`));
  return created;
};
const analysisModule: ModuleFactory = (services, getModules) => createAnalysisModule(services, getModules);

const runtime = createBackendRuntime({ host: spindle, modules: [pipelineModule, analysisModule] });

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

spindle.registerInterceptor(async (messages) =>
  stripForInterceptor(messages as unknown as Parameters<typeof stripForInterceptor>[0]) as unknown as typeof messages
);

/* Host events -------------------------------------------------------------------------------- */

function forUser(userId: string | undefined, run: (userId: string | undefined) => Promise<unknown> | unknown): void {
  // Host events of user-scoped extensions carry no userId: they belong to the owner (undefined) and every user seen so far.
  const targets = userId !== undefined ? [userId] : runtime.users().length ? runtime.users() : [undefined];
  for (const target of targets) {
    Promise.resolve()
      .then(() => run(target))
      .catch((error: unknown) => {
        try {
          runtime.services(target).log.append("error", "host-event", errorText(error));
        } catch {
          /* ignore */
        }
      });
  }
}

spindle.on("GENERATION_ENDED", (payload, userId) => {
  forUser(userId, (user) => runtime.modules(user).pipeline.handleGenerationEnded(payload));
});

const PIPELINE_HOST_EVENTS = [
  "GENERATION_STARTED",
  "GENERATION_STOPPED",
  "MESSAGE_SWIPED",
  "MESSAGE_DELETED",
  "MESSAGE_EDITED",
  "SWIPE_EDITED",
  "CHAT_CHANGED",
  "CHAT_SWITCHED",
  "CHARACTER_EDITED",
  "CHARACTER_DELETED",
] as const;
for (const event of PIPELINE_HOST_EVENTS) {
  spindle.on(event, (payload: unknown, userId?: string) => {
    forUser(userId, (user) => {
      if (event === "CHARACTER_EDITED" || event === "CHARACTER_DELETED") {
        const characterId = (payload as { id?: unknown; characterId?: unknown } | null)?.characterId ?? (payload as { id?: unknown } | null)?.id;
        runtime.services(user).sources.invalidate(typeof characterId === "string" ? characterId : undefined);
      }
      return runtime.modules(user).pipeline.handleHostEvent(event, payload);
    });
  });
}

/* Frontend channel ---------------------------------------------------------------------------- */

spindle.onFrontendMessage(async (payload: unknown, userId, frontendSessionId) => {
  try {
    await runtime.handleFrontendMessage(payload, userId, frontendSessionId);
  } catch (error) {
    try {
      runtime.services(userId).log.append("error", "frontend", errorText(error));
    } catch {
      spindle.log.error(`Inlay Illustrator frontend message failed: ${errorText(error)}`);
    }
  }
});

spindle.log.info("Inlay Illustrator loaded.");
