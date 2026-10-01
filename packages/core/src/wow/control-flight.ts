import { buildMoveSplineDone } from "#wow/areas/travel/protocol";
import type { ControlDeps } from "#wow/control";
import type { Position } from "#wow/entity-store";
import { UnitFlag } from "#wow/protocol/entity-fields";
import { type MonsterMove, SplineFlag } from "#wow/protocol/monster-move";
import type { MovementInfo } from "#wow/protocol/movement";
import { GameOpcode } from "#wow/protocol/opcodes";

const LANDING_GRACE_MS = 10_000;

export type FlightParts = {
  deps: ControlDeps;
  emit: (
    type: "control_changed" | "server_correction",
    reason?: string,
  ) => void;
  motion: { abort: (reason: string) => void; stop: (reason: string) => void };
  movementInfo: () => MovementInfo;
  serverPose: (pose: Position) => void;
  poseMapId: () => number;
};

type FlightEnd = { point: Position; info: MovementInfo; splineId: number };

export class FlightTracker {
  private readonly deps: ControlDeps;
  private readonly emit: FlightParts["emit"];
  private readonly motion: FlightParts["motion"];
  private readonly movementInfo: () => MovementInfo;
  private readonly serverPose: (pose: Position) => void;
  private readonly poseMapId: () => number;
  private flying = false;
  private flagSeen = false;
  private end: FlightEnd | undefined;
  private splineTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(parts: FlightParts) {
    this.deps = parts.deps;
    this.emit = parts.emit;
    this.motion = parts.motion;
    this.movementInfo = parts.movementInfo;
    this.serverPose = parts.serverPose;
    this.poseMapId = parts.poseMapId;
  }

  inFlight(): boolean {
    return this.flying;
  }

  onLanded: (() => void) | undefined;

  observeSpline(move: MonsterMove): boolean {
    if (move.kind === "stop") {
      if (!this.flying) return false;
      const point: Position = {
        mapId: this.poseMapId(),
        orientation: 0,
        x: move.start.x,
        y: move.start.y,
        z: move.start.z,
      };
      this.serverPose(point);
      if (this.end) this.end = { ...this.end, point };
      return true;
    }
    if (
      move.kind !== "move" ||
      (move.flags & SplineFlag.FLYING) === 0 ||
      move.cyclic
    )
      return false;
    const last = move.points.at(-1);
    if (!last) return false;
    const info = this.movementInfo();
    this.end = {
      info,
      point: {
        mapId: this.poseMapId(),
        orientation: info.orientation,
        x: last.x,
        y: last.y,
        z: last.z,
      },
      splineId: move.splineId,
    };
    this.flying = true;
    this.motion.abort("in_flight");
    this.emit("control_changed", "in_flight");
    this.armSplineTimer(move.duration);
    return true;
  }

  observeUnitFlags(unitFlags: number): boolean {
    if ((unitFlags & UnitFlag.TAXI_FLIGHT) !== 0) {
      this.flagSeen = true;
      if (!this.flying) {
        this.flying = true;
        this.motion.abort("in_flight");
        this.emit("control_changed", "in_flight");
      }
      return true;
    }
    if (!this.flagSeen) return false;
    this.flagSeen = false;
    this.land();
    return true;
  }

  newWorld(): void {
    if (this.splineTimer !== undefined) {
      clearTimeout(this.splineTimer);
      this.splineTimer = undefined;
    }
  }

  dispose(): void {
    if (this.splineTimer !== undefined) {
      clearTimeout(this.splineTimer);
      this.splineTimer = undefined;
    }
  }

  private armSplineTimer(durationMs: number): void {
    if (this.splineTimer !== undefined) {
      clearTimeout(this.splineTimer);
      this.splineTimer = undefined;
    }
    this.splineTimer = setTimeout(() => {
      this.splineTimer = undefined;
      if (!this.flying) return;
      if (!this.flagSeen) {
        this.splineTimer = setTimeout(() => {
          this.splineTimer = undefined;
          this.land();
        }, LANDING_GRACE_MS);
        return;
      }
      this.sendSplineDone();
    }, durationMs);
  }

  private sendSplineDone(): void {
    const end = this.end;
    if (!end) {
      this.land();
      return;
    }
    this.deps.send(
      GameOpcode.CMSG_MOVE_SPLINE_DONE,
      buildMoveSplineDone(
        this.deps.selfGuid(),
        { ...end.info, ...end.point },
        end.splineId,
      ),
    );
  }

  private land(): void {
    const end = this.end;
    this.flying = false;
    this.motion.stop("flight_landed");
    this.onLanded?.();
    if (this.splineTimer !== undefined) {
      clearTimeout(this.splineTimer);
      this.splineTimer = undefined;
    }
    if (end && end.point.mapId === this.poseMapId()) this.serverPose(end.point);
    this.end = undefined;
    this.emit("control_changed", undefined);
    this.emit("server_correction", "flight_landed");
  }
}
