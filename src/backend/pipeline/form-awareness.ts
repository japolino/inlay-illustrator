/**
 * Inlay form layer: a registered character whose body changes in the story gets a new appearance form.
 *
 * AM's analyzer can only pick one of a character's registered forms ("Never invent a formRef"), so a human who becomes
 * a beast, a monster who becomes human, or a character who takes another character's body keeps being drawn with the old
 * body tags. This layer adds one rule to the deciding analyzer request (single analysis, or the split initial step): a
 * lasting body change that no registered form shows is declared in an extra root field, `form_proposals`. The core
 * never sees that field. When a reply carries one, the run stops, the pipeline saves the form on its owner
 * (`saveProposedForms` in generate.ts) and analyzes once more: the new form is then an ordinary registered form, selected
 * by its formRef, with outfits and continuity handled by the core as for any other form.
 */
import { addForm, normalizeFormCollection, patchForm, patchOutfit, type Form, type FormCollection, type Gender } from "../../shared/contract/index.js";
import { v5 } from "../../engine/index.js";
import type { AnalyzerClientLike } from "../services/types.js";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const pick = (r: Rec, keys: readonly string[]): unknown => {
  for (const k of keys) if (r[k] !== undefined) return r[k];
  return undefined;
};

/** A character can hold this many forms before the layer stops adding more (the overlay has no such limit). */
export const MAX_FORMS_PER_OWNER = 12;
const MAX_LABEL = 80;
const OUTFIT_PARTS = ["head", "top", "bottom", "legs", "feet"] as const;

/** One registered character of a run, as the analyzer request names it. */
export interface RunFormOwner {
  candidateKey: string;
  /** Prompt key the forms are stored under (`persona::<id>` for a persona). */
  identityKey: string;
  forms: Array<{ formId: string; formRef: string; label: string }>;
}

/** A body change the analyzer declared. */
export interface FormProposal {
  candidateKey: string;
  label: string;
  humanlike: boolean;
  sex: Gender;
  basePromptGroups: Rec;
  defaultOutfit?: { name: string } & Partial<Record<(typeof OUTFIT_PARTS)[number], string>>;
  /** The owner now has the body of this registered character's form. */
  copyFrom?: { candidateKey: string; formRef: string };
  evidence: string;
}

/** A form made for this message by an earlier pass: the next analysis is told to select it. */
export interface CreatedForm {
  candidateKey: string;
  label: string;
}

/** Form state of one run, shared between generate.ts and the analyzer wrapper. */
export interface RunFormWatch {
  owners: Map<string, RunFormOwner>;
  created: readonly CreatedForm[];
  /** False on the pass after a restart, and for requests that must not create forms. */
  allowProposals: boolean;
  /** Proposals of the reply that stopped the run. */
  proposals: FormProposal[];
  /** Entries of `form_proposals` that could not be used, with the reason. */
  rejected: string[];
  /** True once a reply carried `form_proposals`: the run was stopped to analyze again. */
  stopped: boolean;
  /** Aborts the run (generate.ts supplies it). */
  stop(): void;
}

/** Registered characters of an analyzer context, by wire candidate key. Never throws. */
export function readFormOwners(context: unknown): Map<string, RunFormOwner> {
  const ctx = rec(context);
  const owners = new Map<string, RunFormOwner>();
  const personaKey = str(ctx.personaPromptKey);
  const labels = new Map<string, string>();
  for (const list of [ctx.actorCandidates, ctx.personaCandidates, ctx.v5PersonaCatalogCandidates])
    for (const c of arr(list).map(rec)) for (const f of arr(c.appearanceForms).map(rec)) labels.set(`${str(c.key)}\0${str(f.formId)}`, str(f.label));
  let bindings: Rec = {};
  try {
    bindings = rec(v5.buildV5CandidateBindings(ctx as never, null));
  } catch {
    return owners;
  }
  const sourceKeys = rec(bindings.sourceKeyByCandidateKey);
  for (const r of arr(bindings.response).map(rec)) {
    const candidateKey = str(r.candidateKey);
    const source = str(sourceKeys[candidateKey]) || str(arr(r.identityReferences)[0]);
    const identityKey = source === "__persona__" ? personaKey : source;
    if (!candidateKey || !identityKey) continue;
    owners.set(candidateKey.toLowerCase(), {
      candidateKey,
      identityKey,
      forms: arr(r.appearanceForms)
        .map(rec)
        .map((f) => ({ formId: str(f.formId), formRef: str(f.formRef), label: labels.get(`${source}\0${str(f.formId)}`) || labels.get(`${identityKey}\0${str(f.formId)}`) || str(f.label) })),
    });
  }
  return owners;
}

