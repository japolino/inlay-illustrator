/**
 * Shared helpers for the Inlay Illustrator contract (pure, no host calls).
 * Ports of Asset Maid 0.9.88 micro-helpers (`tc`, `ql`, `xo`, `VW`, `kE` FNV-1a ...).
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Plain object test (AM `tc`): prototype is Object.prototype or null. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** AM `ql`/`yp`/`ug`: object (not array) or `{}`. */
export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** AM `_n`/`Ip`/`Sg`: `null|undefined` -> "", else `String(v).trim()`. */
export function trimString(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

/** AM `kg`: `null|undefined` -> "", else `String(v)` (no trim). */
export function toText(value: unknown): string {
  return value == null ? "" : String(value);
}

export function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** AM `xo`: JSON deep clone. */
export function jsonClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** AM `uE`: finite number clamped to [min,max], else fallback. */
export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/**
 * AM `VW`: deep merge `patch` over a clone of `base`. Plain objects merge recursively;
 * arrays and primitives replace; `undefined` values are skipped.
 */
export function deepMergeOverDefaults<T>(base: T, patch: unknown): T {
  const result = jsonClone(base) as unknown;
  if (!isPlainObject(result) || !isPlainObject(patch)) return result as T;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const current = (result as Record<string, unknown>)[key];
    (result as Record<string, unknown>)[key] =
      isPlainObject(value) && isPlainObject(current) ? deepMergeOverDefaults(current, value) : jsonClone(value);
  }
  return result as T;
}

/**
 * Inverse of {@link deepMergeOverDefaults} (AM `iv`-like): returns only the parts of `value` that differ
 * from `defaults`. Plain objects recurse; arrays/primitives compare by JSON. Returns `undefined` when equal.
 */
export function diffAgainstDefaults(value: unknown, defaults: unknown): unknown {
  if (isPlainObject(value) && isPlainObject(defaults)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (v === undefined) continue;
      const d = diffAgainstDefaults(v, defaults[key]);
      if (d !== undefined) out[key] = d;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return JSON.stringify(value) === JSON.stringify(defaults) ? undefined : jsonClone(value);
}

/** Canonical JSON (object keys sorted recursively). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** FNV-1a 32 over UTF-16 code units (AM `kE` uses base 36 output). */
export function fnv1a32(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** AM `kE`: FNV-1a 32, base 36. */
export function fnv1a32Base36(text: string): string {
  return fnv1a32(text).toString(36);
}

/** AM `qk`: `fnv1a32:<hex8>:<len>` over `"string:"+text`. */
export function contentRevision(text: string): string {
  const source = `string:${text}`;
  return `fnv1a32:${fnv1a32(source).toString(16).padStart(8, "0")}:${source.length}`;
}

/** Ordered unique list of trimmed non-empty strings (AM `Ty` is case-insensitive; this one is exact). */
export function uniqueStrings(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = trimString(raw);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** AM `Ty`: ordered unique (case-insensitive) trimmed strings, first spelling wins. */
export function uniqueStringsCaseInsensitive(values: Iterable<unknown>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = trimString(raw);
    if (!v) continue;
    const k = v.toLocaleLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** RFC 4122 v4 UUID (uses crypto.getRandomValues when available). */
export function randomUuid(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

/** AM `ap`: `<prefix>_<uuid>` not in `taken`. */
export function prefixedId(prefix: string, taken: ReadonlySet<string> = new Set()): string {
  for (;;) {
    const id = `${prefix}_${randomUuid()}`;
    if (!taken.has(id)) return id;
  }
}

/** Validation issue shared by all contract validators. */
export interface ContractIssue {
  path: string;
  code: string;
  message: string;
}
