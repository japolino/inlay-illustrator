import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { render } from "preact";
import type { PersonaFormSelection } from "../../shared/contract/rpc.js";
import { RpcClient } from "../rpc/client.js";
import { AppContext, AppController } from "../state/app-state.js";
import { PersonaFormControl } from "./persona-form-control.js";

const win = new Window({ url: "http://localhost/" });
const doc = win.document as unknown as Document;
const frames = globalThis as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
const saved = { raf: frames.requestAnimationFrame, caf: frames.cancelAnimationFrame };
beforeAll(() => {
  frames.requestAnimationFrame = (cb: (time: number) => void) => setTimeout(() => cb(Date.now()), 0);
  frames.cancelAnimationFrame = (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle);
});
const cleanup: Array<() => void> = [];
afterEach(() => { for (const dispose of cleanup.splice(0)) dispose(); });
afterAll(() => { frames.requestAnimationFrame = saved.raf; frames.cancelAnimationFrame = saved.caf; win.happyDOM.abort(); });
const pause = () => new Promise((r) => setTimeout(r, 10));
async function until(check: () => boolean) {
  for (let i = 0; i < 200; i++) { if (check()) return; await pause(); }
  throw new Error("Form control did not settle");
}
function selection(chatId: string, extra: Partial<PersonaFormSelection> = {}): PersonaFormSelection {
  return { chatId, personaId: `persona-${chatId}`, personaName: `Persona ${chatId}`, forms: [{ id: "form_default", label: "Regular" }, { id: "form_wolf", label: "Wolf omega" }], selectedFormId: null, missingForm: false, supported: true, ...extra };
}
type Call = { method: string; params: { chatId: string; personaId?: string; formId?: string | null } };
function mount(handler: (call: Call) => Promise<PersonaFormSelection>) {
  const client = new RpcClient({ send() {}, subscribe() { return () => {}; } });
  const app = new AppController(client);
  const calls: Call[] = [];
  app.call = ((method: string, params: Call["params"]) => { const call = { method, params }; calls.push(call); return handler(call); }) as AppController["call"];
  const root = doc.createElement("div"); doc.body.append(root);
  const draw = (chatId: string) => render(<AppContext.Provider value={app}><PersonaFormControl key={chatId} app={app} chatId={chatId} /></AppContext.Provider>, root);
  draw("one");
  cleanup.push(() => { render(null, root); root.remove(); client.destroy(); });
  const select = () => root.querySelector("select")!;
  const choose = (value: string) => { select().value = value; select().dispatchEvent(new win.Event("change", { bubbles: true }) as unknown as Event); };
  return { app, root, calls, draw, select, choose };
}
test("shows Auto and real form labels, saves the exact chat/persona/form and clears back to Auto", async () => {
  let current = selection("one");
  const ui = mount(async ({ method, params }) => { if (method.endsWith("set")) current = { ...current, selectedFormId: params.formId ?? null }; return current; });
  await until(() => !ui.select().disabled);
  expect([...ui.select().options].map((o) => o.textContent)).toEqual(["Auto", "Regular", "Wolf omega"]);
  expect(ui.root.textContent).toContain("saved image prompts keep their original form");
  ui.choose("form_wolf");
  await until(() => !ui.select().disabled && ui.select().value === "form_wolf");
  await pause();
  expect(ui.calls.at(-1)).toEqual({ method: "personaForm.set", params: { chatId: "one", personaId: "persona-one", formId: "form_wolf" } });
  ui.choose(""); await until(() => !ui.select().disabled && ui.select().value === "");
  expect(ui.calls.at(-1)!.params.formId).toBeNull();
});
test("a delayed previous-chat response cannot overwrite the active chat", async () => {
  let old!: (value: PersonaFormSelection) => void;
  const ui = mount(({ params }) => params.chatId === "one" ? new Promise((r) => { old = r; }) : Promise.resolve(selection("two", { selectedFormId: "form_default" })));
  await until(() => !!old);
  ui.draw("two");
  await until(() => !ui.select().disabled && ui.root.textContent!.includes("Persona two"));
  old(selection("one", { selectedFormId: "form_wolf" })); await pause();
  expect(ui.select().value).toBe("form_default"); expect(ui.root.textContent).toContain("Persona two");
});
test("a delayed save in a previous chat cannot change the next chat", async () => {
  let finishSave!: (value: PersonaFormSelection) => void;
  const ui = mount(({ method, params }) => method.endsWith("set") ? new Promise((r) => { finishSave = r; }) : Promise.resolve(selection(params.chatId)));
  await until(() => !ui.select().disabled); ui.choose("form_wolf"); await until(() => !!finishSave);
  ui.draw("two"); await until(() => !ui.select().disabled && ui.root.textContent!.includes("Persona two"));
  finishSave(selection("one", { selectedFormId: "form_wolf" })); await pause();
  expect(ui.select().value).toBe(""); expect(ui.root.textContent).toContain("Persona two");
});
test("failed saves show an error and can reload without claiming the change was saved", async () => {
  const ui = mount(async ({ method, params }) => { if (method.endsWith("set")) throw new Error("The chat's persona changed"); return selection(params.chatId); });
  await until(() => !ui.select().disabled); ui.choose("form_wolf");
  await until(() => !!ui.root.querySelector('[role="alert"]'));
  expect(ui.root.textContent).toContain("persona changed"); expect(ui.select().disabled).toBe(true);
  ui.root.querySelector<HTMLButtonElement>("button")!.click();
  await until(() => !ui.select().disabled && !ui.root.querySelector('[role="alert"]'));
  expect(ui.select().value).toBe("");
});
test("removed forms are visible and choosing Auto can repair the selection", async () => {
  let current = selection("one", { selectedFormId: "form_gone", missingForm: true });
  const ui = mount(async ({ method }) => { if (method.endsWith("set")) current = selection("one"); return current; });
  await until(() => !ui.select().disabled);
  expect(ui.select().value).toBe("form_gone"); expect(ui.root.textContent).toContain("saved form was removed");
  ui.choose(""); await until(() => !ui.select().disabled && !ui.root.querySelector('[role="alert"]'));
  expect(ui.select().value).toBe("");
});
test("unsupported analysis mode and absent personas do not offer a misleading active control", async () => {
  const ui = mount(async ({ params }) => selection(params.chatId, { supported: false }));
  await until(() => ui.root.textContent!.includes("available for V5"));
  expect(ui.select().disabled).toBe(true);
});
test("no persona is displayed explicitly", async () => {
  const ui = mount(async ({ params }) => selection(params.chatId, { personaId: null, personaName: "", forms: [] }));
  await until(() => ui.calls.length > 0 && ui.root.textContent!.includes("No active persona"));
  expect(ui.select().disabled).toBe(true);
});
