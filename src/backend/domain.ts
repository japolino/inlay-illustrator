import { z } from "zod";

/**
 * Canonical, validated domain values used after untrusted parser output has
 * been normalized. Parser recovery types intentionally remain in types.ts;
 * this module is the strict boundary consumed by later pipeline stages.
 */

const NonEmptyStringSchema = z.string().trim().min(1);
const ParagraphSchema = z.number().int().positive();
const StringListSchema = z.array(z.string());

export const ShotModeSchema = z.enum(["dynamic", "static", "creative", "asset"]);
export type ShotMode = z.infer<typeof ShotModeSchema>;

export const DynamicShotPlanSchema = z.object({
  mode: z.literal("dynamic"),
  primaryAction: NonEmptyStringSchema.optional(),
  secondaryCue: z.string().optional(),
  staging: z.string().optional(),
  /** Deterministic Adaptive fallback when a Creative shot has no usable concept. */
  degradedFromCreative: z.literal(true).optional()
}).strict().superRefine((plan, context) => {
  if (!plan.primaryAction && !plan.degradedFromCreative) {
    context.addIssue({ code: "custom", path: ["primaryAction"], message: "Dynamic plans require a primary action." });
  }
});

/**
 * Static composition is carried by the resolved character poses and setting.
 * The variant is deliberately small so Dynamic action hierarchy cannot leak
 * into a Static plan.
 */
export const StaticShotPlanSchema = z.object({
  mode: z.literal("static")
}).strict();

export const CreativeSubjectTypeSchema = z.enum([
  "object",
  "environment",
  "shadow",
  "silhouette",
  "reflection",
  "fragment",
  "spatial"
]);

export const CreativeConceptSchema = z.object({
  id: NonEmptyStringSchema,
  paragraph: ParagraphSchema,
  subjectType: CreativeSubjectTypeSchema,
  anchor: NonEmptyStringSchema,
  concept: NonEmptyStringSchema,
  renderScope: NonEmptyStringSchema,
  camera: NonEmptyStringSchema,
  visibleCues: z.array(NonEmptyStringSchema),
  score: z.number().min(0).max(100)
}).strict();

/** Creative concepts are optional in the current fast-mode path. */
export const CreativeShotPlanSchema = z.object({
  mode: z.literal("creative"),
  concept: CreativeConceptSchema.optional()
}).strict();

/** Asset details live on the resolved subject; this variant selects rendering policy. */
export const AssetShotPlanSchema = z.object({
  mode: z.literal("asset")
}).strict();

export const ShotPlanSchema = z.discriminatedUnion("mode", [
  DynamicShotPlanSchema,
  StaticShotPlanSchema,
  CreativeShotPlanSchema,
  AssetShotPlanSchema
]);
export type ShotPlan = z.infer<typeof ShotPlanSchema>;

export const CharacterFieldSourceSchema = z.enum([
  "card_explicit",
  "previous_memory",
  "narrative_explicit",
  "inferred"
]);

export type CharacterFieldSource = z.infer<typeof CharacterFieldSourceSchema>;

export const CharacterFieldSourcesSchema = z.object({
  age: CharacterFieldSourceSchema.optional(),
  appearance: CharacterFieldSourceSchema.optional(),
  body: CharacterFieldSourceSchema.optional(),
  attire: CharacterFieldSourceSchema.optional()
}).strict();
export type CharacterFieldSources = z.infer<typeof CharacterFieldSourcesSchema>;

/** A complete durable character baseline, never a shot projection. */
export const CharacterContinuityStateSchema = z.object({
  name: NonEmptyStringSchema,
  label: z.string(),
  age: z.string(),
  appearance: z.string(),
  body: z.string(),
  attire: z.string(),
  attireInferred: z.boolean(),
  sources: CharacterFieldSourcesSchema.optional()
}).strict();
export type CharacterContinuityState = z.infer<typeof CharacterContinuityStateSchema>;

