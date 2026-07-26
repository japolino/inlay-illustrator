import {
  CAMERA_ANGLE_VALUES,
  CAMERA_FOCUS_VALUES,
  CAMERA_FRAMING_VALUES,
  CAMERA_PERSPECTIVE_VALUES
} from "../../backend/camera-diversity.js";
import { normalizeScenePayload } from "../../backend/scenes.js";
import type { CharacterJson, ParsedPayload, ShotJson } from "../../backend/types.js";
import { asRecord, cleanArray, cleanString } from "../../backend/utils.js";
import type { QualityIssue, SidecarScenario } from "./types.js";

const PLACEHOLDER = /\b(?:unknown|unspecified|not specified|not stated|unmentioned|undetermined|n\/?a|default clothing|unspecified time)\b/i;
const COMPOSITION_CONTAMINATION = /\b(?:close-up|medium shot|wide shot|camera|angle|pov|depth of field|blur|lens|lighting|backlight|rim light|streetlight|hair|eyes|smiling|smile|angry|furious|afraid|fear|blush)\b/i;
const COMPOSITION_CLOTHING = /\b(?:coat|shirt|jacket|trousers|pants|skirt|dress|uniform)\b/i;
const STATIC_CLOTHING_ACTION = /\b(?:wearing|dressed in|clad in)\b/i;
const ATOMIC_END = /[.!?:,;]\s*$/;

export function isCensoredEmptyResponse(model: string, raw: string): boolean {
  return /gemini/i.test(model) && raw.trim().length === 0;
}

function issue(category: QualityIssue["category"], code: string, message: string, critical = true): QualityIssue {
  return { category, code, message, critical };
}

function normalize(value: unknown): string {
  return cleanString(value).toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
}

function searchable(value: unknown): string {
  return normalize(typeof value === "string" ? value : JSON.stringify(value));
}

function withoutNegativeFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNegativeFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "negative")
    .map(([key, child]) => [key, withoutNegativeFields(child)]));
}

function hasAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(normalize(value)));
}

function hasWholePhrase(text: string, value: string): boolean {
  const phrase = normalize(value);
  if (!phrase) return false;
  return new RegExp(`(?:^|\\s)${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|\\s)`).test(text);
}

function withoutNegatedTone(value: string): string {
  return value.replace(/\b(?:not|non|never)\s+(?:romantic|affectionate|tender|friendly)\b/g, "");
}

function characterFor(payload: ParsedPayload, paragraph: number, name: string): { character?: CharacterJson; shot?: ShotJson } {
  for (const entry of normalizeScenePayload(payload).filter((candidate) => candidate.parserParagraph === paragraph)) {
    const character = cleanArray<CharacterJson>(entry.shot.characters)
      .find((candidate) => normalize(candidate.name) === normalize(name));
    if (character) return { character, shot: entry.shot };
  }
  return {};
}

function expectedField(payload: ParsedPayload, rendered: Map<number, string>, scenario: SidecarScenario, paragraph: number, character: string | undefined, field: string): string {
  const entry = normalizeScenePayload(payload).find((candidate) => candidate.parserParagraph === paragraph);
  const terminal = asRecord(payload.terminalState);
  if (field === "terminalLocation") {
    return searchable(scenario.config.promptStyle === "anima" ? asRecord(terminal.environment).location : terminal.place);
  }
  if (field === "terminalAppearance" || field === "terminalAttire") {
    const terminalCharacter = cleanArray<CharacterJson>(terminal.characters)
      .find((candidate) => normalize(candidate.name) === normalize(character));
    return searchable(field === "terminalAppearance" ? terminalCharacter?.appearance : terminalCharacter?.attire);
  }
  if (field === "payload") return searchable(withoutNegativeFields(payload));
  if (field === "prompt") return normalize(rendered.get(paragraph));
  if (field === "location") return searchable(scenario.config.promptStyle === "anima" ? entry?.scene.environment?.location : entry?.scene.place);
  if (!character) return "";
  const found = characterFor(payload, paragraph, character);
  if (!found.character) return "";
  if (field === "action") {
    const shotPlan = asRecord(found.shot?.shotPlan);
    return searchable([
      shotPlan.primaryAction,
      shotPlan.secondaryCue,
      asRecord(found.character.composition).pose,
      asRecord(found.character.composition).actions,
      found.character.action,
      asRecord(found.shot?.sharedComposition).interaction,
      asRecord(found.shot?.sharedComposition).spatialRelation,
      found.shot?.action
    ]);
  }
  return searchable(found.character[field as keyof CharacterJson]);
}

