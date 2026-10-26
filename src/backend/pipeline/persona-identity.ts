/**
 * Keep V5's user participant attached to its registered identity when the scene
 * uses pronouns or nicknames. This is request guidance, not actor insertion or
 * an identity rewrite: distinct NPCs, absent personas and POV remain valid.
 */
import type { AnalyzerClientLike } from "../services/types.js";

type RecordValue = Record<string, unknown>;
type Message = Parameters<AnalyzerClientLike["complete"]>[1][number];
const record = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);

export const PERSONA_IDENTITY_POLICY = {
  matching: "When current scene evidence identifies the user-controlled participant, resolve first-person actions, second-person references, pronouns and established nicknames to active_persona_candidate_key. Omission of the proper name does not establish a new identity.",
  appearance: "Use the matched candidate's allowed registered form. Do not invent a replacement appearance or generated_actor_proposal for the same participant because a name is omitted, clothing changes, or a descriptive nickname is used.",
  continuity: "Use prior identity references only when the current scene supports the same participant; continuity alone does not establish presence.",
  presence: "Select the persona only when visibly present under the current presentation rules. An absent, mentioned-only or off-camera persona, including a POV viewer without a visible body, does not require an Actor.",
  distinct_actors: "Other named or unnamed participants retain their own identities. Gender, pronouns or visual similarity alone do not prove that an NPC is the user persona. Truly unmatched participants may still use generated_actor_proposals.",
} as const;

function augmentPayload(text: string): string | null {
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return null; }
  if (!record(payload) || typeof payload.scene !== "string" || !Array.isArray(payload.actor_candidates)) return null;
  const key = payload.active_persona_candidate_key;
  if (typeof key !== "string" || !key.trim()) return null;
  const overlay = Array.isArray(payload.actor_candidate_overlay) ? payload.actor_candidate_overlay : [];
  if (![...payload.actor_candidates, ...overlay].some((candidate) => record(candidate) && candidate.candidateKey === key)) return null;
  const contract = payload.response_contract;
  if (!record(contract) || !record(contract.analysis_policy) || !record(contract.analysis_policy.actors)) return null;
  // Add a namespaced policy without replacing upstream or user-authored rules.
  contract.analysis_policy.actors.active_persona_identity ??= PERSONA_IDENTITY_POLICY;
  return JSON.stringify(payload);
}

/** Preserve images, cache metadata and all non-V5/absent-persona messages. */
export function augmentPersonaIdentityMessages(messages: Message[]): Message[] | null {
  let changed = false;
  const output = messages.map((message) => {
    if (message.role !== "user") return message;
    if (typeof message.content === "string") {
      const text = augmentPayload(message.content);
      if (text === null) return message;
      changed = true;
      return { ...message, content: text };
    }
    if (!Array.isArray(message.content)) return message;
    let partChanged = false;
    const content = message.content.map((part: unknown) => {
      if (!record(part) || part.type !== "text" || typeof part.text !== "string") return part;
      const text = augmentPayload(part.text);
      if (text === null) return part;
      partChanged = true;
      return { ...part, text };
    });
    if (!partChanged) return message;
    changed = true;
    return { ...message, content };
  });
  return changed ? output : null;
}

export function withPersonaIdentity(client: AnalyzerClientLike): AnalyzerClientLike {
  return {
    complete(config, messages, options) {
      return client.complete(config, augmentPersonaIdentityMessages(messages) ?? messages, options);
    },
  };
}
