import type { Config, PerspectiveMode } from "../shared/config.js";
import {
  ContinuityStateSchema,
  IllustrationInputSchema,
  PlannedShotSchema,
  applyContinuityDelta,
  continuityDeltaBetween,
  type ContinuityDelta,
  type ContinuityState,
  type IllustrationInput,
  type PlannedCharacter,
  type PlannedShot,
  type ShotPlan
} from "./domain.js";
import { resolveShotPerspective, cameraViewOf } from "./shot-resolution.js";
import { normalizeScenePayload } from "./scenes.js";
import type {
  CharacterJson,
  CreativeConcept,
  ParsedPayload,
  PreparedParagraph,
  PromptEntry,
  SceneJson,
  ShotJson,
  TerminalVisualStateJson
} from "./types.js";
import { asRecord, cleanArray, cleanString, csvParts, unique } from "./utils.js";

const EMPTY_CONTINUITY: ContinuityState = {
  characters: [],
  environment: { location: "", timeWeather: "", lightingMood: [], backgroundElements: [] },
  place: ""
};

/**
 * Legacy compatibility boundary: converts one repaired full-snapshot parser
 * payload into the canonical typed IllustrationInput. This is the only place
 * legacy scene/shot shapes cross into the domain; everything downstream
 * consumes validated domain values.
 */
export function planFromParsedPayload(
  payload: ParsedPayload,
  previousState: ContinuityState | undefined,
  paragraphs: PreparedParagraph[],
  config: Config,
  conceptSelections: Map<number, CreativeConcept> = new Map(),
  selectedEntries?: PromptEntry[]
): IllustrationInput {
  const validParagraphs = new Set(paragraphs.map((paragraph) => paragraph.parserIndex));
  const selectedByParagraph = selectedEntries
    ? new Map(selectedEntries
      .filter((entry) => entry.placement !== "cover")
      .map((entry) => [entry.parserParagraph, entry] as const))
    : null;
  const seenParagraphs = new Set<number>();
  const normalized = normalizeScenePayload(payload)
    .filter((entry) => validParagraphs.has(entry.parserParagraph)
      && (!selectedByParagraph || selectedByParagraph.has(entry.parserParagraph)))
    .filter((entry) => {
      if (seenParagraphs.has(entry.parserParagraph)) return false;
      seenParagraphs.add(entry.parserParagraph);
      return true;
    })
    .sort((left, right) => left.parserParagraph - right.parserParagraph);

  const initialContinuity = ContinuityStateSchema.parse(previousState || EMPTY_CONTINUITY);
  let current = initialContinuity;
  const deltas: ContinuityDelta[] = [];
  for (const { scene, shot, parserParagraph } of normalized) {
    const snapshot = stateWithShotSnapshot(current, scene, shot);
    const delta = continuityDeltaBetween(current, snapshot, parserParagraph, "before_shot");
    if (delta) {
      deltas.push(delta);
      current = applyContinuityDelta(current, delta);
    }
  }

  const finalSelectedParagraph = normalized.at(-1)?.parserParagraph || 1;
  const terminalParagraph = Math.max(finalSelectedParagraph, positiveParagraph(payload.terminalState?.paragraph) || finalSelectedParagraph);
  const terminalSnapshot = terminalStateFromPayload(payload.terminalState, current);
  const terminalDelta = continuityDeltaBetween(current, terminalSnapshot, terminalParagraph, "after_shot");
  if (terminalDelta) deltas.push(terminalDelta);

  const shots: PlannedShot[] = normalized.map(({ scene, shot, parserParagraph }) => {
    const selection = selectedByParagraph?.get(parserParagraph);
    const perspective = selection
      ? { mode: selection.perspectiveMode, source: selection.perspectiveSource }
      : resolveShotPerspective(shot, config);
    const concept = selection?.creativeConcept || conceptSelections.get(parserParagraph);
    const degradedFromCreative = perspective.mode === "dynamic"
      && cleanString(shot.perspectiveMode).toLowerCase() === "creative"
      && !concept;
    const plan = shotPlanFor(shot, perspective.mode, concept, degradedFromCreative);
    const sharedComposition = sharedCompositionInput(shot);
    return PlannedShotSchema.parse({
      paragraph: parserParagraph,
      plan,
      camera: cameraInput(shot.camera),
      ...(typeof shot.camera === "string" && cleanString(shot.camera)
        ? { cameraText: cleanString(shot.camera) }
        : {}),
      ...(cleanString(shot.situation) ? { situation: cleanString(shot.situation) } : {}),
      ...(cleanString(shot.action) ? { action: cleanString(shot.action) } : {}),
      ...(cleanArray<CharacterJson>(shot.characters).length > 0
        ? { characters: cleanArray<CharacterJson>(shot.characters)
            .map((character) => plannedCharacter(character))
            .filter((character): character is PlannedCharacter => character !== null) }
        : {}),
      ...(sharedComposition ? { sharedComposition } : {}),
      ...(cleanString(shot.supplement) ? { supplement: cleanString(shot.supplement) } : {}),
      ...(cleanString(shot.negative) ? { negative: cleanString(shot.negative) } : {}),
      ...(cleanString(scene.place) ? { place: cleanString(scene.place) } : {})
    });
  });

  return IllustrationInputSchema.parse({
    initialContinuity,
    shots,
    deltas
  });
}

