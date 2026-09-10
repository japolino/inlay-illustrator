import { INLAY_IMAGE_ASPECT_PRESETS, type Config } from "../shared/config.js";
import type { ParserConnection } from "./contracts.js";

export type StatusTone = "neutral" | "active" | "success" | "warning" | "error";

export function statusTone(status: string): StatusTone {
  const normalized = status.toLowerCase();
  if (/error|failed|invalid|must be|required|unavailable/.test(normalized)) return "error";
  if (/cancelled|canceled|paused|disabled/.test(normalized)) return "warning";
  if (/complete|ready|saved|updated|generated/.test(normalized)) return "success";
  if (/loading|parsing|preparing|generating|saving|deleting|queued|requesting|refreshing/.test(normalized)) return "active";
  return "neutral";
}

export function isBusyStatus(status: string): boolean {
  return /queued|loading chat context|parsing illustration prompts|preparing image jobs|generating|saving illustrations|requesting cancellation/i.test(status);
}

export function generationSummary(config: Config): string {
  const modeLabel = config.moduleMode === "comic"
    ? `Comic (${config.comicMinPanels}+ panels)`
    : config.moduleMode === "asset"
      ? "Asset"
      : "Illustration";
  const count = config.minImages === config.maxImages
    ? `${config.maxImages} image${config.maxImages === 1 ? "" : "s"}`
    : `${config.minImages}–${config.maxImages} images`;
  return `${modeLabel} · ${count}`;
}

export function parserSummary(config: Config, connections: ParserConnection[]): string {
  const selected = connections.find((connection) => connection.id === config.parserConnectionId);
  const base = selected?.name || (config.parserConnectionId ? "Missing connection" : "Not configured");
  if (config.encodingMode && config.encodingMode !== "plain") {
    const enc = config.encodingMode.charAt(0).toUpperCase() + config.encodingMode.slice(1);
    return `${base} · [${enc}]`;
  }
  return base;
}

export function promptSummary(config: Config): string {
  const syntax = config.promptSyntax === "nai" ? "NovelAI" : "ComfyUI";
  const sep = config.promptSeparator === "native"
    ? "Native"
    : config.promptSeparator === "newline"
      ? "Newline"
      : "Pipe";
  return `${syntax} · ${sep}`;
}

export function outputSummary(config: Config): string {
  const aspect = INLAY_IMAGE_ASPECT_PRESETS.find((preset) => preset.value === config.inlayImageAspect)?.label || "Wide 16:9";
  return `${aspect} · ${config.inlayImageMaxHeightVh}vh`;
}
