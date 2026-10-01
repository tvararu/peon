import { describe, expect, jest, test } from "bun:test";
import type { LookAfter } from "#harness/contract/details";
import { placeView, selfView } from "#harness/ops/views";
import { selfLine, talentView } from "#harness/tools/look-self";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { selfPose, selfRow, setWorld } from "#test-support/world-fixtures";

const NOW = 1_000_000;

type Points = { player?: number; field?: number };

async function viewFor({ field, player }: Points) {
  const t = await createTestRuntime({
    parts: { clock: { now: () => NOW } },
  });
  const ctx = toolCtx<LookAfter>(t);
  const { handle } = t;
  setWorld(handle, { pose: selfPose(NOW), rows: [selfRow()] });
  const real = handle.talents.state();
  jest.spyOn(handle.talents, "state").mockReturnValue({
    ...real,
    fields: { ...real.fields, freePoints: field },
    player:
      player === undefined
        ? undefined
        : {
            activeSpec: 0,
            freePoints: player,
            kind: "player",
            specCount: 1,
            specs: [{ glyphs: [], talents: [] }],
          },
  });
  const after = {
    place: placeView(ctx),
    self: selfView(ctx),
    ...talentView(ctx),
  };
  return { after, line: selfLine(after) };
}

describe("talent points in the self line", () => {
  test("says how many points are free when there are some", async () => {
    const { after, line } = await viewFor({ player: 3 });
    expect(after.talentPoints).toBe(3);
    expect(line).toContain("3 talent points free.");
  });

  test("uses the singular for one point", async () => {
    const { line } = await viewFor({ player: 1 });
    expect(line).toContain("1 talent point free.");
    expect(line).not.toContain("1 talent points");
  });

  test("falls back to the descriptor field without a player block", async () => {
    const { line } = await viewFor({ field: 2 });
    expect(line).toContain("2 talent points free.");
  });

  test("prefers the player block over the field", async () => {
    const { after } = await viewFor({ field: 5, player: 0 });
    expect(after.talentPoints ?? 0).toBe(0);
  });

  test("says nothing at zero or unknown points", async () => {
    for (const points of [{ player: 0 }, {}]) {
      const { after, line } = await viewFor(points);
      expect(after.talentPoints ?? 0).toBe(0);
      expect(line).not.toContain("talent point");
    }
  });
});
