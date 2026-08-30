import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { FrontendActions, FrontendSnapshot, MountedComponent } from "./contracts.js";
import { renderSettingsSections } from "./sections/index.js";
import { INLAY_ICON_SVG, INLAY_SETTINGS_DESCRIPTION } from "./constants.js";
import { UiBuilder } from "./ui-builder.js";

export class SettingsRenderer {
  private mountedComponents: MountedComponent[] = [];
  private readonly expandedSections = new Map<string, boolean>();

  constructor(
    private readonly ctx: SpindleFrontendContext,
    private readonly root: HTMLElement,
    private readonly getSnapshot: () => FrontendSnapshot,
    private readonly actions: FrontendActions
  ) {}

  render(): void {
    this.destroyMountedComponents();
    this.root.replaceChildren();

    const page = document.createElement("div");
    page.className = "inlay-settings-page";

    const header = document.createElement("header");
    header.className = "inlay-settings-header";
    const identity = document.createElement("div");
    identity.className = "inlay-settings-identity";
    const icon = document.createElement("span");
    icon.className = "inlay-settings-icon";
    icon.innerHTML = INLAY_ICON_SVG;
    const copy = document.createElement("div");
    copy.className = "inlay-settings-heading";
    const title = document.createElement("h2");
    title.textContent = "Inlay Illustrator";
    const description = document.createElement("p");
    description.textContent = INLAY_SETTINGS_DESCRIPTION;
    copy.append(title, description);
    identity.append(icon, copy);

    const statusNode = document.createElement("div");
    statusNode.className = "inlay-status";
    statusNode.setAttribute("role", "status");
    statusNode.setAttribute("aria-live", "polite");
    statusNode.setAttribute("aria-atomic", "true");

    const sections = document.createElement("div");
    sections.className = "inlay-sections";
    const snapshot = this.getSnapshot();
    statusNode.textContent = snapshot.status;
    header.append(identity, statusNode);
    page.append(header, sections);
    this.root.append(page);

    const ui = new UiBuilder(
      this.ctx,
      sections,
      snapshot.config,
      this.actions.patchConfig,
      this.expandedSections,
      (component) => this.mountedComponents.push(component)
    );
    renderSettingsSections({
      ui,
      config: snapshot.config,
      parserConnections: snapshot.parserConnections,
      characterAppearance: snapshot.characterAppearance,
      quoteStyle: snapshot.quoteStyle,
      quoteExample: snapshot.quoteExample,
      actions: this.actions,
      rerender: () => this.render()
    });
  }

  destroy(): void {
    this.destroyMountedComponents();
  }

  private destroyMountedComponents(): void {
    for (const component of this.mountedComponents) component.destroy();
    this.mountedComponents = [];
  }
}
