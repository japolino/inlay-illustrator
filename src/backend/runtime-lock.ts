type RuntimeLockRegistry = {
  locks: Set<string>;
};

const REGISTRY_KEY = Symbol.for("inlay-illustrator.runtime-locks");
const globalRegistry = globalThis as unknown as Record<PropertyKey, unknown>;

function registry(): RuntimeLockRegistry {
  const existing = globalRegistry[REGISTRY_KEY];
  if (existing && typeof existing === "object" && (existing as RuntimeLockRegistry).locks instanceof Set) {
    return existing as RuntimeLockRegistry;
  }
  const created: RuntimeLockRegistry = { locks: new Set<string>() };
  globalRegistry[REGISTRY_KEY] = created;
  return created;
}

/**
 * Acquires a process-wide extension lock. Symbol.for keeps the registry shared
 * across hot-reloaded copies of the backend bundle in the same host runtime.
 */
export function tryAcquireRuntimeLock(scope: string, key: string): (() => void) | null {
  const lockKey = `${scope}:${key}`;
  const locks = registry().locks;
  if (locks.has(lockKey)) return null;
  locks.add(lockKey);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks.delete(lockKey);
  };
}
