import { PlaceStore } from "#wow/client-place";
import { CombatStore } from "#wow/combat-store";
import type { ControlPose } from "#wow/control";
import { DestroyStore } from "#wow/destroy-store";
import type { EntityLookup } from "#wow/entity-store";
import { ItemTemplates } from "#wow/item-use";
import { MotionStore } from "#wow/motion-store";
import { QuestStore } from "#wow/quest-store";
import { RecoveryStore } from "#wow/recovery-store";
import { RewardsStore } from "#wow/rewards-store";
import { TrainerStore } from "#wow/trainer-store";
import { VendorStore } from "#wow/vendor-store";
import type { WorldConn } from "#wow/world-conn";
import { selfGuid, sendPacket } from "#wow/world-handlers";

export type SessionDeps = {
  send: (opcode: number, body?: Uint8Array) => void;
  now: () => number;
  selfGuid: () => bigint;
  getEntity: EntityLookup;
};

export type SessionStores = {
  combat: CombatStore;
  motion: MotionStore;
  rewards: RewardsStore;
  items: ItemTemplates;
  quests: QuestStore;
  recovery: RecoveryStore;
  vendor: VendorStore;
  trainer: TrainerStore;
  destroy: DestroyStore;
  place: PlaceStore;
};

export function sessionDeps(conn: WorldConn): SessionDeps {
  return {
    send: (opcode, body) => sendPacket(conn, opcode, body ?? new Uint8Array()),
    now: () => Date.now(),
    selfGuid: () => selfGuid(conn),
    getEntity: (guid) => conn.entityStore.get(guid),
  };
}

export function createSessionStores(conn: WorldConn): SessionStores {
  return buildSessionStores({
    ...sessionDeps(conn),
    pose: () => conn.control?.snapshot().pose,
  });
}

export function buildSessionStores(
  deps: SessionDeps & { pose: () => ControlPose | undefined },
): SessionStores {
  const combat = new CombatStore(deps);
  return {
    combat,
    motion: new MotionStore(deps.now),
    rewards: new RewardsStore(deps),
    items: new ItemTemplates(deps),
    quests: new QuestStore(deps),
    recovery: new RecoveryStore(deps),
    vendor: new VendorStore(deps),
    trainer: new TrainerStore({ ...deps, learned: () => combat.learned() }),
    destroy: new DestroyStore(deps),
    place: new PlaceStore(),
  };
}

export function disposeSessionStores(stores: SessionStores): void {
  stores.combat.clear();
  stores.motion.clear();
  stores.rewards.dispose();
  stores.items.dispose();
  stores.quests.dispose();
  stores.recovery.dispose();
  stores.vendor.dispose();
  stores.trainer.dispose();
  stores.destroy.dispose();
  stores.place.dispose();
}
