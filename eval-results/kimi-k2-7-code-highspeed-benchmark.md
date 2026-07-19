# Kimi 2.7 Code Highspeed benchmark

Model: `Moonshot/kimi-k2.7-code-highspeed`
Runs: one general sweep and one adult NSFW sweep
Other models called during these runs: none

## Results

| Suite | Production pass | Overall average | Non-empty pass | Non-empty average | Average main latency |
|---|---:|---:|---:|---:|---:|
| General | 6/8 | 74.3 | 6/6 | 99.0 | 12.0 s |
| Adult NSFW | 4/6 | 65.2 | 4/4 | 97.8 | 13.5 s |

Every non-empty Kimi response passed the deterministic and semantic checks. The four failures were zero-content responses with `finish_reason: length`: Kimi used the entire normal 2,700- or 3,600-token completion allowance for hidden reasoning and never emitted visible JSON. The affected scenarios were general attire removal, general Adaptive urgent action, NSFW POV partial-partner contact, and the NSFW Creative aftermath anchor.

No answered case had a critical semantic failure. Noncritical findings were limited to atomic punctuation and duplicate action ownership that the renderer already normalizes or deduplicates.

## Comparison

On answered cases, Kimi's general quality (99.0) was effectively level with the final DeepSeek and Gemini scores (99.3) and just below Luna (100). Its answered NSFW quality (97.8) was close to DeepSeek and Gemini (98.5) and retained explicit semantics more reliably than Luna. However, under current production token budgets its overall usability was only 75% for the general suite and 67% for NSFW.

Kimi was materially faster in this run, averaging roughly 12-14 seconds per main parser request. After the benchmark, version 0.5 added automatic Kimi budgets of 16,000 tokens for main parsing, 12,000 for repair, and 8,000 for other parser stages. Targeted replays of all four formerly empty scenarios then passed at score 100 with strict JSON. The original one-sweep figures above remain unchanged so the benchmark still documents behavior under the earlier default budget.

Raw artifacts remain gitignored under:

- `eval-results/raw/general/2026-07-19T01-15-54-515Z/`
- `eval-results/raw/nsfw/2026-07-19T01-18-22-085Z/`