function positiveParagraph(value: unknown): number {
  const match = cleanString(String(value ?? "")).match(/\d+/);
  const parsed = match ? Number(match[0]) : 0;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function environmentState(value: unknown): ContinuityState["environment"] {
  const environment = asRecord(value);
  return {
    location: cleanString(environment.location),
    timeWeather: cleanString(environment.timeWeather),
    lightingMood: cleanArray<string>(environment.lightingMood).map(cleanString).filter(Boolean),
    backgroundElements: cleanArray<string>(environment.backgroundElements).map(cleanString).filter(Boolean)
  };
}

function continuityCharacter(character: CharacterJson): ContinuityState["characters"][number] | null {
  const name = cleanString(character.name);
  if (!name) return null;
  const attireInferred = character.attireInferred === true
    || cleanString(character.attireInferred).toLowerCase() === "true";
  return {
    name,
    label: cleanString(character.label),
    age: cleanString(character.age),
    // Legacy identity is durable and historically folded into appearance.
    appearance: unique(csvParts(character.identity, character.appearance)).join(", "),
    body: cleanString(character.body),
    attire: cleanString(character.attire),
    attireInferred,
    ...(character.sources ? { sources: { ...character.sources } } : {})
  };
}

function stateWithShotSnapshot(current: ContinuityState, scene: SceneJson, shot: ShotJson): ContinuityState {
  const characters = current.characters.map((character) => ({
    ...character,
    ...(character.sources ? { sources: { ...character.sources } } : {})
  }));
  for (const raw of cleanArray<CharacterJson>(shot.characters)) {
    const snapshot = continuityCharacter(raw);
    if (!snapshot) continue;
    const index = characters.findIndex((character) => character.name.toLowerCase() === snapshot.name.toLowerCase());
    if (index < 0) characters.push(snapshot);
    else characters[index] = { ...characters[index], ...snapshot };
  }
  return ContinuityStateSchema.parse({
    ...current,
    characters,
    environment: environmentState(scene.environment),
    place: cleanString(scene.place)
  });
}

function terminalStateFromPayload(
  terminal: TerminalVisualStateJson | undefined,
  fallback: ContinuityState
): ContinuityState {
  if (!terminal || typeof terminal !== "object" || Array.isArray(terminal)) return fallback;
  const characters = cleanArray<CharacterJson>(terminal.characters)
    .map(continuityCharacter)
    .filter((character): character is ContinuityState["characters"][number] => character !== null);
  const environment = environmentState(terminal.environment);
  const place = cleanString(terminal.place);
  const hasSnapshot = characters.length > 0 || place
    || environment.location || environment.timeWeather
    || environment.lightingMood.length > 0 || environment.backgroundElements.length > 0;
  return hasSnapshot
    ? ContinuityStateSchema.parse({ ...fallback, characters, environment, place })
    : fallback;
}

function shotPlanFor(
  shot: { shotPlan?: unknown; action?: unknown; characters?: CharacterJson[] },
  mode: PerspectiveMode,
  concept?: CreativeConcept,
  degradedFromCreative = false
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
    ...(!primaryAction && degradedFromCreative ? { degradedFromCreative: true as const } : {}),
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
    ...(cleanString(character.identity) ? { identity: cleanString(character.identity) } : {}),
    ...(cleanString(character.avatarAppearance) ? { avatarAppearance: cleanString(character.avatarAppearance) } : {}),
    ...(cleanString(character.avatarBody) ? { avatarBody: cleanString(character.avatarBody) } : {}),
    ...(cleanString(character.avatarAttire) ? { avatarAttire: cleanString(character.avatarAttire) } : {}),
    ...(cleanString(character.expression) ? { expression: cleanString(character.expression) } : {}),
    ...(cleanString(character.action) ? { action: cleanString(character.action) } : {}),
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

function sharedCompositionInput(
  shot: { sharedComposition?: unknown }
): { interaction: string[]; spatialRelation: string } | null {
  const record = asRecord(shot.sharedComposition);
  if (Object.keys(record).length === 0 && typeof shot.sharedComposition !== "string") return null;
  const interaction = Array.isArray(record.interaction)
    ? cleanArray<string>(record.interaction).map(cleanString)
    : cleanString(record.interaction) ? csvParts(record.interaction) : [];
  const spatialRelation = cleanString(record.spatialRelation);
  return { interaction, spatialRelation };
}
