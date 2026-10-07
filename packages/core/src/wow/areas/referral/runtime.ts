import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildAcceptLevelGrant,
  buildGrantLevel,
  type ReferFailure,
} from "#wow/areas/referral/protocol";
import type { ReferralEvent, ReferralStore } from "#wow/areas/referral/store";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export const GRANT_ANSWER_MS = 2000;

export type GrantOutcome = { error: ReferFailure } | "sent";

export type AcceptOutcome = { ok: true } | { ok: false; reason: "no_offer" };

export type ReferralActs = {
  grantLevel: (guid: bigint, signal?: AbortSignal) => Promise<GrantOutcome>;
  acceptLevelGrant: () => AcceptOutcome;
};

export function referralRuntime(
  ctx: AreaRuntimeCtx<ReferralEvent>,
  store: ReferralStore,
  _core: CoreStores,
): AreaRuntime<ReferralActs> {
  return {
    act: {
      async grantLevel(guid, signal): Promise<GrantOutcome> {
        const settled = ctx.until((event) => event.failure !== undefined, {
          timeoutMs: GRANT_ANSWER_MS,
          ...(signal ? { signal } : {}),
        });
        ctx.send(GameOpcode.CMSG_GRANT_LEVEL, buildGrantLevel(guid));
        try {
          const event = await settled;
          return event.failure ? { error: event.failure } : "sent";
        } catch (error) {
          if (error instanceof Error && error.message === "timeout")
            return "sent";
          throw error;
        }
      },
      acceptLevelGrant(): AcceptOutcome {
        const grant = store.takePendingGrant();
        if (!grant) return { ok: false, reason: "no_offer" };
        ctx.send(
          GameOpcode.CMSG_ACCEPT_LEVEL_GRANT,
          buildAcceptLevelGrant(grant.proposer),
        );
        return { ok: true };
      },
    },
    dispose: () => undefined,
  };
}
