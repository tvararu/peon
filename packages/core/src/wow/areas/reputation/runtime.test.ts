import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  REPUTATION_FACTIONS,
  reputationDbcSource,
  reputationInitializeFactionsBody,
  reputationSetForcedReactionsBody,
} from "#test-support/areas/reputation";
import { elapse, withFakeTimers } from "#test-support/fake-time";
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

  test("relationView answers forced ranks, reputation ranks and war from the store", async () => {
    const { rig } = await started(reputationDbcSource(REPUTATION_FACTIONS));
    try {
      rig.events.entity.emit({
        entity: player(ME, [bytes0(10, 8)]),
        type: "appear",
      });
      rig.inject(
        GameOpcode.SMSG_SET_FORCED_REACTIONS,
        reputationSetForcedReactionsBody([{ factionId: 87, rank: 4 }]),
      );
      const view = rig.handle.act.relationView();
      expect(view.forcedRank(87)).toBe(4);
      expect(view.forcedRank(911)).toBeUndefined();
      expect(view.reputationRank(911)).toBe(4);
      expect(view.reputationRank(589)).toBeUndefined();
      expect(view.atWar(911)).toBe(false);
    } finally {
      rig.dispose();
    }
  });
});

const SET_ATWAR = 0x1_25;
const SET_INACTIVE = 0x3_17;
const SET_WATCHED = 0x3_18;
const BLOODSAIL = 20;
const HIDDEN_FORCED = 21;
const UNSEEN = 22;
const AT_WAR = 23;
const INACTIVE = 24;

async function settled() {
  const rig = areaRig("reputation", {
    dbc: reputationDbcSource(REPUTATION_FACTIONS),
    selfGuid: ME,
  });
  await flushMicrotasks();
  rig.inject(
    GameOpcode.SMSG_INITIALIZE_FACTIONS,
    reputationInitializeFactionsBody(
      new Map([
        [SILVERMOON, { flags: 0x11, standing: 250 }],
        [BLOODSAIL, { flags: 0x01, standing: 0 }],
        [HIDDEN_FORCED, { flags: 0x08, standing: 0 }],
        [UNSEEN, { flags: 0x00, standing: 5 }],
        [AT_WAR, { flags: 0x03, standing: 0 }],
        [INACTIVE, { flags: 0x21, standing: 0 }],
      ]),
    ),
  );
  const row = (id: number) =>
    rig.handle.state().factions.find((entry) => entry.repListId === id);
  return { rig, row };
}

function watch(rig: Awaited<ReturnType<typeof settled>>["rig"], id: number) {
  rig.events.entity.emit({
    changed: ["rawFields"],
    entity: player(ME, [[PLAYER_FIELDS.WATCHED_FACTION_INDEX.offset, id]]),
    type: "update",
  });
}

