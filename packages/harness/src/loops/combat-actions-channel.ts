import type { CombatState } from "@peon/core";
import type { JevCandidate } from "#harness/jev/contract";
import { hex } from "#harness/loops/combat-actions-observation";
import {
  channelRemainingMs,
  channelText,
} from "#harness/loops/combat-actions-spells";
import type { CombatPort } from "#harness/loops/ports";

type Channel = NonNullable<ReturnType<CombatPort["channel"]>>;

const UNSAFE_HEALTH_FRACTION = 0.5;

function waitingUnsafe(state: CombatState, targetGuid: bigint): boolean {
  const { health, maxHealth } = state.self;
  if (
    health !== undefined &&
    maxHealth !== undefined &&
    health < maxHealth * UNSAFE_HEALTH_FRACTION
  )
    return true;
  return state.attackers.some((guid) => guid !== targetGuid);
}

export function channelCandidates(
  state: CombatState,
  channel: Channel,
  targetGuid: bigint,
): JevCandidate[] {
  if (channel.cancelRequested || !waitingUnsafe(state, targetGuid)) return [];
  return [
    {
      id: "cancel",
      description: "Cancel the running channel because waiting is unsafe",
    },
  ];
}

export function channelObservation(
  channel: Channel,
  name: string | undefined,
  now: number,
): Record<string, unknown> {
  return {
    channel: {
      ...channel,
      remainingMs: channelRemainingMs(channel, now),
      target: hex(channel.target),
    },
    channelling: channelText(channel, name, now),
  };
}
