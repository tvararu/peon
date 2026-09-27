import type { Unsubscribe } from "#lib/emitter";
import type { ClientConfig } from "#wow/client";
import { cycleApproach } from "#wow/client-control";
import type { Capabilities } from "#wow/client-extras";
import { CombatRuntime } from "#wow/combat";
import { CombatActions } from "#wow/combat-actions";
import { defendTarget } from "#wow/combat-defense";
import { readRangedGear } from "#wow/combat-ranged-gear";
import { ControlRuntime } from "#wow/control";
import type { GroundOracle } from "#wow/control-motion";
import { approachUnit, type CycleApproach } from "#wow/cycle-approach";
import { pullGate } from "#wow/cycle-gate";
import { ItemDestroyRuntime } from "#wow/destroy";
import { EncounterCycleRuntime } from "#wow/encounter-cycle";
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
import { TacticsLoop } from "#wow/tactics";
import { TrainerRuntime } from "#wow/trainer";
import { VendorRuntime } from "#wow/vendor";
import type { WorldConn } from "#wow/world-conn";
import { selfGuid, sendPacket } from "#wow/world-handlers";

export type Runtimes = {
  control: ControlRuntime;
  combat: CombatRuntime;
  tactics: TacticsLoop;
  recovery: RecoveryRuntime;
  quests: QuestRuntime;
  rewards: RewardsRuntime;
  items: ItemTemplates;
  cycle: EncounterCycleRuntime;
  trainer: TrainerRuntime;
  vendor: VendorRuntime;
  destroy: ItemDestroyRuntime;
  prepareCatalog: () => Promise<void>;
  factions: () => FactionTemplateCatalog | undefined;
  capabilities: () => Capabilities;
  navigation: () => Navigation;
  observedTarget: (guid: bigint) => NavPoint;
  halt: () => void;
  takeControl: (reason: string) => void;
  dispose: (sendStop: boolean) => void;
};

