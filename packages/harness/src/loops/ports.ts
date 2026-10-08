import type {
  AreaState,
  CombatState,
  ControlState,
  MovementDirection,
  MovementInput,
  RecoveryState,
  RewardsState,
  SpellDefinition,
  WorldHandle,
} from "@peon/core";
import type { NavigationState } from "#harness/navigation/route-follower";
import type { Travel } from "#harness/navigation/travel";

export type CombatPort = {
  snapshot: (targetGuid?: bigint) => CombatState;
  channel: () => AreaState<"spells">["channel"];
  definition: (spellId: number) => SpellDefinition | undefined;
  readyAt: (spellId: number) => number;
  isAttackingSelf: (guid: bigint) => boolean;
  cast: (spellId: number, targetGuid: bigint) => void;
  attack: (targetGuid: bigint) => void;
  cancelCast: () => void;
  stopAttack: () => void;
  stopAutoRepeat: () => void;
  petAttack: (petGuid: bigint, targetGuid: bigint) => void;
  halt: () => void;
};

export type ControlPort = {
  snapshot: () => ControlState;
  navigationState: () => NavigationState;
  face: (orientation: number) => void;
  goTo: (guid: bigint) => void;
  move: (direction: MovementDirection, durationMs: number) => void;
  drive: (input: MovementInput, durationMs: number) => void;
  jump: () => void;
  settle: () => void;
  halt: (reason?: string) => void;
  selectTarget: (guid: bigint) => void;
};

export type RewardsPort = {
  snapshot: () => RewardsState;
  open: (guid: bigint) => void;
  abandonOpen: () => void;
  take: (slot: number) => void;
  takeMoney: () => void;
  close: () => void;
};

export type RecoveryPort = {
  snapshot: () => RecoveryState;
  releaseSpirit: () => void;
  queryCorpse: () => void;
  reclaimCorpse: () => void;
  respondResurrection: (accept: boolean) => void;
};

export function combatPort(handle: WorldHandle): CombatPort {
  return {
    attack: (targetGuid) => handle.attack(targetGuid),
    cancelCast: () => handle.cancelCast(),
    cast: (spellId, targetGuid) => handle.cast(spellId, targetGuid),
    channel: () => handle.spells.state().channel,
    definition: (spellId) => handle.spellDefinition(spellId),
    halt: () => handle.stopCombat(),
    isAttackingSelf: (guid) => handle.isAttackingSelf(guid),
    petAttack: (petGuid, targetGuid) => handle.petAttack(petGuid, targetGuid),
    readyAt: (spellId) => handle.spellReadyAt(spellId),
    snapshot: (targetGuid) => handle.getCombatState(targetGuid),
    stopAttack: () => handle.stopAttack(),
    stopAutoRepeat: () => handle.stopAutoRepeat(),
  };
}

export function controlPort(handle: WorldHandle, travel: Travel): ControlPort {
  return {
    drive: (input, durationMs) => handle.drive(input, durationMs),
    face: (orientation) => handle.face(orientation),
    goTo: (guid) => travel.goTo({ guid, kind: "guid" }),
    halt: (reason) => handle.stopMoving(reason),
    jump: () => handle.jump(),
    move: (direction, durationMs) => handle.move(direction, durationMs),
    navigationState: () => travel.getNavigationState(),
    selectTarget: (guid) => handle.selectTarget(guid),
    settle: () => handle.settle(),
    snapshot: () => handle.getControlState(),
  };
}

export function rewardsPort(handle: WorldHandle): RewardsPort {
  return {
    abandonOpen: () => handle.abandonLoot(),
    close: () => handle.releaseLoot(),
    open: (guid) => handle.openLoot(guid),
    snapshot: () => handle.getRewardsState(),
    take: (slot) => handle.takeLoot(slot),
    takeMoney: () => handle.takeLootMoney(),
  };
}

export function recoveryPort(handle: WorldHandle): RecoveryPort {
  return {
    queryCorpse: () => handle.queryCorpse(),
    reclaimCorpse: () => handle.reclaimCorpse(),
    releaseSpirit: () => handle.releaseSpirit(),
    respondResurrection: (accept) => handle.respondResurrection(accept),
    snapshot: () => handle.getRecoveryState(),
  };
}
