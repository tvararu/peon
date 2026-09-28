import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  REPUTATION_FACTIONS,
  reputationDbcSource,
  reputationInitializeFactionsBody,
} from "#test-support/areas/reputation";
import { flushMicrotasks } from "#test-support/microtasks";
import type { DbcSource } from "#wow/dbc";
import type { UnitEntity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;
const OTHER = 0x2bn;
const SILVERMOON = 14;

function player(guid: bigint, fields: [number, number][]): UnitEntity {
  return {
    class_: 0,
    displayId: 1,
    entry: 0,
    factionTemplate: 1610,
    gender: 0,
    guid,
    health: 100,
    level: 1,
    maxHealth: 100,
    maxPower: [0, 0, 0, 0, 0, 0, 0],
    name: "Peon",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [0, 0, 0, 0, 0, 0, 0],
    race: 0,
    rawFields: new Map(fields),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

const bytes0 = (race: number, class_: number) =>
  [UNIT_FIELDS.BYTES_0.offset, race | (class_ << 8)] as [number, number];

async function started(dbc: DbcSource | undefined) {
  let loads = 0;
  const counted: DbcSource | undefined = dbc
    ? (file) => {
        loads++;
        return dbc(file);
      }
    : undefined;
  const rig = areaRig("reputation", { dbc: counted, selfGuid: ME });
  await flushMicrotasks();
  rig.inject(
    GameOpcode.SMSG_INITIALIZE_FACTIONS,
    reputationInitializeFactionsBody(
      new Map([[SILVERMOON, { flags: 0x01, standing: 250 }]]),
    ),
  );
  const silvermoon = () =>
    rig.handle.state().factions.find((row) => row.repListId === SILVERMOON);
  return { loads: () => loads, rig, silvermoon };
}

describe("reputation runtime", () => {
  test("loads Faction.dbc once and hands it to the store", async () => {
    const { loads, rig } = await started(
      reputationDbcSource(REPUTATION_FACTIONS),
    );
    try {
      expect(loads()).toBe(1);
      expect(rig.handle.state().catalog).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("no DBC source leaves the catalog out", async () => {
    const { rig, silvermoon } = await started(undefined);
    try {
      expect(rig.handle.state().catalog).toBe(false);
      expect(silvermoon()?.standing).toBe(250);
    } finally {
      rig.dispose();
    }
  });

  test("the character's race and class from UNIT_FIELD_BYTES_0 pick the base reputation", async () => {
    const { rig, silvermoon } = await started(
      reputationDbcSource(REPUTATION_FACTIONS),
    );
    try {
      rig.events.entity.emit({
        entity: player(ME, [bytes0(10, 8)]),
        type: "appear",
      });
      expect(silvermoon()?.standing).toBe(3250);
      rig.events.entity.emit({
        changed: ["rawFields"],
        entity: player(ME, [bytes0(2, 9)]),
        type: "update",
      });
      expect(silvermoon()?.standing).toBe(650);
    } finally {
      rig.dispose();
    }
  });

  test("the watched faction field reaches the store", async () => {
    const { rig } = await started(reputationDbcSource(REPUTATION_FACTIONS));
    try {
      rig.events.entity.emit({
        changed: ["rawFields"],
        entity: player(ME, [
          [PLAYER_FIELDS.WATCHED_FACTION_INDEX.offset, SILVERMOON],
        ]),
        type: "update",
      });
      expect(rig.handle.state().watched).toBe(SILVERMOON);
    } finally {
      rig.dispose();
    }
  });

  test("another player's fields change nothing", async () => {
    const { rig, silvermoon } = await started(
      reputationDbcSource(REPUTATION_FACTIONS),
    );
    try {
      rig.events.entity.emit({
        entity: player(OTHER, [
          bytes0(10, 8),
          [PLAYER_FIELDS.WATCHED_FACTION_INDEX.offset, SILVERMOON],
        ]),
        type: "appear",
      });
      expect(silvermoon()?.standing).toBe(250);
      expect(rig.handle.state().watched).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});
