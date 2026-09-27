import { describe, expect, jest, test } from "bun:test";
import type { CombatState, NearbyRow, NpcRole } from "@peon/core";
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
  return { handle, rt, snapshots, tool: lookTool.definition(rt) };
}

type World = Awaited<ReturnType<typeof world>>;

function questLog({ handle, rt }: World, questId: number, ender: string) {
  rt.quests.set(questId, {
    ender,
    giver: "Deputy Willem",
    objectives: `Speak with ${ender}.`,
    title: "A Threat Within",
  });
  const state = handle.getQuestState();
  const counters: [number, number, number, number] = [0, 0, 0, 0];
  handle.getQuestState = () => ({
    ...state,
    log: {
      complete: true,
      slots: [{ counters, expiresAtSeconds: 0, flags: 0, questId, slot: 0 }],
    },
  });
}

function crowd(last: UnitInit): NearbyRow[] {
  const rabbits = [5, 10, 15, 20, 25].map((dx, i) =>
    nearbyRow(unitEntity({ dx, guid: BigInt(0x60 + i), name: "Rabbit" }), {
      relation: "neutral",
    }),
  );
  return [
    selfRow(),
    ...rabbits,
    nearbyRow(unitEntity({ dx: 30, guid: 0x70n, level: 5, name: "Stallion" }), {
      relation: "neutral",
    }),
    friendly({ dx: 40, guid: 0x71n, level: 22, name: "Stormwind Guard" }),
    friendly({ dx: 45, guid: 0x72n, level: 10, name: "Fgkliba", player: true }),
    friendly(last),
  ];
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
});
