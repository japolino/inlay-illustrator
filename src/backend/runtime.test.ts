import { describe, expect, test } from "bun:test";
import { createBackendRuntime } from "./runtime.js";
import type { BackendServices } from "./services/types.js";
import { createFakeHost } from "./testing/fake-host.js";

function setup() {
  const built: Array<string | undefined> = [];
  const runtime = createBackendRuntime({
    host: createFakeHost({ userId: "u1" }).host,
    createServices: (host, userId) => ({ host, userId }) as unknown as BackendServices,
    modules: [(services) => (built.push(services.userId), {})],
    handlers: {},
  });
  return { runtime, built };
}

describe("backend runtime", () => {
  test("the owner of a user-scoped install (host events without userId, RPCs with it) gets one runtime", () => {
    // A host event before the first frontend message, then the installer's first RPC.
    const late = setup();
    const owner = late.runtime.modules(undefined);
    expect(late.runtime.modules("u1")).toBe(owner);
    expect(late.runtime.services("u1")).toBe(late.runtime.services(undefined));
    expect(late.runtime.users()).toEqual([undefined]);
    expect(late.runtime.modules("u2")).not.toBe(owner);
    expect(late.built).toEqual([undefined, "u2"]);

    // The usual order: the first RPC, then a host event.
    const early = setup();
    const installer = early.runtime.modules("u1");
    expect(early.runtime.modules(undefined)).toBe(installer);
    expect(early.runtime.users()).toEqual(["u1"]);
    expect(early.built).toEqual(["u1"]);
  });
});
