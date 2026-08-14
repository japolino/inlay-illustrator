import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { FrontendActions, FrontendSnapshot, MountedComponent } from "./contracts.js";
import { renderSettingsSections } from "./sections/index.js";
import { UiBuilder } from "./ui-builder.js";
import { generationSummary, isBusyStatus, statusTone } from "./view-model.js";

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
    this.root.innerHTML = `
      <div class="inlay-panel">
        <header class="inlay-overview">
          <div class="inlay-overview-heading">
            <div>
              <div class="inlay-eyebrow">Illustration sidecar</div>
              <h2>Inlay Illustrator</h2>
              <p>Turn the latest assistant response into source-faithful illustrations.</p>
            </div>
            <button type="button" class="inlay-power-button"></button>
          </div>
          <div class="inlay-overview-meta"></div>
          <div class="inlay-overview-actions">
            <button type="button" class="inlay-primary inlay-generate-action">Generate latest</button>
            <button type="button" class="inlay-cancel-action">Cancel</button>
          </div>
        </header>
        <div class="inlay-status" role="status" aria-live="polite" aria-atomic="true">
          <span class="inlay-status-dot" aria-hidden="true"></span>
          <div><span class="inlay-status-label">Status</span><span class="inlay-status-text"></span></div>
        </div>
        <div class="inlay-sections"></div>
      </div>`;

    const snapshot = this.getSnapshot();
    const sections = this.root.querySelector<HTMLElement>(".inlay-sections")!;
    const power = this.root.querySelector<HTMLButtonElement>(".inlay-power-button")!;
    const generate = this.root.querySelector<HTMLButtonElement>(".inlay-generate-action")!;
    const cancel = this.root.querySelector<HTMLButtonElement>(".inlay-cancel-action")!;
    const meta = this.root.querySelector<HTMLElement>(".inlay-overview-meta")!;

    power.textContent = snapshot.config.enabled ? "On" : "Paused";
    power.setAttribute("aria-pressed", String(snapshot.config.enabled));
    power.setAttribute("aria-label", snapshot.config.enabled ? "Pause Inlay Illustrator" : "Enable Inlay Illustrator");
    power.dataset.enabled = String(snapshot.config.enabled);
    power.addEventListener("click", () => {
      this.actions.patchConfig({ enabled: !snapshot.config.enabled });
      this.render();
    });

    for (const label of [
      generationSummary(snapshot.config),
      snapshot.config.autoGenerate ? "Auto generation" : "Manual generation",
      snapshot.config.fastMode ? "Fast mode" : "Full context"
    ]) {
      const chip = document.createElement("span");
      chip.textContent = label;
      meta.append(chip);
    }

    const chatId = this.actions.activeChatId();
    generate.disabled = !chatId || isBusyStatus(snapshot.status);
    generate.title = chatId ? "Generate illustrations for the latest assistant response" : "Open a chat to generate illustrations";
    generate.addEventListener("click", () => {
      this.actions.updateStatus("Generating…");
      this.actions.sendToBackend({ type: "generate_latest", chatId: this.actions.activeChatId() });
    });
    cancel.disabled = !isBusyStatus(snapshot.status);
    cancel.addEventListener("click", () => {
      this.actions.updateStatus("Requesting cancellation…");
      this.actions.sendToBackend({ type: "cancel_generation", chatId: this.actions.activeChatId() });
    });

    this.updateStatus(snapshot.status);
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
      actions: this.actions,
      rerender: () => this.render()
    });
  }

  updateStatus(status: string): void {
    const host = this.root.querySelector<HTMLElement>(".inlay-status");
    const text = this.root.querySelector<HTMLElement>(".inlay-status-text");
    if (!host || !text) return;
    host.dataset.tone = statusTone(status);
    text.textContent = status || "Ready";
    const busy = isBusyStatus(status);
    const cancel = this.root.querySelector<HTMLButtonElement>(".inlay-cancel-action");
    const generate = this.root.querySelector<HTMLButtonElement>(".inlay-generate-action");
    if (cancel) cancel.disabled = !busy || /requesting cancellation/i.test(status);
    if (generate) generate.disabled = busy || !this.actions.activeChatId();
  }

  destroy(): void {
    this.destroyMountedComponents();
  }

  private destroyMountedComponents(): void {
    for (const component of this.mountedComponents) component.destroy();
    this.mountedComponents = [];
  }
}
