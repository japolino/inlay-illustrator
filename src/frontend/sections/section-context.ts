import type { Config } from "../../shared/config.js";
import type { FrontendActions, ImageConnection, ParserConnection } from "../contracts.js";
import type { UiBuilder } from "../ui-builder.js";

export type SectionContext = {
  ui: UiBuilder;
  config: Config;
  parserConnections: ParserConnection[];
  imageConnections?: ImageConnection[];
  characterAppearance: Record<string, string>;
  actions: FrontendActions;
  rerender(): void;
};
