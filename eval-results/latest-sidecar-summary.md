# Sidecar simulation summary

Run: 2026-07-19T00-24-57-572Z
Requests: 27
Scenarios: 8

## Model matrix

| Model | Passed | Raw JSON | Average score | Critical issues | Tokens |
|---|---:|---:|---:|---:|---:|
| DeepSeek V4 Pro (DeepSeek-A/deepseek-v4-pro) | 8/8 | 8/8 | 99.3 | 0 | 75636 |
| Gemini 3.1 Pro Preview (Gemini/gcli-gemini-3.1-pro-preview) | 8/8 | 6/8 | 99.3 | 0 | 64500 |
| GPT-5.6 Luna (CODEX/gpt-5.6-luna) | 8/8 | 8/8 | 100.0 | 0 | 67925 |

## Failure groups

- schema.composition_punctuation: 2
- raw.json_recovery: 2

## Case details

### rhea_platform_conflict - DeepSeek-A/deepseek-v4-pro

PASS | score 100 | 60152 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1girl, 1boy, left, standing upright, pointing toward departing train, looking at another, woman, mature female, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, navy officer coat, white shirt, red sash, black trousers, knee-high black boots, angry, furrowed eyebrows, glaring, right, leaning back, recoiling, looking at another, man, mature male, messy short black hair, green eyes, freckles, le

### rhea_platform_conflict - Gemini/gcli-gemini-3.1-pro-preview

PASS | score 100 | 65318 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1girl, 1boy, left side, standing upright, pointing toward background, looking at right man, girl, mature female, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, navy officer coat, white shirt, red sash, black trousers, knee-high black boots, angry, glaring, right side, leaning back, recoiling backward, looking at left woman, boy, mature male, messy short black hair, green eyes, freckles, lea

### rhea_platform_conflict - CODEX/gpt-5.6-luna

PASS | score 100 | 14821 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1girl, 1boy, left foreground, standing firmly on the platform, gripping the other person's sleeve, pointing toward the departing train, looking toward the departing train, girl, mature female, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, navy officer coat, white shirt, red sash, black trousers, knee-high black boots, angry, furrowed brows, right foreground, recoiling backward on the platf

### rhea_corridor_continuity - DeepSeek-A/deepseek-v4-pro

PASS | score 97 | 89467 ms | raw JSON yes
- note schema.composition_punctuation: P1 composition is not atomic: leaning backward, looking over shoulder
- P1 dynamic: 1boy, 1girl, left side of frame, running forward, running left, pulling the right woman by the wrist, looking ahead, man, adult man, messy short black hair, green eyes, freckles, lean build, gray hooded jacket, dark jeans, white sneakers, right side of frame, leaning backward, looking backward, woman, adult woman, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, navy officer coat, white shirt

### rhea_corridor_continuity - Gemini/gcli-gemini-3.1-pro-preview

PASS | score 100 | 33151 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1boy, 1girl, duo, running, escaping, left side of frame, running, moving left, looking forward, man, adult man, messy short black hair, green eyes, freckles, lean build, gray hooded jacket, dark jeans, white sneakers, serious, right side of frame, running, mid-turn, moving left, looking backward at mechanical hand, woman, adult woman, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, navy offi

### rhea_corridor_continuity - CODEX/gpt-5.6-luna

PASS | score 100 | 19466 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1girl, 1boy, right side of frame, running left, looking backward toward the partial bronze mechanical hand, woman, adult woman, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, navy officer coat, white shirt, red sash, black trousers, knee-high black boots, left side of frame, running left, running left while pulling forward by the wrist, looking forward, man, adult man, messy short black hai

### rhea_compartment_attire_removal - DeepSeek-A/deepseek-v4-pro

PASS | score 100 | 55827 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1girl, 1boy, left woman, leaning forward, bandaging the other's hand, focused on the hand, woman, adult woman, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, white shirt, rolled-up sleeves, black trousers, knee-high black boots, tense, alert, right man, extending injured palm, looking at the woman, man, adult man, messy short black hair, green eyes, freckles, lean build, gray hooded jacket,

### rhea_compartment_attire_removal - Gemini/gcli-gemini-3.1-pro-preview

PASS | score 100 | 16572 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1girl, 1boy, on the left, leaning forward, bandaging a hand, looking at hands, woman, adult woman, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, white shirt, rolled up sleeves, black trousers, knee-high black boots, tense, alert, on the right, seated upright, extending injured palm, looking at hands, man, adult man, messy short black hair, green eyes, freckles, lean build, gray hooded jack

