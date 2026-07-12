import type { Config } from "../shared/config.js";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

export type LogLevel = "info" | "warn" | "error";

export function logStage(
  config: Pick<Config, "debugLogging"> | null,
  stage: string,
  details?: Record<string, unknown>,
  level: LogLevel = "info"
): void {
  if (!config?.debugLogging && level !== "error") return;
  const suffix = details ? ` ${JSON.stringify(details, (_key, value) => {
    if (typeof value === "string" && value.length > 300) return `${value.slice(0, 300)}...(${value.length} chars)`;
    return value;
  })}` : "";
  const message = `[Inlay:${stage}]${suffix}`;
  if (level === "warn") spindle.log.warn(message);
  else if (level === "error") spindle.log.error(message);
  else spindle.log.info(message);
}
