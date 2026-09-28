import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  threatHighestThreatUpdateBody,
  threatThreatClearBody,
  threatThreatRemoveBody,
  threatThreatUpdateBody,
} from "#test-support/areas/threat";
import type { ThreatEvent } from "#wow/areas/threat/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const UNIT = 0xf1_30_00_3e_ea_00_0a_bcn;
const ME = 0x2an;
const PET = 0xf1_40_00_00_01_00_00_07n;

function rigWithEvents() {
  const rig = areaRig("threat", { now: () => 77, selfGuid: ME });
  const seen: ThreatEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("threat area wiring", () => {
  test("SMSG_HIGHEST_THREAT_UPDATE and SMSG_THREAT_UPDATE fill the table (ThreatManager.cpp:880-898)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_HIGHEST_THREAT_UPDATE,
        threatHighestThreatUpdateBody({
          entries: [{ threat: 4000, victim: PET }],
          newVictim: PET,
          unit: UNIT,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_THREAT_UPDATE,
        threatThreatUpdateBody({
          entries: [
            { threat: 1500, victim: ME },
            { threat: 6000, victim: PET },
          ],
          unit: UNIT,
        }),
      );
      expect(rig.handle.state()).toEqual({
        tables: [
          {
            entries: [
              { isVictim: true, pct: 100, threat: 6000, victim: PET },
              { isVictim: false, pct: 25, threat: 1500, victim: ME },
            ],
            pullAt: { melee: 6600, ranged: 7800 },
            unit: UNIT,
            updatedAt: 77,
            victim: PET,
          },
        ],
      });
      expect(seen.map((event) => event.type)).toEqual([
        "victim_changed",
        "table",
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_THREAT_REMOVE drops the victim's entry (ThreatManager.cpp:872-878)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_HIGHEST_THREAT_UPDATE,
        threatHighestThreatUpdateBody({
          entries: [
            { threat: 4000, victim: PET },
            { threat: 900, victim: ME },
          ],
          newVictim: PET,
          unit: UNIT,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_THREAT_REMOVE,
        threatThreatRemoveBody({ unit: UNIT, victim: PET }),
      );
      expect(rig.handle.state().tables).toMatchObject([
        {
          entries: [{ isVictim: false, pct: 100, threat: 900, victim: ME }],
          victim: undefined,
        },
      ]);
      expect(seen.at(-1)).toEqual({ type: "removed", unit: UNIT, victim: PET });
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_THREAT_CLEAR deletes the table (ThreatManager.cpp:865-870)", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(
        GameOpcode.SMSG_THREAT_UPDATE,
        threatThreatUpdateBody({
          entries: [{ threat: 900, victim: ME }],
          unit: UNIT,
        }),
      );
      rig.inject(
        GameOpcode.SMSG_THREAT_CLEAR,
        threatThreatClearBody({ unit: UNIT }),
      );
      expect(rig.handle.state()).toEqual({ tables: [] });
      expect(seen.at(-1)).toEqual({ type: "cleared", unit: UNIT });
    } finally {
      rig.dispose();
    }
  });

  test("the area events reach the world event bus", () => {
    const { rig } = rigWithEvents();
    const areas: string[] = [];
    rig.events.area.subscribe(({ area, event }) =>
      areas.push(`${area}/${event.type}`),
    );
    try {
      rig.inject(
        GameOpcode.SMSG_THREAT_CLEAR,
        threatThreatClearBody({ unit: UNIT }),
      );
      expect(areas).toEqual(["threat/cleared"]);
    } finally {
      rig.dispose();
    }
  });
});
