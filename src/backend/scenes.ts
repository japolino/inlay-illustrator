import type { Config } from "../shared/config.js";
import { logStage } from "./logging.js";
import { assemblePrompt, renderPrompt } from "./prompt.js";
import type { CharacterJson, NormalizedScene, ParsedPayload, PreparedParagraph, PromptEntry, SceneJson, ShotJson } from "./types.js";
import { cleanArray, cleanString } from "./utils.js";

function parseParagraphNumber(value: unknown): number | null {
  const match = String(value ?? "").match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function recoverSceneParagraphs(payload: ParsedPayload, fallbackParagraph?: number): ParsedPayload {
  return {
    ...payload,
    scenes: cleanArray<SceneJson>(payload.scenes).map((scene) => {
      const inherited = parseParagraphNumber(scene.paragraph) || fallbackParagraph;
      if (!Array.isArray(scene.shots)) return parseParagraphNumber(scene.paragraph) || !inherited
        ? scene
        : { ...scene, paragraph: inherited };
      return {
        ...scene,
        shots: scene.shots.map((shot) => parseParagraphNumber(shot.paragraph) || !inherited
          ? shot
          : { ...shot, paragraph: inherited })
      };
    })
  };
}

function normalizedValue(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().toLowerCase();
  if (Array.isArray(value)) return JSON.stringify(value.map(normalizedValue));
  if (value && typeof value === "object") {
    return JSON.stringify(Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))));
  }
  return String(value ?? "");
}

export function dedupeExactShotCharacters(payload: ParsedPayload): ParsedPayload {
  const dedupe = (characters: CharacterJson[] | undefined): CharacterJson[] | undefined => {
    if (!Array.isArray(characters)) return characters;
    const seen = new Set<string>();
    return characters.filter((character) => {
      const key = normalizedValue(character);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  return {
    ...payload,
    scenes: cleanArray<SceneJson>(payload.scenes).map((scene) => ({
      ...scene,
      ...(Array.isArray(scene.characters) ? { characters: dedupe(scene.characters) } : {}),
      ...(Array.isArray(scene.shots)
        ? { shots: scene.shots.map((shot) => ({ ...shot, characters: dedupe(shot.characters) })) }
        : {})
    }))
  };
}

/** Compatibility no-op retained for legacy callers; v3.5 has no atomic composition schema. */
export function normalizeAtomicCompositionTerms(payload: ParsedPayload): ParsedPayload {
  return payload;
}

export function normalizeScenePayload(payload: ParsedPayload): NormalizedScene[] {
  const normalized: NormalizedScene[] = [];
  for (const rawScene of cleanArray<SceneJson>(payload.scenes)) {
    const parentPlace = cleanString(rawScene.place);
    const shots = cleanArray<ShotJson>(rawScene.shots);
    if (shots.length > 0) {
      for (const rawShot of shots) {
        const parserParagraph = parseParagraphNumber(rawShot.paragraph);
        if (!parserParagraph) continue;
        const shot: ShotJson = { ...rawShot, paragraph: parserParagraph };
        normalized.push({ scene: { ...rawScene, place: parentPlace, shots: [shot] }, shot, parserParagraph });
      }
      continue;
    }
    const parserParagraph = parseParagraphNumber(rawScene.paragraph);
    if (!parserParagraph) continue;
    const shot: ShotJson = { ...rawScene, paragraph: parserParagraph, situation: cleanString(rawScene.situation) || parentPlace };
    normalized.push({ scene: { place: parentPlace, shots: [shot] }, shot, parserParagraph });
  }
  return normalized;
}

export function exactVisualKey(entry: NormalizedScene): string {
  return JSON.stringify({
    paragraph: entry.parserParagraph,
    place: normalizedValue(entry.scene.place),
    camera: normalizedValue(entry.shot.camera),
    situation: normalizedValue(entry.shot.situation),
    characters: normalizedValue(entry.shot.characters),
    supplement: normalizedValue(entry.shot.supplement),
    quote: normalizedValue(entry.shot.quote)
  });
}

export function selectPromptEntries(
  payload: ParsedPayload,
  paragraphs: PreparedParagraph[],
  config: Config
): PromptEntry[] {
  const paragraphMap = new Map(paragraphs.map((paragraph) => [paragraph.parserIndex, paragraph]));
  const byParagraph = new Map<number, NormalizedScene>();
  for (const entry of normalizeScenePayload(payload)) {
    if (paragraphMap.has(entry.parserParagraph)) byParagraph.set(entry.parserParagraph, entry);
  }
  const selected = [...byParagraph.values()]
    .sort((left, right) => left.parserParagraph - right.parserParagraph)
    .slice(0, config.maxImages);
  const prompts = selected.flatMap((entry) => {
    const paragraph = paragraphMap.get(entry.parserParagraph);
    if (!paragraph) return [];
    const prompt = assemblePrompt(entry.scene, entry.shot, config, entry.parserParagraph, paragraph.originalIndex);
    return renderPrompt(prompt.prompt, config.promptSyntax) ? [prompt] : [];
  });
  logStage(config, "illustration_candidates_selected", {
    candidateCount: normalizeScenePayload(payload).length,
    uniqueParagraphCount: byParagraph.size,
    selectedCount: prompts.length,
    selectedParagraphs: selected.map((entry) => entry.parserParagraph),
    mode: config.mode
  });
  return prompts;
}
