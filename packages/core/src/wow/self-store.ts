import { Emitter, type Unsubscribe } from "#lib/emitter";
import type { SelfObservation } from "#wow/control-sync";
import type { Position } from "#wow/entity-store";
import type { MonsterMove } from "#wow/protocol/monster-move";
import type {
  ClientControl,
  ForceSpeed,
  KnockBack,
  MoveAck,
  MovementInfo,
  SpeedAck,
} from "#wow/protocol/movement";
import type { Vec3 } from "#wow/protocol/packet";

export const LOGIN_TIMEOUT_MS = 10_000;

export type MoveFlag = "water_walk" | "hover" | "feather_fall" | "gravity_off";

export type TransferAbortedInput = {
  mapId: number;
  reason: number;
  arg: number | undefined;
};
export type SelfEvent =
  | { type: "login_verified"; position: Position }
  | { type: "near_teleport"; info: MovementInfo }
  | {
      type: "transfer_aborted";
      mapId: number;
      reason: number;
      arg: number | undefined;
    }
  | { type: "teleport_ack"; ack: MoveAck }
  | {
      type: "transfer_pending";
      mapId: number;
      transport?: { entry: number; fromMap: number };
    }
  | { type: "new_world"; position: Position }
  | { type: "force_root"; counter: number }
  | { type: "force_unroot"; counter: number }
  | { type: "knock_back"; knock: KnockBack }
  | { type: "client_control"; control: ClientControl }
  | { type: "force_speed"; spec: SpeedAck; force: ForceSpeed }
  | { type: "can_fly"; counter: number; enable: boolean }
  | { type: "move_flag"; flag: MoveFlag; enable: boolean; counter: number }
  | { type: "collision_height"; counter: number; height: number }
  | { type: "spline"; move: MonsterMove }
  | {
      type: "vehicle_seat";
      vehicle: bigint;
      seat: number;
      offset: Vec3;
      facing: number;
      splineId: number | undefined;
      duration: number;
      vehiclePose: Position | undefined;
    }
  | { type: "vehicle_left" }
  | { type: "observed"; observation: SelfObservation };

export class SelfStore {
  private readonly events = new Emitter<[SelfEvent]>();
  private map = 0;
  private verified = false;
  private loginWaiters: (() => void)[] = [];

  onEvent(listener: (event: SelfEvent) => void): Unsubscribe {
    return this.events.subscribe(listener);
  }

  get mapId(): number {
    return this.map;
  }

  get loggedIn(): boolean {
    return this.verified;
  }

  waitLogin(timeoutMs = LOGIN_TIMEOUT_MS): Promise<void> {
    if (this.verified) return Promise.resolve();
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for opcode 0x236"));
    }, timeoutMs);
    this.loginWaiters.push(() => {
      clearTimeout(timer);
      resolve();
    });
    return promise;
  }

  receive(event: SelfEvent): void {
    if (event.type === "login_verified" || event.type === "new_world")
      this.map = event.position.mapId;
    if (event.type === "login_verified") {
      this.verified = true;
      const waiters = this.loginWaiters;
      this.loginWaiters = [];
      for (const waiter of waiters) waiter();
    }
    this.events.emit(event);
  }

  dispose(): void {
    this.events.clear();
  }
}
