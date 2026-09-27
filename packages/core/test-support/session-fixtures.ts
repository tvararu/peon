import { type CombatDeps, CombatRuntime } from "#wow/combat";
import { CombatStore } from "#wow/combat-store";
import { MotionStore } from "#wow/motion-store";
import { type RewardsDeps, RewardsRuntime } from "#wow/rewards";
import { RewardsStore } from "#wow/rewards-store";
import {
  buildSessionStores,
  type SessionDeps,
  type SessionStores,
} from "#wow/session-stores";

export function combatParts(deps: CombatDeps) {
  const store = new CombatStore(deps);
  const motion = new MotionStore(deps.now);
  const combat = new CombatRuntime({ combat: store, motion }, deps);
  return { combat, motion, store };
}

export function testStores(deps: Partial<SessionDeps> = {}): SessionStores {
  return buildSessionStores({
    getEntity: () => undefined,
    now: () => 0,
    selfGuid: () => 0n,
    send: () => undefined,
    ...deps,
  });
}

export function rewardsParts(deps: RewardsDeps) {
  const store = new RewardsStore(deps);
  const runtime = new RewardsRuntime(store, deps);
  return { runtime, store };
}
