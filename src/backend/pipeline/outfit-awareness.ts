/**
 * Outfit awareness for the V5 analyzer (Inlay addition; deviates from AM 0.9.89).
 *
 * AM shows the analyzer each registered outfit by its label only (`appearance_catalog[].forms[].outfits` = `d5` =
 * label || outfitRef). The garments behind a label never reach it, so it cannot notice that the story contradicts a
 * registered part (black stockings vs. white knee-high socks), it matches outfits whose legwear is wrong, and its
 * natural language names legwear/footwear that fight the outfit tags in the same character prompt.
 *
 * This layer wraps the analyzer client. Before a V5 request goes out it adds, next to each form's outfit IDs, an
 * `outfit_parts` map (outfit ID -> {head, top, bottom, legs, feet}) and a few `analysis_policy` keys that say how to
 * use it. Outfit IDs, the response schema and every AM field stay as they are; requests without known outfits pass
 * through unchanged. The parts come from a per-run index built from the run's analyzer context (`createRunOutfitIndex`),
 * registered with an `OutfitIndexRegistry` for the duration of `EnginePort.run`.
 */
import { v5 } from "../../engine/index.js";
import type { AnalyzerClientLike } from "../services/types.js";
import { OUTFIT_PARTS, sameOutfit, withoutAbsence, type OutfitParts } from "./outfit-garments.js";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Outfit parts of one run, addressable from the analyzer wire and from executor actors. */
export interface RunOutfitIndex {
  /** By wire coordinates: candidateKey, formRef ("" when the request omits it for a single-form actor), outfit ID shown. */
  wire(candidateKey: string, formRef: string, outfitRef: string): OutfitParts | undefined;
  /** By identity key, form ID and outfit ID (`BatchItem.actors[]`). */
  parts(identityKey: string, formId: string, outfitId: string): OutfitParts | undefined;
  /** Records an outfit prepared during the run (an analyzer proposal turned into an outfit). */
  add(identityKey: string, formId: string, outfitId: string, parts: OutfitParts): void;
  /** Outfits of one identity form, as `[outfitId, parts]`. */
  outfits(identityKey: string, formId: string): Array<[string, OutfitParts]>;
}

const DEFAULT_FORM = "form_default";

function partsOf(v: unknown): OutfitParts | undefined {
  const r = rec(v);
  const out: OutfitParts = {};
  for (const p of OUTFIT_PARTS) {
    const t = str(r[p]);
    if (t) out[p] = t;
  }
  return Object.keys(out).length ? out : undefined;
}

/** `[{part, prompt}]` (engine prepared outfit) -> parts. */
export function partsFromList(list: unknown): OutfitParts | undefined {
  const out: OutfitParts = {};
  for (const item of arr(list)) {
    const r = rec(item);
    const p = str(r.part) as (typeof OUTFIT_PARTS)[number];
    const t = str(r.prompt);
    if ((OUTFIT_PARTS as readonly string[]).includes(p) && t) out[p] = out[p] ? `${out[p]}, ${t}` : t;
  }
  return Object.keys(out).length ? out : undefined;
}

const idKey = (identityKey: string, formId: string, outfitId: string) => `${identityKey}\0${formId || DEFAULT_FORM}\0${outfitId}`;
const wireKey = (candidateKey: string, formRef: string, outfitRef: string) => `${candidateKey}\0${formRef}\0${outfitRef}`;

/**
 * Index of the outfits an analyzer context offers: identity candidates' appearance forms, lorebook outfit candidates,
 * and the wire IDs `buildV5ActorCandidates` gives them. Never throws; an unreadable context yields an empty index.
 */
