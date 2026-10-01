import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  talentsBuyFailedBody,
  talentsTalentsInfoBody,
  talentsTalentsInfoPetBody,
  talentsWipeOfferBody,
} from "#test-support/areas/talents";
import { type TalentsEvent, WIPE_OFFER_TTL_MS } from "#wow/areas/talents/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const WIPE = GameOpcode.MSG_TALENT_WIPE_CONFIRM;
const INFO = GameOpcode.SMSG_TALENTS_INFO;
const BUY_FAILED = GameOpcode.SMSG_BUY_FAILED;
const TRAINER = 0xf1_30_00_11_d1_00_00_2an;

function rigged() {
  let clock = 1000;
  const rig = areaRig("talents", { now: () => clock, selfGuid: 0x2an });
  const seen: TalentsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return {
    rig,
    seen,
    store: rig.stores.areas.talents,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

const offer = (cost = 10_000, npcGuid = TRAINER) =>
  talentsWipeOfferBody({ cost, npcGuid });

describe("talent wipe offers", () => {
  test("an offer with a guid is held with its cost and emits wipe_offer", () => {
    const { rig, seen } = rigged();
    try {
      rig.inject(WIPE, offer());
      expect(rig.handle.state().pendingOffer).toEqual({
        at: 1000,
        cost: 10_000,
        npcGuid: TRAINER,
      });
      expect(seen).toEqual([
        { cost: 10_000, npcGuid: TRAINER, type: "wipe_offer" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a guid-0 reply clears the offer and emits wipe_refused", () => {
    const { rig, seen } = rigged();
    try {
      rig.inject(WIPE, offer());
      rig.inject(WIPE, offer(0, 0n));
      expect(rig.handle.state().pendingOffer).toBeUndefined();
      expect(seen.map((event) => event.type)).toEqual([
        "wipe_offer",
        "wipe_refused",
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("the next player-form info clears the offer but a pet form does not", () => {
    const { rig } = rigged();
    try {
      rig.inject(WIPE, offer());
      rig.inject(INFO, talentsTalentsInfoPetBody());
      expect(rig.handle.state().pendingOffer).toBeDefined();
      rig.inject(INFO, talentsTalentsInfoBody({ freePoints: 3, specs: [{}] }));
      expect(rig.handle.state().pendingOffer).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("an offer reads as expired once the ttl has passed, without a timer", () => {
    const { rig, tick } = rigged();
    try {
      rig.inject(WIPE, offer());
      tick(WIPE_OFFER_TTL_MS - 1);
      expect(rig.handle.state().pendingOffer).toBeDefined();
      tick(1);
      expect(rig.handle.state().pendingOffer).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });
});

describe("talent reset payment failure", () => {
  test("a not-enough-money buy error during a reset is recorded", () => {
    const { rig, store } = rigged();
    try {
      store.beginReset();
      rig.inject(BUY_FAILED, talentsBuyFailedBody({ result: 2 }));
      expect(store.endReset()).toEqual({ paymentFailed: true });
    } finally {
      rig.dispose();
    }
  });

  test("a buy error outside a reset, or another result code, is ignored", () => {
    const { rig, store } = rigged();
    try {
      rig.inject(BUY_FAILED, talentsBuyFailedBody({ result: 2 }));
      store.beginReset();
      expect(store.endReset()).toEqual({ paymentFailed: false });
      store.beginReset();
      rig.inject(BUY_FAILED, talentsBuyFailedBody({ result: 5 }));
      expect(store.endReset()).toEqual({ paymentFailed: false });
    } finally {
      rig.dispose();
    }
  });

  test("a purchase failure carrying a vendor or item is not a reset payment failure", () => {
    const { rig, store } = rigged();
    try {
      store.beginReset();
      rig.inject(
        BUY_FAILED,
        talentsBuyFailedBody({ itemId: 2589, result: 2, vendorGuid: 7n }),
      );
      rig.inject(BUY_FAILED, talentsBuyFailedBody({ itemId: 5, result: 2 }));
      rig.inject(
        BUY_FAILED,
        talentsBuyFailedBody({ result: 2, vendorGuid: 7n }),
      );
      expect(store.endReset()).toEqual({ paymentFailed: false });
    } finally {
      rig.dispose();
    }
  });

  test("a failure from one reset does not leak into the next", () => {
    const { rig, store } = rigged();
    try {
      store.beginReset();
      rig.inject(BUY_FAILED, talentsBuyFailedBody({ result: 2 }));
      store.beginReset();
      expect(store.endReset()).toEqual({ paymentFailed: false });
    } finally {
      rig.dispose();
    }
  });
});
