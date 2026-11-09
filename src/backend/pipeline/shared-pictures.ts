/**
 * Pictures on request, for other extensions (Gambit asks for its Parley moments, combat cut-ins, figures and scenes), over the Spindle
 * shared RPC pool. The picture is made by Inlay's own chat pipeline, as a message illustration would be: the chat's
 * cast and their looks, the user's active Atelier preset (its analyzer and parser), continuity read but not written.
 * Only the scene guideline and the image ratio of the run change, to the guideline the request names (below).
 *
 * - Endpoint `inlay_illustrator.pictures.<user>`. The pool passes a handler no arguments, so the request is the
 *   reader's own endpoint `<readerExtensionId>.inlay.pictures.<user>`:
 *   `{ version: 1, pictures: [{ id, chatId, direction: "parley" | "cutin" | "figure" | "scene" | "intimate", text, base? }] }`.
 * - `base` (optional, a Lumiverse image id): the picture is drawn into that picture's setting, as a NovelAI infill on it
 *   (scene-infill.ts), with the analyzer's place left out (the kept frame is the place). Without a NovelAI connection,
 *   with a base that cannot be read, or when the infill fails, it is drawn on its own.
 * - Reading the endpoint queues every picture it has not seen (one run at a time, started outside the request's
 *   permission scope, like profiles) and answers the status of each requested id:
 *   `{ version: 1, pictures: { [id]: { status, imageId?, url?, width?, height?, error? } } }`. Readers read again to
 *   learn when a picture is ready.
 * - Guidelines: the bundled ones (GAMBIT_GUIDELINES), unless the user's guideline library has one with the same name
 *   (import presets/gambit.preset.json into the Maid Atelier and edit it there): the user's copy wins.
 * - Readers need `characters` and `generation` (a picture is an LLM analysis plus an image generation).
 */
import { fixedCountPolicy, type ChatImageGenerationSettings } from "../../shared/contract/index.js";
import * as A from "../../engine/v5/atelier.js";
import type { NativeAssetDetector } from "../../engine/text/index.js";
import { sharedArtistsChannel } from "../services/shared-artists.js";
import type { BackendServices, SpindleHost } from "../services/types.js";
import type { BackendModules } from "../rpc/types.js";
import type { EnginePort } from "./engine-port.js";
import { generateMessageIllustrations, nativeDetectorsFor } from "./generate.js";
import { loadMessages, type ChatMessageView } from "./host-chat.js";
import { messageSlots } from "./markup.js";
import { infillOn, type Infill } from "./scene-infill.js";

export const SHARED_PICTURES_CHANNEL = "pictures";
export const SHARED_PICTURES_VERSION = 1;
const MAX_PER_READ = 8;
const MAX_KEPT = 200;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:#-]{0,159}$/u;
const LUMIVERSE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
/** The closing line of a picture's text (see draw). */
export const PICTURE_END = "* * *";
const RETRY_FAILED_MS = 60_000;

export const PICTURE_DIRECTIONS = ["parley", "cutin", "figure", "scene", "intimate"] as const;
export type PictureDirection = (typeof PICTURE_DIRECTIONS)[number];
export interface PictureRequest {
  id: string;
  chatId: string;
  direction: PictureDirection;
  text: string;
  /** A Lumiverse image id: drawn into that picture's setting. */
  base?: string;
}
export interface PictureStatus {
  status: "queued" | "running" | "ready" | "failed";
  imageId?: string;
  url?: string;
  width?: number;
  height?: number;
  error?: string;
  at: number;
}
export interface PictureAnswer {
  version: typeof SHARED_PICTURES_VERSION;
  pictures: Record<string, PictureStatus>;
}

/* ------------------------------------------------------------------------------------------------
 * Guidelines (the Gambit preset; presets/gambit.preset.json carries the same text for the Atelier)
 * ---------------------------------------------------------------------------------------------- */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});