export function createRunOutfitIndex(context: unknown): RunOutfitIndex {
  const ctx = rec(context);
  const byIdentity = new Map<string, OutfitParts>();
  const labels = new Map<string, string>();
  const put = (identityKey: string, formId: string, outfitId: string, parts: OutfitParts | undefined, label: string) => {
    if (!identityKey || !outfitId) return;
    const k = idKey(identityKey, formId, outfitId);
    if (parts && !byIdentity.has(k)) byIdentity.set(k, parts);
    if (label && !labels.has(k)) labels.set(k, label);
  };
  for (const list of [ctx.actorCandidates, ctx.personaCandidates, ctx.v5PersonaCatalogCandidates])
    for (const c of arr(list).map(rec))
      for (const f of arr(c.appearanceForms).map(rec))
        for (const o of arr(f.outfits).map(rec)) put(str(c.key), str(f.formId), str(o.outfitId), partsOf(o), str(o.label));
  for (const list of [ctx.v5OutfitCatalogCandidates, ctx.outfitCandidates])
    for (const o of arr(list).map(rec)) put(str(o.lorebook_prompt_key), str(o.form_id), str(o.id), partsOf(o), str(o.label));

  const wire = new Map<string, OutfitParts>();
  let bindings: Rec = {};
  try {
    bindings = rec(v5.buildV5CandidateBindings(ctx as never, null));
  } catch {
    // A context the core rejects never reaches the analyzer either; nothing to index.
  }
  const sourceKeys = rec(bindings.sourceKeyByCandidateKey);
  for (const r of arr(bindings.response).map(rec)) {
    const candidateKey = str(r.candidateKey);
    const source = str(sourceKeys[candidateKey]) || str(arr(r.identityReferences)[0]);
    const forms = arr(r.appearanceForms).map(rec);
    for (const f of forms) {
      for (const o of arr(f.outfits).map(rec)) {
        const k = idKey(source, str(f.formId), str(o.outfitId));
        const parts = byIdentity.get(k);
        if (!parts) continue;
        for (const ref of new Set([str(o.outfitRef), labels.get(k) ?? ""].filter(Boolean))) {
          wire.set(wireKey(candidateKey, str(f.formRef), ref), parts);
          if (forms.length === 1) wire.set(wireKey(candidateKey, "", ref), parts);
        }
      }
    }
  }

  const personaKey = str(ctx.personaPromptKey);
  const outfitsOf = (identityKey: string, formId: string): Array<[string, OutfitParts]> => {
    const prefix = idKey(identityKey, formId, "");
    return [...byIdentity].flatMap(([k, parts]) => (k.startsWith(prefix) ? [[k.slice(prefix.length), parts] as [string, OutfitParts]] : []));
  };
  return {
    wire: (candidateKey, formRef, outfitRef) => wire.get(wireKey(candidateKey, formRef, outfitRef)),
    parts: (identityKey, formId, outfitId) =>
      byIdentity.get(idKey(identityKey, formId, outfitId)) ?? (identityKey === "__persona__" && personaKey ? byIdentity.get(idKey(personaKey, formId, outfitId)) : undefined),
    add(identityKey, formId, outfitId, parts) {
      if (identityKey && outfitId && Object.keys(parts).length) byIdentity.set(idKey(identityKey, formId, outfitId), parts);
    },
    outfits: (identityKey, formId) => {
      const own = identityKey ? outfitsOf(identityKey, formId) : [];
      return own.length || identityKey !== "__persona__" || !personaKey ? own : outfitsOf(personaKey, formId);
    },
  };
}

export interface OutfitReuse {
  identityKey: string;
  proposal: string;
  /** Registered outfit ID, or the earlier proposal of the same run it was merged into. */
  reused: string;
}

/**
 * Rerolls make the analyzer propose the same outfit again in other words ("emerald apron over white blouse" next to a
 * registered "green apron over white blouse"), and every proposal becomes a stored outfit that later images switch
 * between. A proposal that `sameOutfit` matches with a registered outfit of the actor's form selects that outfit
 * instead; one that matches an earlier proposal of the same call takes that proposal, so `prepareActors` creates one
 * outfit for both. Changed garments, colors or added parts still make a new outfit.
 */
export function reuseSameOutfits(index: RunOutfitIndex, actors: readonly unknown[], onReuse?: (reuse: OutfitReuse) => void): unknown[] {
  const earlier = new Map<string, Rec[]>();
  return actors.map((a) => {
    const r = rec(a);
    const proposal = rec(r.proposal);
    const identityKey = str(r.identityKey);
    if (!r.proposal || str(r.selectedOutfitId) || !identityKey) return a;
    const formId = str(r.formId) || DEFAULT_FORM;
    const parts = partsOf(proposal) ?? {};
    const name = str(proposal.name);
    const match = index.outfits(identityKey, formId).find(([, registered]) => sameOutfit(registered, parts));
    if (match) {
      onReuse?.({ identityKey, proposal: name, reused: match[0] });
      const { proposal: _dropped, ...rest } = r;
      return { ...rest, selectedOutfitId: match[0] };
    }
    const key = `${str(r.kind)}\0${identityKey}\0${formId}`;
    const previous = (earlier.get(key) ?? []).find((p) => sameOutfit(partsOf(p) ?? {}, parts));
    if (previous) {
      onReuse?.({ identityKey, proposal: name, reused: str(previous.name) });
      return { ...r, proposal: previous };
    }
    earlier.set(key, [...(earlier.get(key) ?? []), proposal]);
    return a;
  });
}

