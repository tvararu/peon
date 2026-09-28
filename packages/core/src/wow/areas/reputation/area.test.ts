import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  REPUTATION_FACTIONS,
  reputationDbcSource,
  reputationInitializeFactionsBody,
  reputationSetFactionStandingBody,
  reputationSetFactionVisibleBody,
} from "#test-support/areas/reputation";
import { flushMicrotasks } from "#test-support/microtasks";
import type { ReputationEvent } from "#wow/areas/reputation/store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;
const SILVERMOON = 14;
const BLOODSAIL = 20;

async function rigWithEvents() {
  const rig = areaRig("reputation", {
    dbc: reputationDbcSource(REPUTATION_FACTIONS),
    now: () => 500,
    selfGuid: ME,
  });
  await flushMicrotasks();
  rig.events.entity.emit({
    entity: {
      entry: 0,
      guid: ME,
      name: "Peon",
      objectType: ObjectType.PLAYER,
      position: undefined,
      rawFields: new Map([[UNIT_FIELDS.BYTES_0.offset, 10 | (8 << 8)]]),
      scale: 1,
    },
    type: "appear",
  });
  const seen: ReputationEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("reputation area wiring", () => {
  test("SMSG_INITIALIZE_FACTIONS then SMSG_SET_FACTION_STANDING give Silvermoon City at base plus delta (ReputationMgr.cpp:178-245)", async () => {
    const { rig, seen } = await rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_INITIALIZE_FACTIONS,
        reputationInitializeFactionsBody(
          new Map([[SILVERMOON, { flags: 0x11, standing: 0 }]]),
        ),
      );
      rig.inject(
        GameOpcode.SMSG_SET_FACTION_STANDING,
        reputationSetFactionStandingBody({
          entries: [{ repListId: SILVERMOON, standing: 5 }],
          increased: false,
        }),
      );
      expect(seen).toEqual([
        { count: 1, type: "initialized", visible: 1 },
        {
          after: 3005,
          atWar: false,
          before: 3000,
          factionId: 911,
          increased: false,
          name: "Silvermoon City",
          rank: 4,
          rankChanged: false,
          repListId: SILVERMOON,
          type: "standing_changed",
        },
      ]);
      expect(rig.handle.state()).toEqual({
        catalog: true,
        factions: [
          {
            atWar: false,
            changedAt: 500,
            factionId: 911,
            inactive: false,
            name: "Silvermoon City",
            rank: 4,
            rankCeiling: 8999,
            rankFloor: 3000,
            repListId: SILVERMOON,
            standing: 3005,
            visible: true,
            watched: false,
          },
        ],
        watched: undefined,
      });
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_SET_FACTION_VISIBLE shows a faction (ReputationMgr.cpp:252-261)", async () => {
    const { rig, seen } = await rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_SET_FACTION_VISIBLE,
        reputationSetFactionVisibleBody(BLOODSAIL),
      );
      expect(seen).toEqual([
        { name: "Bloodsail Buccaneers", repListId: BLOODSAIL, type: "visible" },
      ]);
      expect(
        rig.handle.state().factions.map((row) => [row.repListId, row.visible]),
      ).toEqual([[BLOODSAIL, true]]);
    } finally {
      rig.dispose();
    }
  });
});
