/**
 * Asset Maid config-store adapter (AM `N`, the in-memory config repository used by every analysis controller).
 *
 * Asset Maid kept ONE merged runtime config (`Y0` shape: global settings + the current charx's source-scoped
 * `characterPrompt` fields + device-local `assetMetadataAvailability`). The port splits it into userStorage files
 * (contract §3-§5). This adapter rebuilds the merged shape (`buildRuntimeConfig`) so verbatim AM code can read and
 * mutate it, then writes each change back to its file:
 * - source-scoped `characterPrompt.*`  -> `characters/<id>/asset-maid.json` (per map entry, so concurrent edits of other keys survive)
 * - global `characterPrompt.*` (artistPrompts, personaSettings, ...) -> config files via `storage.updateConfig`
 * - `characterPrompt.assetMetadataAvailability` -> `characters/<id>/metadata-cache.json`
 * - `animaArtists.selection.bySourceId[<id>]` -> `document.animaArtistId`
 * Other top-level changes are not expected from the analysis flows and are ignored (logged).
 */
import {
  CHARACTER_SCOPED_PROMPT_FIELDS,
  STORAGE_PATHS,
  buildRuntimeConfig,
  isPlainObject,
  jsonClone,
  type CharacterDocument,
  type InlayConfig,
} from "../../../shared/contract/index.js";
import type { BackendServices } from "../../services/types.js";

/** AM merged config (`Y0` + charx). Loosely typed on purpose: verbatim AM code reads arbitrary fields. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AmConfig = Record<string, any> & { characterPrompt: Record<string, any> };

export interface AmConfigParts {
  global: InlayConfig;
  document: CharacterDocument;
  /** `assetMetadataAvailability` (AM device-local metadata cache of this character). */
  metadata: Record<string, unknown>;
}

const SCOPED = new Set<string>(CHARACTER_SCOPED_PROMPT_FIELDS as readonly string[]);

export function metadataCachePath(characterId: string): string {
  return STORAGE_PATHS.characterMetadataCache(characterId);
}

export async function loadAmConfigParts(services: BackendServices, characterId: string): Promise<AmConfigParts> {
  const [global, document, metadata] = await Promise.all([
    services.storage.loadConfig(),
    services.storage.loadCharacterDocument(characterId),
    services.storage.readJson<Record<string, unknown>>(metadataCachePath(characterId), {}),
  ]);
  return { global, document, metadata: isPlainObject(metadata) ? metadata : {} };
}

/** Merged AM config for one character. */
export function buildAmConfig(parts: AmConfigParts): AmConfig {
  const runtime = buildRuntimeConfig(parts.global, parts.document) as unknown as AmConfig;
  runtime.characterPrompt = { ...runtime.characterPrompt, assetMetadataAvailability: jsonClone(parts.metadata) };
  return runtime;
}

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Apply the difference `before -> after` of one object field onto `target` (per entry for plain maps). */
function patchField(target: Record<string, unknown>, field: string, before: unknown, after: unknown): boolean {
  if (same(before, after)) return false;
  if (isPlainObject(before) && isPlainObject(after) && (target[field] === undefined || isPlainObject(target[field]))) {
    const next: Record<string, unknown> = { ...((target[field] as Record<string, unknown> | undefined) ?? {}) };
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (same(before[key], after[key])) continue;
      if (after[key] === undefined) delete next[key];
      else next[key] = jsonClone(after[key]);
    }
    target[field] = next;
    return true;
  }
  if (after === undefined) delete target[field];
  else target[field] = jsonClone(after);
  return true;
}

export interface AmConfigDiff {
  scoped: string[];
  global: string[];
  metadata: boolean;
  animaArtist: boolean;
  ignored: string[];
}

export function diffAmConfig(before: AmConfig, after: AmConfig, characterId: string): AmConfigDiff {
  const diff: AmConfigDiff = { scoped: [], global: [], metadata: false, animaArtist: false, ignored: [] };
  const bcp = before.characterPrompt ?? {};
  const acp = after.characterPrompt ?? {};
  for (const key of new Set([...Object.keys(bcp), ...Object.keys(acp)])) {
    if (same(bcp[key], acp[key])) continue;
    if (key === "assetMetadataAvailability") diff.metadata = true;
    else if (SCOPED.has(key)) diff.scoped.push(key);
    else diff.global.push(key);
  }
  const ba = before.animaArtists?.selection?.bySourceId?.[characterId];
  const aa = after.animaArtists?.selection?.bySourceId?.[characterId];
  if (!same(ba, aa)) diff.animaArtist = true;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === "characterPrompt" || key === "animaArtists") continue;
    if (!same(before[key], after[key])) diff.ignored.push(key);
  }
  return diff;
}