/**
 * `prepareOutfits` actors with absence chunks ("bare legs", "barefoot", "no shoes") removed from their outfit proposals.
 * AM's proposal policy forbids them (`proposal_parts`), but the analyzer still emits them for a barefoot scene, and a
 * stored outfit with `barefoot` as its footwear draws bare feet in every later image. `top` is kept: it carries
 * `completely nude`.
 */
export function withoutAbsenceProposals(actors: readonly unknown[]): unknown[] {
  return actors.map((a) => {
    const r = rec(a);
    if (!r.proposal || typeof r.proposal !== "object") return a;
    const proposal = r.proposal as Rec;
    const next: Rec = { ...proposal };
    let changed = false;
    for (const p of OUTFIT_PARTS) {
      const v = proposal[p];
      if (p === "top" || typeof v !== "string") continue;
      const cleaned = withoutAbsence(v);
      if (cleaned !== v.trim()) {
        next[p] = cleaned;
        changed = true;
      }
    }
    return changed ? { ...r, proposal: next } : a;
  });
}

/** Records the outfits `prepareActors` prepared (`preparedOutfits[requestKey] = {id, formId, parts}`) in the run index. */
export function recordPreparedOutfits(index: RunOutfitIndex, actors: readonly unknown[], prepared: unknown): void {
  const byKey = rec(prepared);
  for (const a of actors.map(rec)) {
    const o = rec(byKey[str(a.requestKey)]);
    const parts = partsFromList(o.parts);
    if (parts) index.add(str(a.identityKey), str(o.formId) || str(a.formId), str(o.id), parts);
  }
}

/** Runs in flight; the analyzer wrapper reads the outfits of whichever run a request's candidates belong to. */
export class OutfitIndexRegistry {
  private readonly active: RunOutfitIndex[] = [];

  register(index: RunOutfitIndex): () => void {
    this.active.unshift(index);
    return () => {
      const i = this.active.indexOf(index);
      if (i >= 0) this.active.splice(i, 1);
    };
  }

  get size(): number {
    return this.active.length;
  }

  wire(candidateKey: string, formRef: string, outfitRef: string): OutfitParts | undefined {
    for (const index of this.active) {
      const parts = index.wire(candidateKey, formRef, outfitRef);
      if (parts) return parts;
    }
    return undefined;
  }
}

/** Policy keys added to `response_contract.analysis_policy.outfits` when at least one outfit has parts. */
export const OUTFIT_PART_POLICY = Object.freeze({
  registered_parts:
    "forms[].outfit_parts maps outfit IDs to the garments the image prompt renders for that outfit, by body part (head, top, bottom, legs, feet). They are drawn verbatim whenever that body part is visible, so compare the source's clothing evidence with them part by part.",
  absence_parts: "A registered part such as bare legs or barefoot describes uncovered anatomy, not a garment; treat it as unspecified when matching the source's clothing.",
  part_contradiction:
    "If the source explicitly describes the actor currently wearing an item that contradicts a registered part of the otherwise best-matching outfit (a different garment type or color for the same body part, e.g. black stockings vs. white knee-high socks, sneakers vs. loafers), that outfit does not match: propose a new outfit that copies every non-contradicted part verbatim and replaces only the contradicted part with the source-stated item. This overrides existing_match_instruction, current_outfit_when and proposal_when. Removing an item is not a contradiction (see temporary_state).",
  part_completion:
    "If the best-matching outfit leaves legs or feet empty or registers only absence there, and the source explicitly states legwear or footwear the actor is currently wearing, propose the completed outfit: copy every registered part verbatim and put the stated item in legs or feet.",
  temporary_state:
    "Taking off or not wearing shoes, socks or other legwear for a while (indoors, in bed, bathing) is a temporary state of the current outfit, not a new outfit: keep the outfit and state it in that actor's free tags with exactly barefoot (no footwear and no socks), no shoes (legwear still on) or bare legs (legwear off).",
});

