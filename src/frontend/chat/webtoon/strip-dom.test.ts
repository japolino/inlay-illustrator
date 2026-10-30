import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { ChatMessageUiState } from "../../../shared/contract/chat-dom.js";
import type { WebtoonStripView } from "../../../shared/contract/webtoon.js";
import type { AppController } from "../../state/app-state.js";
import { layoutStrip, type PanelImage } from "../../../backend/webtoon/layout.js";
import type { Storyboard } from "../../../backend/webtoon/storyboard-schema.js";
import fixture from "../../../backend/webtoon/__fixtures__/storyboard-a2.json" with { type: "json" };
import { renderStrip, TOOL_SIZE, toolsSpot } from "./strip-dom.js";
import { createWebtoonStrips } from "./strip-controller.js";

const win = new Window({ url: "http://localhost/" });
const doc = win.document as unknown as Document;
const labels = { reroll: "Redraw", previousTake: "Previous", nextTake: "Next", drawing: "Drawing", failed: "Failed", pending: "Pending", edit: "Edit" };
const take = (n: number) => ({ imageId: `img-${n}`, url: `/api/v1/image-gen/results/img-${n}`, seed: String(n), width: 832, height: 1216, createdAt: n });

function view(): WebtoonStripView {
  const storyboard = fixture as unknown as Storyboard;
  const sizes: Record<string, PanelImage> = {};
  for (const p of storyboard.panels) if (p.kind === "image") sizes[String(p.id)] = { width: Number(p.size.split("x")[0]), height: Number(p.size.split("x")[1]) };
  const layout = layoutStrip(storyboard, sizes);
  const panels: WebtoonStripView["panels"] = {};
  for (const [i, lp] of layout.panels.entries()) {
    const p = { panelId: String(lp.id) };
    panels[p.panelId] = i === 0
      ? { panelId: p.panelId, status: "done", selected: 0, takes: [take(1)] }
      : i === 1 ? { panelId: p.panelId, status: "error", selected: -1, takes: [], error: "429" } : { panelId: p.panelId, status: "pending", selected: -1, takes: [] };
  }
  return { chatId: "c", messageKey: "illustration:m@0", status: "generating", revision: 3, title: "T", layout, panels, updatedAt: 0 };
}