export function createRunFormWatch(context: unknown, options: { created?: readonly CreatedForm[]; allowProposals: boolean; stop: () => void }): RunFormWatch {
  return { owners: readFormOwners(context), created: options.created ?? [], allowProposals: options.allowProposals, proposals: [], rejected: [], stopped: false, stop: options.stop };
}

/** Runs in flight; a request belongs to the run that knows its candidate keys. */
export class FormWatchRegistry {
  private readonly active: RunFormWatch[] = [];

  register(watch: RunFormWatch): () => void {
    this.active.unshift(watch);
    return () => {
      const i = this.active.indexOf(watch);
      if (i >= 0) this.active.splice(i, 1);
    };
  }

  get size(): number {
    return this.active.length;
  }

  /** The run whose registered characters are the request's `actor_candidates`. */
  match(payload: Rec): RunFormWatch | undefined {
    const keys = arr(payload.actor_candidates)
      .map((c) => str(rec(c).candidateKey).toLowerCase())
      .filter(Boolean);
    if (!keys.length) return undefined;
    return this.active.find((watch) => keys.every((k) => watch.owners.has(k)));
  }
}

/* ------------------------------------------------------------------------------------------------
 * Request: the form rule
 * ---------------------------------------------------------------------------------------------- */

/** The rule added to `analysis_policy.actors` of a deciding request. */
export const FORM_CHANGE_POLICY = Object.freeze({
  when: "A registered Actor's own body has changed in the story in a real and lasting way (a transformation, a different species or body structure, becoming another being, a lasting change of age or sex), and none of that Actor's forms in actor_candidates shows the body it has now.",
  not_for:
    "Clothing, costumes, armor, makeup, wigs, accessories, injuries, dirt, wetness, emotions, poses, lighting, illusions, dreams, imagined or hypothetical bodies, a disguise the text treats as a disguise, an effect that ends within the scene, or a change the text does not state as real. A new unregistered being is a generated actor, never a form.",
  existing_form: "When one of the Actor's forms already shows the new body, select that formRef and declare nothing.",
  action:
    "Declare the change once in the root field form_proposals and return an empty illustrations array: the form is created from the proposal and this analysis is then repeated with it. Never use a formRef that is not in actor_candidates.",
  item: "{candidateKey, formLabel, humanlike, sex, basePromptGroups, defaultOutfit, copyFrom, evidence}. candidateKey is the registered Actor that changed.",
  profile:
    "formLabel, humanlike, basePromptGroups and defaultOutfit follow free_character_profile_contract exactly as for a generated actor. Describe the whole body the Actor has now, not only what changed; sex is female, male or unknown. defaultOutfit is what the Actor wears in that body.",
  copyFrom:
    "Only when the Actor now has the body of another registered Actor: {candidateKey, formRef} of that Actor's form. Its look is copied, so basePromptGroups may be omitted; formLabel still names the result.",
  evidence: "A short quote or paraphrase of the text that states the lasting change.",
});

/** Root contract entry for `form_proposals`. */
export const FORM_PROPOSALS_ROOT = Object.freeze({
  cardinality: "zero_or_more_but_one_per_registered_actor_whose_body_lastingly_changed",
  requiredWhen: "Only under analysis_policy.actors.form_changes.",
  itemFields: ["candidateKey", "formLabel", "humanlike", "sex", "basePromptGroups", "defaultOutfit", "copyFrom", "evidence"],
});