### rhea_compartment_attire_removal - CODEX/gpt-5.6-luna

PASS | score 100 | 20068 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1girl, 1boy, left foreground beside the compartment seat, leaning forward with both hands near the injured palm, bandaging the injured palm, looking at the injured palm, woman, adult woman, tan skin, long white braid, golden eyes, scar through left eyebrow, tall, white shirt with rolled-up sleeves, black trousers, knee-high black boots, tense, alert, furrowed brows, right foreground on the compartment seat, seated wi

### static_visual_novel - DeepSeek-A/deepseek-v4-pro

PASS | score 100 | 70073 ms | raw JSON yes
- No detected issues.
- P1 static: 1girl, solo, slightly forward from the background, standing with one hand resting on a closed book, looking at viewer, girl, mature female, burgundy cardigan, white blouse, charcoal skirt, narrowed eyes, serious, academy library, late afternoon, bookshelves, books, medium shot, eye level, straight-on, deep focus

### static_visual_novel - Gemini/gcli-gemini-3.1-pro-preview

PASS | score 97 | 16569 ms | raw JSON no
- note raw.json_recovery: Response required production JSON recovery
- P1 static: 1girl, solo, slightly forward from the background, standing upright with one hand resting on a closed book, looking at viewer, girl, mature female, burgundy cardigan, white blouse, charcoal skirt, guarded expression, academy library, late afternoon, warm sunlight, quiet atmosphere, wooden bookshelves, reading table, library architecture, medium shot, eye level, straight-on, deep focus

### static_visual_novel - CODEX/gpt-5.6-luna

PASS | score 100 | 10833 ms | raw JSON yes
- No detected issues.
- P1 static: 1girl, solo, slightly forward from the background, standing upright with one hand resting on a closed book, looking at viewer, girl, burgundy cardigan, white blouse, charcoal skirt, guarded, academy library, late afternoon, warm window light, quiet indoor atmosphere, tall bookshelves, closed book, library tables, medium shot, eye level, straight-on, deep focus

### creative_mundane_anchor - DeepSeek-A/deepseek-v4-pro

PASS | score 100 | 58782 ms | raw JSON yes
- No detected issues.
- P1 creative: other, Only the paper surface, the signature line, the pen nib, and the immediate surrounding area. The hand and larger desk are cropped out, blank signature line on white paper, fountain pen nib hovering directly above the line, blurred pen barrel and fingers in background, Macro lens, top-down at a slight oblique angle to show the gap

### creative_mundane_anchor - Gemini/gcli-gemini-3.1-pro-preview

PASS | score 100 | 14752 ms | raw JSON yes
- No detected issues.
- P1 creative: Close crop of the bottom portion of the paper document. The physical hand and pen are entirely off-camera, visible only as a cast shadow, white paper document, blank signature line, cast shadow of hovering fingers, Top-down, close-up

### creative_mundane_anchor - CODEX/gpt-5.6-luna

PASS | score 100 | 15670 ms | raw JSON yes
- No detected issues.
- P1 creative: Only the lower portion of the resignation letter, the blank signature line, and the uncapped pen with its hovering fingertips are inside the frame, the rest of the desk and the person are cropped out, uncapped fountain pen, blank signature line, fingertips hovering above the pen, paper surface, Extreme close-up from a shallow side angle at paper level, focused on the pen nib and the empty line

### adaptive_urgent_action - DeepSeek-A/deepseek-v4-pro

PASS | score 97 | 74467 ms | raw JSON yes
- note schema.composition_punctuation: P2 composition is not atomic: standing, water up to boots
- P1 dynamic: 1boy, center-right, ducking, ducking right, looking back, boy, mature male, green rain jacket, tan work pants, brown boots, terrified, storm-damaged greenhouse interior, rainy weather, dim lighting, overcast, broken glass panes, plants, flooded floor, wide shot, low angle, three-quarter view
- P2 dynamic: 1boy, center, standing, pushing outward, looking forward, boy, mature male, green rain jacket, tan work pants, brown boots, terrified, storm-damaged greenhouse interior, rainy weather, dim lighting, overcast, broken glass panes, plants, flooded floor, medium shot, low angle, from behind

### adaptive_urgent_action - Gemini/gcli-gemini-3.1-pro-preview

