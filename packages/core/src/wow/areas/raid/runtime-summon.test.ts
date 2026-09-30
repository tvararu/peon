import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  raidAreaTableSource,
  raidGroupListBody,
  raidSummonRequestBody,
} from "#test-support/areas/raid";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import type { RaidEvent } from "#wow/areas/raid/store-roster";
import { GameOpcode } from "#wow/protocol/opcodes";

const PEON = 0x30n;
const TOM = 0x10n;
const STRANGER = 0x99n;

function rig(init: Parameters<typeof areaRig>[1] = {}) {
  const made = areaRig("raid", { selfGuid: PEON, ...init });
  const events: RaidEvent[] = [];
  made.handle.onEvent((event) => {
    events.push(event);
  });
  return { events, rig: made };
}

function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function summon(
  made: ReturnType<typeof rig>["rig"],
  summoner = TOM,
  timeoutMs = 120_000,
  zone = 3430,
) {
  made.inject(
    GameOpcode.SMSG_SUMMON_REQUEST,
    raidSummonRequestBody(summoner, zone, timeoutMs),
  );
}

function responses(made: ReturnType<typeof rig>["rig"]) {
  return made.sent.filter(
    (packet) => packet.opcode === GameOpcode.CMSG_SUMMON_RESPONSE,
  );
}

describe("summon acts", () => {
  test("answering with no pending summon throws no_summon and sends nothing", () => {
    const { rig: made } = rig();
    try {
      expect(() => made.handle.act.answerSummon(true)).toThrow("no_summon");
      expect(made.sent).toHaveLength(0);
    } finally {
      made.dispose();
    }
  });

  test("accept sends the stored summoner once and clears the offer", () => {
    const { rig: made } = rig();
    try {
      summon(made);
      made.handle.act.answerSummon(true);
      expect(responses(made)).toHaveLength(1);
      expect([...(responses(made)[0]?.body ?? [])]).toEqual([
        0x10, 0, 0, 0, 0, 0, 0, 0, 1,
      ]);
      expect(made.handle.state().summon).toBeUndefined();
      expect(() => made.handle.act.answerSummon(true)).toThrow("no_summon");
    } finally {
      made.dispose();
    }
  });

  test("decline sends a zero byte", () => {
    const { rig: made } = rig();
    try {
      summon(made);
      made.handle.act.answerSummon(false);
      expect([...(responses(made)[0]?.body ?? [])].at(-1)).toBe(0);
    } finally {
      made.dispose();
    }
  });

  test("the summoner name comes from the group roster", () => {
    const { rig: made, events } = rig();
    try {
      made.inject(
        GameOpcode.SMSG_GROUP_LIST,
        raidGroupListBody({
          counter: 1,
          leader: TOM,
          members: [
            { guid: PEON, name: "Peon" },
            { guid: TOM, name: "Tom" },
          ],
          type: 0,
        }),
      );
      summon(made);
      summon(made, STRANGER);
      const named = events.filter((e) => e.type === "summon_requested");
      expect(named.map((e) => e.name)).toEqual(["Tom", ""]);
    } finally {
      made.dispose();
    }
  });
});

describe("summon expiry", () => {
  test("the offer lapses at the packet timeout and answering then throws", async () => {
    await withFakeTimers(async () => {
      const { rig: made, events } = rig();
      try {
        summon(made, TOM, 30_000);
        await elapse(29_990);
        expect(made.handle.state().summon).toBeDefined();
        await elapse(20);
        expect(made.handle.state().summon).toBeUndefined();
        expect(events.map((e) => e.type)).toEqual([
          "summon_requested",
          "summon_expired",
        ]);
        expect(() => made.handle.act.answerSummon(true)).toThrow("no_summon");
      } finally {
        made.dispose();
      }
    });
  });

  test("a newer request restarts the timer", async () => {
    await withFakeTimers(async () => {
      const { rig: made, events } = rig();
      try {
        summon(made, TOM, 30_000);
        await elapse(20_000);
        summon(made, TOM, 30_000);
        await elapse(20_000);
        expect(made.handle.state().summon).toBeDefined();
        await elapse(10_100);
        expect(made.handle.state().summon).toBeUndefined();
        expect(events.filter((e) => e.type === "summon_expired")).toHaveLength(
          1,
        );
      } finally {
        made.dispose();
      }
    });
  });

  test("answering stops the timer so no expiry fires", async () => {
    await withFakeTimers(async () => {
      const { rig: made, events } = rig();
      try {
        summon(made, TOM, 30_000);
        made.handle.act.answerSummon(false);
        await elapse(40_000);
        expect(events.map((e) => e.type)).toEqual(["summon_requested"]);
      } finally {
        made.dispose();
      }
    });
  });

  test("dispose stops the timer", async () => {
    await withFakeTimers(async () => {
      const { rig: made, events } = rig();
      summon(made, TOM, 30_000);
      made.dispose();
      await elapse(40_000);
      expect(events.map((e) => e.type)).toEqual(["summon_requested"]);
    });
  });
});

describe("summon zone name", () => {
  test("names the zone once AreaTable.dbc has loaded", async () => {
    const { rig: made, events } = rig({
      dbc: raidAreaTableSource([{ id: 3430, name: "Eversong Woods" }]),
    });
    try {
      await settle();
      summon(made);
      summon(made, TOM, 1000, 9999);
      const named = events.filter((e) => e.type === "summon_requested");
      expect(named.map((e) => e.zoneName)).toEqual([
        "Eversong Woods",
        undefined,
      ]);
    } finally {
      made.dispose();
    }
  });

  test("a missing file leaves the zone as an id", async () => {
    const { rig: made, events } = rig({
      dbc: async () => {
        throw new Error("missing AreaTable.dbc");
      },
    });
    try {
      await settle();
      summon(made);
      const event = events.find((e) => e.type === "summon_requested");
      expect(event?.zoneName).toBeUndefined();
      expect(event?.zoneId).toBe(3430);
    } finally {
      made.dispose();
    }
  });
});
