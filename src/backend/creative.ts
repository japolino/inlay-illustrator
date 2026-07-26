import type { Config } from "../shared/config.js";
import type { CreativeConcept, PreparedParagraph } from "./types.js";
import { cleanString } from "./utils.js";

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  const clean = value.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const candidates = [clean];
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(clean.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // A malformed optional ideation response falls back to the normal parser.
    }
  }
  return null;
}

function cleanCueList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanString).filter(Boolean))].slice(0, 6);
}

const CREATIVE_SUBJECT_TYPES = new Set([
  "object", "environment", "shadow", "silhouette", "reflection", "fragment", "spatial"
]);

const IDENTITY_BEARING_CUE = /\b(?:face|facial|cheek|chin|jaw|mouth|lip|lips|eye|eyes|iris|pupil|pupils|eyebrow|eyebrows|eyelash|eyelashes|hair|hairstyle|bangs|braid|ponytail|blonde|brunette|uniform|outfit|clothing|clothes|costume|dress|shirt|blouse|sweater|hoodie|coat|jacket|sleeve|collar|ribbon|tie|skirt|shorts|pants|trousers|stockings|pantyhose|sock|socks|shoe|shoes|boot|boots)\b/i;

function identityBearingClaim(value: string): string {
  const excludedIdentityList = /\b(?:no|without)\s+(?:recognizable\s+|visible\s+|complete\s+|identifying\s+)*(?:faces?|facial features?|hair|hairstyle|outfits?|clothing|clothes|complete bod(?:y|ies)|bod(?:y|ies)|figures?|people|persons?|characters?)(?:\s*(?:,|or|and)\s*(?:the\s+)?(?:faces?|facial features?|hair|hairstyle|outfits?|clothing|clothes|complete bod(?:y|ies)|bod(?:y|ies)|figures?|people|persons?|characters?))*/gi;
  return value
    .replace(excludedIdentityList, " ")
    .replace(/\b(?:faces?|facial features?|hair|hairstyle|outfits?|clothing|clothes|bod(?:y|ies)|figures?|people|persons?|characters?)\s+(?:is|are|remains?|stay|stays)?\s*(?:fully\s+|entirely\s+)?(?:cropped|excluded|outside|out of frame|not visible|unreadable|occluded)\b/gi, " ")
    .replace(/\b(?:crop|exclude|omit|hide|occlude)(?:s|d|ing)?\s+(?:the\s+)?(?:faces?|facial features?|hair|hairstyle|outfits?|clothing|clothes|bod(?:y|ies)|figures?|people|persons?|characters?)\b/gi, " ");
}

export function isIdentitySafeCreativeConcept(concept: CreativeConcept): boolean {
  if (!concept.subjectType || !CREATIVE_SUBJECT_TYPES.has(concept.subjectType)) return false;
  return isIdentitySafeCreativeCue([
    concept.anchor,
    concept.concept,
    concept.renderScope,
    ...concept.visibleCues
  ].join(" "));
}

export function isIdentitySafeCreativeCue(value: string): boolean {
  return !IDENTITY_BEARING_CUE.test(identityBearingClaim(value));
}

