/**
 * Loosely typed access to the generated Asset Maid analysis slice (`analysis-core.ts`, verbatim AM code, ts-nocheck).
 * The slice keeps the original minified names; every declaration is tagged `// AM <name> @<prettyLine>`.
 * Typed wrappers live next to their callers (bridge/*, controllers/*).
 */
import * as raw from "./analysis-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AmFn = (...args: any[]) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AM = raw as unknown as Record<string, any>;
/** A function export of the slice (throws when the slice lost it, so a bad regeneration fails loudly). */
export function amFn(name: string): AmFn {
  const fn = AM[name];
  if (typeof fn !== "function") throw new Error(`Asset Maid analysis core is missing function ${name}`);
  return fn as AmFn;
}
