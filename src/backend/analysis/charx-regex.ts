/**
 * Charx asset regex analysis (AM "charx 정규식 분석"): detect the asset-token regexes in a character's scripts so the chat
 * pipeline can recognise native asset images (AM `Owt` L137192, request `Lyt` L120582 with system `mPe`, parse `Fyt` L120614,
 * merge with manual detectors `Kyt`, runtime use `sH` L120727). Stored in `characterPrompt.charxAssetRegexAnalysis[characterId]`.
 *
 * Lumiverse mapping: RisuAI `customscript` = the character's regex scripts. Source order: `host.regex_scripts.list({scope:
 * "character", scopeId})` (permission `regex_scripts`), else the card's `extensions.regex_scripts` (SillyTavern format).
 * No scripts -> AM records `not_applicable` (job status no-evidence).
 */
import { rpcError, type CharxRegexAnalysis, type CharxRegexDetector, type JobStatus } from "../../shared/contract/index.js";
import { fail } from "../rpc/errors.js";
import type { BackendServices } from "../services/types.js";
import { AM } from "./core/index.js";
import { mutateAmConfig } from "./bridge/config-store.js";
import { createAmAnalyzer, openAnalysisSession } from "./bridge/session.js";
import { amLabel, amMessage } from "./labels.js";
import type { JobContext, JobOutcome } from "./jobs.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** RisuAI customscript entry (`Abe` L120400-ish reads comment/type/in/out/flag/ableFlag). */
export interface RisuCustomScript { comment: string; type: string; in: string; out: string; flag: string; ableFlag: boolean }

const TARGET_TO_RISU: Record<string, string> = { display: "editdisplay", response: "editoutput", prompt: "editprocess", input: "editinput" };

/** `/pattern/flags` -> {in, flag}; anything else is a bare pattern. */
function splitRegexLiteral(value: string, flags = ""): { in: string; flag: string } {
  const m = /^\/([\s\S]*)\/([a-z]*)$/u.exec(value.trim());
  return m ? { in: m[1]!, flag: flags || m[2]! } : { in: value, flag: flags };
}

