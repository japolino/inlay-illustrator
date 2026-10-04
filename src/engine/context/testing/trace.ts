/**
 * Read tracer used to document (and pin) which input fields Asset Maid's context builders read.
 * Wraps a plain-data object graph in Proxies that record every property read (`get`, `has`,
 * `getOwnPropertyDescriptor`) as a dotted path. Array indices become `[]`; dynamic keys can be
 * mapped to placeholders with `rename` (e.g. a prompt key -> "<promptKey>").
 * Used by the fixture generator (original bundle) and by the tests (port) with identical inputs.
 */
export interface ReadTrace<T> {
  proxy: T;
  paths(): string[];
}

export function traceReads<T extends object>(root: T, rootName: string, rename: Record<string, string> = {}): ReadTrace<T> {
  const seen = new Set<string>();
  const cache = new WeakMap<object, Map<string, object>>();
  const norm = (key: string, parentIsArray: boolean): string => {
    if (parentIsArray && /^\d+$/.test(key)) return "[]";
    return rename[key] ?? key;
  };
  const wrap = (target: object, path: string): object => {
    let byPath = cache.get(target);
    if (!byPath) cache.set(target, (byPath = new Map()));
    const hit = byPath.get(path);
    if (hit) return hit;
    const isArray = Array.isArray(target);
    const proxy = new Proxy(target, {
      get(t, key, receiver) {
        const value = Reflect.get(t, key, receiver);
        if (typeof key === "symbol") return value;
        if (isArray && (key === "length" || typeof (Array.prototype as unknown as Record<string, unknown>)[key] === "function")) return value;
        const p = `${path}.${norm(key, isArray)}`;
        seen.add(p);
        if (value !== null && typeof value === "object") {
          const d = Object.getOwnPropertyDescriptor(t, key);
          if (d && d.configurable === false && d.writable === false) return value;
          return wrap(value, p);
        }
        return value;
      },
      has(t, key) {
        if (typeof key !== "symbol") seen.add(`${path}.${norm(key, isArray)}?`);
        return Reflect.has(t, key);
      },
      getOwnPropertyDescriptor(t, key) {
        if (typeof key !== "symbol") seen.add(`${path}.${norm(key, isArray)}?`);
        return Reflect.getOwnPropertyDescriptor(t, key);
      },
    });
    byPath.set(path, proxy);
    return proxy;
  };
  return {
    proxy: wrap(root, rootName) as T,
    paths: () => [...seen].filter((p) => !(p.endsWith("?") && seen.has(p.slice(0, -1)))).sort(),
  };
}