export const EnvironmentContinuityStateSchema = z.object({
  location: z.string(),
  timeWeather: z.string(),
  lightingMood: StringListSchema,
  backgroundElements: StringListSchema
}).strict();
export type EnvironmentContinuityState = z.infer<typeof EnvironmentContinuityStateSchema>;

export const ContinuityStateSchema = z.object({
  characters: z.array(CharacterContinuityStateSchema),
  environment: EnvironmentContinuityStateSchema,
  place: z.string(),
  /** Storage metadata is accepted but is not required for a deterministic plan. */
  updatedAt: z.iso.datetime().optional()
}).strict();
export type ContinuityState = z.infer<typeof ContinuityStateSchema>;

export const CharacterContinuityFieldSchema = z.enum([
  "label",
  "age",
  "appearance",
  "body",
  "attire",
  "attireInferred",
  "sources"
]);

export const CharacterContinuityChangesSchema = z.object({
  label: z.string().optional(),
  age: z.string().optional(),
  appearance: z.string().optional(),
  body: z.string().optional(),
  attire: z.string().optional(),
  attireInferred: z.boolean().optional(),
  sources: CharacterFieldSourcesSchema.optional()
}).strict();

export const CharacterContinuityDeltaSchema = z.object({
  name: NonEmptyStringSchema,
  set: CharacterContinuityChangesSchema.optional(),
  clear: z.array(CharacterContinuityFieldSchema).optional()
}).strict().superRefine((delta, context) => {
  const hasSet = delta.set !== undefined && Object.keys(delta.set).length > 0;
  const hasClear = delta.clear !== undefined && delta.clear.length > 0;
  if (!hasSet && !hasClear) {
    context.addIssue({
      code: "custom",
      message: "A character continuity delta must set or clear at least one field."
    });
  }
  if (delta.clear && new Set(delta.clear).size !== delta.clear.length) {
    context.addIssue({ code: "custom", path: ["clear"], message: "Clear fields must be unique." });
  }
});
export type CharacterContinuityDelta = z.infer<typeof CharacterContinuityDeltaSchema>;

export const EnvironmentContinuityFieldSchema = z.enum([
  "location",
  "timeWeather",
  "lightingMood",
  "backgroundElements"
]);

export const EnvironmentContinuityChangesSchema = z.object({
  location: z.string().optional(),
  timeWeather: z.string().optional(),
  lightingMood: StringListSchema.optional(),
  backgroundElements: StringListSchema.optional()
}).strict();

export const EnvironmentContinuityDeltaSchema = z.object({
  set: EnvironmentContinuityChangesSchema.optional(),
  clear: z.array(EnvironmentContinuityFieldSchema).optional()
}).strict().superRefine((delta, context) => {
  const hasSet = delta.set !== undefined && Object.keys(delta.set).length > 0;
  const hasClear = delta.clear !== undefined && delta.clear.length > 0;
  if (!hasSet && !hasClear) {
    context.addIssue({
      code: "custom",
      message: "An environment continuity delta must set or clear at least one field."
    });
  }
  if (delta.clear && new Set(delta.clear).size !== delta.clear.length) {
    context.addIssue({ code: "custom", path: ["clear"], message: "Clear fields must be unique." });
  }
});
export type EnvironmentContinuityDelta = z.infer<typeof EnvironmentContinuityDeltaSchema>;

/** Changes caused by one numbered source paragraph. Null place explicitly clears it. */
export const ContinuityDeltaSchema = z.object({
  paragraph: ParagraphSchema,
  /** Same-paragraph terminal changes can occur after the illustrated moment. */
  timing: z.enum(["before_shot", "after_shot"]).optional(),
  characters: z.array(CharacterContinuityDeltaSchema).optional(),
  removeCharacters: z.array(NonEmptyStringSchema).optional(),
  environment: EnvironmentContinuityDeltaSchema.optional(),
  place: z.string().nullable().optional()
}).strict().superRefine((delta, context) => {
  if (delta.removeCharacters && new Set(delta.removeCharacters.map((name) => name.toLowerCase())).size !== delta.removeCharacters.length) {
    context.addIssue({ code: "custom", path: ["removeCharacters"], message: "Removed character names must be unique." });
  }
  if (!(delta.characters?.length || delta.removeCharacters?.length || delta.environment !== undefined || delta.place !== undefined)) {
    context.addIssue({ code: "custom", message: "A continuity delta must contain at least one change." });
  }
});
export type ContinuityDelta = z.infer<typeof ContinuityDeltaSchema>;

