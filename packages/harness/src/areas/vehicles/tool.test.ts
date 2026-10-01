import { describe, expect, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import {
  vehicleParams,
  vehicleSpec,
  vehicleTool,
} from "#harness/areas/vehicles/tool";
import type {
  VehicleAfter,
  VehicleArgs,
  VehicleOutcome,
} from "#harness/areas/vehicles/tool-types";
import {
  contentOf,
  driveGoto,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type TestRuntime,
} from "#test-support/runtime-fixture";
import { expectSendKind } from "#test-support/tool-harness";

type Outcome = VehicleOutcome;
type Call = { act: string; arg?: bigint | number };

const GRYPHON = 0x60n;
const PLAYER = 0x61n;
const OK: Outcome = { status: "ok" };

async function world(outcome: Outcome | Error = OK, distance = 3) {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance,
      guid: GRYPHON,
      name: "Wintergarde Gryphon",
      relation: "friendly",
      x: distance,
      y: 0,
    }),
    unitRow({
      distance: 6,
      guid: PLAYER,
      name: "Ilsa",
      player: true,
      relation: "friendly",
      x: 6,
      y: 0,
    }),
  ]);
  const calls: Call[] = [];
  const record =
    (act: string) =>
    async (arg?: bigint | number): Promise<Outcome> => {
      calls.push(arg === undefined ? { act } : { act, arg });
      if (outcome instanceof Error) throw outcome;
      return outcome;
    };
  Object.assign(t.handle.vehicles.act, {
    ejectPassenger: record("ejectPassenger"),
    enterPlayerVehicle: record("enterPlayerVehicle"),
    exitVehicle: record("exitVehicle"),
    nextSeat: record("nextSeat"),
    prevSeat: record("prevSeat"),
    spellClick: record("spellClick"),
    switchSeat: record("switchSeat"),
  });
  return { calls, t };
}

async function run(t: TestRuntime, args: VehicleArgs, signal?: AbortSignal) {
  return await vehicleSpec.run(args, toolCtx<VehicleAfter>(t, signal));
}

describe("vehicle tool spec", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: vehicleParams },
        {
          arguments: vehicleSpec.minimalArgs,
          id: "c1",
          name: "probe",
          type: "toolCall",
        },
      ),
    ).toEqual(vehicleSpec.minimalArgs);
  });

  test("expectSendKind accepts the tool kind", async () => {
    await expectSendKind(vehicleTool, { do: "leave" });
  });
});

describe("vehicle board", () => {
  test("clicks the named unit and reports the seat", async () => {
    const { calls, t } = await world();
    const res = await run(t, { do: "board", unit: "Wintergarde Gryphon" });
    expect(calls).toEqual([{ act: "spellClick", arg: GRYPHON }]);
    expect(res.status).toBe("DONE");
    expect(res.detail).toContain("Wintergarde Gryphon");
    expect(res.after).toMatchObject({ do: "board" });
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("a unit out of reach is walked to before the click", async () => {
    const { calls, t } = await world(OK, 20);
    const goTo = driveGoto(t.handle, [{ arrive: { x: 17, y: 0 } }]);
    await run(t, { do: "board", unit: "Wintergarde Gryphon" });
    expect(goTo).toHaveBeenCalledWith({ guid: GRYPHON, kind: "guid" });
    expect(calls).toEqual([{ act: "spellClick", arg: GRYPHON }]);
  });

  test("a failed walk throws and nothing is clicked", async () => {
    const { calls, t } = await world(OK, 20);
    driveGoto(t.handle, [{ refuse: "stop: unsupported map 0" }]);
    await expect(
      run(t, { do: "board", unit: "Wintergarde Gryphon" }),
    ).rejects.toMatchObject({ status: "FAILED" });
    expect(calls).toEqual([]);
  });

  test("no answer reads as no answer, never refused", async () => {
    const { t } = await world({ status: "no_answer" });
    const res = await run(t, { do: "board", unit: "Wintergarde Gryphon" });
    expect(res.status).toBe("UNCONFIRMED");
    expect(res.reason).toBe("no_answer");
    expect(res.detail.toLowerCase()).toContain("no answer");
    expect(res.detail.toLowerCase()).not.toContain("refused");
  });

  test("a refusal by the act is a REFUSED result with its reason", async () => {
    const { t } = await world({ reason: "not_clickable", status: "refused" });
    const failure = await run(t, {
      do: "board",
      unit: "Wintergarde Gryphon",
    }).catch((error: unknown) => error);
    expect(failure).toMatchObject({
      reason: "not_clickable",
      status: "REFUSED",
    });
  });

  test("a missing or unknown unit sends nothing", async () => {
    const { calls, t } = await world();
    await expect(run(t, { do: "board" })).rejects.toMatchObject({
      reason: "missing_target",
    });
    await expect(run(t, { do: "board", unit: "Nobody" })).rejects.toMatchObject(
      { reason: "not_seen" },
    );
    expect(calls).toEqual([]);
  });

  test("an abort while the click waits rejects the call", async () => {
    const { t } = await world();
    const never = new Promise<Outcome>(() => undefined);
    Object.assign(t.handle.vehicles.act, { spellClick: () => never });
    const abort = new AbortController();
    const pending = run(
      t,
      { do: "board", unit: "Wintergarde Gryphon" },
      abort.signal,
    );
    abort.abort();
    await expect(pending).rejects.toBeDefined();
  });
});

describe("vehicle leave, seat, ride_with and eject", () => {
  test("leave calls exitVehicle and a not-seated refusal is reported", async () => {
    const { calls, t } = await world();
    const res = await run(t, { do: "leave" });
    expect(calls).toEqual([{ act: "exitVehicle" }]);
    expect(res.status).toBe("DONE");
    const refused = await world({ reason: "not_seated", status: "refused" });
    await expect(run(refused.t, { do: "leave" })).rejects.toMatchObject({
      reason: "not_seated",
    });
  });

  test("seat next, prev and a number map to their acts, seat 0 included", async () => {
    const { calls, t } = await world();
    await run(t, { do: "seat", seat: "next" });
    await run(t, { do: "seat", seat: "prev" });
    await run(t, { do: "seat", seat: 0 });
    await run(t, { do: "seat", seat: 2 });
    expect(calls).toEqual([
      { act: "nextSeat" },
      { act: "prevSeat" },
      { act: "switchSeat", arg: 0 },
      { act: "switchSeat", arg: 2 },
    ]);
  });

  test("seat without a target seat sends nothing", async () => {
    const { calls, t } = await world();
    await expect(run(t, { do: "seat" })).rejects.toMatchObject({
      reason: "missing_seat",
    });
    expect(calls).toEqual([]);
  });

  test("ride_with resolves a player and eject a unit", async () => {
    const { calls, t } = await world();
    await run(t, { do: "ride_with", player: "Ilsa" });
    await run(t, { do: "eject", unit: "Ilsa" });
    expect(calls).toEqual([
      { act: "enterPlayerVehicle", arg: PLAYER },
      { act: "ejectPassenger", arg: PLAYER },
    ]);
  });

  test("ride_with and eject without their target send nothing", async () => {
    const { calls, t } = await world();
    await expect(run(t, { do: "ride_with" })).rejects.toMatchObject({
      reason: "missing_target",
    });
    await expect(run(t, { do: "eject" })).rejects.toMatchObject({
      reason: "missing_target",
    });
    expect(calls).toEqual([]);
  });

  test("an act that throws reaches the caller", async () => {
    const { t } = await world(new Error("link lost"));
    await expect(run(t, { do: "leave" })).rejects.toThrow("link lost");
  });
});
