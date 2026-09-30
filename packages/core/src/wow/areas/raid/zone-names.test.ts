import { describe, expect, test } from "bun:test";
import { raidAreaTableSource } from "#test-support/areas/raid";
import { loadZoneNames } from "#wow/areas/raid/zone-names";

describe("zone names", () => {
  test("reads the area name by id and returns nothing for an unknown id", async () => {
    const zones = await loadZoneNames(
      raidAreaTableSource([
        { id: 3430, name: "Eversong Woods" },
        { id: 3433, name: "Ghostlands" },
      ]),
    );
    expect(zones.get(3433)).toBe("Ghostlands");
    expect(zones.get(3430)).toBe("Eversong Woods");
    expect(zones.get(1)).toBeUndefined();
  });

  test("rejects when the file is missing", async () => {
    await expect(
      loadZoneNames(async () => {
        throw new Error("missing AreaTable.dbc");
      }),
    ).rejects.toThrow("AreaTable.dbc");
  });
});
