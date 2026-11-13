/**
 * Saves the appearance forms the analyzer proposed for a lasting body change (form-awareness.ts) on their owners:
 * a persona's forms live in the global config (`characterPrompt.personaSettings`), every other character's in the
 * character document that holds its prompt key (`characterPrompt.characterForms`).
 */
import { normalizePersonaSettings, resolvePersonaForms, PERSONA_PROMPT_KEY_PREFIX, type Form, type FormCollection } from "../../shared/contract/index.js";
import { currentForms, withForms } from "../analysis/workspace.js";
import type { BackendServices } from "../services/types.js";
import { addProposedForm, MAX_FORMS_PER_OWNER, type AddedForm, type CreatedForm, type FormProposal, type RunFormOwner } from "./form-awareness.js";

/** What a stopped run hands over for the restart. */
export interface FormRestart {
  proposals: FormProposal[];
  rejected: string[];
  owners: Map<string, RunFormOwner>;
  /** Character document that stores the forms of a (non-persona) prompt key. */
  documentOf(identityKey: string): string;
  /** Display name of a prompt key. */
  nameOf(identityKey: string): string;
}

export interface SavedForm extends CreatedForm {
  identityKey: string;
  ownerName: string;
  /** False when the owner already had a form of that label. */
  added: boolean;
  persona: boolean;
}

const isPersona = (identityKey: string) => identityKey.startsWith(PERSONA_PROMPT_KEY_PREFIX);

async function loadForms(services: BackendServices, restart: FormRestart, identityKey: string): Promise<FormCollection> {
  if (isPersona(identityKey)) {
    const config = await services.storage.loadConfig();
    return resolvePersonaForms(normalizePersonaSettings(config.characterPrompt.personaSettings), config.characterPrompt.personaGender, identityKey.slice(PERSONA_PROMPT_KEY_PREFIX.length));
  }
  return currentForms(await services.storage.loadCharacterDocument(restart.documentOf(identityKey)), identityKey);
}

/** Saves each proposal as a new form of its owner. `skipped` lists the proposals that were not saved, with the reason. */
export async function saveProposedForms(services: BackendServices, restart: FormRestart): Promise<{ created: SavedForm[]; skipped: string[] }> {
  const created: SavedForm[] = [];
  const skipped = [...restart.rejected];
  for (const proposal of restart.proposals) {
    const owner = restart.owners.get(proposal.candidateKey.toLowerCase());
    if (!owner) continue;
    const ownerName = restart.nameOf(owner.identityKey) || owner.candidateKey;
    let copied: Form | undefined;
    if (proposal.copyFrom) {
      const source = restart.owners.get(proposal.copyFrom.candidateKey.toLowerCase());
      const formId = source?.forms.find((f) => f.formRef === proposal.copyFrom!.formRef)?.formId;
      copied = source && formId ? (await loadForms(services, restart, source.identityKey)).forms.find((f) => f.id === formId) : undefined;
      if (!copied && !Object.keys(proposal.basePromptGroups).length) {
        skipped.push(`${ownerName}: "${proposal.label}" copies a form that could not be read`);
        continue;
      }
    }
    let result: AddedForm | null = null;
    if (isPersona(owner.identityKey)) {
      const personaId = owner.identityKey.slice(PERSONA_PROMPT_KEY_PREFIX.length);
      await services.storage.updateConfig((config) => {
        const settings = normalizePersonaSettings(config.characterPrompt.personaSettings);
        result = addProposedForm(resolvePersonaForms(settings, config.characterPrompt.personaGender, personaId), proposal, copied);
        if (!result?.added) return config;
        const profile = { ...(settings.profiles[personaId] ?? {}), forms: result.collection };
        return { ...config, characterPrompt: { ...config.characterPrompt, personaSettings: { ...settings, profiles: { ...settings.profiles, [personaId]: profile } } } };
      });
    } else {
      await services.storage.updateCharacterDocument(
        restart.documentOf(owner.identityKey),
        (doc) => {
          result = addProposedForm(currentForms(doc, owner.identityKey), proposal, copied);
          const added = result;
          return added?.added ? withForms(doc, owner.identityKey, () => added.collection) : doc;
        },
        { reason: "form-detection" },
      );
    }
    const saved = result as AddedForm | null;
    if (!saved) {
      skipped.push(`${ownerName}: "${proposal.label}" was not added, the character already has ${MAX_FORMS_PER_OWNER} forms`);
      continue;
    }
    created.push({ candidateKey: owner.candidateKey, label: saved.label, identityKey: owner.identityKey, ownerName, added: saved.added, persona: isPersona(owner.identityKey) });
  }
  return { created, skipped };
}
