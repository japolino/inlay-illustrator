/** Manual selection is scoped to the chat's current persona, never the workspace editor's row. */
import { resolvePersonaForms, type PersonaFormSelection } from "../../../shared/contract/index.js";
import { fail } from "../errors.js";
import type { HandlerGroup, RpcContext } from "../types.js";

function need(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) fail("bad-request", `${name} is required.`);
  return value.trim();
}

async function selection(chatId: string, ctx: RpcContext): Promise<PersonaFormSelection> {
  await ctx.sources.getChat(chatId);
  const [persona, config, doc, settings] = await Promise.all([
    ctx.sources.getActivePersona(chatId), ctx.storage.loadConfig(), ctx.storage.loadChatData(chatId), ctx.storage.loadChatImageGenerationSettings(),
  ]);
  const forms = persona ? resolvePersonaForms(config.characterPrompt.personaSettings, config.characterPrompt.personaGender, persona.personaId).forms : [];
  const selectedFormId = persona && Object.hasOwn(doc.personaFormSelections ?? {}, persona.personaId) ? doc.personaFormSelections![persona.personaId]! : null;
  return {
    chatId, personaId: persona?.personaId ?? null, personaName: persona?.name ?? "",
    forms: forms.map((f) => ({ id: f.id, label: f.label || f.id })), selectedFormId,
    missingForm: !!selectedFormId && !forms.some((f) => f.id === selectedFormId),
    supported: config.novelai.analysisProfile === "v5-hybrid" && !settings.webtoonMode,
  };
}

export const personaFormHandlers: HandlerGroup = {
  "personaForm.get": (params, ctx) => selection(need(params.chatId, "chatId"), ctx),
  async "personaForm.set"(params, ctx) {
    const chatId = need(params.chatId, "chatId");
    const personaId = need(params.personaId, "personaId");
    if (params.formId !== null && (typeof params.formId !== "string" || !params.formId.trim())) fail("bad-request", "formId must be a form id or null (Auto).");
    const formId = params.formId === null ? null : params.formId.trim();
    await ctx.storage.updateChatData(chatId, async (doc) => {
      // Check inside the serialized update: a delayed save must not target a newly selected persona.
      const current = await selection(chatId, ctx);
      if (current.personaId !== personaId) fail("conflict", "The chat's persona changed. Reload the form selector and try again.");
      if (formId && !current.supported) fail("unsupported", "Manual persona forms require V5 illustration analysis.");
      if (formId && !current.forms.some((f) => f.id === formId)) fail("not-found", "That persona form no longer exists. Choose another form or Auto.");
      const selections = { ...doc.personaFormSelections };
      if (formId) Object.defineProperty(selections, personaId, { value: formId, enumerable: true, writable: true, configurable: true });
      else delete selections[personaId];
      const { personaFormSelections: _old, ...rest } = doc;
      return { ...rest, ...(Object.keys(selections).length ? { personaFormSelections: selections } : {}) };
    });
    ctx.events.emit("chatData.changed", { chatId, messageKeys: [] });
    return selection(chatId, ctx);
  },
};
