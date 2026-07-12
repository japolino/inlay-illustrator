import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { FrontendActions, FrontendSnapshot, MountedComponent } from "./contracts.js";
import { renderSettingsSections } from "./sections/index.js";
import { UiBuilder } from "./ui-builder.js";

export class SettingsRenderer {
  private mountedComponents: MountedComponent[] = [];

  constructor(
    private readonly ctx: SpindleFrontendContext,
    private readonly root: HTMLElement,
    private readonly getSnapshot: () => FrontendSnapshot,
    private readonly actions: FrontendActions
  ) {}

  render(): void {
    this.destroyMountedComponents();
    this.root.innerHTML = '<div class="inlay-panel"><div class="inlay-sections"></div><div class="inlay-status"></div></div>';
    const sections = this.root.querySelector<HTMLElement>(".inlay-sections")!;
    const statusNode = this.root.querySelector<HTMLElement>(".inlay-status")!;
    const snapshot = this.getSnapshot();
    statusNode.textContent = snapshot.status;

    const ui = new UiBuilder(
      this.ctx,
      sections,
      snapshot.config,
      this.actions.patchConfig,
      (component) => this.mountedComponents.push(component)
    );
    renderSettingsSections({
      ui,
      config: snapshot.config,
      parserConnections: snapshot.parserConnections,
      characterAppearance: snapshot.characterAppearance,
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
