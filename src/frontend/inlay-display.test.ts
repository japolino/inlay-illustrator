import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { applyInlayDisplaySettings } from "./inlay-display.js";

function fakeElement(className: string, attributes: Record<string, string>, children: any[]): any {
  return {
    className,
    style: { cssText: "" },
    attributes: new Map(Object.entries(attributes)),
    children,
    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    },
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
    },
    querySelector(selector: string) {
      if (selector === ".inlay-illustrator-frame") {
        return children.find((child) => String(child.className).includes("inlay-illustrator-frame")) ?? null;
      }
      return children.find((child) => (child.attributes as Map<string, string> | undefined)?.has("data-inlay-illustrator-image-id")) ?? null;
    }
  };
}

function fakeRoot(sections: any[]): any {
  return {
    querySelectorAll(selector: string) {
      expect(selector).toBe('[data-inlay-illustrator="true"]');
      return sections;
    }
  };
}

function imageFrame(placement: string, width?: number, height?: number) {
  const img = {
    className: "inlay-img",
    style: { cssText: "" },
    attributes: new Map<string, string>([
      ["data-inlay-illustrator-image-id", "img-1"],
      ...(width && height ? [["width", String(width)], ["height", String(height)]] as Array<[string, string]> : [])
    ]),
    getAttribute(name: string) {
      return this.attributes.get(name) ?? null;
    }
  };
  const frame = { className: "inlay-illustrator-frame", style: { cssText: "" } };
  return fakeElement("inlay-illustrator-image", { "data-inlay-illustrator-placement": placement }, [frame, img]);
}

describe("inlay display settings", () => {
  test("restyles an existing paragraph inlay to the configured aspect ratio", () => {
    const wrapper = imageFrame("paragraph");
    const count = applyInlayDisplaySettings({ ...DEFAULT_CONFIG, inlayImageAspect: "portrait", inlayImageMaxHeightVh: 63 }, fakeRoot([wrapper]));

    expect(count).toBeGreaterThan(0);
    const frame = wrapper.querySelector(".inlay-illustrator-frame");
    expect(frame.style.cssText).toContain("aspect-ratio:3/4");
    expect(frame.style.cssText).toContain("width:min(100%, calc(63vh * 3 / 4))");
  });

  test("keeps the cover width cap for cover placements", () => {
    const wrapper = imageFrame("cover");
    applyInlayDisplaySettings({ ...DEFAULT_CONFIG, coverImageWidth: 1500, coverImageMaxHeightVh: 45 }, fakeRoot([wrapper]));

    const frame = wrapper.querySelector(".inlay-illustrator-frame");
    expect(frame.style.cssText).toContain("width:min(100%, 1500px, calc(45vh * 16 / 9))");
    expect(frame.style.cssText).toContain("aspect-ratio:16/9");
  });

  test("uses the placeholder frame display mode for pending slots", () => {
    const wrapper = imageFrame("paragraph");
    wrapper.className = "inlay-illustrator-placeholder";
    applyInlayDisplaySettings({ ...DEFAULT_CONFIG, inlayImageAspect: "square" }, fakeRoot([wrapper]));

    const frame = wrapper.querySelector(".inlay-illustrator-frame");
    expect(frame.style.cssText).toContain("display:flex;justify-content:center;align-items:center;");
    expect(frame.style.cssText).toContain("aspect-ratio:1/1");
  });

  test("is a no-op without a mounted document", () => {
    expect(applyInlayDisplaySettings(DEFAULT_CONFIG, null)).toBe(0);
  });
});
