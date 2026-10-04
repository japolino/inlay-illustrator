/** Typed backend errors mapped onto the contract `RpcError`. */
import { rpcError, type RpcError, type RpcErrorCode } from "../../shared/contract/index.js";

export class RpcFailure extends Error {
  readonly error: RpcError;
  constructor(error: RpcError, options?: { cause?: unknown }) {
    super(error.message, options);
    this.name = "RpcFailure";
    this.error = error;
  }
}

export function fail(code: RpcErrorCode, message: string, extra: Omit<RpcError, "code" | "message"> = {}): never {
  throw new RpcFailure(rpcError(code, message, extra));
}

export function isAbortLike(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && (error.name === "AbortError" || (error as { code?: unknown }).code === "ABORT_ERR"))
  );
}

/** Any thrown value -> RpcError (RpcFailure kept; aborts -> cancelled; `code`-carrying AM errors -> detailCode). */
export function toRpcError(error: unknown): RpcError {
  if (error instanceof RpcFailure) return error.error;
  if (isAbortLike(error)) return rpcError("cancelled", "The operation was cancelled.");
  const message = error instanceof Error ? error.message : String(error ?? "Unknown error");
  const detailCode = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string" ? String((error as { code: string }).code) : undefined;
  return rpcError("internal", message || "Unknown error", detailCode ? { detailCode } : {});
}
