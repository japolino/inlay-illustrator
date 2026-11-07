/**
 * Frontend state that must follow its inputs: selectors over props, the active chat, outfit jobs that finish while
 * their pane is hidden.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import { createEvent } from "../shared/contract/rpc.js";
import { createFakeSpindleContext } from "./dev/fake-context.js";
import { renderChatFixture } from "./dev/chat-fixture.js";
import { createFullMockBackend } from "./dev/mock/index.js";
import { seedWorkspaceDemo, workspaceMockState } from "./dev/mock/workspace.js";
import { createChatSide } from "./chat/controller.js";
import { RpcClient } from "./rpc/client.js";
import { AppContext, AppController } from "./state/app-state.js";
import { Store, useSelector } from "./state/store.js";
import { WorkspaceUiContext, WorkspaceUiStore } from "./overlay/workspace-ui.js";
import type { WorkspaceTab } from "./overlay/labels.js";
import { useWorkspaceTabView } from "./overlay/workspace/index.js";
import { useWorkspaceCtx } from "./overlay/workspace/context.js";
import { sessionStoreFor } from "./overlay/workspace/session.js";
import { characterCollection } from "./overlay/workspace/model.js";

const win = new Window({ url: "http://localhost/", width: 1440, height: 900 });
const doc = win.document as unknown as Document;
const frames = globalThis as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
const saved = { raf: frames.requestAnimationFrame, caf: frames.cancelAnimationFrame };
beforeAll(() => {
  frames.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0);
  frames.cancelAnimationFrame = (h: ReturnType<typeof setTimeout>) => clearTimeout(h);
});
afterAll(() => {
  frames.requestAnimationFrame = saved.raf;
  frames.cancelAnimationFrame = saved.caf;
  win.happyDOM.abort();
});
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  doc.body.innerHTML = "";
});

const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(check: () => T, label: string, timeoutMs = 3000): Promise<NonNullable<T>> {
  const started = Date.now();
  for (;;) {
    const value = check();
    if (value) return value as NonNullable<T>;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out: ${label}`);
    await wait(10);
  }
}

/* ------------------------------------------------------------------------------------------------
 * useSelector follows selector inputs (not only store emits)
 * ---------------------------------------------------------------------------------------------- */

describe("useSelector follows its selector", () => {
  test("useSelector re-selects when the selector's inputs (props) change", async () => {
    const store = new Store<Record<string, string>>({ a: "A-value", b: "B-value" });
    function View({ id }: { id: string }) {
      const value = useSelector(store, (s) => s[id]);
      return <span>{value}</span>;
    }
    const root = doc.createElement("div");
    doc.body.appendChild(root);
    cleanups.push(() => render(null, root as unknown as Element));
    render(<View id="a" />, root as unknown as Element);
    await wait();
    expect(root.textContent).toBe("A-value");
    render(<View id="b" />, root as unknown as Element);
    await wait();
    expect(root.textContent).toBe("B-value");
  });

  test("workspace ctx follows the selected character's UI state after a character switch (chat-switch auto-follow)", async () => {
    const mock = createFullMockBackend({ timeScale: 0 });
    seedWorkspaceDemo(mock.db);
    const app = new AppController(new RpcClient(mock.transport));
    await app.init();
    const first = app.state.selectedCharacterId!;
    const other = app.state.characters!.find((c) => c.characterId !== first)!.characterId;
    const ui = new WorkspaceUiStore();
    // Character A: Prompts tab with the outfit pane open. Character B: never visited (defaults: Assets, no pane).
    ui.updateSource(first, { activeTab: "prompts", secondaryOpen: true, secondaryMode: "outfit", activePromptKey: "some-row-of-A" });
    let seen: { characterId: string | null; tab: string; secondaryOpen: boolean } | null = null;
    function Probe() {
      const ctx = useWorkspaceCtx();
      seen = { characterId: ctx.characterId, tab: ctx.sourceUi.activeTab, secondaryOpen: ctx.sourceUi.secondaryOpen };
      return null;
    }
    const root = doc.createElement("div");
    doc.body.appendChild(root);
    cleanups.push(() => { render(null, root as unknown as Element); app.destroy(); });
    render(<AppContext.Provider value={app}><WorkspaceUiContext.Provider value={ui}><Probe /></WorkspaceUiContext.Provider></AppContext.Provider>, root as unknown as Element);
    await until(() => seen?.tab === "prompts", "initial render");
    // What app.setStatus() does when the active chat moves to another character (overlay mounted, maybe hidden).
    await app.selectCharacter(other);
    await until(() => seen?.characterId === other, "rerender with B");
    await wait(30);
    expect(ui.source(other).activeTab).toBe("assets");
    expect(seen!).toEqual({ characterId: other, tab: "assets", secondaryOpen: false });
  });

});

/* ------------------------------------------------------------------------------------------------
 * The chat count panel follows a chat switch
 * ---------------------------------------------------------------------------------------------- */

