# Backend (Asset Maid 0.9.88 port on Lumiverse)

Entry: `src/backend.ts` builds one runtime (`src/backend/runtime.ts`) and wires it to Spindle:

- `registerInterceptor` -> `pipeline/markup.ts stripForInterceptor`: removes our baked illustration blocks and decodes
  native-asset suppression carriers in every request message (AM beforeRequest `iq`/`F5`).
- `GENERATION_ENDED` -> `pipeline.handleGenerationEnded` (automatic illustration of normal / swipe / regenerate replies when
  `autoGenerationEnabled`). `GENERATION_STARTED/STOPPED`, `MESSAGE_SWIPED/DELETED/EDITED`, `SWIPE_EDITED`, `CHAT_CHANGED/SWITCHED`,
  `CHARACTER_EDITED/DELETED` -> `pipeline.handleHostEvent` (+ sources cache invalidation).
- `onFrontendMessage`: fetch-bridge answers (`services/image-bytes.ts`), then RPC envelopes (`rpc/router.ts`). Other messages
  (0.9.x gallery / image details) are ignored.

## Runtime (per user)

`createBackendRuntime({host, modules})` keeps, per user id, the services (`services/index.ts createServicesRegistry`) and the
feature modules (`ModuleFactory`): `pipeline` (`pipeline/index.ts createPipelineModule`, `recover()` on creation) and
`analysis` (`analysis/index.ts createAnalysisModule`). Modules register themselves in `BackendModules` by declaration merging.
RPC handlers get an `RpcContext` = services + `modules`.

## Services (`src/backend/services`, interfaces in `types.ts`)

| Service | File | What |
|---|---|---|
| StorageService | `storage.ts` | userStorage with the contract layout: split config diffs, character documents (revision guard -> `conflict`), chat data, chat image settings, ui state, migrations + too-new guard, per-path FIFO writes, factory / character reset. Emits `config.changed`, `chatImageGeneration.changed`, `document.changed`. |
| LlmService | `llm.ts` | Connection profiles over `generate.raw` (explicit model), reasoning DTO, JSON mode + remembered 400 fallback, lenient JSON (engine `parseLenientJson`), vision detection + text-only fallback, retries = `generationAutoRetryCount` with fixed 100 ms delay, own timeout + AbortSignal. `analyzerClient()` = engine `AnalyzerClient` (retries 0: the engine retries). |
| ImageService | `images.ts` | `imageGen.generate`: NovelAI host parameters + `rawRequestOverride` (coords, per-character negatives, img2img), V4.5 director references (`resolvedReferenceImages`), ComfyUI workflow mapping (`workflow_id`, `resolvedSourceImages`, denoise), generic providers; serial queue with `novelaiParallelIntervalSec`; retries; abort. |
| ImageBytesService | `image-bytes.ts` | Contract fetch bridge (`src/shared/contract/bridge.ts`): image bytes and same-origin REST JSON via the frontend; uploads / crops from userStorage (`storage:` keys); legacy avatar responses. |
| SourcesService | `sources.ts` | Characters, chats (group members), personas, world books by scope; Asset Maid `Source/Member/LoreRecord` build; character images (avatar, gallery via bridge, expressions, risu asset map, generated). |
| EventBus / RunLog | `events.ts`, `run-log.ts` | RPC events with a monotonic seq; run log ring (250) + `log.appended`. |

Tests use `src/backend/testing/fake-host.ts` (in-memory Spindle host) and `fake-services.ts`.

## Chat pipeline (`src/backend/pipeline`)

`controller.ts` (jobs, triggers, locks, cancel, retry, recovery, publish, history / zoom / chat-state operations),
`generate.ts` (one message run: slots, analyzer context, engine run, persist), `engine-port.ts` + `providers.ts` (real engine
`createAssetMaidEngine`, NovelAI / ComfyUI / generic image provider adapters over ImageService), `auto.ts` + `core/auto-core.ts`
(free character / outfit generation, verbatim AM slice), `markup.ts` (strip, suppression carriers, bake per
`src/shared/contract/chat-dom.ts`), `chat-data.ts` (plans <-> Image History), `records.ts` (sidecar `chats/<chatId>/pipeline.json`:
generation records + zoom drafts), `host-chat.ts` (messages / swipes), `labels.ts`.

## Asset analysis (`src/backend/analysis`, see its README)

`core/analysis-core.ts` is a generated verbatim slice of the Asset Maid controllers (character prompts, references, persona,
asset matching, metadata, artist extraction, reclassification, representative pick, charx regex); `bridge/` adapts them to the
services (config store over the character document, asset index, analysis session). `workspace.ts` (roster projection, custom
characters, prompts tab), `assets.ts`, `outfit.ts` (outfit / reference image generation, history `characters/<id>/outfit-images.json`),
`jobs.ts`, `runs.ts`, `charx-regex.ts`, `labels.ts`. Prompts / schemas: `data/` (byte-identical copies of the extracts).

## RPC (`src/backend/rpc`)

`router.ts` (envelope validation, one response per request), `errors.ts` (`RpcFailure`, `toRpcError`), handler groups
`handlers/core.ts` (services), `handlers/chat.ts` (pipeline), `handlers/workspace.ts` (analysis). `src/backend.test.ts` checks that
every `RPC_METHODS` entry has a handler.

## Legacy

0.9.x (Lightboard) files in userStorage (`LEGACY_LIGHTBOARD_PATHS`) are not read. Old baked 0.9.x blocks in messages are still
stripped by the interceptor (`inlay-content.ts`).
