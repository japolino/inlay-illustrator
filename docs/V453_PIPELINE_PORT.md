# Lightboard 4.5.3 Lumiverse port

The active parser and prompt compiler use the supplied 4.5.3 sources. The older `v376` record envelope remains for storage compatibility; a new descriptor is stored at `slot.rawShot.lightboard`. Existing records use their original reroll compiler.

## Behavior mapping

| Lightboard source | Lumiverse adaptation |
| --- | --- |
| `lb-xnai.lb`, whole.tag / whole.nl, descriptions, examples, job and format | Source templates compiled with explicit configuration variables and TOON decoding |
| Scene slots and comic panels | Validated insertion slots mapped to prepared message paragraphs; images appear before their paragraph |
| `keyvis` | Cover slot with separate aspect, size, and top/bottom placement |
| Camera, appearance, focus, direction and quantity toggles | Parser and Generation controls |
| `compileDescriptor`, `lightboard.image` | Positive/negative templates, setup/character/description placeholders, attenuation and weight conversion |
| Preset selection | Existing user-scoped Lumiverse preset save/select/update/rename/delete flow |
| Persona, character and lorebooks | Lumiverse context APIs and activated world-book entries, including `lb-xnai.lb.extra` |
| Descriptor history | Per-user, per-chat saved history; only preceding message IDs enter parser context; clear action in settings |
| Manual generation and descriptor changes | Prepare-first generation, lightbox field editor, reroll and reparse actions |
| Image calls and display | Spindle image generation, stored records, progressive chat markup, gallery and lightbox |

The port uses Lumiverse paragraphs rather than Risu newline offsets. It uses the existing Lumiverse lightbox/settings UI rather than injecting the Risu webview or chat-command JSON patch protocol. Risu-specific prefill, obfuscation, and reasoning-book injection are not part of the active request. Asset portraits remain a Lumiverse-specific mode. Legacy configuration values and records are retained for compatibility.

## Provider boundary

NovelAI profiles inherit their model and generation parameters. Explicit extension parameters override the profile. `resolution` and `guidance` are sent using the names consumed by the inspected host driver. V4/V5 character positives use `characterTags`; older models receive a combined prompt. The inspected host shares a single negative caption between character channels, so character negatives are merged into that caption. Independent per-character negative channels would require a Lumiverse host change.

ComfyUI supports the connection workflow library, its active workflow and an explicit workflow selection. Requests omit prebuilt workflow graphs so the Spindle bridge runs its workflow-selection and source-upload step. Reference images use `resolvedSourceImages` and the `init_image` mapping. Strength is sent as `denoise` and `comfyui_field_values.denoise`, including zero when disabled. This requires a workflow whose mapped control disables reference conditioning at zero; a generic img2img sampler does not necessarily have that behavior. Workflows without a source mapping keep their sampling settings when references are off and reject enabled references before generating snapshots.

NovelAI snapshots use the host's Director character-reference path; use a model supporting that facility. SwarmUI receives a source image through the host's source-image path. Other providers can generate ordinary illustrations but do not receive snapshots.

## Dedicated snapshot lifecycle

Snapshots are neutral reference portraits generated before scene images. They are never selected from chat images, never inserted into chat, and never added to the extension gallery. Named characters receive reusable references; unnamed subjects still appear in prompts but do not get a persistent identity cache.

The cache is isolated by user and keyed by chat, character/cast names, connection, model, workflow, connection metadata, style preset, prompt additions and refresh revision. NovelAI uses one portrait per character; single-source providers use a dedicated cast sheet. Concurrent requests share creation of the same snapshot. Reference creation itself has references disabled to avoid recursion. Cancellation is checked before and after host calls; already-submitted provider work may still finish.

## Verification

Regression tests cover source-template branches, TOON and slot validation, optional names, prompt/weight compilation, parser retry/context/history behavior, cancellation, snapshot isolation and reuse, dedicated cast sheets, ComfyUI zero-strength forwarding, NovelAI wire parameters, prepare-then-generate, descriptor editing, and legacy rerolls. The repository's broader host/context/storage/rendering tests remain in place.

Live image-provider output and visual quality have not been tested. No provider credentials or active Lumiverse session were used for verification. Host behavior was checked against the pinned source revisions in [source provenance](../references/v453/README.md).
