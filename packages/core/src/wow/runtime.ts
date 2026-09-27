import type { Unsubscribe } from "#lib/emitter";
import type { ClientConfig } from "#wow/client";
import type { Capabilities } from "#wow/client-extras";
import { CombatRuntime } from "#wow/combat";
import { ControlRuntime } from "#wow/control";
import { feedControl } from "#wow/control-feed";
import type { GroundOracle } from "#wow/control-motion";
import { ItemDestroyRuntime } from "#wow/destroy";
import type { FactionTemplateCatalog } from "#wow/faction-template";
import type { ItemTemplates } from "#wow/item-use";
import type { Navigation, NavPoint } from "#wow/navigation";
import { observedTargetPosition } from "#wow/observed-target";
import { ObjectType } from "#wow/protocol/entity-fields";
import { QuestRuntime } from "#wow/quests";
import { RecoveryRuntime } from "#wow/recovery";
import { RewardsRuntime } from "#wow/rewards";
import {
  capabilitiesOf,
  type LazyState,
  loadCatalog,
  loadFactions,
  loadNavigation,
  warmCatalogs,
} from "#wow/runtime-data";
import { type SessionStores, sessionDeps } from "#wow/session-stores";
import { TrainerRuntime } from "#wow/trainer";
import { VendorRuntime } from "#wow/vendor";
import type { WorldConn } from "#wow/world-conn";
import { selfGuid, sendPacket } from "#wow/world-handlers";

export type Runtimes = {
  control: ControlRuntime;
  combat: CombatRuntime;
  recovery: RecoveryRuntime;
  quests: QuestRuntime;
  rewards: RewardsRuntime;
  items: ItemTemplates;
  trainer: TrainerRuntime;
  vendor: VendorRuntime;
  destroy: ItemDestroyRuntime;
  prepareCatalog: () => Promise<void>;
  loadCatalogs: () => Promise<void>;
  factions: () => FactionTemplateCatalog | undefined;
  capabilities: () => Capabilities;
  navigation: () => Navigation;
  observedTarget: (guid: bigint) => NavPoint;
  halt: () => void;
  dispose: (sendStop: boolean) => void;
};

type RuntimeParts = {
  control: ControlRuntime;
  combat: CombatRuntime;
  recovery: RecoveryRuntime;
  quests: QuestRuntime;
  rewards: RewardsRuntime;
  items: ItemTemplates;
  trainer: TrainerRuntime;
  vendor: VendorRuntime;
  destroy: ItemDestroyRuntime;
};

function groundOracle(
  config: ClientConfig,
  lazy: LazyState,
): GroundOracle | undefined {
  if (!capabilitiesOf(config, lazy).navigation) return undefined;
  const getNavigation = (): Navigation => loadNavigation(config, lazy);
  return {
    height: (mapId, x, y, from) => {
      try {
        const navigation = getNavigation();
        return from
          ? navigation.stepHeight(mapId, x, y, from)
          : navigation.height(mapId, x, y);
      } catch {
        return Number.NaN;
      }
    },
    pathClear: (mapId, from, to) => {
      try {
        return getNavigation().clear(mapId, from, to);
      } catch {
        return false;
      }
    },
  };
}

function createControl(
  conn: WorldConn,
  ground: GroundOracle | undefined,
): ControlRuntime {
  return new ControlRuntime({
    send: (opcode, body) => sendPacket(conn, opcode, body ?? new Uint8Array()),
    ticks: () => Date.now() - conn.startTime,
    now: () => Date.now(),
    selfGuid: () => selfGuid(conn),
    ground,
  });
}

function wireStores(
  conn: WorldConn,
  stores: SessionStores,
  { control }: Pick<RuntimeParts, "control">,
): Unsubscribe[] {
  return [
    stores.place.onEvent((event) =>
      conn.events.control.emit({ ...event, state: control.snapshot() }),
    ),
    stores.self.onEvent((event) => feedControl(control, event)),
    conn.entityStore.onEvent((event) => {
      if (event.type === "disappear") control.observeDisappear(event.guid);
    }),
  ];
}

function wireEvents(
  conn: WorldConn,
  stores: SessionStores,
  parts: RuntimeParts,
): Unsubscribe {
  const {
    control,
    combat,
    recovery,
    quests,
    rewards,
    trainer,
    vendor,
    destroy,
    items,
  } = parts;
  const { events } = conn;
  const detach = [
    control.onEvent((event) => {
      events.control.emit(event);
    }),
    combat.onEvent((event) => {
      events.combat.emit(event);
      if (event.type === "learned") stores.trainer.observe();
    }),
    recovery.onEvent((event) => events.recovery.emit(event)),
    quests.onEvent((event) => events.quest.emit(event)),
    rewards.onEvent((event) => {
      events.rewards.emit(event);
      items.observeRewards(event);
    }),
    trainer.onEvent((event) => events.trainer.emit(event)),
    vendor.onEvent((event) => {
      events.vendor.emit(event);
      if (event.type !== "listed") return;
      for (const good of event.state.window?.items ?? [])
        items.label(good.itemId);
    }),
    destroy.onEvent((event) => events.destroy.emit(event)),
    ...wireStores(conn, stores, parts),
  ];
  return () => {
    for (const off of detach) off();
  };
}

