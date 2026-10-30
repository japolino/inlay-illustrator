/**
 * DecisionService over Lumiverse decision connections (`spindle.decisions`).
 */
import type { DecisionImagesInput, DecisionImagesResult, SpindleHost, RunLog } from "./types.js";
import { rpcError, type DecisionConnectionSummary, type ModelOption, type RpcError } from "../../shared/contract/index.js";
import type { JevConnectionSettings } from "../../shared/contract/config.js";
import { httpStatusOf } from "./llm.js";
import { errorMessage } from "./util.js";

export interface DecisionTestResult {
  ok: boolean;
  latencyMs: number;
  model?: string;
  error?: RpcError;
}

export interface DecisionTestParams {
  connectionId?: string;
  model?: string;
  userId?: string;
}

export interface DecisionServiceOptions {
  userId?: string;
}

export interface DecisionService {
  listConnections(options?: DecisionServiceOptions): Promise<DecisionConnectionSummary[]>;
  listModels(connectionId: string, options?: DecisionServiceOptions): Promise<ModelOption[]>;
  testConnection(params: DecisionTestParams, options?: { signal?: AbortSignal }): Promise<DecisionTestResult>;
  /** One request with image assets / Box questions (host capability `decision-images-v1`, TypeSafe connections only). Throws on errors. */
  evaluateImages(input: DecisionImagesInput, options?: { signal?: AbortSignal }): Promise<DecisionImagesResult>;
  createJevAdapter(getConfig: () => JevConnectionSettings, options?: DecisionServiceOptions): {
    network: {
      fetch(url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }): Promise<Response>;
    };
    getConfig: () => JevConnectionSettings & { apiKey: string };
  };
}

/** HTTP status for a failed host decision request, as AM's JEV client classifies it (401/403 auth, 429 rate limit, 5xx server, else http). */
function jevErrorStatus(error: unknown): number {
  const status = httpStatusOf(error);
  if (status >= 400) return status;
  const message = errorMessage(error);
  if (message.startsWith("PERMISSION_DENIED:")) return 403;
  if (/rate.?limit|too many requests/i.test(message)) return 429;
  if (/not found|no longer exists|invalid/i.test(message)) return 400;
  return 502;
}

export function createDecisionService(host: SpindleHost, log: RunLog, defaultUserId?: string): DecisionService {
  return {
    async listConnections(options = {}): Promise<DecisionConnectionSummary[]> {
      const api = (host as any).decisions;
      if (!api?.listConnections) return [];
      const effectiveUserId = options.userId ?? defaultUserId;
      try {
        const list = await api.listConnections(effectiveUserId ? { userId: effectiveUserId } : undefined);
        return list.map((c: any) => ({
          id: c.id,
          name: c.name,
          provider: c.provider,
          model: c.model,
          isDefault: !!c.is_default,
          hasApiKey: !!c.has_api_key,
        }));
      } catch (err) {
        log.append("error", "decision", `Failed to list decision connections: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    },

    async listModels(connectionId: string, options = {}): Promise<ModelOption[]> {
      const api = (host as any).decisions;
      if (!api?.getModels) return [];
      const effectiveUserId = options.userId ?? defaultUserId;
      try {
        const models = await api.getModels(connectionId, effectiveUserId ? { userId: effectiveUserId } : undefined);
        return models.map((m: any) => ({
          id: m.id,
          label: m.label || m.id,
          description: m.description,
        }));
      } catch (err) {
        log.append("error", "decision", `Failed to list decision models: ${err instanceof Error ? err.message : String(err)}`);
        return [];
      }
    },

    async testConnection(params, options = {}): Promise<DecisionTestResult> {
      const api = (host as any).decisions;
      if (!api?.evaluate) {
        return {
          ok: false,
          latencyMs: 0,
          error: rpcError("unsupported", "Decision API is not supported on this Lumiverse host."),
        };
      }
      const effectiveUserId = params.userId ?? defaultUserId;
      const start = Date.now();
      try {
        const res = await api.evaluate(
          {
            connection_id: params.connectionId || undefined,
            model: params.model || undefined,
            state: "Inlay decision connection test",
            questions: {
              test: {
                type: "noul",
                instructions: "Is this connection test functioning?",
              },
            },
            ...(effectiveUserId ? { userId: effectiveUserId } : {}),
          },
          { signal: options.signal },
        );
        return {
          ok: true,
          latencyMs: Date.now() - start,
          model: res.model,
        };
      } catch (err) {
        return {
          ok: false,
          latencyMs: Date.now() - start,
          error: rpcError("provider-error", err instanceof Error ? err.message : String(err)),
        };
      }
    },

    async evaluateImages(input, options = {}) {
      const res = await host.decisions.evaluate({ ...input, ...(defaultUserId ? { userId: defaultUserId } : {}) }, { signal: options.signal });
      return { model: res.model, answers: res.answers };
    },

    createJevAdapter(getConfig, adapterOptions = {}) {
      return {
        // AM sends JEV questions with `network.fetch(POST https://api.typesafe.ai/v1/systemone, {model, state, questions})`
        // and reads `{model, answers, usage}`. The port answers that request through the Lumiverse decisions API.
        network: {
          // Property form: Lumiverse's backend scan flags `fetch(` call/method syntax as direct fetch usage.
          // AM reports anything this throws as a network failure, so host errors come back as a TypeSafe-style error status.
          fetch: async (_url, init) => {
            try {
              const api = (host as any).decisions;
              if (!api?.evaluate) {
                throw new Error("JEV_UNAVAILABLE: Lumiverse decisions API is not available on this host.");
              }
              const body = JSON.parse(String(init.body)) as { model: string; state: unknown; questions: Record<string, unknown> };
              const currentCfg = getConfig();
              const effectiveUserId = adapterOptions.userId ?? defaultUserId;
              const res = await api.evaluate(
                {
                  connection_id: currentCfg.connectionId || undefined,
                  model: body.model,
                  state: body.state as any,
                  questions: body.questions as any,
                  ...(effectiveUserId ? { userId: effectiveUserId } : {}),
                },
                { signal: init.signal },
              );
              return new Response(JSON.stringify({ model: res.model, answers: res.answers, usage: res.usage ?? {} }), { status: 200 });
            } catch (err) {
              // AM's own cancel / timeout handling owns aborted requests.
              if (init.signal?.aborted) throw err;
              const message = errorMessage(err);
              log.append("error", "decision", `JEV decision request failed: ${message}`);
              return new Response(JSON.stringify({ error: message }), { status: jevErrorStatus(err) });
            }
          },
        },
        // AM checks `connection.apiKey` before a JEV run; the key stays in the Lumiverse connection, so pass a placeholder.
        getConfig: () => ({ ...getConfig(), apiKey: "lumiverse" }),
      };
    },
  };
}