describe("webtoon strip DOM", () => {
  test("layout JSON -> panels, balloon shapes, real text, controls", () => {
    const v = view();
    const calls: string[] = [];
    const ids = v.layout!.panels.map((p) => String(p.id));
    const canvas = renderStrip(doc, v, { onReroll: (id) => calls.push(`reroll:${id}`), onSelectTake: () => {}, onEditText: (t) => calls.push(`edit:${t.panelId}:${t.textIndex}:${t.text}`) }, { busyPanels: new Set([ids[2]!]), stripBusy: false, labels })!;
    expect(canvas.style.height).toBe(`${v.layout!.height}px`);
    const panels = canvas.querySelectorAll("[data-ii-wt-panel]");
    expect(panels.length).toBe(v.layout!.panels.length);
    expect(panels[0]!.querySelector("img")!.getAttribute("src")).toBe("/api/v1/image-gen/results/img-1");
    expect(panels[1]!.textContent).toBe("Failed: 429");
    expect(panels[2]!.textContent).toBe("Pending");
    const texts = canvas.querySelectorAll("[data-ii-wt-text]");
    const textItems = v.layout!.items.flatMap((i) => (i.kind === "title" ? [] : [i]));
    expect(texts.length).toBe(textItems.length);
    const balloons = v.layout!.items.filter((i) => i.kind === "speech" || i.kind === "thought").length;
    expect(canvas.querySelector("svg")!.children.length).toBeGreaterThan(balloons);
    const first = textItems[0]!;
    expect(texts[0]!.textContent).toBe(first.kind === "sfx" ? first.text : first.lines.join(""));
    (texts[0] as HTMLElement).click();
    expect(calls).toEqual([`edit:${first.panel}:${first.textIndex}:${first.text}`]);
    const buttons = [...canvas.querySelectorAll("[data-ii-wt-reroll]")] as HTMLButtonElement[];
    expect(buttons.map((b) => b.disabled)).toEqual(v.layout!.panels.map((_p, i) => i === 2));
    buttons[0]!.click();
    buttons[2]!.click();
    expect(calls.at(-1)).toBe(`reroll:${ids[0]}`);
  });

  test("take arrows only on a panel with older takes, shown while the pointer is over that panel", () => {
    const v = view();
    const id = String(v.layout!.panels[0]!.id);
    v.panels[id] = { ...v.panels[id]!, takes: [take(1), take(2), take(3)], selected: 2 };
    const calls: string[] = [];
    const canvas = renderStrip(doc, v, { onReroll() {}, onSelectTake: (panelId, n) => calls.push(`${panelId}:${n}`), onEditText() {} }, { busyPanels: new Set(), stripBusy: false, labels })!;
    expect(canvas.querySelectorAll("[data-ii-wt-take]").length).toBe(2);
    const controls = canvas.querySelector(`[data-ii-wt-controls="${id}"]`)!;
    const [prev, next] = [...controls.querySelectorAll("[data-ii-wt-take]")] as HTMLButtonElement[];
    expect(prev!.title).toBe("Previous (3/3)");
    expect([prev!.disabled, next!.disabled]).toEqual([false, true]);
    prev!.click();
    expect(calls).toEqual([`${id}:1`]);
    canvas.querySelector(`[data-ii-wt-panel="${id}"] img`)!.dispatchEvent(new win.Event("pointerover", { bubbles: true }) as unknown as Event);
    expect(controls.hasAttribute("data-ii-wt-hover")).toBe(true);
    expect(canvas.querySelectorAll("[data-ii-wt-hover]").length).toBe(1);
  });

  test("frame-break cut-out drawn over its panel; phone layout marks the canvas narrow (controls on the left edge)", () => {
    const v = view();
    const panel = v.layout!.panels[0]!;
    v.layout = { ...v.layout!, width: 506, panels: [{ ...panel, frameBreak: "top", cutout: { src: "/api/v1/image-gen/results/cut-1" } }, ...v.layout!.panels.slice(1)] };
    const canvas = renderStrip(doc, v, { onReroll() {}, onSelectTake() {}, onEditText() {} }, { busyPanels: new Set(), stripBusy: false, labels })!;
    expect(canvas.getAttribute("data-ii-wt-narrow")).toBe("true");
    const cut = canvas.querySelectorAll("[data-ii-wt-cutout]");
    expect(cut.length).toBe(1);
    expect(cut[0]!.querySelector("img")!.getAttribute("src")).toBe("/api/v1/image-gen/results/cut-1");
    expect(parseFloat((cut[0] as HTMLElement).style.top)).toBeCloseTo(panel.rect[1], 1);
    expect(renderStrip(doc, view(), { onReroll() {}, onSelectTake() {}, onEditText() {} }, { busyPanels: new Set(), stripBusy: false, labels })!.hasAttribute("data-ii-wt-narrow")).toBe(false);
  });

  test("panel tools go to the first frame spot clear of text boxes (phone layout: left edge first)", () => {
    const frame: [number, number, number, number] = [0, 100, 690, 1100];
    const row = 36 + TOOL_SIZE.gap + 36;
    expect(toolsSpot(frame, 2, 36, false, [])).toEqual([690 - 8 - row, 108]);
    expect(toolsSpot(frame, 2, 36, false, [[400, 100, 690, 200]])).toEqual([8, 108]);
    expect(toolsSpot([0, 0, 506, 800], 1, 48, true, [])).toEqual([8, 376]);
  });

  test("no layout yet -> nothing to draw", () => {
    expect(renderStrip(doc, { ...view(), layout: null }, { onReroll() {}, onSelectTake() {}, onEditText() {} }, { busyPanels: new Set(), stripBusy: true, labels })).toBeNull();
  });
});

describe("webtoon strips in the chat", () => {
  test("a failed webtoon.get is retried (after a backoff) until the strip shows", async () => {
    const bubble = doc.createElement("div");
    doc.body.appendChild(bubble);
    const ctx = { dom: { inject: (target: Element) => target.appendChild(doc.createElement("div")), uninject: (el: Element) => el.remove() } } as unknown as SpindleFrontendContext;
    let gets = 0;
    const app = { call: () => (++gets === 1 ? Promise.reject(new Error("Request timed out")) : Promise.resolve({ strip: view() })) } as unknown as AppController;
    const state = { chatId: "c", messageKey: "illustration:m@0", busy: false, webtoon: { revision: 3, status: "generating" } } as unknown as ChatMessageUiState;
    const sync = () => strips.sync("c", [{ messageId: "m", element: bubble, state }], {});
    const strips = createWebtoonStrips(ctx, app, { doc, notice: () => {}, schedule: () => setTimeout(sync, 0) });
    sync();
    const deadline = Date.now() + 3000;
    while (!bubble.querySelector(".ii-wt-canvas") && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    expect(gets).toBe(2);
    expect(bubble.querySelector(".ii-wt-strip")!.getAttribute("data-ii-wt-status")).toBe("generating");
    strips.destroy();
  });
});