describe("count panel after a chat switch", () => {
  test("count panel generate button follows the active chat (not the chat of the previous render)", async () => {
    doc.body.innerHTML = '<div id="ii-preview-chat"></div>';
    const mock = createFullMockBackend({ latencyMs: 0, timeScale: 0 });
    const fake = createFakeSpindleContext(doc, mock);
    const app = new AppController(new RpcClient(mock.transport, { clientId: "test" }));
    const fixture = renderChatFixture(doc, mock);
    let active = "chat-1";
    const chat = createChatSide(fake.ctx, app, { doc, debounceMs: 0, getActiveChatId: () => active, openZoom: () => undefined, generateLatest: async () => undefined });
    cleanups.push(() => { chat.destroy(); app.destroy(); fixture.destroy(); });
    await app.init();
    (await until(() => doc.querySelector<HTMLElement>(".ii-am-chat-count__toggle"), "count toggle")).click();
    const button = () => doc.querySelector<HTMLButtonElement>(".ii-am-chat-count__generate");
    await until(() => button(), "generate button");
    // A generation runs in chat 1: the button is disabled there.
    app.client.receive(createEvent("generation.progress", { jobId: "job-a", chatId: "chat-1", messageKey: "illustration:msg-4@0", attemptKind: "initial", status: "running", phase: "generating", progress: { label: "Image 1/2" }, requestedCount: 2, completedSlots: 0, failedSlots: 0, canRetry: false, canRestart: false }, 1));
    await until(() => button()?.disabled, "disabled in chat 1");
    // The user switches to chat 2 (idle). The chat side reconciles; app state changes too (status refresh).
    active = "chat-2";
    fake.emitHostEvent("CHAT_SWITCHED", { chatId: "chat-2" });
    chat.reconcileNow();
    app.store.patch({ status: { ...app.state.status!, activeChatId: "chat-2" } });
    await wait(50);
    expect(button()!.disabled).toBe(false);
  });
});

/* ------------------------------------------------------------------------------------------------
 * An outfit job that finishes while its generation pane is hidden ends the session
 * ---------------------------------------------------------------------------------------------- */

function Harness({ tab }: { tab: WorkspaceTab }) {
  const view = useWorkspaceTabView({ characterId: null, tab, mobile: false });
  return (
    <div>
      <main data-test-content="">{view.content}</main>
      <div data-test-dock="">{view.dock}</div>
      {view.secondary ? (
        <aside data-test-secondary="">
          {view.secondary.content}
          <div data-test-secondary-dock="">{view.secondary.dock}</div>
        </aside>
      ) : null}
    </div>
  );
}

describe("outfit image generation session", () => {
  test("a job that finished while the generation pane was hidden does not leave the session generating forever", async () => {
    const mock = createFullMockBackend({ timeScale: 0 });
    seedWorkspaceDemo(mock.db);
    workspaceMockState(mock.db).jobStepMs = 0;
    const app = new AppController(new RpcClient(mock.transport));
    await app.init();
    const characterId = app.state.selectedCharacterId!;
    const ui = new WorkspaceUiStore();
    ui.updateSource(characterId, { activeTab: "prompts" });
    const root = doc.createElement("div");
    doc.body.appendChild(root);
    cleanups.push(() => { render(null, root as unknown as Element); app.destroy(); });
    render(
      <AppContext.Provider value={app}><WorkspaceUiContext.Provider value={ui}><Harness tab="prompts" /></WorkspaceUiContext.Provider></AppContext.Provider>,
      root as unknown as Element
    );
    await until(() => root.querySelector("[data-test-content] *"), "content");
    await wait(30);

    // Open the outfit generation pane of the first registered row.
    const row = app.state.workspace!.roster.find((r) => r.registered && r.promptKey)!;
    const promptKey = row.promptKey!;
    const collection = characterCollection(app.state.workspace!.document, promptKey);
    const sessions = sessionStoreFor(app);
    sessions.openGeneration(characterId, {
      target: { kind: "character", characterId, promptKey },
      formId: collection.defaultFormId,
      collectionRevision: "",
      draft: { label: "", description: "", head: "", top: "shirt", bottom: "", legs: "", feet: "", nsfw: false, gender: "female" },
      replaceCurrent: false,
      seed: "",
      seedFixed: false,
      useReference: false,
      referenceType: "character",
      strength: 0.6,
      fidelity: 1
    });
    ui.openSecondary(characterId, "outfit", { promptKey });
    const generateButton = await until(() => root.querySelector<HTMLButtonElement>('[data-test-secondary-dock] [aria-label="Generate outfit image"]'), "generation dock");

    // Backend accepts the job; it runs for a while (no events yet).
    (mock.handlers as Record<string, unknown>)["outfitImage.generate"] = () => ({ jobId: "outfit-slow" });
    generateButton.click();
    await until(() => sessions.get(characterId).generation?.jobId === "outfit-slow", "job started");

    // The user leaves the pane (another tab / closes the pane) while the image is generated.
    ui.updateSource(characterId, { activeTab: "assets", secondaryOpen: false });
    await until(() => !root.querySelector("[data-test-secondary]"), "pane hidden");

    // The job finishes; the app drops finished outfit jobs after FINISHED_JOB_TTL_MS (30 s). Run that timer now.
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void, ms?: number) => realSetTimeout(fn, ms === 30_000 ? 0 : ms)) as typeof setTimeout;
    try {
      app.client.receive(createEvent("outfitImage.finished", { jobId: "outfit-slow", result: { resultId: "res-x", imageId: "img-x", url: "data:image/png;base64,AA==", seed: "1", width: 832, height: 1216, positivePrompt: "shirt", negativePrompt: "", createdAt: new Date().toISOString() } }, 99));
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
    await until(() => !app.state.outfitJobs["outfit-slow"], "finished job cleaned up");

    // Back to the row's outfit pane: the generation session is shown again.
    ui.updateSource(characterId, { activeTab: "prompts" });
    ui.openSecondary(characterId, "outfit", { promptKey });
    await until(() => root.querySelector('[data-test-secondary-dock] [aria-label="Generate outfit image"]'), "generation pane again");
    await wait(50);
    expect(sessions.get(characterId).generation?.jobId).toBeNull();
    expect(root.querySelector<HTMLButtonElement>('[data-test-secondary-dock] [aria-label="Generate outfit image"]')!.disabled).toBe(false);
  });
});

