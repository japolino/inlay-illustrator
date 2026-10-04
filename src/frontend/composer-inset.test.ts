import { describe, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { COMPOSER_INSET_VAR, composerInsetPx, rectToCssPx, startComposerInset, viewportCssSize } from "./composer-inset.js";

describe("composer inset math", () => {
  test("scale 1: inset = viewport bottom - composer top + gap", () => {
    // 1440x900, composer top 790 (qa evidence).
    expect(composerInsetPx({ viewportBottom: 900, unitPx: 1, composerTop: 790 })).toBe(122);
    // 390x844 mobile, composer top 742.
    expect(composerInsetPx({ viewportBottom: 844, unitPx: 1, composerTop: 742 })).toBe(114);
  });

  test("scale 1.25 with zoomed rects (rect units = 1.25 css px)", () => {
    // Composer 110 css px tall -> 137.5 rect units above the bottom.
    expect(composerInsetPx({ viewportBottom: 900, unitPx: 1.25, composerTop: 900 - 137.5 })).toBe(122);
  });

  test("scale 1.25 with unzoomed rects (rect units already css px inside body)", () => {
    // Probe reports 100 for 100 css px; the viewport bottom in body px is 900/1.25 = 720.
    expect(composerInsetPx({ viewportBottom: 720, unitPx: 1, composerTop: 610 })).toBe(122);
  });

  test("fallbacks: no composer, bad numbers, composer below the viewport", () => {
    expect(composerInsetPx({ viewportBottom: 900, unitPx: 1, composerTop: null })).toBe(66);
    expect(composerInsetPx({ viewportBottom: 900, unitPx: 0, composerTop: 700 })).toBe(66);
    expect(composerInsetPx({ viewportBottom: 900, unitPx: 1, composerTop: 950 })).toBe(12);
  });

  test("rect -> css px and viewport size", () => {
    expect(rectToCssPx(125, 1.25)).toBe(100);
    expect(rectToCssPx(125, 0)).toBe(125);
    expect(viewportCssSize({ innerWidth: 1440, innerHeight: 900, viewportBottom: 900, unitPx: 1.25 })).toEqual({ width: 1152, height: 720 });
    expect(viewportCssSize({ innerWidth: 1440, innerHeight: 900, viewportBottom: 720, unitPx: 1 })).toEqual({ width: 1152, height: 720 });
  });
});

describe("composer inset tracker (DOM)", () => {
  test("publishes the CSS variable, follows the composer, falls back without it and cleans up", () => {
    const win = new Window({ url: "http://localhost/", width: 390, height: 844 });
    const doc = win.document as unknown as Document;
    const rects = new Map<string, { top: number; bottom: number; height: number; width: number }>();
    const proto = (win as unknown as { HTMLElement: { prototype: HTMLElement } }).HTMLElement.prototype;
    proto.getBoundingClientRect = function (this: HTMLElement) {
      const key = this.hasAttribute("data-ii-composer-probe") ? "probe" : this.getAttribute("data-component") ?? "";
      const r = rects.get(key) ?? { top: 0, bottom: 0, height: 0, width: 0 };
      return { ...r, left: 0, right: r.width, x: 0, y: r.top, toJSON: () => r } as DOMRect;
    };
    rects.set("probe", { top: 744, bottom: 844, height: 100, width: 0 });
    const tracker = startComposerInset(doc, win as never);
    expect(tracker.current()).toBe(66);
    expect(doc.documentElement.style.getPropertyValue(COMPOSER_INSET_VAR)).toBe("66px");
    const composer = doc.createElement("div");
    composer.setAttribute("data-component", "InputArea");
    doc.body.appendChild(composer);
    rects.set("InputArea", { top: 742, bottom: 844, height: 102, width: 390 });
    const seen: number[] = [];
    tracker.subscribe((inset) => seen.push(inset));
    tracker.update();
    expect(tracker.current()).toBe(114);
    expect(seen).toEqual([114]);
    expect(doc.documentElement.style.getPropertyValue(COMPOSER_INSET_VAR)).toBe("114px");
    tracker.stop();
    expect(doc.documentElement.style.getPropertyValue(COMPOSER_INSET_VAR)).toBe("");
    expect(doc.querySelector("[data-ii-composer-probe]")).toBeNull();
    win.happyDOM.abort();
  });
});
