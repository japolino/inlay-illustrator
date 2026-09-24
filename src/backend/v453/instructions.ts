/*! Lightboard 4.5.3 adaptation. Copyright (c) 2026 amonamona. CC BY-NC-SA 4.0. See references/v453/README.md and THIRD_PARTY_NOTICES.md. */
import { BACKEND_PROMPTS } from "./backend-prompts.js";
import type { Config } from "../../shared/config.js";
import { LIGHTBOARD_SOURCE } from "./data.js";
import { renderLightboardTemplate } from "./template.js";

export function lightboardBooks(config: Config, history = "", user = "User", char = "Character"): (name: string) => string {
  const values: Record<string, string> = {
    "lb-xnai.description": String(["high", "low", "full"].indexOf(config.lightboardDescription)),
    "lb-xnai.appearance": String(["reference", "locked", "closed"].indexOf(config.lightboardAppearance)),
    "lb-xnai.camera": String(config.lightboardCamera),
    "lb-xnai.characters": String(config.moduleMode === "asset" ? 1 : config.maxCharacters),
    "lb-xnai.focus": config.lightboardFocus,
    "lb-xnai.direction": config.lightboardDirection,
    "lb-xnai.scene.quantity": `${config.minImages}-${config.maxImages}`,
    "lb-xnai.scene.quantityexact": config.lightboardExactQuantity ? "1" : "0",
    "lb-xnai.scene.comic": config.moduleMode === "comic" ? config.lightboardPanelLayout === "comic" ? "1" : "2" : "0",
    "lb-xnai.kv.off": config.coverImageEnabled ? "0" : "1",
    "lb-xnai.context": config.characterTagContextEnabled ? "1" : "0",
    "lb-xnai-history": history || "null",
    "lb-xnai.jb": String(["none", "memoir", "authority"].indexOf(config.lightboardJailbreak)),
    "lb-xnai.forcedinsertion": config.lightboardForcedInsertion ? "1" : "0",
    "lb-xnai.japanese": config.lightboardJapanese ? "1" : "0",
    "lb-xnai.thoughts": String(["draft", "internal", "off"].indexOf(config.lightboardThoughts)),
    "lb-xnai.nsfw": config.nsfwInstructions ? "1" : "0", user, char
  };
  const read = (name: string, depth = 0): string => {
    if (depth > 8) throw new Error("Circular Lightboard instruction dependency.");
    const source = LIGHTBOARD_SOURCE[name];
    if (source === undefined) throw new Error(`Missing Lightboard instruction ${name}.`);
    return renderLightboardTemplate(source, values).replace(/<!--\s*lb:require:([^\s]+)\s*-->/g, (_, name: string) => read(name, depth + 1));
  };
  return name => read(name).trim();
}

/** Source outro; kept after the narrative log, as in the core runtime. */
export function buildLightboardInstructions(config: Config, history = "", user = "User", char = "Character"): string {
  const read = lightboardBooks(config, history, user, char);
  const thoughts = config.lightboardThoughts === "off" ? "" : read("lb-xnai.lb.thoughts");
  const draft = config.lightboardThoughts === "draft" && thoughts !== "";
  const guide = config.lightboardThoughts === "internal" ? formatSource(BACKEND_PROMPTS.THOUGHTS_GUIDELINE, thoughts) : "";
  return guide + formatSource(BACKEND_PROMPTS.OUTPUT_INST,
    draft ? thoughts + "\n\nPut the above step-by-step process into `<lb-process>` block." : "",
    (draft ? "<lb-process>\n(process)\n</lb-process>\n\n" : "") + read("lb-xnai.lb.format"),
    read("lb-xnai.lb"));
}

export function formatSource(template: string, ...values: string[]): string {
  let index = 0;
  return template.replace(/%s/g, () => values[index++] ?? "");
}
