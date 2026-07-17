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
        const scene: SceneJson = { ...rawScene, place: parentPlace, shots: [shot] };
        normalized.push({ scene, shot, parserParagraph });
      }
      continue;
    }

    const parserParagraph = parseParagraphNumber(rawScene.paragraph);
    if (!parserParagraph) continue;
    const situation = cleanString(rawScene.situation) || parentPlace;
    const shot: ShotJson = { ...rawScene, paragraph: parserParagraph, situation };
    const scene: SceneJson = { place: parentPlace, shots: [shot] };
    normalized.push({ scene, shot, parserParagraph });
  }
  return normalized;
}

function normalizedVisualValue(value: unknown): string {
  return cleanString(value).replace(/\s+/g, " ").toLowerCase();
}

export function exactVisualKey(entry: NormalizedScene): string {
  const environment = entry.scene.environment || {};
  return JSON.stringify({
    paragraph: entry.parserParagraph,
    camera: normalizedVisualValue(entry.shot.camera),
    situation: normalizedVisualValue(entry.shot.situation),
    sceneAction: normalizedVisualValue(entry.scene.action),
    shotAction: normalizedVisualValue(entry.shot.action),
    characters: cleanArray<CharacterJson>(entry.shot.characters).map((character) => ({
      expression: normalizedVisualValue(character.expression),
      action: normalizedVisualValue(character.action),
      composition: normalizedVisualValue(character.composition)
    })),
    sharedComposition: normalizedVisualValue(entry.shot.sharedComposition || entry.shot.supplement),
    environment: {
      location: normalizedVisualValue(environment.location),
      timeWeather: normalizedVisualValue(environment.timeWeather),
      lightingMood: cleanArray<unknown>(environment.lightingMood).map(normalizedVisualValue),
      backgroundElements: cleanArray<unknown>(environment.backgroundElements).map(normalizedVisualValue)
    }
  });
}

export function selectPromptEntries(payload: ParsedPayload, paragraphs: PreparedParagraph[], config: Config): PromptEntry[] {
  const normalized = normalizeScenePayload(payload);
  const paragraphMap = new Map(paragraphs.map((paragraph) => [paragraph.parserIndex, paragraph]));
  const valid = normalized.filter((entry) => paragraphMap.has(entry.parserParagraph));
  let distinct: NormalizedScene[];
  if (config.mode === "asset") {
    const seenParagraphs = new Set<number>();
    distinct = valid.filter((entry) => {
      if (seenParagraphs.has(entry.parserParagraph)) return false;
      seenParagraphs.add(entry.parserParagraph);
      return true;
    });
  } else {
    const seenVisuals = new Set<string>();
    distinct = valid.filter((entry) => {
      const key = exactVisualKey(entry);
      if (seenVisuals.has(key)) return false;
      seenVisuals.add(key);
      return true;
    });
  }
  const limit = config.mode === "asset" ? paragraphs.length : config.maxImages;
  const selected = distinct
    .slice(0, limit)
    .map((entry, modelPriority) => ({ entry, modelPriority }))
    .sort((left, right) => left.entry.parserParagraph - right.entry.parserParagraph || left.modelPriority - right.modelPriority)
    .map(({ entry }) => entry);
  const prompts: PromptEntry[] = [];
  for (const entry of selected) {
    const paragraph = paragraphMap.get(entry.parserParagraph);
    if (!paragraph) continue;
    const prompt = assemblePrompt(entry.scene, entry.shot, config, entry.parserParagraph, paragraph.originalIndex);
    if (renderPrompt(prompt.prompt, config.promptSyntax)) prompts.push(prompt);
  }
  logStage(config, "illustration_candidates_selected", {
    candidateCount: normalized.length,
    validCandidateCount: valid.length,
    distinctCandidateCount: distinct.length,
    selectedCount: prompts.length,
    selectedParagraphs: selected.map((entry) => entry.parserParagraph),
    cameraTags: selected.map((entry) => cleanString(entry.shot.camera))
  });
  return prompts;
}
