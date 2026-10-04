/** Host-facing types still shared by kept 0.9.x infrastructure (rendering.ts). New code uses src/backend/services/types.ts. */

export type GenerationSlotStatus = "planned" | "pending" | "generating" | "completed" | "failed" | "cancelled";