export const GAMBIT_PARLEY_NAME = "Gambit: Parley";
export const GAMBIT_CUTIN_NAME = "Gambit: Cut-in";
export const GAMBIT_FIGURE_NAME = "Gambit: Figure";
export const GAMBIT_SCENE_NAME = "Gambit: Scene";
export const GAMBIT_INTIMATE_NAME = "Gambit: Intimate";
export const GAMBIT_RATIO_NAME = "Gambit: Wide";
export const GAMBIT_TALL_RATIO_NAME = "Gambit: Tall";

export const GAMBIT_PARLEY_INSTRUCTION =
  "One image of the beat the text describes in a contest of words: the person the persona is talking to, reacting to what the persona just said or did. " +
  "Show it through the persona's eyes at conversation distance: the other person faces the viewer, waist up or chest up, and their face, eyes and hands carry the beat (caught off guard, suspicious, furious, amused, tempted, giving in, turning away). " +
  "Keep the place of the scene behind them, softer than they are, lit like a film still. Show nobody else unless the text puts them right there. " +
  "Show the persona only as hands, and only when the text has them doing something (offering, pointing, holding coin); never their face or body.";

export const GAMBIT_CUTIN_INSTRUCTION =
  "One image of a combat cut-in: the acting character alone, mid-move, as fighting-game or gacha special-move splash art. " +
  "A dynamic, foreshortened action pose at a slanted camera angle (lunging, swinging a weapon through the frame, casting with an arm thrust at the viewer, bracing behind a barrier), intense eyes, hair and clothes whipped by the motion. " +
  "The move's own effects surround them (fire and embers, ice, lightning, holy light, a dark aura, water, flying rock, a magic circle). " +
  "No scenery and no floor: a plain white background behind them. No other people, no text.";

export const GAMBIT_FIGURE_INSTRUCTION =
  "One image of one person alone, as a character figure: the whole of their body in view, centred, facing the viewer, relaxed, with a calm expression. " +
  "Draw the body their profile gives them: if it isn't two legs (a snake's coils, a horse's body, a fish's tail, spider legs, no legs at all), show all of it and never give them human legs. " +
  "No scenery and no floor: a plain white background behind them, with no cast shadow. No other people, no text, no effects.";

export const GAMBIT_SCENE_INSTRUCTION =
  "One wide image of the moment the text describes, as an event illustration in a visual novel: the people it names, doing what it says, in the place it says. " +
  "Show only who the text puts there, each with the body and looks their profile gives them. No text and no panels.";

/**
 * The picture is cut out of its ground afterwards. The guideline takes the place's tags away, and with none the image
 * model invents a room, so it's told outright. A vignette darkens the ground's edges and the cut fails.
 */
export const CUT_OUT_GROUND = {
  add: "white background, simple background",
  negative: "scenery, indoors, outdoors, room, furniture, floor, cast shadow",
  drop: ["vignette", "negative space", "blank page"],
} as const;

export const GAMBIT_INTIMATE_INSTRUCTION =
  "One wide image of an adult scene between the persona and the character the text is about, as an event CG in a visual novel: the moment the text has reached by its end, as it is (who is where, what they are doing, how far it has gone, what they still wear). " +
  "Both are adults. Rate it as the text is: an explicit moment is an explicit picture. " +
  "Show it through the persona's eyes: the other character in full view, their face and body carrying the moment, the persona only as much of their body as the moment needs (hands, chest, hips, legs), never their face. " +
  "Draw the character with the body and looks their profile gives them, every trait of their kind kept (a tail, scales, wings, horns, fur, a lower body that isn't human). Keep the place of the scene around them, lit to the mood. Nobody else, no text and no panels.";

export const GAMBIT_RATIO_INSTRUCTION = "Always choose sizeId 2 (landscape).";
export const GAMBIT_TALL_RATIO_INSTRUCTION = "Always choose sizeId 1 (portrait).";

