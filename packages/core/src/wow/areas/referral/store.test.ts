import { describe, expect, test } from "bun:test";
import {
  GRANT_OFFER_MS,
  type ReferralEvent,
  ReferralStore,
} from "#wow/areas/referral/store";

describe("referral store", () => {
  test("a proposal is pending for 60 s and emits level_grant", () => {
    let now = 1000;
    const store = new ReferralStore({ now: () => now });
    const seen: ReferralEvent[] = [];
    store.onEvent((event) => seen.push(event));
    store.receiveProposal(7n);
    expect(seen).toEqual([
      { type: "level_grant", proposer: 7n, failure: undefined },
    ]);
    expect(store.snapshot().pendingGrant).toEqual({ proposer: 7n, at: 1000 });
    now += GRANT_OFFER_MS - 1;
    expect(store.snapshot().pendingGrant?.proposer).toBe(7n);
    now += 1;
    expect(store.snapshot().pendingGrant).toBeUndefined();
  });

  test("a failure is kept and emitted", () => {
    const store = new ReferralStore({ now: () => 0 });
    const seen: ReferralEvent[] = [];
    store.onEvent((event) => seen.push(event));
    const failure = { error: 3, reason: "insufficient", name: undefined };
    store.receiveFailure(failure);
    expect(seen).toEqual([
      { type: "level_grant", proposer: undefined, failure },
    ]);
    expect(store.snapshot().failure).toEqual(failure);
  });
});
