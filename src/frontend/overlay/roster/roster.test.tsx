import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import { createMockBackend } from "../../dev/mock-backend.js";
import { coreMockHandlers } from "../../dev/mock/core.js";
import { workspaceMockHandlers } from "../../dev/mock/workspace.js";
import { draftKeyForCharacter, draftStoreFor } from "../workspace/drafts.js";
import { characterCollection } from "../workspace/model.js";
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

type MountOptions = { handlers?: NonNullable<Parameters<typeof createMockBackend>[0]>["handlers"]; seed?: (mock: ReturnType<typeof createMockBackend>) => void; setup?: (ui: WorkspaceUiStore) => void; referenceMode?: boolean; canExpand?: boolean };

async function mount(options: MountOptions = {}) {
  const mock = createMockBackend({ handlers: options.handlers ?? [coreMockHandlers()] });
  options.seed?.(mock);
  const app = new AppController(new RpcClient(mock.transport));
  await app.init();
  const ui = new WorkspaceUiStore();
  options.setup?.(ui);
  const root = doc.createElement("div");
  doc.body.appendChild(root);
  render(
    <AppContext.Provider value={app}>
      <WorkspaceUiContext.Provider value={ui}>
        <RosterSidebar referenceMode={options.referenceMode} canExpand={options.canExpand} />
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

describe("bulk promote of AI-generated people (AM 0.9.91 Met_91)", () => {
  const CHAR = "char-seoyeon";
  const AI1 = "character_7b1c9f3a-0000-4000-8000-0000000000a1";
  const AI2 = "character_7b1c9f3a-0000-4000-8000-0000000000a2";
  const seedAi = (mock: ReturnType<typeof createMockBackend>) => {
    mock.db.documents[CHAR]!.customCharacters.push(
      { id: AI1, title: "Guard captain", recognitionKeys: ["captain"], appearanceDescription: "", origin: "ai-auto" },
      { id: AI2, title: "Street vendor", recognitionKeys: ["vendor"], appearanceDescription: "", origin: "ai-auto" }
    );
  };
  const promoteCalls = (mock: ReturnType<typeof createMockBackend>) => mock.calls.filter((c) => c.method === "customCharacters.promote").map((c) => (c.params as { customIds: string[] }).customIds);

  test("collapsed roster: header row with the count; click promotes the visible AI people", async () => {
    const { root, mock, app } = await mount({ seed: seedAi });
    const header = root.querySelector("[data-character-ai-promotion-header]")!;
    expect(header).toBeTruthy();
    expect(header.textContent).toContain("AI-generated people");
    const button = header.querySelector<HTMLButtonElement>("[data-character-bulk-promote]")!;
    expect(button.textContent).toBe("Bulk promote (2)");
    expect(button.getAttribute("aria-label")).toBe("Promote 2 AI people to registered people");
    expect(button.getAttribute("title")).toBe("Promote 2 AI people to registered people");
    // Rendered right before the first AI section, after the manual custom section.
    expect(header.nextElementSibling!.getAttribute("data-roster-section")).toBe("aiWithoutThumbnail");
    expect(header.previousElementSibling!.getAttribute("data-roster-section")).toBe("customWithoutThumbnail");
    button.click();
    await wait(20);
    expect(promoteCalls(mock)).toEqual([[AI1, AI2]]);
    expect(app.state.workspace!.roster.filter((r) => r.origin === "ai-auto")).toEqual([]);
    expect(root.querySelector("[data-character-bulk-promote]")).toBeNull();
    render(null, root as unknown as Element);
  });

  test("a search that hides one AI person leaves (1) and sends only the visible id", async () => {
    const { root, mock, ui } = await mount({ seed: seedAi, setup: (u) => u.updateSource(CHAR, { navigationView: "custom", lastRegistrationView: "custom" }) });
    expect(root.querySelector("[data-character-bulk-promote]")!.textContent).toBe("Bulk promote (2)");
    ui.setSearch(CHAR, "roster:custom", "vendor");
    await wait(60);
    const button = root.querySelector<HTMLButtonElement>("[data-character-bulk-promote]")!;
    expect(button.textContent).toBe("Bulk promote (1)");
    button.click();
    await wait(20);
    expect(promoteCalls(mock)).toEqual([[AI2]]);
    render(null, root as unknown as Element);
  });

  test("expanded roster: icon-only button in the collection header before the select-all toggle", async () => {
    const { root, mock } = await mount({ seed: seedAi, canExpand: true, setup: (u) => u.updateGlobal({ rosterExpanded: true }) });
    expect(root.querySelector("[data-character-ai-promotion-header]")).toBeNull();
    const button = root.querySelector<HTMLButtonElement>("[data-roster-collection-header] [data-character-bulk-promote]")!;
    expect(button).toBeTruthy();
    expect(button.textContent).toBe("");
    expect(button.getAttribute("title")).toBe("Promote 2 AI people to registered people");
    expect(button.nextElementSibling!.hasAttribute("data-roster-bulk")).toBe(true);
    button.click();
    await wait(20);
    expect(promoteCalls(mock)).toEqual([[AI1, AI2]]);
    render(null, root as unknown as Element);
  });

  test("hidden without AI people, in reference mode and in the lorebook view", async () => {
    const plain = await mount();
    expect(plain.root.querySelector("[data-character-bulk-promote]")).toBeNull();
    render(null, plain.root as unknown as Element);
    const reference = await mount({ seed: seedAi, referenceMode: true });
    expect(reference.root.querySelectorAll("[data-roster-item]").length).toBeGreaterThan(0);
    expect(reference.root.querySelector("[data-character-bulk-promote]")).toBeNull();
    render(null, reference.root as unknown as Element);
    const lorebooks = await mount({ seed: seedAi, setup: (u) => u.updateSource(CHAR, { navigationView: "lorebooks", lastRegistrationView: "lorebooks" }) });
    expect(lorebooks.root.querySelector("[data-roster-sidebar]")!.getAttribute("data-roster-sidebar")).toBe("lorebooks");
    expect(lorebooks.root.querySelector("[data-character-bulk-promote]")).toBeNull();
    render(null, lorebooks.root as unknown as Element);
  });
});

describe("roster export / import", () => {
  test("export downloads the registered people as a roster file", async () => {
    const { root, app } = await mount();
    const view = win as unknown as { URL: { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void } };
    const blobs: Blob[] = [];
    const saved = { create: view.URL.createObjectURL, revoke: view.URL.revokeObjectURL };
    view.URL.createObjectURL = (blob: Blob) => { blobs.push(blob); return "blob:roster"; };
    view.URL.revokeObjectURL = () => undefined;
    try {
      const button = root.querySelector<HTMLButtonElement>("[data-roster-collection-header] [data-roster-export]")!;
      expect(button.getAttribute("aria-label")).toBe("Export the roster to a file");
      button.click();
      await wait();
      expect(blobs.length).toBe(1);
      const file = JSON.parse(await blobs[0]!.text());
      expect(file.schema).toBe("inlay-illustrator.roster");
      expect(file.people.map((p: { title: string }) => p.title)).toEqual(app.state.workspace!.roster.filter((r) => r.registered).map((r) => r.title));
    } finally {
      view.URL.createObjectURL = saved.create;
      view.URL.revokeObjectURL = saved.revoke;
    }
    render(null, root as unknown as Element);
  });

  test("import previews matches and new people, then loads the file", async () => {
    const { root, app, mock } = await mount();
    const snapshot = app.state.workspace!;
    const registered = snapshot.roster.filter((r) => r.registered);
    const file = {
      schema: "inlay-illustrator.roster", version: 1, exportedAt: "", source: { characterName: "Other" },
      people: [
        { title: registered[0]!.title, kind: registered[0]!.kind, active: true, recognitionKeys: [], appearanceDescription: "" },
        { title: "Ben Lazarra", kind: "lore", active: true, recognitionKeys: ["ben"], appearanceDescription: "Guitarist." }
      ]
    };
    const input = root.querySelector<HTMLInputElement>("[data-roster-import-input]")!;
    const blob = new (win as unknown as { File: typeof File }).File([JSON.stringify(file)], "band.roster.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [blob], configurable: true });
    input.dispatchEvent(new (win as unknown as { Event: typeof Event }).Event("change", { bubbles: true }));
    await wait(30);
    const steps = [...root.querySelectorAll("[data-roster-import-step]")].map((li) => [li.querySelector("strong")!.textContent, li.getAttribute("data-roster-import-step")]);
    expect(steps).toEqual([[registered[0]!.title, "match"], ["Ben Lazarra", "create"]]);
    expect(root.querySelector("[data-roster-import-notes]")!.textContent).toContain("1 new custom person will be added.");
    root.querySelector<HTMLButtonElement>("[data-roster-import-confirm]")!.click();
    await wait(30);
    expect(mock.calls.filter((c) => c.method === "roster.import").length).toBe(1);
    expect(app.state.workspace!.roster.find((r) => r.title === "Ben Lazarra")).toMatchObject({ kind: "custom", registered: true, workspaceEnabled: true, recognitionKeys: ["ben"] });
    expect(root.querySelector("[data-roster-import-preview]")).toBeNull();
    render(null, root as unknown as Element);
  });

  test("a file that is not a roster shows the error and calls nothing", async () => {
    const { root, mock } = await mount();
    const input = root.querySelector<HTMLInputElement>("[data-roster-import-input]")!;
    const blob = new (win as unknown as { File: typeof File }).File(["{\"schema\":\"x\"}"], "x.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [blob], configurable: true });
    input.dispatchEvent(new (win as unknown as { Event: typeof Event }).Event("change", { bubbles: true }));
    await wait(30);
    expect(root.querySelector("[data-roster-import-error]")!.textContent).toBe("This is not an Inlay Illustrator roster file.");
    expect(mock.calls.some((c) => c.method === "roster.import")).toBe(false);
    render(null, root as unknown as Element);
  });

  test("only in the roster view, not in reference mode", async () => {
    const reference = await mount({ referenceMode: true });
    expect(reference.root.querySelector("[data-roster-transfer]")).toBeNull();
    render(null, reference.root as unknown as Element);
    const lorebooks = await mount({ setup: (u) => u.updateSource("char-seoyeon", { navigationView: "lorebooks", lastRegistrationView: "lorebooks" }) });
    expect(lorebooks.root.querySelector("[data-roster-transfer]")).toBeNull();
    render(null, lorebooks.root as unknown as Element);
  });
});

describe("roster export / import with unsaved appearance edits", () => {
  const handlers = () => [coreMockHandlers(), workspaceMockHandlers()];
  /** Puts an unsaved hair edit on the first registered person (as the Prompts tab would). */
  function editFirst(app: AppController, hair: string) {
    const ws = app.state.workspace!;
    const row = ws.roster.find((r) => r.registered)!;
    draftStoreFor(app).edit(draftKeyForCharacter(ws.characterId, row.promptKey), characterCollection(ws.document, row.promptKey), (c) => ({
      ...c,
      forms: c.forms.map((f, i) => (i === 0 ? { ...f, basePromptGroups: { ...f.basePromptGroups, "hair.color": [hair] } } : f))
    }));
    return row;
  }
  function captureDownloads() {
    const view = win as unknown as { URL: { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void } };
    const blobs: Blob[] = [];
    const saved = { create: view.URL.createObjectURL, revoke: view.URL.revokeObjectURL };
    view.URL.createObjectURL = (blob: Blob) => { blobs.push(blob); return "blob:roster"; };
    view.URL.revokeObjectURL = () => undefined;
    return { blobs, restore: () => { view.URL.createObjectURL = saved.create; view.URL.revokeObjectURL = saved.revoke; } };
  }
  const hairOf = async (blob: Blob, title: string) => {
    const person = JSON.parse(await blob.text()).people.find((p: { title: string }) => p.title === title);
    return person.forms?.forms[0]?.basePromptGroups?.["hair.color"] ?? null;
  };

  test("export asks first; Save and export saves the edit and exports it", async () => {
    const { root, app, mock } = await mount({ handlers: handlers() });
    const row = editFirst(app, "silver hair");
    await wait();
    const downloads = captureDownloads();
    try {
      root.querySelector<HTMLButtonElement>("[data-roster-export]")!.click();
      await wait();
      expect(downloads.blobs.length).toBe(0);
      expect(root.querySelector('[role="alertdialog"]')!.textContent).toContain("1 person has unsaved edits");
      root.querySelector<HTMLButtonElement>("[data-roster-export-save]")!.click();
      await wait(40);
      expect(mock.calls.filter((c) => c.method === "prompts.saveForms").length).toBe(1);
      expect(draftStoreFor(app).dirtyKeys().length).toBe(0);
      expect(downloads.blobs.length).toBe(1);
      expect(await hairOf(downloads.blobs[0]!, row.title)).toEqual(["silver hair"]);
    } finally {
      downloads.restore();
    }
    render(null, root as unknown as Element);
  });

  test("Export saved version leaves the draft alone and exports the saved appearance", async () => {
    const { root, app, mock } = await mount({ handlers: handlers() });
    const row = editFirst(app, "teal hair");
    await wait();
    const downloads = captureDownloads();
    try {
      root.querySelector<HTMLButtonElement>("[data-roster-export]")!.click();
      await wait(30);
      root.querySelector<HTMLButtonElement>("[data-roster-export-saved]")!.click();
      await wait(20);
      expect(mock.calls.some((c) => c.method === "prompts.saveForms")).toBe(false);
      expect(draftStoreFor(app).dirtyKeys().length).toBe(1);
      expect(downloads.blobs.length).toBe(1);
      expect(await hairOf(downloads.blobs[0]!, row.title)).not.toEqual(["teal hair"]);
    } finally {
      downloads.restore();
    }
    render(null, root as unknown as Element);
  });

  test("import says the edits will be saved and saves them before importing", async () => {
    const { root, app, mock } = await mount({ handlers: handlers() });
    editFirst(app, "copper hair");
    await wait();
    const file = { schema: "inlay-illustrator.roster", version: 1, exportedAt: "", source: { characterName: "Other" }, people: [{ title: "Ben Lazarra", kind: "custom", active: true, recognitionKeys: ["ben"], appearanceDescription: "" }] };
    const input = root.querySelector<HTMLInputElement>("[data-roster-import-input]")!;
    Object.defineProperty(input, "files", { value: [new (win as unknown as { File: typeof File }).File([JSON.stringify(file)], "r.json")], configurable: true });
    input.dispatchEvent(new (win as unknown as { Event: typeof Event }).Event("change", { bubbles: true }));
    await wait(30);
    expect(root.querySelector("[data-roster-import-notes]")!.textContent).toContain("1 unsaved appearance edit on this character will be saved first.");
    root.querySelector<HTMLButtonElement>("[data-roster-import-confirm]")!.click();
    await wait(40);
    const order = mock.calls.map((c) => c.method).filter((m) => m === "prompts.saveForms" || m === "roster.import");
    expect(order).toEqual(["prompts.saveForms", "roster.import"]);
    expect(draftStoreFor(app).dirtyKeys().length).toBe(0);
    render(null, root as unknown as Element);
  });
});