export function parseCreativeConcepts(
  value: string,
  paragraphs: PreparedParagraph[],
  config: Config
): CreativeConcept[] {
  const parsed = parseJsonObject(value);
  const rawCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  const validParagraphs = new Set(paragraphs.map((paragraph) => paragraph.parserIndex));
  const perParagraph = new Map<number, number>();
  const seenIds = new Set<string>();
  const concepts: CreativeConcept[] = [];
  for (const raw of rawCandidates) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    const paragraph = Number(String(candidate.paragraph ?? "").match(/\d+/)?.[0]);
    const subjectType = cleanString(candidate.subjectType).toLowerCase() as CreativeConcept["subjectType"];
    const anchor = cleanString(candidate.anchor);
    const concept = cleanString(candidate.concept);
    const renderScope = cleanString(candidate.renderScope);
    const camera = cleanString(candidate.camera);
    const visibleCues = cleanCueList(candidate.visibleCues);
    const scoreValue = Number(candidate.score);
    if (!validParagraphs.has(paragraph) || !subjectType || !CREATIVE_SUBJECT_TYPES.has(subjectType)
      || !anchor || !concept || !renderScope || !camera || visibleCues.length === 0) continue;
    if (!Number.isFinite(scoreValue)) continue;
    const score = Math.max(0, Math.min(100, Math.round(scoreValue)));
    const id = `creative-${stableHash([paragraph, subjectType, anchor, concept, renderScope, camera].join("|"))}`;
    const parsedConcept: CreativeConcept = {
      id,
      paragraph,
      subjectType,
      anchor,
      concept,
      renderScope,
      camera,
      visibleCues,
      score
    };
    if (!isIdentitySafeCreativeConcept(parsedConcept)) continue;
    if (seenIds.has(id)) continue;
    const count = perParagraph.get(paragraph) || 0;
    if (count >= 4) continue;
    seenIds.add(id);
    perParagraph.set(paragraph, count + 1);
    concepts.push(parsedConcept);
  }
  const finalCounts = new Map<number, number>();
  const paragraphScores = new Map<number, number>();
  concepts.forEach((concept) => finalCounts.set(concept.paragraph, (finalCounts.get(concept.paragraph) || 0) + 1));
  concepts.forEach((concept) => paragraphScores.set(
    concept.paragraph,
    Math.max(paragraphScores.get(concept.paragraph) || 0, concept.score)
  ));
  const eligibleParagraphs = [...new Set(concepts.map((concept) => concept.paragraph))]
    .filter((paragraph) => (finalCounts.get(paragraph) || 0) >= 2)
    .sort((left, right) => (paragraphScores.get(right) || 0) - (paragraphScores.get(left) || 0) || left - right)
    .slice(0, Math.max(1, config.maxImages));
  const allowed = new Set(eligibleParagraphs);
  return concepts.filter((concept) => allowed.has(concept.paragraph));
}

export function hasUnusedCreativeConcepts(candidates: CreativeConcept[], usedIds: Iterable<string>): boolean {
  const used = new Set(usedIds);
  return candidates.some((candidate) => isIdentitySafeCreativeConcept(candidate) && !used.has(candidate.id));
}

export function chooseCreativeConcepts(
  candidates: CreativeConcept[],
  usedIds: Iterable<string> = [],
  random: () => number = Math.random
): Map<number, CreativeConcept> {
  const used = new Set(usedIds);
  const grouped = new Map<number, CreativeConcept[]>();
  for (const candidate of candidates) {
    if (!isIdentitySafeCreativeConcept(candidate) || used.has(candidate.id)) continue;
    const group = grouped.get(candidate.paragraph) || [];
    group.push(candidate);
    grouped.set(candidate.paragraph, group);
  }
  const selected = new Map<number, CreativeConcept>();
  for (const [paragraph, group] of grouped) {
    const sorted = [...group].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    const bestScore = sorted[0]?.score ?? 0;
    const shortlist = sorted.filter((candidate) => candidate.score >= Math.max(50, bestScore - 20)).slice(0, 3);
    const pool = shortlist.length > 0 ? shortlist : sorted.slice(0, 1);
    if (pool.length === 0) continue;
    const floor = Math.min(...pool.map((candidate) => candidate.score)) - 5;
    const weights = pool.map((candidate) => Math.max(1, candidate.score - floor));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = Math.min(0.999999, Math.max(0, random())) * total;
    let choice = pool[pool.length - 1];
    for (let index = 0; index < pool.length; index += 1) {
      cursor -= weights[index];
      if (cursor < 0) {
        choice = pool[index];
        break;
      }
    }
    selected.set(paragraph, choice);
  }
  return selected;
}

