import { describe, expect, jest, test } from "bun:test";
import type { AreaState } from "@peon/core";
import type { LookAfter } from "#harness/contract/details";
import { placeView, selfView } from "#harness/ops/views";
import { selfLine, talentView } from "#harness/tools/look-self";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { selfPose, selfRow, setWorld } from "#test-support/world-fixtures";

const NOW = 1_000_000;

async function lineFor(
  standState: AreaState<"selfstate">["standState"],
  mounted = false,
) {
  const { handle, rt } = await createTestRuntime({
    parts: { clock: { now: () => NOW } },
  });
  setWorld(handle, { pose: selfPose(NOW), rows: [selfRow()] });
  jest.spyOn(handle.selfstate, "state").mockReturnValue({
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
    mountDisplayId: 0,
    mounted,
    selfResSpell: 0,
    standState,
    timers: {},
  });
  const ctx = { handle, rt };
  return selfLine({ place: placeView(ctx), self: selfView(ctx) });
}

describe("selfLine posture", () => {
  test("says sitting, kneeling or sleeping before the combat word", async () => {
    expect(await lineFor("sit")).toContain("alive, sitting, not in combat.");
    expect(await lineFor("sit_chair")).toContain(
      "alive, sitting, not in combat.",
    );
    expect(await lineFor("kneel")).toContain("alive, kneeling, not in combat.");
    expect(await lineFor("sleep")).toContain("alive, sleeping, not in combat.");
  });

  test("says nothing for standing, dead and unknown", async () => {
    for (const state of ["stand", "dead", undefined] as const)
      expect(await lineFor(state)).toContain("alive, not in combat.");
  });

  test("says mounted after the combat word only while mounted", async () => {
    expect(await lineFor("stand", true)).toContain(
      "alive, not in combat, mounted.",
    );
    expect(await lineFor("stand")).not.toContain("mounted");
  });
});

describe("selfLine talent points", () => {
  test("appends the free-points sentence after the pose text", async () => {
    const t = await createTestRuntime({
      parts: { clock: { now: () => NOW } },
    });
    const ctx = toolCtx<LookAfter>(t);
    const { handle } = t;
    setWorld(handle, { pose: selfPose(NOW), rows: [selfRow()] });
    const real = handle.talents.state();
    jest.spyOn(handle.talents, "state").mockReturnValue({
      ...real,
      fields: { ...real.fields, freePoints: 3 },
    });
    const after = {
      place: placeView(ctx),
      self: selfView(ctx),
      ...talentView(ctx),
    };
    expect(selfLine(after)).toContain("3 talent points free.");
  });
});