function exactFields(record: Record<string, unknown>, allowed: string[], path: string, issues: QualityIssue[]): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) issues.push(issue("schema", "unlisted_field", `${path}.${key} is not part of the production schema`));
  }
}

function atomicValues(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()));
}

function validateAnima(
  payload: ParsedPayload,
  scenario: SidecarScenario,
  issues: QualityIssue[],
  requireModeProjection: boolean
): void {
  const framing = new Set<string>(CAMERA_FRAMING_VALUES.map(normalize));
  const angle = new Set<string>(CAMERA_ANGLE_VALUES.map(normalize));
  const perspective = new Set<string>(CAMERA_PERSPECTIVE_VALUES.map(normalize));
  const focus = new Set<string>(CAMERA_FOCUS_VALUES.map(normalize));
  const names: string[] = [];
  cleanArray<Record<string, unknown>>(payload.scenes).forEach((scene, sceneIndex) => {
    exactFields(scene, ["environment", "environmentChanges", "shots", "place"], `scenes[${sceneIndex}]`, issues);
    const environment = asRecord(scene.environment);
    if (Object.keys(environment).length === 0) issues.push(issue("schema", "environment_object", `Scene ${sceneIndex + 1} has no structured environment object`));
    exactFields(environment, ["location", "timeWeather", "lightingMood", "backgroundElements"], `scenes[${sceneIndex}].environment`, issues);
    const location = atomicValues(environment.location);
    const time = atomicValues(environment.timeWeather);
    const light = atomicValues(environment.lightingMood);
    const background = atomicValues(environment.backgroundElements);
    if (location.length !== 1 || time.length !== 1 || light.length > 3 || background.length > 5) {
      issues.push(issue("schema", "environment_budget", `Scene ${sceneIndex + 1} exceeds or misses the 1/1/3/5 environment safety budget`));
    }
    [...location, ...time, ...light, ...background].forEach((value) => {
      if (value.includes(",") || value.includes(";") || ATOMIC_END.test(value)) issues.push(issue("schema", "environment_punctuation", `Environment snippet is not atomic: ${value}`, false));
    });
    cleanArray<Record<string, unknown>>(scene.shots).forEach((shot, shotIndex) => {
      exactFields(shot, ["paragraph", "perspectiveMode", "camera", "shotPlan", "situation", "characters", "sharedComposition", "negative"], `scenes[${sceneIndex}].shots[${shotIndex}]`, issues);
      const camera = asRecord(shot.camera);
      exactFields(camera, ["framing", "angle", "perspective", "focus"], "camera", issues);
      const framingValue = normalize(camera.framing);
      const angleValue = normalize(camera.angle);
      const perspectiveValue = normalize(camera.perspective);
      if ((framingValue && !framing.has(framingValue)) || (angleValue && !angle.has(angleValue)) || (perspectiveValue && !perspective.has(perspectiveValue))) {
        issues.push(issue("schema", "camera_enum", `P${shot.paragraph} contains a non-permitted camera value`));
      }
      const focusValues = atomicValues(camera.focus).map(normalize);
      if (focusValues.length > 2 || focusValues.some((value) => !focus.has(value))) issues.push(issue("schema", "camera_focus", `P${shot.paragraph} contains invalid focus tags`));
      const perspectiveMode = normalize(shot.perspectiveMode);
      const shotPlan = asRecord(shot.shotPlan);
      if (Object.keys(shotPlan).length > 0) {
        exactFields(shotPlan, ["primaryAction", "secondaryCue", "staging"], "shotPlan", issues);
        for (const value of ["primaryAction", "secondaryCue", "staging"].flatMap((field) => atomicValues(shotPlan[field]))) {
          if (value.includes(",") || value.includes(";") || ATOMIC_END.test(value)) {
            issues.push(issue("schema", "shot_plan_punctuation", `P${shot.paragraph} shotPlan is not atomic: ${value}`, false));
          }
        }
        if (perspectiveMode === "dynamic" && !normalize(shotPlan.primaryAction)) {
          issues.push(issue("schema", "dynamic_primary_action", `P${shot.paragraph} Dynamic shotPlan has no primaryAction`));
        }
      } else if (perspectiveMode === "dynamic") {
        issues.push(issue(
          "schema",
          "legacy_dynamic_projection",
          `P${shot.paragraph} uses the legacy Dynamic projection`,
          requireModeProjection
        ));
      }
      const shared = asRecord(shot.sharedComposition);
      if (Object.keys(shared).length === 0) issues.push(issue("schema", "shared_object", `P${shot.paragraph} collapses sharedComposition`));
      exactFields(shared, ["interaction", "spatialRelation"], "sharedComposition", issues);
      const sharedActions = atomicValues(shared.interaction).map(normalize);
      cleanArray<Record<string, unknown>>(shot.characters).forEach((character, characterIndex) => {
        exactFields(character, ["name", "label", "age", "identity", "appearance", "body", "attire", "attireInferred", "visualChanges", "expression", "renderScope", "visibleTags", "composition"], `characters[${characterIndex}]`, issues);
        const name = cleanString(character.name);
        if (name) names.push(name);
        if (perspectiveMode === "dynamic" && requireModeProjection) {
          if (!cleanString(character.renderScope)) {
            issues.push(issue("schema", "dynamic_render_scope", `P${shot.paragraph} ${name || `character ${characterIndex + 1}`} has no renderScope`));
          }
          if (!cleanString(character.visibleTags)) {
            issues.push(issue("schema", "dynamic_visible_tags", `P${shot.paragraph} ${name || `character ${characterIndex + 1}`} has no visibleTags`));
          }
        }
        if (/\b\d{1,3}\b/.test(cleanString(character.age))) issues.push(issue("schema", "numeric_age", `${name || "Character"} uses a numeric age tag`));
        const composition = asRecord(character.composition);
        if (Object.keys(composition).length === 0) issues.push(issue("schema", "composition_object", `${name || "Character"} collapses composition`));
        exactFields(composition, ["position", "pose", "actions", "gaze"], "composition", issues);
        const actions = atomicValues(composition.actions);
        const nonActions = [...atomicValues(composition.position), ...atomicValues(composition.pose), ...atomicValues(composition.gaze)];
        [...nonActions, ...actions].forEach((value) => {
          if (value.includes(",") || value.includes(";") || ATOMIC_END.test(value)) issues.push(issue("schema", "composition_punctuation", `P${shot.paragraph} composition is not atomic: ${value}`, false));
          const clothingContamination = COMPOSITION_CLOTHING.test(value)
            && (nonActions.includes(value) || STATIC_CLOTHING_ACTION.test(value));
          if (COMPOSITION_CONTAMINATION.test(value) || clothingContamination) {
            issues.push(issue("schema", "composition_contamination", `P${shot.paragraph} composition contains tag-domain data: ${value}`));
          }
        });
        for (const action of actions.map(normalize)) {
          if (sharedActions.some((sharedAction) => sharedAction === action || sharedAction.includes(action) || action.includes(sharedAction))) {
            issues.push(issue("semantics", "duplicate_action_owner", `P${shot.paragraph} duplicates an action between character and sharedComposition and required renderer deduplication`, false));
          }
        }
      });
    });
  });
  const protectedNames = [...new Set(names.flatMap((name) => {
    const first = name.split(/\s+/)[0];
    return [name, ...(first ? [first] : [])];
  }))];
  const strings: Array<{ key: string; value: string }> = [];
  const walk = (value: unknown, key = ""): void => {
    if (typeof value === "string") strings.push({ key, value });
    else if (Array.isArray(value)) value.forEach((entry) => walk(entry, key));
    else if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([childKey, child]) => walk(child, childKey));
  };
  walk(payload);
  strings.forEach(({ key, value }) => {
    if (PLACEHOLDER.test(value)) issues.push(issue("schema", "placeholder", `Placeholder survived in ${key}`));
    if (key !== "name" && protectedNames.some((name) => name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(value))) issues.push(issue("schema", "name_leak", `Character name leaked outside name and required renderer sanitization: ${key}`, false));
  });
}

