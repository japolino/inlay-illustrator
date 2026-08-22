import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { Config } from "../shared/config.js";
import type { MountedComponent } from "./contracts.js";

type Action = {
  label: string;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  onClick(): void | Promise<void>;
};

type SectionOptions = {
  description?: string;
  badge?: string;
};

type SelectOption = {
  value: string;
  label: string;
};

type RangeChoice = SelectOption;

export class UiBuilder {
  private sectionSequence = 0;

  constructor(
    private readonly ctx: SpindleFrontendContext,
    private readonly sections: HTMLElement,
    private readonly config: Config,
    private readonly patchConfig: (patch: Partial<Config>) => void,
    private readonly expandedSections: Map<string, boolean>,
    private readonly track: (component: MountedComponent) => void
  ) {}

  section(title: string, defaultExpanded: boolean, options: SectionOptions = {}): HTMLElement {
    const host = document.createElement("section");
    host.className = "inlay-section-host";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "inlay-section-toggle";

    const heading = document.createElement("span");
    heading.className = "inlay-section-heading";
    const label = document.createElement("span");
    label.className = "inlay-section-title";
    label.textContent = title;
    heading.append(label);
    if (options.description) {
      const description = document.createElement("span");
      description.className = "inlay-section-description";
      description.textContent = options.description;
      heading.append(description);
    }
    const trailing = document.createElement("span");
    trailing.className = "inlay-section-trailing";
    if (options.badge) {
      const badge = document.createElement("span");
      badge.className = "inlay-section-badge";
      badge.textContent = options.badge;
      trailing.append(badge);
    }
    const chevron = document.createElement("span");
    chevron.className = "inlay-section-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";
    trailing.append(chevron);
    toggle.append(heading, trailing);

    const body = document.createElement("div");
    body.className = "inlay-section-body";
    body.id = `inlay-section-body-${++this.sectionSequence}`;
    toggle.setAttribute("aria-controls", body.id);

    let expanded = this.expandedSections.get(title) ?? defaultExpanded;
    const applyState = (): void => {
      body.hidden = !expanded;
      toggle.setAttribute("aria-expanded", String(expanded));
      host.setAttribute("data-expanded", String(expanded));
    };
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      this.expandedSections.set(title, expanded);
      applyState();
    });
    applyState();

    host.append(toggle, body);
    this.sections.append(host);
    return body;
  }

  row(parent: HTMLElement, label: string, hint = "", fullWidth = false): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "inlay-row";
    if (fullWidth) wrapper.classList.add("inlay-row-full");
    const labelNode = document.createElement("label");
    labelNode.textContent = label;
    const target = document.createElement("div");
    target.className = "inlay-control";
    wrapper.append(labelNode, target);
    if (hint) {
      const hintNode = document.createElement("div");
      hintNode.className = "inlay-hint";
      hintNode.textContent = hint;
      wrapper.append(hintNode);
    }
    parent.append(wrapper);
    return target;
  }

  addSwitch(parent: HTMLElement, key: keyof Config, label: string, hint = "", afterChange?: () => void): void {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountSwitch(target, {
      checked: Boolean(this.config[key]),
      ariaLabel: label,
      onChange: (checked) => {
        this.patchConfig({ [key]: checked } as Partial<Config>);
        afterChange?.();
      }
    }));
  }

  addRangeChoice(
    parent: HTMLElement,
    key: keyof Config,
    label: string,
    choices: RangeChoice[],
    disabled = false,
    hint = "",
    afterChange?: () => void
  ): void {
    const target = this.row(parent, label, hint);
    const wrapper = document.createElement("div");
    wrapper.className = "inlay-range-choice";
    const input = document.createElement("input");
    input.type = "range";
    input.min = "0";
    input.max = String(Math.max(0, choices.length - 1));
    input.step = "1";
    input.disabled = disabled;
    input.setAttribute("aria-label", label);
    const selectedIndex = Math.max(0, choices.findIndex((choice) => choice.value === String(this.config[key])));
    input.value = String(selectedIndex);

    const labels = document.createElement("div");
    labels.className = "inlay-range-labels";
    labels.style.gridTemplateColumns = `repeat(${Math.max(1, choices.length)}, minmax(0, 1fr))`;
    const labelNodes = choices.map((choice) => {
      const node = document.createElement("span");
      node.textContent = choice.label;
      labels.append(node);
      return node;
    });
    const update = (): void => {
      const index = Number(input.value);
      labelNodes.forEach((node, candidate) => node.classList.toggle("is-active", candidate === index));
      input.setAttribute("aria-valuetext", choices[index]?.label || String(index));
    };
    input.addEventListener("input", update);
    input.addEventListener("change", () => {
      const choice = choices[Number(input.value)];
      if (choice) {
        this.patchConfig({ [key]: choice.value } as Partial<Config>);
        afterChange?.();
      }
    });
    update();
    wrapper.append(input, labels);
    target.append(wrapper);
  }

  addNumber(parent: HTMLElement, key: keyof Config, label: string, min: number, max: number, hint = ""): void {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountNumericInput(target, {
      value: Number(this.config[key]),
      min,
      max,
      integer: true,
      ariaLabel: label,
      onChange: (value) => {
        if (value === null) return;
        const patch: Partial<Config> = { [key]: value } as Partial<Config>;
        if (key === "minImages" && value > this.config.maxImages) patch.maxImages = value;
        else if (key === "maxImages" && value < this.config.minImages) patch.minImages = value;
        else if (key === "includeMinMessages" && value > this.config.includeMaxMessages) patch.includeMaxMessages = value;
        else if (key === "includeMaxMessages" && value < this.config.includeMinMessages) patch.includeMinMessages = value;
        Object.assign(this.config, patch);
        this.patchConfig(patch);
      }
    }));
  }

  addSelect(
    parent: HTMLElement,
    key: keyof Config,
    label: string,
    options: SelectOption[],
    hint = "",
    afterChange?: () => void
  ): void {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountSelect(target, {
      value: String(this.config[key] || ""),
      options,
      placeholder: `Select ${label.toLowerCase()}`,
      emptyMessage: "No options available",
      ariaLabel: label,
      className: "inlay-select-control",
      triggerClassName: "inlay-select-trigger",
      portal: true,
      onChange: (value) => {
        this.patchConfig({ [key]: value } as Partial<Config>);
        afterChange?.();
      }
    }));
  }

  addText(parent: HTMLElement, key: keyof Config, label: string, hint = ""): void {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountTextInput(target, {
      value: String(this.config[key] || ""),
      ariaLabel: label,
      onChange: (value) => this.patchConfig({ [key]: value } as Partial<Config>)
    }));
  }

  addTextarea(parent: HTMLElement, key: keyof Config, label: string, hint = ""): void {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountTextArea(target, {
      value: String(this.config[key] || ""),
      ariaLabel: label,
      onChange: (value) => this.patchConfig({ [key]: value } as Partial<Config>)
    }));
  }

  addActions(parent: HTMLElement, actions: Action[]): void {
    const container = document.createElement("div");
    container.className = "inlay-actions";
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = action.label;
      button.disabled = action.disabled === true;
      if (action.title) button.title = action.title;
      if (action.primary) button.classList.add("inlay-primary");
      if (action.danger) button.classList.add("inlay-danger");
      button.addEventListener("click", () => { void action.onClick(); });
      container.append(button);
    }
    parent.append(container);
  }

  addSubtitle(parent: HTMLElement, text: string): void {
    const subtitle = document.createElement("div");
    subtitle.className = "inlay-subtitle";
    subtitle.textContent = text;
    parent.append(subtitle);
  }

  async confirmDestructive(title: string, message: string, confirmLabel = "Delete"): Promise<boolean> {
    if (typeof this.ctx.ui.showConfirm !== "function") return window.confirm(message);
    const result = await this.ctx.ui.showConfirm({
      title,
      message,
      variant: "danger",
      confirmLabel,
      cancelLabel: "Cancel"
    });
    return result.confirmed;
  }

  addNotice(parent: HTMLElement, text: string, tone: "info" | "warning" | "error" = "info"): void {
    const notice = document.createElement("div");
    notice.className = "inlay-notice";
    notice.dataset.tone = tone;
    notice.textContent = text;
    parent.append(notice);
  }

  addSummary(parent: HTMLElement, text: string): void {
    const summary = document.createElement("div");
    summary.className = "inlay-parser-summary";
    summary.textContent = text;
    parent.append(summary);
  }
}
