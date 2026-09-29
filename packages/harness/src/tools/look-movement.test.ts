import { describe, expect, jest, test } from "bun:test";
import type { AreaState } from "@peon/core";
import { eversong, place, stalker, world } from "#test-support/look-fixtures";
import { runTool } from "#test-support/tool-harness";

type Motion = AreaState<"unitmotion">;

const ROOT = 0x00_00_08_00;
const SWIMMING = 0x00_20_00_00;
const STALKER = 0x25n;

function moving(
  over: Partial<Motion["units"][number]> = {},
): Motion["units"][number] {
  return {
    flags: 0,
    guid: STALKER,
    runBefore: undefined,
    serverControlled: true,
    speeds: { run: { at: 0, source: "create", value: 7 } },
    updatedAt: 0,
    ...over,
  };
}

async function looked(unit: Motion["units"][number] | undefined) {
  const w = await world();
  place(w.handle, eversong([stalker()]));
  jest.spyOn(w.handle.unitmotion, "state").mockReturnValue({
    dropped: 0,
    units: unit ? [unit] : [],
  });
  return { ...w, out: await runTool(w.tool, { within: 100 }) };
}

function stalkerLine(text: string): string {
  return text.split("\n").find((line) => line.includes("Springpaw")) ?? "";
}

describe("look movement words", () => {
  test("a rooted, slowed unit says so on its line", async () => {
    const { out } = await looked(
      moving({
        flags: ROOT,
        runBefore: 7,
        speeds: { run: { at: 0, source: "spline", value: 3.5 } },
      }),
    );
    expect(stalkerLine(out.text)).toContain("rooted, slowed 50%");
    const rows = out.details.tool === "look" ? out.details.result.after.rows : undefined;
    expect(rows?.find((unit) => unit.name.includes("Springpaw"))?.movement).toEqual({
      flying: false,
      hover: false,
      rooted: true,
      slowedPct: 50,
      swimming: false,
    });
  });

  test("a swimming unit says swimming", async () => {
    const { out } = await looked(moving({ flags: SWIMMING }));
    expect(stalkerLine(out.text)).toContain("swimming");
  });

  test("a unit with default movement renders without words or movement", async () => {
    const { out } = await looked(moving());
    expect(stalkerLine(out.text)).not.toMatch(/rooted|slowed|swimming/);
    const rows = out.details.tool === "look" ? out.details.result.after.rows : [];
    expect(rows.every((unit) => unit.movement === undefined)).toBe(true);
  });

  test("a unit without a movement row is unchanged", async () => {
    const { out } = await looked(undefined);
    expect(stalkerLine(out.text)).not.toMatch(/rooted|slowed|swimming/);
  });

  test("a sped-up unit is not slowed", async () => {
    const { out } = await looked(
      moving({
        runBefore: undefined,
        speeds: { run: { at: 0, source: "spline", value: 10 } },
      }),
    );
    expect(stalkerLine(out.text)).not.toContain("slowed");
  });

  test("a root change shows on a fresh digest and on the line", async () => {
    const w = await world();
    place(w.handle, eversong([stalker()]));
    const state = jest.spyOn(w.handle.unitmotion, "state");
    state.mockReturnValue({ dropped: 0, units: [moving()] });
    const first = await runTool(w.tool, { within: 100 });
    const second = await runTool(w.tool, { within: 100 });
    expect(
      second.details.tool === "look" && first.details.tool === "look",
    ).toBe(true);
    expect(
      second.details.tool === "look" && second.details.result.after.unchanged,
    ).toBeGreaterThan(1);
    state.mockReturnValue({ dropped: 0, units: [moving({ flags: ROOT })] });
    const moved = await runTool(w.tool, { within: 100 });
    expect(stalkerLine(moved.text)).toContain("rooted");
  });
});
