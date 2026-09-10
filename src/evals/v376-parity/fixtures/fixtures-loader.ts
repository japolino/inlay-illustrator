
import { readFileSync } from "node:fs";

export interface AuditFixtures {
  version: string;
  description: string;
  prompt_assembly: Array<{
    id: string;
    mode: number;
    separator: string;
    syntax: string;
    inputs: {
      setup: string;
      charPos: string;
      charNeg?: string;
      customPos?: string;
      customNeg?: string;
      charNames?: string;
      preset?: string;
    };
    expected_positive?: string;
    expected_negative?: string;
    expected_base_positive?: string;
    expected_base_negative?: string;
    expected_characters?: Array<{ prompt: string; negative?: string }>;
    notes?: string;
  }>;
  tag_filtering_and_replacements: Array<{
    id: string;
    description?: string;
    [key: string]: any;
  }>;
  character_normalization: Array<{
    id: string;
    input: any;
    options: any;
    expected: any;
  }>;
  memory_lifecycle: Array<{
    id: string;
    [key: string]: any;
  }>;
  encoding_and_prefill: Array<{
    id: string;
    mode?: number;
    raw_prompt?: string;
    encoded_prompt?: string;
    raw_response?: string;
    decoded_response?: string;
    notes?: string;
    raw_xml?: string;
    expected_messages?: Array<{ role: string; content: string; name?: string }>;
  }>;
  schema_conditionals: Array<{
    id: string;
    mode: number;
    options: any;
    expected_shot_fields: string[];
    forbidden_shot_fields: string[];
    expected_char_fields: string[];
    forbidden_char_fields: string[];
  }>;
}

let cachedFixtures: AuditFixtures | null = null;

export function loadAuditFixtures(): AuditFixtures {
  if (!cachedFixtures) {
    const raw = readFileSync(new URL("./fixtures.json", import.meta.url), "utf-8");
    cachedFixtures = JSON.parse(raw);
  }
  return cachedFixtures!;
}
