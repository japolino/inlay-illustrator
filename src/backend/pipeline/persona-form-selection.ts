import type { AnalyzerContextInputs } from "../../engine/context/index.js";
import { fail } from "../rpc/errors.js";

/** Limit the active persona's catalog, without adding actors or modifying compiler callbacks/config. */
export function applyPersonaFormSelection(inputs: AnalyzerContextInputs, personaId: string, formId: string): AnalyzerContextInputs {
  const key = `persona::${personaId}`;
  const candidate = inputs.v5PersonaCatalogCandidates.find((c) => c.key === key);
  const form = candidate?.appearanceForms.find((f) => f.formId === formId);
  if (inputs.analyzerPersonaPromptKey !== key || !form)
    fail("bad-request", "The selected persona form is unavailable. Choose an existing form or Auto in Inlay's Persona form selector.");
  const restrict = (candidates: AnalyzerContextInputs["analyzerPersonaCandidates"]) => candidates.map((c) => c.key === key ? { ...c, defaultFormId: formId, appearanceForms: [form] } : c);
  const outfits = (candidates: AnalyzerContextInputs["analyzerOutfitCandidates"]) => candidates.filter((c) => c.lorebook_prompt_key !== key || (c.form_id || "form_default") === formId);
  return {
    ...inputs,
    analyzerPersonaCandidates: restrict(inputs.analyzerPersonaCandidates),
    v5PersonaCatalogCandidates: restrict(inputs.v5PersonaCatalogCandidates),
    analyzerOutfitCandidates: outfits(inputs.analyzerOutfitCandidates),
    v5OutfitCatalogCandidates: outfits(inputs.v5OutfitCatalogCandidates),
    analyzerPersonaDefaultOutfitId: form.defaultOutfitId,
  };
}