/** A rule of a scene guideline (`{id, condition, effect}`); `direction` is the guideline's own id. */
const pathRule = (id: string, direction: string, action: "add" | "remove", path: string, value?: unknown): Rec => ({
  id,
  condition: { direction },
  effect: { kind: "path", action, path, ...(value !== undefined ? { value } : {}) },
});

/** Rules that leave the analyzer's place (its tags, its words, the things standing in it) out of the picture. */
const noPlace = (prefix: string, direction: string): Rec[] => [
  pathRule(`${prefix}-no-place-tags`, direction, "remove", "scene.free.location"),
  pathRule(`${prefix}-no-place-text`, direction, "remove", "scene.text.location"),
  pathRule(`${prefix}-no-props`, direction, "remove", "scene.free.object"),
];

/**
 * The library items of the Gambit guidelines under the given ids. The Parley one asks for a POV camera but, unlike the
 * built-in POV guideline, does not require the persona: a persona without an Inlay profile made the run fail.
 */
export function gambitGuidelines(_library: A.AtelierLibrary, ids: { parley: string; cutin: string; figure: string; scene: string; intimate: string }): Record<PictureDirection, Rec> {
  const parley: Rec = {
    name: GAMBIT_PARLEY_NAME,
    instruction: GAMBIT_PARLEY_INSTRUCTION,
    outputMode: "illustration",
    system: {
      options: [],
      values: {},
      rules: [
        pathRule("gambit-parley-pov", ids.parley, "add", "scene.group.camera.view", ["pov"]),
        pathRule("gambit-parley-no-dialogue", ids.parley, "remove", "actor.text.dialogue"),
      ],
    },
  };
  const cutin: Rec = {
    name: GAMBIT_CUTIN_NAME,
    instruction: GAMBIT_CUTIN_INSTRUCTION,
    outputMode: "illustration",
    system: {
      options: [],
      values: {},
      rules: [pathRule("gambit-cutin-no-dialogue", ids.cutin, "remove", "actor.text.dialogue"), ...noPlace("gambit-cutin", ids.cutin)],
    },
  };
  const figure: Rec = {
    name: GAMBIT_FIGURE_NAME,
    instruction: GAMBIT_FIGURE_INSTRUCTION,
    outputMode: "illustration",
    system: {
      options: [],
      values: {},
      rules: [pathRule("gambit-figure-no-dialogue", ids.figure, "remove", "actor.text.dialogue"), ...noPlace("gambit-figure", ids.figure)],
    },
  };
  const scene: Rec = {
    name: GAMBIT_SCENE_NAME,
    instruction: GAMBIT_SCENE_INSTRUCTION,
    outputMode: "illustration",
    system: { options: [], values: {}, rules: [pathRule("gambit-scene-no-dialogue", ids.scene, "remove", "actor.text.dialogue")] },
  };
  // Like the Parley one: the persona's eyes, without requiring a persona profile.
  const intimate: Rec = {
    name: GAMBIT_INTIMATE_NAME,
    instruction: GAMBIT_INTIMATE_INSTRUCTION,
    outputMode: "illustration",
    system: {
      options: [],
      values: {},
      rules: [
        pathRule("gambit-intimate-pov", ids.intimate, "add", "scene.group.camera.view", ["pov"]),
        pathRule("gambit-intimate-no-dialogue", ids.intimate, "remove", "actor.text.dialogue"),
      ],
    },
  };
  return { parley, cutin, figure, scene, intimate };
}

const GUIDELINE_NAME: Record<PictureDirection, string> = { parley: GAMBIT_PARLEY_NAME, cutin: GAMBIT_CUTIN_NAME, figure: GAMBIT_FIGURE_NAME, scene: GAMBIT_SCENE_NAME, intimate: GAMBIT_INTIMATE_NAME };

const nameOf = (item: unknown): string => String(rec(item).name ?? "").trim();

/**
 * The run's runtime config with the request's guideline selected: the user's own item of that name when their library
 * has one, else the bundled one added for this run. Nothing is stored; the user's selection stays as it is. A picture
 * drawn into another's setting (`onBase`) leaves the analyzer's place out: a place it names is painted into the kept
 * frame (a bed in the middle of a forest floor).
 */