/** True for the request that decides who appears in which form: a single analysis or the split initial step. */
function isDecidingRequest(payload: Rec): boolean {
  if (str(payload.analysis_stage) === "detail") return false;
  const contract = rec(payload.response_contract);
  return Array.isArray(rec(contract.root).itemFields) && rec(contract.analysis_policy).actors !== undefined && Array.isArray(payload.actor_candidates);
}

/** The text that tells the analysis after a restart which forms were just made. */
export function createdFormsNote(watch: RunFormWatch): string {
  const lines = watch.created.flatMap((c) => {
    const owner = watch.owners.get(c.candidateKey.toLowerCase());
    const form = owner?.forms.find((f) => f.label.toLowerCase() === c.label.toLowerCase());
    return owner && form ? [`${owner.candidateKey}: formRef "${form.formRef}"`] : [];
  });
  return lines.length
    ? `These forms were just created for the lasting body change this message states (${lines.join("; ")}). Select that formRef for the Actor in every scene after the change, and the earlier form only for a scene before it.`
    : "";
}

/**
 * Adds the form rule (or, after a restart, the note about the created forms) to a payload's `response_contract`
 * (mutates). Returns whether it changed anything.
 */
export function applyFormPolicy(payload: Rec, watch: RunFormWatch): boolean {
  const contract = rec(payload.response_contract);
  if (contract !== payload.response_contract) return false;
  const policy = rec(contract.analysis_policy);
  const actors = policy.actors;
  if (contract.analysis_policy !== policy || !actors || typeof actors !== "object" || Array.isArray(actors)) return false;
  let changed = false;
  if (watch.allowProposals) {
    (actors as Rec).form_changes = FORM_CHANGE_POLICY;
    const root = rec(contract.root);
    if (contract.root === root && Array.isArray(root.itemFields) && !root.itemFields.includes("form_proposals")) {
      root.itemFields = ["form_proposals", ...root.itemFields];
      root.form_proposals = FORM_PROPOSALS_ROOT;
    }
    changed = true;
  }
  const note = createdFormsNote(watch);
  if (note) {
    (actors as Rec).created_forms = note;
    changed = true;
  }
  return changed;
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

/** The JSON object of a V5 analyzer request's last user message (flat messages), or null. */
export function readAnalyzerPayload(messages: readonly Message[]): Rec | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    const text = typeof m.content === "string" ? m.content : arr(m.content).map((part) => (typeof rec(part).text === "string" ? (rec(part).text as string) : "")).join("");
    const start = text.indexOf("{");
    const payload = start >= 0 ? parseObject(text.slice(start)) : null;
    return payload && payload.response_contract ? payload : null;
  }
  return null;
}

const PARTITION_HEADER = /^(?:STATIC|CURRENT) V5 [A-Z ]+\n/u;

/** Rewrites every JSON text of a message that holds a `response_contract`; returns the message unchanged when none did. */
function editContractTexts<M>(message: M, edit: (payload: Rec) => boolean): M {
  const m = rec(message);
  if (m.role !== "user") return message;
  const editText = (text: unknown): string | null => {
    if (typeof text !== "string") return null;
    const header = PARTITION_HEADER.exec(text)?.[0] ?? "";
    const payload = parseObject(text.slice(header.length));
    return payload && payload.response_contract && edit(payload) ? header + JSON.stringify(payload) : null;
  };
  if (typeof m.content === "string") {
    const next = editText(m.content);
    return next === null ? message : ({ ...m, content: next } as M);
  }
  if (!Array.isArray(m.content)) return message;
  let changed = false;
  const content = m.content.map((part: unknown) => {
    const p = rec(part);
    const next = p.type === "text" ? editText(p.text) : null;
    if (next === null) return part;
    changed = true;
    return { ...p, text: next };
  });
  return changed ? ({ ...m, content } as M) : message;
}

/* ------------------------------------------------------------------------------------------------
 * Reply: the proposals
 * ---------------------------------------------------------------------------------------------- */

const SEXES = new Set(["female", "male", "unknown"]);

