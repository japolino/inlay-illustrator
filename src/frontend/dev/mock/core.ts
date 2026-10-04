/**
 * Dev mock: session, config, connections, charx rail / workspace / roster, recognition keys, custom characters.
 * Owner: ui lead. Other areas: ./settings.ts, ./workspace.ts, ./chat.ts.
 */
import {
  CHARACTER_DESCRIPTION_LORE_ID,
  compileMainPrompt,
  createCustomCharacter,
  descriptionPromptKey,
  effectiveRecognitionKeys,
  lorePromptKey,
  loreSelectionId,
  updateCustomCharacter,
  type CharacterDocument
} from "../../../shared/contract/character.js";
import { normalizeConfig, resolveEffectiveCharxSettings, charxScopeFor } from "../../../shared/contract/config.js";
import type { RosterItem, RosterSource, WorkspaceSnapshot } from "../../../shared/contract/rpc.js";
import type { MockContext, MockHandlers } from "../mock-backend.js";
import { mergePatch } from "../../state/app-state.js";
import { documentFor, findCharacter, type MockDb } from "./fixtures.js";

function toggle(list: string[] | undefined, id: string, on: boolean): string[] {
  const set = new Set(list ?? []);
  if (on) set.add(id);
  else set.delete(id);
  return [...set];
}

function mainPromptOf(doc: CharacterDocument, promptKey: string): string {
  const collection = doc.characterPrompt.characterForms[promptKey];
  const form = collection?.forms.find((f) => f.id === collection.defaultFormId) ?? collection?.forms[0];
  return form ? compileMainPrompt(form.basePromptGroups, form.gender) : "";
}

/** Builds the workspace snapshot of a character from the mock db. */
export function buildSnapshot(db: MockDb, characterId: string, ctx?: MockContext): WorkspaceSnapshot {
  const character = findCharacter(db, characterId);
  if (!character) {
    if (ctx) ctx.fail("not-found", `Character ${characterId} not found.`);
    throw new Error("not found");
  }
  const doc = documentFor(db, characterId);
  const cp = doc.characterPrompt;
  const registered = new Set(cp.selectedLorebooks[characterId] ?? []);
  const disabled = new Set(cp.workspaceDisabledLorebooks[characterId] ?? []);
  const connected = new Set(cp.activeModules[characterId] ?? []);
  const roster: RosterItem[] = [];
  const selectionCount = (key: string) => cp.assetSelections[key]?.selectedAssetNames?.length ?? 0;
  /** Mock thumbnail: first asset whose name starts with the first word of the title (lower case). */
  const thumbnail = (title: string): string | null => {
    const word = title.replace(/\(.*\)/u, "").trim().split(/\s+/u).pop()?.toLowerCase() ?? "";
    const romanized: Record<string, string> = { "한서연": "seoyeon", "김민아": "mina", "강지훈": "jihoon" };
    const key = romanized[title.split(" ")[0] ?? ""] ?? word;
    return character.assets.find((a) => a.kind === "original" && key && a.asset.name.startsWith(key))?.thumbnailUrl ?? null;
  };
  const descKey = descriptionPromptKey(characterId);
  roster.push({
    promptKey: descKey,
    kind: "description",
    memberKey: characterId,
    selectionId: CHARACTER_DESCRIPTION_LORE_ID,
    title: character.summary.name,
    keys: [],
    primaryKeys: [],
    secondaryKeys: [],
    recognitionKeys: effectiveRecognitionKeys([character.summary.name], cp.customLorebookKeys[descKey]),
    content: character.description,
    score: 0,
    thumbnailUrl: null,
    registered: registered.has(CHARACTER_DESCRIPTION_LORE_ID),
    workspaceEnabled: !disabled.has(CHARACTER_DESCRIPTION_LORE_ID),
    mainPrompt: mainPromptOf(doc, descKey),
    analyzeEnabled: cp.assetMetadata[descKey]?.analyzeEnabled !== false,
    selectedAssetCount: selectionCount(descKey)
  });
  const books = [...character.worldBooks, ...character.extraWorldBooks.filter((b) => connected.has(b.worldBookId))];
  for (const book of books) {
    for (const entry of book.entries) {
      const promptKey = lorePromptKey(characterId, book.worldBookId, entry.entryId);
      const selectionId = loreSelectionId(book.worldBookId, entry.entryId);
      roster.push({
        promptKey,
        kind: "lore",
        memberKey: characterId,
        selectionId,
        title: entry.title,
        worldBookId: book.worldBookId,
        worldBookName: book.name,
        entryId: entry.entryId,
        keys: [...entry.keys, ...entry.secondaryKeys],
        primaryKeys: entry.keys,
        secondaryKeys: entry.secondaryKeys,
        recognitionKeys: effectiveRecognitionKeys(entry.keys, cp.customLorebookKeys[promptKey]),
        content: entry.content,
        score: entry.keys.length,
        thumbnailUrl: thumbnail(entry.title),
        registered: registered.has(selectionId),
        workspaceEnabled: !disabled.has(selectionId),
        mainPrompt: mainPromptOf(doc, promptKey),
        analyzeEnabled: cp.assetMetadata[promptKey]?.analyzeEnabled !== false,
        selectedAssetCount: selectionCount(promptKey)
      });
    }
  }
  for (const custom of doc.customCharacters) {
    roster.push({
      promptKey: custom.id,
      kind: "custom",
      memberKey: `virtual-character:${custom.id}`,
      selectionId: custom.id,
      title: custom.title,
      keys: custom.recognitionKeys,
      primaryKeys: custom.recognitionKeys,
      secondaryKeys: [],
      recognitionKeys: custom.recognitionKeys,
      content: custom.appearanceDescription,
      score: 0,
      thumbnailUrl: null,
      registered: custom.rosterRegistered !== false,
      workspaceEnabled: custom.workspaceEnabled !== false,
      ...(custom.origin ? { origin: custom.origin } : {}),
      mainPrompt: mainPromptOf(doc, custom.id),
      analyzeEnabled: true,
      selectedAssetCount: selectionCount(custom.id)
    });
  }
  const sources: RosterSource[] = [
    ...character.worldBooks.map((b) => ({ worldBookId: b.worldBookId, name: b.name, attached: true, connected: true, entryCount: b.entries.length, scope: b.scope })),
    ...character.extraWorldBooks.map((b) => ({ worldBookId: b.worldBookId, name: b.name, attached: false, connected: connected.has(b.worldBookId), entryCount: b.entries.length, scope: b.scope }))
  ];
  const scope = charxScopeFor(db.config, doc);
  return {
    characterId,
    characterName: character.summary.name,
    document: doc,
    roster,
    sources,
    charxSettings: resolveEffectiveCharxSettings(scope, characterId),
    metadataAvailability: {}
  };
}