describe("reputation settings acts", () => {
  test("setAtWar sends one CMSG_SET_FACTION_ATWAR and shows the war as pending", async () => {
    const { rig, row } = await settled();
    try {
      const events: string[] = [];
      rig.handle.onEvent((event) => events.push(event.type));
      expect(rig.handle.act.setAtWar(BLOODSAIL, true)).toEqual({ sent: true });
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(SET_ATWAR);
      expect([...(rig.sent[0]?.body ?? [])]).toEqual([BLOODSAIL, 0, 0, 0, 1]);
      expect(row(BLOODSAIL)?.atWar).toBe(true);
      expect(events).toContain("flags_pending");
      expect(rig.handle.act.setAtWar(BLOODSAIL, true)).toEqual({
        reason: "unchanged",
        sent: false,
      });
      expect(rig.sent).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("the next SMSG_INITIALIZE_FACTIONS clears the pending flags", async () => {
    const { rig, row } = await settled();
    try {
      rig.handle.act.setInactive(BLOODSAIL, true);
      expect(row(BLOODSAIL)?.inactive).toBe(true);
      rig.inject(
        GameOpcode.SMSG_INITIALIZE_FACTIONS,
        reputationInitializeFactionsBody(
          new Map([[BLOODSAIL, { flags: 0x01, standing: 0 }]]),
        ),
      );
      expect(row(BLOODSAIL)?.inactive).toBe(false);
    } finally {
      rig.dispose();
    }
  });

  test("setAtWar refuses what the server drops in silence and sends nothing (ReputationMgr.cpp:504-533)", async () => {
    const { rig } = await settled();
    try {
      const refused = (id: number | string, on: boolean) =>
        rig.handle.act.setAtWar(id, on);
      expect(refused(99, true)).toEqual({
        reason: "unknown_faction",
        sent: false,
      });
      expect(refused("No Such Faction", true)).toEqual({
        reason: "unknown_faction",
        sent: false,
      });
      expect(refused(HIDDEN_FORCED, true)).toEqual({
        reason: "cannot_change",
        sent: false,
      });
      expect(refused(SILVERMOON, true)).toEqual({
        reason: "own_faction",
        sent: false,
      });
      expect(refused(SILVERMOON, false)).toEqual({
        reason: "unchanged",
        sent: false,
      });
      expect(refused(AT_WAR, true)).toEqual({
        reason: "unchanged",
        sent: false,
      });
      expect(rig.sent).toEqual([]);
      expect(refused(AT_WAR, false)).toEqual({ sent: true });
      expect(rig.sent).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("setInactive refuses invisible factions only when going inactive (ReputationMgr.cpp:548-553)", async () => {
    const { rig } = await settled();
    try {
      const set = (id: number | string, on: boolean) =>
        rig.handle.act.setInactive(id, on);
      expect(set(99, true)).toEqual({ reason: "unknown_faction", sent: false });
      expect(set(HIDDEN_FORCED, true)).toEqual({
        reason: "cannot_change",
        sent: false,
      });
      expect(set(UNSEEN, true)).toEqual({ reason: "not_visible", sent: false });
      expect(set(INACTIVE, true)).toEqual({ reason: "unchanged", sent: false });
      expect(set(BLOODSAIL, false)).toEqual({
        reason: "unchanged",
        sent: false,
      });
      expect(rig.sent).toEqual([]);
      expect(set(INACTIVE, false)).toEqual({ sent: true });
      expect(set("silvermoon city", true)).toEqual({ sent: true });
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        SET_INACTIVE,
        SET_INACTIVE,
      ]);
      expect([...(rig.sent[1]?.body ?? [])]).toEqual([SILVERMOON, 0, 0, 0, 1]);
    } finally {
      rig.dispose();
    }
  });

  test("setWatched sends one CMSG_SET_WATCHED_FACTION and resolves on the watched field update", async () => {
    const { rig } = await settled();
    try {
      const pending = rig.handle.act.setWatched("Silvermoon City");
      await flushMicrotasks();
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(SET_WATCHED);
      expect([...(rig.sent[0]?.body ?? [])]).toEqual([SILVERMOON, 0, 0, 0]);
      watch(rig, SILVERMOON);
      expect(await pending).toEqual({ sent: true });
      expect(await rig.handle.act.setWatched(SILVERMOON)).toEqual({
        reason: "unchanged",
        sent: false,
      });
    } finally {
      rig.dispose();
    }
  });

  test("setWatched(undefined) clears the watched faction and refuses when none is watched", async () => {
    const { rig } = await settled();
    try {
      expect(await rig.handle.act.setWatched(undefined)).toEqual({
        reason: "unchanged",
        sent: false,
      });
      expect(rig.sent).toEqual([]);
      watch(rig, SILVERMOON);
      const pending = rig.handle.act.setWatched(undefined);
      await flushMicrotasks();
      expect([...(rig.sent[0]?.body ?? [])]).toEqual([255, 255, 255, 255]);
      watch(rig, 0xff_ff_ff_ff);
      expect(await pending).toEqual({ sent: true });
    } finally {
      rig.dispose();
    }
  });

  test("setWatched rejects with a timeout after 5 s without an update", async () => {
    const { rig } = await settled();
    try {
      await withFakeTimers(async () => {
        const pending = rig.handle.act.setWatched(BLOODSAIL);
        const outcome = pending.then(
          () => "resolved",
          (error: Error) => error.message,
        );
        await elapse(4900);
        expect(rig.sent).toHaveLength(1);
        await elapse(200);
        expect(await outcome).toBe("timeout");
      });
    } finally {
      rig.dispose();
    }
  });

  test("setWatched with an unknown name sends nothing", async () => {
    const { rig } = await settled();
    try {
      expect(await rig.handle.act.setWatched("Nobody")).toEqual({
        reason: "unknown_faction",
        sent: false,
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });
});
