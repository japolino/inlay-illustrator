/**
 * Dev mock handlers for the settings pages: model lists, connection/message tests, per-character settings scopes,
 * character / factory reset and run logs. Owner: settings pages. Uses the shared MockDb (read-only fixtures).
 */
import {
  charxScopeFor,
  clearCharxOverrides,
  resetAllCharxOverrides,
  createDefaultChatImageGenerationSettings,
  createDefaultConfig,
  createDefaultUiState,
  refreshCharxDirtyFields,
  resolveAllCharxSettings,
  resolveEffectiveCharxSettings,
  setCharxDefaults,
  setCharxOverride,
  type CharxScopeConfig,
  type InlayConfig
} from "../../../shared/contract/config.js";
import { CHARX_SETTING_FIELDS, createEmptyCharacterDocument, type CharxSettingField } from "../../../shared/contract/character.js";
import type { RuntimeLogEntry } from "../../../shared/contract/rpc.js";
import type { MockContext, MockHandlers } from "../mock-backend.js";
import { documentFor, findCharacter, type MockDb } from "./fixtures.js";

const LLM_MODELS: Record<string, { id: string; label: string }[]> = {
  "llm-1": [
    { id: "gpt-5.5", label: "gpt-5.5" },
    { id: "gpt-5.5-mini", label: "gpt-5.5-mini" },
    { id: "gpt-5.4", label: "gpt-5.4" }
  ],
  "llm-2": [
    { id: "gemini-3-pro", label: "Gemini 3 Pro" },
    { id: "gemini-3-flash", label: "Gemini 3 Flash" }
  ]
};
const IMAGE_MODELS: Record<string, { id: string; label: string }[]> = {
  "img-nai": [
    { id: "nai-diffusion-4-5-full", label: "NAI Diffusion V4.5 Full" },
    { id: "nai-diffusion-4-5-curated", label: "NAI Diffusion V4.5 Curated" },
    { id: "nai-diffusion-5-full", label: "NAI Diffusion V5 Full" }
  ],
  "img-comfy": [{ id: "anima-v1", label: "anima-v1" }]
};

/** Fixture log entries (shown until the log is cleared). */
export function sampleLogEntries(now = Date.now()): RuntimeLogEntry[] {
  const at = (offsetSec: number) => new Date(now - offsetSec * 1000).toISOString();
  return [
    { seq: 1, at: at(240), level: "info", scope: "chat-lifecycle", message: "AI reply finished; automatic generation queued (1 image).", details: { chatId: "chat-1", messageKey: "m-41@0" } },
    { seq: 2, at: at(236), level: "debug", scope: "ai-analysis", message: "Analyzer request sent (Asset Maid V5, scene preset: Illustration).", details: { model: "gpt-5.5", promptChars: 18234, timeoutMs: 180000 } },
    { seq: 3, at: at(214), level: "info", scope: "ai-analysis", message: "Analyzer answered in 21.4s; 2 actors, sizeId 1.", details: { actors: ["han seo-yeon", "kim mina"], sizeId: 1 } },
    { seq: 4, at: at(212), level: "info", scope: "chat-image", message: "NovelAI request 1/1 started." },
    { seq: 5, at: at(190), level: "warn", scope: "chat-image", message: "NovelAI returned 429; retry 1/5 in 4s." },
    { seq: 6, at: at(180), level: "info", scope: "chat-image", message: "Image committed to message m-41@0 (slot 1)." },
    { seq: 7, at: at(60), level: "error", scope: "comfyui-request", message: "ComfyUI workflow failed: node 12 (KSampler) missing input 'model'.", details: { promptId: "c0ffee", node: 12 } },
    { seq: 8, at: at(12), level: "info", scope: "asset-selection-persistence", message: "Asset selection saved for 3 prompts." }
  ];
}

function scopeOf(db: MockDb, characterId: string): CharxScopeConfig {
  return charxScopeFor(db.config, characterId ? documentFor(db, characterId) : null);
}

