import { describe, expect, test } from "bun:test";
import type { GameLogEntry } from "#harness/contract/log";
import { explore } from "#harness/ops/explore";
import { travelLeg } from "#harness/ops/travel-leg";
import {
  driveGoto,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type TestRuntime,
} from "#test-support/runtime-fixture";

function navRows(t: TestRuntime): GameLogEntry[] {
  return t.rt.log.since(0).filter((row) => row.domain === "nav");
}

function marniel(t: TestRuntime): void {
  setUnits(t.handle, [
    unitRow({
      distance: 30,
      guid: 0x10n,
      name: "Marniel Amberlight",
      relation: "friendly",
      x: 30,
      y: 0,
      z: 72.7,
    }),
  ]);
}

const MARNIEL = {
  guid: 0x10n,
  kind: "unit",
  name: "Marniel Amberlight",
} as const;

describe("nav rows from travelLeg", () => {
  test("an arrived leg writes route_start and route_end with the run id", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    driveGoto(t.handle, [{ arrive: { x: 10, y: 0 } }]);
    const run = t.rt.runs.start({
      args: {},
      kind: "travel",
      launch: async () => {
        await travelLeg(toolCtx(t), {
          goal: { kind: "point", x: 10, y: 0 },
          within: 1,
        });
        return { status: "succeeded", summary: "ok", value: undefined };
      },
      toolCallId: "c1",
    });
    await run.done;
    const rows = navRows(t);
    expect(rows.map((row) => row.event)).toEqual([
      "nav/route_start",
      "nav/route_end",
    ]);
    expect(rows[0]).toMatchObject({
      class: "log",
      data: { goal: "10, 0", runId: run.id, status: "started", traveledYd: 0 },
      runId: run.id,
      text: "Route to 10, 0 started.",
    });
    expect(rows[1]).toMatchObject({
      data: { goal: "10, 0", runId: run.id, status: "arrived", traveledYd: 10 },
      runId: run.id,
      text: "Route to 10, 0 ended: arrived after 10 yd.",
    });
  });

  test("a refusal writes nav/refused with reason, floors and next step", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    marniel(t);
    driveGoto(t.handle, [
      {
        floors: [72.6, 72.8],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
    ]);
    await travelLeg(toolCtx(t), { goal: MARNIEL, within: 3 });
    const rows = navRows(t);
    expect(rows.map((row) => row.event)).toEqual([
      "nav/route_start",
      "nav/refused",
    ]);
    expect(rows[1]).toMatchObject({
      data: {
        floors: [72.6, 72.8],
        goal: "Marniel Amberlight",
        reason: "ambiguous_floor",
        status: "refused",
        traveledYd: 0,
      },
      guid: "10",
      text: "Route to Marniel Amberlight refused (ambiguous_floor).",
    });
    expect(rows[1]?.data).toHaveProperty("nextStep");
    expect(rows[1]?.runId).toBeUndefined();
  });

  test("a floor retry writes route_replaced before the second route ends", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    marniel(t);
    driveGoto(t.handle, [
      {
        floors: [72.6, 80.1],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
      { arrive: { x: 30, y: 0, z: 72.6 } },
    ]);
    await travelLeg(toolCtx(t), { goal: MARNIEL, within: 3 });
    const rows = navRows(t);
    expect(rows.map((row) => row.event)).toEqual([
      "nav/route_start",
      "nav/refused",
      "nav/route_replaced",
      "nav/route_end",
    ]);
    expect(rows[2]).toMatchObject({
      data: {
        floors: [72.6, 80.1],
        goal: "30, 0, 72.6",
        reason: "floor_retry",
        status: "replaced",
      },
      text: "Route to Marniel Amberlight replaced by 30, 0, 72.6 (floor_retry).",
    });
    expect(rows[3]).toMatchObject({
      data: { goal: "30, 0, 72.6", status: "arrived" },
    });
  });

  test("a stopped leg ends with its cancel status and reason", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    driveGoto(t.handle, [{ hold: true }]);
    const stop = new AbortController();
    const pending = travelLeg(toolCtx(t, stop.signal), {
      goal: { kind: "point", x: 50, y: 0 },
      within: 1,
    });
    stop.abort(new Error("human_stop"));
    await pending;
    expect(navRows(t)[1]).toMatchObject({
      data: { reason: "human_stop", status: "cancelled" },
      event: "nav/route_end",
      text: "Route to 50, 0 ended: cancelled (human_stop) after 0 yd.",
    });
  });

  test("a goal already in range writes no route rows", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle);
    driveGoto(t.handle, [{}]);
    await travelLeg(toolCtx(t), {
      goal: { kind: "point", x: 0.5, y: 0 },
      within: 1,
    });
    expect(navRows(t)).toEqual([]);
  });

  test("explore legs inside a travel run each write a start, a floor retry and a refusal", async () => {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    driveGoto(t.handle, [
      {
        floors: [10, 14],
        refuse: "pick_destination: ambiguous ground column at destination",
      },
    ]);
    const run = t.rt.runs.start({
      args: { to: "explore north" },
      kind: "travel",
      launch: async () => {
        await explore(toolCtx(t), { direction: "N" });
        return { status: "failed", summary: "obstructed", value: undefined };
      },
      toolCallId: "c1",
    });
    await run.done;
    const rows = navRows(t);
    const leg = [
      "nav/route_start",
      "nav/refused",
      "nav/route_replaced",
      "nav/refused",
    ] as const;
    expect(rows.map((row) => row.event)).toEqual([...leg, ...leg, ...leg]);
    expect(rows.every((row) => row.runId === run.id)).toBe(true);
    expect(rows[1]?.data).toMatchObject({
      floors: [10, 14],
      goal: "20, 0",
      reason: "ambiguous_floor",
    });
    expect(rows[2]?.data).toMatchObject({
      floors: [10, 14],
      goal: "20, 0, 10",
      reason: "floor_retry",
      status: "replaced",
    });
    expect(rows[3]?.data).toMatchObject({
      goal: "20, 0, 10",
      reason: "ambiguous_floor",
    });
  });
});
