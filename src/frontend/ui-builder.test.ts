import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { UiBuilder } from "./ui-builder.js";

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<() => void>>();
  className = "";
  hidden = false;
  disabled = false;
  id = "";
  min = "";
  max = "";
  step = "";
  value = "";
  textContent: string | null = null;
  type = "";
  readonly style: Record<string, string> = {};
  readonly classList = {
    add: (..._names: string[]) => undefined,
    toggle: (_name: string, _force?: boolean) => false
  };

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }
}

describe("settings collapsible sections", () => {
  test("keep mounted fields intact after collapsing and reopening", () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: () => new FakeElement() }
    });

    try {
      const sections = new FakeElement();
      const expandedSections = new Map<string, boolean>();
      const ui = new UiBuilder(
        {} as never,
        sections as unknown as HTMLElement,
        DEFAULT_CONFIG,
        () => {},
        expandedSections,
        () => {}
      );

      const body = ui.section("Prompt", true) as unknown as FakeElement;
      const field = new FakeElement();
      const toggle = sections.children[0]!.children[0]!;
      body.append(field);

      toggle.click();
      expect(body.hidden).toBe(true);
      expect(body.children).toEqual([field]);
      expect(expandedSections.get("Prompt")).toBe(false);

      toggle.click();
      expect(body.hidden).toBe(false);
      expect(body.children).toEqual([field]);
      expect(expandedSections.get("Prompt")).toBe(true);
    } finally {
      if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });

  test("aligns every range label and exposes the selected choice to assistive technology", () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: () => new FakeElement() }
    });

    try {
      const sections = new FakeElement();
      const ui = new UiBuilder(
        {} as never,
        sections as unknown as HTMLElement,
        DEFAULT_CONFIG,
        () => {},
        new Map(),
        () => {}
      );
      ui.addRangeChoice(sections as unknown as HTMLElement, "perspectiveMode", "Perspective", [
        { value: "creative", label: "Creative" },
        { value: "static", label: "Static" },
        { value: "dynamic", label: "Dynamic" },
        { value: "asset", label: "Asset" }
      ]);

      const target = sections.children[0]!.children[1]!;
      const range = target.children[0]!;
      const input = range.children[0]!;
      const labels = range.children[1]!;
      expect(labels.style.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
      expect(input.attributes.get("aria-valuetext")).toBe("Dynamic");
    } finally {
      if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });

  test("passes accessible names to host numeric and select controls", () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: () => new FakeElement() }
    });
    const seen: Array<{ kind: string; ariaLabel?: string }> = [];
    const component = { destroy: () => undefined };
    const ctx = {
      components: {
        mountNumericInput: (_target: unknown, options: { ariaLabel?: string }) => {
          seen.push({ kind: "number", ariaLabel: options.ariaLabel });
          return component;
        },
        mountSelect: (_target: unknown, options: { ariaLabel?: string }) => {
          seen.push({ kind: "select", ariaLabel: options.ariaLabel });
          return component;
        }
      }
    };

    try {
      const sections = new FakeElement();
      const ui = new UiBuilder(
        ctx as never,
        sections as unknown as HTMLElement,
        DEFAULT_CONFIG,
        () => {},
        new Map(),
        () => {}
      );
      ui.addNumber(sections as unknown as HTMLElement, "maxImages", "Maximum images", 1, 12);
      ui.addSelect(sections as unknown as HTMLElement, "promptSyntax", "Prompt syntax", [
        { value: "nai", label: "NovelAI" }
      ]);
      expect(seen).toEqual([
        { kind: "number", ariaLabel: "Maximum images" },
        { kind: "select", ariaLabel: "Prompt syntax" }
      ]);
    } finally {
      if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });

});
