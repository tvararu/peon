import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildEjectPassenger,
  buildPlayerVehicleEnter,
  buildRequestVehicleSwitchSeat,
  buildSpellClick,
  NPC_FLAG_SPELLCLICK,
} from "#wow/areas/vehicles/protocol";
import type { VehiclesEvent, VehiclesStore } from "#wow/areas/vehicles/store";
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

async function sendSeatRequest(
  ctx: Ctx,
  opcode: number,
  body: Uint8Array | undefined,
  match: (event: VehiclesEvent) => boolean,
): Promise<VehiclesOutcome> {
  const scope = new AbortController();
  const answer = ctx.until(match, {
    timeoutMs: NO_ANSWER_MS,
    signal: AbortSignal.any([ctx.signal, scope.signal]),
  });
  answer.catch(() => undefined);
  try {
    ctx.send(opcode, body);
  } catch (error) {
    scope.abort(error);
    await answer.then(
      () => undefined,
      () => undefined,
    );
    throw error;
  }
  try {
    await answer;
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

function changedSeat(self: bigint, vehicle: bigint, before: number) {
  return (event: VehiclesEvent) =>
    event.type === "spline" &&
    event.guid === self &&
    event.transportGuid === vehicle &&
    (event.flags & SplineFlag.TRANSPORT_EXIT) === 0 &&
    event.seat !== before;
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
  return sendSeatRequest(
    ctx,
    opcode,
    body,
    changedSeat(self, seat.vehicle, seat.seat),
  );
}

function clickSeat(
  { ctx, store }: SeatDeps,
  guid: bigint,
): Promise<VehiclesOutcome> {
  const self = ctx.selfGuid();
  const target = store.entityOf(guid);
  if (
    !(target && "npcFlags" in target && target.npcFlags & NPC_FLAG_SPELLCLICK)
  )
    return Promise.resolve({ status: "refused", reason: "not_clickable" });
  return sendSeatRequest(
    ctx,
    GameOpcode.CMSG_SPELLCLICK,
    buildSpellClick(guid),
    boarded(self),
  );
}

function waitControlRestored(
  ctx: Ctx,
  scope: AbortSignal,
): Promise<VehiclesOutcome> {
  return new Promise((resolve, reject) => {
    const signals = [ctx.signal, scope];
    const release = (): void => {
      clearTimeout(timer);
      off();
      for (const signal of signals)
        signal.removeEventListener("abort", onAbort);
    };
    const onAbort = (): void => {
      release();
      reject(ctx.signal.reason ?? scope.reason ?? new Error("aborted"));
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
    if (signals.some((signal) => signal.aborted)) onAbort();
    else
      for (const signal of signals)
        signal.addEventListener("abort", onAbort, { once: true });
  });
}

function exitSeat({ ctx, store }: SeatDeps): Promise<VehiclesOutcome> {
  if (currentSeat(store, ctx.selfGuid()) === undefined)
    return Promise.resolve({ status: "refused", reason: "not_seated" });
  const scope = new AbortController();
  const restore = waitControlRestored(ctx, scope.signal);
  restore.catch(() => undefined);
  try {
    ctx.send(GameOpcode.CMSG_REQUEST_VEHICLE_EXIT);
  } catch (error) {
    scope.abort(error);
    return restore.then(
      (outcome) => {
        if (scope.signal.aborted && scope.signal.reason === error) throw error;
        return outcome;
      },
      () => {
        throw error;
      },
    );
  }
  return restore;
}

function enterSeat({ ctx }: SeatDeps, guid: bigint): Promise<VehiclesOutcome> {
  return sendSeatRequest(
    ctx,
    GameOpcode.CMSG_PLAYER_VEHICLE_ENTER,
    buildPlayerVehicleEnter(guid),
    boarded(ctx.selfGuid()),
  );
}

function ejectSeat(
  { ctx, store }: SeatDeps,
  guid: bigint,
): Promise<VehiclesOutcome> {
  const self = ctx.selfGuid();
  if (!store.snapshot().vehicleIds.has(self))
    return Promise.resolve({ status: "refused", reason: "not_a_vehicle" });
  return sendSeatRequest(
    ctx,
    GameOpcode.CMSG_CONTROLLER_EJECT_PASSENGER,
    buildEjectPassenger(guid),
    (event) =>
      event.type === "spline" &&
      event.guid === guid &&
      (event.flags & SplineFlag.TRANSPORT_EXIT) !== 0,
  );
}

export function vehiclesRuntime(
  ctx: Ctx,
  store: VehiclesStore,
  core: CoreStores,
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
  const off = store.onEvent((event) => {
    if (event.type === "entered") {
      const pose = store.entityOf(event.vehicle)?.position;
      core.self.receive({
        duration: event.duration,
        offset: event.offset,
        seat: event.seat,
        splineId: event.splineId,
        type: "vehicle_seat",
        vehicle: event.vehicle,
        vehiclePose: pose ? { ...pose } : undefined,
      });
    } else if (event.type === "exited")
      core.self.receive({ type: "vehicle_left" });
  });
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
    dispose: () => off(),
  };
}
