import { expect, jest, test } from "bun:test";
import type { TravelAfter } from "#harness/contract/details";
import { YIELD_AFTER_MS } from "#harness/runs/wait";
import { travelSpec } from "#harness/tools/travel";
import {
  contentOf,
  driveGoto,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

test("G2.5: a run tool past 120 s returns RUNNING with the design text and the run goes on", async () => {
  jest.useFakeTimers();
  try {
    const t = await createTestRuntime();
    setSelf(t.handle, { x: 0, y: 0 });
    setUnits(t.handle, [
      unitRow({
        distance: 400,
        guid: 0x10n,
        name: "Magistrix Erona",
        relation: "friendly",
        x: 400,
        y: 0,
      }),
    ]);
    driveGoto(t.handle, [{ hold: true }]);
    let done = false;
    const pending = travelSpec
      .run({ to: "Magistrix Erona" }, toolCtx<TravelAfter>(t))
      .finally(() => {
        done = true;
      });
    for (let s = 0; s < 119 && !done; s += 1) {
      jest.advanceTimersByTime(1000);
      await flush();
    }
    expect(done).toBe(false);
    for (let s = 119; s < 125 && !done; s += 1) {
      jest.advanceTimersByTime(1000);
      await flush();
    }
    expect(YIELD_AFTER_MS).toBe(120_000);
    const res = await pending;
    const id = res.runId ?? "";
    expect(res.status).toBe("RUNNING");
    expect(res.body).toEqual([]);
    expect(res.detail).toBe(
      "travel to Magistrix Erona (u1), 0 yd walked, 400 yd to go. You: HP 200/200, mana 100%, at 0, 0.",
    );
    expect(res.next).toBe(
      `end your turn; a [game] message comes when ${id} ends. Or stop(run: "${id}").`,
    );
    expect(contentOf(res)).toStartWith(
      `RUNNING ${id}: travel to Magistrix Erona`,
    );
    expect(limitProblem(contentOf(res))).toBeUndefined();
    expect(t.rt.runs.active()).toMatchObject({ awaited: false, id });
    t.rt.runs.cancel(id, "tool");
  } finally {
    jest.useRealTimers();
  }
});
