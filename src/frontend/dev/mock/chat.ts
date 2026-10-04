/**
 * Dev mock handlers for the chat-side UI + zoom viewer (generation, history, zoom, chatState, chatDom).
 * Chat data lives in `db.extra.chatMock` (one chat, a few messages with Image History) and is created lazily.
 * Owner: chat-zoom sub-agent. The preview chat DOM is drawn by ../chat-fixture.ts from the same data.
 */
import { createEmptyActorState, type CurrentActorState } from "../../../shared/contract/chat.js";
import type { ChatMessageUiState, ChatSlotUi, FooterAttempt } from "../../../shared/contract/chat-dom.js";
import type { GenerationOrigin } from "../../../shared/contract/history.js";
import type { AttemptKind, GenerationJobSnapshot, GenerationPhase, RegenerationOverrides, ZoomDetails, ZoomPromptSection } from "../../../shared/contract/rpc.js";
import { MockRpcError, type MockContext, type MockHandlers } from "../mock-backend.js";
import { svgImage, type MockDb } from "./fixtures.js";

export interface MockChatEntry {
  entryId: string;
  kind: "original" | "generated";
  origin?: GenerationOrigin;
  assetName: string;
  imageId: string;
  url: string;
  width: number;
  height: number;
  sizeId: number;
  seed: string;
  createdAt: number;
  positivePrompt: string;
  negativePrompt: string;
  sections: ZoomPromptSection[];
}
export interface MockChatSlot { slotId: string; slotIndex: number; entries: MockChatEntry[]; selectedEntryId: string; regenerating?: boolean; draft?: RegenerationOverrides & { promptDraft?: boolean; coordinateDraft?: boolean } }
export interface MockChatRevision { revisionId: string; createdAt: number; status: "complete" | "error"; slots: MockChatSlot[]; deletedSlotIndices: number[] }
export interface MockChatMessage {
  messageId: string;
  swipeIndex: number;
  role: "assistant" | "user";
  name: string;
  paragraphs: string[];
  revisions: MockChatRevision[];
  activeRevisionId: string;
  planStatus: "idle" | "generating" | "complete" | "error";
  lastError?: { code: "provider-error"; message: string; retryable: boolean };
}
export interface MockChatJob { snapshot: GenerationJobSnapshot; cancelled: boolean; slotId?: string }
export interface MockChatData {
  chatId: string;
  messages: MockChatMessage[];
  actorState: CurrentActorState;
  jobs: Record<string, MockChatJob>;
  /** Scenes: keep started jobs running in the "generating" phase. */
  holdJobs: boolean;
  /** Scenes: make the next generation fail. */
  failNext: boolean;
  previews: Record<string, { messageKey: string; slotId: string }>;
  proposals: Record<string, { slotId: string; instruction: string }>;
  seq: number;
}

const HUES = [330, 210, 28, 140, 270, 190, 10, 90];
const DAY = Date.UTC(2026, 4, 1, 12, 0, 0);

export function messageKeyOf(m: Pick<MockChatMessage, "messageId" | "swipeIndex">): string {
  return `illustration:${m.messageId}@${m.swipeIndex}`;
}
export function slotIdOf(m: Pick<MockChatMessage, "messageId" | "swipeIndex">, index: number): string {
  return `${messageKeyOf(m)}:slot:${index}`;
}

function sectionsFor(seed: number, actors: Array<{ label: string; prompt: string; x: number | null; y: number | null }>): ZoomPromptSection[] {
  return [
    { id: "main", target: "main" as const, label: "", value: `2girls, classroom, afternoon light, window, desks, artist:ningen_mame, best quality`, negativeValue: "lowres, bad anatomy, text" },
    ...actors.map((actor, i) => ({
      id: `actor:${i}`,
      target: "actor" as const,
      actorIndex: i,
      label: actor.label,
      value: actor.prompt,
      negativeValue: i === 0 ? "short hair" : "",
      ...(actor.x !== null && actor.y !== null ? { centerX: actor.x, centerY: actor.y } : {})
    }))
  ].map((section): ZoomPromptSection => ({ ...section, value: section.value + (seed % 2 ? "" : "") }));
}

