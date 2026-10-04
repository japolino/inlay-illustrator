/**
 * Asset Maid `priorityAssets` adapter (AM `wot` L91196, reduced to what the analysis controllers and the asset list need).
 * AM's `wot` is a UI asset index (thumbnails, focus, background metadata prefetch). The port keeps its classification core
 * verbatim: the per-source index `Hnt` (L89987: original/chat/outfit static pages, candidate pages per prompt key, prefix tries)
 * and the matching service `unt` (L87419: `lorebookImageFilters` profiles -> filename decisions). The rules context mirrors
 * `wot.ye` (L91575).
 */
import { AM, amFn } from "../core/index.js";
import type { AmSource } from "../../services/types.js";
import type { AmConfigStore } from "./config-store.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export interface AmAssetEntry {
  key: string;
  assetKey: string;
  index: number;
  asset: Any;
  generatedKind: "original" | "chat" | "outfit";
  memberKey: string;
  sourceId: string;
  shared: boolean;
  hasMetadata: boolean;
  metadataState: "with" | "without" | "unknown";
}

export interface AmPageDescriptor {
  sourceId?: string;
  memberKey?: string;
  promptKey?: string;
  candidateProfileKey?: string;
  /** AM filters: all | original | candidate | chat-generated | outfit-generated | metadata. */
  filter?: string;
  metadataOnly?: boolean;
}

export interface AmPriorityAssets {
  getViewSnapshot(descriptor: AmPageDescriptor): { count: number };
  getPage(descriptor: AmPageDescriptor, page: number, size?: number): AmAssetEntry[];
  resolveSelection(sourceId: string, memberKey: string, assets: Any[], names?: string[]): { assets: Any[]; assetNames: string[]; unresolvedAssetNames: string[] };
  /** First selected asset of the prompt key, else the best candidate (AM `getLorebookThumbnailAsset`). */
  getLorebookThumbnailAsset(sourceId: string, promptKey: string): Any | null;
  refreshMatchingProfiles(): void;
  refreshMetadataAvailability(): void;
  invalidate(): void;
}

/** Source lookup: the analysis sources of the store's character (custom characters projected, AM `rI(..., "all")`). */
export type SourceLookup = (sourceId: string) => AmSource | null;

