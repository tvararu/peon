import { expect, test } from "bun:test";
import type { ControlState, NearbyRow } from "@peon/core";
import { PilotActions } from "#harness/loops/pilot-actions";
import type { PilotContext } from "#harness/loops/pilot-types";
import { MAP_ID, unitRow } from "#test-support/ops-fixtures";

const context: PilotContext = {
  instruction: "reach the goal",
  objective: { kind: "reach", x: 60, y: 0 },
};

function state(): ControlState {
  return {
    airborne: false,
    blockedReason: undefined,
    input: {},
    movementAllowed: true,
    mover: undefined,
    moving: false,
    pose: {
      mapId: MAP_ID,
      orientation: 0,
      source: "server",
      updatedAt: 0,
      x: 0,
      y: 0,
      z: 0,
    },
    requestedTarget: undefined,
    selfGuid: 1n,
    serverPose: undefined,
    speed: 7,
    target: undefined,
  };
}

function rows(): NearbyRow[] {
  const self = {
    ...unitRow({ distance: 0, guid: 1n, level: 10, name: "Self", x: 0, y: 0 }),
    self: true,
  };
  const grays = Array.from({ length: 5 }, (_, index) =>
    unitRow({
      distance: 1 + index * 0.2,
      guid: BigInt(index + 2),
      level: 4,
      name: "Harmless Rat",
      x: 0,
      y: 1 + index * 0.2,
    }),
  );
  const camp = unitRow({
    distance: 22.5,
    guid: 9n,
    level: 10,
    name: "Defias Bandit",
    x: 22.5,
    y: 0,
  });
  return [self, ...grays, camp];
}

test("five harmless creatures nearby do not hide an aggressive creature's range from the pilot", () => {
  const actions = new PilotActions({
    control: {
      drive() {},
      face() {},
      halt() {},
      jump() {},
      settle() {},
      snapshot: state,
    },
    ground: undefined,
    life: () => "alive",
    nearby: rows,
  });
  const ids = actions.observe(context).candidates.map((option) => option.id);
  expect(ids).not.toContain("run_ahead");
  expect(ids).toContain("stop");
});
