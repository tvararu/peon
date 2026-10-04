import { describe, expect, test } from "bun:test";
import type { PilotAfter } from "#harness/contract/details";
import { pilotSpec } from "#harness/tools/pilot";
import { setSelf, toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function ready() {
  const t = await createTestRuntime();
  setSelf(t.handle);
  t.handle.capabilities = () => ({
    factions: true,
    jev: true,
    navigation: true,
    spells: true,
  });
  return t;
}

describe("pilot refusals", () => {
  test("no Jev key refuses no_combat_helper before any run starts", async () => {
    const t = await ready();
    t.handle.capabilities = () => ({
      factions: true,
      jev: false,
      navigation: true,
      spells: true,
    });
    await expect(
      pilotSpec.run({ to: { x: 10, y: 0 } }, toolCtx<PilotAfter>(t)),
    ).rejects.toMatchObject({ reason: "no_combat_helper" });
    expect(t.rt.runs.active()).toBeUndefined();
  });

  test("a map without navigation refuses unsupported_map", async () => {
    const t = await ready();
    t.handle.capabilities = () => ({
      factions: true,
      jev: true,
      navigation: false,
      spells: true,
    });
    await expect(
      pilotSpec.run({ to: { x: 10, y: 0 } }, toolCtx<PilotAfter>(t)),
    ).rejects.toMatchObject({ reason: "unsupported_map" });
  });

  test("a dead character refuses dead", async () => {
    const t = await ready();
    setSelf(t.handle, { life: "dead" });
    await expect(
      pilotSpec.run({ to: { x: 10, y: 0 } }, toolCtx<PilotAfter>(t)),
    ).rejects.toMatchObject({ reason: "dead" });
  });

  test("neither or both of to and circle refuse bad_objective", async () => {
    const t = await ready();
    await expect(
      pilotSpec.run({}, toolCtx<PilotAfter>(t)),
    ).rejects.toMatchObject({ reason: "bad_objective" });
    await expect(
      pilotSpec.run(
        {
          circle: { direction: "clockwise", radius: 5, x: 0, y: 0 },
          to: { x: 1, y: 1 },
        },
        toolCtx<PilotAfter>(t),
      ),
    ).rejects.toMatchObject({ reason: "bad_objective" });
  });
});