/** Policy keys added to `response_contract.analysis_policy.freeform`. */
export const FREEFORM_CLOTHING_POLICY = Object.freeze({
  clothing_in_natural_language:
    "Natural language must not name, recolor or restyle legwear, footwear or other garments that the actor's selected outfit already renders through outfit_parts; refer to them generically (her socks, her shoes) or with the registered wording. Never introduce legwear or footwear the selected outfit does not register.",
  clothing_state:
    "When an actor's legs or feet are visible and the registered legwear or footwear is not simply worn, say so explicitly in that actor's free tags (barefoot, no shoes, bare legs).",
});

export const OUTFIT_PARTS_INPUT_DEFAULT = "forms[].outfit_parts maps an outfit ID to its registered garments by body part; an omitted part has no registered garment.";

type Lookup = (candidateKey: string, formRef: string, outfitRef: string) => OutfitParts | undefined;

function augmentCatalog(catalog: unknown, lookup: Lookup): boolean {
  let added = false;
  for (const entry of arr(catalog)) {
    const e = rec(entry);
    const candidateKey = str(e.candidateKey);
    if (!candidateKey) continue;
    for (const form of arr(e.forms)) {
      const f = rec(form);
      const formRef = str(f.formRef);
      const map: Record<string, OutfitParts> = {};
      for (const o of arr(f.outfits)) {
        const id = typeof o === "string" ? o.trim() : str(rec(o).id);
        const parts = id ? lookup(candidateKey, formRef, id) : undefined;
        if (parts) map[id] = parts;
      }
      if (Object.keys(map).length) {
        f.outfit_parts = map;
        added = true;
      }
    }
  }
  return added;
}

/** Adds outfit parts and the part policy to a V5 analyzer user payload (mutates `payload`). Returns false when nothing applied. */
export function augmentV5AnalyzerPayload(payload: Rec, lookup: Lookup): boolean {
  const a = augmentCatalog(payload.appearance_catalog, lookup);
  const b = augmentCatalog(payload.generated_appearance_catalog, lookup);
  if (!a && !b) return false;
  applyOutfitPartPolicy(payload);
  return true;
}

/** Adds the part policy and the `outfit_parts` input default to the payload's `response_contract` (mutates). Returns whether it had one. */
function applyOutfitPartPolicy(payload: Rec): boolean {
  const contract = rec(payload.response_contract);
  if (contract !== payload.response_contract) return false;
  const policy = rec(contract.analysis_policy);
  if (contract.analysis_policy === policy) {
    if (policy.outfits && typeof policy.outfits === "object") Object.assign(policy.outfits as Rec, OUTFIT_PART_POLICY);
    if (policy.freeform && typeof policy.freeform === "object") Object.assign(policy.freeform as Rec, FREEFORM_CLOTHING_POLICY);
  }
  if (contract.inputDefaults && typeof contract.inputDefaults === "object") (contract.inputDefaults as Rec).outfit_parts = OUTFIT_PARTS_INPUT_DEFAULT;
  return true;
}

type Message = { role: string; content: unknown; [key: string]: unknown };

function parseObject(text: string): Rec | null {
  if (!text.startsWith("{")) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : null;
  } catch {
    return null;
  }
}

/**
 * Messages of a V5 analyzer request with outfit parts added to its JSON user payload, or null when the request is not
 * a V5 analyzer request or none of its outfits has known parts.
 */
export function augmentV5AnalyzerMessages<M extends Message>(messages: readonly M[], lookup: Lookup): M[] | null {
  let changed = false;
  const out = messages.map((m) => {
    if (m.role !== "user") return m;
    if (typeof m.content === "string") {
      const payload = parseObject(m.content);
      if (!payload || !augmentV5AnalyzerPayload(payload, lookup)) return m;
      changed = true;
      return { ...m, content: JSON.stringify(payload) };
    }
    if (!Array.isArray(m.content)) return m;
    let partChanged = false;
    const content = m.content.map((part: unknown) => {
      const p = rec(part);
      if (p.type !== "text" || typeof p.text !== "string") return part;
      const payload = parseObject(p.text);
      if (!payload || !augmentV5AnalyzerPayload(payload, lookup)) return part;
      partChanged = true;
      return { ...p, text: JSON.stringify(payload) };
    });
    if (!partChanged) return m;
    changed = true;
    return { ...m, content };
  });
  return changed ? out : null;
}

