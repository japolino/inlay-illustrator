/**
 * Deterministic JSON projection used by the parity fixtures.
 *
 * Fixture generators (outside the repo, running the ORIGINAL bundle) and the bun tests (running the
 * port) both pass their values through `toPlain` before comparing, so Maps, Sets, frozen class
 * instances and functions serialize the same way on both sides.
 */
export function toPlain(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null) return null;
  const type = typeof value;
  if (type === "number") return Object.is(value, -0) ? 0 : Number.isFinite(value) ? value : { __number__: String(value) };
  if (type === "string" || type === "boolean") return value;
  if (type === "undefined") return { __undefined__: true };
  if (type === "bigint") return { __bigint__: String(value) };
  if (type === "function") return { __function__: (value as { name?: string }).name ?? "" };
  if (type === "symbol") return { __symbol__: String(value) };
  const object = value as object;
  if (seen.has(object)) return { __cycle__: true };
  seen.add(object);
  try {
    if (Array.isArray(object)) return object.map((item) => toPlain(item, seen));
    if (object instanceof Map || isMapLike(object)) {
      return { __map__: [...(object as Map<unknown, unknown>).entries()].map(([k, v]) => [toPlain(k, seen), toPlain(v, seen)]) };
    }
    if (object instanceof Set) return { __set__: [...object].map((item) => toPlain(item, seen)) };
    if (ArrayBuffer.isView(object)) return { __bytes__: Array.from(object as unknown as ArrayLike<number>) };
    if (object instanceof Error) return { __error__: object.name, message: object.message, ...plainProps(object, seen) };
    return plainProps(object, seen);
  } finally {
    seen.delete(object);
  }
}

function isMapLike(object: object): boolean {
  // NovelAIV5ImmutableMap (w1e) and the V4.5 ImmutableMap (Z5e) wrap a private Map and expose entries().
  const tag = Object.prototype.toString.call(object);
  return tag === "[object NovelAIV5ImmutableMap]" || tag === "[object ImmutableMap]";
}

function plainProps(object: object, seen: WeakSet<object>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(object)) {
    const v = (object as Record<string, unknown>)[key];
    if (v === undefined) continue; // JSON.stringify semantics for object members
    out[key] = toPlain(v, seen);
  }
  return out;
}

/** `JSON.stringify(toPlain(value))` with stable 1-space indentation. */
export function plainJson(value: unknown): string {
  return JSON.stringify(toPlain(value), null, 1);
}