/** Writes a changed scope back into the global config and the character document. */
function storeScope(db: MockDb, characterId: string, scope: CharxScopeConfig): void {
  const cp = scope.characterPrompt;
  db.config = {
    ...db.config,
    runtime: { ...db.config.runtime, ...(scope.runtime.nsfwAlwaysEnabled === undefined ? {} : { nsfwAlwaysEnabled: scope.runtime.nsfwAlwaysEnabled }) },
    novelai: { ...db.config.novelai, ...(scope.novelai.negativePrompt === undefined ? {} : { negativePrompt: scope.novelai.negativePrompt }) },
    characterPrompt: {
      ...db.config.characterPrompt,
      ...(cp.fixedPositivePrompt === undefined ? {} : { fixedPositivePrompt: cp.fixedPositivePrompt }),
      charxGenerationDefaults: cp.charxGenerationDefaults as InlayConfig["characterPrompt"]["charxGenerationDefaults"]
    }
  };
  if (characterId) {
    const doc = documentFor(db, characterId);
    doc.characterPrompt.charxSettings = { ...doc.characterPrompt.charxSettings, overrides: cp.charxSettings.overrides as typeof doc.characterPrompt.charxSettings.overrides };
    doc.updatedAt = new Date().toISOString();
  }
}

function dirtyOf(db: MockDb, characterId: string): CharxSettingField[] {
  const dirty = db.config.characterPrompt.charxGenerationDefaults.dirtyFieldsBySourceId?.[characterId] ?? [];
  return CHARX_SETTING_FIELDS.filter((f) => dirty.includes(f));
}

function logsOf(db: MockDb): RuntimeLogEntry[] {
  if (!db.extra.settingsLogsSeeded) {
    db.extra.settingsLogsSeeded = true;
    if (!db.logs.length) db.logs = sampleLogEntries();
  }
  return db.logs;
}

/** Appends a log entry and pushes `log.appended` (used by scenes). */
export function appendMockLog(db: MockDb, ctx: Pick<MockContext, "emit">, entry: Omit<RuntimeLogEntry, "seq" | "at">): RuntimeLogEntry {
  const logs = logsOf(db);
  const full: RuntimeLogEntry = { ...entry, seq: (logs.reduce((max, e) => Math.max(max, e.seq), 0) || 0) + 1, at: new Date().toISOString() };
  db.logs = [...logs, full].slice(-250);
  ctx.emit("log.appended", { entry: full });
  return full;
}

