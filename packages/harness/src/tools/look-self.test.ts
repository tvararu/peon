import { describe, expect, jest, test } from "bun:test";
import type { AreaState } from "@peon/core";
import { placeView, selfView } from "#harness/ops/views";
import { selfLine } from "#harness/tools/look-self";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { selfPose, selfRow, setWorld } from "#test-support/world-fixtures";

const NOW = 1_000_000;

async function lineFor(standState: AreaState<"selfstate">["standState"]) {
  const { handle, rt } = await createTestRuntime({
    parts: { clock: { now: () => NOW } },
  });
  setWorld(handle, { pose: selfPose(NOW), rows: [selfRow()] });
  jest.spyOn(handle.selfstate, "state").mockReturnValue({
    collisionHeight: undefined,
    ghostPending: false,
    lastTransferAbort: undefined,
    mountDisplayId: 0,
    mounted: false,
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
});
