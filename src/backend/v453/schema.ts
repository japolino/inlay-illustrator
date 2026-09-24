/*! Lightboard 4.5.3 adaptation. Copyright (c) 2026 amonamona. CC BY-NC-SA 4.0. See references/v453/README.md and THIRD_PARTY_NOTICES.md. */
import { decode } from "@toon-format/toon";
import type { LightboardCharacter, LightboardDescriptor, LightboardResponse } from "./types.js";

/** The source accepts folded description blocks even though these are not TOON. */
export function cleanDescriptionBlocks(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").replace(/⇥|\t/g, "  ").split("\n");
  const result: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)description:\s*[>|][+-]?\s*$/.exec(lines[i]!);
    if (!match) { result.push(lines[i]!); continue; }
    const parts: string[] = [];
    while (i + 1 < lines.length) {
      const next = lines[i + 1]!;
      if (!next.trim()) { i++; continue; }
      if (next.length - next.trimStart().length <= match[1]!.length) break;
      parts.push(next.trim()); i++;
    }
    result.push(`${match[1]}description: ${JSON.stringify(parts.join(" "))}`);
  }
  return result.join("\n");
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a nonempty string.`);
  return value.trim();
}
function characters(value: unknown, label: string): LightboardCharacter[] {
  if (!Array.isArray(value)) throw new Error(`${label}.characters must be an array.`);
  return value.map((raw, i) => {
    const c = object(raw, `${label}.characters[${i}]`);
    if (c.negative !== undefined && typeof c.negative !== "string") throw new Error("Character negative must be a string.");
    return { name: c.name == null ? "" : typeof c.name === "string" ? c.name.trim() : string(c.name, "Character name"), positive: string(c.positive, "Character positive"),
      description: string(c.description, "Character description"), negative: c.negative as string | undefined };
  });
}
export function validateDescriptor(value: unknown, comic: boolean, slotRequired: boolean): LightboardDescriptor {
  const d = object(value, "Descriptor");
  const base: LightboardDescriptor = { cast: string(d.cast, "Cast") };
  if (slotRequired) {
    if (!Number.isInteger(d.slot) || Number(d.slot) < 0) throw new Error("Scene slot must be a nonnegative integer.");
    base.slot = Number(d.slot);
  }
  if (comic) {
    if (!Array.isArray(d.panels) || !d.panels.length) throw new Error("Comic scene needs panels.");
    base.panels = d.panels.map((raw, i) => {
      const p = object(raw, `Panel ${i}`);
      return { scene: string(p.scene, "Panel scene"), characters: characters(p.characters, `Panel ${i}`) };
    });
  } else {
    if (d.panels !== undefined) throw new Error("Individual scenes cannot contain panels.");
    base.camera = string(d.camera, "Camera"); base.scene = string(d.scene, "Scene");
    base.characters = characters(d.characters, "Scene");
  }
  return base;
}

export function parseLightboardResponse(raw: string, slots: Set<number>, comic = false): LightboardResponse {
  const nodes = [...raw.matchAll(/<lb-xnai\b[^>]*>([\s\S]*?)(?:<\/lb-xnai>|$)/g)];
  let body = (nodes.at(-1)?.[1] ?? raw).trim().replace(/^```(?:json|toon)?\s*\n?|\n?```$/g, "");
  body = cleanDescriptionBlocks(body);
  const parsed = object(body.startsWith("{") ? JSON.parse(body) : decode(body), "Lightboard response");
  if (!Array.isArray(parsed.scenes)) throw new Error("Response needs a scenes array.");
  const seen = new Set<number>();
  const scenes = parsed.scenes.map(rawScene => {
    const scene = validateDescriptor(rawScene, comic, true);
    if (!slots.has(scene.slot!)) throw new Error(`Scene slot ${scene.slot} does not exist in the target message.`);
    if (seen.has(scene.slot!)) throw new Error(`Duplicate scene slot ${scene.slot}.`);
    seen.add(scene.slot!); return scene;
  });
  const keyvis = parsed.keyvis == null ? undefined : validateDescriptor(parsed.keyvis, false, false);
  if (!scenes.length && !keyvis) throw new Error("No scenes or key visual returned.");
  return { scenes, keyvis };
}
