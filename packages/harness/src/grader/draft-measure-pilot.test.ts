import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { scratchDir } from "@peon/core/test-support/scratch";
import { observedChecks } from "#harness/grader/draft-fill";
import type { ScenarioCheck } from "#harness/grader/scenarios";

const T0 = 1_790_494_000_000;

type Extra = { ts?: number };

const row = (
  seq: number,
  event: string,
  data: Record<string, unknown>,
  { ts = T0 + seq * 1000 }: Extra = {},
) =>
  JSON.stringify({
    char: "Fevala",
    class: "passive",
    data,
    domain: event.split("/")[0],
    event,
    seq,
    text: `${event} ${seq}`,
    ts,
    v: 1,
  });

type Files = {
  gamelog: string[];
  jev?: unknown[];
  packets?: unknown[];
};

async function fill({ gamelog, jev, packets }: Files, wanted: ScenarioCheck) {
  const dir = scratchDir("pilot-measure");
  await writeFile(`${dir}/gamelog.jsonl`, `${gamelog.join("\n")}\n`);
  if (jev !== undefined)
    await writeFile(
      `${dir}/jev.jsonl`,
      `${jev.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    );
  if (packets !== undefined)
    await writeFile(
      `${dir}/packets.jsonl`,
      `${packets.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
    );
  const [filled] = await observedChecks(dir, [wanted]);
  if (filled === undefined) throw new Error("missing check");
  return filled;
}

const check = (measure: ScenarioCheck["measure"]) =>
  ({
    expect: measure,
    id: measure,
    measure,
    source: "game_log",
  }) as ScenarioCheck;

const started = (seq: number, objective: Record<string, unknown>) =>
  row(seq, "pilot/started", { objective, runId: "r1", x: 0, y: 0, z: 0 });
const decision = (seq: number, x: number, y: number) =>
  row(seq, "pilot/decision", {
    action: "run_ahead",
    airborne: false,
    call: 1,
    runId: "r1",
    x,
    y,
    z: 0,
  });
const ended = (seq: number, status: string) =>
  row(seq, "pilot/ended", {
    decisions: 2,
    jumps: 0,
    reason: status === "completed" ? "lap done" : "interrupted",
    runId: "r1",
    status,
    walkedYd: 120,
  });
const correction = (seq: number) => row(seq, "control/server_correction", {});

const circle = {
  direction: "clockwise",
  kind: "circle",
  radius: 20,
  x: 0,
  y: 0,
};

describe("pilot_circle", () => {
  test("passes when every decision rides the ring", async () => {
    const filled = await fill(
      {
        gamelog: [
          started(1, circle),
          decision(2, 20, 0),
          decision(3, 0, 20),
          ended(4, "completed"),
        ],
      },
      check("pilot_circle"),
    );
    expect(filled.met).toBe(true);
  });

  test("passes on the tolerance edge and fails just past it", async () => {
    const edge = await fill(
      {
        gamelog: [
          started(1, circle),
          decision(2, 25, 0),
          decision(3, 15, 0),
          ended(4, "completed"),
        ],
      },
      check("pilot_circle"),
    );
    expect(edge.met).toBe(true);
    const outside = await fill(
      {
        gamelog: [
          started(1, circle),
          decision(2, 25.1, 0),
          decision(3, 20, 0),
          ended(4, "completed"),
        ],
      },
      check("pilot_circle"),
    );
    expect(outside.met).toBe(false);
    const inside = await fill(
      {
        gamelog: [
          started(1, circle),
          decision(2, 14.9, 0),
          ended(3, "completed"),
        ],
      },
      check("pilot_circle"),
    );
    expect(inside.met).toBe(false);
  });

  test("fails without completion, decisions or a ring", async () => {
    const stopped = await fill(
      {
        gamelog: [started(1, circle), decision(2, 20, 0), ended(3, "stopped")],
      },
      check("pilot_circle"),
    );
    expect(stopped.met).toBe(false);
    const empty = await fill(
      { gamelog: [started(1, circle), ended(2, "completed")] },
      check("pilot_circle"),
    );
    expect(empty.met).toBe(false);
    const missing = await fill(
      { gamelog: [decision(1, 20, 0)] },
      check("pilot_circle"),
    );
    expect(missing.met).toBe(false);
  });
});

describe("pilot_reach", () => {
  const goal = { kind: "reach", x: 100, y: 0 };

  test("passes when completed with no correction", async () => {
    const filled = await fill(
      {
        gamelog: [
          started(1, goal),
          decision(2, 50, 0),
          decision(3, 100, 0),
          ended(4, "completed"),
        ],
      },
      check("pilot_reach"),
    );
    expect(filled.met).toBe(true);
    expect(filled.observed).toMatchObject({
      corrections: 0,
      decisions: 2,
      finalDistance: 0,
    });
  });

  test("fails on a correction or a non-completed ending", async () => {
    const corrected = await fill(
      {
        gamelog: [
          started(1, goal),
          decision(2, 100, 0),
          correction(3),
          ended(4, "completed"),
        ],
      },
      check("pilot_reach"),
    );
    expect(corrected.met).toBe(false);
    const stopped = await fill(
      {
        gamelog: [started(1, goal), decision(2, 100, 0), ended(3, "stopped")],
      },
      check("pilot_reach"),
    );
    expect(stopped.met).toBe(false);
  });
});

const applied = (ts: number) => ({
  actionId: "jump_ahead",
  loop: "pilot",
  ts,
  type: "applied",
});
const jumpPacket = (at: number) => ({
  at,
  dir: "out",
  opcode: "MSG_MOVE_JUMP",
  size: 8,
});
const landPacket = (at: number) => ({
  at,
  dir: "out",
  opcode: "MSG_MOVE_FALL_LAND",
  size: 8,
});

describe("pilot_jumps", () => {
  const goal = { kind: "reach", x: 100, y: 0 };

  test("passes when each jump follows an applied jump_ahead and lands", async () => {
    const filled = await fill(
      {
        gamelog: [
          started(1, goal),
          decision(2, 10, 0),
          decision(3, 20, 0),
          ended(4, "completed"),
        ],
        jev: [applied(T0 + 1500), applied(T0 + 2500)],
        packets: [
          jumpPacket(T0 + 1500),
          landPacket(T0 + 1800),
          jumpPacket(T0 + 2500),
          landPacket(T0 + 2800),
        ],
      },
      check("pilot_jumps"),
    );
    expect(filled.met).toBe(true);
    expect(filled.observed).toMatchObject({
      appliedJumps: 2,
      jumps: 2,
      landings: 2,
    });
  });

  test("fails when a jump has no applied jump_ahead near it", async () => {
    const filled = await fill(
      {
        gamelog: [started(1, goal), decision(2, 10, 0), ended(3, "completed")],
        jev: [applied(T0 + 2500)],
        packets: [jumpPacket(T0 + 1500), landPacket(T0 + 1800)],
      },
      check("pilot_jumps"),
    );
    expect(filled.met).toBe(false);
  });

  test("passes when the applied row lands just after the packet", async () => {
    const filled = await fill(
      {
        gamelog: [started(1, goal), decision(2, 10, 0), ended(3, "completed")],
        jev: [applied(T0 + 1505)],
        packets: [jumpPacket(T0 + 1500), landPacket(T0 + 1800)],
      },
      check("pilot_jumps"),
    );
    expect(filled.met).toBe(true);
  });

  test("passes when the run ends at the goal before the jump lands", async () => {
    const filled = await fill(
      {
        gamelog: [started(1, goal), decision(2, 10, 0), ended(3, "completed")],
        jev: [applied(T0 + 2800)],
        packets: [jumpPacket(T0 + 2800), landPacket(T0 + 3650)],
      },
      check("pilot_jumps"),
    );
    expect(filled.met).toBe(true);
  });

  test("grades the run that jumped when the agent calls pilot again at the goal", async () => {
    const again = { objective: goal, runId: "r2", x: 100, y: 0, z: 0 };
    const filled = await fill(
      {
        gamelog: [
          started(1, goal),
          decision(2, 10, 0),
          ended(3, "completed"),
          row(5, "pilot/started", again),
          row(6, "pilot/ended", { runId: "r2", status: "completed" }),
        ],
        jev: [applied(T0 + 2500)],
        packets: [jumpPacket(T0 + 2500), landPacket(T0 + 2900)],
      },
      check("pilot_jumps"),
    );
    expect(filled.met).toBe(true);
  });

  test("fails when two jumps share one applied row", async () => {
    const filled = await fill(
      {
        gamelog: [started(1, goal), decision(2, 10, 0), ended(3, "completed")],
        jev: [applied(T0 + 1500)],
        packets: [
          jumpPacket(T0 + 1500),
          landPacket(T0 + 1800),
          jumpPacket(T0 + 2500),
          landPacket(T0 + 2800),
        ],
      },
      check("pilot_jumps"),
    );
    expect(filled.met).toBe(false);
  });

  test("fails on a missing landing, a correction or missing inputs", async () => {
    const noLanding = await fill(
      {
        gamelog: [started(1, goal), ended(2, "completed")],
        jev: [applied(T0 + 1500)],
        packets: [jumpPacket(T0 + 1500)],
      },
      check("pilot_jumps"),
    );
    expect(noLanding.met).toBe(false);
    const corrected = await fill(
      {
        gamelog: [started(1, goal), correction(2), ended(3, "completed")],
        jev: [applied(T0 + 1500)],
        packets: [jumpPacket(T0 + 1500), landPacket(T0 + 1800)],
      },
      check("pilot_jumps"),
    );
    expect(corrected.met).toBe(false);
    const noPackets = await fill(
      {
        gamelog: [started(1, goal), ended(2, "completed")],
        jev: [applied(T0 + 1500)],
      },
      check("pilot_jumps"),
    );
    expect(noPackets.met).toBe(false);
  });
});

const runStarted = (seq: number, kind: string) =>
  row(seq, "run/started", { id: `r${seq}`, kind, status: "running" });

describe("pilot_only_moves", () => {
  const goal = { kind: "reach", x: 100, y: 0 };

  test("passes when no other movement run starts before the pilot run ends", async () => {
    const filled = await fill(
      {
        gamelog: [
          started(1, goal),
          decision(2, 10, 0),
          ended(3, "completed"),
          runStarted(4, "engage"),
        ],
      },
      check("pilot_only_moves"),
    );
    expect(filled.met).toBe(true);
  });

  test("fails when another movement run starts before the pilot run ends, or no pilot ran", async () => {
    const travelled = await fill(
      {
        gamelog: [
          runStarted(1, "travel"),
          started(2, goal),
          decision(3, 10, 0),
          ended(4, "completed"),
        ],
      },
      check("pilot_only_moves"),
    );
    expect(travelled.met).toBe(false);
    const absent = await fill(
      { gamelog: [runStarted(1, "travel")] },
      check("pilot_only_moves"),
    );
    expect(absent.met).toBe(false);
  });
});
