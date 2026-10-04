/**
 * Builds the overlay stylesheet:
 * 1. Tailwind CSS v4 CLI compiles src/frontend/overlay/styles/overlay.css,
 * 2. src/build/css-scope.ts scopes every rule to `.ii-am-root`,
 * 3. the result is written to overlay.generated.css (git-ignored) and
 *    imported as text by the frontend bundle.
 * Fails when the scoped CSS still has a rule that could match outside the root.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { findScopeViolations, scopeCss } from "./css-scope.js";

export const REPO_ROOT = resolve(import.meta.dir, "../..");
export const OVERLAY_CSS_INPUT = join(REPO_ROOT, "src/frontend/overlay/styles/overlay.css");
export const OVERLAY_CSS_OUTPUT = join(REPO_ROOT, "src/frontend/overlay/styles/overlay.generated.css");
const TAILWIND_CLI = join(REPO_ROOT, "node_modules/@tailwindcss/cli/dist/index.mjs");

/** Runs the Tailwind CLI and returns the raw (unscoped) CSS. */
export function compileTailwind(input = OVERLAY_CSS_INPUT, minify = true): string {
  const dir = mkdtempSync(join(tmpdir(), "ii-am-css-"));
  const output = join(dir, "raw.css");
  try {
    const args = [process.execPath, TAILWIND_CLI, "--input", input, "--output", output, "--cwd", REPO_ROOT];
    if (minify) args.push("--minify");
    const result = Bun.spawnSync(args, { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) {
      throw new Error(`Tailwind CLI failed (${result.exitCode}): ${result.stderr.toString()}`);
    }
    return readFileSync(output, "utf8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Compiles and scopes the overlay CSS. Throws on scope violations. */
export function buildOverlayCss(input = OVERLAY_CSS_INPUT): string {
  const scoped = scopeCss(compileTailwind(input));
  const violations = findScopeViolations(scoped);
  if (violations.length > 0) {
    const sample = violations.slice(0, 10).map((entry) => `  ${entry.selector} (${entry.reason})`).join("\n");
    throw new Error(`Overlay CSS has ${violations.length} rule(s) that can match outside the overlay root:\n${sample}`);
  }
  return scoped;
}

if (import.meta.main) {
  const started = Date.now();
  const css = buildOverlayCss();
  writeFileSync(OVERLAY_CSS_OUTPUT, css);
  console.log(`overlay.generated.css: ${(css.length / 1024).toFixed(1)} KB in ${Date.now() - started} ms`);
}
