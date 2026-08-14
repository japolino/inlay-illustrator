import type { Config } from "../shared/config.js";
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
  const mode = config.adaptiveMode
    ? "Adaptive"
    : `${config.perspectiveMode.slice(0, 1).toUpperCase()}${config.perspectiveMode.slice(1)}`;
  const count = config.minImages === config.maxImages
    ? `${config.maxImages} image${config.maxImages === 1 ? "" : "s"}`
    : `${config.minImages}–${config.maxImages} images`;
  return `${mode} · ${count}`;
}

export function parserSummary(config: Config, connections: ParserConnection[]): string {
  if (config.fastMode) return "Fast mode";
  const selected = connections.find((connection) => connection.id === config.parserConnectionId);
  return selected?.name || (config.parserConnectionId ? "Missing connection" : "Not configured");
}

export function promptSummary(config: Config): string {
  const style = config.promptStyle === "anima" ? "Anima" : "Default";
  const syntax = config.promptSyntax === "nai" ? "NovelAI" : "ComfyUI";
  return `${style} · ${syntax}`;
}

export function outputSummary(config: Config): string {
  const asset = !config.adaptiveMode && config.perspectiveMode === "asset";
  return `${asset ? config.assetImageWidth : config.inlayImageWidth}px · ${config.inlayImageMaxHeightVh}vh`;
}
