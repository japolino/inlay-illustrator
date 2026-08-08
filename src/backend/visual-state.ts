import { normalizeCharacterName } from "./prompt.js";
import { normalizeScenePayload } from "./scenes.js";
import type {
  CharacterJson,
  EnvironmentJson,
  ParsedPayload,
  PreviousVisualCharacter,
  PreviousVisualState,
  SceneJson,
  ShotJson
} from "./types.js";
import { cleanArray, cleanString, compactBlock, csvParts, unique } from "./utils.js";

const PLACEHOLDER_TERM = /\b(?:unknown|unspecified|not specified|not stated|unmentioned|undetermined|n\/?a|default clothing)\b/i;

function cleanTagField(value: unknown): string {
  return unique(csvParts(value)
    .map((tag) => cleanString(tag))
    .filter((tag) => tag && !PLACEHOLDER_TERM.test(tag)))
    .join(", ");
}

function cleanAtomicField(value: unknown): string {
  const cleaned = cleanString(value);
  return cleaned && !PLACEHOLDER_TERM.test(cleaned) ? cleaned : "";
}

function cleanAtomicList(value: unknown): string[] {
  return unique(cleanArray<unknown>(Array.isArray(value) ? value : value === undefined ? [] : [value])
    .flatMap((entry) => csvParts(entry))
    .map((entry) => cleanString(entry))
    .filter((entry) => entry && !PLACEHOLDER_TERM.test(entry)));
}

function inferred(value: unknown): boolean {
  return value === true || cleanString(value).toLowerCase() === "true";
}

function changeSet(value: unknown, allowed: string[]): Set<string> {
  const permitted = new Set(allowed);
  return new Set(cleanArray<unknown>(Array.isArray(value) ? value : value === undefined ? [] : [value])
    .flatMap((entry) => csvParts(entry))
    .map((entry) => cleanString(entry))
    .filter((entry) => permitted.has(entry)));
}

function cleanEnvironment(value: EnvironmentJson | undefined): PreviousVisualState["environment"] {
  return {
    location: cleanAtomicField(value?.location),
    timeWeather: cleanAtomicField(value?.timeWeather),
    lightingMood: cleanAtomicList(value?.lightingMood),
    backgroundElements: cleanAtomicList(value?.backgroundElements)
  };
}

