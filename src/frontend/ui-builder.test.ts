import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG } from "../shared/config.js";
import { settingsSectionSlug, UiBuilder } from "./ui-builder.js";

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<() => void>>();
  className = "";
  hidden = false;
  id = "";
  textContent: string | null = null;
  type = "";

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
      const host = sections.children[0]!;
      const toggle = host.children[0]!;
      expect(host.attributes.get("data-inlay-section")).toBe("prompt");
      expect(host.className).toContain("inlay-section-prompt");
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
});


describe("settings section layout hooks", () => {
  test("creates stable accessible slugs for wide-grid placement", () => {
    expect(settingsSectionSlug("Prompt output")).toBe("prompt-output");
    expect(settingsSectionSlug("Character memory")).toBe("character-memory");
    expect(settingsSectionSlug("  Inlay gallery  ")).toBe("inlay-gallery");
    expect(settingsSectionSlug("---")).toBe("section");
  });
});
