import { afterEach, describe, expect, test } from "bun:test";
import type { EventBus } from "@earendil-works/pi-coding-agent";
import { onWorld, type WorldService } from "#harness/world/service";
import type { ProbeStep } from "#test-support/extensions/world-probe";
import {
  createFauxSession,
  FAUX_MODEL,
  type FauxSession,
} from "#test-support/faux-session";
import { createTestRuntime } from "#test-support/runtime-fixture";

const PROBE = `${import.meta.dir}/../../test-support/extensions/world-probe.ts`;

let open: FauxSession | undefined;

afterEach(async () => {
  await open?.dispose();
  open = undefined;
});

function step(bus: EventBus): Promise<ProbeStep> {
  const { promise, resolve } = Promise.withResolvers<ProbeStep>();
  bus.emit("probe:step", resolve);
  return promise;
}

describe("worldExtension", () => {
  test("an extension loaded by path reads the world and moves only while its claim holds", async () => {
    const { rt, handle } = await createTestRuntime({
      flags: { model: FAUX_MODEL },
    });
    let bus: EventBus | undefined;
    open = await createFauxSession({
      extension: (pi) => {
        bus = pi.events;
      },
      extensionPaths: [PROBE],
      rt,
    });
    const events = bus as EventBus;
    expect(await step(events)).toEqual({
      outcome: "sent",
      pose: handle.getControlState().pose,
    });
    expect(handle.move).toHaveBeenCalledWith("forward", 2000);
    expect(rt.control.owner()).toBe("loop");
    rt.control.claim("human", "key");
    expect((await step(events)).outcome).toBe("not_owner");
    expect(handle.move).toHaveBeenCalledTimes(1);
  });

  test("an inline extension after world gets the service through onWorld", async () => {
    const { rt } = await createTestRuntime({ flags: { model: FAUX_MODEL } });
    const worlds: WorldService[] = [];
    open = await createFauxSession({
      extension: (pi) => {
        onWorld(pi, (world) => worlds.push(world));
      },
      rt,
    });
    expect(worlds).toHaveLength(1);
    expect(worlds[0]?.current()).toBeDefined();
  });
});
