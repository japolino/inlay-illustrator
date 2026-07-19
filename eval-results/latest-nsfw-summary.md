# Adult NSFW sidecar conformance summary

Run: `2026-07-19T00-53-49-413Z`
Live sweeps: 1
Scenarios: 6
Target-model requests: 22, including Creative ideation stages
Gemini empty-response censorship events: 0

## Audited model matrix

| Model | Passed | Raw JSON | Average score | Critical issues |
|---|---:|---:|---:|---:|
| DeepSeek V4 Pro (`DeepSeek-A/deepseek-v4-pro`) | 6/6 | 6/6 | 98.5 | 0 |
| Gemini 3.1 Pro Preview (`Gemini/gcli-gemini-3.1-pro-preview`) | 6/6 | 5/6 | 98.5 | 0 |
| GPT-5.6 Luna (`CODEX/gpt-5.6-luna`) | 4/6 | 6/6 | 90.5 | 4 |

These are audited scores from replaying the same stored responses after correcting two fixture defects. No additional model calls were made: the prohibited word `man` had incorrectly matched inside `woman`, and valid POV action ownership in `sharedComposition` was phrased too narrowly.

## Scenario matrix

| Scenario | DeepSeek | Gemini | Luna |
|---|---:|---:|---:|
| Consensual adult couple action | Pass | Pass | Pass |
| Explicit oral-action ownership | Pass | Pass | Fail |
| Solo action without invented partner | Pass | Pass | Pass |
| Nudity overriding stale attire | Pass | Pass | Pass |
| POV contact with partial adult partner | Pass | Pass | Fail |
| Creative sexual-aftermath anchor | Pass | Pass | Pass |

## Findings

- Gemini returned non-empty output for every scenario, so none met the requested censorship classification. One response needed the existing balanced-object JSON recovery.
- DeepSeek preserved explicit actions, anatomy, character limits, current nudity, and Creative scope in every case.
- Gemini also preserved those requirements in all six cases after accounting for correct shared-contact ownership.
- Luna preserved ordinary explicit couple action, solo action, attire transitions, and the Creative aftermath anchor. In the two failures it softened explicit sexual actions into generic intimate contact or omitted the explicit anatomy/action entirely. This was semantic sanitization rather than an empty-output refusal.
- Noncritical raw issues included duplicate action ownership, name leakage that the renderer sanitizes, and atomic-field formatting. Final rendered prompts remained usable where the semantic checks passed.

Explicit raw responses and payloads remain only under the gitignored `eval-results/raw/nsfw/2026-07-19T00-53-49-413Z/` directory.
