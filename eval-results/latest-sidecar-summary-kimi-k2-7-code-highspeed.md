# Sidecar simulation summary

Run: 2026-07-19T01-15-54-515Z
Requests: 9
Scenarios: 8

## Model matrix

| Model | Passed | Raw JSON | Censored | Average score | Critical issues | Tokens |
|---|---:|---:|---:|---:|---:|---:|
| Kimi (Moonshot/kimi-k2.7-code-highspeed) | 6/8 | 6/8 | 0 | 74.3 | 2 | 56095 |

## Failure groups

- rendering.pipeline_error: 2
- schema.composition_punctuation: 1
- semantics.duplicate_action_owner: 1

## Case details

### rhea_platform_conflict - Moonshot/kimi-k2.7-code-highspeed

PASS | score 100 | 13548 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1girl, 1boy, left foreground, leaning toward the man, gripping the man's sleeve, pointing toward the departing train, glaring at the man, woman, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, navy officer coat, white shirt, red sash, black trousers, knee-high black boots, angry, glaring, furrowed brows, right midground, recoiling backward with shoulders hunched, recoiling, looking directly

### rhea_corridor_continuity - Moonshot/kimi-k2.7-code-highspeed

PASS | score 94 | 15017 ms | raw JSON yes
- note schema.composition_punctuation: P1 composition is not atomic: right of frame, slightly behind the man
- note semantics.duplicate_action_owner: P1 duplicates an action between character and sharedComposition and required renderer deduplication
- P1 dynamic: 1girl, 1boy, running, right of frame, running with torso twisted backward, running left, looking backward, looking behind, woman, adult woman, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, navy officer coat, white shirt, red sash, black trousers, knee-high black boots, left foreground, running forward, running left, pulling the woman's wrist, man, adult man, messy short black hair, green e

### rhea_compartment_attire_removal - Moonshot/kimi-k2.7-code-highspeed

FAIL | score 0 | 16967 ms | raw JSON no
- critical rendering.pipeline_error: Parser did not return usable JSON scenes.

### static_visual_novel - Moonshot/kimi-k2.7-code-highspeed

PASS | score 100 | 9345 ms | raw JSON yes
- No detected issues.
- P1 static: 1girl, solo, slightly forward from the background, standing upright with one hand resting on a closed book, looking at viewer, girl, mature female, burgundy cardigan, white blouse, charcoal skirt, guarded expression, academy library, late afternoon, warm late-afternoon light, bookshelves, stacked books, medium shot, eye level, straight-on, deep focus

### creative_mundane_anchor - Moonshot/kimi-k2.7-code-highspeed

PASS | score 100 | 6933 ms | raw JSON yes
- No detected issues.
- P1 creative: 1girl, solo, close-up of hands, fountain pen, and blank signature line on resignation letter, hands, fountain pen, blank signature line, paper, fingers hovering, quiet office desk, daytime, soft overhead fluorescent lighting, muted professional atmosphere, wooden desk, stack of paperwork, office chair, close-up, high angle, from above, shallow depth of field

### adaptive_urgent_action - Moonshot/kimi-k2.7-code-highspeed

FAIL | score 0 | 19414 ms | raw JSON no
- critical rendering.pipeline_error: Parser did not return usable JSON scenes.

### stale_context_override - Moonshot/kimi-k2.7-code-highspeed

PASS | score 100 | 6953 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1girl, solo, on the east canyon wall, climbing with body pressed against rock face, climbing upward, looking up, girl, beige scarf, brown shirt, khaki trousers, climbing boots, focused, solitary figure ascending the rock face, sunlit desert canyon, midday, bright sunlight, harsh shadows, rocky canyon walls, clear sky, full body, low angle, from below, deep focus

### default_mode_compatibility - Moonshot/kimi-k2.7-code-highspeed

PASS | score 100 | 7482 ms | raw JSON yes
- No detected issues.
- P1 dynamic: cowboy shot, from below, low angle, 1girl, solo, adjusting telescope toward green comet, interior, hilltop observatory, midnight, dim lighting, brass telescope, domed ceiling, starry sky through open aperture, green comet, girl, mature female, cream sweater, brown trousers, awestruck, adjusting brass telescope, standing, looking up at green comet, midnight inside a hilltop observatory, a woman in cream sweater and br
