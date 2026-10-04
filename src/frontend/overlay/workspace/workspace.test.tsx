import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import { createFullMockBackend } from "../../dev/mock/index.js";
import { seedWorkspaceDemo, workspaceMockState } from "../../dev/mock/workspace.js";
import { documentFor } from "../../dev/mock/fixtures.js";
import { RpcClient } from "../../rpc/client.js";
import { AppContext, AppController } from "../../state/app-state.js";
import { WorkspaceUiContext, WorkspaceUiStore } from "../workspace-ui.js";
import type { WorkspaceTab } from "../labels.js";
import { useWorkspaceTabView } from "./index.js";

// Private happy-dom window (other test files install DOM fakes on globalThis).
const win = new Window({ url: "http://localhost/" });
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
const wait = (ms = 15) => new Promise((resolve) => setTimeout(resolve, ms));
/** Polls until `check` returns a truthy value (max 2 s). */
async function until<T>(check: () => T, label: string): Promise<NonNullable<T>> {
  for (let i = 0; i < 200; i += 1) {
    const value = check();
    if (value) return value as NonNullable<T>;
    await wait(10);
  }
  throw new Error(`timed out: ${label}`);
}

/** Renders all TabView slots the shell would place. */
function Harness({ tab }: { tab: WorkspaceTab }) {
  const view = useWorkspaceTabView({ characterId: null, tab, mobile: false });
  return (
    <div>
      <h1 data-test-title="">{view.title}</h1>
      <div data-test-header="">{view.headerEnd}</div>
      <main data-test-content="">{view.content}</main>
      <div data-test-dock="">{view.dock}</div>
      <div data-test-notices="">{view.notices}</div>
      {view.secondary ? (
        <aside data-test-secondary="">
          <h2>{view.secondary.title}</h2>
          {view.secondary.content}
          <div data-test-secondary-dock="">{view.secondary.dock}</div>
        </aside>
      ) : null}
    </div>
  );
}

async function mount(tab: WorkspaceTab) {
  const mock = createFullMockBackend({ timeScale: 0 });
  seedWorkspaceDemo(mock.db);
  workspaceMockState(mock.db).jobStepMs = 0;
  const app = new AppController(new RpcClient(mock.transport));
  await app.init();
  const ui = new WorkspaceUiStore();
  const characterId = app.state.selectedCharacterId;
  ui.updateSource(characterId, { activeTab: tab });
  const root = doc.createElement("div");
  doc.body.appendChild(root);
  const draw = (t: WorkspaceTab) => render(
    <AppContext.Provider value={app}>
      <WorkspaceUiContext.Provider value={ui}>
        <Harness tab={t} />
      </WorkspaceUiContext.Provider>
    </AppContext.Provider>,
    root as unknown as Element
  );
  draw(tab);
  await until(() => root.querySelector("[data-test-content] *"), "content");
  await wait(30);
  return { mock, app, ui, root, characterId: characterId!, draw, unmount: () => render(null, root as unknown as Element) };
}

function byLabel(root: Element, label: string): HTMLElement {
  const el = [...root.querySelectorAll<HTMLElement>("[aria-label]")].find((e) => e.getAttribute("aria-label") === label);
  if (!el) throw new Error(`no element labelled ${label}`);
  return el;
}