/** Usable proposals of a reply's `form_proposals`; the reasons for the unusable ones go to `rejected`. */
export function readFormProposals(reply: Rec, watch: Pick<RunFormWatch, "owners">, rejected: string[] = []): FormProposal[] {
  const out: FormProposal[] = [];
  const seen = new Set<string>();
  for (const raw of arr(pick(reply, ["form_proposals", "formProposals"]))) {
    const p = rec(raw);
    const candidateKey = str(pick(p, ["candidateKey", "candidate_key"]));
    const owner = watch.owners.get(candidateKey.toLowerCase());
    const label = str(pick(p, ["formLabel", "form_label", "label"])).slice(0, MAX_LABEL);
    if (!owner) {
      rejected.push(`${candidateKey || "(no character)"}: not a registered character of this request`);
      continue;
    }
    if (seen.has(owner.candidateKey)) {
      rejected.push(`${owner.candidateKey}: a second proposal for the same character`);
      continue;
    }
    if (!label || /^(?:default(?:\s*form)?|form(?:[\s_.-]*\d+)?|기본(?:\s*폼)?|폼\s*\d+)$/iu.test(label)) {
      rejected.push(`${owner.candidateKey}: no usable form label`);
      continue;
    }
    const copy = rec(pick(p, ["copyFrom", "copy_from"]));
    const copyOwner = watch.owners.get(str(pick(copy, ["candidateKey", "candidate_key"])).toLowerCase());
    const copyRef = str(pick(copy, ["formRef", "form_ref"]));
    const copyForm = copyOwner ? (copyOwner.forms.find((f) => f.formRef === copyRef) ?? (copyOwner.forms.length === 1 || !copyRef ? copyOwner.forms[0] : undefined)) : undefined;
    const groups = rec(pick(p, ["basePromptGroups", "base_prompt_groups"]));
    const hasTags = Object.values(groups).some((v) => (Array.isArray(v) ? v.some((t) => str(t)) : !!str(v)));
    if (!hasTags && !(copyOwner && copyForm && copyOwner.candidateKey !== owner.candidateKey)) {
      rejected.push(`${owner.candidateKey}: "${label}" has neither body tags nor a character to copy`);
      continue;
    }
    const outfit = rec(pick(p, ["defaultOutfit", "default_outfit"]));
    const parts = Object.fromEntries(OUTFIT_PARTS.flatMap((part) => (str(outfit[part]) ? [[part, str(outfit[part])]] : [])));
    const sex = str(p.sex).toLowerCase();
    seen.add(owner.candidateKey);
    out.push({
      candidateKey: owner.candidateKey,
      label,
      humanlike: p.humanlike !== false,
      sex: (SEXES.has(sex) ? sex : "unknown") as Gender,
      basePromptGroups: hasTags ? groups : {},
      ...(str(outfit.name) || Object.keys(parts).length ? { defaultOutfit: { name: str(outfit.name) || label, ...parts } } : {}),
      ...(copyOwner && copyForm && copyOwner.candidateKey !== owner.candidateKey ? { copyFrom: { candidateKey: copyOwner.candidateKey, formRef: copyForm.formRef } } : {}),
      evidence: str(p.evidence).slice(0, 240),
    });
  }
  return out;
}

/** Thrown by the wrapper once the run was stopped for a form restart; the core sees an aborted request. */
export function formRestartAbort(): DOMException {
  return new DOMException("The analysis stops to add a new appearance form and starts again.", "AbortError");
}

/**
 * The analyzer client with the form rule added to the deciding request of registered runs. A reply with
 * `form_proposals` stops its run for a restart; without a restart the field is removed so the core never sees it.
 */
