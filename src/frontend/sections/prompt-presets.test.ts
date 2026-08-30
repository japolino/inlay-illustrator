import { describe, expect, test } from "bun:test";
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { DEFAULT_CONFIG, type Config, type PromptPreset } from "../../shared/config.js";
import { UiBuilder } from "../ui-builder.js";
import { renderPromptSection } from "./prompt.js";

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, Array<() => void>>();
  readonly classList = {
    add: (...names: string[]): void => {
      this.className = [this.className, ...names].filter(Boolean).join(" ");
    }
  };
  parentNode: FakeElement | null = null;
  tagName: string;
  className = "";
  id = "";
  value = "";
  textContent = "";
  placeholder = "";
  type = "";
  hidden = false;
  selected = false;
  innerHTML = "";

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parentNode = this;
      this.children.push(node);
    }
  }

  appendChild<T extends FakeElement>(child: T): T {
    this.append(child);
    return child;
  }

  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  fire(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function flatten(node: FakeElement): FakeElement[] {
  return [node, ...node.children.flatMap(flatten)];
}

type Rendered = {
  root: FakeElement;
  config: Config;
  patches: Array<Partial<Config>>;
  statuses: string[];
  rerenders(): number;
  textInputAriaLabels(): string[];
};

function renderPromptSectionFor(overrides: Partial<Config> = {}): Rendered {
  const config: Config = { ...DEFAULT_CONFIG, ...overrides };
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: (tag: string) => new FakeElement(tag) }
  });
  try {
    const root = new FakeElement("div");
    const patches: Array<Partial<Config>> = [];
    const statuses: string[] = [];
    let rerenderCount = 0;
    const textInputs: Array<{ ariaLabel?: string }> = [];
    const components = {
      mountSwitch: () => ({ destroy() {} }),
      mountSelect: () => ({ destroy() {} }),
      mountNumericInput: () => ({ destroy() {} }),
      mountTextInput: (_target: unknown, options: { ariaLabel?: string }) => {
        textInputs.push(options);
        return { destroy() {} };
      },
      mountTextArea: () => ({ destroy() {} })
    };
    const ctx = { components } as unknown as SpindleFrontendContext;
    const patchConfig = (patch: Partial<Config>): void => {
      Object.assign(config, patch);
      patches.push(patch);
    };
    const ui = new UiBuilder(ctx, root as unknown as HTMLElement, config, patchConfig, new Map(), () => {});
    renderPromptSection({
      ui,
      config,
      parserConnections: [],
      characterAppearance: {},
      quoteStyle: "",
      quoteExample: "",
      actions: {
        activeChatId: () => "",
        patchConfig,
        patchQuoteSettings: () => {},
        requestState: () => {},
        sendToBackend: () => {},
        updateStatus: (status) => statuses.push(status)
      },
      rerender: () => {
        rerenderCount += 1;
      }
    });
    return {
      root,
      config,
      patches,
      statuses,
      rerenders: () => rerenderCount,
      textInputAriaLabels: () => textInputs.map((input) => input.ariaLabel ?? "")
    };
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  }
}

const savedPreset: PromptPreset = {
  id: "saved-1",
  name: "Cinematic",
  positivePrefix: "masterpiece",
  negativePrefix: "lowres"
};

function actionButtons(root: FakeElement): FakeElement[] {
  const actions = flatten(root).find((node) => node.className === "inlay-actions");
  if (!actions) return [];
  return actions.children.filter((node) => node.tagName === "BUTTON");
}

function findByAriaLabel(root: FakeElement, label: string): FakeElement | undefined {
  return flatten(root).find((node) => node.attributes.get("aria-label") === label);
}

function clickButton(root: FakeElement, label: string): void {
  const button = actionButtons(root).find((node) => node.textContent === label);
  if (!button) throw new Error(`missing action button: ${label}`);
  button.fire("click");
}

