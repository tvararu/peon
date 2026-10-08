import { describe, expect, test } from "bun:test";
import {
  crowd,
  eversong,
  friendly,
  place,
  questLog,
  stalker,
  world,
} from "#test-support/look-fixtures";
import { MAX_CONTENT_BYTES } from "#test-support/ops-fixtures";
import { runTool } from "#test-support/tool-harness";
import { nearbyRow, selfRow, unitEntity } from "#test-support/world-fixtures";

describe("look", () => {
  test("the design example", async () => {
    const { handle, rt, tool } = await world();
    place(handle, eversong([stalker()]));
    const { text } = await runTool(tool, {});
    expect(text).toBe(
      [
        `DONE ${rt.profile.character} L10 Priest, HP 217/217, mana 100/100 (100%), alive, not in combat. Eversong Woods, Fairbreeze Village (area 4 min old). 8735, -6685, facing N. Pose predicted, server fix 12 s ago.`,
        "Target: none. Running: nothing.",
        "4 of 4 units within 60 yd, nearest first:",
        "- u1 Fgklibiancf L10 player, friendly, 0 yd",
        "- u2 Velan Brightoak L30 friendly, questgiver, 11 yd E",
        "- u3 Marniel Amberlight L15 friendly, vendor repair, 38 yd W",
        "- u4 Silvermoon Guardian L22 friendly, 58 yd S",
        "Nearest hostile: u5 Springpaw Stalker L7 alive, 78 yd N (seen now). Nearest lootable: none. Nearest trainer: none seen.",
        "No unit is attacking you.",
      ].join("\n"),
    );
    expect(text.split("\n").length).toBeLessThanOrEqual(24);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(MAX_CONTENT_BYTES);
  });

  test("details carry rows, counts, nearest and danger; the look is captured", async () => {
    const { handle, snapshots, tool } = await world();
    place(handle, eversong([stalker()]));
    const { details } = await runTool(tool, {});
    expect(details.tool).toBe("look");
    expect(details.result.after).toMatchObject({
      danger: { attackers: [] },
      filter: "any",
      matched: 4,
      seen: 5,
      unchanged: 1,
    });
    expect(
      details.tool === "look" && details.result.after.nearest.hostile?.ref,
    ).toBe("u5");
    expect(snapshots.capture).toHaveBeenCalledWith("look", undefined);
    await runTool(tool, { within: 100 });
    expect(snapshots.capture).toHaveBeenLastCalledWith("look", 100);
  });

  test("a filter with nothing seen at any distance answers without a Next line", async () => {
    const { handle, tool } = await world();
    place(handle, eversong());
    expect((await runTool(tool, { find: "hostile" })).text).toBe(
      'DONE 0 hostile units seen at any distance in the last 30 min. The client sees about 100 yd around you.\nIf your task needs one: engage() explores for one and fights it, or travel(to: "explore north") looks first.',
    );
  });

  test("the empty hint names the bearings explored and one not yet tried", async () => {
    const { handle, rt, tool } = await world();
    place(handle, eversong());
    const at = { mapId: 530, x: 8735, y: -6685 };
    rt.travel.exploreOrigin = at;
    rt.travel.explores.push(
      { ...at, direction: "N" },
      { ...at, direction: "E" },
    );
    for (const yards of [20, 40, 60, 80, 100])
      rt.travel.visitedCells.add(
        `530:${Math.floor((at.x + yards) / 20)}:${Math.floor(at.y / 20)}`,
      );
    const lines = (await runTool(tool, { find: "trainer" })).text.split("\n");
    expect(lines.slice(1)).toEqual([
      "You explored N, E up to 95 yd from here.",
      'If your task needs one: travel(to: "explore northwest").',
    ]);
  });

  test("a filter with a match out of range names the nearest one", async () => {
    const { handle, tool } = await world();
    place(handle, eversong([stalker()]));
    const lines = (await runTool(tool, { find: "hostile" })).text.split("\n");
    expect(lines[2]).toBe("No hostile units within 60 yd.");
    expect(lines[3]).toBe(
      "Nearest hostile: u5 Springpaw Stalker L7 alive, 78 yd N (seen now). Nearest lootable: none. Nearest trainer: none seen.",
    );
  });

  test("within lists up to 20 rows and cuts the text at 24 lines", async () => {
    const { handle, tool } = await world();
    const lynxes = Array.from({ length: 25 }, (_, i) =>
      nearbyRow(
        unitEntity({
          dx: i + 1,
          guid: BigInt(0x1_00 + i),
          name: `Lynx ${i + 1}`,
        }),
        { relation: "neutral" },
      ),
    );
    place(handle, [selfRow(), ...lynxes]);
    const { details, text } = await runTool(tool, { within: 30 });
    const lines = text.split("\n");
    expect(lines[2]).toBe("20 of 25 units within 30 yd, nearest first:");
    expect(lines).toHaveLength(24);
    expect(lines.at(-1)).toBe("+2 more; narrow the call.");
    expect(details.tool === "look" && details.result.after.rows).toHaveLength(
      20,
    );
  });

  test("a tapped unit is marked in its row and skipped for Nearest hostile", async () => {
    const { handle, tool } = await world();
    const tapped = nearbyRow(
      unitEntity({ dx: 20, guid: 0x26n, level: 7, name: "Springpaw Lynx" }),
      { attackable: true, relation: "hostile", tappedByOther: true },
    );
    place(handle, eversong([tapped, stalker()]));
    const { details, text } = await runTool(tool, {
      find: "hostile",
      within: 100,
    });
    const lines = text.split("\n");
    expect(lines.slice(2, 5)).toEqual([
      "2 of 2 hostile units within 100 yd, nearest first:",
      "- u5 Springpaw Lynx L7 hostile, tapped by another player, 20 yd N",
      "- u6 Springpaw Stalker L7 hostile, 78 yd N",
    ]);
    expect(lines[5]).toStartWith(
      "Nearest hostile: u6 Springpaw Stalker L7 alive, 78 yd N (seen now).",
    );
    expect(
      details.tool === "look" && details.result.after.nearest.attackable?.ref,
    ).toBeUndefined();
  });

  test("Nearest hostile says none seen when every hostile is tapped", async () => {
    const { handle, tool } = await world();
    const tapped = nearbyRow(
      unitEntity({ dx: 20, guid: 0x26n, level: 7, name: "Springpaw Lynx" }),
      { relation: "hostile", tappedByOther: true },
    );
    place(handle, eversong([tapped]));
    const lines = (await runTool(tool, {})).text.split("\n");
    expect(lines).toContain(
      "Nearest hostile: none seen. Nearest lootable: none. Nearest trainer: none seen.",
    );
  });

  test("name filters by part of a name", async () => {
    const { handle, tool } = await world();
    place(handle, eversong([stalker()]));
    const lines = (
      await runTool(tool, { name: "stalker", within: 100 })
    ).text.split("\n");
    expect(lines.slice(2, 4)).toEqual([
      "1 of 1 units within 100 yd, nearest first:",
      "- u5 Springpaw Stalker L7 hostile, 78 yd N",
    ]);
  });

  test("a cut list keeps the ender of an active quest and names the rest", async () => {
    const t = await world();
    questLog(t, 783, "Marshal McBride");
    place(
      t.handle,
      crowd({ dx: 57, guid: 0x73n, level: 20, name: "Marshal McBride" }),
    );
    const lines = (await runTool(t.tool, {})).text.split("\n");
    expect(lines[2]).toBe("6 of 9 units within 60 yd, most relevant first:");
    expect(lines[3]).toMatch(/^- u\d+ Marshal McBride L20 friendly, 57 yd N$/);
    expect(lines.slice(4, 9).map((line) => line.split(" ")[2])).toEqual([
      "Stallion",
      "Stormwind",
      "Fgkliba",
      "Rabbit",
      "Rabbit",
    ]);
    expect(lines[9]).toMatch(
      /^3 more: u\d+ Rabbit 15 yd N, u\d+ Rabbit 20 yd N, u\d+ Rabbit 25 yd N\. Use look\(within: 60\) to list all\.$/,
    );
  });

  test("a unit the human named outranks nearer ones", async () => {
    const t = await world();
    t.rt.log.append({
      class: "log",
      data: { text: "Walk to Marniel Amberlight please" },
      domain: "human",
      event: "human/input",
      text: "Human: Walk to Marniel Amberlight please",
    });
    place(
      t.handle,
      crowd({ dx: 58, guid: 0x73n, level: 15, name: "Marniel Amberlight" }),
    );
    const lines = (await runTool(t.tool, {})).text.split("\n");
    expect(lines[3]).toMatch(
      /^- u\d+ Marniel Amberlight L15 friendly, 58 yd N$/,
    );
  });

  test("an attacker and hostiles come before questgivers and vendors", async () => {
    const t = await world();
    const extra = [
      friendly({ dx: 50, guid: 0x80n, level: 30, name: "Velan Brightoak" }, [
        "questgiver",
      ]),
      nearbyRow(
        unitEntity({ dx: 55, guid: 0x81n, level: 7, name: "Springpaw Lynx" }),
        {
          relation: "hostile",
        },
      ),
    ];
    place(
      t.handle,
      [
        ...crowd({ dx: 59, guid: 0x82n, level: 7, name: "Springpaw Stalker" }),
        ...extra,
      ],
      {
        attackers: [0x82n],
      },
    );
    const names = (await runTool(t.tool, {})).text
      .split("\n")
      .slice(3, 6)
      .map((line) => line.split(" ").slice(2, 4).join(" "));
    expect(names).toEqual([
      "Springpaw Stalker",
      "Springpaw Lynx",
      "Velan Brightoak",
    ]);
  });
});