let entryCounter = 0;
export function mockEntry(label: string, index: number, options: { origin?: GenerationOrigin; kind?: "original" | "generated"; width?: number; height?: number; createdAt?: number } = {}): MockChatEntry {
  entryCounter += 1;
  const width = options.width ?? 832;
  const height = options.height ?? 1216;
  const hue = HUES[index % HUES.length]!;
  const uuid = `0b7f6a1e-${String(entryCounter).padStart(4, "0")}-4000-8000-${String(1000 + entryCounter).padStart(12, "0")}`;
  const seed = String(1_234_000_000 + entryCounter * 7919);
  return {
    entryId: `entry-${entryCounter}`,
    kind: options.kind ?? "generated",
    origin: options.origin ?? "initial",
    assetName: `${label.replace(/\s+/gu, "_")}.__am__.chat.${uuid}`,
    imageId: `img-${entryCounter}`,
    url: svgImage(`${label} #${entryCounter}`, hue, Math.round(width / 2), Math.round(height / 2)),
    width,
    height,
    sizeId: width > height ? 2 : width === height ? 5 : 1,
    seed,
    createdAt: options.createdAt ?? DAY + entryCounter * 60_000,
    positivePrompt: "",
    negativePrompt: "lowres, bad anatomy, text",
    sections: sectionsFor(entryCounter, [
      { label: "한서연 (Han Seo-yeon)", prompt: "1girl, han seo-yeon, long hair, black hair, brown eyes, school uniform, red ribbon, smile, sitting", x: 0.3, y: 0.55 },
      { label: "김민아 (Kim Mina)", prompt: "1girl, kim mina, short hair, brown hair, bob cut, green eyes, cardigan, standing, arms crossed", x: index % 2 ? null : 0.7, y: index % 2 ? null : 0.5 }
    ])
  };
}

function slot(m: Pick<MockChatMessage, "messageId" | "swipeIndex">, index: number, entries: MockChatEntry[], selected = entries.length - 1): MockChatSlot {
  return { slotId: slotIdOf(m, index), slotIndex: index, entries, selectedEntryId: entries[selected]?.entryId ?? "" };
}

export function createMockChat(chatId: string): MockChatData {
  entryCounter = 0;
  const m2 = { messageId: "msg-2", swipeIndex: 0 };
  const m5 = { messageId: "msg-5", swipeIndex: 0 };
  const messages: MockChatMessage[] = [
    { messageId: "msg-1", swipeIndex: 0, role: "user", name: "Joon", paragraphs: ["*I slide the door open and step into the classroom.* Is anyone still here?"], revisions: [], activeRevisionId: "", planStatus: "idle" },
    {
      ...m2,
      role: "assistant",
      name: "한서연",
      paragraphs: [
        "Seo-yeon looks up from her notebook, the afternoon light catching her long black hair. \"Oh! You startled me.\"",
        "Mina, standing by the window with her arms crossed, rolls her green eyes. \"We were just finishing the class report. Some of us actually work.\"",
        "\"Don't mind her,\" Seo-yeon laughs, patting the seat next to her. \"Come sit. We could use a third opinion.\""
      ],
      revisions: [
        { revisionId: "rev-2a", createdAt: DAY, status: "complete", deletedSlotIndices: [], slots: [slot(m2, 0, [mockEntry("classroom", 0)]), slot(m2, 1, [mockEntry("window", 1, { width: 1216, height: 832 })])] },
        {
          revisionId: "rev-2b",
          createdAt: DAY + 3_600_000,
          status: "complete",
          deletedSlotIndices: [],
          slots: [
            slot(m2, 0, [mockEntry("classroom", 2), mockEntry("classroom", 3, { origin: "regenerate" }), mockEntry("classroom", 4, { origin: "reroll" })], 1),
            slot(m2, 1, [mockEntry("window", 5, { width: 1216, height: 832 })])
          ]
        }
      ],
      activeRevisionId: "rev-2b",
      planStatus: "complete"
    },
    { messageId: "msg-3", swipeIndex: 0, role: "user", name: "Joon", paragraphs: ["Sure. What is the report about?"], revisions: [], activeRevisionId: "", planStatus: "idle" },
    {
      messageId: "msg-4",
      swipeIndex: 0,
      role: "assistant",
      name: "한서연",
      paragraphs: [
        "\"The school festival,\" Seo-yeon says, sliding a sheet of paper across the desk. \"We have to pick a theme for our class booth.\"",
        "Mina finally walks over and drops into a chair. \"I vote for a haunted house. Nobody ever does it right.\""
      ],
      revisions: [],
      activeRevisionId: "",
      planStatus: "idle"
    },
    {
      ...m5,
      role: "assistant",
      name: "한서연",
      paragraphs: [
        "The bell rings in the distance. Seo-yeon gathers her things, humming quietly.",
        "\"Same time tomorrow?\" she asks at the door, and waves before you can answer."
      ],
      revisions: [{ revisionId: "rev-5a", createdAt: DAY + 7_200_000, status: "error", deletedSlotIndices: [], slots: [slot(m5, 0, [mockEntry("hallway", 6)])] }],
      activeRevisionId: "rev-5a",
      planStatus: "error",
      lastError: { code: "provider-error", message: "NovelAI returned HTTP 429 (Too Many Requests) for image 2 of 2.", retryable: true }
    }
  ];
  const actorState: CurrentActorState = {
    revision: 3,
    actors: {
      seoyeon: { groups: { "state.fluid.cum.location": [], "actor.injury": ["bandage_on_arm", "scraped_knee"] }, count: 2, ttl: {} },
      mina: { groups: { "state.fluid.cum.location": ["cum_on_hair"], "actor.injury": [] }, count: 1, ttl: { cum_on_hair: 3 } }
    }
  };
  return { chatId, messages, actorState, jobs: {}, holdJobs: false, failNext: false, previews: {}, proposals: {}, seq: 0 };
}

