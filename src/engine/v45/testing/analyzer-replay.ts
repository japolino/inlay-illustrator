/**
 * Scenario replay for V4.5 analyzer parity (used by BOTH the fixture generator, which passes the
 * ORIGINAL bundle's functions, and the bun tests, which pass the port). Keeping the driver in one
 * place guarantees both sides run the exact same call sequence.
 *
 * A scenario creates one analyzer engine (AM `Ttt`) + runner (AM `VQe`) and performs several
 * `runner.run()` calls against a scripted fake LLM client. Everything observable is recorded:
 * client calls (config, messages, options), diagnostics, progress, hook arguments, result or error.
 */
import { v45Plain } from "../plain";

/** Scripted client step: return `{raw, parsed}` or throw an AnalyzerClientError (AM `on`). */
export type ScriptStep =
  | { respond: { raw: string; parsed: unknown } }
  | { throw: { message: string; code: string; httpStatus?: number; analyzerRaw?: string; responseText?: string } }
  | { throwTypeError: string };

export interface ReplayRun {
  label: string;
  /** Overrides merged (shallow) into the scenario base input. */
  input: Record<string, unknown>;
  /** Shallow overrides for `input.context`. */
  contextPatch?: Record<string, unknown>;
  script: ScriptStep[];
  /** afterAnalysisValidated: resolve outfit proposals by writing this outfit id into every actor that has one. */
  resolveOutfitProposalsTo?: string;
}

export interface ReplayScenario {
  name: string;
  baseInput: Record<string, unknown>;
  runs: ReplayRun[];
}

export interface ReplayKit {
  createEngine(): { start: Function; [k: string]: unknown };
  createRunner(engine: unknown, client: unknown): { run(input: Record<string, unknown>): Promise<unknown> };
  makeClientError(message: string, options: Record<string, unknown>): Error;
}

export interface RecordedRun {
  label: string;
  calls: unknown[];
  events: unknown[];
  progress: unknown[];
  hooks: unknown[];
  result?: unknown;
  error?: unknown;
  /** Unused scripted steps after the run. */
  scriptLeft?: number;
}

const ERROR_FIELDS = [
  "name",
  "message",
  "code",
  "retryable",
  "analyzerStage",
  "analyzerStageNumber",
  "analyzerAttempts",
  "analyzerUnifiedAttempts",
  "analyzerRepairAttempts",
  "analyzerCheckpointAvailable",
  "analyzerRaw",
  "httpStatus",
] as const;

/** Stable projection of an error (own enumerable fields + the fields above; no stack, no cause). */
export function projectError(error: unknown): unknown {
  if (!(error instanceof Error)) return { thrown: v45Plain(error) };
  const out: Record<string, unknown> = {};
  for (const key of ERROR_FIELDS) {
    const v = (error as unknown as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = v45Plain(v);
  }
  return out;
}

function projectDetail(event: Record<string, unknown>): unknown {
  const name = String(event.event ?? "");
  const detail = event.detail;
  if (detail instanceof Error) return projectError(detail);
  if ((name === "request" || name === "unified-request" || name === "modifier-repair-request") && detail && typeof detail === "object") {
    const { request: _request, ...rest } = detail as Record<string, unknown>;
    return v45Plain(rest);
  }
  if (name === "error" && detail && typeof detail === "object" && "error" in (detail as object)) {
    const d = detail as Record<string, unknown>;
    return v45Plain({ ...d, error: projectError(d.error) });
  }
  return v45Plain(detail);
}

/** Run one scenario and return the recordings (already projected to plain JSON). */
export async function replayScenario(kit: ReplayKit, scenario: ReplayScenario): Promise<RecordedRun[]> {
  const engine = kit.createEngine();
  const recorded: RecordedRun[] = [];
  let current: RecordedRun | null = null;
  let script: ScriptStep[] = [];
  const client = {
    async complete(config: unknown, messages: unknown, options: Record<string, unknown>) {
      const { signal: _s, beforeRequest: _b, onRequestProgress: _p, ...rest } = options ?? {};
      current?.calls.push(v45Plain({ config, messages, options: rest }));
      const step = script.shift();
      if (!step) throw new Error("replay: script exhausted");
      if ("respond" in step) return structuredClone(step.respond);
      if ("throwTypeError" in step) throw new TypeError(step.throwTypeError);
      throw kit.makeClientError(step.throw.message, { ...step.throw });
    },
  };
  const runner = kit.createRunner(engine, client);
  for (const run of scenario.runs) {
    const rec: RecordedRun = { label: run.label, calls: [], events: [], progress: [], hooks: [] };
    current = rec;
    script = [...run.script];
    const base = structuredClone(scenario.baseInput);
    const input: Record<string, unknown> = { ...base, ...structuredClone(run.input) };
    if (run.contextPatch) input.context = { ...(input.context as object), ...structuredClone(run.contextPatch) };
    input.onDiagnostic = (e: Record<string, unknown>) =>
      rec.events.push({ event: e.event, stage: e.stage, attempt: e.attempt, detail: projectDetail(e) });
    input.onProgress = (p: unknown) => rec.progress.push(v45Plain(p));
    input.afterAnalysisValidated = (arg: Record<string, unknown>) => {
      rec.hooks.push({ hook: "afterAnalysisValidated", arg: v45Plain(arg) });
      if (run.resolveOutfitProposalsTo) {
        const routePlan = arg.routePlan as { images: { actors: Record<string, Record<string, unknown> | null> }[] };
        for (const image of routePlan.images)
          for (const actor of Object.values(image.actors))
            if (actor && String(actor.outfit_proposal_id ?? "").trim()) {
              actor.outfit_id = run.resolveOutfitProposalsTo;
              actor.outfit_proposal_id = "";
            }
      }
    };
    input.afterPresetValidated = (routePlan: unknown) => {
      rec.hooks.push({ hook: "afterPresetValidated", arg: v45Plain(routePlan) });
    };
    try {
      rec.result = v45Plain(await runner.run(input));
    } catch (error) {
      rec.error = projectError(error);
    }
    rec.scriptLeft = script.length;
    recorded.push(rec);
  }
  current = null;
  return recorded;
}
