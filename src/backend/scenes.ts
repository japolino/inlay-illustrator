import type { Config } from "../shared/config.js";
import { isIdentitySafeCreativeConcept } from "./creative.js";
import { logStage } from "./logging.js";
import { assemblePrompt, renderPrompt } from "./prompt.js";
import type { CharacterJson, CreativeConcept, NormalizedScene, ParsedPayload, PreparedParagraph, PromptEntry, SceneJson, ShotJson } from "./types.js";
import { cleanArray, cleanString } from "./utils.js";

function parseParagraphNumber(value: unknown): number | null {
  const match = String(value ?? "").match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Restores paragraph references the parser placed at scene level, or omitted
 * when the request exposed exactly one possible source paragraph.
 */
export function recoverSceneParagraphs(payload: ParsedPayload, fallbackParagraph?: number): ParsedPayload {
  const scenes = cleanArray<SceneJson>(payload.scenes).map((rawScene) => {
    const sceneParagraph = parseParagraphNumber(rawScene.paragraph) || fallbackParagraph;
    const shots = cleanArray<ShotJson>(rawScene.shots);
    if (shots.length > 0) {
      return {
        ...rawScene,
        shots: shots.map((shot) => parseParagraphNumber(shot.paragraph) || !sceneParagraph
          ? shot
          : { ...shot, paragraph: sceneParagraph })
      };
    }
    return parseParagraphNumber(rawScene.paragraph) || !sceneParagraph
      ? rawScene
      : { ...rawScene, paragraph: sceneParagraph };
  });
  return { ...payload, scenes };
}

function dedupeCharacters(characters: CharacterJson[] | undefined): CharacterJson[] | undefined {
  if (!Array.isArray(characters)) return characters;
  const seen = new Set<string>();
  return characters.filter((character) => {
    const name = cleanString(character.name).toLowerCase();
    const key = `${name}\u0000${normalizedVisualValue(character)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Removes only exact duplicate character objects emitted within the same shot. */
export function dedupeExactShotCharacters(payload: ParsedPayload): ParsedPayload {
  return {
    ...payload,
    scenes: cleanArray<SceneJson>(payload.scenes).map((scene) => {
      const next: SceneJson = { ...scene };
      if (Array.isArray(scene.characters)) next.characters = dedupeCharacters(scene.characters);
      if (Array.isArray(scene.shots)) {
        next.shots = scene.shots.map((shot) => Array.isArray(shot.characters)
          ? { ...shot, characters: dedupeCharacters(shot.characters) }
          : { ...shot });
      }
      return next;
    })
  };
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
  const normalize = (candidate: unknown): unknown => {
    if (typeof candidate === "string") return candidate.replace(/\s+/g, " ").trim().toLowerCase();
    if (Array.isArray(candidate)) return candidate.map(normalize);
    if (candidate && typeof candidate === "object") {
      return Object.fromEntries(Object.entries(candidate as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return candidate ?? "";
  };
  const normalized = normalize(value);
  return typeof normalized === "string" ? normalized : JSON.stringify(normalized);
}

export function exactVisualKey(entry: NormalizedScene): string {
  const environment = entry.scene.environment || {};
  return JSON.stringify({
    paragraph: entry.parserParagraph,
    perspectiveMode: normalizedVisualValue(entry.shot.perspectiveMode),
    camera: normalizedVisualValue(entry.shot.camera),
    situation: normalizedVisualValue(entry.shot.situation),
    sceneAction: normalizedVisualValue(entry.scene.action),
    shotAction: normalizedVisualValue(entry.shot.action),
    characters: cleanArray<CharacterJson>(entry.shot.characters).map((character) => ({
      expression: normalizedVisualValue(character.expression),
      action: normalizedVisualValue(character.action),
      composition: normalizedVisualValue(character.composition),
      renderScope: normalizedVisualValue(character.renderScope),
      visibleTags: normalizedVisualValue(character.visibleTags)
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

export function selectPromptEntries(
  payload: ParsedPayload,
  paragraphs: PreparedParagraph[],
  config: Config,
  creativeConcepts: Map<number, CreativeConcept> = new Map(),
  creativeCandidates: CreativeConcept[] = []
): PromptEntry[] {
  const normalized = normalizeScenePayload(payload);
  const paragraphMap = new Map(paragraphs.map((paragraph) => [paragraph.parserIndex, paragraph]));
  const valid = normalized.filter((entry) => paragraphMap.has(entry.parserParagraph));
  const seenVisuals = new Set<string>();
  const distinct = valid.filter((entry) => {
    const key = exactVisualKey(entry);
    if (seenVisuals.has(key)) return false;
    seenVisuals.add(key);
    return true;
  });
  const seenParagraphs = new Set<number>();
  const uniqueParagraphs = distinct.filter((entry) => {
    const sourceParagraph = paragraphMap.get(entry.parserParagraph)?.originalIndex ?? entry.parserParagraph;
    if (seenParagraphs.has(sourceParagraph)) return false;
    seenParagraphs.add(sourceParagraph);
    return true;
  });
  const limit = config.maxImages;
  const selected = uniqueParagraphs
    .slice(0, limit)
    .map((entry, modelPriority) => ({ entry, modelPriority }))
    .sort((left, right) => left.entry.parserParagraph - right.entry.parserParagraph || left.modelPriority - right.modelPriority)
    .map(({ entry }) => entry);
  const maxAdaptiveCreative = selected.length > 1 ? Math.ceil(selected.length / 2) : 1;
  const safeCreativeConcepts = new Map([...creativeConcepts].filter(([, concept]) => isIdentitySafeCreativeConcept(concept)));
  const adaptiveCreativeAllowed = new Set(config.adaptiveMode
    ? selected
      .filter((entry) => cleanString(entry.shot.perspectiveMode).toLowerCase() === "creative" && safeCreativeConcepts.has(entry.parserParagraph))
      .sort((left, right) => (safeCreativeConcepts.get(right.parserParagraph)?.score || 0)
        - (safeCreativeConcepts.get(left.parserParagraph)?.score || 0))
      .slice(0, maxAdaptiveCreative)
    : []);
  const prompts: PromptEntry[] = [];
  for (const entry of selected) {
    const paragraph = paragraphMap.get(entry.parserParagraph);
    if (!paragraph) continue;
    const concept = safeCreativeConcepts.get(entry.parserParagraph);
    const requestedPerspective = cleanString(entry.shot.perspectiveMode).toLowerCase();
    const shot = config.adaptiveMode && requestedPerspective === "creative"
      && (!concept || !adaptiveCreativeAllowed.has(entry))
      ? { ...entry.shot, perspectiveMode: "dynamic" }
      : entry.shot;
    const prompt = assemblePrompt(entry.scene, shot, config, entry.parserParagraph, paragraph.originalIndex, concept);
    prompt.creativeCandidates = creativeCandidates.filter((candidate) => candidate.paragraph === entry.parserParagraph);
    if (renderPrompt(prompt.prompt, config.promptSyntax)) prompts.push(prompt);
  }
  logStage(config, "illustration_candidates_selected", {
    candidateCount: normalized.length,
    validCandidateCount: valid.length,
    distinctCandidateCount: distinct.length,
    uniqueParagraphCandidateCount: uniqueParagraphs.length,
    selectedCount: prompts.length,
    selectedParagraphs: selected.map((entry) => entry.parserParagraph),
    perspectives: prompts.map((entry) => ({ mode: entry.perspectiveMode, source: entry.perspectiveSource })),
    cameraTags: selected.map((entry) => normalizedVisualValue(entry.shot.camera))
  });
  return prompts;
}
