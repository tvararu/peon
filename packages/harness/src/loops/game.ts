import type {
  Capabilities,
  EntityLookup,
  RecoveryEvent,
  Unsubscribe,
  WorldHandle,
} from "@peon/core";
import type { JevPort } from "#harness/jev/contract";
import type { FramingVariant } from "#harness/jev/framing";
import { CombatActions } from "#harness/loops/combat-actions";
import { defendTarget } from "#harness/loops/combat-defense";
import { readRangedGear } from "#harness/loops/combat-ranged-gear";
import { approachUnit, handleApproach } from "#harness/loops/cycle-approach";
import { pullGate } from "#harness/loops/cycle-gate";
import type {
  CycleDeps,
  CycleEvent,
  CycleState,
  ObservedCorpse,
} from "#harness/loops/cycle-types";
import { EncounterCycleRuntime } from "#harness/loops/encounter-cycle";
import {
  PilotActions,
  type PilotFrameDeps,
} from "#harness/loops/pilot-actions";
import {
  type PilotContext,
  type PilotObjective,
  pilotInstruction,
} from "#harness/loops/pilot-types";
import {
  type CombatPort,
  type ControlPort,
  combatPort,
  controlPort,
  recoveryPort,
  rewardsPort,
} from "#harness/loops/ports";
import { questCycleObjective } from "#harness/loops/quest-cycle";
import { createRuns, type Runs } from "#harness/loops/runs";
import {
  type TacticsEvent,
  TacticsLoop,
  type TacticsState,
} from "#harness/loops/tactics";
import {
  createTravel,
  navigationCovers,
  type SessionNavigation,
  type Travel,
  type TravelSession,
} from "#harness/navigation/travel";

export type GameCapabilities = Capabilities & {
  jev: boolean;
  navigation: boolean;
  pilot?: boolean;
};

export type Loops = Runs & {
  startTactics: (
    targetGuid: bigint,
    instruction: string,
    signal?: AbortSignal,
    framing?: FramingVariant,
  ) => Promise<void>;
  getTacticsState: () => TacticsState;
  onTacticsEvent: (cb: (event: TacticsEvent) => void) => Unsubscribe;
  startPilot: (
    objective: PilotObjective,
    signal?: AbortSignal,
  ) => Promise<void>;
  getPilotState: () => TacticsState;
  onPilotEvent: (cb: (event: TacticsEvent) => void) => Unsubscribe;
  startCycle: (
    guids: bigint[],
    instruction: string,
    maxStarts?: number,
  ) => Promise<void>;
  startQuestCycle: (
    questId: number,
    sources: number[],
    instruction: string,
    maxStarts?: number,
  ) => Promise<void>;
  stopCycle: () => void;
  getCycleState: () => CycleState;
  onCycleEvent: (cb: (event: CycleEvent) => void) => Unsubscribe;
  takeControl: (reason: string) => void;
};

export type Game = Omit<WorldHandle, "capabilities"> &
  Loops &
  Travel & { capabilities: () => GameCapabilities };

export type GameOptions = {
  jev?: JevPort;
  navigation?: SessionNavigation;
  pilot?: JevPort;
};

type Parts = {
  handle: WorldHandle;
  tactics: TacticsLoop;
  cycle: EncounterCycleRuntime;
  pilot: TacticsLoop<PilotContext>;
  halt: () => void;
};

function lifeEnded(event: RecoveryEvent): boolean {
  if (event.type === "recovery_invalidated") return true;
  const { life } = event.state;
  return (
    event.type === "life_observed" && (life === "dead" || life === "ghost")
  );
}

function wire({ handle, tactics, cycle, pilot }: Parts): Unsubscribe {
  const detach = [
    handle.onControlEvent((event) => cycle.observeControl(event)),
    handle.onRecoveryEvent((event) => {
      if (lifeEnded(event)) {
        tactics.stop(`self_${event.state.life}`);
        pilot.stop(`self_${event.state.life}`);
      }
      cycle.observeRecovery(event);
    }),
    handle.onRewardsEvent((event) => cycle.observeRewards(event)),
    handle.onEntityEvent((event) => cycle.observeEntity(event)),
  ];
  return () => {
    for (const off of detach) off();
  };
}

type Ports = {
  handle: WorldHandle;
  travel: Travel;
  combat: CombatPort;
  control: ControlPort;
  entity: EntityLookup;
  halt: () => void;
};