export function createAmPriorityAssets(store: AmConfigStore, getSource: SourceLookup): AmPriorityAssets {
  const Hnt = amFn("Hnt");
  const Wt = amFn("Wt");
  const Ai = amFn("Ai");
  const Fn = amFn("Fn");
  const Iw = amFn("Iw");
  const Vnt = amFn("Vnt");
  const NB = amFn("NB");
  const MZ = (asset: Any) => amFn("mi")(asset) !== "original";
  const mT = amFn("mT");
  const matching = amFn("unt")(store);
  let matchingRevision = 0;
  let metadataRevision = 0;
  const indexes = new Map<string, { generation: string; index: Any }>();

  const rules = (source: AmSource) => {
    const cp = store.getCurrentSnapshot().characterPrompt;
    const active: string[] = Vnt(source, cp).map(Fn).filter(Boolean);
    const single = NB(source);
    const implicit = single && active.length === 1 && active[0] === single ? single : "";
    const activeSet = new Set(active);
    const profiles: Any[] = matching.getRecord(source.id)?.profiles ?? [];
    const byKey = new Map(profiles.map((p: Any) => [Fn(p.promptKey), p]));
    const prepared = matching.prepareScope(source.id, [...activeSet]);
    return {
      matchingRevision,
      rulesRevision: ["workspace", "prompts", "asset-matching"].map((d) => store.getDomainRevision(d)).join(":"),
      activePromptKeys: activeSet,
      implicitPromptKey: implicit,
      matchingProfilePromptKeys: new Set(profiles.map((p: Any) => Fn(p.promptKey)).filter((k: string) => !!k && activeSet.has(k))),
      getFilenameIdentityAliases: (k: string) => (byKey.get(k) as Any)?.identityAliases ?? [],
      getCustomLorebookKeys: (k: string) => store.getCurrentSnapshot().characterPrompt.customLorebookKeys?.[k],
      decideMatchingPromptKeys: (asset: Any) => prepared(asset.name).matchedPromptKeys.map(Fn).filter(Boolean),
    };
  };

  const indexFor = (sourceId: string): { source: AmSource; index: Any } | null => {
    const source = getSource(sourceId);
    if (!source) return null;
    const generation = String(source.assetGeneration ?? "");
    let cached = indexes.get(source.id);
    if (!cached || cached.generation !== generation) {
      cached = { generation, index: Hnt(source, rules(source)) };
      indexes.set(source.id, cached);
    } else cached.index.ensureClassified(rules(source));
    return { source, index: cached.index };
  };

  const availability = (asset: Any, kind: string): Pick<AmAssetEntry, "hasMetadata" | "metadataState"> => {
    if (kind !== "original" && MZ(asset)) return { hasMetadata: true, metadataState: "with" };
    const record = amFn("ih")(store.getCurrentSnapshot().characterPrompt.assetMetadataAvailability).get(Wt(asset));
    if (record?.checkedAt) return record.hasMetadata ? { hasMetadata: true, metadataState: "with" } : { hasMetadata: false, metadataState: "without" };
    return { hasMetadata: false, metadataState: "unknown" };
  };

  const toEntry = (sourceId: string, memberKey: string, raw: Any): AmAssetEntry => ({
    key: `${memberKey}\u0000${raw.assetKey}`,
    assetKey: raw.assetKey,
    index: raw.index,
    asset: raw.asset,
    generatedKind: raw.generatedKind,
    memberKey,
    sourceId,
    shared: raw.shared === true,
    ...availability(raw.asset, raw.generatedKind),
  });

  const resolveDescriptor = (d: AmPageDescriptor) => {
    const sourceId = Fn(d.sourceId);
    const found = indexFor(sourceId);
    if (!found) return null;
    const member = found.source.members.find((m) => m.key === Fn(d.memberKey)) ?? found.source.members[0];
    if (!member) return null;
    const promptKey = Fn(d.candidateProfileKey) || Fn(d.promptKey) || Iw(member, member.lorebooks[0]?.id ?? "");
    const filter = d.filter === "metadata" ? "all" : Fn(d.filter) || "all";
    const metadataOnly = d.metadataOnly === true || d.filter === "metadata";
    return { ...found, member, promptKey, filter, metadataOnly };
  };

  const allIndices = (r: NonNullable<ReturnType<typeof resolveDescriptor>>): number[] => {
    if (r.filter === "candidate") return [...r.index.getCandidateIndices(r.promptKey)];
    const kind = r.filter === "chat-generated" || r.filter === "outfit-generated" ? r.filter : r.filter === "original" ? "original" : "all";
    const count = r.index.getStaticCount(r.member.key, kind);
    return count ? [...r.index.getStaticPage(r.member.key, kind, 0, count)] : [];
  };

  const entriesOf = (d: AmPageDescriptor): AmAssetEntry[] => {
    const r = resolveDescriptor(d);
    if (!r) return [];
    const out: AmAssetEntry[] = [];
    for (const i of allIndices(r)) {
      const raw = r.index.getEntry(i);
      if (!raw) continue;
      const entry = toEntry(r.source.id, r.member.key, raw);
      if (r.metadataOnly && !entry.hasMetadata) continue;
      out.push(entry);
    }
    return out;
  };

  return {
    getViewSnapshot(d) {
      return { count: entriesOf(d).length };
    },
    getPage(d, page, size = 30) {
      const n = Math.max(1, Math.floor(size));
      const start = Math.max(0, Math.floor(page)) * n;
      return entriesOf(d).slice(start, start + n);
    },
    // AM wot.Zt L92344 (simplified: same resolution order, no preview cache).
    resolveSelection(sourceId, memberKey, assets, names = []) {
      const list: Any[] = Ai(assets ?? []);
      const extraNames: string[] = [...new Set((names ?? []).map(Fn).filter(Boolean))];
      const assetNames: string[] = [...new Set([...list.map((a) => Fn(a.name)).filter(Boolean), ...extraNames])];
      const found = indexFor(Fn(sourceId));
      const member = found?.source.members.find((m) => m.key === memberKey);
      if (!found || !member) {
        const have = new Set(list.map((a) => mT(a.name)));
        return { assets: list, assetNames, unresolvedAssetNames: extraNames.filter((n) => !have.has(mT(n))) };
      }
      const resolved = new Map<string, Any>();
      const resolvedNames = new Set<string>();
      for (const asset of list) {
        const i = found.index.findEntryIndex(memberKey, asset);
        const byName = i === null ? [...found.index.findEntryIndicesByNames(memberKey, [asset.name])].map((x: number) => found.index.getEntry(x)?.asset).filter(Boolean) : [];
        const target = i === null ? (AM.OP(AM.TB(asset), byName) ?? asset) : (found.index.getEntry(i)?.asset ?? asset);
        const key = Wt(target);
        if (key) resolved.set(key, target);
        const nm = mT(target.name);
        if (nm) resolvedNames.add(nm);
      }
      const unresolved: string[] = [];
      for (const name of extraNames) {
        if (resolvedNames.has(mT(name))) continue;
        const hits = [...found.index.findEntryIndicesByNames(memberKey, [name])].map((x: number) => found.index.getEntry(x)?.asset).filter(Boolean);
        if (hits.length) {
          const key = Wt(hits[0]);
          if (key && !resolved.has(key)) resolved.set(key, hits[0]);
          resolvedNames.add(mT(name));
        } else unresolved.push(name);
      }
      return { assets: [...resolved.values()], assetNames, unresolvedAssetNames: unresolved };
    },
    getLorebookThumbnailAsset(sourceId, promptKey) {
      const cp = store.getCurrentSnapshot().characterPrompt;
      const selected = Ai(cp.assetSelections?.[promptKey]?.selectedAssets ?? []);
      if (selected.length) return selected[0];
      const found = indexFor(Fn(sourceId));
      if (!found) return null;
      found.index.prepareLorebookThumbnail(promptKey);
      const i = found.index.getLorebookThumbnailIndex(promptKey);
      return i === null ? null : (found.index.getEntry(i)?.asset ?? null);
    },
    refreshMatchingProfiles() {
      matchingRevision += 1;
      matching.invalidate();
    },
    refreshMetadataAvailability() {
      metadataRevision += 1;
    },
    invalidate() {
      indexes.clear();
      matching.invalidate();
    },
  };
}

/** AM `Fs` L85966 prompt key of a member lorebook. */
export function amPromptKey(member: Any, lorebook: Any): string {
  return amFn("Fs")(member, lorebook);
}
