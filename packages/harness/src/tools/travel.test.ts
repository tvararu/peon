import { describe, expect, jest, test } from "bun:test";
import type { TravelAfter } from "#harness/contract/details";
import type { ToolResult } from "#harness/contract/result";
import { travelSpec, travelTool } from "#harness/tools/travel";
import {
  attackBy,
  contentOf,
  die,
  driveGoto,
  limitProblem,
  MAP_ID,
  objectRow,
  setLife,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { createRefTable } from "#harness/ops/refs";
import { expectSendKind } from "#test-support/tool-harness";

const MARNIEL = unitRow({
  distance: 36,
  guid: 0x10n,
  name: "Marniel Amberlight",
  relation: "friendly",
  roles: ["vendor"],
  x: 36,
  y: 0,
});

function fit(res: ToolResult<TravelAfter>): string {
  const text = contentOf(res);
  return limitProblem(text) ?? text;
}

async function world() {
  const t = await createTestRuntime({ parts: { refs: createRefTable() } });
  setSelf(t.handle, { x: 0, y: 0 });
  setUnits(t.handle, [MARNIEL]);
  return t;
}

describe("travel", () => {
  test("arrives at a unit", async () => {
    const t = await world();
    driveGoto(t.handle, [{ arrive: { x: 34, y: 0 } }]);
    const res = await travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    expect(res.status).toBe("DONE");
    expect(fit(res)).toMatch(/^DONE arrived at Marniel Amberlight \(u\d+\): /);
    expect(res.runId).toBe(t.rt.runs.list()[0]?.id);
  });

  test("a snapped start fails with the unstick step and remembers the goal", async () => {
    const t = await world();
    driveGoto(t.handle, [
      { refuse: "stop: start snapped off the requested ground position" },
    ]);
    const res = await travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'travel(to: "unstick")',
      reason: "start_off_mesh",
      status: "FAILED",
    });
    expect(t.rt.travel.lastRefusedGoal).toBe("Marniel Amberlight");
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("no ground: fails with an ask-the-human step", async () => {
    const t = await world();
    driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)" },
    ]);
    const res = await travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({ reason: "no_ground", status: "FAILED" });
    expect(fit(res).split("\n")).toEqual([
      "FAILED no_ground: the path finder found no ground on the way (UNKNOWN_HEIGHT). Walked 0 yd. Tried: planner once.",
      'Next: ask the human: "I cannot reach Marniel Amberlight from here. Is there another way?"',
    ]);
  });

  test("no ground after a floor retry says the planner ran twice", async () => {
    const t = await world();
    setUnits(t.handle, [
      unitRow({
        distance: 36,
        guid: 0x10n,
        name: "Marniel Amberlight",
        relation: "friendly",
        x: 36,
        y: 0,
        z: 72.7,
      }),
    ]);
    driveGoto(t.handle, [
      {
        floors: [72.6, 80.1],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
      { refuse: "unreachable: pathfind_find_height failed (UNKNOWN_HEIGHT)" },
    ]);
    const res = await travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    expect(fit(res).split("\n")[0]).toBe(
      "FAILED no_ground: the path finder found no ground on the way (UNKNOWN_HEIGHT). Walked 0 yd. Tried: planner twice (floor retry).",
    );
  });

  const ASK =
    'Next: ask the human: "I cannot reach Marniel Amberlight from here. Is there another way?"';
  const HERE = 'Not tried: travel(to: "unstick"), a waypoint toward the goal.';
  const THERE = "Not tried: another destination.";

  test.each([
    {
      code: "no_path",
      lines: [
        `FAILED no_path: no route on the navigation mesh reaches the destination (UNKNOWN_PATH). Walked 0 yd. Tried: planner once. ${THERE}`,
        "The navigation mesh cannot reach this destination. Choose another destination; do not retry this one.",
        ASK,
      ],
      refuse: "unreachable: pathfind_find_path failed (UNKNOWN_PATH)",
    },
    {
      code: "surface_change",
      lines: [
        `FAILED surface_change: ground corridor changes surface. Walked 0 yd. Tried: planner once. ${HERE}`,
        "The route's ground changes to another surface on the way, such as a ramp onto a platform. Choose a nearer waypoint on the same floor or another destination; do not repeat this travel unchanged.",
        ASK,
      ],
      refuse: "stop: ground corridor changes surface",
    },
    {
      code: "path_corner_disagrees",
      lines: [
        `FAILED path_corner_disagrees: path corner disagrees with connected ground. Walked 0 yd. Tried: planner once. ${HERE}`,
        "A turn of the route is where the mesh and the ground heights do not agree, such as the edge of a step or a slope. Choose a nearer waypoint on open ground or another destination; do not repeat this travel unchanged.",
        'Next: travel(to: "unstick")',
      ],
      refuse: "stop: path corner disagrees with connected ground",
    },
    {
      code: "ground_corridor_collision",
      lines: [
        `FAILED ground_corridor_collision: ground corridor collision. Walked 0 yd. Tried: planner once. ${HERE}`,
        "A straight part of the route hits an object or a wall. Choose a nearer waypoint in open ground or another destination; do not repeat this travel unchanged.",
        ASK,
      ],
      refuse: "stop: ground corridor collision",
    },
  ])(
    "any other refusal ($code) gives core's step and what was not tried",
    async ({ code, lines, refuse }) => {
      const t = await world();
      driveGoto(t.handle, [{ refuse }]);
      const res = await travelSpec.run(
        { to: "Marniel Amberlight" },
        toolCtx<TravelAfter>(t),
      );
      expect(res).toMatchObject({ reason: code, status: "FAILED" });
      expect(fit(res).split("\n")).toEqual([...lines]);
    },
  );

  test.each([
    {
      height: "none is within 0.25 yd of Marniel Amberlight's height 0.0",
      next: 'travel(to: "36, 0, 72.6")',
      z: 0,
    },
    {
      height: "none is within 0.25 yd of Marniel Amberlight's height 77.0",
      next: 'travel(to: "36, 0, 80.1")',
      z: 77,
    },
  ])(
    "a unit on two floors with no match refuses with the floors ($next)",
    async ({ height, next, z }) => {
      const t = await world();
      setUnits(t.handle, [
        unitRow({
          distance: 36,
          guid: 0x10n,
          name: "Marniel Amberlight",
          relation: "friendly",
          x: 36,
          y: 0,
          z,
        }),
      ]);
      const goTo = driveGoto(t.handle, [
        {
          floors: [72.6, 80.1],
          refuse: "pick_destination: ambiguous ground column at destination",
        },
      ]);
      const res = await travelSpec.run(
        { to: "Marniel Amberlight" },
        toolCtx<TravelAfter>(t),
      );
      expect(goTo).toHaveBeenCalledTimes(1);
      expect(res).toMatchObject({
        options: [72.6, 80.1],
        reason: "ambiguous_floor",
        status: "REFUSED",
      });
      expect(fit(res).split("\n")).toEqual([
        `REFUSED ambiguous_floor: the ground at Marniel Amberlight (u1) has 2 floors: 72.6, 80.1, and ${height}. Tried: planner once. ${THERE}`,
        `Next: ${next}`,
      ]);
    },
  );

  test("coordinates on two floors refuse with the floors and a ready call", async () => {
    const t = await world();
    driveGoto(t.handle, [
      {
        floors: [72.6, 80.1],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
    ]);
    const res = await travelSpec.run(
      { to: "8764, -6683" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({
      options: [72.6, 80.1],
      reason: "ambiguous_floor",
      status: "REFUSED",
    });
    expect(res.next).toBe('travel(to: "8764, -6683, 80.1")');
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("coordinates on two floors retry on your floor, then offer the other one", async () => {
    const t = await world();
    setSelf(t.handle, { x: 0, y: 0, z: 79 });
    const goTo = driveGoto(t.handle, [
      {
        floors: [72.6, 80.1],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
    ]);
    const res = await travelSpec.run(
      { to: "8764, -6683" },
      toolCtx<TravelAfter>(t),
    );
    expect(goTo).toHaveBeenCalledTimes(2);
    expect(res.detail).toBe(
      "the ground at 8764, -6683 has 2 floors: 72.6, 80.1. Tried: planner twice (floor retry).",
    );
    expect(res.next).toBe('travel(to: "8764, -6683, 72.6")');
  });

  test("unstick names the refused goal as the next call", async () => {
    const t = await world();
    t.rt.travel.lastRefusedGoal = "u4";
    t.handle.walkToward = jest.fn(async () => ({
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
    const res = await travelSpec.run(
      { to: "unstick" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({ next: 'travel(to: "u4")', status: "DONE" });
    expect(fit(res)).toBe('DONE moved 4.8 yd.\nNext: travel(to: "u4")');
  });

  test("an unstick that moves 0 yd fails as stuck without the refused route", async () => {
    const t = await world();
    t.rt.travel.lastRefusedGoal = "u4";
    t.handle.walkToward = jest.fn(async () => ({
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
      traveled: 0,
    }));
    driveGoto(t.handle, [
      { refuse: "unreachable: pathfind_find_path failed (UNKNOWN_PATH)" },
    ]);
    const res = await travelSpec.run(
      { to: "unstick" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'ask the human: "I am stuck. Can you move me?"',
      reason: "stuck",
      status: "FAILED",
    });
    expect(contentOf(res)).not.toContain("u4");
  });

  test("a failed unstick asks the human to move you", async () => {
    const t = await world();
    t.handle.walkToward = jest.fn(async () => {
      throw new Error("the walk was blocked");
    });
    const res = await travelSpec.run(
      { to: "unstick" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({
      detail: "the walk was blocked",
      next: 'ask the human: "I am stuck. Can you move me?"',
      reason: "unstick_failed",
      status: "FAILED",
    });
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("an unknown direction refuses before any run", async () => {
    const t = await world();
    await expect(
      travelSpec.run({ to: "explore up" }, toolCtx<TravelAfter>(t)),
    ).rejects.toMatchObject({ reason: "bad_direction" });
    expect(t.rt.runs.list()).toHaveLength(0);
  });

  test("corpse while alive refuses", async () => {
    const t = await world();
    await expect(
      travelSpec.run({ to: "corpse" }, toolCtx<TravelAfter>(t)),
    ).rejects.toMatchObject({ reason: "alive" });
  });

  test("corpse as a ghost hands over to the recovery op", async () => {
    const t = await world();
    setLife(t.handle, "ghost");
    t.handle.recoverCorpse = async () => {
      setLife(t.handle, "alive");
      return { detail: { legs: 3 }, ok: true, outcome: "reclaimed" };
    };
    const res = await travelSpec.run({ to: "corpse" }, toolCtx<TravelAfter>(t));
    expect(res.status).toBe("DONE");
    expect(fit(res)).toStartWith(
      "DONE alive again near your corpse after 0.0 s. You: HP 200/200",
    );
  });

  test("human text yields RUNNING with vitals and pose; the run goes on", async () => {
    const t = await world();
    driveGoto(t.handle, [{ hold: true }]);
    const pending = travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    t.rt.yields.trigger();
    const res = await pending;
    const id = res.runId ?? "";
    expect(res.status).toBe("RUNNING");
    expect(res.detail).toContain(
      "You: HP 200/200, mana 300/300 (100%), at 0, 0.",
    );
    expect(res.body).toEqual([
      "The human wrote a message. Read it before you act.",
    ]);
    expect(res.next).toBe(
      `end your turn; a [game] message comes when ${id} ends. Or stop(run: "${id}").`,
    );
    expect(t.rt.runs.active()?.id).toBe(id);
    expect(limitProblem(contentOf(res))).toBeUndefined();
    t.rt.runs.cancel(id, "tool");
  });

  test("a new attacker interrupts the run", async () => {
    const t = await world();
    driveGoto(t.handle, [{ hold: true }]);
    const pending = travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    await Bun.sleep(0);
    attackBy(t.handle, 0x20n);
    const res = await pending;
    expect(res).toMatchObject({ reason: "interrupted", status: "FAILED" });
    expect(res.next).toMatch(/^engage\(target: "u\d+"\)$/);
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("a root interrupts the run with the look step", async () => {
    const t = await world();
    driveGoto(t.handle, [{ hold: true }]);
    const pending = travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    await Bun.sleep(0);
    t.handle.triggerControlEvent({
      state: { ...t.handle.getControlState(), blockedReason: "rooted" },
      type: "control_changed",
    });
    const res = await pending;
    expect(res).toMatchObject({
      next: "look()",
      reason: "interrupted",
      status: "FAILED",
    });
    expect(fit(res).split("\n")).toEqual([
      "FAILED interrupted: you cannot move (rooted). Walked 0 yd.",
      "Next: look()",
    ]);
  });

  test("death on the way fails with the recover step", async () => {
    const t = await world();
    driveGoto(t.handle, [{ hold: true }]);
    const pending = travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    await Bun.sleep(0);
    die(t.handle);
    const res = await pending;
    expect(res).toMatchObject({
      detail: "you died on the way.",
      next: "recover()",
      reason: "died",
      status: "FAILED",
    });
    expect(fit(res)).toStartWith("FAILED died: you died on the way.\n");
  });
  test("walks to a game object and stops in interaction range", async () => {
    const t = await world();
    setUnits(t.handle, [
      ...t.handle.queryNearby(),
      objectRow({
        distance: 36,
        guid: 0xf110_0000_0000_0070n,
        name: "Milly's Harvest",
        x: 36,
        y: 0,
      }),
    ]);
    t.rt.refs.refOf(0xf110_0000_0000_0070n);
    driveGoto(t.handle, [{ arrive: { x: 34, y: 0 } }]);
    const res = await travelSpec.run(
      { to: "Milly's Harvest" },
      toolCtx<TravelAfter>(t),
    );
    expect(res.status).toBe("DONE");
    expect(fit(res)).toMatch(/^DONE arrived at Milly's Harvest \(o1\): /);
    await expectSendKind(travelTool, { to: "Milly's Harvest" });
  });

  test("a human stop ends the run as cancelled", async () => {
    const t = await world();
    driveGoto(t.handle, [{ hold: true }]);
    const pending = travelSpec.run(
      { to: "Marniel Amberlight" },
      toolCtx<TravelAfter>(t),
    );
    await Bun.sleep(0);
    t.rt.runs.cancel(t.rt.runs.active()?.id ?? "", "human");
    const res = await pending;
    expect(res).toMatchObject({
      detail: "the human stopped you. Start nothing new.",
      next: "end your turn and wait for the human.",
      reason: "cancelled",
      status: "FAILED",
    });
  });
});