export function withFormAwareness(client: AnalyzerClientLike, registry: FormWatchRegistry, onProposals?: (proposals: FormProposal[], rejected: string[]) => void): AnalyzerClientLike {
  return {
    async complete(config, messages, options) {
      const payload = registry.size ? readAnalyzerPayload(messages as readonly Message[]) : null;
      const watch = payload && isDecidingRequest(payload) ? registry.match(payload) : undefined;
      if (!watch || (!watch.allowProposals && !watch.created.length)) return client.complete(config, messages, options);
      const edit = (p: Rec) => applyFormPolicy(p, watch);
      const sent = (messages as readonly Message[]).map((m) => editContractTexts(m, edit));
      // The client sends the cache partition when there is one, so it needs the same rule.
      const partition = rec((options as { cachePartition?: unknown } | undefined)?.cachePartition);
      const hasPartition = Array.isArray(partition.cacheSegments) && Array.isArray(partition.liveMessages);
      const sentOptions = hasPartition
        ? {
            ...options,
            cachePartition: {
              ...partition,
              cacheSegments: arr(partition.cacheSegments).map((segment) => {
                const s = rec(segment);
                return Array.isArray(s.messages) ? { ...s, messages: s.messages.map((m: unknown) => editContractTexts(m, edit)) } : segment;
              }),
              liveMessages: arr(partition.liveMessages).map((m) => editContractTexts(m, edit)),
            },
          }
        : options;
      const result = await client.complete(config, sent as never, sentOptions as never);
      const reply = rec(result.parsed);
      if (reply !== result.parsed || pick(reply, ["form_proposals", "formProposals"]) === undefined) return result;
      const declared = arr(pick(reply, ["form_proposals", "formProposals"]));
      if (watch.allowProposals && declared.length) {
        watch.proposals = readFormProposals(reply, watch, watch.rejected);
        watch.stopped = true;
        onProposals?.(watch.proposals, watch.rejected);
        watch.stop();
        throw formRestartAbort();
      }
      const cleaned = { ...reply };
      delete cleaned.form_proposals;
      delete cleaned.formProposals;
      // The core reads `raw` before `parsed`, so the cleaned reply replaces both.
      return { ...result, raw: JSON.stringify(cleaned), parsed: cleaned };
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * The form itself
 * ---------------------------------------------------------------------------------------------- */

export interface AddedForm {
  collection: FormCollection;
  formId: string;
  label: string;
  /** False when a form of that label was already there (nothing was added). */
  added: boolean;
}

/**
 * The owner's collection with the proposed form appended. `copied` is the form whose look is taken over (`copyFrom`).
 * Returns null when the owner already holds {@link MAX_FORMS_PER_OWNER} forms.
 */
export function addProposedForm(collection: unknown, proposal: FormProposal, copied?: Form): AddedForm | null {
  const current = normalizeFormCollection(collection);
  const existing = current.forms.find((f) => f.label.trim().toLowerCase() === proposal.label.toLowerCase());
  if (existing) return { collection: current, formId: existing.id, label: existing.label, added: false };
  if (current.forms.length >= MAX_FORMS_PER_OWNER) return null;
  const description = `Added automatically from the story${proposal.evidence ? `: ${proposal.evidence}` : "."}`;
  const added = addForm(current, { label: proposal.label, description, humanlike: copied ? copied.humanlike : proposal.humanlike, gender: proposal.sex !== "unknown" ? proposal.sex : (copied?.gender ?? "unknown") });
  if (!added.formId) return null;
  const hasTags = Object.keys(proposal.basePromptGroups).length > 0;
  let next = patchForm(added.collection, added.formId, {
    basePromptGroups: hasTags || !copied ? proposal.basePromptGroups : copied.basePromptGroups,
    ...(copied ? { negativePrompt: copied.negativePrompt, reference: copied.reference } : {}),
  });
  const form = next.forms.find((f) => f.id === added.formId)!;
  const copiedOutfit = copied?.outfits.find((o) => o.id === copied.defaultOutfitId) ?? copied?.outfits[0];
  const outfit = proposal.defaultOutfit;
  if (outfit) {
    next = patchOutfit(next, form.id, form.defaultOutfitId, { label: outfit.name, ...Object.fromEntries(OUTFIT_PARTS.map((part) => [part, outfit[part] ?? ""])), candidateEnabled: true } as never);
  } else if (copiedOutfit) {
    const { id: _id, ...rest } = copiedOutfit as unknown as Rec;
    next = patchOutfit(next, form.id, form.defaultOutfitId, { ...rest, candidateEnabled: true } as never);
  }
  return { collection: next, formId: form.id, label: form.label, added: true };
}