describe("prompt preset selection UI", () => {
  test("renders the dynamic fallback option plus structured preset CRUD actions", () => {
    const view = renderPromptSectionFor({ promptPresets: [savedPreset], activePromptPresetId: "saved-1" });
    const select = flatten(view.root).find((node) => node.className === "inlay-native-select");
    expect(select).toBeDefined();
    expect(select!.innerHTML).toContain('<option value="">Original dynamic preset (프리셋 N)</option>');
    const savedOptions = select!.children.filter((node) => node.tagName === "OPTION");
    expect(savedOptions.map((node) => node.textContent)).toEqual(["Cinematic"]);
    expect(savedOptions[0].selected).toBe(true);
    expect(actionButtons(view.root).map((node) => node.textContent)).toEqual([
      "Save new",
      "Update selected",
      "Rename",
      "Delete"
    ]);
  });

  test("hides the dynamic presetNumber field while a saved preset is selected", () => {
    const dynamic = renderPromptSectionFor();
    expect(dynamic.textInputAriaLabels()).toContain("Dynamic preset number (lorebook comment 프리셋 N, fallback 1)");
    const structured = renderPromptSectionFor({ promptPresets: [savedPreset], activePromptPresetId: "saved-1" });
    expect(structured.textInputAriaLabels()).not.toContain("Dynamic preset number (lorebook comment 프리셋 N, fallback 1)");
    expect(structured.textInputAriaLabels()).toContain("Image reroll count (1..8, used for multi-candidate reroll)");
  });

  test("selecting the dynamic option clears the saved preset selection", () => {
    const view = renderPromptSectionFor({ promptPresets: [savedPreset], activePromptPresetId: "saved-1" });
    const select = flatten(view.root).find((node) => node.className === "inlay-native-select")!;
    select.value = "";
    select.fire("change");
    expect(view.patches.at(-1)).toEqual({ activePromptPresetId: null });
    select.value = "saved-1";
    select.fire("change");
    expect(view.patches.at(-1)).toEqual({ activePromptPresetId: "saved-1" });
    expect(view.rerenders()).toBe(2);
  });

  test("Save new validates the name, rejects duplicates, and selects the new preset", () => {
    const view = renderPromptSectionFor({ promptPresets: [savedPreset], activePromptPresetId: null });
    const name = findByAriaLabel(view.root, "Preset name")!;
    const positive = findByAriaLabel(view.root, "Preset positive prefix")!;

    name.value = "Cinematic";
    clickButton(view.root, "Save new");
    expect(view.statuses.at(-1)).toBe('A preset named "Cinematic" already exists.');
    expect(view.patches).toHaveLength(0);

    name.value = "";
    clickButton(view.root, "Save new");
    expect(view.statuses.at(-1)).toBe("A preset name is required.");

    name.value = "Night shots";
    positive.value = " best quality ";
    clickButton(view.root, "Save new");
    const patch = view.patches.at(-1)!;
    expect(patch.promptPresets).toHaveLength(2);
    const created = patch.promptPresets![1];
    expect(created.name).toBe("Night shots");
    expect(created.positivePrefix).toBe("best quality");
    expect(patch.activePromptPresetId).toBe(created.id);
    expect(view.statuses.at(-1)).toBe('Saved preset "Night shots".');
    expect(view.rerenders()).toBe(1);
  });

  test("update/rename/delete guards require a selected preset", () => {
    const view = renderPromptSectionFor();
    clickButton(view.root, "Update selected");
    expect(view.statuses.at(-1)).toBe("Select a preset to update.");
    clickButton(view.root, "Rename");
    expect(view.statuses.at(-1)).toBe("Select a preset to rename.");
    clickButton(view.root, "Delete");
    expect(view.statuses.at(-1)).toBe("Select a preset to delete.");
    expect(view.patches).toHaveLength(0);
  });

  test("Update selected and Delete operate on the selected preset", () => {
    const updatedView = renderPromptSectionFor({ promptPresets: [savedPreset], activePromptPresetId: "saved-1" });
    const name = findByAriaLabel(updatedView.root, "Preset name")!;
    const positive = findByAriaLabel(updatedView.root, "Preset positive prefix")!;

    name.value = "Cinematic v2";
    positive.value = "masterpiece, best quality";
    clickButton(updatedView.root, "Update selected");
    expect(updatedView.config.promptPresets[0]).toMatchObject({ id: "saved-1", name: "Cinematic v2", positivePrefix: "masterpiece, best quality" });
    expect(updatedView.statuses.at(-1)).toBe('Updated preset "Cinematic v2".');

    // the app rerenders after the update; the delete acts on the fresh selection
    const deletedView = renderPromptSectionFor({
      promptPresets: [{ id: "saved-1", name: "Cinematic v2", positivePrefix: "masterpiece, best quality", negativePrefix: "lowres" }],
      activePromptPresetId: "saved-1"
    });
    clickButton(deletedView.root, "Delete");
    expect(deletedView.config.promptPresets).toHaveLength(0);
    expect(deletedView.config.activePromptPresetId).toBeNull();
    expect(deletedView.statuses.at(-1)).toBe('Deleted preset "Cinematic v2".');
  });
});
