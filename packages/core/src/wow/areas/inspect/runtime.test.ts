import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  inspectInspectTalentBody,
  inspectRespondInspectAchievementsBody,
} from "#test-support/areas/inspect";
import { packTime } from "#test-support/areas/time";
import { GameOpcode } from "#wow/protocol/opcodes";

const GUID = 0x49_13n;
const OTHER = 0x49_14n;
const NOON = { year: 2026, month: 9, day: 28, weekday: 1, hour: 12, minute: 0 };

function talentReply(guid: bigint) {
  return inspectInspectTalentBody({
    gear: [{ entry: 7, slot: 15 }],
    guid,
    short: true,
  });
}

function achievementsReply(guid: bigint) {
  return inspectRespondInspectAchievementsBody({
    criteria: [],
    done: [{ id: 6, packedTime: packTime(NOON) }],
    guid,
  });
}

describe("inspect runtime", () => {
  test("inspect sends CMSG_INSPECT with the raw guid and resolves with the matching reply", async () => {
    const rig = areaRig("inspect");
    try {
      const pending = rig.handle.act.inspect(GUID);
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_INSPECT);
      rig.inject(GameOpcode.SMSG_INSPECT_TALENT, talentReply(GUID));
      const reply = await pending;
      expect(reply?.guid).toBe(GUID);
      expect(reply?.gear.map((item) => item.slot)).toEqual([15]);
    } finally {
      rig.dispose();
    }
  });

  test("a reply for another guid does not resolve the wait", async () => {
    const rig = areaRig("inspect");
    try {
      const pending = rig.handle.act.inspect(GUID);
      rig.inject(GameOpcode.SMSG_INSPECT_TALENT, talentReply(OTHER));
      rig.inject(GameOpcode.SMSG_INSPECT_TALENT, talentReply(GUID));
      expect((await pending)?.guid).toBe(GUID);
    } finally {
      rig.dispose();
    }
  });

  test("no reply in 3 s resolves undefined", async () => {
    jest.useFakeTimers();
    const rig = areaRig("inspect");
    try {
      const pending = rig.handle.act.inspect(GUID);
      const settled = pending.then((reply) => reply ?? "silent");
      jest.advanceTimersByTime(2999);
      rig.inject(GameOpcode.SMSG_INSPECT_TALENT, talentReply(OTHER));
      jest.advanceTimersByTime(1);
      expect(await settled).toBe("silent");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });

  test("inspectAchievements sends the packed guid and resolves with the count", async () => {
    const rig = areaRig("inspect");
    try {
      const pending = rig.handle.act.inspectAchievements(GUID);
      expect(rig.sent).toHaveLength(1);
      expect(rig.sent[0]?.opcode).toBe(
        GameOpcode.CMSG_QUERY_INSPECT_ACHIEVEMENTS,
      );
      rig.inject(
        GameOpcode.SMSG_RESPOND_INSPECT_ACHIEVEMENTS,
        achievementsReply(GUID),
      );
      const reply = await pending;
      expect(reply?.guid).toBe(GUID);
      expect(reply?.done.map((entry) => entry.id)).toEqual([6]);
    } finally {
      rig.dispose();
    }
  });

  test("inspectAchievements resolves undefined when the server stays silent", async () => {
    jest.useFakeTimers();
    const rig = areaRig("inspect");
    try {
      const pending = rig.handle.act.inspectAchievements(GUID);
      const settled = pending.then((reply) => reply ?? "silent");
      jest.advanceTimersByTime(3000);
      expect(await settled).toBe("silent");
    } finally {
      rig.dispose();
      jest.useRealTimers();
    }
  });
});