function createTactics(ports: Ports, jev: JevPort | undefined): TacticsLoop {
  const { handle, combat, control, entity, halt } = ports;
  const actions = new CombatActions({
    combat,
    combatLog: () => handle.combatlog.state(),
    control,
    entity,
    gear: () =>
      readRangedGear(handle.getControlState().selfGuid, entity, (entry) =>
        handle.itemLabel(entry),
      ),
    now: () => Date.now(),
    relation: (guid) => handle.unitRelation(guid),
    spells: () => handle.spells.state(),
  });
  return new TacticsLoop({
    activate: (context) => actions.activate(context),
    characterClass: () => handle.getSelfClass(),
    defend: (context) =>
      defendTarget({ combat, control, entity }, context.targetGuid),
    execute: (id, context) => actions.execute(id, context),
    fault: jev?.fault,
    halt,
    observe: (context) => actions.observe(context),
    async prepare(_context, signal) {
      signal.throwIfAborted();
      await handle.loadCatalogs();
      signal.throwIfAborted();
    },
    select: jev?.select,
  });
}

function createPilot(
  ports: Ports,
  navigation: SessionNavigation | undefined,
  jev: JevPort | undefined,
): TacticsLoop<PilotContext> {
  const { control, handle } = ports;
  const frame: PilotFrameDeps = {
    control,
    ground: navigation?.ground,
    life: () => handle.getRecoveryState().life,
    nearby: () => handle.queryNearby(),
    now: () => Date.now(),
  };
  return pilotLoop(frame, handle, jev);
}

function pilotLoop(
  frame: PilotFrameDeps,
  handle: WorldHandle,
  jev: JevPort | undefined,
): TacticsLoop<PilotContext> {
  const actions = new PilotActions(frame);
  return new TacticsLoop<PilotContext>({
    activate: () => actions.activate(),
    commit: (context) => actions.commit(context),
    defend: () => {
      actions.halt();
      return "none";
    },
    execute: (id, context) => actions.execute(id, context),
    halt: () => actions.halt(),
    maxResultAgeMs: 1000,
    minIntervalMs: 50,
    observe: (context) => actions.observe(context),
    async prepare(_context, signal) {
      signal.throwIfAborted();
      await handle.loadCatalogs();
      signal.throwIfAborted();
    },
    select: jev?.select,
    wait: null,
  });
}

function observedCorpse(handle: WorldHandle, guid: bigint): ObservedCorpse {
  let at: { x: number; y: number; z: number } | undefined;
  try {
    at = handle.observedPosition(guid);
  } catch {
    at = undefined;
  }
  const mapId = handle.getEntity(guid)?.position?.mapId;
  return at && mapId !== undefined
    ? { mapId, x: at.x, y: at.y, z: at.z }
    : undefined;
}

function cycleDeps(ports: Ports, tactics: TacticsLoop): CycleDeps {
  const { handle, travel, control, entity } = ports;
  return {
    approach: (guid, signal) =>
      approachUnit(handleApproach(handle, travel), guid, signal),
    bags: {
      questItems: () =>
        new Set(handle.getQuestState().items.map((item) => item.itemId)),
      stackSize: (entry) =>
        handle.getItemTemplate(entry).then(
          (template) => template?.stackSize,
          () => undefined,
        ),
    },
    control,
    entity,
    observed: (guid) => observedCorpse(handle, guid),
    gate: pullGate(() => handle.getCombatState()),
    attackers: () => handle.getCombatState().attackers,
    now: () => Date.now(),
    recovery: recoveryPort(handle),
    rewards: rewardsPort(handle),
    tactics,
  };
}

function build(handle: WorldHandle, { jev, navigation, pilot }: GameOptions) {
  let live = true;
  const travel = createTravel(handle, navigation);
  const combat = combatPort(handle);
  const control = controlPort(handle, travel);
  const halt = () => {
    if (!live) return;
    control.halt();
    combat.halt();
  };
  const entity = (guid: bigint) => handle.getEntity(guid);
  const ports = { combat, control, entity, halt, handle, travel };
  const tactics = createTactics(ports, jev);
  const pilotTactics = createPilot(ports, navigation, pilot ?? jev);
  const deps = cycleDeps(ports, tactics);
  const cycle = new EncounterCycleRuntime(deps);
  const runs = createRuns({
    ...deps,
    cycleActive: () => cycle.snapshot().active,
    events: {
      control: (cb) => handle.onControlEvent(cb),
      entity: (cb) => handle.onEntityEvent(cb),
      recovery: (cb) => handle.onRecoveryEvent(cb),
      rewards: (cb) => handle.onRewardsEvent(cb),
    },
  });
  const parts: Parts = { cycle, halt, handle, pilot: pilotTactics, tactics };
  const unwire = wire(parts);
  const retire = () => {
    if (!live) return;
    live = false;
    unwire();
    tactics.dispose();
    pilotTactics.dispose();
    cycle.dispose();
    travel.dispose();
  };
  const shutDown = () => {
    retire();
    travel.close();
  };
  return { parts, retire, runs, shutDown, travel };
}

