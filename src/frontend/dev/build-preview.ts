/**
 * Builds the dev preview page into .cache/ui-preview/ (index.html + preview.js).
 *   bun run src/frontend/dev/build-preview.ts
 * Then open .cache/ui-preview/index.html#open=assets (or use screenshot.ts).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildOverlayCss, OVERLAY_CSS_OUTPUT } from "../../build/build-css.js";

/** Output dir; set II_PREVIEW_DIR to use a private dir when several agents build at once. */
export const PREVIEW_DIR = resolve(process.env.II_PREVIEW_DIR || resolve(import.meta.dir, "../../../.cache/ui-preview"));

export async function buildPreview(options: { css?: boolean } = {}): Promise<string> {
  if (options.css !== false) writeFileSync(OVERLAY_CSS_OUTPUT, buildOverlayCss());
  mkdirSync(PREVIEW_DIR, { recursive: true });
  const result = await Bun.build({ entrypoints: [join(import.meta.dir, "preview.tsx")], outdir: PREVIEW_DIR, target: "browser", format: "esm", naming: "preview.js" });
  if (!result.success) throw new Error(result.logs.map((log) => String(log)).join("\n"));
  writeFileSync(join(PREVIEW_DIR, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Inlay Illustrator preview</title>
<style>
  html,body{margin:0;height:100%;background:#0f0d10;color:#e8e2d6;font-family:Inter,system-ui,sans-serif}
  :root{--lumiverse-primary:#c9a45c;--lumiverse-bg:#0f0d10;--lumiverse-text:#ece4d4}
</style></head>
<body><div id="ii-preview-chat"></div><script type="module" src="./preview.js"></script></body></html>
`);
  return PREVIEW_DIR;
}

if (import.meta.main) {
  const dir = await buildPreview({ css: !process.argv.includes("--no-css") });
  console.log(`preview built: ${join(dir, "index.html")}`);
}
