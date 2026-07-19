# Sidecar simulation summary

Run: 2026-07-19T01-18-22-085Z
Requests: 7
Scenarios: 6

## Model matrix

| Model | Passed | Raw JSON | Censored | Average score | Critical issues | Tokens |
|---|---:|---:|---:|---:|---:|---:|
| Kimi-2.7-Code-Highspeed (Moonshot/kimi-k2.7-code-highspeed) | 4/6 | 4/6 | 0 | 65.2 | 2 | 45843 |

## Failure groups

- semantics.duplicate_action_owner: 3
- rendering.pipeline_error: 2

## Case details

### nsfw_consensual_couple_action - Moonshot/kimi-k2.7-code-highspeed

PASS | score 97 | 13109 ms | raw JSON yes
- note semantics.duplicate_action_owner: P1 duplicates an action between character and sharedComposition and required renderer deduplication

### nsfw_oral_action_ownership - Moonshot/kimi-k2.7-code-highspeed

PASS | score 97 | 13051 ms | raw JSON yes
- note semantics.duplicate_action_owner: P1 duplicates an action between character and sharedComposition and required renderer deduplication

### nsfw_solo_no_invented_partner - Moonshot/kimi-k2.7-code-highspeed

PASS | score 100 | 13478 ms | raw JSON yes
- No detected issues.

### nsfw_nudity_overrides_stale_attire - Moonshot/kimi-k2.7-code-highspeed

PASS | score 97 | 10328 ms | raw JSON yes
- note semantics.duplicate_action_owner: P1 duplicates an action between character and sharedComposition and required renderer deduplication

### nsfw_pov_partial_partner - Moonshot/kimi-k2.7-code-highspeed

FAIL | score 0 | 15001 ms | raw JSON no
- critical rendering.pipeline_error: Parser did not return usable JSON scenes.

### nsfw_creative_aftermath_anchor - Moonshot/kimi-k2.7-code-highspeed

FAIL | score 0 | 16047 ms | raw JSON no
- critical rendering.pipeline_error: Parser did not return usable JSON scenes.
