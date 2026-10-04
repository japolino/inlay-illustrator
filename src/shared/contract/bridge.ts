/**
 * Backend -> frontend fetch bridge.
 *
 * The backend cannot read bytes of stored Lumiverse images (spindle.images returns URLs only) or call REST endpoints that
 * have no Spindle API (character gallery). It asks the frontend, which fetches same-origin with the user's session.
 * Transport: plain messages on the Spindle frontend/backend channel (not RPC envelopes).
 *
 * backend -> frontend  {@link FetchBridgeRequest}
 * frontend -> backend  {@link FetchBridgeResponse}   (exactly one per requestId; the backend times out after ~15 s)
 *
 * - `as: "base64"`: fetch the URL, answer `{data: base64 without data: prefix, mimeType}`; only image/* (png, jpeg, webp, gif, avif)
 *   is accepted; max {@link FETCH_BRIDGE_MAX_BASE64} chars.
 * - `as: "json"`: fetch the URL (GET, credentials same-origin, Accept: application/json), answer `{json}`.
 * - Errors: `{error: "<English message>", status?}`.
 * Only same-origin relative URLs starting with `/api/` are allowed (the frontend must refuse anything else).
 */
export const FETCH_BRIDGE_REQUEST = "inlay-illustrator:fetch-request";
export const FETCH_BRIDGE_RESPONSE = "inlay-illustrator:fetch-response";
export const FETCH_BRIDGE_MAX_BASE64 = 28_000_000;

export interface FetchBridgeRequest {
  type: typeof FETCH_BRIDGE_REQUEST;
  requestId: string;
  url: string;
  as: "base64" | "json";
}
export interface FetchBridgeResponse {
  type: typeof FETCH_BRIDGE_RESPONSE;
  requestId: string;
  data?: string;
  mimeType?: string;
  json?: unknown;
  error?: string;
  status?: number;
}

export function isFetchBridgeRequest(value: unknown): value is FetchBridgeRequest {
  const v = value as Record<string, unknown> | null;
  return !!v && typeof v === "object" && v.type === FETCH_BRIDGE_REQUEST && typeof v.requestId === "string" && typeof v.url === "string" && (v.as === "base64" || v.as === "json");
}
export function isFetchBridgeResponse(value: unknown): value is FetchBridgeResponse {
  const v = value as Record<string, unknown> | null;
  return !!v && typeof v === "object" && v.type === FETCH_BRIDGE_RESPONSE && typeof v.requestId === "string";
}
/** Allowed bridge URL: same-origin API path, no scheme / protocol-relative / traversal. */
export function isAllowedBridgeUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("/api/") && !url.startsWith("//") && !/\.\.(?:\/|$)/u.test(url) && !/[\s\\]/u.test(url);
}
