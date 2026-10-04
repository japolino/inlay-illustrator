/** Host-facing types shared by the kept backend infrastructure. */

export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
  swipe_id?: unknown;
};

/** An LLM connection profile as resolved from `spindle.connections`. */
export type LlmConnection = {
  id: string;
  name: string;
  provider: string;
  model: string;
  metadata?: Record<string, unknown>;
};

export type ImageConnection = {
  id: string;
  name: string;
  provider: string;
  model: string;
  is_default?: boolean;
  default_parameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type ComfyUIMapping = {
  nodeId: string;
  fieldName: string;
  mappedAs: string;
};

export type ComfyUIConfig = {
  workflow_json?: Record<string, unknown>;
  workflow_api_json?: Record<string, unknown>;
  field_mappings?: ComfyUIMapping[];
};

/** One image job handed to `prepareAndDispatchImageJobs`. Extra fields are caller-owned. */
export type PreparedImageJob = {
  index: number;
  total: number;
  prompt: string;
  negative: string;
  parameters: Record<string, unknown>;
  [key: string]: unknown;
};

export type GenerationSlotStatus = "planned" | "pending" | "generating" | "completed" | "failed" | "cancelled";
