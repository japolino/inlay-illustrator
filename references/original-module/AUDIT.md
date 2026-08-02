# Original module behavior audit

The runtime imports the two original instruction entries directly from the
tracked `card.json`. Fidelity tests compare the exported templates against those
entries byte for byte so wording changes cannot be introduced accidentally.

| Concern | Original module | Adopted resolution |
| --- | --- | --- |
| Illustration count | Defaults to 3–5 shots. | Restore 3–5 for new or missing configuration while retaining explicit saved values. |
| Preprocessing | Selects 3–5 paragraphs with significant visual changes/actions. | Use the original preprocessing instruction word for word; validate a bounded unique subset and fall back to raw numbered paragraphs on invalid output. |
| Parser roles | Core and tagging prompts are system messages; current source is a user message; client overrides follow it. | Restore that ordering while retaining connection, retry, timeout, and structured-output compatibility infrastructure. |
| Same-paragraph shots | A later result replaces an earlier result mapped to the same paragraph. | Restore last-result-wins paragraph mapping. |
| Batch choice | One mapped result per paragraph, sorted by paragraph and capped to the configured maximum. | Restore deterministic paragraph mapping and sorting. |
| Asset Mode | Exactly one visible character, viewer-facing portrait/cowboy framing, simple white background. | Restore the original instruction branch and matching prompt projection. |
| Continuity | Stable appearance tag reference plus recent narrative context. | Keep durable character tags and ordinary context; remove the advanced structured visual snapshot. |

## Deliberately excluded runtime behavior

The archived assistant prefill is not adopted. It fabricated an approval/tool
exchange for a particular provider and was not part of the image parser contract.
Provider-specific sampling presets and placeholder-code bypasses are likewise
not adopted. The runtime resolves the original plaintext instruction branch;
connections, models, and sampling parameters remain explicit extension settings.

Prompt presets, the prompt lightbox, quotes, fresh-seed rerolls, one-paragraph
sidecar reruns, storage compaction, runtime locking, and context-source controls
are retained as quality-of-life infrastructure around the v3.5 behavior.

## Reference artifacts

- `card.json`: original character-card/lorebook configuration and prompt material.
- `original_script.txt`: original Lua module implementation.
