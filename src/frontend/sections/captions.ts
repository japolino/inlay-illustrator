import { DEFAULT_QUOTE_EXAMPLE, splitOriginalQuoteCss } from "../caption-settings.js";
import type { SectionContext } from "./section-context.js";

const BASE_PREVIEW_STYLE = "color:#fff;font-size:24px;font-style:italic;font-weight:bold;text-align:center;text-shadow:0 4px 15px rgba(0,0,0,0.9),0 1px 3px rgba(0,0,0,0.8);background:rgba(20,20,25,0.65);padding:15px 30px;border-radius:16px;border:1px solid rgba(255,255,255,0.15);backdrop-filter:blur(8px);max-width:85%;margin:0 auto;white-space:pre-wrap;overflow-wrap:anywhere";

export function renderCaptionsSection({ ui, quoteStyle, quoteExample, actions }: SectionContext): void {
  const section = ui.section("Caption style", false);

  const summary = document.createElement("div");
  summary.className = "inlay-parser-summary";
  summary.textContent = "Per-chat caption CSS and preview text from the original Card.Quote.Style workflow.";
  section.append(summary);

  const styleRow = document.createElement("div");
  styleRow.className = "inlay-row inlay-row-stacked";
  const styleLabel = document.createElement("label");
  styleLabel.textContent = "Caption CSS";
  const styleInput = document.createElement("textarea");
  styleInput.value = quoteStyle;
  styleInput.placeholder = "font-family: serif; font-size: 28px;";
  styleInput.setAttribute("aria-label", "Caption CSS");
  styleInput.addEventListener("change", () => {
    actions.patchQuoteSettings({ quoteStyle: styleInput.value });
    actions.updateStatus("Caption CSS updated for this chat.");
  });
  styleRow.append(styleLabel, styleInput);
  section.append(styleRow);

  const exampleRow = document.createElement("div");
  exampleRow.className = "inlay-row";
  const exampleLabel = document.createElement("label");
  exampleLabel.textContent = "Preview text";
  const exampleInput = document.createElement("textarea");
  exampleInput.value = quoteExample || DEFAULT_QUOTE_EXAMPLE;
  exampleInput.setAttribute("aria-label", "Caption preview text");
  exampleInput.addEventListener("change", () => {
    actions.patchQuoteSettings({ quoteExample: exampleInput.value });
    actions.updateStatus("Caption preview updated for this chat.");
  });
  exampleRow.append(exampleLabel, exampleInput);
  section.append(exampleRow);

  const parsed = splitOriginalQuoteCss(quoteStyle);
  if (parsed.globalCss.trim()) {
    const globalStyle = document.createElement("style");
    globalStyle.textContent = parsed.globalCss;
    section.append(globalStyle);
  }
  const preview = document.createElement("div");
  preview.className = "inlay-caption-preview";
  preview.setAttribute("aria-label", "Caption style preview");
  preview.style.cssText = `${BASE_PREVIEW_STYLE};${parsed.inlineStyle}`;
  preview.textContent = quoteExample || DEFAULT_QUOTE_EXAMPLE;
  section.append(preview);

  const actionsRow = document.createElement("div");
  actionsRow.className = "inlay-actions";
  const clearCss = document.createElement("button");
  clearCss.type = "button";
  clearCss.textContent = "Reset CSS";
  clearCss.addEventListener("click", () => {
    actions.patchQuoteSettings({ quoteStyle: "" });
    actions.updateStatus("Caption CSS reset.");
  });
  const resetExample = document.createElement("button");
  resetExample.type = "button";
  resetExample.textContent = "Reset preview";
  resetExample.addEventListener("click", () => {
    actions.patchQuoteSettings({ quoteExample: "" });
    actions.updateStatus("Caption preview reset.");
  });
  actionsRow.append(clearCss, resetExample);
  section.append(actionsRow);
}
