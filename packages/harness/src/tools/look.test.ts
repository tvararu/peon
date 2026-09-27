import { describe, expect, jest, test } from "bun:test";
import type { CombatState, NearbyRow, NpcRole } from "@tuicraft/core";
import type { WorldSnapshots } from "#harness/contract/services";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createAttackLedger } from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import { createRunRegistry } from "#harness/runs/registry";
import { MAX_CONTENT_BYTES } from "#harness/tools/define";
import { lookTool } from "#harness/tools/look";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";
import {
  nearbyRow,
  selfPose,
  selfRow,
  setWorld,
  type UnitInit,
  unitEntity,
} from "#test-support/world-fixtures";

const NOW = 1_000_000;

async function world() {
  const clock = { now: () => NOW };
  const snapshots: WorldSnapshots = {
    attach: () => () => {},
    capture: jest.fn(),
    write: jest.fn(() => Promise.resolve("")),
  };
  const log = createGameLog({
    char: () => "Fgklibhlflc",
    clock,
    file: undefined,
  });
  const runs = createRunRegistry({
    clock,
    log,
    sink: createJsonlSink({ file: undefined }),
  });
  const parts = {
    attacks: createAttackLedger(clock),
    clock,
    log,
    refs: createRefTable(),
    runs,
    sightings: createSightings(clock),
    snapshots,
  };
  const { handle, rt } = await createTestRuntime({ parts });
  return { handle, rt, snapshots, tool: lookTool(rt) };
}

const friendly = (init: UnitInit, roles: NpcRole[] = []) =>
  nearbyRow(unitEntity(init), { relation: "friendly", roles });
const stalker = () =>
  nearbyRow(
    unitEntity({ dx: 78, guid: 0x25n, level: 7, name: "Springpaw Stalker" }),
    { relation: "hostile" },
  );

function eversong(extra: NearbyRow[] = []): NearbyRow[] {
  return [
    selfRow(),
    friendly({ guid: 0x21n, level: 10, name: "Fgklibiancf", player: true }),
    friendly({ dy: -11, guid: 0x22n, level: 30, name: "Velan Brightoak" }, [
      "questgiver",
    ]),
    friendly({ dy: 38, guid: 0x23n, level: 15, name: "Marniel Amberlight" }, [
      "vendor",
      "repair",
    ]),
    friendly({ dx: -58, guid: 0x24n, level: 22, name: "Silvermoon Guardian" }),
    ...extra,
  ];
}

function place(
  handle: Parameters<typeof setWorld>[0],
  rows: NearbyRow[],
  combat: Partial<CombatState> = {},
) {
  setWorld(handle, {
    combat,
    place: {
      area: "Fairbreeze Village",
      areaId: 3665,
      at: NOW - 240_000,
      zone: "Eversong Woods",
      zoneId: 3430,
    },
    pose: selfPose(NOW),
    rows,
    serverPose: selfPose(NOW - 12_000, { source: "server" }),
  });
}

describe("look", () => {
  test("the design example", async () => {
    const { handle, rt, tool } = await world();
    place(handle, eversong([stalker()]));
    const { text } = await runTool(tool, {});
    expect(text).toBe(
      [
        `DONE ${rt.profile.character} L10 Priest, HP 217/217, mana 100%, alive, not in combat. Eversong Woods, Fairbreeze Village (area 4 min old). 8735, -6685, facing N. Pose predicted, server fix 12 s ago.`,
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
    expect(snapshots.capture).toHaveBeenCalledWith("look");
  });

  test("a filter with nothing seen at any distance answers without a Next line", async () => {
    const { handle, tool } = await world();
    place(handle, eversong());
    expect((await runTool(tool, { find: "hostile" })).text).toBe(
      'DONE 0 hostile units seen at any distance in the last 30 min. The client sees about 100 yd around you.\nIf your task needs one: travel(to: "explore").',
    );
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

  test("three unchanged looks add the loop note", async () => {
    const { handle, tool } = await world();
    place(handle, eversong());
    await runTool(tool, {});
    await runTool(tool, {});
    const { text } = await runTool(tool, {});
    expect(text.split("\n").at(-1)).toBe(
      "Nothing changed in 3 looks. Act, or end your turn to wait for events.",
    );
  });

  test("line 2 names the target and a running run", async () => {
    const { handle, rt, tool } = await world();
    place(handle, eversong(), { selectedGuid: 0x22n });
    rt.runs.start({
      args: { target: "u9" },
      kind: "engage",
      launch: () => new Promise<never>(() => {}),
      toolCallId: "c0",
    });
    const line = (await runTool(tool, {})).text.split("\n")[1];
    expect(line).toBe(
      "Target: u2 Velan Brightoak 100%. Running: r1 engage u9 (0 s). It is still running. End your turn to wait.",
    );
  });

  test("an attacker replaces the calm line with the danger line", async () => {
    const { handle, tool } = await world();
    place(handle, eversong([stalker()]), { attackers: [0x25n] });
    const { text } = await runTool(tool, {});
    expect(text).not.toContain("No unit is attacking you.");
    expect(text.split("\n").at(-1)).toBe(
      "Danger: Springpaw Stalker u5 is attacking you. You are at 100% HP.",
    );
  });
});