export const CameraSchema = z.object({
  framing: z.string(),
  angle: z.string(),
  perspective: z.string(),
  focus: StringListSchema
}).strict();
export type Camera = z.infer<typeof CameraSchema>;

export const CharacterCompositionSchema = z.object({
  position: z.string(),
  pose: z.string(),
  actions: StringListSchema,
  gaze: z.string()
}).strict();

export const SharedCompositionSchema = z.object({
  interaction: StringListSchema,
  spatialRelation: z.string()
}).strict();

/** A continuity-resolved character plus fields that exist only for this shot. */
export const ResolvedCharacterSchema = CharacterContinuityStateSchema.extend({
  /** Legacy/render-only fields retained for exact prompt compatibility. */
  identity: z.string(),
  avatarAppearance: z.string(),
  avatarBody: z.string(),
  avatarAttire: z.string(),
  expression: z.string(),
  action: z.string(),
  composition: CharacterCompositionSchema,
  renderScope: z.string(),
  visibleTags: StringListSchema
}).strict();
export type ResolvedCharacter = z.infer<typeof ResolvedCharacterSchema>;

/** Complete, render-ready shot. No continuity lookup or parser coercion remains. */
export const ResolvedShotSchema = z.object({
  paragraph: ParagraphSchema,
  plan: ShotPlanSchema,
  camera: CameraSchema,
  cameraText: z.string(),
  situation: z.string(),
  action: z.string(),
  characters: z.array(ResolvedCharacterSchema),
  sharedComposition: SharedCompositionSchema,
  supplement: z.string(),
  environment: EnvironmentContinuityStateSchema,
  place: z.string(),
  negative: z.string()
}).strict();
export type ResolvedShot = z.infer<typeof ResolvedShotSchema>;

/**
 * The canonical pipeline handoff: resolved render work plus auditable
 * continuity inputs, changes, and terminal state. Strict objects make schema
 * drift fail at the boundary rather than silently disappearing downstream.
 */
export const IllustrationPlanSchema = z.object({
  version: z.literal(1),
  shots: z.array(ResolvedShotSchema),
  initialContinuity: ContinuityStateSchema,
  continuityDeltas: z.array(ContinuityDeltaSchema),
  terminalContinuity: ContinuityStateSchema
}).strict().superRefine((plan, context) => {
  for (let index = 1; index < plan.shots.length; index += 1) {
    if (plan.shots[index].paragraph <= plan.shots[index - 1].paragraph) {
      context.addIssue({
        code: "custom",
        path: ["shots"],
        message: "Resolved shots must be ordered by strictly increasing paragraph."
      });
      break;
    }
  }
  for (let index = 1; index < plan.continuityDeltas.length; index += 1) {
    const previous = plan.continuityDeltas[index - 1];
    const current = plan.continuityDeltas[index];
    const previousPhase = previous.timing === "after_shot" ? 1 : 0;
    const currentPhase = current.timing === "after_shot" ? 1 : 0;
    if (current.paragraph < previous.paragraph
      || (current.paragraph === previous.paragraph && currentPhase <= previousPhase)) {
      context.addIssue({
        code: "custom",
        path: ["continuityDeltas"],
        message: "Continuity deltas must be ordered by paragraph and before/after-shot phase."
      });
      break;
    }
  }
  const resolvedTerminal = resolveContinuity(plan.initialContinuity, plan.continuityDeltas);
  if (JSON.stringify(resolvedTerminal) !== JSON.stringify(plan.terminalContinuity)) {
    context.addIssue({
      code: "custom",
      path: ["terminalContinuity"],
      message: "terminalContinuity must equal the deterministic reduction of initialContinuity and continuityDeltas."
    });
  }
});
export type IllustrationPlan = z.infer<typeof IllustrationPlanSchema>;