/** The mock chat of the db (created on first use). */
export function mockChat(db: MockDb): MockChatData {
  const existing = db.extra.chatMock as MockChatData | undefined;
  if (existing) return existing;
  const created = createMockChat(db.status.activeChatId ?? "chat-1");
  db.extra.chatMock = created;
  return created;
}

export function activeRevision(m: MockChatMessage): MockChatRevision | undefined {
  return m.revisions.find((r) => r.revisionId === m.activeRevisionId) ?? m.revisions[m.revisions.length - 1];
}

function findMessage(chat: MockChatData, messageId: string): MockChatMessage | undefined {
  return chat.messages.find((m) => m.messageId === messageId);
}
function messageByKey(chat: MockChatData, messageKey: string): MockChatMessage | undefined {
  return chat.messages.find((m) => messageKeyOf(m) === messageKey || messageKey.endsWith(`${m.messageId}@${m.swipeIndex}`));
}
export function findSlot(chat: MockChatData, slotId: string): { message: MockChatMessage; revision: MockChatRevision; slot: MockChatSlot } | null {
  for (const message of chat.messages) {
    for (const revision of message.revisions) {
      const found = revision.slots.find((s) => s.slotId === slotId);
      if (found && (revision.revisionId === message.activeRevisionId || !message.activeRevisionId)) return { message, revision, slot: found };
    }
  }
  for (const message of chat.messages) {
    for (const revision of message.revisions) {
      const found = revision.slots.find((s) => s.slotId === slotId);
      if (found) return { message, revision, slot: found };
    }
  }
  return null;
}

function attemptOf(m: MockChatMessage): FooterAttempt {
  if (m.planStatus === "error") return "retry";
  return m.revisions.some((r) => r.slots.some((s) => s.entries.length > 0) || r.deletedSlotIndices.length > 0) ? "reroll" : "initial";
}

function runningJob(chat: MockChatData, messageKey: string): MockChatJob | undefined {
  return Object.values(chat.jobs).find((j) => j.snapshot.messageKey === messageKey && j.snapshot.attemptKind !== "regenerate" && (j.snapshot.status === "queued" || j.snapshot.status === "running"));
}

export function messageUiState(chat: MockChatData, m: MockChatMessage): ChatMessageUiState {
  const revision = activeRevision(m);
  const key = messageKeyOf(m);
  const job = runningJob(chat, key);
  const regenSlots = new Set(Object.values(chat.jobs).filter((j) => j.slotId && (j.snapshot.status === "queued" || j.snapshot.status === "running")).map((j) => j.slotId!));
  const slots: ChatSlotUi[] = (revision?.slots ?? []).map((s) => ({
    slotId: s.slotId,
    slotIndex: s.slotIndex,
    entries: s.entries.map((e) => ({ entryId: e.entryId, kind: e.kind, ...(e.origin ? { origin: e.origin } : {}), assetName: e.assetName, imageId: e.imageId, url: e.url, width: e.width, height: e.height, createdAt: e.createdAt })),
    selectedEntryId: s.selectedEntryId,
    canRegenerate: revision?.revisionId === m.activeRevisionId,
    regenerating: regenSlots.has(s.slotId)
  }));
  const entryCount = slots.reduce((n, s) => n + s.entries.length, 0);
  return {
    chatId: chat.chatId,
    messageId: m.messageId,
    swipeIndex: m.swipeIndex,
    messageKey: key,
    eligible: m.role === "assistant" && m.paragraphs.join("").trim().length > 0,
    attempt: attemptOf(m),
    planStatus: job ? "generating" : m.planStatus,
    busy: !!job,
    ...(job ? { job: job.snapshot } : {}),
    revisions: m.revisions.map((r, i) => ({ revisionId: r.revisionId, index: i + 1, status: r.status, entryCount: r.slots.reduce((n, s) => n + s.entries.length, 0), deletedSlotIndices: r.deletedSlotIndices, createdAt: r.createdAt })),
    activeRevisionId: revision?.revisionId ?? "",
    slots,
    allSlotsDeleted: !!revision && entryCount === 0 && revision.deletedSlotIndices.length > 0,
    ...(m.lastError && m.planStatus === "error" ? { lastError: m.lastError } : {})
  };
}