export function evaluateQuality(
  payload: ParsedPayload,
  scenario: SidecarScenario,
  renderedEntries: Array<{ paragraph: number; positive: string }>,
  rawJson: boolean,
  options: { requireModeProjection?: boolean; requireTerminalState?: boolean } = {}
): { issues: QualityIssue[]; score: number; passed: boolean } {
  const issues: QualityIssue[] = [];
  if (!rawJson) issues.push(issue("raw", "json_recovery", "Response required production JSON recovery", false));
  const top = asRecord(payload);
  exactFields(top, ["scenes", "terminalState"], "$", issues);
  if (options.requireTerminalState) {
    const terminal = asRecord(payload.terminalState);
    exactFields(
      terminal,
      scenario.config.promptStyle === "anima"
        ? ["paragraph", "environment", "environmentChanges", "characters", "place"]
        : ["paragraph", "place", "environmentChanges", "characters", "environment"],
      "terminalState",
      issues
    );
    const terminalParagraph = Number(String(terminal.paragraph ?? "").match(/\d+/)?.[0]);
    if (terminalParagraph !== scenario.paragraphs.length) {
      issues.push(issue("schema", "terminal_paragraph", `terminalState must reference final paragraph P${scenario.paragraphs.length}`));
    }
    if (!Array.isArray(terminal.characters)) {
      issues.push(issue("schema", "terminal_characters", "terminalState.characters must be an array"));
    }
    cleanArray<Record<string, unknown>>(terminal.characters).forEach((character, index) => {
      exactFields(
        character,
        ["name", "label", "age", "appearance", "body", "attire", "attireInferred", "visualChanges"],
        `terminalState.characters[${index}]`,
        issues
      );
    });
    if (scenario.config.promptStyle === "anima") {
      const environment = asRecord(terminal.environment);
      exactFields(environment, ["location", "timeWeather", "lightingMood", "backgroundElements"], "terminalState.environment", issues);
      if (Object.keys(environment).length === 0) {
        issues.push(issue("schema", "terminal_environment", "terminalState.environment must remain an object"));
      }
    }
  }
  const normalizedEntries = normalizeScenePayload(payload);
  const paragraphs = normalizedEntries.map((entry) => entry.parserParagraph);
  const uniqueParagraphs = [...new Set(paragraphs)];
  if (paragraphs.length !== uniqueParagraphs.length) issues.push(issue("schema", "duplicate_paragraph", "More than one shot targets the same paragraph"));
  if (paragraphs.length < Math.min(scenario.config.minImages, scenario.paragraphs.length) || paragraphs.length > scenario.config.maxImages) {
    issues.push(issue("schema", "image_limit", `Parser returned ${paragraphs.length} shots outside configured limits`));
  }
  if (JSON.stringify([...uniqueParagraphs].sort()) !== JSON.stringify([...scenario.expectedParagraphs].sort())) {
    issues.push(issue("semantics", "paragraph_selection", `Expected P${scenario.expectedParagraphs.join(", P")}; received P${uniqueParagraphs.join(", P")}`));
  }
  normalizedEntries.forEach((entry) => {
    const characters = cleanArray<CharacterJson>(entry.shot.characters);
    if (characters.length > scenario.config.maxCharacters) issues.push(issue("schema", "character_limit", `P${entry.parserParagraph} exceeds maxCharacters`));
    const expected = [...(scenario.expectedCharacters[entry.parserParagraph] || [])].sort();
    const actual = characters.map((character) => cleanString(character.name)).sort();
    const allowedSets = scenario.allowedCharacterSets?.[entry.parserParagraph]?.map((set) => [...set].sort()) || [expected];
    const characterSetAllowed = allowedSets.some((set) => JSON.stringify(set) === JSON.stringify(actual));
    if (!characterSetAllowed) {
      const allowedText = allowedSets.map((set) => set.length ? set.join(", ") : "(none)").join(" or ");
      issues.push(issue("semantics", "character_set", `P${entry.parserParagraph} expected ${allowedText}; received ${actual.join(", ")}`));
    }
    const expectedPerspectives = scenario.expectedPerspectives?.[entry.parserParagraph];
    const actualPerspective = cleanString(entry.shot.perspectiveMode).toLowerCase();
    if (expectedPerspectives?.length && !expectedPerspectives.includes(actualPerspective as typeof expectedPerspectives[number])) {
      issues.push(issue(
        "semantics",
        "perspective_routing",
        `P${entry.parserParagraph} expected ${expectedPerspectives.join(" or ")}; received ${actualPerspective || "(empty)"}`
      ));
    }
    if (scenario.id.startsWith("nsfw_")) {
      for (const character of characters) {
        if (!/\b(?:adult|mature|aged up|old)\b/i.test(cleanString(character.age))) {
          issues.push(issue("semantics", "adult_age_marker", `P${entry.parserParagraph} ${cleanString(character.name) || "character"} lacks an explicit adult age marker`));
        }
      }
    }
  });
  if (scenario.config.promptStyle === "anima") {
    validateAnima(payload, scenario, issues, options.requireModeProjection !== false);
  }
  const rendered = new Map(renderedEntries.map((entry) => [entry.paragraph, entry.positive]));
  for (const expectation of scenario.expectations) {
    const text = expectedField(payload, rendered, scenario, expectation.paragraph, expectation.character, expectation.field);
    if (expectation.anyOf && !hasAny(text, expectation.anyOf)) {
      issues.push(issue("continuity", "required_fact", `${scenario.id} P${expectation.paragraph} ${expectation.character || expectation.field} misses: ${expectation.anyOf.join(" | ")}`, expectation.critical !== false));
    }
    const safeText = withoutNegatedTone(text);
    const prohibited = expectation.noneOf?.find((value) => hasWholePhrase(safeText, value));
    if (prohibited) issues.push(issue("continuity", "stale_or_invented_fact", `${scenario.id} P${expectation.paragraph} contains prohibited: ${prohibited}`, expectation.critical !== false));
  }
  renderedEntries.forEach((entry) => {
    if (!entry.positive.trim()) issues.push(issue("rendering", "empty_prompt", `P${entry.paragraph} rendered an empty prompt`));
    if (entry.positive.includes(";") || /[.!?:,;]\s*$/.test(entry.positive)) issues.push(issue("rendering", "unsafe_punctuation", `P${entry.paragraph} rendered unsafe punctuation`));
  });
  const groupedIssues = new Map<string, QualityIssue>();
  for (const current of issues) {
    const key = `${current.category}.${current.code}`;
    const previous = groupedIssues.get(key);
    if (!previous || current.critical) groupedIssues.set(key, current);
  }
  const score = Math.max(0, 100 - [...groupedIssues.values()].reduce((sum, current) => sum + (current.critical ? 18 : 3), 0));
  return { issues, score, passed: issues.every((current) => !current.critical) && score >= 90 };
}
