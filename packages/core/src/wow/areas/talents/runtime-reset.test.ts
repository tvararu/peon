import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  talentsBuyFailedBody,
  talentsTalentsInfoBody,
  talentsWipeOfferBody,
} from "#test-support/areas/talents";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { RESET_ANSWER_MS } from "#wow/areas/talents/runtime";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const WIPE = GameOpcode.MSG_TALENT_WIPE_CONFIRM;
const INFO = GameOpcode.SMSG_TALENTS_INFO;
const SELECT = GameOpcode.CMSG_GOSSIP_SELECT_OPTION;
const BUY_FAILED = GameOpcode.SMSG_BUY_FAILED;
const TRAINER = 0xf1_30_00_11_d1_00_00_2an;
const MENU = 4741;
const OPTION = 3;
const REQUEST = { maxCost: 20_000, optionIndex: OPTION };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function rigged(options: { dialog?: boolean } = {}) {
  const rig = areaRig("talents", { selfGuid: 0x2an });
  if (options.dialog !== false) {
    rig.stores.quests.requestIntent({ action: "talk", guid: TRAINER });
    rig.stores.quests.openDialog({
      data: {
        guid: TRAINER,
        menuId: MENU,
        options: [
          {
            boxText: "",
            coded: 0,
            icon: 0,
            money: 0,
            optionIndex: OPTION,
            text: "I wish to unlearn my talents.",
          },
        ],
        quests: [],
        titleTextId: 1,
      },
      kind: "gossip",
    });
  }
  const sent = (opcode: number) => rig.sent.filter((p) => p.opcode === opcode);
  return { rig, sent };
}

const offer = (cost: number, npcGuid = TRAINER) =>
  talentsWipeOfferBody({ cost, npcGuid });
const after = (freePoints: number) =>
  talentsTalentsInfoBody({ freePoints, specs: [{}] });

