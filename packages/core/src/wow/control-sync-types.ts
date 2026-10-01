import type { ControlDeps, ControlEventType } from "#wow/control";
import type { Position } from "#wow/entity-store";
import type { MonsterMove } from "#wow/protocol/monster-move";

export type Emit = (type: ControlEventType, reason?: string) => void;

export type SyncMotion = {
  moving: () => boolean;
  settle: () => void;
  abort: (reason: string) => void;
  stop: (reason: string) => void;
};

export type SelfObservation = {
  position?: Position;
  movementFlags?: number;
  runSpeed?: number;
  runBackSpeed?: number;
  turnRate?: number;
  target?: bigint;
  unitFlags?: number;
};

export type SyncParts = {
  deps: ControlDeps;
  emit: Emit;
  motion: SyncMotion;
  flight?: FlightPort | undefined;
};
export type FlightPort = {
  inFlight: () => boolean;
  newWorld: () => void;
  observeSpline: (move: MonsterMove) => boolean;
  observeUnitFlags: (unitFlags: number) => boolean;
};
