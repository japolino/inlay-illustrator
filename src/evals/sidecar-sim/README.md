# Sidecar simulation

This harness sends the production Inlay parser contract and production-shaped continuity context to the three configured proxy models, then evaluates each response through the same local recovery, continuity, selection, and rendering transformations used by the extension.

Set these environment variables in the process that launches Bun:

- `INLAY_SIDECAR_ENDPOINT`: OpenAI-compatible `/v1/chat/completions` URL
- `INLAY_SIDECAR_API_KEY`: bearer token

Run the complete suite with `bun run eval:sidecars`. Optional filters use `--model=`, `--scenario=`, `--rounds=`, and `--max-requests=`. For example:

```text
bun run eval:sidecars --model=deepseek --scenario=adaptive_urgent_action --rounds=2
```

Run the isolated adult-only NSFW conformance suite with `bun run eval:sidecars --suite=nsfw`. Its tracked summary omits explicit prompt previews, while full raw responses remain gitignored. In this suite, an empty Gemini response is explicitly reported as censorship rather than a generic parser failure.

The command resolves exact IDs from `/v1/models`, runs models sequentially, writes a sanitized summary to `eval-results/latest-sidecar-summary.md`, and stores detailed raw artifacts in the gitignored `eval-results/raw/` directory. Never put credentials in command arguments, source files, or result artifacts.

To benchmark one additional proxy model without changing the default target set, pass its exact discovered ID through `--model-id=`, an optional display name through `--model-label=`, and a safe summary suffix through `--report-label=`.
