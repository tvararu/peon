import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { combatlogAttackerStateBody } from "#test-support/areas/combatlog";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import type { CombatlogEvent } from "#wow/areas/combatlog/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const ME = 0x2an;
const BOAR = 0xf1_30_00_3e_ea_00_0a_bcn;
const WOLF = 0xf1_30_00_3e_eb_00_0a_bdn;

function swing(attacker: bigint, target: bigint, amount: number): Uint8Array {
  return combatlogAttackerStateBody({
    attacker,
    hitInfo: 0x2,
    parts: [{ amount, schoolMask: 1 }],
    target,
  });
}

function setup() {
  const clock = { at: 1000 };
  const rig = areaRig("combatlog", { now: () => clock.at, selfGuid: ME });
  const closed: CombatlogEvent[] = [];
  rig.handle.onEvent((event) => {
    if (event.type === "fight_closed") closed.push(event);
  });
  const pass = async (ms: number) => {
    clock.at += ms;
    await elapse(ms);
  };
  return { closed, pass, rig };
}

describe("combatlog runtime fight close", () => {
  test("closes the fight 6 s after the last entry of the character and not before", async () => {
    await withFakeTimers(async () => {
      const { closed, pass, rig } = setup();
      try {
        rig.inject(GameOpcode.SMSG_ATTACKERSTATEUPDATE, swing(ME, BOAR, 10));
        await pass(3000);
        rig.inject(GameOpcode.SMSG_ATTACKERSTATEUPDATE, swing(BOAR, ME, 4));
        await pass(5990);
        expect(closed).toEqual([]);
        await pass(20);
        expect(closed).toMatchObject([
          { dealt: 10, lastAt: 4000, startedAt: 1000, taken: 4 },
        ]);
        await pass(20_000);
        expect(closed).toHaveLength(1);
      } finally {
        rig.dispose();
      }
    });
  });

  test("entries between other units do not move the close time", async () => {
    await withFakeTimers(async () => {
      const { closed, pass, rig } = setup();
      try {
        rig.inject(GameOpcode.SMSG_ATTACKERSTATEUPDATE, swing(ME, BOAR, 10));
        await pass(3000);
        rig.inject(GameOpcode.SMSG_ATTACKERSTATEUPDATE, swing(WOLF, BOAR, 4));
        await pass(3010);
        expect(closed).toMatchObject([{ dealt: 10, lastAt: 1000 }]);
      } finally {
        rig.dispose();
      }
    });
  });

  test("a second fight closes on its own", async () => {
    await withFakeTimers(async () => {
      const { closed, pass, rig } = setup();
      try {
        rig.inject(GameOpcode.SMSG_ATTACKERSTATEUPDATE, swing(ME, BOAR, 10));
        await pass(6100);
        rig.inject(GameOpcode.SMSG_ATTACKERSTATEUPDATE, swing(ME, BOAR, 7));
        await pass(6100);
        expect(closed.map((event) => event.type)).toEqual([
          "fight_closed",
          "fight_closed",
        ]);
        expect(closed[1]).toMatchObject({ dealt: 7 });
      } finally {
        rig.dispose();
      }
    });
  });

  test("ending the session cancels the wait and closes nothing", async () => {
    await withFakeTimers(async () => {
      const { closed, pass, rig } = setup();
      rig.inject(GameOpcode.SMSG_ATTACKERSTATEUPDATE, swing(ME, BOAR, 10));
      rig.dispose();
      await pass(10_000);
      expect(closed).toEqual([]);
    });
  });
});
