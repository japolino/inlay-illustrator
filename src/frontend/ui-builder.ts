import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { Config } from "../shared/config.js";
import type { MountedComponent } from "./contracts.js";

type Action = {
  label: string;
  primary?: boolean;
  onClick(): void;
};

type SelectOption = {
  value: string;
  label: string;
};

export class UiBuilder {
  constructor(
    private readonly ctx: SpindleFrontendContext,
    private readonly sections: HTMLElement,
    private readonly config: Config,
    private readonly patchConfig: (patch: Partial<Config>) => void,
    private readonly expandedSections: Map<string, boolean>,
    private readonly track: (component: MountedComponent) => void
  ) {}

  section(title: string, defaultExpanded: boolean): HTMLElement {
    const host = document.createElement("div");
    host.className = "inlay-section-host";
    this.sections.append(host);
    const component = this.ctx.components.mountCollapsibleSection(host, {
      title,
      defaultExpanded: this.expandedSections.get(title) ?? defaultExpanded,
      onToggle: (expanded) => this.expandedSections.set(title, expanded)
    });
    this.track(component);
    component.body.classList.add("inlay-section-body");
    return component.body;
  }

  row(parent: HTMLElement, label: string, hint = ""): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "inlay-row";
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

  addSwitch(parent: HTMLElement, key: keyof Config, label: string, hint = ""): void {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountSwitch(target, {
      checked: Boolean(this.config[key]),
      ariaLabel: label,
      onChange: (checked) => this.patchConfig({ [key]: checked } as Partial<Config>)
    }));
  }

  addNumber(parent: HTMLElement, key: keyof Config, label: string, min: number, max: number, hint = ""): void {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountNumericInput(target, {
      value: Number(this.config[key]),
      min,
      max,
      integer: true,
      onChange: (value) => {
        if (value !== null) this.patchConfig({ [key]: value } as Partial<Config>);
      }
    }));
  }

  addSelect(parent: HTMLElement, key: keyof Config, label: string, options: SelectOption[], hint = ""): void {
    const target = this.row(parent, label, hint);
    this.track(this.ctx.components.mountSelect(target, {
      value: String(this.config[key] || ""),
      options,
      className: "inlay-select-control",
      triggerClassName: "inlay-select-trigger",
      portal: true,
      onChange: (value) => this.patchConfig({ [key]: value } as Partial<Config>)
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
      if (action.primary) button.classList.add("inlay-primary");
      button.addEventListener("click", action.onClick);
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

  addSummary(parent: HTMLElement, text: string): void {
    const summary = document.createElement("div");
    summary.className = "inlay-parser-summary";
    summary.textContent = text;
    parent.append(summary);
  }
}
