import { describe, expect, jest, test } from "bun:test";
import type { AreaState } from "@peon/core";
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

function dismountState(mounted: boolean): AreaState<"selfstate"> {
  return {
    collisionHeight: undefined,
    condition: {
      drunkState: "sober",
      drunkValue: 0,
      restedXp: 0,
      resting: false,
      restState: "unknown",
    },
    ghostPending: false,
    lastTransferAbort: undefined,
    mountDisplayId: mounted ? 1234 : 0,
    mounted,
    selfResSpell: 0,
    standState: "stand",
    timers: {},
  };
}

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
    ).rejects.toMatchObject({
      detail: expect.stringMatching(
        /^you have mana \d+\/\d+ \(\d+%\); pull at 30% or more\.$/,
      ),
      reason: "low_mana",
    });
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

  test("a mounted engage dismounts before choosing a target", async () => {
    const t = await createTestRuntime();
    t.handle.capabilities = () => ({
      factions: true,
      jev: true,
      navigation: true,
      spells: true,
    });
    setSelf(t.handle, { level: 7 });
    setUnits(t.handle, [stalker]);
    jest
      .spyOn(t.handle.selfstate, "state")
      .mockReturnValue(dismountState(true));
    const spy = jest
      .spyOn(t.handle.selfstate.act, "dismount")
      .mockResolvedValue({ status: "ok" });
    const res = await engageSpec.run({}, toolCtx<EngageAfter>(t));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.detail).toContain("Dismounted first.");
  });

  test("a taxi mount stops the engage with in_flight", async () => {
    const t = await createTestRuntime();
    t.handle.capabilities = () => ({
      factions: true,
      jev: true,
      navigation: true,
      spells: true,
    });
    setSelf(t.handle, { level: 7 });
    setUnits(t.handle, [stalker]);
    jest
      .spyOn(t.handle.selfstate, "state")
      .mockReturnValue(dismountState(true));
    t.handle.selfstate.act.dismount = async () => ({
      reason: "in_flight",
      status: "refused",
    });
    const res = await engageSpec.run({}, toolCtx<EngageAfter>(t));
    expect(res).toMatchObject({ reason: "in_flight", status: "REFUSED" });
  });
});