export function selectGambitGuideline<T extends object>(runtime: T, direction: PictureDirection, onBase = false): T {
  const library = A.resolveStoredLibrary(runtime);
  const own = Object.entries(library.scene.items).find(([, item]) => nameOf(item) === GUIDELINE_NAME[direction])?.[0];
  let sceneId = own;
  if (!sceneId) {
    sceneId = `gambit-${direction}`;
    const made = gambitGuidelines(library, { parley: "gambit-parley", cutin: "gambit-cutin", figure: "gambit-figure", scene: "gambit-scene", intimate: "gambit-intimate" });
    library.scene.items[sceneId] = made[direction] as never;
  }
  library.scene.selected = sceneId;
  if (onBase) {
    const item = rec(library.scene.items[sceneId]);
    const system = rec(item.system);
    const rules = Array.isArray(system.rules) ? system.rules : [];
    library.scene.items[sceneId] = { ...item, system: { options: [], values: {}, ...system, rules: [...rules, ...noPlace("gambit-base", sceneId)] } } as never;
  }
  // A figure stands in a tall frame; everything else is wide.
  const tall = direction === "figure";
  const ratioName = tall ? GAMBIT_TALL_RATIO_NAME : GAMBIT_RATIO_NAME;
  const ownRatio = Object.entries(library.imageRatio.items).find(([, item]) => nameOf(item) === ratioName)?.[0];
  const ratioId = ownRatio ?? (tall ? "gambit-tall" : "gambit-wide");
  if (!ownRatio) library.imageRatio.items[ratioId] = { name: ratioName, instruction: tall ? GAMBIT_TALL_RATIO_INSTRUCTION : GAMBIT_RATIO_INSTRUCTION, allowedSizeIds: tall ? [1] : [2] } as never;
  library.imageRatio.selected = ratioId;
  return A.commitLibrary(runtime, library);
}

/* ------------------------------------------------------------------------------------------------
 * Requests
 * ---------------------------------------------------------------------------------------------- */

/** `pictures.<user>` (the bare suffix the owner registers). */
export function sharedPicturesChannel(userId: string | undefined): string {
  return `${SHARED_PICTURES_CHANNEL}.${sharedArtistsChannel(userId).slice("artists.".length)}`;
}

/** Where a reader publishes what it wants drawn: `<reader>.inlay.pictures.<user>`. */
export function picturesEndpoint(readerExtensionId: string, userId: string | undefined): string {
  return `${readerExtensionId}.inlay.pictures.${sharedArtistsChannel(userId).slice("artists.".length)}`;
}

const text = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[ \t]+/g, " ").trim().slice(0, max) : "");

export function parsePictureRequests(raw: unknown): PictureRequest[] {
  const o = rec(raw);
  if (o.version !== 1 || !Array.isArray(o.pictures)) return [];
  const out: PictureRequest[] = [];
  for (const p of o.pictures) {
    const x = rec(p);
    const id = text(x.id, 160);
    const chatId = text(x.chatId, 80);
    const direction = PICTURE_DIRECTIONS.find((d) => d === x.direction) ?? null;
    const body = text(x.text, 2000);
    const base = text(x.base, 80);
    if (!ID_RE.test(id) || !LUMIVERSE_ID_RE.test(chatId) || !direction || !body) continue;
    if (!out.some((r) => r.id === id)) out.push({ id, chatId, direction, text: body, ...(LUMIVERSE_ID_RE.test(base) ? { base } : {}) });
    if (out.length >= 32) break;
  }
  return out;
}

/**
 * The one slot of a picture's text (`text` + PICTURE_END), after its last paragraph, with the whole text before it.
 * The analyzer's scene is a slot's text before it, and a slot's own is one paragraph: a name or place said earlier
 * (the "who and where" line readers start with) was lost, and someone else was drawn.
 */