/** The analyzer client with outfit parts added to V5 requests of registered runs. `onAugment` gets the outfit count. */
export function withOutfitAwareness(client: AnalyzerClientLike, registry: OutfitIndexRegistry, onAugment?: (outfits: number) => void): AnalyzerClientLike {
  return {
    complete(config, messages, options) {
      if (!registry.size) return client.complete(config, messages, options);
      let outfits = 0;
      const augmented = augmentV5AnalyzerMessages(messages, (k, f, o) => {
        const parts = registry.wire(k, f, o);
        if (parts) outfits += 1;
        return parts;
      });
      if (augmented) onAugment?.(outfits);
      // The client sends the cache partition when there is one, so it needs the same parts.
      const cachePartition = (options as { cachePartition?: unknown } | undefined)?.cachePartition;
      const partition = cachePartition ? augmentPartition(cachePartition, (k, f, o) => registry.wire(k, f, o)) : null;
      return client.complete(config, augmented ?? messages, partition ? { ...options, cachePartition: partition } : options);
    },
  };
}

/** A JSON text of the cache partition, which may start with a header line such as `STATIC V5 APPEARANCE CATALOG`. */
type PartitionDoc = { header: string; payload: Rec };
const PARTITION_HEADER = /^(?:STATIC|CURRENT) V5 [A-Z ]+\n/u;

function readPartitionDoc(text: string): PartitionDoc | null {
  const header = PARTITION_HEADER.exec(text)?.[0] ?? "";
  const payload = parseObject(text.slice(header.length));
  return payload ? { header, payload } : null;
}

/**
 * The engine's cache partition (`Vpe`) with outfit parts added, or null when nothing changed. The partition splits the
 * flat payload across messages (catalog in one, `response_contract` in another), so the catalogs and the part policy
 * are edited per message: the policy goes in only when a catalog got parts.
 */
export function augmentPartition(partition: unknown, lookup: Lookup): Rec | null {
  const p = rec(partition);
  if (!Array.isArray(p.cacheSegments) || !Array.isArray(p.liveMessages)) return null;
  const docs: PartitionDoc[] = [];
  const edited = new Set<PartitionDoc>();
  // Parse every JSON text once; `write` rebuilds a message from its (possibly edited) docs.
  const read = (m: unknown) => {
    const message = rec(m);
    const doc = (text: unknown) => {
      const d = typeof text === "string" ? readPartitionDoc(text) : null;
      if (d) docs.push(d);
      return d;
    };
    if (message.role !== "user") return () => m;
    if (typeof message.content === "string") {
      const d = doc(message.content);
      return () => (d && edited.has(d) ? { ...message, content: d.header + JSON.stringify(d.payload) } : m);
    }
    if (!Array.isArray(message.content)) return () => m;
    const parts = message.content.map((part: unknown) => {
      const r = rec(part);
      return { part, d: r.type === "text" ? doc(r.text) : null };
    });
    return () =>
      parts.some(({ d }) => d && edited.has(d))
        ? { ...message, content: parts.map(({ part, d }) => (d && edited.has(d) ? { ...rec(part), text: d.header + JSON.stringify(d.payload) } : part)) }
        : m;
  };
  const segments = p.cacheSegments.map((segment: unknown) => {
    const s = rec(segment);
    return { s, writes: Array.isArray(s.messages) ? s.messages.map(read) : null };
  });
  const live = p.liveMessages.map(read);
  for (const d of docs) {
    const a = augmentCatalog(d.payload.appearance_catalog, lookup);
    const b = augmentCatalog(d.payload.generated_appearance_catalog, lookup);
    if (a || b) edited.add(d);
  }
  if (!edited.size) return null;
  for (const d of docs) if (d.payload.response_contract && applyOutfitPartPolicy(d.payload)) edited.add(d);
  return {
    ...p,
    cacheSegments: segments.map(({ s, writes }) => (writes ? { ...s, messages: writes.map((w) => w()) } : s)),
    liveMessages: live.map((w) => w()),
  };
}