function touch(db: MockDb, ctx: MockContext, characterId: string, reason: string): void {
  const doc = documentFor(db, characterId);
  doc.updatedAt = new Date().toISOString();
  const summary = findCharacter(db, characterId)?.summary;
  if (summary) summary.hasDocument = true;
  void ctx;
  void reason;
}

function attempt<T>(ctx: MockContext, run: () => T): T {
  try {
    return run();
  } catch (error) {
    return ctx.fail("bad-request", error instanceof Error ? error.message : String(error));
  }
}

function customIds(doc: CharacterDocument, ids: string[] | "all"): Set<string> {
  return new Set(ids === "all" ? doc.customCharacters.map((c) => c.id) : ids);
}

export function coreMockHandlers(): MockHandlers {
  return {
    "session.hello": (_params, { db }) => ({ protocol: 1, status: db.status }),
    "session.getStatus": (_params, { db }) => db.status,
    "config.get": (_params, { db }) => ({ config: db.config, chatImageGeneration: db.chatImageGeneration, uiState: db.uiState }),
    "config.update": ({ patch }, ctx) => {
      ctx.db.config = normalizeConfig(mergePatch(ctx.db.config, patch));
      ctx.emit("config.changed", { config: ctx.db.config });
      return { config: ctx.db.config };
    },
    "chatImageGeneration.set": ({ settings }, { db }) => {
      db.chatImageGeneration = settings;
      return { settings, notice: "Chat image generation settings saved." };
    },
    "uiState.set": ({ uiState }, { db }) => {
      db.uiState = uiState;
      return { ok: true };
    },
    "connections.listLlm": (_p, { db }) => ({ connections: db.llmConnections }),
    "connections.listImage": (_p, { db }) => ({ connections: db.imageConnections }),
    "workspace.listCharacters": (_p, { db }) => ({ characters: db.characters.map((c) => c.summary) }),
    "workspace.load": ({ characterId }, ctx) => buildSnapshot(ctx.db, characterId, ctx),
    "roster.setRegistered": ({ characterId, items, registered }, ctx) => {
      const cp = documentFor(ctx.db, characterId).characterPrompt;
      for (const item of items) cp.selectedLorebooks[item.memberKey] = toggle(cp.selectedLorebooks[item.memberKey], item.selectionId, registered);
      touch(ctx.db, ctx, characterId, "roster");
      return buildSnapshot(ctx.db, characterId, ctx);
    },
    "roster.setActive": ({ characterId, items, active }, ctx) => {
      const cp = documentFor(ctx.db, characterId).characterPrompt;
      for (const item of items) cp.workspaceDisabledLorebooks[item.memberKey] = toggle(cp.workspaceDisabledLorebooks[item.memberKey], item.selectionId, !active);
      touch(ctx.db, ctx, characterId, "roster");
      return buildSnapshot(ctx.db, characterId, ctx);
    },
    "roster.setSourceConnected": ({ characterId, worldBookId, connected }, ctx) => {
      const cp = documentFor(ctx.db, characterId).characterPrompt;
      cp.activeModules[characterId] = toggle(cp.activeModules[characterId], worldBookId, connected);
      touch(ctx.db, ctx, characterId, "modules");
      return buildSnapshot(ctx.db, characterId, ctx);
    },
    "recognitionKeys.set": ({ characterId, promptKey, keys }, ctx) => {
      const doc = documentFor(ctx.db, characterId);
      const custom = doc.customCharacters.find((c) => c.id === promptKey);
      if (custom) custom.recognitionKeys = keys;
      else doc.characterPrompt.customLorebookKeys[promptKey] = { version: 1, mode: "replace", keys };
      touch(ctx.db, ctx, characterId, "keys");
      return buildSnapshot(ctx.db, characterId, ctx);
    },
    "customCharacters.create": ({ characterId, input }, ctx) => {
      const doc = documentFor(ctx.db, characterId);
      const character = attempt(ctx, () => createCustomCharacter(input));
      doc.customCharacters.push(character);
      touch(ctx.db, ctx, characterId, "custom");
      return { character, snapshot: buildSnapshot(ctx.db, characterId, ctx) };
    },
    "customCharacters.update": ({ characterId, customId, input }, ctx) => {
      const doc = documentFor(ctx.db, characterId);
      const index = doc.customCharacters.findIndex((c) => c.id === customId);
      if (index < 0) ctx.fail("not-found", "Custom character not found.");
      const character = attempt(ctx, () => updateCustomCharacter(doc.customCharacters[index]!, input));
      doc.customCharacters[index] = character;
      return { character, snapshot: buildSnapshot(ctx.db, characterId, ctx) };
    },
    "customCharacters.remove": ({ characterId, customId }, ctx) => {
      const doc = documentFor(ctx.db, characterId);
      doc.customCharacters = doc.customCharacters.filter((c) => c.id !== customId);
      return buildSnapshot(ctx.db, characterId, ctx);
    },
    "customCharacters.setRosterRegistered": ({ characterId, customIds: ids, registered }, ctx) => {
      const doc = documentFor(ctx.db, characterId);
      const set = customIds(doc, ids);
      doc.customCharacters = doc.customCharacters.map((c) => {
        if (!set.has(c.id)) return c;
        const { rosterRegistered: _r, ...rest } = c;
        return registered ? rest : { ...rest, rosterRegistered: false as const };
      });
      return buildSnapshot(ctx.db, characterId, ctx);
    },
    "customCharacters.setWorkspaceEnabled": ({ characterId, customIds: ids, enabled }, ctx) => {
      const doc = documentFor(ctx.db, characterId);
      const set = customIds(doc, ids);
      doc.customCharacters = doc.customCharacters.map((c) => {
        if (!set.has(c.id)) return c;
        const { workspaceEnabled: _w, ...rest } = c;
        return enabled ? rest : { ...rest, workspaceEnabled: false as const };
      });
      return buildSnapshot(ctx.db, characterId, ctx);
    },
    "customCharacters.promote": ({ characterId, customIds: ids }, ctx) => {
      const doc = documentFor(ctx.db, characterId);
      const set = customIds(doc, ids);
      doc.customCharacters = doc.customCharacters.map((c) => {
        if (!set.has(c.id)) return c;
        const { origin: _o, ...rest } = c;
        return rest;
      });
      return buildSnapshot(ctx.db, characterId, ctx);
    }
  };
}
