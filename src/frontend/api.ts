import type { ImageGenerationSettings, ParserConnection } from "./contracts.js";

const JSON_HEADERS = { "Accept": "application/json" };

export async function fetchImageGenerationSettings(): Promise<ImageGenerationSettings | null> {
  try {
    const response = await fetch("/api/v1/settings/imageGeneration", { headers: JSON_HEADERS });
    if (!response.ok) return null;
    const row = await response.json() as { value?: ImageGenerationSettings };
    return row.value || {};
  } catch {
    return null;
  }
}

export async function fetchParserConnections(): Promise<ParserConnection[]> {
  try {
    const response = await fetch("/api/v1/connections?limit=100&offset=0", { headers: JSON_HEADERS });
    if (!response.ok) return [];
    const result = await response.json() as { data?: ParserConnection[] } | ParserConnection[];
    const rows = Array.isArray(result) ? result : result.data || [];
    return rows.map((connection) => ({
      id: String(connection.id || ""),
      name: String(connection.name || ""),
      provider: String(connection.provider || ""),
      model: String(connection.model || "")
    })).filter((connection) => connection.id);
  } catch {
    return [];
  }
}
