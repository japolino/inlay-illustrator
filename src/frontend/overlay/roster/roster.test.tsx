import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import { createMockBackend } from "../../dev/mock-backend.js";
import { coreMockHandlers } from "../../dev/mock/core.js";
import { RpcClient } from "../../rpc/client.js";
import { AppContext, AppController } from "../../state/app-state.js";
import { WorkspaceUiContext, WorkspaceUiStore } from "../workspace-ui.js";
import { RosterSidebar, itemsForView, rosterSections } from "./RosterSidebar.js";

const win = new Window({ url: "http://localhost/" });
const doc = win.document as unknown as Document;
const frames = globalThis as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown; document?: unknown };
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
const wait = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

async function mount() {
  const mock = createMockBackend({ handlers: [coreMockHandlers()] });
  const app = new AppController(new RpcClient(mock.transport));
  await app.init();
  const ui = new WorkspaceUiStore();
  const root = doc.createElement("div");
  doc.body.appendChild(root);
  render(
    <AppContext.Provider value={app}>
      <WorkspaceUiContext.Provider value={ui}>
        <RosterSidebar />
      </WorkspaceUiContext.Provider>
    </AppContext.Provider>,
    root as unknown as Element
  );
  await wait();
  return { mock, app, ui, root };
}

describe("roster helpers", () => {
  test("views and sections", async () => {
    const mock = createMockBackend({ handlers: [coreMockHandlers()] });
    const app = new AppController(new RpcClient(mock.transport));
    await app.init();
    const snapshot = app.state.workspace!;
    expect(itemsForView(snapshot, "characters").every((i) => i.registered)).toBe(true);
    expect(itemsForView(snapshot, "lorebooks").some((i) => i.kind === "custom")).toBe(false);
    const sections = rosterSections(itemsForView(snapshot, "characters"), "characters").map((s) => s.id);
    expect(sections).toEqual(["withThumbnail", "characterDescription", "customWithoutThumbnail"]);
  });
});

describe("RosterSidebar", () => {
  test("renders the roster, toggles activation and switches to the registration view", async () => {
    const { root, app, ui } = await mount();
    const items = root.querySelectorAll("[data-roster-item]");
    expect(items.length).toBe(5);
    const jihoon = [...root.querySelectorAll<HTMLButtonElement>("[data-roster-item] button[aria-pressed]")].find((b) => b.getAttribute("aria-label")?.startsWith("강지훈"))!;
    expect(jihoon.getAttribute("aria-pressed")).toBe("false");
    jihoon.click();
    await wait(20);
    expect(app.state.workspace!.roster.find((r) => r.title.startsWith("강지훈"))!.workspaceEnabled).toBe(true);
    (root.querySelectorAll<HTMLButtonElement>('footer [role="tab"]')[1]!).click();
    await wait();
    expect(ui.source("char-seoyeon").navigationView).toBe("lorebooks");
    expect(root.querySelector("[data-roster-sidebar]")!.getAttribute("data-roster-sidebar")).toBe("lorebooks");
    render(null, root as unknown as Element);
  });

  test("Hangul chosung search filters the roster", async () => {
    const { root, ui } = await mount();
    ui.setSearch("char-seoyeon", "roster:characters", "ㄱㅁㅇ");
    await wait(60);
    const titles = [...root.querySelectorAll("[data-roster-item] button[aria-pressed]")].map((b) => b.getAttribute("aria-label"));
    expect(titles).toEqual(["김민아 (Kim Mina)"]);
    render(null, root as unknown as Element);
  });
});
