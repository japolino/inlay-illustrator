/**
 * Deterministic projection for V4.5 parity fixtures.
 *
 * The V4.5 Rule IR catalog (compiled by `compileV45Catalog`, AM `LLe` @42061) stores its tables in
 * `ImmutableMap` instances (AM class `Z5e` @38345: private `#e` Map, `Symbol.toStringTag` "ImmutableMap").
 * `toPlain` (src/engine/testing/plain.ts) only recognises real Maps and the V5 `NovelAIV5ImmutableMap`,
 * so an ImmutableMap would project to `{}`. `v45Plain` first converts every ImmutableMap into a real
 * Map, then applies `toPlain`. Generators (original bundle) and tests (port) both use it.
 */
import { toPlain } from "../testing/plain";

function isImmutableMap(value: object): value is ReadonlyMap<unknown, unknown> {
  return Object.prototype.toString.call(value) === "[object ImmutableMap]" && typeof (value as Map<unknown, unknown>).entries === "function";
}

/** Recursively replace ImmutableMap instances with real Maps (other objects are copied shallowly per level). */
export function normalizeImmutableMaps(value: unknown, seen: Map<object, unknown> = new Map()): unknown {
  if (value === null || typeof value !== "object") return value;
  const object = value as object;
  if (seen.has(object)) return seen.get(object);
  if (isImmutableMap(object)) {
    const out = new Map<unknown, unknown>();
    seen.set(object, out);
    for (const [k, v] of object.entries()) out.set(normalizeImmutableMaps(k, seen), normalizeImmutableMaps(v, seen));
    return out;
  }
  if (Array.isArray(object)) {
    const out: unknown[] = [];
    seen.set(object, out);
    for (const item of object) out.push(normalizeImmutableMaps(item, seen));
    return out;
  }
  if (object instanceof Map) {
    const out = new Map<unknown, unknown>();
    seen.set(object, out);
    for (const [k, v] of object) out.set(normalizeImmutableMaps(k, seen), normalizeImmutableMaps(v, seen));
    return out;
  }
  if (object instanceof Set) {
    const out = new Set<unknown>();
    seen.set(object, out);
    for (const item of object) out.add(normalizeImmutableMaps(item, seen));
    return out;
  }
  if (object instanceof Error || ArrayBuffer.isView(object)) return object;
  const proto = Object.getPrototypeOf(object);
  if (proto !== Object.prototype && proto !== null) return object;
  const out: Record<string, unknown> = {};
  seen.set(object, out);
  for (const key of Object.keys(object)) out[key] = normalizeImmutableMaps((object as Record<string, unknown>)[key], seen);
  return out;
}

/** `toPlain(normalizeImmutableMaps(value))`. */
export function v45Plain(value: unknown): unknown {
  return toPlain(normalizeImmutableMaps(value));
}
