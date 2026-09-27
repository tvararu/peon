import { describe, expect, jest, test } from "bun:test";
import type { TravelAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { travelSpec } from "#harness/tools/travel";
import {
  contentOf,
  driveGoto,
  MAP_ID,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const MCBRIDE = unitRow({
  distance: 60,
  guid: 0x10n,
  name: "Marshal McBride",
  relation: "friendly",
  roles: ["questgiver"],
  x: 60,
  y: 0,
});
const ROUTE = "stop: ambiguous ground column at route";
const CORNER = "stop: path corner disagrees with connected ground";
const ASK =
  'ask the human: "I cannot reach Marshal McBride from here. Is there another way?"';

async function world() {
  const t = await createTestRuntime();
  setSelf(t.handle, { x: 0, y: 0 });
  setUnits(t.handle, [MCBRIDE]);
  return t;
}

function movable(handle: MockHandle) {
  handle.walkToward = jest.fn(async () => ({
    pose: {
      mapId: MAP_ID,
      orientation: 0,
      source: "server" as const,
      updatedAt: 0,
      x: 0,
      y: 0,
      z: 0,
    },
    status: "completed" as const,
    traveled: 4.8,
  }));
}

function firstLine(res: ToolResult<TravelAfter>): string {
  return contentOf(res).split("\n")[0] ?? "";
}

type T = Awaited<ReturnType<typeof world>>;
const go = (t: T, to: string) =>
  travelSpec.run({ to }, toolCtx<TravelAfter>(t));

describe("travel route refusal recovery", () => {
  test.each([
    ["ambiguous_ground_column", ROUTE],
    ["path_corner_disagrees", CORNER],
  ])(
    "%s: unstick first, then a waypoint toward the goal, then the human",
    async (code, refuse) => {
      const t = await world();
      movable(t.handle);
      driveGoto(t.handle, [{ refuse }]);
      const first = await go(t, "Marshal McBride");
      expect(first).toMatchObject({
        next: 'travel(to: "unstick")',
        reason: code,
        status: "FAILED",
      });
      expect(firstLine(first)).toEndWith(
        'Tried: planner once. Not tried: travel(to: "unstick"), a waypoint toward the goal.',
      );
      const again = await go(t, "Marshal McBride");
      expect(again.next).toBe('travel(to: "unstick")');
      const unstuck = await go(t, "unstick");
      expect(unstuck.next).toBe('travel(to: "Marshal McBride")');
      driveGoto(t.handle, [{ refuse }]);
      const second = await go(t, "Marshal McBride");
      expect(second.next).toBe('travel(to: "25, 0")');
      expect(firstLine(second)).toEndWith(
        'Tried: planner once, travel(to: "unstick"). Not tried: a waypoint toward the goal.',
      );
      const third = await go(t, "25, 0");
      expect(third.next).toBe(ASK);
      expect(firstLine(third)).toEndWith(
        'Tried: planner once, travel(to: "unstick"), travel(to: "25, 0"). Not tried: another destination.',
      );
    },
  );

  test("a waypoint that arrives names the goal again", async () => {
    const t = await world();
    movable(t.handle);
    driveGoto(t.handle, [{ refuse: ROUTE }]);
    await go(t, "Marshal McBride");
    await go(t, "unstick");
    await go(t, "Marshal McBride");
    driveGoto(t.handle, [{ arrive: { x: 25, y: 0 } }]);
    const reached = await go(t, "25, 0");
    expect(reached).toMatchObject({
      next: 'travel(to: "Marshal McBride")',
      status: "DONE",
    });
    driveGoto(t.handle, [{ refuse: ROUTE }]);
    const last = await go(t, "Marshal McBride");
    expect(last.next).toBe(ASK);
  });

  test("a new goal starts the ladder again", async () => {
    const t = await world();
    movable(t.handle);
    driveGoto(t.handle, [{ refuse: ROUTE }]);
    await go(t, "Marshal McBride");
    await go(t, "unstick");
    const other = await go(t, "40, 40");
    expect(other.next).toBe('travel(to: "unstick")');
  });

  test("after unstick, other refusals list unstick as tried", async () => {
    const t = await world();
    movable(t.handle);
    driveGoto(t.handle, [{ refuse: "stop: ground corridor collision" }]);
    const first = await go(t, "Marshal McBride");
    expect(firstLine(first)).toContain('Not tried: travel(to: "unstick")');
    await go(t, "unstick");
    const second = await go(t, "Marshal McBride");
    expect(firstLine(second)).toEndWith(
      'Tried: planner once, travel(to: "unstick"). Not tried: a waypoint toward the goal.',
    );
    expect(second.next).toBe(ASK);
  });
});