type RuntimeParts = {
  control: ControlRuntime;
  combat: CombatRuntime;
  tactics: TacticsLoop;
  recovery: RecoveryRuntime;
  quests: QuestRuntime;
  rewards: RewardsRuntime;
  items: ItemTemplates;
  cycle: EncounterCycleRuntime;
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

function createTactics(
  conn: WorldConn,
  config: ClientConfig,
  hooks: {
    actions: CombatActions;
    prepare: (signal: AbortSignal) => Promise<void>;
    halt: () => void;
    defense: { combat: CombatRuntime; control: ControlRuntime };
  },
): TacticsLoop {
  const { actions } = hooks;
  return new TacticsLoop({
    fault: config.jev?.fault,
    characterClass: () => conn.selfClass,
    select: config.jev?.select,
    prepare: (_context, signal) => hooks.prepare(signal),
    activate: (context) => actions.activate(context),
    observe: (context) => actions.observe(context),
    execute: (id, context) => actions.execute(id, context),
    halt: hooks.halt,
    defend: (context) =>
      defendTarget(
        { ...hooks.defense, entity: (guid) => conn.entityStore.get(guid) },
        context.targetGuid,
      ),
  });
}

function wireEvents(conn: WorldConn, parts: RuntimeParts): Unsubscribe {
  const {
    control,
    combat,
    recovery,
    quests,
    rewards,
    cycle,
    tactics,
    trainer,
    vendor,
    destroy,
    items,
  } = parts;
  const { events } = conn;
  const detach = [
    control.onEvent((event) => {
      events.control.emit(event);
      cycle.observeControl(event);
    }),
    combat.onEvent((event) => {
      events.combat.emit(event);
      if (event.type === "learned") trainer.observe();
    }),
    tactics.onEvent((event) => events.tactics.emit(event)),
    recovery.onEvent((event) => {
      if (
        event.type === "recovery_invalidated" ||
        (event.type === "life_observed" &&
          (event.state.life === "dead" || event.state.life === "ghost"))
      ) {
        tactics.stop(`self_${event.state.life}`);
      }
      events.recovery.emit(event);
      cycle.observeRecovery(event);
    }),
    quests.onEvent((event) => events.quest.emit(event)),
    rewards.onEvent((event) => {
      events.rewards.emit(event);
      items.observeRewards(event);
      cycle.observeRewards(event);
    }),
    cycle.onEvent((event) => events.cycle.emit(event)),
    trainer.onEvent((event) => events.trainer.emit(event)),
    vendor.onEvent((event) => {
      events.vendor.emit(event);
      if (event.type !== "listed") return;
      for (const good of event.state.window?.items ?? [])
        items.label(good.itemId);
    }),
    destroy.onEvent((event) => events.destroy.emit(event)),
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
    tactics,
    recovery,
    quests,
    rewards,
    cycle,
    trainer,
    vendor,
    destroy,
  } = parts;
  options.unwire();
  if (options.sendStop) options.halt();
  lazy.disposed = true;
  control.dispose();
  tactics.dispose();
  recovery.dispose();
  quests.dispose();
  rewards.dispose();
  combat.dispose();
  cycle.dispose();
  trainer.dispose();
  vendor.dispose();
  destroy.dispose();
  lazy.navigation?.close();
}

function createSupportRuntimes(
  conn: WorldConn,
  stores: SessionStores,
  parts: Pick<RuntimeParts, "control" | "tactics" | "combat"> & {
    approach: CycleApproach;
  },
): Pick<
  RuntimeParts,
  "recovery" | "quests" | "rewards" | "items" | "cycle" | "vendor" | "destroy"
> {
  const { control, tactics, approach, combat } = parts;
  const runtimeDeps = sessionDeps(conn);
  const recovery = new RecoveryRuntime({
    ...runtimeDeps,
    pose: () => control.snapshot().pose,
  });
  conn.recovery = recovery;
  const quests = new QuestRuntime(runtimeDeps);
  conn.quests = quests;
  const rewards = new RewardsRuntime(stores.rewards, runtimeDeps);
  const { items } = stores;
  const cycle = new EncounterCycleRuntime({
    approach,
    gate: pullGate(() => combat.snapshot()),
    tactics,
    rewards,
    recovery,
    control,
    entity: (guid) => conn.entityStore.get(guid),
    bags: {
      questItems: () =>
        new Set(quests.snapshot().items.map((item) => item.itemId)),
      stackSize: (entry) =>
        items.lookup(entry).then(
          (template) => template?.stackSize,
          () => undefined,
        ),
    },
    now: runtimeDeps.now,
  });
  conn.cycle = cycle;
  const vendor = new VendorRuntime(runtimeDeps);
  conn.vendor = vendor;
  const destroy = new ItemDestroyRuntime(runtimeDeps);
  conn.destroy = destroy;
  return { recovery, quests, rewards, items, cycle, vendor, destroy };
}

function createCombat(
  conn: WorldConn,
  stores: SessionStores,
  lazy: LazyState,
  control: ControlRuntime,
): { combat: CombatRuntime; actions: CombatActions; trainer: TrainerRuntime } {
  const runtimeDeps = sessionDeps(conn);
  const combat = new CombatRuntime(stores, {
    ...runtimeDeps,
    selectedGuid: () => control.snapshot().target,
    selfPose: () => control.snapshot().pose,
    selfServerPose: () => control.snapshot().serverPose,
  });
  const actions = new CombatActions({
    combat,
    control,
    entity: (guid) => conn.entityStore.get(guid),
    factions: () => lazy.factions,
    now: () => Date.now(),
    gear: () =>
      readRangedGear(runtimeDeps.selfGuid(), runtimeDeps.getEntity, (entry) =>
        stores.items.label(entry),
      ),
  });
  const trainer = new TrainerRuntime({
    ...runtimeDeps,
    learned: () => combat.snapshot().learned,
  });
  conn.trainer = trainer;
  return { combat, actions, trainer };
}

export function catalogAccess(
  config: ClientConfig,
  lazy: LazyState,
  combat: CombatRuntime,
  control: Pick<ControlRuntime, "snapshot">,
): Pick<Runtimes, "prepareCatalog" | "factions" | "capabilities"> {
  warmCatalogs(config, lazy, combat);
  return {
    prepareCatalog: () => loadCatalog(config, lazy, combat),
    factions: () => lazy.factions,
    capabilities: () =>
      capabilitiesOf(config, lazy, control.snapshot().pose?.mapId),
  };
}

function preparer(
  config: ClientConfig,
  lazy: LazyState,
  data: Pick<Runtimes, "prepareCatalog">,
): (signal: AbortSignal) => Promise<void> {
  return async (signal) => {
    signal.throwIfAborted();
    await data.prepareCatalog();
    signal.throwIfAborted();
    await loadFactions(config, lazy);
    signal.throwIfAborted();
  };
}

function lateApproach(getNavigation: () => Navigation) {
  let routes: Parameters<typeof cycleApproach>[0] | undefined;
  const approach: CycleApproach = async (guid, signal) =>
    routes && approachUnit(cycleApproach(routes), guid, signal);
  return {
    approach,
    bind(conn: WorldConn, parts: Pick<RuntimeParts, "control" | "combat">) {
      const observedTarget = (guid: bigint) =>
        findObservedTarget(conn, parts, guid);
      routes = {
        control: parts.control,
        navigation: getNavigation,
        observedTarget,
      };
      return observedTarget;
    },
  };
}

export function createRuntimes(
  conn: WorldConn,
  stores: SessionStores,
  config: ClientConfig,
): Runtimes {
  const lazy: LazyState = { disposed: false };
  const getNavigation = (): Navigation => loadNavigation(config, lazy);
  conn.control = createControl(conn, groundOracle(config, lazy));
  const control = conn.control;
  const { combat, actions, trainer } = createCombat(
    conn,
    stores,
    lazy,
    control,
  );
  const data = catalogAccess(config, lazy, combat, control);
  const { approach, bind } = lateApproach(getNavigation);
  function rawHalt(reason = "halt"): void {
    if (lazy.disposed) return;
    control.setLease("manual");
    control.halt(reason);
    combat.halt();
  }
  const tactics = createTactics(conn, config, {
    actions,
    prepare: preparer(config, lazy, data),
    halt: rawHalt,
    defense: { combat, control },
  });
  conn.tactics = tactics;
  const parts: RuntimeParts = {
    control,
    combat,
    tactics,
    ...createSupportRuntimes(conn, stores, {
      approach,
      combat,
      control,
      tactics,
    }),
    trainer,
  };
  const unwire = wireEvents(conn, parts);
  const observedTarget = bind(conn, parts);
  return {
    ...parts,
    ...data,
    navigation: getNavigation,
    observedTarget,
    halt: () => rawHalt(),
    takeControl(reason): void {
      parts.cycle.stop(reason);
      parts.tactics.stop(reason);
    },
    dispose(sendStop: boolean): void {
      if (lazy.disposed) return;
      disposeParts(parts, lazy, { sendStop, halt: rawHalt, unwire });
    },
  };
}
