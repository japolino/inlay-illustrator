/*! Lightboard 4.5.3 adaptation. Copyright (c) 2026 amonamona. CC BY-NC-SA 4.0. See references/v453/README.md and THIRD_PARTY_NOTICES.md. */
import type { Config } from "../../shared/config.js";
import type { V376CompiledShot, V376Shot } from "../v376/types.js";
import type { LightboardCharacter, LightboardDescriptor } from "./types.js";

export const DEFAULT_LIGHTBOARD_PRESET = {
  positivePrefix: "high complexity, year 2024, year 2025,\n\n{prompt}\n\nvery aesthetic, masterpiece, best illustration",
  negativePrefix: "lowres, worst quality, very displeasing, jpeg artifacts"
};
const COMIC_PROMPT = "A one-page manga with few panels of varied sizes. A natural manga page layout with clear panel borders, varied panel sizes, and expressive visual storytelling. Use strong manga impact lines around characters.";
const join = (parts: (string | undefined)[], sep = ", ") => parts.map(p => p?.trim()).filter(Boolean).join(sep);

export function attenuatePrompt(input: string, factor = 0.75): string {
  let end = 0, result = "";
  const segment = (s: string) => /[\p{L}\p{N}]/u.test(s) ? `${factor}::${s.trimEnd()} ::` : s;
  for (const m of input.matchAll(/(-?\d*\.?\d+)::(.*?)::/g)) {
    result += segment(input.slice(end, m.index));
    result += `${Number((Number(m[1]) * factor).toPrecision(6))}::${m[2]!.trim()} ::`;
    end = m.index! + m[0].length;
  }
  return result + segment(input.slice(end));
}

export function descriptorCharacters(desc: LightboardDescriptor): LightboardCharacter[] {
  return desc.panels?.flatMap(p => p.characters) ?? desc.characters ?? [];
}

/** Literal port of compileDescriptor and lightboard.image.applyImagePreset. */
export function compileLightboardDescriptor(desc: LightboardDescriptor, config: Config, paragraph: number, title = ""): V376CompiledShot {
  const comic = Boolean(desc.panels?.length);
  const comfy = config.promptSyntax === "comfyui";
  const native = !comfy && config.promptSeparator === "native";
  const divider = comfy && config.promptSeparator === "newline" ? "\n\n" : " | ";
  const inline = comic ? "\n\n" : ", ";
  const section = comic ? "\n\n" : ",\n\n";
  let setup = comic ? join([config.lightboardPanelLayout === "comic" ? COMIC_PROMPT : "", desc.cast], "\n\n")
    : join([desc.cast, desc.camera, desc.scene]);
  let description = comic ? desc.panels!.map((p, i) => `Panel ${i + 1}: ${p.scene.trim()}`).join("\n") : "";
  if (!comfy && config.lightboardAttenuate) { setup = attenuatePrompt(setup); description = attenuatePrompt(description); }
  const character = (c: LightboardCharacter, panel?: number) => ({ name: c.name,
    prompt: join([join([c.positive, c.description], ". "), panel ? `panel ${panel}` : ""]), negative: c.negative ?? "" });
  const chars = comic ? desc.panels!.flatMap((p, i) => p.characters.map(c => character(c, i + 1)))
    : (desc.characters ?? []).map(c => character(c));
  if (comfy && config.lightboardSeparateCharacters) for (const c of chars) if (!/^the\s/i.test(c.prompt)) c.prompt = `the ${c.prompt}`;
  const charPositive = chars.map(c => c.prompt).join(divider);
  const charNegative = chars.map(c => c.negative).join(divider);
  const preset = config.promptPresets.find(p => p.id === config.activePromptPresetId) ?? DEFAULT_LIGHTBOARD_PRESET;
  let positive = preset.positivePrefix.trim() || "{prompt}";
  let negative = preset.negativePrefix.trim() || "{prompt}";
  const positiveNote = join([config.customPositiveSuffix, desc.slot === undefined && config.lightboardKeyVisualTitle && title
    ? `1.2::A title text of "${title}" is written in the very center of the image:: 0.75::like a movie title or a book title. ::` : ""]);
  const negativeNote = join([config.customNegative, comic ? "framed, outside border" : ""]);
  if (!/\{(?:prompt|setup|description)\}/.test(positive)) positive += ", {prompt}";
  if (positive.includes("{prompt}")) {
    let body = join([setup, positiveNote], inline);
    body = comfy ? join([body, charPositive, description], section) : join([body, description], section);
    positive = positive.replaceAll("{prompt}", body);
    if (!comfy && !native && chars.length) positive += ` | ${charPositive}`;
  } else {
    positive = positive.includes("{setup}") ? positive.replaceAll("{setup}", setup) : join([positive, setup], inline);
    if (comfy) positive = positive.includes("{char}") ? positive.replaceAll("{char}", charPositive) : join([positive, charPositive], "\n\n");
    else positive = positive.replaceAll("{char}", "");
    positive = positive.includes("{description}") ? positive.replaceAll("{description}", description) : join([positive, description], "\n\n");
    // Keep user additions effective for both template forms.
    positive = join([positive, positiveNote], inline);
    if (!comfy && !native && chars.length) positive += ` | ${charPositive}`;
  }
  if (!negative.includes("{prompt}")) negative += ", {prompt}";
  negative = negative.replaceAll("{prompt}", negativeNote);
  if (chars.length && !native) negative += (comfy ? "\n\n" : " | ") + charNegative;
  positive = join([config.customPositivePrefix, positive]);
  const convert = (s: string, positiveChannel = false) => {
    s = s.replace(/\n{3,}/g, "\n\n");
    if (comfy) return s.replace(/(-?\d*\.?\d+)::(.*?)::/g, config.lightboardWeightMode === "convert" ? "($2:$1)" : "$2").replace(/[{}\[\]]/g, "");
    return positiveChannel ? s.replace(/(?<!\\)([()])/g, "\\$1") : s;
  };
  const rawShot: V376Shot = { paragraph, characters: [], scene: desc.scene, lightboard: desc, lightboardTitle: title };
  return { paragraph, prompt: convert(positive, true), negative: convert(negative), corePrompt: setup, rawShot,
    nativeCharacters: native ? chars.map(c => ({ ...c, prompt: convert(c.prompt, true) })) : undefined,
    characterNames: [...new Set(chars.map(c => c.name))], panels: description || undefined };
}
