import { describe, expect, test } from "bun:test";
import { installShutdown, wowExtension } from "#harness/extension/extension";
import { createFakePi } from "#test-support/fake-pi";
import { createTestRuntime } from "#test-support/runtime-fixture";

describe("wowExtension", () => {
  test("installs input, guards and shutdown handlers", async () => {
    const { rt } = await createTestRuntime();
    const fake = createFakePi();
    await wowExtension(rt)(fake.api);
    expect(fake.events()).toEqual(
      expect.arrayContaining([
        "agent_start",
        "agent_end",
        "user_bash",
        "session_shutdown",
      ]),
    );
    expect(fake.renderers()).toEqual(["message:wow-event", "entry:wow-human"]);
  });
});

describe("installShutdown", () => {
  test("detaches the sink and keeps the game session on reload, new, resume and fork", async () => {
    const { rt, handle } = await createTestRuntime();
    const sinks: unknown[] = [];
    rt.router.setSink = (sink) => void sinks.push(sink);
    const fake = createFakePi();
    installShutdown(fake.api, rt);
    for (const reason of ["reload", "new", "resume", "fork"])
      await fake.emit({ reason, type: "session_shutdown" });
    expect(sinks).toEqual([undefined, undefined, undefined, undefined]);
    expect(handle.logout).not.toHaveBeenCalled();
    expect(rt.connection()).toBe("online");
  });

  test("on quit it shuts the runtime down", async () => {
    const { rt, handle } = await createTestRuntime();
    const fake = createFakePi();
    installShutdown(fake.api, rt);
    await fake.emit({ reason: "quit", type: "session_shutdown" });
    expect(handle.logout).toHaveBeenCalled();
    expect(rt.connection()).toBe("offline");
  });
});