function findObservedTarget(
  conn: WorldConn,
  parts: Pick<RuntimeParts, "control" | "combat">,
  guid: bigint,
): NavPoint {
  const entity = conn.entityStore.get(guid);
  if (!entity || guid === selfGuid(conn))
    throw new Error("target_not_observed");
  const self = parts.control.snapshot().pose;
  if (!self) throw new Error("no_pose");
  const unit =
    entity.objectType === ObjectType.UNIT ||
    entity.objectType === ObjectType.PLAYER
      ? parts.combat.unit(guid)
      : undefined;
  return observedTargetPosition(entity, unit, self.mapId);
}

function disposeParts(
  parts: RuntimeParts,
  lazy: LazyState,
  options: { sendStop: boolean; halt: () => void; unwire: Unsubscribe },
): void {
  const {
    control,
    combat,
    recovery,
    quests,
    rewards,
    trainer,
    vendor,
    destroy,
  } = parts;
  options.unwire();
  if (options.sendStop) options.halt();
  lazy.disposed = true;
  control.dispose();
  recovery.dispose();
  quests.dispose();
  rewards.dispose();
  combat.dispose();
  trainer.dispose();
  vendor.dispose();
  destroy.dispose();
  lazy.navigation?.close();
}

function createSupportRuntimes(
  conn: WorldConn,
  stores: SessionStores,
  control: ControlRuntime,
): Pick<
  RuntimeParts,
  "recovery" | "quests" | "rewards" | "items" | "vendor" | "destroy"
> {
  const runtimeDeps = sessionDeps(conn);
  const recovery = new RecoveryRuntime(stores.recovery, {
    ...runtimeDeps,
    pose: () => control.snapshot().pose,
  });
  const quests = new QuestRuntime(stores.quests, runtimeDeps);
  const rewards = new RewardsRuntime(stores.rewards, runtimeDeps);
  const { items } = stores;
  const vendor = new VendorRuntime(stores.vendor, runtimeDeps);
  const destroy = new ItemDestroyRuntime(stores.destroy, runtimeDeps);
  return { recovery, quests, rewards, items, vendor, destroy };
}

function createCombat(
  conn: WorldConn,
  stores: SessionStores,
  control: ControlRuntime,
): { combat: CombatRuntime; trainer: TrainerRuntime } {
  const runtimeDeps = sessionDeps(conn);
  const combat = new CombatRuntime(stores, {
    ...runtimeDeps,
    selectedGuid: () => control.snapshot().target,
    selfPose: () => control.snapshot().pose,
    selfServerPose: () => control.snapshot().serverPose,
  });
  const trainer = new TrainerRuntime(stores.trainer, {
    ...runtimeDeps,
    learned: () => stores.combat.learned(),
  });
  return { combat, trainer };
}

export function catalogAccess(
  config: ClientConfig,
  lazy: LazyState,
  combat: CombatRuntime,
  control: Pick<ControlRuntime, "snapshot">,
): Pick<
  Runtimes,
  "prepareCatalog" | "loadCatalogs" | "factions" | "capabilities"
> {
  warmCatalogs(config, lazy, combat);
  const prepareCatalog = () => loadCatalog(config, lazy, combat);
  return {
    prepareCatalog,
    async loadCatalogs() {
      await prepareCatalog();
      await loadFactions(config, lazy);
    },
    factions: () => lazy.factions,
    capabilities: () =>
      capabilitiesOf(config, lazy, control.snapshot().pose?.mapId),
  };
}

export function createRuntimes(
  conn: WorldConn,
  stores: SessionStores,
  config: ClientConfig,
): Runtimes {
  const lazy: LazyState = { disposed: false };
  const getNavigation = (): Navigation => loadNavigation(config, lazy);
  const control = createControl(conn, groundOracle(config, lazy));
  const { combat, trainer } = createCombat(conn, stores, control);
  const data = catalogAccess(config, lazy, combat, control);
  function rawHalt(reason = "halt"): void {
    if (lazy.disposed) return;
    control.setLease("manual");
    control.halt(reason);
    combat.halt();
  }
  const parts: RuntimeParts = {
    control,
    combat,
    ...createSupportRuntimes(conn, stores, control),
    trainer,
  };
  const unwire = wireEvents(conn, stores, parts);
  return {
    ...parts,
    ...data,
    navigation: getNavigation,
    observedTarget: (guid) => findObservedTarget(conn, parts, guid),
    halt: () => rawHalt(),
    dispose(sendStop: boolean): void {
      if (lazy.disposed) return;
      disposeParts(parts, lazy, { sendStop, halt: rawHalt, unwire });
    },
  };
}
