import { encode } from "@toon-format/toon";
import { buildLightboardInstructions } from "./instructions.js";
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
  const instruction = buildLightboardInstructions(config, history.map(h => h.descriptors).join("\n\n"), sources.userName, sources.charName);
  const lore = sources.lorebooks ?? [];
  const extra = lore.filter(l => l.title === "lb-xnai.lb.extra").map(l => l.content).join("\n\n");
  const universe = [sources.userInfo, sources.charInfo, ...lore.filter(l => l.title !== "lb-xnai.lb.extra").map(l => l.content)].filter(Boolean).join("\n\n");
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= config.parserRetries; attempt++) {
    throwIfAborted(signal);
    const count = Math.min(config.includeMaxMessages, config.includeMinMessages + attempt);
    const previous = count ? messages.slice(0, targetIndex).filter(m => config.includeUserMessage || m.role === "assistant" || m.role === "char").slice(-count) : [];
    const outbound: V376OutboundMessage[] = [
      { role: "system", content: instruction },
      { role: "user", content: [
        universe ? `<NarrativeUniverseSettings>\n${universe}\n</NarrativeUniverseSettings>` : "",
        appearance ? `<AppearanceReference>\n${appearance}\n</AppearanceReference>` : "",
        previous.length ? `<PreviousContext>\n${previous.map(m => stripInlayContent(String(m.content ?? m.data ?? ""))).join("\n\n")}\n</PreviousContext>` : "",
        `<CurrentContext>\n${targetText}\n</CurrentContext>`,
        [sources.customOverride, extra].filter(Boolean).length ? `<InstructionsOverride>\n${[sources.customOverride, extra].filter(Boolean).join("\n\n")}\n</InstructionsOverride>` : "",
        lastError ? `Correct the previous response error: ${lastError.message}. Return a complete replacement response.` : ""
      ].filter(Boolean).join("\n\n") }
    ];
    try {
      const raw = await (params.llmInvoker ?? defaultSpindleInvoker)(outbound, { connection, config, userId, signal, expectJson: false });
      throwIfAborted(signal);
      const response = parseLightboardResponse(raw, new Set(paragraphs.map((_, i) => i)), config.moduleMode === "comic");
      if (response.scenes.length > config.maxImages) throw new Error(`Return at most ${config.maxImages} scenes.`);
      if (config.lightboardExactQuantity && response.scenes.length < config.minImages) throw new Error(`Return at least ${config.minImages} scenes.`);
      const compiled = response.scenes.map(d => compileLightboardDescriptor(d, config, paragraphs[d.slot!]!.parserIndex, sources.charName));
      if (config.coverImageEnabled && response.keyvis) {
        const cover = compileLightboardDescriptor(response.keyvis, config, paragraphs[0]!.parserIndex, sources.charName);
        Object.assign(cover, { placementType: "cover" }); compiled.unshift(cover);
      }
      if (!compiled.length) throw new Error("No enabled illustrations were returned.");
      const descriptors = encode(response);
      const entry = { messageId, descriptors };
      const retain = (entries: typeof history) => [...entries.filter(h => h.messageId !== messageId), entry].slice(-Math.max(1, config.characterContextDepth));
      state.lightboardHistory = retain(state.lightboardHistory ?? []);
      if (typeof spindle !== "undefined" && spindle.userStorage) await updateState(chatId, userId, current => { current.lightboardHistory = retain(current.lightboardHistory ?? []); });
      return { payload: { scenes: compiled.filter(c => c.rawShot.lightboard?.slot !== undefined).map(c => ({ place: c.rawShot.scene ?? "", shots: [c.rawShot] })) }, compiled };
    } catch (e) {
      throwIfAborted(signal); lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Lightboard returned no usable response.");
}
