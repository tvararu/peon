import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  readReferralGuid,
  referralFailureBody,
  referralProposeBody,
} from "#test-support/areas/referral";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { GameOpcode } from "#wow/protocol/opcodes";

const TARGET = 0x42n;

describe("grantLevel", () => {
  test("sends 0x40d and resolves the server error", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("referral");
      try {
        const pending = rig.handle.act.grantLevel(TARGET);
        expect(rig.sent.map((p) => p.opcode)).toEqual([
          GameOpcode.CMSG_GRANT_LEVEL,
        ]);
        expect(
          readReferralGuid(rig.sent[0]?.body ?? new Uint8Array()).guid,
        ).toBe(TARGET);
        rig.inject(
          GameOpcode.SMSG_REFER_A_FRIEND_FAILURE,
          referralFailureBody(3),
        );
        expect(await pending).toEqual({
          error: {
            error: 3,
            reason: "insufficient_grantable_levels",
            name: undefined,
          },
        });
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        rig.dispose();
      }
    });
  });

  test("resolves sent after 2 s with no reply", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("referral");
      try {
        const pending = rig.handle.act.grantLevel(TARGET);
        await elapse(2000);
        expect(await pending).toBe("sent");
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        rig.dispose();
      }
    });
  });

  test("an abort rejects the wait", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("referral");
      try {
        const controller = new AbortController();
        const pending = rig.handle.act
          .grantLevel(TARGET, controller.signal)
          .then(
            () => "resolved",
            (error: unknown) =>
              error instanceof Error ? error.name : String(error),
          );
        controller.abort();
        await Promise.resolve();
        expect(await pending).toBe("AbortError");
      } finally {
        rig.dispose();
      }
    });
  });
});

describe("acceptLevelGrant", () => {
  test("answers no_offer and sends nothing without a proposal", () => {
    const rig = areaRig("referral");
    try {
      expect(rig.handle.act.acceptLevelGrant()).toEqual({
        ok: false,
        reason: "no_offer",
      });
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("sends 0x420 with the proposer and clears the offer", () => {
    const rig = areaRig("referral");
    try {
      rig.inject(
        GameOpcode.SMSG_PROPOSE_LEVEL_GRANT,
        referralProposeBody(TARGET),
      );
      expect(rig.handle.state().pendingGrant?.proposer).toBe(TARGET);
      expect(rig.handle.act.acceptLevelGrant()).toEqual({ ok: true });
      expect(rig.sent.map((p) => p.opcode)).toEqual([
        GameOpcode.CMSG_ACCEPT_LEVEL_GRANT,
      ]);
      expect(readReferralGuid(rig.sent[0]?.body ?? new Uint8Array()).guid).toBe(
        TARGET,
      );
      expect(rig.handle.state().pendingGrant).toBeUndefined();
      expect(rig.handle.act.acceptLevelGrant()).toEqual({
        ok: false,
        reason: "no_offer",
      });
    } finally {
      rig.dispose();
    }
  });
});
