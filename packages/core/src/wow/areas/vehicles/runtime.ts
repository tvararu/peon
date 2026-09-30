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
};

function currentSeat(
  store: VehiclesStore,
  self: bigint,
): { vehicle: bigint; seat: number } | undefined {
  const state = store.snapshot();
  if (state.seat) return state.seat;
  const passenger = state.passengers.get(self);
  return passenger
    ? { vehicle: passenger.transportGuid, seat: passenger.seat }
    : undefined;
}

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
  { ctx, store }: SeatDeps,
  opcode: number,
  body?: Uint8Array,
): Promise<VehiclesOutcome> {
  const self = ctx.selfGuid();
  const seat = currentSeat(store, self);
  if (seat === undefined)
    return Promise.resolve({ status: "refused", reason: "not_seated" });
  const answer = waitSeatAnswer(ctx, changedSeat(self, seat.seat));
  ctx.send(opcode, body);
  return answer;
}

function clickSeat(
  { ctx, store }: SeatDeps,
  guid: bigint,
): Promise<VehiclesOutcome> {
  const self = ctx.selfGuid();
  const target = store.entityOf(guid);
  if (!(isUnit(target) && target.npcFlags & NPC_FLAG_SPELLCLICK))
    return Promise.resolve({ status: "refused", reason: "not_clickable" });
  const answer = waitSeatAnswer(ctx, boarded(self));
  ctx.send(GameOpcode.CMSG_SPELLCLICK, buildSpellClick(guid));
  return answer;
}

function waitControlRestored(ctx: Ctx): Promise<VehiclesOutcome> {
  return new Promise((resolve, reject) => {
    const release = (): void => {
      clearTimeout(timer);
      off();
      ctx.signal.removeEventListener("abort", onAbort);
    };
    const onAbort = (): void => {
      release();
      reject(ctx.signal.reason ?? new Error("aborted"));
    };
    const timer = setTimeout(() => {
      release();
      resolve({ status: "no_answer" });
    }, NO_ANSWER_MS);
    const off = ctx.listen("control", ({ type, reason }) => {
      if (type !== "control_changed" || reason !== undefined) return;
      release();
      resolve({ status: "ok" });
    });
    if (ctx.signal.aborted) onAbort();
    else ctx.signal.addEventListener("abort", onAbort, { once: true });
  });
}

function exitSeat({ ctx, store }: SeatDeps): Promise<VehiclesOutcome> {
  if (currentSeat(store, ctx.selfGuid()) === undefined)
    return Promise.resolve({ status: "refused", reason: "not_seated" });
  const answer = waitControlRestored(ctx);
  ctx.send(GameOpcode.CMSG_REQUEST_VEHICLE_EXIT);
  return answer;
}

function enterSeat({ ctx }: SeatDeps, guid: bigint): Promise<VehiclesOutcome> {
  const answer = waitSeatAnswer(ctx, boarded(ctx.selfGuid()));
  ctx.send(GameOpcode.CMSG_PLAYER_VEHICLE_ENTER, buildPlayerVehicleEnter(guid));
  return answer;
}

function ejectSeat(
  { ctx, store }: SeatDeps,
  guid: bigint,
): Promise<VehiclesOutcome> {
  const self = ctx.selfGuid();
  if (!store.snapshot().vehicleIds.has(self))
    return Promise.resolve({ status: "refused", reason: "not_a_vehicle" });
  if (currentSeat(store, self) === undefined)
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
  const deps: SeatDeps = { ctx, store };
  const switchSeat = (seat: number): Promise<VehiclesOutcome> => {
    const vehicle = currentSeat(store, ctx.selfGuid())?.vehicle;
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
      nextSeat: () =>
        changeSeat(deps, GameOpcode.CMSG_REQUEST_VEHICLE_NEXT_SEAT),
      prevSeat: () =>
        changeSeat(deps, GameOpcode.CMSG_REQUEST_VEHICLE_PREV_SEAT),
      switchSeat,
      enterPlayerVehicle: (guid) => enterSeat(deps, guid),
      ejectPassenger: (guid) => ejectSeat(deps, guid),
    },
    dispose: () => undefined,
  };
}
