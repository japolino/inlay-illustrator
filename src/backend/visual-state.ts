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
  if (changed.has("location")) changed.add("backgroundElements");
  const select = <T extends string | string[]>(key: string, currentValue: T, previousValue: T): T => {
    const hasCurrent = Array.isArray(currentValue) ? currentValue.length > 0 : Boolean(currentValue);
    const hasPrevious = Array.isArray(previousValue) ? previousValue.length > 0 : Boolean(previousValue);
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
    appearance: cleanTagField(character.appearance),
    body: cleanTagField(character.body),
    attire: cleanTagField(character.attire),
    attireInferred: inferred(character.attireInferred)
  };
}

function inheritCharacter(
  raw: CharacterJson,
  previousCharacters: Map<string, PreviousVisualCharacter>
): CharacterJson {
  const current = visualCharacter(raw);
  const name = current?.name || normalizeCharacterName(raw.name);
  const previous = name ? previousCharacters.get(name.toLowerCase()) : undefined;
  const currentAttire = cleanTagField(raw.attire);
  const changes = changeSet(raw.visualChanges, ["age", "appearance", "body", "attire"]);
  const stableField = (key: string, currentValue: string, previousValue = ""): string => {
    if (!previousValue) return currentValue;
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
      : changes.has("attire") && currentAttire
        ? inferred(raw.attireInferred)
        : previous.attireInferred
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
    const place = carriedPlace && !environmentChanges.has("place") ? carriedPlace : currentPlace || carriedPlace;
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
  return { ...payload, scenes };
}

export function buildPreviousVisualState(
  payload: ParsedPayload,
  selectedParserParagraphs: number[]
): PreviousVisualState | null {
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
      attireInferred: character.attireInferred === true
    })).filter((character) => character.name),
    environment: cleanEnvironment(previous.environment),
    place: cleanTagField(previous.place)
  };
  return compactBlock([
    "## Previous Visual State",
    "This is the immediately previous generated turn, not a new narrative source. Copy its character and environment values exactly when the current numbered source does not explicitly replace them. Current source changes always win. Never copy camera, pose, action, or expression from prior state.",
    JSON.stringify(reference)
  ].join("\n"), 5000);
}
