import { describe, expect, test } from "bun:test";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import {
  contentOf,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const stalker = unitRow({
  distance: 22,
  guid: 0x20n,
  level: 7,
  name: "Springpaw Stalker",
  x: 22,
  y: 0,
});

describe("engage", () => {
  test("refuses when dead", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { life: "dead" });
    await expect(
      engageSpec.run({}, toolCtx<EngageAfter>(t)),
    ).rejects.toMatchObject({ next: "recover()", reason: "dead" });
  });

  test("refuses a pull under 30% mana before any run starts", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { maxPower: 300, power: 60 });
    setUnits(t.handle, [stalker]);
    await expect(
      engageSpec.run({}, toolCtx<EngageAfter>(t)),
    ).rejects.toMatchObject({ reason: "low_mana" });
    expect(t.rt.runs.list()).toHaveLength(0);
  });

  test("a choice refusal inside the run comes back as a REFUSED result", async () => {
    const t = await createTestRuntime();
    t.handle.capabilities = () => ({
      factions: true,
      jev: true,
      navigation: true,
      spells: true,
    });
    setSelf(t.handle, { level: 1 });
    setUnits(t.handle, [stalker]);
    const res = await engageSpec.run({}, toolCtx<EngageAfter>(t));
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(res).toMatchObject({
      next: undefined,
      reason: "too_strong",
      status: "REFUSED",
    });
    expect(res.runId).toBe(t.rt.runs.list()[0]?.id);
  });
});