PASS | score 100 | 27751 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1boy, solo, in the center, crouching slightly, ducking right away from a falling glass pane, looking away, boy, mature male, green rain jacket, tan work pants, boots, terrified, wide eyes, open mouth, inside a storm-damaged greenhouse, stormy weather, dim lighting, tense atmosphere, shattered glass, potted plants, rising water, cowboy shot, eye level, straight-on, motion blur
- P2 dynamic: 1boy, solo, at the greenhouse exit, leaning forward, bracing both hands against a jammed steel door, pushing outward, standing as water rises around boots, looking at the door, boy, mature male, green rain jacket, tan work pants, boots, straining, clenched teeth, inside a storm-damaged greenhouse, stormy weather, dim lighting, tense atmosphere, shattered glass, potted plants, rising water, full body, high angle, from

### adaptive_urgent_action - CODEX/gpt-5.6-luna

PASS | score 100 | 21948 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1boy, center foreground, crouching, ducking right as a glass pane falls behind him, looking toward the falling glass, boy, mature male, green rain jacket, tan work pants, brown work boots, terrified, foreground character with falling glass behind him, storm-damaged greenhouse, ongoing storm, dim gray daylight, harsh overcast light, broken glass panes, scattered glass shards, steel exit door, cowboy shot, eye level, t
- P2 dynamic: 1boy, beside the greenhouse exit in the foreground, standing and leaning forward, bracing both hands against the jammed steel door, pushing outward, standing as water rises around his boots, looking at the steel door, boy, mature male, green rain jacket, tan work pants, brown work boots, terrified, foreground character pressed against the steel exit door, storm-damaged greenhouse, ongoing storm, dim gray daylight, ha

### stale_context_override - DeepSeek-A/deepseek-v4-pro

PASS | score 100 | 47899 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1girl, solo, on canyon wall, climbing pose, climbing upward on east wall, looking up, girl, beige scarf, brown shirt, khaki trousers, climbing boots, desert canyon, midday, sunlit, canyon walls, desert ground, rock formations, full body, low angle, from side, deep focus

### stale_context_override - Gemini/gcli-gemini-3.1-pro-preview

PASS | score 100 | 19761 ms | raw JSON yes
- No detected issues.
- P1 dynamic: 1girl, solo, on the rock wall, climbing stance, climbing upward, girl, mature female, beige scarf, brown shirt, khaki trousers, climbing boots, desert canyon, midday, sunlit, east wall, full body, low angle, from below

### stale_context_override - CODEX/gpt-5.6-luna

PASS | score 100 | 13786 ms | raw JSON yes
- No detected issues.
- P1 dynamic: solo, against the east canyon wall, climbing upward with limbs braced against the rock, climbing upward, looking upward, other, beige scarf, brown shirt, khaki trousers, climbing boots, alone on the vertical canyon wall, east wall of a desert canyon, midday clear weather, bright sunlight, hard shadows, red sandstone canyon walls, desert rock formations, clear blue sky, full body, low angle, three-quarter view, deep f

### default_mode_compatibility - DeepSeek-A/deepseek-v4-pro

PASS | score 100 | 39218 ms | raw JSON yes
- No detected issues.
- P1 dynamic: from side, upper body, 1girl, solo, interior, observatory, hilltop, night, night sky, starry sky, green comet, brass telescope, dim lighting, girl, mature female, cream sweater, brown trousers, awestruck, standing, adjusting telescope, looking up, woman with awestruck expression, adjusting brass telescope, green comet through observatory dome, upper body from side, dim moonlight

### default_mode_compatibility - Gemini/gcli-gemini-3.1-pro-preview

PASS | score 97 | 17403 ms | raw JSON no
- note raw.json_recovery: Response required production JSON recovery
- P1 dynamic: medium shot, from side, straight-on, 1girl, solo, interior, observatory, night, midnight, starry sky, green comet, brass telescope, girl, mature female, cream sweater, long sleeves, brown trousers, pants, surprised, wide eyes, open mouth, standing, holding telescope, adjusting, looking away, looking up, a woman in a cream sweater and brown trousers stands inside a hilltop observatory at midnight, adjusting a large br

### default_mode_compatibility - CODEX/gpt-5.6-luna

PASS | score 100 | 9487 ms | raw JSON yes
- No detected issues.
- P1 dynamic: medium shot, from side, straight-on, 1girl, solo, adjusting a brass telescope toward a green comet, interior hilltop observatory, midnight, dark sky, starlight, green comet, brass telescope, girl, cream sweater, brown trousers, awestruck, standing, adjusting the telescope, looking toward the green comet, astronomer positioned beside the brass telescope, open observatory dome framing the green comet, midnight starligh
