/**
 * Pipeline sidecar per chat: `chats/<chatId>/pipeline.json` (owned by the pipeline module).
 * - `records[entryId]`: generation record of each generated entry (prompts, seed, size, provider config) for the zoom
 *   view and single-slot regeneration (AM kept this in the PNG iTXt record + the memory display meta, spec/pipeline.md §4.1/§4.4).
 * - `drafts[slotId]`: zoom regeneration drafts (AM `slotPlansById.promptDraft`, memory only in AM; persisted here).
 */
import { STORAGE_PATHS, type HistoryTree, type RegenerationOverrides } from "../../shared/contract/index.js";
import type { StorageService } from "../services/types.js";
import type { GenerationRecord } from "./generate.js";

export interface PipelineSidecar {
  schema: "inlay-illustrator.pipeline";
  version: 1;
  records: Record<string, GenerationRecord>;
  drafts: Record<string, { overrides: RegenerationOverrides; updatedAt: number }>;
}

export function sidecarPath(chatId: string): string {
  return `${STORAGE_PATHS.chatDir(chatId)}pipeline.json`;
}

export function emptySidecar(): PipelineSidecar {
  return { schema: "inlay-illustrator.pipeline", version: 1, records: {}, drafts: {} };
}

function normalize(raw: unknown): PipelineSidecar {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, never>) : {});
  return { ...emptySidecar(), records: obj(r.records), drafts: obj(r.drafts) };
}

export async function readSidecar(storage: StorageService, chatId: string): Promise<PipelineSidecar> {
  return normalize(await storage.readJson(sidecarPath(chatId), emptySidecar()));
}

/**
 * Serialized update. With `tree`, records of entries no longer in the tree and drafts of removed slots are dropped
 * (History pruning / deletion keeps the sidecar small).
 */
export async function updateSidecar(
  storage: StorageService,
  chatId: string,
  mutate: (sidecar: PipelineSidecar) => void,
  tree?: HistoryTree,
): Promise<PipelineSidecar> {
  return storage.updateJson<PipelineSidecar>(sidecarPath(chatId), emptySidecar(), (current) => {
    const next = normalize(current);
    mutate(next);
    if (tree) {
      for (const id of Object.keys(next.records)) if (!tree.entriesById[id]) delete next.records[id];
      for (const id of Object.keys(next.drafts)) if (!tree.slotsById[id]) delete next.drafts[id];
    }
    return next;
  });
}
