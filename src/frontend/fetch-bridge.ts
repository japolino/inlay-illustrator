/**
 * Frontend side of the backend fetch bridge (src/shared/contract/bridge.ts): fetches same-origin `/api/...`
 * URLs with the user's session and answers exactly once per request.
 */
import {
  FETCH_BRIDGE_MAX_BASE64,
  FETCH_BRIDGE_RESPONSE,
  isAllowedBridgeUrl,
  type FetchBridgeRequest,
  type FetchBridgeResponse
} from "../shared/contract/bridge.js";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"]);

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** Runs one bridge request. Never throws: errors become `{error}` responses. */
export async function answerFetchBridge(request: FetchBridgeRequest, fetcher: typeof fetch = fetch): Promise<FetchBridgeResponse> {
  const base = { type: FETCH_BRIDGE_RESPONSE, requestId: request.requestId } as const;
  if (!isAllowedBridgeUrl(request.url)) return { ...base, error: "URL not allowed (only same-origin /api/ paths)." };
  try {
    const response = await fetcher(request.url, {
      credentials: "same-origin",
      headers: { Accept: request.as === "json" ? "application/json" : "image/*" }
    });
    if (!response.ok) return { ...base, error: `HTTP ${response.status}`, status: response.status };
    if (request.as === "json") return { ...base, json: await response.json(), status: response.status };
    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!IMAGE_TYPES.has(mimeType)) return { ...base, error: `Not an image (${mimeType || "unknown type"}).`, status: response.status };
    const data = toBase64(new Uint8Array(await response.arrayBuffer()));
    if (data.length > FETCH_BRIDGE_MAX_BASE64) return { ...base, error: "Image is too large.", status: response.status };
    return { ...base, data, mimeType, status: response.status };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : String(error) };
  }
}
