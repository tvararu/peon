import { describe, expect, jest, test } from "bun:test";
import type { RunEnd } from "#harness/contract/runs";
import type { HarnessRuntime } from "#harness/contract/services";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createAttackLedger } from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { createRunRegistry } from "#harness/runs/registry";
import { stopTool } from "#harness/tools/stop";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";
import {
  nearbyRow,
  selfCombat,
  setWorld,
  unitEntity,
} from "#test-support/world-fixtures";

async function world() {
  const clock = { now: () => 1000 };
  const log = createGameLog({
    char: () => "Fgklibhlflc",
    clock,
    file: undefined,
  });
  const runs = createRunRegistry({
    clock,
    log,
    sink: createJsonlSink({ file: undefined }),
  });
  const parts = {
    attacks: createAttackLedger(clock),
    clock,
    log,
    refs: createRefTable(),
    runs,
  };
  const { handle, rt } = await createTestRuntime({ parts });
  setWorld(handle, { combat: { self: selfCombat({ health: 190 }) } });
  return { handle, rt, tool: stopTool.definition(rt) };
}

function startEngage(rt: HarnessRuntime) {
  return rt.runs.start({
    args: { target: "u9" },
    kind: "engage",
    launch: ({ progress, signal }) => {
      progress("1 of 3 kills");
      return new Promise<RunEnd<undefined>>((resolve) => {
        signal.addEventListener("abort", () =>
          resolve({
            reason: "stopped_by_tool",
            status: "cancelled",
            summary: "stopped",
            value: undefined,
          }),
        );
      });
    },
    toolCallId: "c0",
  });
}

describe("stop", () => {
  test("stops one run by id and halts", async () => {
    const { handle, rt, tool } = await world();
    const run = startEngage(rt);
    const out = await runTool(tool, { run: "r1" });
    for (const value of ["r1", "engage, 1 of 3 kills", "HP 190/217"])
      expect(out.text).toContain(value);
    expect(run.signal.aborted).toBe(true);
    expect((await run.done).status).toBe("cancelled");
    expect(handle.halt).toHaveBeenCalled();
    expect(handle.stopCycle).toHaveBeenCalled();
    expect(handle.stopAttack).toHaveBeenCalled();
  });

  test("stops everything by default", async () => {
    const { handle, rt, tool } = await world();
    startEngage(rt);
    const out = await runTool(tool, {});
    for (const value of ["r1", "1 of 3 kills", "HP 190/217"])
      expect(out.text).toContain(value);
    expect(handle.halt).toHaveBeenCalled();
  });

  test("says when nothing was running", async () => {
    const { tool } = await world();
    const out = await runTool(tool, {});
    expect(out.text).toContain("nothing was running");
    expect(out.text).toContain("HP 190/217");
  });

  test("refuses an unknown run id", async () => {
    const { tool } = await world();
    const out = await runTool(tool, { run: "r7" });
    expect(out.details.result).toMatchObject({
      next: "stop()",
      reason: "no_such_run",
      status: "REFUSED",
    });
    expect(out.text).toContain("r7");
  });

  test("keeps the danger line: stopping is not escaping", async () => {
    const { handle, tool } = await world();
    const stalker = nearbyRow(
      unitEntity({ guid: 0x50n, name: "Springpaw Stalker" }),
    );
    setWorld(handle, {
      combat: { attackers: [0x50n], self: selfCombat({ health: 190 }) },
      rows: [stalker],
    });
    const out = await runTool(tool, {});
    for (const value of [
      "Springpaw Stalker u1",
      "0 yd",
      "88% HP",
      "HP 190/217",
    ])
      expect(out.text).toContain(value);
    expect(out.details.result.after).toMatchObject({
      attackers: [{ ref: "u1" }],
      self: { hp: 190, maxHp: 217 },
    });
  });

  test("works while a human message waits", async () => {
    const { rt, tool } = await world();
    rt.session.humanWaiting = true;
    expect((await runTool(tool, {})).text).toStartWith("DONE ");
  });
});

test.each([
  { defs: false, expected: "spell 5143", name: "falls back to the spell id" },
  { defs: true, expected: "Mind Flay", name: "uses the looked-up spell name" },
])("a running channel $name in its detail", async ({ defs, expected }) => {
  const { handle, tool } = await world();
  if (defs)
    handle.spellDefinition = (id) =>
      id === 5143 ? ({ id, name: "Mind Flay" } as never) : undefined;
  const state = handle.spells.state();
  jest.spyOn(handle.spells, "state").mockImplementation(() => ({
    ...state,
    channel: {
      durationMs: 3000,
      endsAt: 4000,
      remainingMs: 3000,
      spellId: 5143,
      startedAt: 1000,
      target: undefined,
    },
  }));
  const out = await runTool(tool, {});
  expect(out.text).toContain(expected);
});
