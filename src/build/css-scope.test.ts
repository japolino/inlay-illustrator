import { describe, expect, test } from "bun:test";
import postcss from "postcss";
import { buildOverlayCss } from "./build-css.js";
import { findScopeViolations, OVERLAY_ROOT_CLASS, scopeCss, scopeSelector, selectorViolation } from "./css-scope.js";

const ROOT = `.${OVERLAY_ROOT_CLASS}`;

describe("selector scoping", () => {
  test("prefixes ordinary selectors and maps document aliases to the root", () => {
    expect(scopeSelector(".flex")).toBe(`${ROOT} .flex`);
    expect(scopeSelector("*")).toBe(`${ROOT} *`);
    expect(scopeSelector("::backdrop")).toBe(`${ROOT} ::backdrop`);
    expect(scopeSelector(":root")).toBe(ROOT);
    expect(scopeSelector(":host")).toBe(ROOT);
    expect(scopeSelector("html")).toBe(ROOT);
    expect(scopeSelector("body > .x")).toBe(`${ROOT} > .x`);
    expect(scopeSelector(`${ROOT} .already`)).toBe(`${ROOT} .already`);
    expect(scopeSelector(`${ROOT}.ii-am-overlay`)).toBe(`${ROOT}.ii-am-overlay`);
  });

  test("detects selectors that can match outside the root", () => {
    expect(selectorViolation(".flex")).not.toBeNull();
    expect(selectorViolation(`:not(${ROOT}) .x`)).not.toBeNull();
    expect(selectorViolation(`${ROOT} ~ .x`)).not.toBeNull();
    expect(selectorViolation(`${ROOT} + .x`)).not.toBeNull();
    expect(selectorViolation(`${ROOT}`)).toBeNull();
    expect(selectorViolation(`${ROOT} .a ~ .b`)).toBeNull();
    expect(selectorViolation(`${ROOT} > .a`)).toBeNull();
    expect(selectorViolation(`body ${ROOT}:hover .a`)).toBeNull();
  });

  test("flattens layers, keeps @property global and prefixes keyframes", () => {
    const scoped = scopeCss(`@layer theme, utilities;
@layer theme { :root, :host { --x: 1; } }
@layer utilities { .a { animation: spin 1s; } .b:hover { color: red; } }
@property --tw-x { syntax: "*"; inherits: false; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (min-width: 40rem) { .c { --animate-spin: spin 2s; } }`);
    expect(scoped).not.toContain("@layer");
    expect(scoped).toContain(`${ROOT}{`.replace("{", " {"));
    expect(scoped).toContain(`${ROOT} .a`);
    expect(scoped).toContain("animation: ii-am-spin 1s");
    expect(scoped).toContain("--animate-spin: ii-am-spin 2s");
    expect(scoped).toContain("@keyframes ii-am-spin");
    expect(scoped).toContain("@property --tw-x");
    expect(findScopeViolations(scoped)).toEqual([]);
    expect(findScopeViolations("@layer x { .a { color: red } }").length).toBeGreaterThan(0);
  });
});

describe("compiled overlay stylesheet", () => {
  const css = buildOverlayCss();
  const root = postcss.parse(css);

  test("no style rule can match outside the overlay root", () => {
    const violations = findScopeViolations(css);
    expect(violations).toEqual([]);
    let rules = 0;
    root.walkRules((rule) => {
      const parent = rule.parent;
      if (parent?.type === "atrule" && /keyframes$/i.test((parent as postcss.AtRule).name)) return;
      rules += 1;
      for (const selector of rule.selectors) expect(selectorViolation(selector)).toBeNull();
    });
    expect(rules).toBeGreaterThan(20);
  });

  test("ships no Tailwind preflight and no document-level selectors", () => {
    root.walkRules((rule) => {
      for (const selector of rule.selectors) {
        expect(selector).not.toMatch(/(^|[\s,>])(html|body|:root|:host)(?=$|[\s,>.:[])/);
      }
    });
    expect(css).not.toContain("@layer");
    expect(css).not.toMatch(/(^|})\s*\*\s*,/);
  });

  test("defines the theme on the root and maps Asset Maid colours to Lumiverse tokens", () => {
    expect(css).toContain(`${ROOT}{`);
    expect(css).toContain("--color-primary:var(--lumiverse-primary,#d7b86f)");
    expect(css).toContain("--color-background:var(--lumiverse-bg,#0d0a0c)");
    root.walkAtRules(/keyframes$/i, (rule) => {
      expect(rule.params.startsWith("ii-am-")).toBe(true);
    });
  });
});