const MOCK_ARTISTS = [{ id: "preset-1", label: "Soft watercolor" }, { id: "preset-2", label: "Clean lineart" }];
const MOCK_OUTFITS = [{ id: "outfit_default", label: "기본 의상" }, { id: "outfit_casual", label: "Casual" }];

function zoomDetails(chat: MockChatData, slotId: string, entryId: string | undefined, ctx: MockContext): ZoomDetails {
  const found = findSlot(chat, slotId);
  if (!found) return ctx.fail("not-found", "The image slot no longer exists.");
  const { message, revision, slot: s } = found;
  const entry = s.entries.find((e) => e.entryId === entryId) ?? s.entries.find((e) => e.entryId === s.selectedEntryId) ?? s.entries[s.entries.length - 1];
  if (!entry) return ctx.fail("not-found", "The image slot has no images.");
  const draft = s.draft ?? {};
  const sections = draft.sections
    ? entry.sections.map((section) => {
      const edited = draft.sections!.find((d) => d.id === section.id);
      return edited ? { ...section, value: edited.value, negativeValue: edited.negativeValue ?? section.negativeValue } : section;
    })
    : entry.sections;
  const centered = draft.centers
    ? sections.map((section) => {
      if (section.target !== "actor" || section.actorIndex === undefined) return section;
      const center = draft.centers![section.actorIndex];
      const { centerX: _x, centerY: _y, ...rest } = section;
      return center ? { ...rest, centerX: center.x, centerY: center.y } : rest;
    })
    : sections;
  // Zoom choices (backend controller `sectionsOf`): artists on the main card, outfits on actor cards.
  const choiced = centered.map((section): ZoomPromptSection => {
    if (section.target === "main") return { ...section, artistChoices: MOCK_ARTISTS, selectedArtistId: draft.artistId ?? MOCK_ARTISTS[0]!.id };
    if (section.target !== "actor") return section;
    const actorKey = `lorebook::${section.label.split(" (")[0]}`;
    return { ...section, actorKey, outfitChoices: MOCK_OUTFITS, selectedOutfitId: draft.outfitByActor?.[actorKey] ?? MOCK_OUTFITS[0]!.id };
  });
  const active = revision.revisionId === message.activeRevisionId;
  return {
    chatId: chat.chatId,
    messageKey: messageKeyOf(message),
    revisionId: revision.revisionId,
    slotId: s.slotId,
    entryId: entry.entryId,
    kind: entry.kind,
    ...(entry.origin ? { origin: entry.origin } : {}),
    assetName: entry.assetName,
    url: entry.url,
    width: entry.width,
    height: entry.height,
    sizeId: draft.sizeId ?? entry.sizeId,
    seed: draft.seed ?? entry.seed,
    seedFixed: draft.seedFixed ?? false,
    generationProvider: entry.kind === "original" ? "original" : "novelai",
    promptCodec: "novelai-structured",
    positivePrompt: entry.positivePrompt,
    negativePrompt: entry.negativePrompt,
    sections: choiced,
    coordinateGrid: "v4-5",
    excludedCharacterIndexes: draft.excludedCharacterIndexes ?? [],
    promptDraftActive: !!draft.promptDraft,
    coordinateDraftActive: !!draft.coordinateDraft,
    analyzerText: chat.chatId ? `[Main]\nscene: classroom, afternoon\nmodifiers.camera: from side, cowboy shot\nanalyzer_reason: two actors at desks\n\n[First]\nactor: seoyeon\npose: sitting\nexpression: smile\nvisual_continuity.outfit: uniform\n\n[Second]\nactor: mina\npose: standing, arms crossed\nobject: (none)` : "",
    canEdit: active,
    canDelete: entry.kind === "generated" && s.entries.length > 1,
    canRegenerate: active,
    canDeleteSlot: active,
    history: s.entries.map((e) => ({ entryId: e.entryId, kind: e.kind, assetName: e.assetName, url: e.url, createdAt: e.createdAt, selected: e.entryId === entry.entryId }))
  };
}

