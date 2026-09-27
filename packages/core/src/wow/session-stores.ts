import { CombatStore } from "#wow/combat-store";
import type { EntityLookup } from "#wow/entity-store";
import { ItemTemplates } from "#wow/item-use";
import { MotionStore } from "#wow/motion-store";
import { RewardsStore } from "#wow/rewards-store";
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
  return buildSessionStores(sessionDeps(conn));
}

export function buildSessionStores(deps: SessionDeps): SessionStores {
  return {
    combat: new CombatStore(deps),
    motion: new MotionStore(deps.now),
    rewards: new RewardsStore(deps),
    items: new ItemTemplates(deps),
  };
}

export function disposeSessionStores(stores: SessionStores): void {
  stores.combat.clear();
  stores.motion.clear();
  stores.rewards.dispose();
  stores.items.dispose();
}