function retiring(
  handle: WorldHandle,
  retire: () => void,
  travel: TravelSession,
): Pick<WorldHandle, "close" | "logout"> {
  return {
    close() {
      retire();
      handle.close();
      travel.close();
    },
    logout() {
      retire();
      handle.logout();
      travel.close();
    },
  };
}

function travelApi(travel: Travel): Travel {
  const { getNavigationState, goTo, nudge, observeNavigation, walkToward } =
    travel;
  return { getNavigationState, goTo, nudge, observeNavigation, walkToward };
}

function gameCapabilities(
  handle: WorldHandle,
  { jev, navigation }: GameOptions,
): GameCapabilities {
  const mapId = handle.getControlState().pose?.mapId;
  return {
    ...handle.capabilities(),
    jev: jev !== undefined,
    navigation: navigationCovers(navigation, mapId),
  };
}

export function createGame(
  handle: WorldHandle,
  options: GameOptions = {},
): Game {
  const { parts, runs, retire, shutDown, travel } = build(handle, options);
  const { tactics, pilot, cycle, halt } = parts;
  const takeControl = gameTakeControl(tactics, pilot, cycle);
  const beginCycle = gameBeginCycle(takeControl, halt);
  return gameApi({
    beginCycle,
    handle,
    options,
    parts: { cycle, halt, pilot, runs, tactics, travel },
    retire,
    shutDown,
    takeControl,
  });
}

type GameParts = {
  tactics: TacticsLoop;
  pilot: TacticsLoop<PilotContext>;
  cycle: EncounterCycleRuntime;
  halt: () => void;
  runs: Runs;
  travel: TravelSession;
};

function gameTakeControl(
  tactics: TacticsLoop,
  pilot: TacticsLoop<PilotContext>,
  cycle: EncounterCycleRuntime,
): (reason: string) => void {
  return (reason: string) => {
    cycle.stop(reason);
    tactics.stop(reason);
    pilot.stop(reason);
  };
}

function gameBeginCycle(
  takeControl: (reason: string) => void,
  halt: () => void,
): (start: () => Promise<void>) => Promise<void> {
  return (start: () => Promise<void>) => {
    takeControl("manual_override");
    halt();
    return start();
  };
}

type GameApiInput = {
  handle: WorldHandle;
  options: GameOptions;
  parts: GameParts;
  takeControl: (reason: string) => void;
  beginCycle: (start: () => Promise<void>) => Promise<void>;
  retire: () => void;
  shutDown: () => void;
};

function gameApi(input: GameApiInput): Game {
  const { beginCycle, handle, options, retire, shutDown, takeControl } = input;
  handle.closed.then(shutDown, shutDown);
  const { cycle, pilot, runs, tactics, travel } = input.parts;
  return {
    ...handle,
    ...runs,
    capabilities: () => gameCapabilities(handle, options),
    ...travelApi(travel),
    ...retiring(handle, retire, travel),
    getCycleState: () => cycle.snapshot(),
    getPilotState: () => pilot.snapshot(),
    getTacticsState: () => tactics.snapshot(),
    halt() {
      tactics.stop("halt");
      pilot.stop("halt");
      cycle.stop("halt");
      handle.halt();
    },
    onCycleEvent: (cb) => cycle.onEvent(cb),
    onPilotEvent: (cb) => pilot.onEvent(cb),
    onTacticsEvent: (cb) => tactics.onEvent(cb),
    startCycle: (guids, instruction, maxStarts) =>
      beginCycle(() => cycle.start({ guids, instruction, maxStarts })),
    async startQuestCycle(questId, sources, instruction, maxStarts) {
      const { objective, defaultMaxStarts } = await questCycleObjective(
        handle,
        questId,
        sources,
      );
      await beginCycle(() =>
        cycle.start({
          guids: [],
          instruction,
          maxStarts: maxStarts ?? defaultMaxStarts,
          objective,
        }),
      );
    },
    startTactics(targetGuid, instruction, signal, framing) {
      const life = handle.getRecoveryState().life;
      if (life === "dead" || life === "ghost")
        throw new Error("self_not_alive");
      return tactics.start({ framing, instruction, targetGuid }, signal);
    },
    startPilot(objective, signal) {
      const life = handle.getRecoveryState().life;
      if (life === "dead" || life === "ghost")
        throw new Error("self_not_alive");
      return pilot.start(
        { instruction: pilotInstruction(objective), objective },
        signal,
      );
    },
    stopCycle: () => cycle.stop("manual_override"),
    takeControl,
  };
}
