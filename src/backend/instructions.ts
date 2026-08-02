import type { Config } from "../shared/config.js";
import { renderOriginalImageInstruction } from "./original-instructions.js";

/** Exact v3.5 parser instruction after resolving the original card toggles. */
export function parserInstruction(config: Config): string {
  return renderOriginalImageInstruction(config);
}
