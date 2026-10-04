/**
 * Scopes compiled Tailwind CSS to the overlay root so nothing leaks into the
 * Lumiverse host page.
 *
 * - Flattens every `@layer` block in place and drops `@layer a, b;` statements.
 *   Layered rules lose to unlayered host rules regardless of specificity, so
 *   the overlay must ship unlayered CSS. Source order is preserved.
 * - Rewrites every style rule outside `@keyframes`:
 *   `:root`, `:host`, `html`, `body` become the root class; any other selector
 *   gets the root class as an ancestor (`.ii-am-root .flex`). Selectors that
 *   already start with the root class are left alone.
 * - Renames `@keyframes x` to `@keyframes ii-am-x` and rewrites the names in
 *   `animation`, `animation-name` and `--animate-*` values.
 * `@property` rules stay global (they only register custom properties).
 */
import postcss, { type AtRule, type ChildNode, type Container, type Root, type Rule } from "postcss";
import selectorParser from "postcss-selector-parser";

export const OVERLAY_ROOT_CLASS = "ii-am-root";
export const KEYFRAMES_PREFIX = "ii-am-";

const ROOT_ALIASES = new Set([":root", ":host", "html", "body"]);

function insideKeyframes(node: ChildNode): boolean {
  let parent = node.parent as Container | Root | undefined;
  while (parent && parent.type !== "root") {
    if (parent.type === "atrule" && /keyframes$/i.test((parent as AtRule).name)) return true;
    parent = (parent as unknown as ChildNode).parent as Container | Root | undefined;
  }
  return false;
}

function flattenLayers(root: Root): void {
  let changed = true;
  while (changed) {
    changed = false;
    root.walkAtRules("layer", (rule) => {
      changed = true;
      if (rule.nodes && rule.nodes.length > 0) rule.replaceWith(rule.nodes);
      else rule.remove();
    });
  }
}

/** Scopes one selector (no top-level commas) to the root class. */
export function scopeSelector(selector: string, rootClass = OVERLAY_ROOT_CLASS): string {
  const trimmed = selector.trim();
  if (!trimmed) return trimmed;
  const rootSelector = `.${rootClass}`;
  if (ROOT_ALIASES.has(trimmed.toLowerCase())) return rootSelector;
  if (trimmed === rootSelector || trimmed.startsWith(`${rootSelector} `) || trimmed.startsWith(`${rootSelector}.`)
    || trimmed.startsWith(`${rootSelector}:`) || trimmed.startsWith(`${rootSelector}[`) || trimmed.startsWith(`${rootSelector}>`)) {
    return trimmed;
  }
  // `html .x` / `body > .x` / `:root .x`: replace the leading document alias.
  const alias = /^(:root|:host|html|body)(?=[\s>])/i.exec(trimmed);
  if (alias) return `${rootSelector}${trimmed.slice(alias[0].length)}`;
  return `${rootSelector} ${trimmed}`;
}

function renameKeyframes(root: Root): void {
  const names = new Map<string, string>();
  root.walkAtRules(/keyframes$/i, (rule) => {
    const name = rule.params.trim();
    if (!name || name.startsWith(KEYFRAMES_PREFIX)) return;
    const renamed = `${KEYFRAMES_PREFIX}${name}`;
    names.set(name, renamed);
    rule.params = renamed;
  });
  if (names.size === 0) return;
  const pattern = new RegExp(`(^|[\\s,])(${[...names.keys()].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[\\s,;])`, "g");
  root.walkDecls((decl) => {
    const prop = decl.prop.toLowerCase();
    if (prop !== "animation" && prop !== "animation-name" && !prop.startsWith("--animate")) return;
    decl.value = decl.value.replace(pattern, (_match, lead: string, name: string) => `${lead}${names.get(name) ?? name}`);
  });
}

/** Returns the scoped stylesheet text. */
export function scopeCss(css: string, rootClass = OVERLAY_ROOT_CLASS): string {
  const root = postcss.parse(css);
  flattenLayers(root);
  root.walkRules((rule: Rule) => {
    if (insideKeyframes(rule)) return;
    const scoped = rule.selectors.map((selector) => scopeSelector(selector, rootClass));
    rule.selectors = [...new Set(scoped)];
  });
  renameKeyframes(root);
  return root.toResult().css;
}

export type ScopeViolation = { selector: string; reason: string };

/**
 * A selector is root-anchored when a top-level compound contains the root
 * class and the combinator right after that compound (if any) is a
 * descendant or child combinator. Anything after a descendant of the root is
 * itself inside the root, even across sibling combinators.
 */
export function selectorViolation(selector: string, rootClass = OVERLAY_ROOT_CLASS): string | null {
  let reason: string | null = "no top-level root class";
  selectorParser((selectors) => {
    if (selectors.nodes.length !== 1) {
      reason = "unexpected selector list";
      return;
    }
    const nodes = selectors.nodes[0]!.nodes;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index]!;
      if (node.type !== "class" || node.value !== rootClass) continue;
      let next = index + 1;
      while (next < nodes.length && nodes[next]!.type !== "combinator") next += 1;
      if (next >= nodes.length) {
        reason = null;
        return;
      }
      const combinator = (nodes[next]!.value ?? "").trim();
      if (combinator === "" || combinator === ">") {
        reason = null;
        return;
      }
      reason = `root class followed by sibling combinator "${combinator}"`;
      return;
    }
  }).processSync(selector);
  return reason;
}

/** Lists every style rule selector that could match outside the root. */
export function findScopeViolations(css: string, rootClass = OVERLAY_ROOT_CLASS): ScopeViolation[] {
  const root = postcss.parse(css);
  const violations: ScopeViolation[] = [];
  root.walkAtRules("layer", (rule) => {
    violations.push({ selector: `@layer ${rule.params}`, reason: "layered CSS loses to unlayered host CSS" });
  });
  root.walkRules((rule) => {
    if (insideKeyframes(rule)) return;
    for (const selector of rule.selectors) {
      const reason = selectorViolation(selector, rootClass);
      if (reason) violations.push({ selector, reason });
    }
  });
  root.walkAtRules(/keyframes$/i, (rule) => {
    if (!rule.params.trim().startsWith(KEYFRAMES_PREFIX)) {
      violations.push({ selector: `@keyframes ${rule.params}`, reason: "unprefixed global keyframes name" });
    }
  });
  return violations;
}