export function settingsMockHandlers(): MockHandlers {
  return {
    "connections.listLlmModels": async ({ connectionId }, ctx) => {
      await ctx.delay(150);
      return { models: LLM_MODELS[connectionId] ?? [] };
    },
    "connections.listImageModels": async ({ connectionId }, ctx) => {
      await ctx.delay(150);
      return { models: IMAGE_MODELS[connectionId] ?? [] };
    },
    "analyzer.testMessage": async ({ text }, ctx) => {
      const connection = ctx.db.llmConnections.find((c) => c.id === ctx.db.config.analysis.connectionId) ?? ctx.db.llmConnections.find((c) => c.isDefault);
      await ctx.delay(900);
      if (!connection) return { ok: false, latencyMs: 0, error: { code: "not-found", message: "No connection profile is selected." } };
      return { ok: true, latencyMs: 912, reply: `Hello! (${ctx.db.config.analysis.model || connection.model} via ${connection.name}) You said: "${(text ?? "").slice(0, 60)}"` };
    },
    "image.testConnection": async ({ connectionId }, ctx) => {
      await ctx.delay(500);
      if (connectionId === "img-comfy") return { ok: false, latencyMs: 0, error: { code: "provider-error", message: "ComfyUI is not reachable at http://127.0.0.1:8188 (ECONNREFUSED)." } };
      return { ok: true, latencyMs: 184 };
    },
    "config.factoryReset": async (_params, ctx) => {
      const keep = ctx.db.config;
      const fresh = createDefaultConfig();
      fresh.analysis.connectionId = keep.analysis.connectionId;
      fresh.image = { ...fresh.image, connectionId: keep.image.connectionId, provider: keep.image.provider };
      ctx.db.config = fresh;
      ctx.db.chatImageGeneration = createDefaultChatImageGenerationSettings();
      ctx.db.uiState = createDefaultUiState();
      for (const id of Object.keys(ctx.db.documents)) ctx.db.documents[id] = createEmptyCharacterDocument(id);
      ctx.emit("config.changed", { config: ctx.db.config });
      return { ok: true };
    },
    "charxSettings.get": ({ characterId }, ctx) => {
      if (characterId && !findCharacter(ctx.db, characterId)) ctx.fail("not-found", `Character ${characterId} not found.`);
      if (characterId) storeScope(ctx.db, characterId, refreshCharxDirtyFields(scopeOf(ctx.db, characterId), characterId));
      const scope = scopeOf(ctx.db, characterId);
      return {
        effective: characterId ? resolveEffectiveCharxSettings(scope, characterId) : resolveAllCharxSettings(scope),
        all: resolveAllCharxSettings(scope),
        dirtyFields: characterId ? dirtyOf(ctx.db, characterId) : []
      };
    },
    "charxSettings.setOverride": ({ characterId, patch }, ctx) => {
      if (!findCharacter(ctx.db, characterId)) ctx.fail("not-found", `Character ${characterId} not found.`);
      storeScope(ctx.db, characterId, setCharxOverride(scopeOf(ctx.db, characterId), characterId, patch));
      ctx.emit("config.changed", { config: ctx.db.config });
      return { effective: resolveEffectiveCharxSettings(scopeOf(ctx.db, characterId), characterId), dirtyFields: dirtyOf(ctx.db, characterId) };
    },
    "charxSettings.setDefaults": ({ patch }, ctx) => {
      storeScope(ctx.db, "", setCharxDefaults(scopeOf(ctx.db, ""), patch));
      ctx.emit("config.changed", { config: ctx.db.config });
      return { all: resolveAllCharxSettings(scopeOf(ctx.db, "")) };
    },
    "charxSettings.resetAll": (_params, ctx) => {
      storeScope(ctx.db, "", resetAllCharxOverrides(scopeOf(ctx.db, "")));
      ctx.emit("config.changed", { config: ctx.db.config });
      return { all: resolveAllCharxSettings(scopeOf(ctx.db, "")) };
    },
    "charxSettings.clearOverrides": ({ characterId }, ctx) => {
      storeScope(ctx.db, characterId, clearCharxOverrides(scopeOf(ctx.db, characterId), characterId));
      ctx.emit("config.changed", { config: ctx.db.config });
      return { effective: resolveEffectiveCharxSettings(scopeOf(ctx.db, characterId), characterId) };
    },
    "charxRegex.setDetectors": ({ characterId, detectors }, ctx) => {
      const doc = documentFor(ctx.db, characterId);
      for (const [index, d] of detectors.entries()) {
        try {
          new RegExp(String(d.in), "u");
        } catch {
          ctx.fail("bad-request", `Detector ${index + 1} is not a valid regular expression.`);
        }
      }
      const map = (doc.characterPrompt.charxAssetRegexAnalysis ?? {}) as Record<string, unknown>;
      const analysis = { status: detectors.length ? "done" : "not_applicable", analyzedAt: new Date().toISOString(), detectors, error: "" };
      doc.characterPrompt.charxAssetRegexAnalysis = { ...map, [characterId]: analysis } as typeof doc.characterPrompt.charxAssetRegexAnalysis;
      doc.updatedAt = new Date().toISOString();
      ctx.emit("document.changed", { characterId, updatedAt: doc.updatedAt, reason: "charx-regex" });
      return { analysis };
    },
    "character.reset": async ({ characterId }, ctx) => {
      if (!findCharacter(ctx.db, characterId)) ctx.fail("not-found", `Character ${characterId} not found.`);
      await ctx.delay(400);
      storeScope(ctx.db, characterId, clearCharxOverrides(scopeOf(ctx.db, characterId), characterId));
      ctx.db.documents[characterId] = createEmptyCharacterDocument(characterId);
      ctx.emit("document.changed", { characterId, updatedAt: new Date().toISOString(), reason: "reset" });
      return { ok: true };
    },
    "logs.list": ({ sinceSeq, limit }, ctx) => {
      const entries = logsOf(ctx.db).filter((e) => sinceSeq === undefined || e.seq > sinceSeq);
      return { entries: entries.slice(-(limit ?? 250)) };
    },
    "logs.clear": (_params, ctx) => {
      logsOf(ctx.db);
      ctx.db.logs = [];
      return { ok: true };
    }
  };
}