/** The character's regex scripts in RisuAI `customscript` shape (enabled scripts only). */
export async function loadCharacterScripts(services: BackendServices, characterId: string): Promise<RisuCustomScript[]> {
  const api = (services.host as unknown as { regex_scripts?: { list(o: Any): Promise<{ data: Any[] }> } }).regex_scripts;
  if (api?.list) {
    try {
      const { data } = await api.list({ scope: "character", scopeId: characterId, limit: 500, ...(services.userId ? { userId: services.userId } : {}) });
      return (data ?? [])
        .filter((s) => s && s.disabled !== true)
        .map((s) => {
          const r = splitRegexLiteral(String(s.find_regex ?? ""), String(s.flags ?? ""));
          return { comment: String(s.name ?? s.script_id ?? ""), type: TARGET_TO_RISU[String(s.target)] ?? String(s.target ?? ""), in: r.in, out: String(s.replace_string ?? ""), flag: r.flag, ableFlag: !!r.flag };
        });
    } catch (error) {
      services.log.append("warn", "charx-regex", `Regex scripts API unavailable, using the character card scripts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const character = await services.sources.getCharacter(characterId);
  const scripts = (character.extensions as { regex_scripts?: unknown }).regex_scripts;
  return (Array.isArray(scripts) ? scripts : [])
    .filter((s: Any) => s && s.disabled !== true)
    .map((s: Any) => {
      const r = splitRegexLiteral(String(s.findRegex ?? s.find_regex ?? s.in ?? ""), String(s.flags ?? ""));
      const placement: number[] = Array.isArray(s.placement) ? s.placement : [];
      const type = s.markdownOnly ? "editdisplay" : s.promptOnly ? "editprocess" : placement.includes(1) && !placement.includes(2) ? "editinput" : "editoutput";
      return { comment: String(s.scriptName ?? s.name ?? ""), type, in: r.in, out: String(s.replaceString ?? s.replace_string ?? s.out ?? ""), flag: r.flag, ableFlag: !!r.flag };
    });
}

/** RisuAI-like character object read by AM `iH` (chaId, name, customscript). */
export async function charxRegexCharacter(services: BackendServices, characterId: string): Promise<Any> {
  const character = await services.sources.getCharacter(characterId);
  return { chaId: characterId, name: character.name, type: "character", customscript: await loadCharacterScripts(services, characterId) };
}

export async function runCharxRegex(ctx: JobContext, params: { force?: boolean }): Promise<JobOutcome> {
  const session = await openAnalysisSession(ctx.services, ctx.characterId, { reason: "charx-regex" });
  const character = await charxRegexCharacter(ctx.services, ctx.characterId);
  const controller = AM.Owt({
    data: { getCurrentCharacter: async () => character },
    sourceCatalog: { ...session.sourceCatalog, getCachedCharacter: () => ({ character }) },
    analyzer: createAmAnalyzer(ctx.services, {
      purpose: "charx-regex",
      onRetry: (info) => ctx.progress({ label: `Retrying (${info.attempt}/${info.total})`, labelKo: "재시도", retry: { attempt: info.attempt, total: info.total } }),
    }),
    config: session.store,
    log: (line: string) => ctx.services.log.append("warn", "charx-regex", line),
  });
  const unsubscribe = controller.subscribe(() => {
    const snap = controller.getSnapshot();
    ctx.progress({ ...amLabel(String(snap.label ?? "")), ...(snap.total ? { done: snap.completed, total: snap.total } : {}), ...(Number.isFinite(snap.progress) ? { fraction: snap.progress } : {}) });
  });
  const onAbort = () => controller.cancel();
  ctx.signal.addEventListener("abort", onAbort, { once: true });
  try {
    await controller.analyzeRegex({ scope: "current-character", currentCharacter: character, force: params.force === true });
    await session.store.flushSave();
    const snap = controller.getSnapshot();
    const stored = AM.FI(session.store.getCurrentSnapshot().characterPrompt.charxAssetRegexAnalysis?.[ctx.characterId]);
    const { message, messageKo } = amMessage(String(snap.label ?? ""));
    const status: JobStatus =
      snap.status === "cancelled" || ctx.signal.aborted ? "cancelled" : snap.status === "error" ? "error" : stored.status === "done" ? "success" : "no-evidence";
    const error = String(snap.error ?? "");
    return {
      status,
      message: message || status,
      ...(messageKo ? { messageKo } : {}),
      ...(status === "error" ? { error: rpcError("provider-error", amMessage(error).message || message, { retryable: true }) } : {}),
    };
  } finally {
    ctx.signal.removeEventListener("abort", onAbort);
    unsubscribe?.();
    controller.dispose();
    session.dispose();
  }
}

/** Manual detector edit (`charxRegex.setDetectors`): every pattern must compile (`sH` uses `new RegExp(in, flags)`). */
export async function setCharxRegexDetectors(services: BackendServices, characterId: string, detectors: CharxRegexDetector[]): Promise<{ analysis: CharxRegexAnalysis }> {
  if (!Array.isArray(detectors)) fail("bad-request", "detectors must be an array.");
  const list = detectors.map((d, index) => {
    const pattern = typeof d?.in === "string" ? d.in.trim() : "";
    if (!pattern) fail("bad-request", `Detector ${index + 1} has an empty pattern.`);
    const source = d.source === "script" && Number.isInteger(d.scriptIndex) && Number(d.scriptIndex) >= 0 ? "script" : "manual";
    const flags = typeof d.flags === "string" ? d.flags.trim() : "";
    try {
      new RegExp(pattern, flags || (source === "script" ? "g" : "u"));
    } catch (error) {
      fail("bad-request", `Detector ${index + 1} is not a valid regular expression: ${error instanceof Error ? error.message : String(error)}`, { details: { index } });
    }
    return { scriptIndex: source === "script" ? Number(d.scriptIndex) : -1, in: pattern, source, flags, ...(d.scriptName ? { scriptName: String(d.scriptName) } : {}) };
  });
  const { config } = await mutateAmConfig(
    services,
    characterId,
    (c) => {
      const current = AM.FI(c.characterPrompt.charxAssetRegexAnalysis?.[characterId]);
      const next = { ...current, status: list.length ? "done" : "not_applicable", analyzedAt: new Date().toISOString(), detectors: list, error: "" };
      return { ...c, characterPrompt: { ...c.characterPrompt, charxAssetRegexAnalysis: { ...(c.characterPrompt.charxAssetRegexAnalysis ?? {}), [characterId]: next } } };
    },
    { reason: "charx-regex" },
  );
  return { analysis: config.characterPrompt.charxAssetRegexAnalysis[characterId] as CharxRegexAnalysis };
}
