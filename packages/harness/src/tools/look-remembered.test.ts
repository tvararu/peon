import { describe, expect, jest, test } from "bun:test";
import type { NearbyRow, NpcRole } from "@peon/core";
import type { WorldSnapshots } from "#harness/contract/services";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createAttackLedger } from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import { createRunRegistry } from "#harness/runs/registry";
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
  return { handle, rt, snapshots, tool: lookTool.definition(rt) };
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

function place(handle: Parameters<typeof setWorld>[0], rows: NearbyRow[]) {
  setWorld(handle, {
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

describe("look remembered units", () => {
  test("a questgiver that left view is reported by name and by role at any distance", async () => {
    const t = await world();
    const erona = friendly(
      {
        dx: -75,
        dy: 75,
        entry: 15_402,
        guid: 0x90n,
        level: 12,
        name: "Magistrix Erona",
      },
      ["questgiver"],
    );
    place(t.handle, eversong([erona]));
    await runTool(t.tool, {});
    place(t.handle, eversong());
    const byName = (
      await runTool(t.tool, { name: "Erona", within: 100 })
    ).text.split("\n");
    expect(byName.slice(2)).toEqual([
      "No units within 100 yd.",
      expect.stringMatching(
        /^- u\d+ Magistrix Erona L12 friendly, questgiver, last seen 106 yd SW 0 s ago \(not in view\)$/,
      ),
      expect.stringMatching(/^Nearest hostile/),
      "No unit is attacking you.",
    ]);
    const byRole = (await runTool(t.tool, { find: "questgiver" })).text;
    expect(byRole).toMatch(
      /- u\d+ Magistrix Erona L12 friendly, questgiver, last seen 106 yd SW/,
    );
  });

  test("find innkeeper lists innkeepers, also one that left view", async () => {
    const t = await world();
    const inn = friendly(
      { dx: 20, guid: 0x92n, level: 15, name: "Innkeeper Delaniel" },
      ["innkeeper", "vendor"],
    );
    place(t.handle, eversong([inn]));
    const seen = (await runTool(t.tool, { find: "innkeeper" })).text;
    expect(seen).toMatch(/- u\d+ Innkeeper Delaniel L15 friendly, innkeeper/);
    expect(seen).not.toContain("Marniel Amberlight");
    place(t.handle, eversong());
    const gone = (await runTool(t.tool, { find: "innkeeper" })).text;
    expect(gone).toMatch(
      /- u\d+ Innkeeper Delaniel L15 friendly, .*last seen .* \(not in view\)/,
    );
  });

  test("a unit that left view reports its last state as past, not current", async () => {
    const t = await world();
    const corpse = nearbyRow(
      unitEntity({
        dy: 20,
        guid: 0x91n,
        health: 0,
        level: 7,
        name: "Springpaw Lynx",
      }),
      { lootable: true, relation: "hostile" },
    );
    place(t.handle, eversong([corpse, stalker()]));
    const seen = (await runTool(t.tool, { name: "Lynx" })).text;
    expect(seen).toMatch(
      /- u\d+ Springpaw Lynx L7 hostile, dead, lootable, 20 yd W$/m,
    );
    place(t.handle, eversong());
    const remembered = (await runTool(t.tool, { name: "Lynx", within: 100 }))
      .text;
    expect(remembered).toMatch(
      /- u\d+ Springpaw Lynx L7 hostile, last seen 20 yd W 0 s ago, then dead, lootable \(not in view\)$/m,
    );
    expect(remembered).toContain(
      "Nearest hostile: u6 Springpaw Stalker L7, last seen 78 yd N 0 s ago, then alive.",
    );
  });
});
