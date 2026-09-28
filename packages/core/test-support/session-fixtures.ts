import { type CombatDeps, CombatRuntime } from "#wow/combat";
import { CombatStore } from "#wow/combat-store";
import { type DestroyDeps, ItemDestroyRuntime } from "#wow/destroy";
import { DestroyStore } from "#wow/destroy-store";
import { MotionStore } from "#wow/motion-store";
import { QuestStore } from "#wow/quest-store";
import { type QuestDeps, QuestRuntime } from "#wow/quests";
import { type RecoveryDeps, RecoveryRuntime } from "#wow/recovery";
import { RecoveryStore } from "#wow/recovery-store";
import { type RewardsDeps, RewardsRuntime } from "#wow/rewards";
import { RewardsStore } from "#wow/rewards-store";
import {
  buildSessionStores,
  type SessionDeps,
  type SessionStores,
} from "#wow/session-stores";
import { type TrainerDeps, TrainerRuntime } from "#wow/trainer";
import { TrainerStore } from "#wow/trainer-store";
import { type VendorDeps, VendorRuntime } from "#wow/vendor";
import { VendorStore } from "#wow/vendor-store";

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
    updateEntity: () => undefined,
    ...deps,
  });
}

export function rewardsParts(deps: RewardsDeps) {
  const store = new RewardsStore(deps);
  const runtime = new RewardsRuntime(store, deps);
  return { runtime, store };
}

export function recoveryParts(deps: RecoveryDeps) {
  const store = new RecoveryStore(deps);
  const runtime = new RecoveryRuntime(store, deps);
  return { runtime, store };
}

export function questParts(deps: QuestDeps) {
  const store = new QuestStore(deps);
  const runtime = new QuestRuntime(store, deps);
  return { runtime, store };
}

export function vendorParts(deps: VendorDeps) {
  const store = new VendorStore(deps);
  const runtime = new VendorRuntime(store, deps);
  return { runtime, store };
}

export function trainerParts(deps: TrainerDeps) {
  const store = new TrainerStore(deps);
  const runtime = new TrainerRuntime(store, deps);
  return { runtime, store };
}

export function destroyParts(deps: DestroyDeps) {
  const store = new DestroyStore(deps);
  const runtime = new ItemDestroyRuntime(store, deps);
  return { runtime, store };
}