function mergeEnvironment(
  current: PreviousVisualState["environment"],
  previous?: PreviousVisualState["environment"],
  changed = new Set<string>()
): PreviousVisualState["environment"] {
  if (!previous) return current;
  const canonicalLocation = (value: unknown): string => cleanAtomicField(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const currentLocation = canonicalLocation(current.location);
  const previousLocation = canonicalLocation(previous.location);
  const locationBoundary = changed.has("location")
    || Boolean(currentLocation && previousLocation && currentLocation !== previousLocation);
  if (locationBoundary) {
    changed.add("location");
    changed.add("timeWeather");
    changed.add("lightingMood");
    changed.add("backgroundElements");
  }
  const select = <T extends string | string[]>(key: string, currentValue: T, previousValue: T): T => {
    const hasCurrent = Array.isArray(currentValue) ? currentValue.length > 0 : Boolean(currentValue);
    const hasPrevious = Array.isArray(previousValue) ? previousValue.length > 0 : Boolean(previousValue);
    if (locationBoundary && (key === "timeWeather" || key === "lightingMood" || key === "backgroundElements")) {
      return currentValue;
    }
    if (changed.has(key)) return hasCurrent ? currentValue : previousValue;
    return hasPrevious ? previousValue : currentValue;
  };
  return {
    location: select("location", current.location, cleanAtomicField(previous.location)),
    timeWeather: select("timeWeather", current.timeWeather, cleanAtomicField(previous.timeWeather)),
    lightingMood: select("lightingMood", current.lightingMood, cleanAtomicList(previous.lightingMood)),
    backgroundElements: select(
      "backgroundElements",
      current.backgroundElements,
      cleanAtomicList(previous.backgroundElements)
    )
  };
}

function visualCharacter(character: CharacterJson): PreviousVisualCharacter | null {
  const name = normalizeCharacterName(character.name);
  if (!name) return null;
  return {
    name,
    label: cleanTagField(character.label),
    age: cleanTagField(character.age),
    // Fold legacy identity into the rendered rolling appearance baseline.
    appearance: cleanTagField(unique(csvParts(character.identity, character.appearance)).join(", ")),
    body: cleanTagField(character.body),
    attire: cleanTagField(character.attire),
    attireInferred: inferred(character.attireInferred),
    ...(character.sources ? { sources: { ...character.sources } } : {})
  };
}

function inheritCharacter(
  raw: CharacterJson,
  previousCharacters: Map<string, PreviousVisualCharacter>,
  explicitCurrentWins = false
): CharacterJson {
  const current = visualCharacter(raw);
  const name = current?.name || normalizeCharacterName(raw.name);
  const previous = name ? previousCharacters.get(name.toLowerCase()) : undefined;
  const currentAttire = cleanTagField(raw.attire);
  const changes = changeSet(raw.visualChanges, ["age", "appearance", "body", "attire"]);
  const stableField = (key: string, currentValue: string, previousValue = ""): string => {
    if (!previousValue) return currentValue;
    if (explicitCurrentWins && currentValue) return currentValue;
    if (changes.has(key)) return currentValue || previousValue;
    return previousValue;
  };
  const next: CharacterJson = {
    ...raw,
    label: previous?.label || cleanTagField(raw.label),
    age: stableField("age", cleanTagField(raw.age), previous?.age),
    appearance: stableField("appearance", cleanTagField(raw.appearance), previous?.appearance),
    body: stableField("body", cleanTagField(raw.body), previous?.body),
    attire: stableField("attire", currentAttire, previous?.attire),
    attireInferred: !previous
      ? inferred(raw.attireInferred)
      : (explicitCurrentWins || changes.has("attire")) && currentAttire
        ? inferred(raw.attireInferred)
        : previous.attireInferred,
    sources: {
      // Preserve origin across rolling continuity. A narrative override does
      // not become canonical merely because it survived into the next turn.
      age: previous && !changes.has("age") ? (previous.sources?.age ?? "previous_memory") : raw.sources?.age,
      appearance: previous && !changes.has("appearance") ? (previous.sources?.appearance ?? "previous_memory") : raw.sources?.appearance,
      body: previous && !changes.has("body") ? (previous.sources?.body ?? "previous_memory") : raw.sources?.body,
      attire: previous && !changes.has("attire") ? (previous.sources?.attire ?? "previous_memory") : raw.sources?.attire
    }
  };
  const remembered = visualCharacter(next);
  if (remembered) previousCharacters.set(remembered.name.toLowerCase(), remembered);
  return next;
}

function inheritShot(
  raw: ShotJson,
  previousCharacters: Map<string, PreviousVisualCharacter>
): ShotJson {
  return {
    ...raw,
    characters: cleanArray<CharacterJson>(raw.characters).map((character) => inheritCharacter(character, previousCharacters))
  };
}

/**
 * Removes nonvisual placeholder values and applies the immediately previous
 * generated visual state. Stable fields remain locked unless the parser marks
 * an explicit current-source change.
 */
export function applyPreviousVisualState(
  payload: ParsedPayload,
  previous?: PreviousVisualState
): ParsedPayload {
  const previousCharacters = new Map(cleanArray<PreviousVisualCharacter>(previous?.characters)
    .map((character) => [normalizeCharacterName(character.name).toLowerCase(), character] as const)
    .filter(([name]) => Boolean(name)));
  let carriedEnvironment = previous ? cleanEnvironment(previous.environment) : undefined;
  let carriedPlace = previous ? cleanAtomicField(previous.place) : "";

  const scenes = cleanArray<SceneJson>(payload.scenes).map((rawScene) => {
    const environmentChanges = changeSet(
      rawScene.environmentChanges,
      ["location", "timeWeather", "lightingMood", "backgroundElements", "place"]
    );
    const environment = mergeEnvironment(cleanEnvironment(rawScene.environment), carriedEnvironment, environmentChanges);
    carriedEnvironment = environment;
    const currentPlace = cleanTagField(rawScene.place);
    const placeChanged = environmentChanges.has("place")
      || Boolean(currentPlace && carriedPlace && currentPlace.toLowerCase() !== carriedPlace.toLowerCase());
    const place = placeChanged ? currentPlace || carriedPlace : carriedPlace || currentPlace;
    carriedPlace = place;
    const shots = cleanArray<ShotJson>(rawScene.shots);
    if (shots.length > 0) {
      return {
        ...rawScene,
        place,
        environment,
        shots: shots.map((shot) => inheritShot(shot, previousCharacters))
      };
    }
    return {
      ...inheritShot(rawScene, previousCharacters),
      place,
      environment
    };
  });

  const rawTerminal = payload.terminalState;
  if (!rawTerminal || typeof rawTerminal !== "object" || Array.isArray(rawTerminal)) return { ...payload, scenes };
  const terminalChanges = changeSet(
    rawTerminal.environmentChanges,
    ["location", "timeWeather", "lightingMood", "backgroundElements", "place"]
  );
  const terminalEnvironment = mergeEnvironment(
    cleanEnvironment(rawTerminal.environment),
    previous ? cleanEnvironment(previous.environment) : undefined,
    terminalChanges
  );
  const terminalPlaceCurrent = cleanTagField(rawTerminal.place);
  const previousPlace = previous ? cleanAtomicField(previous.place) : "";
  const terminalPlaceChanged = terminalChanges.has("place")
    || Boolean(terminalPlaceCurrent && previousPlace
      && terminalPlaceCurrent.toLowerCase() !== previousPlace.toLowerCase());
  const terminalPlace = terminalPlaceChanged
    ? terminalPlaceCurrent || previousPlace
    : previousPlace || terminalPlaceCurrent;
  const terminalCharacters = new Map(cleanArray<PreviousVisualCharacter>(previous?.characters)
    .map((character) => [normalizeCharacterName(character.name).toLowerCase(), character] as const)
    .filter(([name]) => Boolean(name)));
  return {
    ...payload,
    scenes,
    terminalState: {
      ...rawTerminal,
      place: terminalPlace,
      environment: terminalEnvironment,
      characters: cleanArray<CharacterJson>(rawTerminal.characters)
        .map((character) => inheritCharacter(character, terminalCharacters, true))
    }
  };
}

export function buildPreviousVisualState(
  payload: ParsedPayload,
  selectedParserParagraphs: number[]
): PreviousVisualState | null {
  const terminal = payload.terminalState;
  if (terminal && typeof terminal === "object" && !Array.isArray(terminal)) {
    const characters = cleanArray<CharacterJson>(terminal.characters)
      .map(visualCharacter)
      .filter((character): character is PreviousVisualCharacter => Boolean(character));
    const environment = cleanEnvironment(terminal.environment);
    const place = cleanTagField(terminal.place);
    const hasEnvironment = Boolean(environment.location || environment.timeWeather
      || environment.lightingMood.length || environment.backgroundElements.length || place);
    if (characters.length > 0 || hasEnvironment) {
      return {
        characters,
        environment,
        place,
        updatedAt: new Date().toISOString()
      };
    }
  }
  const selected = new Set(selectedParserParagraphs);
  const ordered = normalizeScenePayload(payload)
    .filter((entry) => selected.size === 0 || selected.has(entry.parserParagraph))
    .sort((left, right) => left.parserParagraph - right.parserParagraph);
  if (ordered.length === 0) return null;

  const characters = new Map<string, PreviousVisualCharacter>();
  let environment = cleanEnvironment(undefined);
  let place = "";
  for (const entry of ordered) {
    environment = cleanEnvironment(entry.scene.environment);
    place = cleanTagField(entry.scene.place);
    for (const character of cleanArray<CharacterJson>(entry.shot.characters)) {
      const visual = visualCharacter(character);
      if (visual) characters.set(visual.name.toLowerCase(), visual);
    }
  }
  const hasEnvironment = Boolean(environment.location || environment.timeWeather
    || environment.lightingMood.length || environment.backgroundElements.length || place);
  if (characters.size === 0 && !hasEnvironment) return null;
  return {
    characters: [...characters.values()],
    environment,
    place,
    updatedAt: new Date().toISOString()
  };
}

export function formatPreviousVisualState(previous: PreviousVisualState): string {
  const reference = {
    characters: cleanArray<PreviousVisualCharacter>(previous.characters).map((character) => ({
      name: normalizeCharacterName(character.name),
      label: cleanTagField(character.label),
      age: cleanTagField(character.age),
      appearance: cleanTagField(character.appearance),
      body: cleanTagField(character.body),
      attire: cleanTagField(character.attire),
      attireInferred: character.attireInferred === true,
      ...(character.sources ? { sources: character.sources } : {})
    })).filter((character) => character.name),
    environment: cleanEnvironment(previous.environment),
    place: cleanTagField(previous.place)
  };
  return compactBlock([
    "## Previous Visual State",
    "This is the terminal narrative state of the immediately previous processed response, not a new narrative source. For unchanged returning character baseline fields, leave the raw value empty and leave its change marker absent; the backend injects the exact stored value after parsing. Copy unchanged environment values explicitly because scene validation occurs before inheritance. Output a full new value and its change marker when the current numbered source explicitly replaces it. Current source changes always win. Never copy camera, pose, action, or expression from prior state.",
    JSON.stringify(reference)
  ].join("\n"), 5000);
}
