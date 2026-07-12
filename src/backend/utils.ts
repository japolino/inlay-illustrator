type CorsTextResponse = {
  status?: number;
  statusText?: string;
  body?: unknown;
};

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function keysOf(value: unknown): string[] {
  return Object.keys(asRecord(value));
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

export function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function cleanArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function compactBlock(value: string, maxLength: number): string {
  const clean = value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength).trim()}\n...[truncated]` : clean;
}

export function csvParts(...values: unknown[]): string[] {
  return values.flatMap((value) => String(value || "").split(",")).map((value) => value.trim()).filter(Boolean);
}

export function unique(parts: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(part);
  }
  return output;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseCorsJson<T>(response: unknown, label: string): T {
  const wrapper = asRecord(response);
  if ("body" in wrapper || "status" in wrapper || "statusText" in wrapper) {
    const { status, statusText, body } = wrapper as CorsTextResponse;
    if (typeof status === "number" && (status < 200 || status >= 300)) {
      throw new Error(`${label} returned HTTP ${status}${statusText ? ` ${statusText}` : ""}`);
    }
    if (typeof body === "string") {
      try {
        return JSON.parse(body) as T;
      } catch {
        throw new Error(`${label} returned invalid JSON`);
      }
    }
    if (body && typeof body === "object") return body as T;
    throw new Error(`${label} returned an empty response body`);
  }
  return response as T;
}
