import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildEjectPassenger,
  buildPlayerVehicleEnter,
  buildRequestVehicleSwitchSeat,
  buildSpellClick,
  NPC_FLAG_SPELLCLICK,
} from "#wow/areas/vehicles/protocol";
import type { VehiclesEvent, VehiclesStore } from "#wow/areas/vehicles/store";
import { isUnit } from "#wow/entity-store";
import { SplineFlag } from "#wow/protocol/monster-move";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export type VehiclesOutcome =
  | { status: "ok" }
  | { status: "no_answer" }
  | {
      status: "refused";
      reason: "not_clickable" | "not_seated" | "not_a_vehicle";
    };

export type VehiclesActs = {
  spellClick: (guid: bigint) => Promise<VehiclesOutcome>;
  exitVehicle: () => Promise<VehiclesOutcome>;
  nextSeat: () => Promise<VehiclesOutcome>;
  prevSeat: () => Promise<VehiclesOutcome>;
  switchSeat: (seat: number) => Promise<VehiclesOutcome>;
  enterPlayerVehicle: (guid: bigint) => Promise<VehiclesOutcome>;
  ejectPassenger: (guid: bigint) => Promise<VehiclesOutcome>;
};

type Ctx = AreaRuntimeCtx<VehiclesEvent>;

const NO_ANSWER_MS = 3000;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

async function waitSeatAnswer(
  ctx: Ctx,
  match: (event: VehiclesEvent) => boolean,
): Promise<VehiclesOutcome> {
  try {
    await ctx.until(match, { timeoutMs: NO_ANSWER_MS, signal: ctx.signal });
    return { status: "ok" };
  } catch (error) {
    if (isTimeout(error)) return { status: "no_answer" };
    throw error;
  }
}

type SeatDeps = {
  ctx: Ctx;
  store: VehiclesStore;
  self: bigint;
};

function boarded(self: bigint) {
  return (event: VehiclesEvent) =>
    event.type === "spline" &&
    event.guid === self &&
    (event.flags & SplineFlag.TRANSPORT_ENTER) !== 0;
}

function changedSeat(self: bigint, before: number) {
  return (event: VehiclesEvent) =>
    event.type === "spline" && event.guid === self && event.seat !== before;
}

function changeSeat(
  { ctx, store, self }: SeatDeps,
  opcode: number,
  body?: Uint8Array,
): Promise<VehiclesOutcome> {
  const seat = store.snapshot().seat;
  if (seat === undefined)
    return Promise.resolve({ status: "refused", reason: "not_seated" });
  const answer = waitSeatAnswer(ctx, changedSeat(self, seat.seat));
  ctx.send(opcode, body);
  return answer;
}

function clickSeat(
  { ctx, store, self }: SeatDeps,
  guid: bigint,
): Promise<VehiclesOutcome> {
  const target = store.entityOf(guid);
  if (!(isUnit(target) && target.npcFlags & NPC_FLAG_SPELLCLICK))
    return Promise.resolve({ status: "refused", reason: "not_clickable" });
  const answer = waitSeatAnswer(ctx, boarded(self));
  ctx.send(GameOpcode.CMSG_SPELLCLICK, buildSpellClick(guid));
  return answer;
}

function exitSeat({ ctx, store, self }: SeatDeps): Promise<VehiclesOutcome> {
  const seat = store.snapshot().seat;
  if (seat === undefined)
    return Promise.resolve({ status: "refused", reason: "not_seated" });
  const answer = waitSeatAnswer(ctx, changedSeat(self, seat.seat));
  ctx.send(GameOpcode.CMSG_REQUEST_VEHICLE_EXIT);
  return answer;
}

function enterSeat(
  { ctx, self }: SeatDeps,
  guid: bigint,
): Promise<VehiclesOutcome> {
  const answer = waitSeatAnswer(ctx, boarded(self));
  ctx.send(GameOpcode.CMSG_PLAYER_VEHICLE_ENTER, buildPlayerVehicleEnter(guid));
  return answer;
}

function ejectSeat(
  { ctx, store, self }: SeatDeps,
  guid: bigint,
): Promise<VehiclesOutcome> {
  if (!store.snapshot().vehicleIds.has(self))
    return Promise.resolve({ status: "refused", reason: "not_a_vehicle" });
  if (store.snapshot().seat === undefined)
    return Promise.resolve({ status: "refused", reason: "not_seated" });
  const answer = waitSeatAnswer(
    ctx,
    (event) =>
      event.type === "player_vehicle" &&
      event.guid === guid &&
      event.vehicleId === 0,
  );
  ctx.send(
    GameOpcode.CMSG_CONTROLLER_EJECT_PASSENGER,
    buildEjectPassenger(guid),
  );
  return answer;
}

export function vehiclesRuntime(
  ctx: Ctx,
  store: VehiclesStore,
  _core: CoreStores,
): AreaRuntime<VehiclesActs> {
  const deps: SeatDeps = { ctx, self: ctx.selfGuid(), store };
  const switchSeat = (seat: number): Promise<VehiclesOutcome> => {
    const vehicle = store.snapshot().seat?.vehicle;
    if (vehicle === undefined)
      return Promise.resolve({ status: "refused", reason: "not_seated" });
    return changeSeat(
      deps,
      GameOpcode.CMSG_REQUEST_VEHICLE_SWITCH_SEAT,
      buildRequestVehicleSwitchSeat(vehicle, seat),
    );
  };
  return {
    act: {
      spellClick: (guid) => clickSeat(deps, guid),
      exitVehicle: () => exitSeat(deps),
      nextSeat: () => changeSeat(deps, GameOpcode.CMSG_REQUEST_VEHICLE_NEXT_SEAT),
      prevSeat: () => changeSeat(deps, GameOpcode.CMSG_REQUEST_VEHICLE_PREV_SEAT),
      switchSeat,
      enterPlayerVehicle: (guid) => enterSeat(deps, guid),
      ejectPassenger: (guid) => ejectSeat(deps, guid),
    },
    dispose: () => undefined,
  };
}
