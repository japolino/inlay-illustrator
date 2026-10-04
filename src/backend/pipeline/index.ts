/**
 * Chat illustration pipeline module (Asset Maid 0.9.88 chat pipeline on Lumiverse).
 *
 *   const { pipeline } = createPipelineModule(services, getModules);
 *   spindle.on("GENERATION_ENDED", (p) => pipeline.handleGenerationEnded(p));
 *   spindle.on("MESSAGE_SWIPED" | "MESSAGE_DELETED" | "GENERATION_STARTED" | ..., (p) => pipeline.handleHostEvent(name, p));
 *   spindle.registerInterceptor((messages) => pipeline.stripForInterceptor(messages));
 *   await pipeline.recover();
 *
 * Files: controller.ts (jobs + flows), generate.ts (one message run over the engine), engine-port.ts + providers.ts
 * (engine wiring, image provider adapters), markup.ts (strip / suppression / bake), chat-data.ts (plans <-> History),
 * records.ts (sidecar), host-chat.ts (Lumiverse messages / swipes), labels.ts (UI strings).
 */
import type { BackendModules } from "../rpc/types.js";
import type { BackendServices } from "../services/types.js";
import { createChatPipelineController, type ChatPipeline, type ControllerOptions } from "./controller.js";
import { createEnginePort, type EnginePort } from "./engine-port.js";

export type { ChatPipeline, PublishResult } from "./controller.js";
export type { EnginePort, EngineRunContext } from "./engine-port.js";
export { stripForInterceptor, cleanMessageContent, bakeMessage } from "./markup.js";

declare module "../rpc/types.js" {
  interface BackendModules {
    pipeline: ChatPipeline;
  }
}

export interface PipelineModuleOptions extends ControllerOptions {
  /** Inject an engine port (tests); default: the real engine over the services. */
  engine?: EnginePort;
}

export function createPipelineModule(services: BackendServices, _getModules?: () => BackendModules, options: PipelineModuleOptions = {}): { pipeline: ChatPipeline } {
  const engine =
    options.engine ??
    createEnginePort(services, {
      onAnalyzerDiagnostic: (event) => {
        try {
          services.log.append("debug", "analyzer", event.event, event.detail);
        } catch {
          /* ignore */
        }
      },
    });
  return { pipeline: createChatPipelineController(services, engine, options) };
}
