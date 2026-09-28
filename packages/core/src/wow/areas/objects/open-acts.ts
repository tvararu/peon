import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import {
  type LockCatalog,
  type LockEntry,
  loadLockCatalog,
} from "#wow/areas/objects/lock-catalog";
import { pickOpenLock } from "#wow/areas/objects/open-lock";
import type {
  ObjectsEvent,
  ObjectsStore,
  PageChain,
  UnansweredPage,
  UseRecord,
  UseRefusal,
} from "#wow/areas/objects/store";
import type { Entity, EntityLookup } from "#wow/entity-store";
import { readInventory } from "#wow/inventory";
import { GameOpcode } from "#wow/protocol/opcodes";
import { buildCastSpell } from "#wow/protocol/spell";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";
import type { CoreStores } from "#wow/session-stores";
export type OpenOutcome =
  | { ok: true }
  | { ok: false; reason: "unknown" }
  | {
      ok: false;
      reason: "loot_open" | "locked" | "no_lock_data";
      skill?: number;
      need?: number;
    };
export type UseOutcome = { ok: true; record: UseRecord } | UseRefusal;
export type ObjectsActs = {
  enterTrigger: (triggerId: number) => void;
  use: (guid: bigint) => UseOutcome;
  open: (guid: bigint, spellId: number) => OpenOutcome;
  openLockSpell: (entry: number) => Promise<OpenLockQuery>;
  readPage: (pageId: number) => Promise<PageChain | UnansweredPage>;
};
export type OpenLockQuery =
  | { by: "spell"; spellId: number }
  | { by: "item"; entry: number }
  | {
      ok: false;
      reason: "locked" | "no_lock_data";
      skill: number;
      need: number;
    };

const SKILL_SLOTS = 128;

function skillOf(
  getEntity: EntityLookup,
  selfGuid: bigint,
  skill: number,
): number {
  const self = getEntity(selfGuid);
  const raw = self?.rawFields;
  if (!raw) return 0;
  const base = PLAYER_FIELDS.SKILL_INFO.offset;
  for (let i = 0; i < SKILL_SLOTS; i++) {
    const id = (raw.get(base + i * 3) ?? 0) & 0xff_ff;
    if (id !== skill) continue;
    const value = raw.get(base + i * 3 + 1) ?? 0;
    const bonus = raw.get(base + i * 3 + 2) ?? 0;
    const signed = (n: number) => (n >= 0x80_00 ? n - 0x1_00_00 : n);
    return Math.max(
      0,
      (value & 0xff_ff) +
        signed(bonus & 0xff_ff) +
        signed((bonus >> 16) & 0xff_ff),
    );
  }
  return 0;
}

function openSpell(core: CoreStores): { id: number } | undefined {
  return core.combat
    .spellbook()
    .find((spell) => spell.effects.some((effect) => effect.effect === 33));
}

function unlockable(
  catalog: LockCatalog | undefined,
  lockId: number,
): LockEntry | OpenLockQuery {
  if (lockId === 0) return { id: 0, cases: [] };
  const lock = catalog?.get(lockId);
  if (!lock) return { ok: false, reason: "no_lock_data", skill: 0, need: 0 };
  return lock;
}

type Env = {
  ctx: AreaRuntimeCtx<ObjectsEvent>;
  store: ObjectsStore;
  core: CoreStores;
};

function choiceFor(env: Env, lock: LockEntry): OpenLockQuery {
  const { ctx, store, core } = env;
  const selfGuid = ctx.selfGuid() ?? 0n;
  const carried = readInventory(selfGuid, (guid) => store.entity(guid));
  const entries = new Set<number>();
  for (const slot of carried.slots) {
    if (slot.status === "occupied" && slot.item.entry !== undefined)
      entries.add(slot.item.entry);
  }
  const choice = pickOpenLock({
    hasItem: (item) => entries.has(item),
    lock,
    skillOf: (skill) =>
      skillOf(
        (guid) => store.entity(guid) as Entity | undefined,
        selfGuid,
        skill,
      ),
    spellbook: core.combat.spellbook(),
  });
  if ("by" in choice) return choice;
  return {
    ok: false,
    reason: "locked",
    skill: choice.skill,
    need: choice.need,
  };
}

export function openObject(
  env: Env,
  guid: bigint,
  spellId: number,
): OpenOutcome {
  const { ctx, store, core } = env;
  if (core.rewards.loot.phase !== "closed")
    return { ok: false, reason: "loot_open" };
  const object = store.object(guid);
  if (!object) return { ok: false, reason: "unknown" };
  core.rewards.requestOpen(guid);
  ctx.send(
    GameOpcode.CMSG_CAST_SPELL,
    buildCastSpell(0, spellId, { guid, kind: "object" }),
  );
  store.recordOpen(object, spellId);
  return { ok: true as const };
}

export function queryOpenLock(env: Env, entry: number): Promise<OpenLockQuery> {
  const { store, core } = env;
  return store.waitLocks().then((catalog) => {
    const lockId = store.lockOf(entry);
    if (lockId === undefined)
      return { ok: false, reason: "no_lock_data", skill: 0, need: 0 };
    if (lockId === 0) {
      const any = openSpell(core);
      if (any) return { by: "spell", spellId: any.id };
      return { ok: false, reason: "locked", skill: 0, need: 0 };
    }
    const lock = unlockable(catalog, lockId);
    if (!("cases" in lock)) return lock;
    return choiceFor(env, lock);
  });
}

export function loadLocks(
  ctx: AreaRuntimeCtx<ObjectsEvent>,
  store: ObjectsStore,
): void {
  const { dbc, signal } = ctx;
  if (!dbc) return;
  store.loadingLocks();
  loadLockCatalog(dbc)
    .then(
      (catalog) => {
        if (!signal.aborted) store.useLocks(catalog);
      },
      () => store.locksFailed(),
    )
    .catch(ignoreFailure);
}
