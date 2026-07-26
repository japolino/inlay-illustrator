import type { PromptCandidate, PromptStudyCase } from "./types.js";

export type PromptStrategy = "saved-production" | "compact-production" | "production" | "legacy-production" | "merged-character-blocks" | "merged-tags-first" | "anchored-natural-language" | "role-bound-actions" | "focused-dynamic";

export const PROMPT_STRATEGIES: PromptStrategy[] = ["saved-production", "compact-production", "production", "legacy-production", "merged-character-blocks", "merged-tags-first", "anchored-natural-language", "role-bound-actions", "focused-dynamic"];

const ROLE_BOUND_ACTIONS: Record<string, { characters: string[]; shared: string }> = {
  rhea_platform_conflict: {
    characters: [
      "left woman stands firmly, left woman grips right man's sleeve with one hand, left woman points toward departing train with her other hand, left woman looks toward departing train",
      "right man recoils backward from left woman, right man pulls away from the sleeve grip, right man looks directly at left woman"
    ],
    shared: "left woman confronts right man at close range, tense non-romantic contact"
  },
  rhea_corridor_continuity: {
    characters: [
      "right woman runs left behind left man, right woman looks backward at partial bronze mechanical hand entering through closing doorway",
      "left man runs left ahead of right woman, left man pulls right woman forward by her wrist, left man looks forward"
    ],
    shared: "left man holds right woman's wrist while leading her left, partial bronze mechanical hand remains separate and partly out of frame, exactly two complete people"
  },
  rhea_compartment_attire_removal: {
    characters: [
      "left woman leans toward seated right man, left woman wraps bandage around right man's injured palm, left woman looks at his palm",
      "right man sits and extends his injured hand, right man holds his palm still, right man looks at the bandage"
    ],
    shared: "left woman's hands treat right man's injured palm, tense first aid, non-romantic contact"
  },
  nsfw_nudity_overrides_stale_attire: {
    characters: [
      "foreground adult woman lies on her back with legs apart",
      "adult man kneels between foreground adult woman's legs, adult man performs cunnilingus on her exposed vulva"
    ],
    shared: "adult man performs oral sex on adult woman, exactly two nude adults"
  }
};

const FOCUSED_DYNAMIC: Record<string, { primary: string; secondary: string; staging: string }> = {
  rhea_platform_conflict: {
    primary: "left woman grips right man's sleeve while confronting him",
    secondary: "left woman points toward the departing train",
    staging: "right man recoils one step from the left woman"
  },
  rhea_corridor_continuity: {
    primary: "left man pulls right woman left by her wrist while running",
    secondary: "right woman looks backward at the partial bronze mechanical hand",
    staging: "left man leads with right woman one step behind"
  },
  rhea_compartment_attire_removal: {
    primary: "left woman wraps a bandage around right man's injured palm",
    secondary: "right man holds his hand still",
    staging: "left woman leans toward the seated right man"
  },
  nsfw_nudity_overrides_stale_attire: {
    primary: "adult man performs oral sex on the adult woman",
    secondary: "",
    staging: "adult man kneels between the adult woman's spread legs"
  }
};

function sections(prompt: string): string[] {
  return prompt.split(/,\s*\r?\n\s*\r?\n/).map((section) => section.trim().replace(/,+$/, "")).filter(Boolean);
}

function join(values: string[]): string {
  return values.filter(Boolean).join(",\n\n");
}

export function applyPromptStrategy(prompt: string, characterCount: number, strategy: PromptStrategy, scenario?: string): string {
  if (strategy === "saved-production" || strategy === "compact-production" || strategy === "production" || strategy === "legacy-production" || characterCount < 1) return prompt;
  const parts = sections(prompt);
  const dynamicProjection = parts.length >= 4 + characterCount * 2
    && /\b(?:shot|close-up|full body|upper body|lower body|eye level|low angle|high angle|pov|view)\b/i.test(parts[1] || "");
  const characterStart = dynamicProjection ? 3 : 1;
  const characterEnd = characterStart + characterCount * 2;
  if (parts.length < characterEnd) return prompt;
  if (strategy === "focused-dynamic") {
    const projection = scenario ? FOCUSED_DYNAMIC[scenario] : undefined;
    if (!projection) return prompt;
    const characterTags = Array.from({ length: characterCount }, (_value, index) =>
      parts[characterStart + index * 2 + 1] || ""
    );
    const environmentAndCamera = parts.slice(characterEnd + 1);
    const camera = dynamicProjection ? parts[1] : environmentAndCamera.at(-1) || "";
    const environment = dynamicProjection ? parts.slice(characterEnd) : environmentAndCamera.slice(0, -1);
    return join([
      parts[0],
      camera,
      [projection.primary, projection.secondary, projection.staging].filter(Boolean).join(", "),
      ...characterTags,
      ...environment
    ]);
  }
  if (strategy === "role-bound-actions") {
    const replacement = scenario ? ROLE_BOUND_ACTIONS[scenario] : undefined;
    if (!replacement || replacement.characters.length !== characterCount) return prompt;
    const roleBound: string[] = [];
    for (let index = 0; index < characterCount; index += 1) {
      roleBound.push(replacement.characters[index], parts[characterStart + index * 2 + 1] || "");
    }
    return join([parts[0], ...roleBound, replacement.shared, ...parts.slice(characterEnd + 1)]);
  }
  const merged: string[] = [];
  for (let index = 0; index < characterCount; index += 1) {
    const composition = parts[characterStart + index * 2] || "";
    const tags = parts[characterStart + index * 2 + 1] || "";
    if (strategy === "anchored-natural-language") {
      const ordinal = index === 0 ? "first" : index === 1 ? "second" : `${index + 1}th`;
      const pronoun = /\b(?:girl|woman|female)\b/i.test(tags) ? "Her" : /\b(?:boy|man|male)\b/i.test(tags) ? "His" : "Their";
      merged.push(`The ${ordinal} character has these visible traits: ${tags}. ${pronoun} position, pose, action, and gaze are: ${composition}. Keep the ${ordinal} character's traits separate from every other character`);
    } else {
      merged.push(strategy === "merged-tags-first" ? [tags, composition].filter(Boolean).join(", ") : [composition, tags].filter(Boolean).join(", "));
    }
  }
  return join([parts[0], ...merged, ...parts.slice(characterEnd)]);
}

export function expandPromptStrategies(cases: PromptStudyCase[], strategies: PromptStrategy[]): PromptStudyCase[] {
  return cases.map((studyCase) => ({
    ...studyCase,
    candidates: studyCase.candidates.flatMap((candidate) => strategies.map((strategy): PromptCandidate => ({
      ...candidate,
      id: `${candidate.id}--${strategy}`,
      model: `${candidate.model} [${strategy}]`,
      positive: strategy === "saved-production"
        ? candidate.savedPositive
        : strategy === "compact-production" && candidate.compactPositive
          ? candidate.compactPositive
        : strategy === "legacy-production" && candidate.legacyPositive
          ? candidate.legacyPositive
          : applyPromptStrategy(candidate.positive, studyCase.characterCount, strategy, studyCase.scenario)
    })))
  })).filter((studyCase) => studyCase.candidates.length >= 2);
}