export function pictureSlot(messageId: string, content: string, detectors: readonly NativeAssetDetector[]): ReturnType<typeof messageSlots> {
  const built = messageSlots(messageId, content, detectors);
  const last = built.slots.at(-1);
  const before = built.clean.slice(0, built.clean.lastIndexOf(PICTURE_END)).trim();
  return { ...built, slots: last ? [{ ...last, beforeText: before }] : [] };
}

export interface SharedPictures {
  dispose(): void;
}

export function sharePictures(services: BackendServices, engine: EnginePort, getModules?: () => BackendModules): SharedPictures {
  const host = services.host as Pick<SpindleHost, "rpcPool">;
  const pool = host.rpcPool as SpindleHost["rpcPool"] | undefined;
  if (!pool?.handle) return { dispose() {} };
  const channel = sharedPicturesChannel(services.userId);
  const kept = new Map<string, PictureStatus>();
  const queue: { reader: string; req: PictureRequest }[] = [];
  const abort = new AbortController();
  let running = false;

  const keep = (key: string, status: PictureStatus) => {
    kept.delete(key);
    kept.set(key, status);
    while (kept.size > MAX_KEPT) kept.delete(kept.keys().next().value!);
  };

  /** The infill on a base, or null when the image connection is not NovelAI or the base is not a PNG. */
  async function infillFor(imageId: string): Promise<Infill | null> {
    const target = await services.images.resolveTarget();
    if (target.generationProvider !== "novelai") return null;
    return infillOn(await services.imageBytes.getImage({ imageId }, { signal: abort.signal }), target.model);
  }

  /** A picture with a base is drawn into its setting; one that can't be is drawn on its own. */
  async function draw(reader: string, req: PictureRequest): Promise<PictureStatus> {
    if (!req.base) return drawOn(reader, req, null);
    const why = (err: unknown) => (err instanceof Error ? err.message : String(err));
    const infill = await infillFor(req.base).catch((err: unknown) => {
      if (abort.signal.aborted) throw err;
      services.log.append("warn", "pictures", `${reader}: base ${req.base} of picture ${req.id} can't be read (${why(err)}); drawn on its own`, { chatId: req.chatId });
      return null;
    });
    if (!infill) return drawOn(reader, req, null);
    try {
      return await drawOn(reader, req, infill);
    } catch (err) {
      if (abort.signal.aborted) throw err;
      services.log.append("warn", "pictures", `${reader}: picture ${req.id} couldn't be drawn into its base (${why(err)}); drawn on its own`, { chatId: req.chatId });
      return drawOn(reader, req, null);
    }
  }

  async function drawOn(reader: string, req: PictureRequest, infill: Infill | null): Promise<PictureStatus> {
    const chat = await services.sources.getChat(req.chatId);
    const characterId = chat.characterId || chat.groupCharacterIds[0] || "";
    const character = characterId ? await services.sources.getCharacter(characterId) : { name: "" };
    const messages = await loadMessages(services.host, req.chatId);
    // The picture's text is the target: a reply after the chat's last message, never written to the chat.
    const messageId = `${reader}:${req.id}`.replace(/[^A-Za-z0-9_.:-]/gu, "_");
    // Slots are the gaps between paragraphs: a closing line gives the text one after its last paragraph, and the
    // picture goes there, after the whole moment.
    const content = `${req.text}\n\n${PICTURE_END}`;
    const view: ChatMessageView = { id: messageId, index: messages.length, role: "assistant", isUser: false, name: character.name, swipeId: 0, swipes: [content], content, extra: {} };
    const all = [...messages, view];
    const document = characterId ? await services.storage.loadCharacterDocument(characterId) : null;
    const built = pictureSlot(messageId, content, characterId ? nativeDetectorsFor(characterId, "", document) : []);
    const slots = built.slots;
    if (!slots.length) throw new Error("Nothing to draw in the request text.");
    const config = await services.storage.loadConfig();
    const settings: ChatImageGenerationSettings = { ...(await services.storage.loadChatImageGenerationSettings()), analysisMode: "single", countPolicy: fixedCountPolicy(1) };
    const result = await generateMessageIllustrations(
      { services, engine, ...(getModules ? { getModules } : {}) },
      {
        chatId: req.chatId,
        chat,
        messages: all,
        target: all.length - 1,
        swipeIndex: 0,
        historyId: `${messageId}@0`,
        planKey: messageId,
        clean: built.clean,
        slots,
        countPolicy: fixedCountPolicy(1),
        attemptKind: "initial",
        automatic: false,
        revisionId: `picture:${messageId}`,
        existingEntries: [],
        deletedSlotIndices: [],
        jobId: `picture:${messageId}`,
        activityLabel: reader,
        config,
        settings,
        chatData: await services.storage.loadChatData(req.chatId),
        signal: abort.signal,
        assertTarget: async () => undefined,
        directing: (runtime) => selectGambitGuideline(runtime, req.direction, !!infill),
        ...(req.direction === "figure" || req.direction === "cutin" ? { ground: CUT_OUT_GROUND } : {}),
        ...(infill ? { infill } : {}),
      },
    );
    const record = result.records[0];
    if (!record) throw new Error(result.error || "No picture was made.");
    return { status: "ready", imageId: record.imageId, url: `/api/v1/images/${record.imageId}`, ...(record.width ? { width: record.width } : {}), ...(record.height ? { height: record.height } : {}), at: Date.now() };
  }

  async function pump(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (queue.length && !abort.signal.aborted) {
        const { reader, req } = queue.shift()!;
        const key = `${reader}\u0000${req.id}`;
        keep(key, { status: "running", at: Date.now() });
        try {
          const done = await draw(reader, req);
          keep(key, done);
          services.log.append("info", "pictures", `${reader}: ${req.direction} picture ${req.id} ready`, { chatId: req.chatId, imageId: done.imageId });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          keep(key, { status: "failed", error, at: Date.now() });
          services.log.append("warn", "pictures", `${reader}: ${req.direction} picture ${req.id} failed: ${error}`, { chatId: req.chatId });
        }
      }
    } finally {
      running = false;
    }
  }

  // Runs start outside the request's permission scope (see shared-profiles.ts): a timer made here starts them.
  const starter = setInterval(() => {
    if (queue.length && !running) void pump();
  }, 500);
  (starter as { unref?: () => void }).unref?.();

  async function answer(reader: string): Promise<PictureAnswer> {
    const raw = await pool!.read(picturesEndpoint(reader, services.userId)).catch(() => null);
    const pictures: Record<string, PictureStatus> = {};
    let added = 0;
    for (const req of parsePictureRequests(raw)) {
      const key = `${reader}\u0000${req.id}`;
      const known = kept.get(key);
      // A failure is answered as it is for a minute; asked again after that, the picture is tried again.
      if (known && !(known.status === "failed" && Date.now() - known.at > RETRY_FAILED_MS)) {
        pictures[req.id] = known;
        continue;
      }
      if (added >= MAX_PER_READ) continue;
      added += 1;
      const status: PictureStatus = { status: "queued", at: Date.now() };
      keep(key, status);
      queue.push({ reader, req });
      pictures[req.id] = status;
      services.log.append("info", "pictures", `${reader} asked for a ${req.direction} picture (${req.id})`, { chatId: req.chatId });
    }
    return { version: SHARED_PICTURES_VERSION, pictures };
  }

  try {
    pool.handle(channel, (ctx) => answer(ctx.requesterExtensionId), { requires: ["characters", "generation"] });
  } catch {
    clearInterval(starter);
    return { dispose() {} };
  }
  return {
    dispose() {
      abort.abort("pictures-disposed");
      clearInterval(starter);
      try {
        pool.unregister(channel);
      } catch {
        /* already gone */
      }
    },
  };
}
