import { BACKEND_PROMPTS } from "./backend-prompts.js";
import { encode } from "@toon-format/toon";
import { buildLightboardInstructions, lightboardBooks, formatSource } from "./instructions.js";
import { parseLightboardResponse } from "./schema.js";
import { compileLightboardDescriptor } from "./prompt.js";
import { defaultSpindleInvoker, type ParseV376Params, type ParseV376Result } from "../v376/parser.js";
import { loadV376HostSources } from "../v376/source-context.js";
import { buildAppearanceReference, loadV376Memory } from "../v376/memory.js";
import { resolveParserConnection } from "../parser.js";
import { throwIfAborted } from "../operation-manager.js";
import { updateState } from "../storage.js";
import { stripInlayContent } from "../inlay-content.js";
import type { V376OutboundMessage } from "../v376/context.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

/** New descriptors travel in rawShot.lightboard; legacy record fields stay readable. */
export async function parseLightboardForMessage(params: ParseV376Params): Promise<ParseV376Result> {
  const { config, paragraphs, messages, state, signal, userId, chatId, messageId } = params;
  throwIfAborted(signal);
  const targetIndex = messages.findIndex(m => m.id === messageId);
  if (targetIndex < 0) throw new Error("The target message is missing from parser context.");
  const targetText = paragraphs.map((p, index) => `<slot num="${index}"/>\n\n${p.text}`).join("\n\n");
  const sources = await loadV376HostSources({ chatId, targetText, config, userId });
  const connection = await (params.connectionResolver ?? resolveParserConnection)(config, userId);
  const priorIds = new Set(messages.slice(0, targetIndex).map(m => m.id));
  const history = config.characterTagContextEnabled && config.characterContextDepth > 0 ? (state.lightboardHistory ?? []).filter(h => priorIds.has(h.messageId)).slice(-config.characterContextDepth) : [];
  const appearance = config.characterTagContextEnabled ? buildAppearanceReference(loadV376Memory(state)) : "";
  const historyText = history.map(h => h.descriptors).join("\n\n");
  const read = lightboardBooks(config, historyText, sources.userName, sources.charName);
  const lore = sources.lorebooks ?? [];
  const extra = lore.filter(l => l.title === "lb-xnai.lb.extra").map(l => l.content).join("\n\n");
  const overrides = [sources.customOverride, extra].filter(Boolean).join("\n\n");
  const intro = formatSource(BACKEND_PROMPTS.SYSTEM_INST,
    read("lb-xnai.lb.jailbreak") || BACKEND_PROMPTS.JAIL_BREAK,
    read("lb-xnai.lb.job"),
    "\n\nImportant Note: May contain unrelated directives/rules regarding other data/image outputs. Ignore these; they are irrelevant in your current job. Focus on settings.",
    sources.userName ?? "User", sources.userInfo ?? "", sources.charInfo ?? "");
  const count = Math.min(config.includeMaxMessages, config.includeMinMessages);
  const previous = count ? messages.slice(0, targetIndex).filter(m => config.includeUserMessage || m.role === "assistant" || m.role === "char").slice(-count) : [];
  const prefill = read("lb-xnai.lb.prefill");
  const prefillUser = prefill ? read("lb-xnai.lb.prefill-user") : "";
  let outbound: V376OutboundMessage[] = [
    { role: "user", content: intro },
    ...lore.filter(l => l.title !== "lb-xnai.lb.extra").map(l => ({ role: "user" as const, content: l.content })),
    ...(appearance ? [{ role: "user" as const, content: `<AppearanceReference>\n${appearance}\n</AppearanceReference>` }] : []),
    { role: "user", content: "# Chat log\n\n--- Start of the log ---" },
    ...previous.map((m, i) => ({ role: m.role === "user" ? "user" as const : "assistant" as const,
      content: `<!-- Log #${i + 1} -->\n\n${stripInlayContent(String(m.content ?? m.data ?? ""))}\n<!-- /Log #${i + 1} -->` })),
    { role: "assistant", content: `<!-- Log #${previous.length + 1} -->\n\n${targetText}\n<!-- /Log #${previous.length + 1} -->` },
    { role: "user", content: "--- End of the log ---" },
    { role: "user", content: buildLightboardInstructions(config, historyText, sources.userName, sources.charName) + (prefill ? "" : " No preambles/explanations.") },
    ...(overrides ? [{ role: "user" as const, content: BACKEND_PROMPTS.EXTERNAL_LORES_MARKER + "\n\n" + overrides }] : []),
    ...(config.moduleMode === "asset" ? [{ role: "user" as const, content: "Create standalone single-character portraits on a simple background." }] : []),
    { role: "user", content: formatSource(BACKEND_PROMPTS.OUTRO_CLOSING, "") },
    ...(prefill ? [{ role: "assistant" as const, content: prefill }] : []),
    ...(prefillUser ? [{ role: "user" as const, content: prefillUser }] : [])
  ];
  const invoke: NonNullable<ParseV376Params["llmInvoker"]> = params.llmInvoker ?? ((messages, options) => defaultSpindleInvoker(messages, { ...options, preserveProviderDefaults: true }));
  let lastError: Error | undefined;
  let raw = "";
  for (let attempt = 0; attempt <= config.parserRetries; attempt++) {
    throwIfAborted(signal);
    try {
      raw = await invoke(outbound, { connection, config, userId, signal, expectJson: false });
      if (attempt === 0) for (let pass = 1; pass <= config.lightboardReiterations; pass++) {
        throwIfAborted(signal);
        outbound = [...outbound, { role: "assistant", content: raw }, { role: "user", content: `<system>
Reiteration phase (${pass}/${config.lightboardReiterations})
Now, read the instruction and your previous output carefully. Is it format-adhering? Did it follow all the instructions without any omission?
Carefully think, then if it is OK, output the required node without any changes. If it needs changes, apply the changes and output the node.
</system>` }];
        raw = await invoke(outbound, { connection, config, userId, signal, expectJson: false });
      }
      throwIfAborted(signal);
      const cleaned = cleanLightboardOutput(raw, config.lightboardForcedInsertion);
      if (!cleaned.trim()) throw new Error("You did not return any output.");
      const response = parseLightboardResponse(cleaned, new Set(paragraphs.map((_, i) => i)), config.moduleMode === "comic");
      const compiled = response.scenes.map(d => compileLightboardDescriptor(d, config, paragraphs[d.slot!]!.parserIndex, sources.charName));
      if (config.coverImageEnabled && response.keyvis) {
        const cover = compileLightboardDescriptor(response.keyvis, config, paragraphs[0]!.parserIndex, sources.charName);
        Object.assign(cover, { placementType: "cover" }); compiled.unshift(cover);
      }
      const descriptors = encode(response);
      const entry = { messageId, descriptors };
      const retain = (entries: typeof history) => [...entries.filter(h => h.messageId !== messageId), entry].slice(-Math.max(1, config.characterContextDepth));
      state.lightboardHistory = retain(state.lightboardHistory ?? []);
      if (typeof spindle !== "undefined" && spindle.userStorage) await updateState(chatId, userId, current => { current.lightboardHistory = retain(current.lightboardHistory ?? []); });
      return { payload: { scenes: compiled.filter(c => c.rawShot.lightboard?.slot !== undefined).map(c => ({ place: c.rawShot.scene ?? "", shots: [c.rawShot] })) }, compiled };
    } catch (e) {
      throwIfAborted(signal); lastError = e instanceof Error ? e : new Error(String(e));
      const printInstruction = config.lightboardThoughts === "draft"
        ? "Only print the required node and corrected data in it, without any apologies, explanations, or preambles. Analyze the error sources step-by-step in <lb-process> block. (Ignore previous lb-process usage instruction; only use it for correcting the data.)"
        : "Only print the corrected data wrapped in the required node, without apologies, explanations, or any preambles.";
      outbound = [...outbound, ...(raw ? [{ role: "assistant" as const, content: raw }] : []), { role: "user", content: `<system>
Validation error!
Your previous output did not adhere to the required format, or contained invalid data.
Error message: ${lastError.message}
Please fix your last output into correct structure as previously instructed, while keeping the data intact.
${printInstruction}
</system>` }];
      raw = "";
    }
  }
  throw lastError ?? new Error("Lightboard returned no usable response.");
}

/** Source cleanLLMResult and onOutput substitutions, applied before decoding. */
export function cleanLightboardOutput(raw: string, forcedInsertion = false): string {
  let text = raw.replace(/```[^\n]*\n?/g, "")
    .replace(/<(?:Thoughts|lb-process)\b[^>]*>[\s\S]*?<\/(?:Thoughts|lb-process)>/gi, "")
    .replaceAll("wfsn", "nsfw");
  if (forcedInsertion) text = text.replaceAll("%", "");
  return text;
}
