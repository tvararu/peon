import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0xde1n;
const SPAM_MS = 1000;

const self: Entity = {
  entry: 0,
  guid: ME,
  name: "Me",
  objectType: ObjectType.PLAYER,
  position: undefined,
  rawFields: new Map([
    [UNIT_FIELDS.HEALTH.offset, 100],
    [PLAYER_FIELDS.FLAGS.offset, 0],
  ]),
  scale: 1,
};

function actRig() {
  return areaRig("emotes", {
    getEntity: (guid) => (guid === ME ? self : undefined),
    now: () => performance.now(),
    selfGuid: ME,
  });
}

const words = (body: Uint8Array) => [
  ...new Uint32Array(body.slice(0, body.length & ~3).buffer),
];

describe("queued text emote cancellation", () => {
  test("a signal aborted while queued settles at once and the earlier emotes keep their gaps", async () => {
    await withFakeTimers(async () => {
      const r = actRig();
      try {
        await r.handle.act.textEmote("wave");
        const dance = r.handle.act.textEmote("dance");
        const controller = new AbortController();
        const cheer = r.handle.act.textEmote(
          "cheer",
          undefined,
          controller.signal,
        );
        let settled = false;
        void cheer.then(() => {
          settled = true;
        });
        await elapse(100);
        controller.abort();
        await Promise.resolve();
        await Promise.resolve();
        expect(settled).toBe(true);
        expect(await cheer).toEqual({ ok: false, reason: "cancelled" });
        expect(r.sent).toHaveLength(1);
        await elapse(SPAM_MS);
        expect(await dance).toMatchObject({ ok: true });
        expect(r.sent.map((p) => words(p.body)[0])).toEqual([101, 34]);
        await elapse(SPAM_MS * 3);
        expect(r.sent).toHaveLength(2);
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        r.dispose();
      }
    });
  });
});
