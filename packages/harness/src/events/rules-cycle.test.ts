import { describe, expect, test } from "bun:test";
import type { RunRecord } from "#harness/contract/runs";
import { runDrafts } from "#harness/events/rules";
import { cycleDrafts } from "#harness/events/rules-combat";
import type { CycleEvent, CycleState } from "#harness/loops/encounter-cycle";
import { createMockGame } from "#test-support/mock-game";
import { testRuleInput } from "#test-support/rule-fixtures";

const base = createMockGame().getCycleState();

function step(
  type: CycleEvent["type"],
  over: Partial<CycleState> = {},
): CycleEvent {
  return { at: 0, state: { ...base, ...over }, type };
}

const engage: RunRecord = {
  args: { count: 5 },
  awaited: true,
  endedAt: undefined,
  id: "r1",
  kind: "engage",
  progress: undefined,
  reason: undefined,
  startedAt: 0,
  status: "running",
  summary: undefined,
  toolCallId: "call-1",
};

function texts(events: CycleEvent[], rc = testRuleInput({ runActive: true })) {
  return events.flatMap((event) =>
    cycleDrafts(event, rc).map((draft) => draft.text),
  );
}

describe("cycle progress across top-ups", () => {
  test("a second cycle in the same run counts on from the first", () => {
    expect(
      texts([
        step("started", { maxStarts: 5 }),
        step("target_done", { maxStarts: 5, startsUsed: 4 }),
        step("stopped", { maxStarts: 5, startsUsed: 4 }),
        step("started", { maxStarts: 2 }),
        step("target_done", { maxStarts: 2, startsUsed: 1 }),
        step("target_done", { maxStarts: 2, startsUsed: 2 }),
      ]),
    ).toEqual([
      "cycle target done (4 of 5 fights)",
      "cycle target done (5 of 6 fights)",
      "cycle target done (6 of 6 fights)",
    ]);
  });

  test("a new run starts the count again", () => {
    const rc = testRuleInput({ runActive: true });
    texts(
      [
        step("started", { maxStarts: 3 }),
        step("target_done", { maxStarts: 3, startsUsed: 3 }),
        step("stopped", { maxStarts: 3, startsUsed: 3 }),
      ],
      rc,
    );
    runDrafts({ record: { ...engage, id: "r2" }, type: "started" }, rc);
    expect(
      texts(
        [
          step("started", { maxStarts: 3 }),
          step("target_done", { maxStarts: 3, startsUsed: 1 }),
        ],
        rc,
      ),
    ).toEqual(["cycle target done (1 of 3 fights)"]);
  });

  test("a cycle outside any run starts from zero", () => {
    const rc = testRuleInput({ runActive: true });
    texts(
      [
        step("started", { maxStarts: 2 }),
        step("target_done", { maxStarts: 2, startsUsed: 2 }),
        step("stopped", { maxStarts: 2, startsUsed: 2 }),
      ],
      rc,
    );
    expect(
      texts(
        [
          step("started", { maxStarts: 2 }),
          step("target_done", { maxStarts: 2, startsUsed: 1 }),
        ],
        { ...rc, runActive: false },
      ),
    ).toEqual(["cycle target done (1 of 2 fights)"]);
  });
});