const EMPTY_CHARACTER: Omit<CharacterContinuityState, "name"> = {
  label: "",
  age: "",
  appearance: "",
  body: "",
  attire: "",
  attireInferred: false
};

/** Apply one validated continuity delta without mutating its input snapshot. */
export function applyContinuityDelta(
  state: ContinuityState,
  input: ContinuityDelta
): ContinuityState {
  const current = ContinuityStateSchema.parse(state);
  const delta = ContinuityDeltaSchema.parse(input);
  let characters = current.characters.map((character) => ({
    ...character,
    ...(character.sources ? { sources: { ...character.sources } } : {})
  }));
  const removedNames = new Set((delta.removeCharacters || []).map((name) => name.trim().toLowerCase()));
  if (removedNames.size > 0) {
    characters = characters.filter((character) => !removedNames.has(character.name.toLowerCase()));
  }

  for (const change of delta.characters || []) {
    const key = change.name.trim().toLowerCase();
    let index = characters.findIndex((character) => character.name.toLowerCase() === key);
    if (index < 0) {
      characters.push({ name: change.name, ...EMPTY_CHARACTER });
      index = characters.length - 1;
    }
    const character = { ...characters[index], ...(change.set || {}) };
    for (const field of change.clear || []) {
      if (field === "attireInferred") character.attireInferred = false;
      else if (field === "sources") delete character.sources;
      else character[field] = "";
    }
    characters[index] = character;
  }

  const environment = {
    ...current.environment,
    lightingMood: [...current.environment.lightingMood],
    backgroundElements: [...current.environment.backgroundElements],
    ...(delta.environment?.set || {})
  };
  for (const field of delta.environment?.clear || []) {
    if (field === "lightingMood" || field === "backgroundElements") environment[field] = [];
    else environment[field] = "";
  }

  return ContinuityStateSchema.parse({
    ...current,
    characters,
    environment,
    ...(delta.place !== undefined ? { place: delta.place ?? "" } : {})
  });
}

/** Resolve chronological deltas into one canonical terminal snapshot. */
export function resolveContinuity(
  initial: ContinuityState,
  deltas: readonly ContinuityDelta[]
): ContinuityState {
  let resolved = ContinuityStateSchema.parse(initial);
  let previousParagraph = 0;
  let previousPhase = -1;
  for (const delta of deltas) {
    const validated = ContinuityDeltaSchema.parse(delta);
    const phase = validated.timing === "after_shot" ? 1 : 0;
    if (validated.paragraph < previousParagraph
      || (validated.paragraph === previousParagraph && phase <= previousPhase)) {
      throw new Error("Continuity deltas must be ordered by source paragraph and phase.");
    }
    resolved = applyContinuityDelta(resolved, validated);
    previousParagraph = validated.paragraph;
    previousPhase = phase;
  }
  return resolved;
}


const CHARACTER_DIFF_FIELDS = ["label", "age", "appearance", "body", "attire", "attireInferred", "sources"] as const;
const ENVIRONMENT_DIFF_FIELDS = ["location", "timeWeather", "lightingMood", "backgroundElements"] as const;

function sameDomainValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Convert a complete legacy terminal snapshot into an explicit canonical delta. */
export function continuityDeltaBetween(
  previousInput: ContinuityState,
  terminalInput: ContinuityState,
  paragraph: number,
  timing?: ContinuityDelta["timing"]
): ContinuityDelta | null {
  const previous = ContinuityStateSchema.parse(previousInput);
  const terminal = ContinuityStateSchema.parse(terminalInput);
  const previousCharacters = new Map(previous.characters.map((character) => [character.name.toLowerCase(), character]));
  const terminalNames = new Set(terminal.characters.map((character) => character.name.toLowerCase()));
  const characters: CharacterContinuityDelta[] = [];

  for (const character of terminal.characters) {
    const prior = previousCharacters.get(character.name.toLowerCase());
    const set: Record<string, unknown> = {};
    for (const field of CHARACTER_DIFF_FIELDS) {
      if (!prior || !sameDomainValue(prior[field], character[field])) set[field] = character[field];
    }
    if (Object.keys(set).length > 0) {
      characters.push({ name: character.name, set: set as CharacterContinuityDelta["set"] });
    }
  }

  const removeCharacters = previous.characters
    .filter((character) => !terminalNames.has(character.name.toLowerCase()))
    .map((character) => character.name);
  const environmentSet: Record<string, unknown> = {};
  for (const field of ENVIRONMENT_DIFF_FIELDS) {
    if (!sameDomainValue(previous.environment[field], terminal.environment[field])) {
      environmentSet[field] = terminal.environment[field];
    }
  }
  const candidate = {
    paragraph,
    ...(timing ? { timing } : {}),
    ...(characters.length > 0 ? { characters } : {}),
    ...(removeCharacters.length > 0 ? { removeCharacters } : {}),
    ...(Object.keys(environmentSet).length > 0 ? { environment: { set: environmentSet } } : {}),
    ...(previous.place !== terminal.place ? { place: terminal.place || null } : {})
  };
  return Object.keys(candidate).every((key) => key === "paragraph" || key === "timing")
    ? null
    : ContinuityDeltaSchema.parse(candidate);
}

/**
 * Compatibility boundary for the old terminal-snapshot contract. Production
 * state is still committed through the deterministic delta reducer.
 */
export function reconcileContinuityState(
  previousInput: ContinuityState | undefined,
  terminalInput: ContinuityState,
  paragraph: number
): ContinuityState {
  const terminal = ContinuityStateSchema.parse(terminalInput);
  const previous = previousInput
    ? ContinuityStateSchema.parse(previousInput)
    : ContinuityStateSchema.parse({
      characters: [],
      environment: { location: "", timeWeather: "", lightingMood: [], backgroundElements: [] },
      place: "",
      ...(terminal.updatedAt ? { updatedAt: terminal.updatedAt } : {})
    });
  const delta = continuityDeltaBetween(previous, terminal, paragraph);
  const resolved = delta ? resolveContinuity(previous, [delta]) : previous;
  return ContinuityStateSchema.parse({ ...resolved, ...(terminal.updatedAt ? { updatedAt: terminal.updatedAt } : {}) });
}


/**
 * Model-authored shot direction. Characters are referenced by canonical name;
 * shot-only directives (expression, composition, crop projection) live here,
 * never in continuity state. Camera fields may be partial; the resolver fills
 * defaults before producing a render-ready ResolvedShot.
 */
export const PlannedCharacterSchema = z.object({
  name: NonEmptyStringSchema,
  identity: z.string().optional(),
  avatarAppearance: z.string().optional(),
  avatarBody: z.string().optional(),
  avatarAttire: z.string().optional(),
  expression: z.string().optional(),
  action: z.string().optional(),
  composition: CharacterCompositionSchema.optional(),
  renderScope: z.string().optional(),
  visibleTags: StringListSchema.optional()
}).strict();
export type PlannedCharacter = z.infer<typeof PlannedCharacterSchema>;

export const PlannedShotSchema = z.object({
  paragraph: ParagraphSchema,
  plan: ShotPlanSchema,
  camera: CameraSchema.partial(),
  cameraText: z.string().optional(),
  situation: z.string().optional(),
  action: z.string().optional(),
  characters: z.array(PlannedCharacterSchema).optional(),
  sharedComposition: SharedCompositionSchema.optional(),
  supplement: z.string().optional(),
  negative: z.string().optional(),
  place: z.string().optional()
}).strict();
export type PlannedShot = z.infer<typeof PlannedShotSchema>;

/**
 * The typed parser-result boundary: canonical state is trusted application
 * input; the model contributes only explicit continuity deltas and shot plans.
 */
export const IllustrationInputSchema = z.object({
  initialContinuity: ContinuityStateSchema,
  shots: z.array(PlannedShotSchema).min(1),
  deltas: z.array(ContinuityDeltaSchema).optional()
}).strict();
export type IllustrationInput = z.infer<typeof IllustrationInputSchema>;
