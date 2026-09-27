import { expect, jest, test } from "bun:test";
import { GameOpcode } from "@peon/core/test-support/internals";
import { must } from "@peon/core/test-support/must";
import { walkTowardTarget } from "#harness/navigation/goto";
import { native, travelFixture } from "#test-support/navigation-fixtures";

const FLOOR = 70.34;

test("a walk to an ungrounded point is refused without cancelling manual motion", async () => {
  jest.useFakeTimers();
  try {
    const f = travelFixture(native({ findHeights: () => [FLOOR] }));
    const start = must(f.runtime.snapshot().pose);
    f.runtime.move("forward", 1000);
    const outcome = await f.handle.walkToward(
      { kind: "point", x: start.x + 2, y: start.y, z: FLOOR + 3 },
      2,
    );
    expect(outcome).toMatchObject({
      reason: "destination_not_grounded",
      status: "stopped",
      traveled: 0,
    });
    expect(f.runtime.snapshot().moving).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

test("a walk to a unit without navigation stops before any motion packet", async () => {
  const f = travelFixture(native());
  const deps = {
    ...f.deps,
    navigation: () => {
      throw new Error("missing_navigation");
    },
  };
  const before = f.sent.length;
  const outcome = await walkTowardTarget(
    deps,
    { guid: 0x99n, kind: "guid" },
    3,
  );
  expect(outcome).toMatchObject({
    pose: { source: "server" },
    reason: "missing_navigation",
    status: "stopped",
    traveled: 0,
  });
  const motion = f.sent
    .slice(before)
    .filter(
      (packet) =>
        packet.opcode === GameOpcode.MSG_MOVE_SET_FACING ||
        packet.opcode === GameOpcode.MSG_MOVE_START_FORWARD,
    );
  expect(motion).toEqual([]);
});
