# All-modes parser and image evaluation

Date: 2026-07-25

## Outcome

Dynamic, Static, Creative, Adaptive, and Default compatibility now have production parser contracts, deterministic normalization, regression fixtures, sidecar conformance coverage, and real ComfyUI image evidence.

- Sidecar conformance: passing evidence for 35/35 scenarios.
- ComfyUI generation: 35/35 scenarios produced images with the supplied API workflow and fixed evaluation prefixes.
- Vision evaluation: attempted for 35/35 scenarios; 34/35 received judgments. The remaining explicit adult case returned empty vision output and is recorded as censorship rather than a generation or parser failure.
- Local verification: 193 tests passed; strict source/build TypeScript checks, production build, bundle syntax checks, secret scan, and `git diff --check` passed.

## Production changes

- Dynamic uses a compact role-bound `shotPlan`, keeps full character baselines for ordinary framing, projects only crop-visible identity in true fragments, and prioritizes source-critical action visibility over arbitrary camera variety.
- Static uses fixed visual-novel framing, concrete resting poses, readable backgrounds, and deterministic left/right shallow lanes for two characters.
- Creative binds an identity-safe concept, supports true zero-character object/environment frames, preserves exact source anchor modifiers, and does not restore a complete character after selecting a fragment or aftermath.
- Adaptive routes stable beats to Static, visible action to Dynamic, and identity-safe aftermath/object anchors to Creative. It cannot choose Creative by camera drama alone or omit the paragraph's only required action.
- Continuity is explicitly forward-only. Later attire, props, transformations, actions, and environments cannot leak backward into earlier shots.
- Exact concrete environment nouns are retained instead of generalized or invented replacements.
- Adult age markers apply to every shot in an explicitly adult sexual sequence, including setup shots.
- Atomic composition normalizes subject-facing `camera` to `viewer` and removes closed-eye expression state from gaze.
- Semantic evaluation recognizes Dynamic actions in `shotPlan`, supports concept-dependent character sets, validates Adaptive routing, and distinguishes vision censorship from parser failure.

## Conformance evidence

| Scope | Model | Result |
|---|---|---:|
| Full general suite | GPT-5.6 Luna | 11/11 pass, 99.7 average, 0 critical issues |
| Expanded Dynamic fixtures | GPT-5.6 Luna | 7/7 pass, 100 average |
| Expanded Static fixtures | GPT-5.6 Luna | 2/2 pass, 100 average |
| Expanded Creative fixtures | GPT-5.6 Luna | 2/2 pass, 100 average |
| Expanded Adaptive fixtures | GPT-5.6 Luna | 2/2 pass, 100 average |
| Primary adult suite | Claude Sonnet 5 | 8/8 pass across full and targeted retries |
| Expanded adult suite | Claude Sonnet 5 | 3/3 pass across initial and targeted retry |

Luna's redundant final combined expanded sweep was interrupted by HTTP 429 (`CODEX3` quota exhausted). This does not leave a scenario uncovered: every one of its 13 non-adult expanded scenarios already has a passing targeted result, and the full 35-scenario audit confirms passing evidence for every fixture.

## Image and vision evidence

The supplied ComfyUI API workflow, fixed positive/negative prefixes, and seeds `1103` and `2909` were held constant within comparisons.

| Mode | Comparison result |
|---|---|
| Dynamic | Current production beat legacy 10-7 with 1 tie; current and compact were near-even at 9-8 with 1 tie |
| Static | Production 2, frozen 2, ties 4; no systematic regression |
| Creative | Tuned 6, frozen 3, tie 1 |
| Adaptive | Tuned 13, frozen 15; near-even aggregate, with tuned prompts fixing critical backward transformation leakage and exact environment/prop fidelity |
| Adult follow-up | Production 9, legacy 6, ties 9 across 24 completed comparisons; 2 additional comparisons were vision-censored |

Adaptive did not produce an aggregate aesthetic win, but it corrected higher-severity semantic defects: future wings no longer appear in earlier calm scenes, future sexual props no longer leak into setup shots, and exact medieval/magical environment anchors survive.

## Remaining weaknesses

- Anima can still reverse difficult multi-character actions or omit secondary actions despite correct prompts.
- Compact Dynamic rendering remains competitive with current production and should stay available as an evaluation comparator.
- Claude sometimes wraps otherwise valid JSON; production recovery succeeds, but raw compliance is less consistent than Luna.
- Automatic vision review is triage evidence. One adult scenario was censored with empty output, and high-value changes should still receive human spot-checking.