/** Write the change `before -> after` back to storage (document, global config, metadata cache). */
export async function persistAmConfigChange(
  services: BackendServices,
  characterId: string,
  before: AmConfig,
  after: AmConfig,
  options: { reason?: string; expectedUpdatedAt?: string } = {},
): Promise<{ document: CharacterDocument | null; diff: AmConfigDiff }> {
  const diff = diffAmConfig(before, after, characterId);
  let document: CharacterDocument | null = null;
  if (diff.scoped.length || diff.animaArtist) {
    document = await services.storage.updateCharacterDocument(
      characterId,
      (doc) => {
        const cp = { ...doc.characterPrompt } as unknown as Record<string, unknown>;
        for (const field of diff.scoped) patchField(cp, field, before.characterPrompt[field], after.characterPrompt[field]);
        const next = { ...doc, characterPrompt: cp as unknown as CharacterDocument["characterPrompt"] };
        if (diff.animaArtist) {
          const id = after.animaArtists?.selection?.bySourceId?.[characterId];
          next.animaArtistId = typeof id === "string" && id ? id : null;
        }
        return next;
      },
      { reason: options.reason ?? "analysis", ...(options.expectedUpdatedAt ? { expectedUpdatedAt: options.expectedUpdatedAt } : {}) },
    );
  }
  if (diff.global.length) {
    await services.storage.updateConfig((config) => {
      const cp = { ...config.characterPrompt } as unknown as Record<string, unknown>;
      for (const field of diff.global) patchField(cp, field, before.characterPrompt[field], after.characterPrompt[field]);
      return { ...config, characterPrompt: cp as unknown as InlayConfig["characterPrompt"] };
    });
  }
  if (diff.metadata) {
    const b = (before.characterPrompt.assetMetadataAvailability ?? {}) as Record<string, unknown>;
    const a = (after.characterPrompt.assetMetadataAvailability ?? {}) as Record<string, unknown>;
    await services.storage.updateJson<Record<string, unknown>>(metadataCachePath(characterId), {}, (current) => {
      const holder: Record<string, unknown> = { m: isPlainObject(current) ? current : {} };
      patchField(holder, "m", b, a);
      return holder.m as Record<string, unknown>;
    });
  }
  if (diff.ignored.length) services.log.append("warn", "analysis", `Ignored Asset Maid config change outside characterPrompt: ${diff.ignored.join(", ")}`);
  return { document, diff };
}

/**
 * One-shot read-modify-write with an AM mutator (RPC handlers). The mutator runs on a fresh merged config.
 * `expectedUpdatedAt` = document revision guard (RpcFailure conflict on mismatch).
 */
export async function mutateAmConfig(
  services: BackendServices,
  characterId: string,
  mutate: (config: AmConfig) => AmConfig,
  options: { reason?: string; expectedUpdatedAt?: string } = {},
): Promise<{ config: AmConfig; document: CharacterDocument }> {
  const parts = await loadAmConfigParts(services, characterId);
  const before = buildAmConfig(parts);
  const after = mutate(jsonClone(before));
  const { document } = await persistAmConfigChange(services, characterId, before, after, options);
  return { config: after, document: document ?? parts.document };
}

type UpdateOptions = { domains?: string[]; persistence?: "debounced" | "manual" | "immediate" | string; topics?: string[] };

/**
 * Long-lived store with AM's `config` API for the verbatim controllers: `getCurrentSnapshot`, `update(mutator, {domains})`,
 * `flushSave`, `getDomainRevision`, `getPersistenceSnapshot`, `subscribePersistence`. Updates apply synchronously in memory
 * (like AM) and are persisted in order; `flushSave()` waits for them and rethrows the first persistence error.
 */
export class AmConfigStore {
  private current: AmConfig;
  private readonly domainRevisions = new Map<string, number>();
  private queue: Promise<void> = Promise.resolve();
  private error: unknown = null;
  private readonly persistenceListeners = new Set<() => void>();
  private writes = 0;

  constructor(
    private readonly services: BackendServices,
    readonly characterId: string,
    parts: AmConfigParts,
    private readonly reason = "analysis",
  ) {
    this.current = buildAmConfig(parts);
  }

  static async open(services: BackendServices, characterId: string, reason?: string): Promise<AmConfigStore> {
    return new AmConfigStore(services, characterId, await loadAmConfigParts(services, characterId), reason);
  }

  getCurrentSnapshot(): AmConfig {
    return this.current;
  }

  update(mutate: (config: AmConfig) => AmConfig, options: UpdateOptions = {}): AmConfig {
    const before = this.current;
    const after = mutate(jsonClone(before));
    if (!after || same(before, after)) return this.current;
    this.current = after;
    for (const domain of options.domains ?? ["*"]) this.domainRevisions.set(domain, (this.domainRevisions.get(domain) ?? 0) + 1);
    this.writes += 1;
    this.queue = this.queue.then(async () => {
      try {
        await persistAmConfigChange(this.services, this.characterId, before, after, { reason: this.reason });
      } catch (error) {
        this.error ??= error;
        this.services.log.append("error", "analysis", `Saving analysis results failed: ${error instanceof Error ? error.message : String(error)}`);
        this.persistenceListeners.forEach((l) => l());
      }
    });
    return after;
  }

  async flushSave(): Promise<void> {
    await this.queue;
    if (this.error) {
      const error = this.error;
      this.error = null;
      throw error;
    }
  }

  /** Waits for pending writes without throwing. */
  async settle(): Promise<void> {
    await this.queue;
  }

  getDomainRevision(domain: string): number {
    return this.domainRevisions.get(domain) ?? 0;
  }

  get writeCount(): number {
    return this.writes;
  }

  getPersistenceSnapshot(): { error: string; pending: boolean } {
    return { error: this.error ? String(this.error instanceof Error ? this.error.message : this.error) : "", pending: false };
  }

  subscribePersistence(listener: () => void): () => void {
    this.persistenceListeners.add(listener);
    return () => this.persistenceListeners.delete(listener);
  }
}
