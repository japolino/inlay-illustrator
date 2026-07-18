import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import {
  chooseCreativeConcepts,
  creativeConceptConstraint,
  creativeIdeationInstruction,
  hasUnusedCreativeConcepts,
  parseCreativeConcepts,
  rebaseCreativeConcepts
} from "./creative.js";
import type { CreativeConcept, PreparedParagraph } from "./types.js";

const paragraphs: PreparedParagraph[] = [
  { parserIndex: 1, originalIndex: 4, text: "She peers through her fingers." },
  { parserIndex: 2, originalIndex: 5, text: "Her feet remain planted." }
];

function concept(id: string, score: number): CreativeConcept {
  return {
    id,
    paragraph: 1,
    subjectType: "object",
    anchor: id,
    concept: `${id} composition`,
    renderScope: `${id} in frame`,
    camera: "extreme close-up",
    visibleCues: [id],
    score
  };
}

describe("Creative concept ideation", () => {
  test("parses bounded structured candidates and assigns stable IDs", () => {
    const response = JSON.stringify({ candidates: [
      { paragraph: 1, subjectType: "shadow", anchor: "finger shadow", concept: "interlaced finger shadows cross the wall", renderScope: "shadow geometry and blank wall", camera: "tight oblique detail", visibleCues: ["interlaced shadows", "wall"], score: 94 },
      { paragraph: 1, subjectType: "fragment", anchor: "trembling fingers", concept: "fingertips hover at the edge of frame", renderScope: "fingertips and empty negative space", camera: "macro side detail", visibleCues: ["fingertips", "negative space"], score: 86 },
      { paragraph: 2, subjectType: "shadow", anchor: "still shadow", concept: "still shadow against the wall", renderScope: "unreadable silhouette and wall", camera: "wide negative-space shot", visibleCues: ["shadow", "wall"], score: 73 },
      { paragraph: 2, subjectType: "environment", anchor: "floor scuff", concept: "fresh scuff marks interrupt the floor", renderScope: "floor texture and scuff marks", camera: "low detail shot", visibleCues: ["floor", "scuff marks"], score: 68 },
      { paragraph: 1, subjectType: "fragment", anchor: "eye gap", concept: "one eye between fingers", renderScope: "one red eye and two fingers", camera: "extreme close-up", visibleCues: ["red eye", "fingers"], score: 99 },
      { paragraph: 99, subjectType: "object", anchor: "invalid", concept: "unknown paragraph", renderScope: "nothing", camera: "close-up", visibleCues: ["nothing"], score: 100 }
    ] });

    const first = parseCreativeConcepts(response, paragraphs, DEFAULT_CONFIG);
    const second = parseCreativeConcepts(response, paragraphs, DEFAULT_CONFIG);

    expect(first).toHaveLength(4);
    expect(first.map((candidate) => candidate.paragraph)).toEqual([1, 1, 2, 2]);
    expect(first.map((candidate) => candidate.id)).toEqual(second.map((candidate) => candidate.id));
    expect(first[0].id).toStartWith("creative-");
    expect(first.every((candidate) => candidate.anchor !== "eye gap")).toBe(true);
  });

  test("selects randomly among strong candidates while excluding used concepts", () => {
    const candidates = [concept("best", 95), concept("second", 85), concept("third", 75), concept("weak", 20)];

    expect(chooseCreativeConcepts(candidates, [], () => 0).get(1)?.id).toBe("best");
    expect(chooseCreativeConcepts(candidates, [], () => 0.999).get(1)?.id).toBe("third");
    expect(chooseCreativeConcepts(candidates, ["best"], () => 0).get(1)?.id).toBe("second");
    expect(hasUnusedCreativeConcepts(candidates, candidates.map((candidate) => candidate.id))).toBe(false);
  });

  test("binds selected concepts for manual or Adaptive parsing and rebases cached reruns", () => {
    const selected = new Map([[1, concept("eye-gap", 92)]]);
    const manual = creativeConceptConstraint(selected, false);
    const adaptive = creativeConceptConstraint(selected, true);

    expect(manual).toContain("Each listed concept is binding");
    expect(manual).toContain("Binding render scope: eye-gap in frame");
    expect(adaptive).toContain("## Optional Creative Candidates");
    expect(adaptive).toContain("First choose perspectiveMode independently");
    expect(adaptive).toContain("Creative suitability: 92/100");
    expect(rebaseCreativeConcepts([...selected.values()], 1)[0]).toMatchObject({ id: "eye-gap", paragraph: 1 });
  });

  test("asks for orthogonal candidates and avoids concepts used by prior reruns", () => {
    const instruction = creativeIdeationInstruction(DEFAULT_CONFIG, ["one eye between fingers"]);

    expect(instruction).toContain("exactly four candidates");
    expect(instruction).toContain("differ in focal anchor");
    expect(instruction).toContain("Never render a simile literally");
    expect(instruction).toContain("must not focus on recognizable identity-bearing character features");
    expect(instruction).toContain('"subjectType":"object"');
    expect(instruction).toContain("one eye between fingers");
  });
});
