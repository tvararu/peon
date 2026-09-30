import { describe, expect, test } from "bun:test";
import { grayLevel } from "#harness/loops/combat-actions-credit";
import { eversong, place, world } from "#test-support/look-fixtures";
import { runTool } from "#test-support/tool-harness";
import { nearbyRow, unitEntity } from "#test-support/world-fixtures";

const SELF_LEVEL = 10;

function hostile(dx: number, guid: bigint, level: number, name: string) {
  return nearbyRow(unitEntity({ dx, guid, level, name }), {
    attackable: true,
    relation: "hostile",
  });
}

describe("look gray marker", () => {
  test("a gray hostile is marked in its row and Nearest hostile", async () => {
    const { handle, tool } = await world();
    const gray = grayLevel(SELF_LEVEL);
    place(handle, eversong([hostile(20, 0x26n, gray, "Starving Ghostclaw")]));
    const lines = (await runTool(tool, { find: "hostile", within: 100 })).text
      .split("\n")
      .filter((line) => line.includes("Starving Ghostclaw"));
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).toContain("gray (no XP)");
  });

  test("a hostile above the gray level is not marked", async () => {
    const { handle, tool } = await world();
    const fresh = grayLevel(SELF_LEVEL) + 1;
    place(handle, eversong([hostile(20, 0x26n, fresh, "Springpaw Lynx")]));
    const text = (await runTool(tool, { find: "hostile", within: 100 })).text;
    expect(text).toContain("Springpaw Lynx");
    expect(text).not.toContain("gray");
  });
});
