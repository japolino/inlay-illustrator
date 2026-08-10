import type { Config } from "../shared/config.js";
import {
  ContinuityStateSchema,
  IllustrationInputSchema,
  PlannedShotSchema,
  type ContinuityState,
  type IllustrationInput,
  type PlannedCharacter,
  type PlannedShot,
  type ShotPlan
} from "./domain.js";
import { resolveShotPerspective, cameraViewOf } from "./shot-resolution.js";
import { normalizeScenePayload } from "./scenes.js";
import type { CharacterJson, CreativeConcept, ParsedPayload, PreparedParagraph } from "./types.js";
import { asRecord, cleanArray, cleanString, csvParts } from "./utils.js";

/**
 * Legacy compatibility boundary: converts one repaired full-snapshot parser
 * payload into the canonical typed IllustrationInput. This is the only place
 * legacy scene/shots shapes cross into the domain; everything downstream
 * consumes validated domain values.
 */
export function planFromParsedPayload(
  payload: ParsedPayload,
  previousState: ContinuityState | undefined,
  paragraphs: PreparedParagraph[],
  config: Config,
  conceptSelections: Map<number, CreativeConcept> = new Map()
): IllustrationInput {
  const validParagraphs = new Set(paragraphs.map((paragraph) => paragraph.parserIndex));
  const normalized = normalizeScenePayload(payload).filter((entry) => validParagraphs.has(entry.parserParagraph));

  const initialContinuity = previousState
    ? ContinuityStateSchema.parse(previousState)
    : baselineFromPayload(payload);

  const shots: PlannedShot[] = normalized.map(({ scene, shot, parserParagraph }) => {
    const perspective = resolveShotPerspective(shot, config);
    const plan = shotPlanFor(shot, perspective.mode, conceptSelections.get(parserParagraph));
    return PlannedShotSchema.parse({
      paragraph: parserParagraph,
      plan,
      camera: cameraInput(shot.camera),
      ...(cleanString(shot.situation) ? { situation: cleanString(shot.situation) } : {}),
      ...(cleanArray<CharacterJson>(shot.characters).length > 0
        ? { characters: cleanArray<CharacterJson>(shot.characters)
            .map((character) => plannedCharacter(character))
            .filter((character): character is PlannedCharacter => character !== null) }
        : {}),
      ...(sharedCompositionInput(shot) ? { sharedComposition: sharedCompositionInput(shot) } : {}),
      ...(cleanString(shot.negative) ? { negative: cleanString(shot.negative) } : {}),
      ...(cleanString(scene.place) ? { place: cleanString(scene.place) } : {})
    });
  });

  return IllustrationInputSchema.parse({
    initialContinuity,
    shots,
    deltas: []
  });
}

function baselineFromPayload(payload: ParsedPayload): ContinuityState {
  const first = normalizeScenePayload(payload)[0];
  const environment = asRecord(first?.scene.environment);
  const characters = cleanArray<CharacterJson>(first?.shot.characters).map((character) => ({
    name: cleanString(character.name) || "Unknown",
    label: cleanString(character.label),
    age: cleanString(character.age),
    appearance: cleanString(character.appearance),
    body: cleanString(character.body),
    attire: cleanString(character.attire),
    attireInferred: Boolean(character.attireInferred),
    ...(character.sources ? { sources: character.sources } : {})
  }));
  return ContinuityStateSchema.parse({
    characters,
    environment: {
      location: cleanString(environment.location),
      timeWeather: cleanString(environment.timeWeather),
      lightingMood: cleanArray<string>(environment.lightingMood).map(cleanString),
      backgroundElements: cleanArray<string>(environment.backgroundElements).map(cleanString)
    },
    place: cleanString(first?.scene.place)
  });
}