export function creativeIdeationInstruction(config: Config, previousConcepts: string[] = []): string {
  return [
    "# Creative Illustration Concept Ideator",
    "Extract literal visual cues from the numbered source and propose genuinely different Creative compositions before the prompt parser runs.",
    config.adaptiveMode
      ? `Screen up to ${Math.max(1, config.maxImages)} paragraph numbers for optional identity-safe Creative alternatives, then generate exactly four candidates for each. These candidates must not decide or bias the later Adaptive mode choice.`
      : `Choose up to ${Math.max(1, config.maxImages)} visually strong paragraph numbers and generate exactly four candidates for each chosen paragraph.`,
    "Candidates for the same paragraph must differ in focal anchor and at least one of crop scale, subject inclusion, depth, occlusion, or viewpoint.",
    "Creative must not focus on recognizable identity-bearing character features. Never use a face, facial feature, hair, hairstyle, or recognizable clothing as the anchor or a visible cue.",
    "Never write a character name in anchor, concept, renderScope, camera, or visibleCues, even to say that person is cropped out. Use generic terms such as person, figure, or room occupant in exclusion wording.",
    "Allowed subjectType values are object, environment, shadow, silhouette, reflection, fragment, or spatial. Reflections and fragments must remain non-identifying; generic hands, fingers, feet, gestures, and fully unreadable silhouettes are allowed.",
    "Prefer overlooked but meaningful anchors: a source-supported object, environmental detail, shadow, unreadable silhouette, non-identifying fragment, foreground layer, aftermath, or unusual spatial relationship.",
    "If a paragraph has no faithful identity-safe anchor, return no Creative candidate for it. Do not weaken this rule merely to fill the requested count.",
    "Do not merely restate the paragraph's complete main action.",
    "Separate literal cues from metaphors and internal narration. Never render a simile literally and never invent an object, body part, action, or setting detail.",
    "renderScope is binding: state exactly what is inside the frame and what is cropped or occluded. visibleCues contains only traits and elements actually visible inside that scope.",
    "Repeat the exact source-specific anchor noun in anchor and at least one visibleCues entry. Never shorten a specific object into an ambiguous generic word: for example keep condom wrapper rather than wrapper, train ticket rather than paper, and broken mace head rather than debris.",
    "Preserve every explicit modifier on an included cue, such as black-gloved fingertip, bronze hand, red switch, wet handprint, or tied used condom. Never simplify an included cue in a way that changes its material, color, state, or ownership.",
    "Keep one or two source-supported grounding cues around the anchor so the image remains spatially legible, such as the bedside edge and rumpled sheet, arena arch and sand, or bus-shelter glass and rain. Avoid an extreme context-free macro unless the source itself contains no meaningful surrounding context.",
    "Score each candidate from 0-100 for source fidelity, focal specificity, visual clarity, ANIMA promptability, and difference from an obvious Dynamic full-action shot.",
    previousConcepts.length > 0
      ? `Avoid repeating these previously used concepts:\n- ${previousConcepts.map(cleanString).filter(Boolean).join("\n- ")}`
      : "",
    "Return raw JSON only with this exact shape:",
    '{"candidates":[{"paragraph":1,"subjectType":"object","anchor":"short anchor label","concept":"concise visible composition","renderScope":"exact contents of frame and crop","camera":"concise framing and viewpoint","visibleCues":["visible cue"],"score":85}]}',
    "No markdown, commentary, character-memory dump, or fields outside the schema."
  ].filter(Boolean).join("\n\n");
}

export function creativeIdeationRequest(targetSource: string): string {
  return [
    "Generate the Creative concept slate from this current numbered source:",
    targetSource
  ].join("\n\n");
}

export function creativeConceptConstraint(
  concepts: Map<number, CreativeConcept>,
  adaptive: boolean
): string {
  if (concepts.size === 0) return "";
  const lines = [...concepts.values()]
    .sort((left, right) => left.paragraph - right.paragraph)
    .map((concept) => [
      `[P${concept.paragraph}] concept ID: ${concept.id}`,
      `Anchor: ${concept.anchor}`,
      `Binding render scope: ${concept.renderScope}`,
      `Camera intent: ${concept.camera}`,
      `Visible cues only: ${concept.visibleCues.join(", ")}`,
      `Creative suitability: ${concept.score}/100`
    ].join("\n"));
  return [
    adaptive ? "## Optional Creative Candidates" : "## Selected Creative Concepts",
    adaptive
      ? "First choose perspectiveMode independently from the paragraph itself. Creative is permitted only for paragraphs listed below, and the listed candidate becomes binding only after Creative is chosen. Otherwise ignore it and choose Static or Dynamic normally. Do not choose Creative merely because a candidate or score is present."
      : "Use only the listed paragraphs for Creative shots. Each listed concept is binding and must control renderScope, visibleTags, camera, and subject inclusion.",
    "Creative may show only identity-safe objects, environments, shadows, unreadable silhouettes, spatial details, or non-identifying fragments. It must not show a recognizable face, hair, or outfit.",
    "When a binding render scope exists, do not expand it with the character's complete pose, full action, off-frame attire, or unrelated memory traits.",
    ...lines
  ].join("\n\n");
}

export function candidatesForParagraph(candidates: CreativeConcept[], paragraph: number): CreativeConcept[] {
  return candidates.filter((candidate) => candidate.paragraph === paragraph);
}

export function rebaseCreativeConcepts(candidates: CreativeConcept[], paragraph: number): CreativeConcept[] {
  return candidates.map((candidate) => ({ ...candidate, paragraph }));
}