function snapshot(chat: MockChatData, message: MockChatMessage, attemptKind: AttemptKind, requestedCount: number): GenerationJobSnapshot {
  chat.seq += 1;
  return {
    jobId: `job-${chat.seq}`,
    chatId: chat.chatId,
    messageKey: messageKeyOf(message),
    attemptKind,
    status: "queued",
    phase: "planned",
    progress: { label: "Queued" },
    requestedCount,
    completedSlots: 0,
    failedSlots: 0,
    canRetry: false,
    canRestart: false
  };
}

const PHASE_LABEL: Record<GenerationPhase, string> = {
  planned: "Analysis waiting",
  "analyzing-preset": "Analyzer analyzing",
  "analyzing-modifiers": "Modifier correcting",
  planning: "AI analysis complete",
  generating: "Generating image",
  committing: "Finishing generation"
};

async function runMessageJob(chat: MockChatData, message: MockChatMessage, job: MockChatJob, ctx: MockContext): Promise<void> {
  const s = job.snapshot;
  const key = messageKeyOf(message);
  const update = (patch: Partial<GenerationJobSnapshot>) => {
    Object.assign(s, patch);
    ctx.emit("generation.progress", { ...s, progress: { ...s.progress } });
  };
  const finish = (result: "completed" | "failed" | "cancelled", error?: { code: "provider-error"; message: string; retryable: boolean }) => {
    s.status = result === "completed" ? "success" : result === "failed" ? "error" : "cancelled";
    s.canRetry = result !== "completed";
    ctx.emit("generation.finished", { jobId: s.jobId, chatId: chat.chatId, messageKey: key, result, ...(error ? { error } : {}) });
    ctx.emit("chatData.changed", { chatId: chat.chatId, messageKeys: [key] });
  };
  ctx.emit("chatData.changed", { chatId: chat.chatId, messageKeys: [key] });
  const phases: GenerationPhase[] = ["analyzing-preset", "analyzing-modifiers", "planning"];
  for (const phase of phases) {
    await ctx.delay(500);
    if (job.cancelled) return finish("cancelled");
    update({ status: "running", phase, progress: { label: PHASE_LABEL[phase], done: phase === "planning" ? 1 : 0, total: 1 } });
  }
  for (let i = 0; i < s.requestedCount; i += 1) {
    await ctx.delay(700);
    if (job.cancelled) return finish("cancelled");
    update({ phase: "generating", completedSlots: i, progress: { label: `Image ${i + 1}/${s.requestedCount}` } });
    while (chat.holdJobs && !job.cancelled) await ctx.delay(400);
    if (job.cancelled) return finish("cancelled");
  }
  update({ phase: "committing", completedSlots: s.requestedCount, progress: { label: PHASE_LABEL.committing } });
  await ctx.delay(300);
  if (chat.failNext) {
    chat.failNext = false;
    message.planStatus = "error";
    message.lastError = { code: "provider-error", message: "NovelAI returned HTTP 500 (Internal Server Error).", retryable: true };
    return finish("failed", message.lastError);
  }
  const revisionId = `rev-${message.messageId}-${chat.seq}-${Date.now().toString(36)}`;
  const count = Math.min(s.requestedCount, Math.max(1, message.paragraphs.length - 1));
  message.revisions.push({ revisionId, createdAt: Date.now(), status: "complete", deletedSlotIndices: [], slots: Array.from({ length: count }, (_, i) => slot(message, i, [mockEntry("scene", chat.seq + i)])) });
  message.activeRevisionId = revisionId;
  message.planStatus = "complete";
  delete message.lastError;
  finish("completed");
}

