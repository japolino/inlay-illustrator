import { describe, expect, test } from "bun:test";
import { mountInlaySettingsHost } from "./settings-host.js";

class FakeNode {
  readonly children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  parentNode: FakeNode | null = null;
  className = "";

  appendChild<T extends FakeNode>(child: T): T {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild<T extends FakeNode>(child: T): T {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

describe("Extensions settings mount lifecycle", () => {
  test("mounts an owned child at settings_extensions without clearing siblings", () => {
    const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const shared = new FakeNode();
    const unrelated = new FakeNode();
    shared.appendChild(unrelated);
    const points: string[] = [];
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: () => new FakeNode() }
    });

    try {
      const host = mountInlaySettingsHost({
        mount(point: string) {
          points.push(point);
          return shared as unknown as Element;
        }
      } as never);

      expect(points).toEqual(["settings_extensions"]);
      expect(shared.children.length).toBe(2);
      expect(shared.children[0]).toBe(unrelated);
      expect(shared.children[1]).toBe(host.root as unknown as FakeNode);
      expect((host.root as unknown as FakeNode).attributes.get("data-inlay-illustrator-settings")).toBe("true");

      host.destroy();
      host.destroy();
      expect(shared.children).toEqual([unrelated]);
      expect(unrelated.parentNode).toBe(shared);
    } finally {
      if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
      else Reflect.deleteProperty(globalThis, "document");
    }
  });
});
