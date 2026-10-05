import { describe, expect, test } from "bun:test";
import type { JevActionRequest } from "#harness/jev/contract";
import { createGreedySelect, greedyChoice } from "#harness/loops/pilot-greedy";

function candidate(
  id: string,
  goalDeg: number,
  turnDeg = 0,
): { id: string; description: string; goalDeg: number; turnDeg: number } {
  return { description: id, goalDeg, id, turnDeg };
}

function request(
  candidates: { id: string; description: string }[],
): JevActionRequest {
  return {
    candidates,
    instruction: "reach",
    observation: {},
  };
}

describe("greedy choice", () => {
  test("picks the smallest goal bearing", () => {
    expect(
      greedyChoice([
        candidate("turn_left", 40, 90),
        candidate("run_ahead", 5, 0),
        candidate("veer_right", 12, -30),
      ]),
    ).toBe("run_ahead");
  });

  test("ties prefer run_ahead, then the smaller turn", () => {
    expect(
      greedyChoice([
        candidate("veer_left", 10, 30),
        candidate("run_ahead", 10),
      ]),
    ).toBe("run_ahead");
    expect(
      greedyChoice([
        candidate("turn_left", 10, 90),
        candidate("veer_left", 10, 30),
      ]),
    ).toBe("veer_left");
  });

  test("never jumps unless it is the only non-stop move", () => {
    expect(
      greedyChoice([
        candidate("jump_ahead", 0, 0),
        candidate("run_ahead", 30, 0),
      ]),
    ).toBe("run_ahead");
    expect(greedyChoice([candidate("jump_ahead", 0, 0)])).toBe("jump_ahead");
  });

  test("stops only when nothing else is offered", () => {
    expect(
      greedyChoice([candidate("stop", 0, 0), candidate("run_ahead", 30, 0)]),
    ).toBe("run_ahead");
    expect(greedyChoice([candidate("stop", 0, 0)])).toBe("stop");
  });

  test("reports code:greedy with a measured elapsed time", async () => {
    const select = createGreedySelect();
    const result = await select(
      request([candidate("run_ahead", 5), candidate("stop", 0)]),
      { signal: AbortSignal.timeout(1000) },
    );
    expect(result.choice).toBe("run_ahead");
    expect(result.model).toBe("code:greedy");
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
