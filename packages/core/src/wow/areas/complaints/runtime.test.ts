import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  complaintsResultBody,
  readComplain,
} from "#test-support/areas/complaints";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { GameOpcode } from "#wow/protocol/opcodes";

const SPAMMER = 0xbadn;
const CHAT = {
  kind: "chat",
  language: 0,
  chatType: 1,
  channelId: 0,
  secondsAgo: 5,
  text: "spam",
} as const;

describe("complain", () => {
  test("sends 0x3c7 and resolves true on 0x3c8", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("complaints");
      try {
        const answer = rig.handle.act.complain(SPAMMER, CHAT);
        expect(rig.sent.map((p) => p.opcode)).toEqual([
          GameOpcode.CMSG_COMPLAIN,
        ]);
        expect(
          readComplain(rig.sent[0]?.body ?? new Uint8Array()),
        ).toMatchObject({
          type: 1,
          guid: SPAMMER,
          description: "spam",
          secondsAgo: 5,
        });
        rig.inject(GameOpcode.SMSG_COMPLAIN_RESULT, complaintsResultBody(0));
        expect(await answer).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        rig.dispose();
      }
    });
  });

  test("a mail complaint sends the mail form", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("complaints");
      try {
        const answer = rig.handle.act.complain(SPAMMER, {
          kind: "mail",
          mailId: 77,
        });
        expect(
          readComplain(rig.sent[0]?.body ?? new Uint8Array()),
        ).toMatchObject({ type: 0, guid: SPAMMER, messageType: 77 });
        rig.inject(GameOpcode.SMSG_COMPLAIN_RESULT, complaintsResultBody(0));
        expect(await answer).toBe(true);
      } finally {
        rig.dispose();
      }
    });
  });

  test("resolves false after 3 s with no reply and leaves no timer", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("complaints");
      try {
        const answer = rig.handle.act.complain(SPAMMER, CHAT);
        await elapse(2999);
        let settled = false;
        void answer.then(() => {
          settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        await elapse(1);
        expect(await answer).toBe(false);
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        rig.dispose();
      }
    });
  });

  test("an abort signal settles the wait with a rejection and frees the timer", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("complaints");
      try {
        const controller = new AbortController();
        const answer = rig.handle.act.complain(
          SPAMMER,
          CHAT,
          controller.signal,
        );
        const wait = answer.then(
          () => "resolved",
          (error: unknown) =>
            error instanceof Error ? error.name : String(error),
        );
        controller.abort();
        await Promise.resolve();
        expect(await wait).toBe("AbortError");
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        rig.dispose();
      }
    });
  });

  test("a reply that arrives before any complaint is not remembered for the next one", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("complaints");
      try {
        rig.inject(GameOpcode.SMSG_COMPLAIN_RESULT, complaintsResultBody(0));
        const answer = rig.handle.act.complain(SPAMMER, CHAT);
        await elapse(3000);
        expect(await answer).toBe(false);
      } finally {
        rig.dispose();
      }
    });
  });
});
