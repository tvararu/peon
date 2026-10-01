import { describe, expect, test } from "bun:test";
import { eversong, friendly, place, world } from "#test-support/look-fixtures";
import { runTool } from "#test-support/tool-harness";

describe("look find flight_master", () => {
  test("lists only units with the flight master role", async () => {
    const t = await world();
    place(
      t.handle,
      eversong([
        friendly(
          { dx: 20, guid: 0x93n, level: 30, name: "Dragonhawk Master" },
          ["flight_master"],
        ),
        friendly(
          { dx: 25, guid: 0x94n, level: 15, name: "Innkeeper Delaniel" },
          ["innkeeper"],
        ),
      ]),
    );
    const text = (await runTool(t.tool, { find: "flight_master" })).text;
    expect(text).toMatch(
      /- u\d+ Dragonhawk Master L30 friendly, flight_master/,
    );
    expect(text).not.toContain("Innkeeper Delaniel");
    expect(text).not.toContain("Marniel Amberlight");
  });

  test("an empty result says no flight master units are in range", async () => {
    const t = await world();
    place(t.handle, eversong());
    const text = (await runTool(t.tool, { find: "flight_master" })).text;
    expect(text).toContain("No flight master units within");
  });

  test("a flight master that left view is still listed by role", async () => {
    const t = await world();
    place(
      t.handle,
      eversong([
        friendly(
          { dx: 20, guid: 0x93n, level: 30, name: "Dragonhawk Master" },
          ["flight_master"],
        ),
      ]),
    );
    await runTool(t.tool, {});
    place(t.handle, eversong());
    const text = (await runTool(t.tool, { find: "flight_master" })).text;
    expect(text).toMatch(
      /- u\d+ Dragonhawk Master L30 friendly, flight_master, last seen .* \(not in view\)/,
    );
  });
});
