import { describe, expect, jest, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { scratchDir } from "@peon/core/test-support/scratch";
import type { RunPaths } from "#harness/contract/config";
import type {
  SelfView,
  SnapshotWorld,
  UnitView,
} from "#harness/contract/views";
import {
  createWorldSnapshots,
  SNAPSHOT_EVERY_MS,
} from "#harness/events/snapshot";
import { createGameLog } from "#harness/log/store";
import { createMockGame } from "#test-support/mock-game";

const self: SelfView = {
  className: "Priest",
  copper: 1200,
  freeSlots: 10,
  guid: "1",
  hp: 200,
  inCombat: false,
  level: 10,
  life: "alive",
  maxHp: 200,
  mounted: false,
  maxPower: 300,
  name: "Fgk",
  pose: undefined,
  power: 300,
  powerKind: "mana",
  race: "Blood Elf",
  xpPct: 40,
};

function unit(ref: string, distance: number): UnitView {
  return {
    alive: true,
    attackable: true,
    attackingMe: false,
    compass: "N",
    distance,
    entry: 15_366,
    guid: ref.slice(1),
    hp: 137,
    hpPct: 100,
    inView: true,
    kind: "creature",
    level: 7,
    lootable: false,
    maxHp: 137,
    name: "Springpaw Stalker",
    ref,
    relation: "hostile",
    roles: [],
    seenAgoMs: 0,
    tappedByOther: false,
    targetsMe: false,
    x: 0,
    y: 0,
    z: 0,
  };
}

function worldOf(units: UnitView[], hp = 200): SnapshotWorld {
  const place = {
    ageMs: 0,
    area: "Fairbreeze Village",
    areaId: 1,
    zone: "Eversong Woods",
    zoneId: 2,
  };
  return {
    attackers: [],
    place,
    self: { ...self, hp },
    target: undefined,
    units,
  };
}

async function setup(start: SnapshotWorld | undefined) {
  const dir = scratchDir("tc-harness-snap");
  const paths = { snapshots: join(dir, "snapshots") } as RunPaths;
  const clock = { now: () => 0 };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  let current = start;
  const snapshots = createWorldSnapshots({
    clock,
    log,
    paths,
    world: () => current,
  });
  const rows = () =>
    log.since(0).filter((row) => row.event === "snapshot/world");
  return {
    dir,
    rows,
    set: (next: SnapshotWorld | undefined) => {
      current = next;
    },
    snapshots,
  };
}

describe("createWorldSnapshots", () => {
  test("look always writes a full row with units within 60 yd, nearest first", async () => {
    const { rows, snapshots } = await setup(
      worldOf([unit("u2", 40), unit("u1", 10), unit("u3", 80)]),
    );
    snapshots.capture("look");
    const [row] = rows();
    expect(row?.class).toBe("log");
    expect(row?.data["cause"]).toBe("look");
    expect(
      ((row?.data["units"] ?? []) as { ref: string }[]).map((u) => u.ref),
    ).toEqual(["u1", "u2"]);
    expect(row?.text).toBe("world: HP 200/200, 2 units within 60 yd");
  });

  test("a look with a wider radius writes the units within that radius", async () => {
    const { rows, snapshots } = await setup(
      worldOf([
        unit("u2", 40),
        unit("u1", 10),
        unit("u3", 80),
        unit("u4", 120),
      ]),
    );
    snapshots.capture("look", 100);
    snapshots.capture("look", 30);
    const [wide, narrow] = rows();
    expect(
      ((wide?.data["units"] ?? []) as { ref: string }[]).map((u) => u.ref),
    ).toEqual(["u1", "u2", "u3"]);
    expect(wide?.text).toBe("world: HP 200/200, 3 units within 100 yd");
    expect(narrow?.text).toBe("world: HP 200/200, 2 units within 60 yd");
  });

  test("a tick writes a heartbeat unless units or vitals changed", async () => {
    const { rows, set, snapshots } = await setup(worldOf([unit("u1", 10)]));
    snapshots.capture("tick");
    snapshots.capture("tick");
    set(worldOf([unit("u1", 10)], 195));
    snapshots.capture("tick");
    set(worldOf([unit("u1", 10)], 180));
    snapshots.capture("tick");
    set(worldOf([unit("u1", 10), unit("u2", 20)], 180));
    snapshots.capture("tick");
    expect(rows().map((row) => row.data["unchanged"] === true)).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  test("writes nothing without a world", async () => {
    const { rows, snapshots } = await setup(undefined);
    snapshots.capture("look");
    expect(rows()).toEqual([]);
  });

  test("attach ticks every 5 s until detached", async () => {
    const { rows, snapshots } = await setup(worldOf([]));
    jest.useFakeTimers();
    try {
      const detach = snapshots.attach(createMockGame());
      jest.advanceTimersByTime(SNAPSHOT_EVERY_MS * 2);
      detach();
      jest.advanceTimersByTime(SNAPSHOT_EVERY_MS * 2);
      expect(rows()).toHaveLength(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test("write saves the world under a safe label", async () => {
    const { dir, snapshots } = await setup(worldOf([unit("u1", 10)]));
    const path = await snapshots.write("before fight/1");
    expect(path).toBe(join(dir, "snapshots", "before_fight_1.json"));
    expect(JSON.parse(await readFile(path, "utf8")).self.name).toBe("Fgk");
  });
});
