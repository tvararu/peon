import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  wintergraspBuildingDamageBody,
  wintergraspEjectedBody,
  wintergraspEnteredBody,
  wintergraspEntryInviteBody,
  wintergraspQueueInviteBody,
  wintergraspQueueResponseBody,
} from "#test-support/areas/wintergrasp";
import { GameOpcode } from "#wow/protocol/opcodes";

function offerQueue(rig: ReturnType<typeof areaRig<"wintergrasp">>) {
  rig.inject(
    GameOpcode.SMSG_BATTLEFIELD_MGR_QUEUE_INVITE,
    wintergraspQueueInviteBody({ battleId: 1, warmup: true }),
  );
}

describe("wintergrasp acts", () => {
  test("the queue invite moves the phase and accepting resolves queued", async () => {
    const rig = areaRig("wintergrasp");
    try {
      offerQueue(rig);
      expect(rig.handle.state().phase).toBe("queue_offered");
      const pending = rig.handle.act.answerQueue(true);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_BATTLEFIELD_MGR_QUEUE_INVITE_RESPONSE,
      ]);
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_MGR_QUEUE_REQUEST_RESPONSE,
        wintergraspQueueResponseBody({
          battleId: 1,
          canQueue: true,
          full: false,
          zone: 4197,
        }),
      );
      expect(await pending).toEqual({ battleId: 1, status: "queued" });
      expect(rig.handle.state().phase).toBe("queued");
    } finally {
      rig.dispose();
    }
  });

  test("declining the queue sends and resolves without a reply", async () => {
    const rig = areaRig("wintergrasp");
    try {
      offerQueue(rig);
      expect(await rig.handle.act.answerQueue(false)).toEqual({
        status: "declined",
      });
      expect(rig.sent).toHaveLength(1);
      expect(rig.handle.state().phase).toBe("none");
    } finally {
      rig.dispose();
    }
  });

  test("answers without an offer reject no_offer and send nothing", async () => {
    const rig = areaRig("wintergrasp");
    try {
      await expect(rig.handle.act.answerQueue(true)).rejects.toThrow(
        "no_offer",
      );
      await expect(rig.handle.act.answerEntry(true)).rejects.toThrow(
        "no_offer",
      );
      await expect(rig.handle.act.exitQueue()).rejects.toThrow("no_offer");
      expect(rig.sent).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("the war offer carries its deadline and accepting resolves entered", async () => {
    const rig = areaRig("wintergrasp");
    try {
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_MGR_ENTRY_INVITE,
        wintergraspEntryInviteBody({
          battleId: 1,
          expiry: 1_791_000_020,
          zone: 4197,
        }),
      );
      expect(rig.handle.state()).toMatchObject({
        expiresAt: 1_791_000_020,
        phase: "entry_offered",
        zone: 4197,
      });
      const pending = rig.handle.act.answerEntry(true);
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_MGR_ENTERED,
        wintergraspEnteredBody({ afk: false, battleId: 1 }),
      );
      expect(await pending).toEqual({ battleId: 1, status: "entered" });
      expect(rig.handle.state().phase).toBe("at_war");
    } finally {
      rig.dispose();
    }
  });

  test("leaving the queue resolves on the ejected reply", async () => {
    const rig = areaRig("wintergrasp");
    try {
      offerQueue(rig);
      const accept = rig.handle.act.answerQueue(true);
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_MGR_QUEUE_REQUEST_RESPONSE,
        wintergraspQueueResponseBody({
          battleId: 1,
          canQueue: true,
          full: false,
          zone: 4197,
        }),
      );
      await accept;
      const pending = rig.handle.act.exitQueue();
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_BATTLEFIELD_MGR_EJECTED,
        wintergraspEjectedBody({ battleId: 1, reason: 1 }),
      );
      expect(await pending).toEqual({
        battleId: 1,
        reason: "close",
        status: "left",
      });
      expect(rig.handle.state().phase).toBe("ejected");
    } finally {
      rig.dispose();
    }
  });

  test("building damage emits an event without changing the phase", () => {
    const rig = areaRig("wintergrasp");
    try {
      const seen: string[] = [];
      rig.handle.onEvent((event) => seen.push(event.type));
      rig.inject(
        GameOpcode.SMSG_DESTRUCTIBLE_BUILDING_DAMAGE,
        wintergraspBuildingDamageBody({
          attacker: 2n,
          building: 1n,
          player: 3n,
          spell: 9,
          wireChange: 1000,
        }),
      );
      expect(seen).toEqual(["building_damage"]);
      expect(rig.handle.state().phase).toBe("none");
    } finally {
      rig.dispose();
    }
  });

  test("hearth rejects outside Wintergrasp and sends nothing", async () => {
    const rig = areaRig("wintergrasp");
    try {
      await expect(rig.handle.act.hearthAndResurrect()).rejects.toThrow(
        "not_in_wintergrasp",
      );
      expect(rig.sent).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });
});