async function generationPane() {
  const mock = createFullMockBackend({ timeScale: 0 });
  seedWorkspaceDemo(mock.db);
  workspaceMockState(mock.db).jobStepMs = 0;
  const app = new AppController(new RpcClient(mock.transport));
  await app.init();
  const characterId = app.state.selectedCharacterId!;
  const ui = new WorkspaceUiStore();
  ui.updateSource(characterId, { activeTab: "prompts" });
  const root = doc.createElement("div");
  doc.body.appendChild(root);
  cleanups.push(() => { render(null, root as unknown as Element); app.destroy(); });
  render(
    <AppContext.Provider value={app}><WorkspaceUiContext.Provider value={ui}><Harness tab="prompts" /></WorkspaceUiContext.Provider></AppContext.Provider>,
    root as unknown as Element
  );
  await until(() => root.querySelector("[data-test-content] *"), "content");
  await wait(30);
  const promptKey = app.state.workspace!.roster.find((r) => r.registered && r.promptKey)!.promptKey!;
  const collection = characterCollection(app.state.workspace!.document, promptKey);
  const sessions = sessionStoreFor(app);
  const open = () => sessions.openGeneration(characterId, {
    target: { kind: "character", characterId, promptKey },
    formId: collection.defaultFormId,
    collectionRevision: "",
    draft: { label: "", description: "", head: "", top: "shirt", bottom: "", legs: "", feet: "", nsfw: false, gender: "female" },
    replaceCurrent: false,
    seed: "",
    seedFixed: false,
    useReference: false,
    referenceType: "character",
    strength: 0.6,
    fidelity: 1
  });
  open();
  ui.openSecondary(characterId, "outfit", { promptKey });
  const button = () => root.querySelector<HTMLButtonElement>('[data-test-secondary-dock] [aria-label="Generate outfit image"]');
  await until(button, "generation dock");
  const generateCalls = () => mock.calls.filter((c) => c.method === "outfitImage.generate").length;
  return { mock, app, characterId, sessions, open, button, generateCalls };
}

const outfitResult = (resultId: string) => ({ resultId, imageId: `img-${resultId}`, url: "data:image/png;base64,AA==", seed: "1", width: 832, height: 1216, positivePrompt: "shirt", negativePrompt: "", createdAt: new Date().toISOString() });

describe("outfit image generation requests", () => {
  test("a job that finished before the generate answer still ends the session with its result", async () => {
    const pane = await generationPane();
    pane.mock.handlers["outfitImage.generate"] = async (_params, ctx) => {
      ctx.emit("outfitImage.finished", { jobId: "outfit-fast", result: outfitResult("res-fast") });
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { jobId: "outfit-fast" };
    };
    pane.button()!.click();
    await until(() => pane.sessions.get(pane.characterId).generation?.results.some((r) => r.resultId === "res-fast"), "result merged");
    expect(pane.sessions.get(pane.characterId).generation?.jobId).toBeNull();
  });

  test("a second Generate while the first request is in flight starts nothing", async () => {
    const pane = await generationPane();
    let release!: () => void;
    pane.mock.handlers["outfitImage.generate"] = async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return { jobId: "outfit-one" };
    };
    pane.button()!.click();
    pane.button()!.click();
    await until(() => pane.generateCalls() === 1, "request sent");
    release();
    await until(() => pane.sessions.get(pane.characterId).generation?.jobId === "outfit-one", "job stored");
    await wait(30);
    expect(pane.generateCalls()).toBe(1);
  });

  test("the answer of a closed session is not attached to the session opened after it", async () => {
    const pane = await generationPane();
    let release!: () => void;
    pane.mock.handlers["outfitImage.generate"] = async () => {
      await new Promise<void>((resolve) => (release = resolve));
      return { jobId: "outfit-old" };
    };
    pane.button()!.click();
    await until(() => pane.generateCalls() === 1, "request sent");
    pane.sessions.closeGeneration(pane.characterId);
    pane.open();
    release();
    await wait(50);
    expect(pane.sessions.get(pane.characterId).generation?.jobId).toBeNull();
  });
});
