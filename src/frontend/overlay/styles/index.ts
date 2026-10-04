/**
 * The compiled, scoped overlay stylesheet (see src/build/build-css.ts).
 * `bun run css` must run before bundling; `bun run build` does that.
 */
import overlayCss from "./overlay.generated.css" with { type: "text" };

export const OVERLAY_CSS: string = overlayCss;