function shotPlanFor(
  shot: { shotPlan?: unknown; action?: unknown; characters?: CharacterJson[] },
  mode: "creative" | "static" | "dynamic" | "asset",
  concept?: CreativeConcept
): ShotPlan {
  if (mode === "static") return { mode: "static" };
  if (mode === "asset") return { mode: "asset" };
  if (mode === "creative") {
    return concept ? { mode: "creative", concept: {
      id: concept.id,
      paragraph: concept.paragraph,
      subjectType: concept.subjectType || "object",
      anchor: concept.anchor,
      concept: concept.concept,
      renderScope: concept.renderScope,
      camera: concept.camera,
      visibleCues: concept.visibleCues,
      score: concept.score
    } } : { mode: "creative" };
  }
  const plan = asRecord(shot.shotPlan);
  const primaryAction = cleanString(plan.primaryAction)
    || (typeof shot.shotPlan === "string" ? cleanString(shot.shotPlan) : "")
    || cleanString(shot.action)
    || (cleanArray<CharacterJson>(shot.characters)
      .map((character) => asRecord(character.composition).actions)
      .flatMap((actions) => cleanArray<string>(actions))
      .map(cleanString)
      .find(Boolean) || "");
  return {
    mode: "dynamic",
    ...(primaryAction ? { primaryAction } : {}),
    ...(cleanString(plan.secondaryCue) ? { secondaryCue: cleanString(plan.secondaryCue) } : {}),
    ...(cleanString(plan.staging) ? { staging: cleanString(plan.staging) } : {})
  } as ShotPlan;
}

function cameraInput(camera: unknown): Record<string, unknown> {
  const record = asRecord(camera);
  if (Object.keys(record).length === 0) {
    const view = cameraViewOf(camera);
    return { framing: view.framing, angle: view.angle, perspective: view.perspective, focus: [] };
  }
  return {
    ...(cleanString(record.framing) ? { framing: cleanString(record.framing) } : {}),
    ...(cleanString(record.angle) ? { angle: cleanString(record.angle) } : {}),
    ...(cleanString(record.perspective) ? { perspective: cleanString(record.perspective) } : {}),
    ...(Array.isArray(record.focus)
      ? { focus: cleanArray<string>(record.focus).map(cleanString) }
      : cleanString(record.focus)
        ? { focus: csvParts(record.focus) }
        : {})
  };
}

function plannedCharacter(character: CharacterJson): PlannedCharacter | null {
  const name = cleanString(character.name);
  if (!name) return null;
  const composition = asRecord(character.composition);
  return {
    name,
    ...(cleanString(character.expression) ? { expression: cleanString(character.expression) } : {}),
    ...(Object.keys(composition).length > 0
      ? {
        composition: {
          position: cleanString(composition.position),
          pose: cleanString(composition.pose),
          actions: Array.isArray(composition.actions)
            ? cleanArray<string>(composition.actions).map(cleanString)
            : cleanString(composition.actions) ? csvParts(composition.actions) : [],
          gaze: cleanString(composition.gaze)
        }
      }
      : {}),
    ...(cleanString(character.renderScope) ? { renderScope: cleanString(character.renderScope) } : {}),
    ...(cleanArray<string>(character.visibleTags).length > 0 || cleanString(character.visibleTags)
      ? { visibleTags: cleanArray<string>(character.visibleTags).map(cleanString).length > 0
          ? cleanArray<string>(character.visibleTags).map(cleanString)
          : csvParts(character.visibleTags) }
      : {})
  };
}

function sharedCompositionInput(shot: { sharedComposition?: unknown; supplement?: unknown }): { interaction?: string[]; spatialRelation?: string } | null {
  const record = asRecord(shot.sharedComposition);
  if (Object.keys(record).length === 0 && typeof shot.sharedComposition !== "string" && !cleanString(shot.supplement)) return null;
  const interaction = Array.isArray(record.interaction)
    ? cleanArray<string>(record.interaction).map(cleanString)
    : cleanString(record.interaction) ? csvParts(record.interaction) : [];
  const spatialRelation = cleanString(record.spatialRelation);
  return { ...(interaction.length > 0 ? { interaction } : {}), ...(spatialRelation ? { spatialRelation } : {}) };
}