describe("assets tab", () => {
  test("lists registered people, opens the picker and writes the selection", async () => {
    const { root, mock, ui, characterId, unmount } = await mount("assets");
    expect(root.querySelector("[data-test-title]")!.textContent).toBe("Asset analysis");
    const rows = root.querySelectorAll('[data-assets-list="charx"] [data-character-workbench-row]');
    expect(rows.length).toBe(5);
    byLabel(root, "김민아 (Kim Mina) select assets").click();
    const aside = await until(() => root.querySelector("[data-test-secondary]"), "picker pane");
    expect(ui.source(characterId).secondaryMode).toBe("asset-picker");
    expect(aside.textContent).toContain("Outfit selection · 김민아 (Kim Mina)");
    const card = await until(() => aside.querySelector<HTMLButtonElement>('[aria-label="Select jihoon_default"]'), "picker card");
    card.click();
    const cp = documentFor(mock.db, characterId).characterPrompt;
    const key = Object.keys(cp.assetSelections).find((k) => k.endsWith("e2"))!;
    await until(() => cp.assetSelections[key]!.selectedAssetNames.length === 3, "selection write");
    expect(cp.assetSelections[key]!.selectedAssetNames).toEqual(["mina_default", "mina_angry", "jihoon_default"]);
    unmount();
  });

  test("runs a prompt analysis and shows the progress pill", async () => {
    const { root, app, unmount } = await mount("assets");
    byLabel(root, "Analyze selected CharX prompts").click();
    await until(() => Object.values(app.state.analysisJobs).some((j) => j.kind === "character-prompts" && j.finishedAt && j.status === "success"), "job finished");
    const pill = await until(() => root.querySelector("[data-test-notices] [data-progress-pill]"), "pill");
    await until(() => pill.textContent?.includes("Prompt analysis complete"), "pill text");
    unmount();
  });
});

describe("prompts tab", () => {
  test("edits the negative prompt in a draft and saves the collection", async () => {
    const { root, mock, characterId, unmount } = await mount("prompts");
    const negatives = root.querySelectorAll<HTMLTextAreaElement>('[data-negative-editor] textarea');
    expect(negatives.length).toBeGreaterThan(1);
    const area = negatives[1]!;
    area.value = "bad hands";
    area.dispatchEvent(new win.Event("input", { bubbles: true }) as unknown as Event);
    await wait();
    const save = root.querySelector<HTMLButtonElement>("[data-test-dock] [data-save-button]")!;
    expect(save.disabled).toBe(false);
    expect(save.getAttribute("aria-label")).toBe("Save prompts · has unsaved changes");
    save.click();
    await until(() => !root.querySelector<HTMLButtonElement>("[data-test-dock] [data-save-button]")!.getAttribute("aria-label")!.includes("unsaved"), "saved");
    const forms = documentFor(mock.db, characterId).characterPrompt.characterForms;
    expect(Object.values(forms).some((c) => c.forms.some((f) => f.negativePrompt === "bad hands"))).toBe(true);
    expect(root.querySelector<HTMLButtonElement>("[data-test-dock] [data-save-button]")!.disabled).toBe(true);
    unmount();
  });

  test("opens the outfit pane and adds an outfit to the draft", async () => {
    const { root, ui, characterId, unmount } = await mount("prompts");
    byLabel(root, "한서연 (Han Seo-yeon) outfit prompt").click();
    const aside = await until(() => root.querySelector("[data-test-secondary]"), "outfit pane");
    expect(ui.source(characterId).secondaryMode).toBe("outfit");
    expect(aside.querySelectorAll("[data-outfit-card]").length).toBe(2);
    expect(byLabel(aside, "Add outfit").hasAttribute("disabled")).toBe(true);
    unmount();
  });
});

describe("persona tab", () => {
  test("renders persona rows with the chat scope badge", async () => {
    const { root, unmount } = await mount("persona");
    const list = await until(() => root.querySelector("[data-persona-list]"), "persona list");
    expect(list.textContent).toContain("Joon");
    expect(list.textContent).toContain("Active in current chat");
    unmount();
  });
});

describe("artists tab", () => {
  test("lists NovelAI artists and selects one for the character", async () => {
    const { root, mock, characterId, unmount } = await mount("artists");
    expect(root.querySelector("[data-test-title]")!.textContent).toBe("Artist select");
    (await until(() => [...root.querySelectorAll("[aria-label]")].find((e) => e.getAttribute("aria-label") === "Recommended comic style select") as HTMLElement | undefined, "artist card")).click();
    await until(() => documentFor(mock.db, characterId).characterPrompt.selectedArtistId === "comic_page_illustration_style", "select");
    await until(() => root.querySelector('[data-artist-card="comic_page_illustration_style"]')?.getAttribute("data-selected") === "true", "rerender");
    expect(documentFor(mock.db, characterId).characterPrompt.selectedArtistId).toBe("comic_page_illustration_style");
    expect(root.querySelector('[data-artist-card="comic_page_illustration_style"]')!.getAttribute("data-selected")).toBe("true");
    unmount();
  });
});
