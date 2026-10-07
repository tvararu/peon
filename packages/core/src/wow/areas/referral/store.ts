import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { ReferFailure } from "#wow/areas/referral/protocol";
import type { SessionDeps } from "#wow/session-stores";

export const GRANT_OFFER_MS = 60_000;

export type PendingGrant = { proposer: bigint; at: number };

export type ReferralState = {
  pendingGrant: PendingGrant | undefined;
  failure: ReferFailure | undefined;
};

export type ReferralEvent = {
  type: "level_grant";
  proposer: bigint | undefined;
  failure: ReferFailure | undefined;
};

export class ReferralStore {
  private readonly events = new Emitter<[ReferralEvent]>();
  private readonly deps: Pick<SessionDeps, "now">;
  private pending: PendingGrant | undefined;
  private failure: ReferFailure | undefined;

  constructor(deps: Pick<SessionDeps, "now">) {
    this.deps = deps;
  }

  snapshot(): ReferralState {
    const live =
      this.pending && this.deps.now() - this.pending.at < GRANT_OFFER_MS;
    return {
      pendingGrant: live ? this.pending : undefined,
      failure: this.failure,
    };
  }

  onEvent(cb: (event: ReferralEvent) => void): Unsubscribe {
    return this.events.subscribe(cb);
  }

  receiveProposal(proposer: bigint): void {
    this.pending = { proposer, at: this.deps.now() };
    this.events.emit({ type: "level_grant", proposer, failure: undefined });
  }

  receiveFailure(failure: ReferFailure): void {
    this.failure = failure;
    this.events.emit({ type: "level_grant", proposer: undefined, failure });
  }

  takePendingGrant(): PendingGrant | undefined {
    const grant = this.snapshot().pendingGrant;
    this.pending = undefined;
    return grant;
  }

  dispose(): void {
    this.events.clear();
  }
}