async function runRegenerateJob(chat: MockChatData, found: NonNullable<ReturnType<typeof findSlot>>, job: MockChatJob, overrides: RegenerationOverrides | undefined, ctx: MockContext): Promise<void> {
  const s = job.snapshot;
  const key = messageKeyOf(found.message);
  ctx.emit("chatData.changed", { chatId: chat.chatId, messageKeys: [key] });
  for (const phase of ["generating", "committing"] as const) {
    await ctx.delay(phase === "generating" ? 1200 : 300);
    if (job.cancelled) break;
    Object.assign(s, { status: "running", phase, progress: { label: PHASE_LABEL[phase] } });
    ctx.emit("generation.progress", { ...s });
    while (chat.holdJobs && !job.cancelled) await ctx.delay(400);
  }
  if (job.cancelled) {
    s.status = "cancelled";
    ctx.emit("generation.finished", { jobId: s.jobId, chatId: chat.chatId, messageKey: key, result: "cancelled" });
  } else {
    const base = found.slot.entries.find((e) => e.entryId === found.slot.selectedEntryId) ?? found.slot.entries[0];
    const entry = mockEntry("regen", chat.seq + found.slot.entries.length, { origin: "regenerate", width: base?.width, height: base?.height });
    if (overrides?.seedFixed && overrides.seed) entry.seed = overrides.seed;
    found.slot.entries.push(entry);
    found.slot.selectedEntryId = entry.entryId;
    s.status = "success";
    s.completedSlots = 1;
    ctx.emit("generation.finished", { jobId: s.jobId, chatId: chat.chatId, messageKey: key, result: "completed" });
  }
  ctx.emit("chatData.changed", { chatId: chat.chatId, messageKeys: [key] });
}

function requestedCount(db: MockDb): number {
  const settings = db.chatImageGeneration;
  if (settings.analysisMode === "split") return settings.splitAnalysis.totalCount ?? 2;
  const policy = settings.countPolicy;
  return policy.mode === "range" ? Math.max(policy.min, Math.round((policy.min + policy.max) / 2)) : policy.max;
}

