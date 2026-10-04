/**
 * Shared driver for context parity: computes every observable output of the analyzer context
 * builders for one scenario. The fixture generator passes the ORIGINAL bundle's functions; the
 * tests pass the port facade. Outputs are projected with `v45Plain`.
 */
import { v45Plain } from "../../v45/plain";
import { traceReads } from "./trace";

type Fn = (...args: never[]) => unknown;
export interface ContextKit {
  buildAnalyzerContextInputs: Fn;
  buildOutfitCandidates: Fn;
  buildVisualContinuityContext: Fn;
  buildChatContext: Fn;
  resolveSourceGenerationSettings: Fn;
  getDefaultSourceGenerationSettings: Fn;
  resolveNovelAIRunConfig: Fn;
  resolveArtistPromptSelection: Fn;
  resolvePersonaProfile: Fn;
  isFreeOutfitGenerationEnabled: Fn;
  hasStoredContinuity: Fn;
  resolveOutfitCreationMode: Fn;
  buildKnownIdentities: Fn;
  resolveIdentityEvidence: Fn;
}

export interface ContextScenario {
  name: string;
  sourceId: string;
  input: Record<string, unknown>;
  decisions: unknown[];
  v5Keys: string[];
  actors: unknown[];
  images: unknown[];
  slots: unknown[];
  assetTokens: unknown[];
  rename: Record<string, string>;
}

const call = (kit: ContextKit, name: keyof ContextKit, ...args: unknown[]): unknown => (kit[name] as (...a: unknown[]) => unknown)(...args);

function withoutFunctions(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v !== "function"));
}

export async function replayContextScenario(kit: ContextKit, sc: ContextScenario): Promise<Record<string, unknown>> {
  const input = structuredClone(sc.input) as Record<string, unknown> & { config: Record<string, unknown> };
  const out: Record<string, unknown> = {};
  const m = call(kit, "buildAnalyzerContextInputs", input) as Record<string, (...a: unknown[]) => unknown> & Record<string, unknown>;
  out.inputs = v45Plain(withoutFunctions(m));
  out.promptInputs = sc.decisions.map((d) => v45Plain(m.promptInputs!(structuredClone(d))));
  out.v5PromptContext = v45Plain(m.v5PromptContext!([...sc.v5Keys]));
  out.references = sc.actors.map((a) => v45Plain(m.references!(structuredClone(a))));
  out.outfitReference = sc.actors.map((a) => v45Plain(m.outfitReference!(structuredClone(a))));
  out.characterReference = sc.actors.map((a) => v45Plain(m.characterReference!(structuredClone(a))));
  out.seedSetting = v45Plain(m.seedSetting!(structuredClone(sc.actors[0])));
  out.outfitContinuityReferences = v45Plain(m.outfitContinuityReferences!(structuredClone(sc.images)));

  const cfg = input.config;
  const continuity = input.continuity as Record<string, unknown>;
  const chatKey = input.chatKey as string;
  const identity = (m.analyzerIdentityCandidates as unknown as { key: string }[]) ?? [];
  out.helpers = v45Plain({
    sourceSettings: call(kit, "resolveSourceGenerationSettings", cfg, sc.sourceId),
    defaultSourceSettings: call(kit, "getDefaultSourceGenerationSettings", cfg),
    novelAIRunConfig: call(kit, "resolveNovelAIRunConfig", cfg, { sourceId: sc.sourceId }),
    artistNovelAI: call(kit, "resolveArtistPromptSelection", cfg, { provider: "novelai", sourceId: sc.sourceId }),
    artistAnima: call(kit, "resolveArtistPromptSelection", cfg, { provider: "comfy-ui", sourceId: sc.sourceId }),
    artistDefaultProvider: call(kit, "resolveArtistPromptSelection", cfg, { sourceId: sc.sourceId }),
    personaActive: call(kit, "resolvePersonaProfile", cfg, "p1"),
    personaUnknown: call(kit, "resolvePersonaProfile", cfg, "nobody"),
    personaNone: call(kit, "resolvePersonaProfile", cfg, ""),
    freeOutfit: call(kit, "isFreeOutfitGenerationEnabled", cfg, sc.sourceId),
    hasStoredContinuity: call(kit, "hasStoredContinuity", continuity, chatKey),
    outfitCreationMode: call(kit, "resolveOutfitCreationMode", cfg),
    knownIdentities: call(kit, "buildKnownIdentities", input.source, input.personaRecords ?? []),
    outfitCandidates: call(kit, "buildOutfitCandidates", m.analyzerIdentityCandidates),
    chatContextWithPrevious: call(kit, "buildChatContext", input.messages, input.content, true),
    chatContextWithoutPrevious: call(kit, "buildChatContext", input.messages, input.content, false),
    visualContinuityDirect: call(kit, "buildVisualContinuityContext", continuity, chatKey, identity.map((c) => c.key).reverse().slice(0, 2), identity.map((c) => c.key), ["persona::p1"], {}),
  });
  out.identityEvidence = v45Plain(
    await call(kit, "resolveIdentityEvidence", {
      candidates: m.analyzerIdentityCandidates,
      slots: structuredClone(sc.slots),
      originalAssetTokens: structuredClone(sc.assetTokens),
      source: input.source,
      previousMessageParticipantKeys: [],
      yieldBudgetMs: 1e9,
    }),
  );

  // Read traces: which input fields the builders + callbacks touch.
  const tracedInput = structuredClone(sc.input) as Record<string, unknown>;
  const tc = traceReads(tracedInput.config as object, "config", sc.rename);
  const ts = tracedInput.source ? traceReads(tracedInput.source as object, "source", sc.rename) : null;
  const tch = tracedInput.character ? traceReads(tracedInput.character as object, "character", sc.rename) : null;
  const tco = traceReads(tracedInput.continuity as object, "continuity", sc.rename);
  const tp = tracedInput.activePersona ? traceReads(tracedInput.activePersona as object, "activePersona", sc.rename) : null;
  const tm = traceReads(tracedInput.messages as object, "messages", sc.rename);
  const tt = traceReads(tracedInput.imageTokens as object, "imageTokens", sc.rename);
  const traced = {
    ...tracedInput,
    config: tc.proxy,
    source: ts?.proxy ?? null,
    character: tch?.proxy ?? null,
    continuity: tco.proxy,
    activePersona: tp?.proxy ?? null,
    messages: tm.proxy,
    imageTokens: tt.proxy,
  };
  const tmat = call(kit, "buildAnalyzerContextInputs", traced) as Record<string, (...a: unknown[]) => unknown>;
  for (const d of sc.decisions) tmat.promptInputs!(structuredClone(d));
  tmat.v5PromptContext!([...sc.v5Keys]);
  for (const a of sc.actors) {
    tmat.references!(structuredClone(a));
    tmat.outfitReference!(structuredClone(a));
    tmat.characterReference!(structuredClone(a));
  }
  tmat.outfitContinuityReferences!(structuredClone(sc.images));
  out.reads = {
    config: tc.paths(),
    source: ts?.paths() ?? [],
    character: tch?.paths() ?? [],
    continuity: tco.paths(),
    activePersona: tp?.paths() ?? [],
    messages: tm.paths(),
    imageTokens: tt.paths(),
  };
  return out;
}
