/**
 * RPC methods the UI needs before they exist in the contract (src/shared/contract/rpc.ts).
 * Kept OUT of `RpcMethods` on purpose: declare-merging would break the contract's compile-time
 * completeness check (`RPC_METHODS satisfies ...`). The frontend client accepts `RpcMethods & PendingRpcMethods`.
 * Every entry must also be requested from the `backend` lead; remove it when it lands; delete the file when empty.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PendingRpcMethods {}

/** Pending method names (runtime list for the dev mock). */
export const PENDING_RPC_METHODS: readonly string[] = [];