export function chatMockHandlers(): MockHandlers {
  return {
    "chatDom.getMessageStates": ({ chatId, messageIds }, ctx) => {
      const chat = mockChat(ctx.db);
      if (chatId !== chat.chatId) return { messages: [] };
      const wanted = messageIds && messageIds.length ? new Set(messageIds) : null;
      const messages = chat.messages
        .filter((m) => (wanted ? wanted.has(m.messageId) : m.revisions.length > 0))
        .filter((m) => m.role === "assistant")
        .map((m) => messageUiState(chat, m));
      return { messages };
    },
    "generation.start": ({ chatId, messageId, attemptKind }, ctx) => {
      const chat = mockChat(ctx.db);
      const message = findMessage(chat, messageId);
      if (!message || chatId !== chat.chatId) return ctx.fail("not-found", "Cannot find the message to generate.");
      if (runningJob(chat, messageKeyOf(message))) return ctx.fail("busy", "This job is already generating.");
      const job: MockChatJob = { snapshot: snapshot(chat, message, attemptKind ?? attemptOf(message), requestedCount(ctx.db)), cancelled: false };
      chat.jobs[job.snapshot.jobId] = job;
      ctx.emit("generation.progress", { ...job.snapshot });
      void runMessageJob(chat, message, job, ctx);
      return { jobId: job.snapshot.jobId, messageKey: messageKeyOf(message) };
    },
    "generation.cancel": ({ jobId, messageKey }, ctx) => {
      const chat = mockChat(ctx.db);
      for (const job of Object.values(chat.jobs)) {
        if ((jobId && job.snapshot.jobId === jobId) || (!jobId && messageKey && job.snapshot.messageKey === messageKey)) job.cancelled = true;
      }
      return { ok: true };
    },
    "generation.retry": async ({ jobId }, ctx) => {
      const chat = mockChat(ctx.db);
      const old = chat.jobs[jobId];
      const message = old ? messageByKey(chat, old.snapshot.messageKey) : undefined;
      if (!message) return ctx.fail("not-found", "Cannot find the message to retry.");
      const result = await ctx.call("generation.start", { chatId: chat.chatId, messageId: message.messageId, swipeIndex: message.swipeIndex, attemptKind: "retry" });
      return { jobId: result.jobId };
    },
    "generation.restart": async ({ jobId }, ctx) => {
      const chat = mockChat(ctx.db);
      const old = chat.jobs[jobId];
      const message = old ? messageByKey(chat, old.snapshot.messageKey) : undefined;
      if (!message) return ctx.fail("not-found", "No record of the original count setting. Use full regenerate.");
      const result = await ctx.call("generation.start", { chatId: chat.chatId, messageId: message.messageId, swipeIndex: message.swipeIndex, attemptKind: "reroll" });
      return { jobId: result.jobId };
    },
    "generation.dismiss": () => ({ ok: true }),
    "generation.listActive": (_params, ctx) => ({ jobs: Object.values(mockChat(ctx.db).jobs).map((j) => j.snapshot).filter((s) => s.status === "queued" || s.status === "running") }),
    "generation.regenerateSlot": ({ slotId, overrides }, ctx) => {
      const chat = mockChat(ctx.db);
      const found = findSlot(chat, slotId);
      if (!found) return ctx.fail("not-found", "Could not load the regeneration settings of the selected image.");
      if (Object.values(chat.jobs).some((j) => j.slotId === slotId && (j.snapshot.status === "queued" || j.snapshot.status === "running"))) {
        return ctx.fail("busy", "Regeneration of this image is already in progress.");
      }
      const job: MockChatJob = { snapshot: { ...snapshot(chat, found.message, "regenerate", 1), slotId }, cancelled: false, slotId };
      chat.jobs[job.snapshot.jobId] = job;
      ctx.emit("generation.progress", { ...job.snapshot });
      void runRegenerateJob(chat, found, job, overrides, ctx);
      return { jobId: job.snapshot.jobId };
    },
    "history.selectEntry": ({ slotId, entryId }, ctx) => {
      const chat = mockChat(ctx.db);
      const found = findSlot(chat, slotId);
      if (!found || !found.slot.entries.some((e) => e.entryId === entryId)) return ctx.fail("not-found", "The image no longer exists.");
      found.slot.selectedEntryId = entryId;
      ctx.emit("chatData.changed", { chatId: chat.chatId, messageKeys: [messageKeyOf(found.message)] });
      return { ok: true };
    },
    "history.selectRevision": ({ messageKey, revisionId }, ctx) => {
      const chat = mockChat(ctx.db);
      const message = messageByKey(chat, messageKey);
      if (!message || !message.revisions.some((r) => r.revisionId === revisionId)) return ctx.fail("not-found", "Cannot determine the message revision.");
      message.activeRevisionId = revisionId;
      ctx.emit("chatData.changed", { chatId: chat.chatId, messageKeys: [messageKey] });
      return { ok: true };
    },
    "history.deleteEntry": ({ entryId }, ctx) => {
      const chat = mockChat(ctx.db);
      for (const message of chat.messages) {
        for (const revision of message.revisions) {
          for (const s of revision.slots) {
            const index = s.entries.findIndex((e) => e.entryId === entryId);
            if (index < 0) continue;
            if (s.entries.length < 2) return ctx.fail("conflict", "The last image of a slot cannot be deleted; delete the slot instead.");
            const [removed] = s.entries.splice(index, 1);
            if (s.selectedEntryId === entryId) s.selectedEntryId = s.entries[Math.max(0, index - 1)]!.entryId;
            ctx.emit("chatData.changed", { chatId: chat.chatId, messageKeys: [messageKeyOf(message)] });
            return { fallbackEntryId: s.selectedEntryId, cleanup: [{ assetName: removed!.assetName, status: "removed" }] };
          }
        }
      }
      return ctx.fail("not-found", "The image no longer exists.");
    },
    "history.prepareSlotDeletion": ({ messageKey, slotId }, ctx) => {
      const chat = mockChat(ctx.db);
      const found = findSlot(chat, slotId);
      if (!found) return ctx.fail("not-found", "No slot to delete or already deleted.");
      const token = `preview-${++chat.seq}`;
      chat.previews[token] = { messageKey, slotId };
      const live = found.revision.slots.filter((s) => s.entries.length > 0);
      return { previewToken: token, chatId: chat.chatId, messageKey, slotId, imageCount: found.slot.entries.length, revisionNumber: found.message.revisions.indexOf(found.revision) + 1, lastSlot: live.length <= 1 };
    },
    "history.deleteSlot": ({ previewToken }, ctx) => {
      const chat = mockChat(ctx.db);
      const preview = chat.previews[previewToken];
      if (!preview) return ctx.fail("conflict", "Check the deletion target again.");
      delete chat.previews[previewToken];
      const found = findSlot(chat, preview.slotId);
      if (!found) return ctx.fail("not-found", "No slot to delete or already deleted.");
      const removed = found.slot.entries.map((e) => ({ assetName: e.assetName, status: "removed" as const }));
      found.revision.slots = found.revision.slots.filter((s) => s.slotId !== preview.slotId);
      found.revision.deletedSlotIndices.push(found.slot.slotIndex);
      ctx.emit("chatData.changed", { chatId: chat.chatId, messageKeys: [preview.messageKey] });
      return { cleanup: removed, cleanupId: `cleanup-${chat.seq}` };
    },
    "history.retryCleanup": () => ({ cleanup: [] }),
    "zoom.getDetails": ({ slotId, entryId }, ctx) => zoomDetails(mockChat(ctx.db), slotId, entryId, ctx),
    "zoom.saveDraft": ({ slotId, overrides }, ctx) => {
      const chat = mockChat(ctx.db);
      const found = findSlot(chat, slotId);
      if (!found) return ctx.fail("not-found", "The current image slot cannot be edited.");
      const draft = { ...(found.slot.draft ?? {}), ...overrides };
      if (overrides.sections || overrides.positivePrompt !== undefined || overrides.negativePrompt !== undefined) draft.promptDraft = true;
      if (overrides.centers) draft.coordinateDraft = true;
      found.slot.draft = draft;
      return zoomDetails(chat, slotId, undefined, ctx);
    },
    "zoom.clearDraft": ({ slotId, part }, ctx) => {
      const chat = mockChat(ctx.db);
      const found = findSlot(chat, slotId);
      if (!found) return ctx.fail("not-found", "The current image slot cannot be edited.");
      const draft = { ...(found.slot.draft ?? {}) };
      if (part === "prompts" || part === "all") { delete draft.sections; delete draft.positivePrompt; delete draft.negativePrompt; delete draft.promptDraft; }
      if (part === "coordinates" || part === "all") { delete draft.centers; delete draft.coordinateDraft; }
      found.slot.draft = draft;
      return zoomDetails(chat, slotId, undefined, ctx);
    },
    "zoom.importViewed": ({ slotId, entryId, what }, ctx) => {
      const chat = mockChat(ctx.db);
      const found = findSlot(chat, slotId);
      const entry = found?.slot.entries.find((e) => e.entryId === entryId);
      if (!found || !entry) return ctx.fail("not-found", "The image no longer exists.");
      const draft = { ...(found.slot.draft ?? {}) };
      if (what === "seed") { draft.seed = entry.seed; draft.seedFixed = true; }
      else { draft.sections = entry.sections.map((s) => ({ id: s.id, value: s.value, negativeValue: s.negativeValue })); draft.promptDraft = true; }
      found.slot.draft = draft;
      return zoomDetails(chat, slotId, entryId, ctx);
    },
    "zoom.requestAiPromptEdit": async ({ slotId, entryId, request }, ctx) => {
      const chat = mockChat(ctx.db);
      if (!request.instruction.trim()) return ctx.fail("bad-request", "Enter what to change.");
      if (request.instruction.length > 2000) return ctx.fail("bad-request", "The AI image edit request must be 2,000 characters or less.");
      const details = zoomDetails(chat, slotId, entryId, ctx);
      await ctx.delay(600);
      const proposalId = `proposal-${++chat.seq}`;
      chat.proposals[proposalId] = { slotId, instruction: request.instruction };
      return { proposalId, positivePrompt: details.positivePrompt, negativePrompt: details.negativePrompt, sections: details.sections.map((s) => (s.target === "main" ? { ...s, value: `${s.value}, ${request.instruction}` } : s)), explanation: `Added "${request.instruction}" to the main prompt.` };
    },
    "zoom.applyAiPromptEdit": async ({ slotId, proposalId }, ctx) => {
      const chat = mockChat(ctx.db);
      if (!chat.proposals[proposalId]) return ctx.fail("conflict", "The image or prompt target changed before applying the AI edit.");
      return ctx.call("generation.regenerateSlot", { chatId: chat.chatId, messageKey: findSlot(chat, slotId)?.message ? messageKeyOf(findSlot(chat, slotId)!.message) : "", slotId });
    },
    "chatState.get": (_params, ctx) => ({ actorState: mockChat(ctx.db).actorState }),
    "chatState.set": ({ actorState, baseRevision }, ctx) => {
      const chat = mockChat(ctx.db);
      if (chat.actorState.revision !== baseRevision) throw new MockRpcError("conflict", "The chat state changed since it was opened. Reload it and try again.");
      chat.actorState = { revision: chat.actorState.revision + 1, actors: actorState.actors };
      return { actorState: chat.actorState };
    },
    "chatState.clear": ({ actorKeys }, ctx) => {
      const chat = mockChat(ctx.db);
      if (!actorKeys || actorKeys.length === 0) chat.actorState = createEmptyActorState();
      else {
        const actors = { ...chat.actorState.actors };
        for (const key of actorKeys) delete actors[key];
        chat.actorState = { revision: chat.actorState.revision + 1, actors };
      }
      return { actorState: chat.actorState };
    }
  };
}
