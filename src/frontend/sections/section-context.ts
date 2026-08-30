import type { Config } from "../../shared/config.js";
import type { FrontendActions, ParserConnection } from "../contracts.js";
import type { UiBuilder } from "../ui-builder.js";

export type SectionContext = {
  ui: UiBuilder;
  config: Config;
  parserConnections: ParserConnection[];
  characterAppearance: Record<string, string>;
  quoteStyle: string;
  quoteExample: string;
  actions: FrontendActions;
  rerender(): void;
};
