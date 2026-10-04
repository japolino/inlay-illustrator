/** Preview scenes of the settings area (`#settings=<section>&scene=<name>`). */
import type { PreviewScene } from "../scenes.js";
import { clickWhenReady, waitFor } from "../scenes.js";
import { appendMockLog } from "../mock/settings.js";

function typeInto(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const SETTINGS_SCENES: Record<string, PreviewScene> = {
  /** Model page with an unsaved draft (amber dot + enabled save button). Use with settings=model. */
  "settings-dirty": async ({ doc }) => {
    const input = await waitFor<HTMLInputElement>(doc, '[data-settings-page="model"] input[type="number"]');
    typeInto(input, "0.7");
  },
  /** Current character settings with per-character overrides ("Custom" markers). Use with settings=charx. */
  "charx-override": async ({ doc }) => {
    await clickWhenReady(doc, '[data-charx-field="nsfwAlwaysEnabled"] [role="switch"]');
    await sleep(400);
    await clickWhenReady(doc, '[data-charx-field="fixedResolution"] [role="switch"]');
    await sleep(400);
    await clickWhenReady(doc, '[data-charx-field="nativeAssetVisibility"] button[aria-pressed="false"]');
    await sleep(300);
    typeInto(await waitFor<HTMLTextAreaElement>(doc, "[data-charx-prompt]"), "masterpiece, best quality, school uniform");
  },
  /** Reset-character confirm dialog. Use with settings=charx. */
  "charx-reset-confirm": async ({ doc }) => {
    await clickWhenReady(doc, "[data-charx-reset]");
  },
  /** Comic scene preset selected (preset options visible). Use with settings=analysis-profile (add dev=1 for minimum panels). */
  "analysis-comic": async ({ doc }) => {
    await clickWhenReady(doc, '[data-v5-preset="scene-comic"]');
  },
  /** New scene preset draft. Use with settings=analysis-profile. */
  "analysis-new-preset": async ({ doc }) => {
    await clickWhenReady(doc, '[data-v5-direction="imageRatio"] [data-v5-preset-action="add"] button');
  },
  /** Model page message test answered. Use with settings=model. */
  "model-test": async ({ doc }) => {
    await clickWhenReady(doc, '[data-model-message-test] button[aria-label="Send message"]');
  },
  /** ComfyUI connection selected. Use with settings=image-model. */
  "image-comfy": async ({ doc }) => {
    await clickWhenReady(doc, '[data-image-generation-provider-option="comfy-ui"]');
    await sleep(300);
    await clickWhenReady(doc, '[data-image-provider-settings-box="connection"] button[aria-label="Check connection"]');
  },
  /** Developer mode switch revealed by 5 clicks on the hidden row. Use with settings=system. */
  "system-dev-unlock": async ({ doc }) => {
    const row = await waitFor<HTMLElement>(doc, "[data-developer-mode-trigger]");
    for (let i = 0; i < 5; i += 1) {
      row.click();
      await sleep(30);
    }
  },
  /** Custom resolution draft with a validation error. Use with settings=system. */
  "system-size-error": async ({ doc }) => {
    await clickWhenReady(doc, '[data-custom-sizes] button[aria-label="Add custom resolution"]');
    await sleep(100);
    const inputs = doc.querySelectorAll<HTMLInputElement>('[data-custom-sizes] input[type="number"]');
    typeInto(inputs[0]!, "30");
    typeInto(inputs[1]!, "960");
    (doc.querySelector('[data-custom-sizes] button[aria-label="Save custom resolution"]') as HTMLElement | null)?.click();
  },
  /** Live log entries arriving. Use with settings=logs&dev=1. */
  "logs-live": async ({ doc, mock }) => {
    await waitFor(doc, "[data-run-log-list]");
    appendMockLog(mock.db, mock, { level: "info", scope: "chat-image", message: "Live entry: image 2/2 committed." });
    appendMockLog(mock.db, mock, { level: "error", scope: "ai-analysis", message: "Analyzer timeout after 180s (ANALYZER_TIMEOUT).", details: { attempt: 1, total: 5 } });
  }
};