describe("resetTalents", () => {
  test("without a gossip dialog it throws gossip_not_open and sends nothing", async () => {
    const { rig } = rigged({ dialog: false });
    try {
      await expect(rig.handle.act.resetTalents(REQUEST)).rejects.toThrow(
        "gossip_not_open",
      );
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("an option the dialog does not list throws option_not_offered", async () => {
    const { rig, sent } = rigged();
    try {
      await expect(
        rig.handle.act.resetTalents({ maxCost: 1, optionIndex: 9 }),
      ).rejects.toThrow("option_not_offered");
      expect(sent(SELECT)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("it selects the option, confirms the offered guid and reports the new points", async () => {
    const { rig, sent } = rigged();
    try {
      const pending = rig.handle.act.resetTalents(REQUEST);
      await flush();
      const select = new PacketReader(
        sent(SELECT)[0]?.body ?? new Uint8Array(),
      );
      expect([select.uint64LE(), select.uint32LE(), select.uint32LE()]).toEqual(
        [TRAINER, MENU, OPTION],
      );
      expect(sent(WIPE)).toEqual([]);
      rig.inject(WIPE, offer(10_000));
      await flush();
      expect(
        new PacketReader(sent(WIPE)[0]?.body ?? new Uint8Array()).uint64LE(),
      ).toBe(TRAINER);
      rig.inject(INFO, after(3));
      expect(await pending).toEqual({
        cost: 10_000,
        freePoints: 3,
        outcome: "reset",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a cost above maxCost returns too_expensive and never confirms", async () => {
    const { rig, sent } = rigged();
    try {
      const pending = rig.handle.act.resetTalents({
        maxCost: 9999,
        optionIndex: OPTION,
      });
      await flush();
      rig.inject(WIPE, offer(10_000));
      expect(await pending).toEqual({ cost: 10_000, outcome: "too_expensive" });
      expect(sent(WIPE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a cost equal to maxCost is confirmed", async () => {
    const { rig, sent } = rigged();
    try {
      const pending = rig.handle.act.resetTalents({
        maxCost: 10_000,
        optionIndex: OPTION,
      });
      await flush();
      rig.inject(WIPE, offer(10_000));
      await flush();
      expect(sent(WIPE)).toHaveLength(1);
      rig.inject(INFO, after(3));
      expect(await pending).toMatchObject({ outcome: "reset" });
    } finally {
      rig.dispose();
    }
  });

  test("a zero cost (NoResetTalentsCost) is confirmed and reported as 0", async () => {
    const { rig } = rigged();
    try {
      const pending = rig.handle.act.resetTalents({
        maxCost: 0,
        optionIndex: OPTION,
      });
      await flush();
      rig.inject(WIPE, offer(0));
      await flush();
      rig.inject(INFO, after(2));
      expect(await pending).toEqual({
        cost: 0,
        freePoints: 2,
        outcome: "reset",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a guid-0 reply to the option is nothing_to_reset and no confirm goes out", async () => {
    const { rig, sent } = rigged();
    try {
      const pending = rig.handle.act.resetTalents(REQUEST);
      await flush();
      rig.inject(WIPE, offer(0, 0n));
      expect(await pending).toEqual({ outcome: "nothing_to_reset" });
      expect(sent(WIPE)).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("a failed payment is not_enough_money, not nothing_to_reset (Player.cpp:3890-3901)", async () => {
    const { rig } = rigged();
    try {
      const pending = rig.handle.act.resetTalents(REQUEST);
      await flush();
      rig.inject(WIPE, offer(10_000));
      await flush();
      rig.inject(BUY_FAILED, talentsBuyFailedBody({ result: 2 }));
      rig.inject(WIPE, offer(0, 0n));
      expect(await pending).toEqual({ outcome: "not_enough_money" });
    } finally {
      rig.dispose();
    }
  });

  test("a guid-0 reply after the confirm without a buy error is nothing_to_reset", async () => {
    const { rig } = rigged();
    try {
      const pending = rig.handle.act.resetTalents(REQUEST);
      await flush();
      rig.inject(WIPE, offer(10_000));
      await flush();
      rig.inject(WIPE, offer(0, 0n));
      expect(await pending).toEqual({ outcome: "nothing_to_reset" });
    } finally {
      rig.dispose();
    }
  });

  test("a payment failure of one reset does not turn the next into not_enough_money", async () => {
    const { rig } = rigged();
    try {
      const first = rig.handle.act.resetTalents(REQUEST);
      await flush();
      rig.inject(WIPE, offer(10_000));
      await flush();
      rig.inject(BUY_FAILED, talentsBuyFailedBody({ result: 2 }));
      rig.inject(WIPE, offer(0, 0n));
      await first;
      const second = rig.handle.act.resetTalents(REQUEST);
      await flush();
      rig.inject(WIPE, offer(0, 0n));
      expect(await second).toEqual({ outcome: "nothing_to_reset" });
    } finally {
      rig.dispose();
    }
  });

  test("no offer within the window is no_reply and releases the act", async () => {
    await withFakeTimers(async () => {
      const { rig } = rigged();
      try {
        const pending = rig.handle.act.resetTalents(REQUEST);
        await elapse(RESET_ANSWER_MS + 100);
        expect(await pending).toEqual({ outcome: "no_reply" });
        const again = rig.handle.act.resetTalents(REQUEST);
        await elapse(RESET_ANSWER_MS + 100);
        expect(await again).toEqual({ outcome: "no_reply" });
      } finally {
        rig.dispose();
      }
    });
  });

  test("no answer to the confirm within the window is no_reply", async () => {
    await withFakeTimers(async () => {
      const { rig } = rigged();
      try {
        const pending = rig.handle.act.resetTalents(REQUEST);
        await elapse(10);
        rig.inject(WIPE, offer(10_000));
        await elapse(RESET_ANSWER_MS + 100);
        expect(await pending).toEqual({ outcome: "no_reply" });
      } finally {
        rig.dispose();
      }
    });
  });

  test("a talent request already in flight makes a second one throw talent_request_busy", async () => {
    const { rig } = rigged();
    try {
      const first = rig.handle.act.resetTalents(REQUEST);
      await flush();
      await expect(
        rig.handle.act.learnTalents([{ rank: 1, talentId: 124 }]),
      ).rejects.toThrow("talent_request_busy");
      await expect(rig.handle.act.resetTalents(REQUEST)).rejects.toThrow(
        "talent_request_busy",
      );
      rig.inject(WIPE, offer(0, 0n));
      await first;
    } finally {
      rig.dispose();
    }
  });

  test("a learn in flight blocks a reset", async () => {
    const { rig, sent } = rigged();
    try {
      const learn = rig.handle.act.learnTalents([{ rank: 1, talentId: 124 }]);
      await flush();
      await expect(rig.handle.act.resetTalents(REQUEST)).rejects.toThrow(
        "talent_request_busy",
      );
      expect(sent(SELECT)).toEqual([]);
      rig.inject(INFO, after(1));
      await learn;
    } finally {
      rig.dispose();
    }
  });

  test("disposing mid-wait rejects the act", async () => {
    const { rig } = rigged();
    const pending = rig.handle.act.resetTalents(REQUEST);
    const outcome = pending.then(
      () => "resolved",
      (error: unknown) => (error instanceof Error ? error.message : "other"),
    );
    await flush();
    rig.dispose();
    expect(await outcome).not.toBe("resolved");
  });
});
