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
      { paragraph: 1, anchor: "eye gap", concept: "one eye between fingers", renderScope: "one red eye and two fingers", camera: "extreme close-up", visibleCues: ["red eye", "fingers"], score: 94 },
      { paragraph: 1, anchor: "rooted feet", concept: "feet fixed to the floor", renderScope: "lower legs and planted feet", camera: "low body-part focus", visibleCues: ["white pantyhose", "shoes"], score: 86 },
      { paragraph: 2, anchor: "shadow", concept: "still shadow against the wall", renderScope: "character shadow and wall", camera: "wide negative-space shot", visibleCues: ["shadow", "wall"], score: 73 },
      { paragraph: 2, anchor: "door frame", concept: "hand visible beyond a door frame", renderScope: "door frame and one hand", camera: "obstructed side view", visibleCues: ["door frame", "hand"], score: 68 },
      { paragraph: 99, anchor: "invalid", concept: "unknown paragraph", renderScope: "nothing", camera: "close-up", visibleCues: ["nothing"], score: 100 }
    ] });

    const first = parseCreativeConcepts(response, paragraphs, DEFAULT_CONFIG);
    const second = parseCreativeConcepts(response, paragraphs, DEFAULT_CONFIG);

    expect(first).toHaveLength(4);
    expect(first.map((candidate) => candidate.paragraph)).toEqual([1, 1, 2, 2]);
    expect(first.map((candidate) => candidate.id)).toEqual(second.map((candidate) => candidate.id));
    expect(first[0].id).toStartWith("creative-");
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
    expect(adaptive).toContain("Creative is permitted only for paragraphs listed below");
    expect(adaptive).toContain("Creative suitability: 92/100");
    expect(rebaseCreativeConcepts([...selected.values()], 1)[0]).toMatchObject({ id: "eye-gap", paragraph: 1 });
  });

  test("asks for orthogonal candidates and avoids concepts used by prior reruns", () => {
    const instruction = creativeIdeationInstruction(DEFAULT_CONFIG, ["one eye between fingers"]);

    expect(instruction).toContain("exactly four candidates");
    expect(instruction).toContain("differ in focal anchor");
    expect(instruction).toContain("Never render a simile literally");
    expect(instruction).toContain("one eye between fingers");
  });
});
