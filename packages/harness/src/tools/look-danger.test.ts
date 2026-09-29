import { describe, expect, jest, test } from "bun:test";
import type { CombatState, NearbyRow, NpcRole } from "@peon/core";
import type { WorldSnapshots } from "#harness/contract/services";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createAttackLedger } from "#harness/ops/danger";
import { createRefTable } from "#harness/ops/refs";
import { createSightings } from "#harness/ops/sightings";
import { createRunRegistry } from "#harness/runs/registry";
import { lookTool } from "#harness/tools/look";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { expectSendKind, runTool } from "#test-support/tool-harness";
import {
  nearbyRow,
  SELF_GUID,
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

describe("look loops and danger", () => {
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
      "Danger: Springpaw Stalker u5 is coming at you (78 yd). You are at 100% HP.",
    );
  });

  test("a unit with a threat table on you says who it fights and your share", async () => {
    const { handle, tool } = await world();
    const pet = 0xf1400000000000aan;
    const lynx = (guid: bigint, dx: number) =>
      nearbyRow(unitEntity({ dx, guid, level: 7, name: "Ghostclaw Lynx" }), {
        relation: "hostile",
      });
    place(handle, [selfRow(), lynx(0x26n, 20), lynx(0x27n, 30)]);
    const state = handle.threat.state();
    jest.spyOn(handle.threat, "state").mockReturnValue({
      ...state,
      tables: [
        {
          entries: [
            { isVictim: true, pct: 100, threat: 5000, victim: SELF_GUID },
            { isVictim: false, pct: 60, threat: 3000, victim: pet },
          ],
          pullAt: { melee: 5500, ranged: 6500 },
          unit: 0x26n,
          updatedAt: NOW,
          victim: SELF_GUID,
        },
      ],
    });
    const { details, text } = await runTool(tool, {});
    const lines = text.split("\n");
    expect(lines).toContain(
      "- u1 Ghostclaw Lynx L7 hostile, fighting you, aggro on you, your threat 100%, 20 yd N",
    );
    expect(lines).toContain("- u2 Ghostclaw Lynx L7 hostile, 30 yd N");
    const rows = details.tool === "look" ? details.result.after.rows : [];
    expect(rows.find((row) => row.guid === "26")).toMatchObject({
      aggro: "you",
      fightingMe: true,
      myThreatPct: 100,
    });
    const plain = rows.find((row) => row.guid === "27");
    expect(plain?.fightingMe).toBeUndefined();
    expect(plain?.aggro).toBeUndefined();
    expect(plain?.myThreatPct).toBeUndefined();
    await expectSendKind(lookTool, {});
  });
});
