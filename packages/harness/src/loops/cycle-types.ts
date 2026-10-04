import type {
  ControlState,
  EntityLookup,
  NavPoint,
  RewardsEvent,
} from "@peon/core";
import type { CycleRecovery } from "#harness/loops/corpse-run";
import type { CycleApproach } from "#harness/loops/cycle-approach";
import type { PullGate } from "#harness/loops/cycle-gate";
import type { CycleStop } from "#harness/loops/cycle-stop";
import type { EventWaiter } from "#harness/loops/event-waiter";
import type {
  ControlPort,
  RecoveryPort,
  RewardsPort,
} from "#harness/loops/ports";
import type {
  ObjectivePick,
  ObjectiveProgress,
} from "#harness/loops/quest-objective";
import type {
  TacticsLoop,
  TacticsOutcome,
  TacticsState,
} from "#harness/loops/tactics";

export type CyclePhase =
  | "idle"
  | "fighting"
  | "looting"
  | "recovering"
  | "stopped";
export type CycleTargetRecord = {
  guid: bigint;
  status: "queued" | "done" | "skipped";
  cause?: string;
  outcome?: TacticsOutcome;
  loot?: "looted" | "none";
};
export type CycleLootRecord = {
  guid: string;
  slotsTaken: number[];
  slotsLeft: number[];
  moneyTaken: number;
  coinageBefore: number | undefined;
  coinageAfter: number | undefined;
};
export type CycleState = {
  active: boolean;
  phase: CyclePhase;
  queue: CycleTargetRecord[];
  currentIndex: number;
  instruction: string;
  maxStarts: number;
  startsUsed: number;
  stopCause: string | undefined;
  stopDetail: Record<string, unknown> | undefined;
  startedAt: number | undefined;
  lastLoot: CycleLootRecord | undefined;
  lastRecovery: (CycleRecovery & { at: number }) | undefined;
  objective: ObjectiveProgress | undefined;
};
export type CycleVisit = Pick<CycleDeps, "approach" | "bags" | "rewards"> & {
  events: EventWaiter<RewardsEvent>;
  signal: AbortSignal;
};
export type CycleVisitEnd =
  | { ok: true; cause?: string; record?: CycleLootRecord }
  | CycleStop;
export type CycleObjective = {
  pick: (tried: ReadonlySet<bigint>) => ObjectivePick;
  progress: () => ObjectiveProgress | undefined;
  visit?: (
    pick: Extract<ObjectivePick, { kind: "object" }>,
    run: CycleVisit,
  ) => Promise<CycleVisitEnd>;
  awaitComplete?: (run: Pick<CycleVisit, "signal">) => Promise<boolean>;
  attackers?: () => readonly bigint[];
};
export type CycleEvent = {
  type:
    | "started"
    | "target_done"
    | "loot_done"
    | "recovery"
    | "recovered"
    | "stopped";
  state: CycleState;
  at: number;
};
export type ObservedCorpse = (NavPoint & { mapId: number }) | undefined;
export type CycleDeps = {
  tactics: Pick<TacticsLoop, "start" | "stop"> & {
    snapshot: () => Pick<TacticsState, "lastOutcome">;
  };
  rewards: RewardsPort;
  bags: {
    questItems: () => ReadonlySet<number>;
    stackSize: (entry: number) => Promise<number | undefined>;
  };
  recovery: RecoveryPort;
  control: Pick<ControlPort, "face" | "move"> & {
    snapshot: () => Pick<ControlState, "pose" | "selfGuid" | "speed">;
  };
  entity: EntityLookup;
  observed: (guid: bigint) => ObservedCorpse;
  approach?: CycleApproach;
  gate?: PullGate;
  attackers?: () => readonly bigint[];
  now: () => number;
};
