import { describe, expect, test } from "bun:test";
import type { TravelAfter } from "#harness/contract/details";
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

const NO_MAP = "stop: unsupported map 0 (only Expansion01/530)";
const MAP_ASK =
  'ask the human: "This map has no navigation data, so I cannot walk to Innkeeper Farley. Can you move me there?"';

async function world() {
  const t = await createTestRuntime();
  setSelf(t.handle, { x: 0, y: 0 });
  setUnits(t.handle, [
    unitRow({
      distance: 40,
      guid: 0x18n,
      name: "Innkeeper Farley",
      relation: "friendly",
      roles: ["innkeeper"],
      x: 40,
      y: 0,
    }),
  ]);
  return t;
}

describe("travel after a structural failure", () => {
  test("an unsupported map offers no travel step and asks the human", async () => {
    const t = await world();
    driveGoto(t.handle, [{ refuse: NO_MAP }]);
    const res = await travelSpec.run(
      { to: "Innkeeper Farley" },
      toolCtx<TravelAfter>(t),
    );
    const text = contentOf(res);
    expect(limitProblem(text)).toBeUndefined();
    expect(res.next).toBe(MAP_ASK);
    expect(text).not.toContain("travel(");
    expect(res.detail).toBe(
      "unsupported map 0 (only Expansion01/530). Walked 0 yd. Tried: planner once. This map has no navigation data, so no travel can work here.",
    );
  });

  test("explore on an unsupported map asks the human", async () => {
    const t = await world();
    driveGoto(t.handle, [{ refuse: NO_MAP }]);
    const res = await travelSpec.run(
      { to: "explore north" },
      toolCtx<TravelAfter>(t),
    );
    expect(res.next).toBe(
      'ask the human: "This map has no navigation data, so I cannot walk anywhere. Can you move me?"',
    );
    expect(contentOf(res)).not.toContain("travel(");
  });

  test("every explore leg refused the same way from the start tries to move off, then asks", async () => {
    const t = await world();
    driveGoto(t.handle, [
      { refuse: "wait: position disagrees with ground height" },
    ]);
    const res = await travelSpec.run(
      { to: "explore north" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'ask the human: "I am stuck. Can you move me?"',
      reason: "obstructed",
      status: "PARTLY",
    });
    expect(res.detail).toBe(
      "explored 0 yd north; 3 legs were blocked, each by the same fault where you stand (position_disagrees_with). Moving off this spot also failed. Nothing new in view.",
    );
  });
});
