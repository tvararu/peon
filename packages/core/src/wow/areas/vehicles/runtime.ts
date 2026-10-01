import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  buildChangeSeatsOnControlledVehicle,
  buildDismissControlledVehicle,
  buildEjectPassenger,
  buildPlayerVehicleEnter,
  buildRequestVehicleSwitchSeat,
  buildSpellClick,
  NPC_FLAG_SPELLCLICK,
} from "#wow/areas/vehicles/protocol";
import type { VehiclesEvent, VehiclesStore } from "#wow/areas/vehicles/store";
import type { ControlEvent } from "#wow/control";
import { SplineFlag } from "#wow/protocol/monster-move";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { CoreStores } from "#wow/session-stores";

export type VehiclesOutcome =
  | { status: "ok" }
  | { status: "no_answer" }
  | {
      status: "refused";
      reason:
        | "not_clickable"
        | "not_seated"
        | "not_a_vehicle"
        | "not_controlling";
    };

export type VehiclesActs = {
  spellClick: (guid: bigint) => Promise<VehiclesOutcome>;
  exitVehicle: () => Promise<VehiclesOutcome>;
  nextSeat: () => Promise<VehiclesOutcome>;
  prevSeat: () => Promise<VehiclesOutcome>;
  switchSeat: (seat: number) => Promise<VehiclesOutcome>;
  enterPlayerVehicle: (guid: bigint) => Promise<VehiclesOutcome>;
  ejectPassenger: (guid: bigint) => Promise<VehiclesOutcome>;
  changeSeatOnControlled: (
    accessory: bigint,
    seat: number,
  ) => Promise<VehiclesOutcome>;
  dismissControlled: () => Promise<VehiclesOutcome>;
};

type Ctx = AreaRuntimeCtx<VehiclesEvent>;

const NO_ANSWER_MS = 3000;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

async function sendSeatRequest(
  ctx: Ctx,
  send: () => void,
  match: (event: VehiclesEvent) => boolean,
): Promise<VehiclesOutcome> {
  const scope = new AbortController();
  const answer = ctx.until(match, {
    timeoutMs: NO_ANSWER_MS,
    signal: AbortSignal.any([ctx.signal, scope.signal]),
  });
  answer.catch(() => undefined);
  try {
    send();
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
  core: CoreStores;
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

function boardedAccessory(self: bigint, accessory: bigint, seat: number) {
  return (event: VehiclesEvent) =>
    event.type === "spline" &&
    event.guid === self &&
    event.transportGuid === accessory &&
    (event.flags & SplineFlag.TRANSPORT_EXIT) === 0 &&
    event.seat === seat;
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
    () => ctx.send(opcode, body),
    changedSeat(self, seat.vehicle, seat.seat),
  );
}

function controlledSeat({ store }: SeatDeps) {
  const seat = store.snapshot().seat;
  return seat?.controlling ? seat : undefined;
}

function changeSeatControlled(
  deps: SeatDeps,
  accessory: bigint,
  seatId: number,
): Promise<VehiclesOutcome> {
  const { ctx, core } = deps;
  const seat = controlledSeat(deps);
  if (!seat)
    return Promise.resolve({ status: "refused", reason: "not_controlling" });
  const match =
    accessory === 0n
      ? changedSeat(ctx.selfGuid(), seat.vehicle, seat.seat)
      : boardedAccessory(ctx.selfGuid(), accessory, seatId);
  return sendSeatRequest(
    ctx,
    () =>
      core.self.receive({
        build: (guid, info) =>
          buildChangeSeatsOnControlledVehicle(guid, info, accessory, seatId),
        opcode: GameOpcode.CMSG_CHANGE_SEATS_ON_CONTROLLED_VEHICLE,
        type: "mover_packet",
      }),
    match,
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
    () => ctx.send(GameOpcode.CMSG_SPELLCLICK, buildSpellClick(guid)),
    boarded(self),
  );
}

function controlRestored(event: ControlEvent): boolean {
  if (event.type !== "control_changed") return false;
  return (
    event.reason === undefined ||
    (event.reason === "vehicle" && event.state.mover === undefined)
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
    const off = ctx.listen("control", (event) => {
      if (!controlRestored(event)) return;
      release();
      resolve({ status: "ok" });
    });
    if (signals.some((signal) => signal.aborted)) onAbort();
    else
      for (const signal of signals)
        signal.addEventListener("abort", onAbort, { once: true });
  });
}

function dismissSeat(deps: SeatDeps): Promise<VehiclesOutcome> {
  if (!controlledSeat(deps))
    return Promise.resolve({ status: "refused", reason: "not_controlling" });
  return leaveSeat(deps, () =>
    deps.core.self.receive({
      build: buildDismissControlledVehicle,
      opcode: GameOpcode.CMSG_DISMISS_CONTROLLED_VEHICLE,
      type: "mover_packet",
    }),
  );
}

function exitSeat(deps: SeatDeps): Promise<VehiclesOutcome> {
  const { ctx, store } = deps;
  if (currentSeat(store, ctx.selfGuid()) === undefined)
    return Promise.resolve({ status: "refused", reason: "not_seated" });
  if (controlledSeat(deps)) return dismissSeat(deps);
  return leaveSeat(deps, () => ctx.send(GameOpcode.CMSG_REQUEST_VEHICLE_EXIT));
}

function leaveSeat(
  { ctx }: SeatDeps,
  send: () => void,
): Promise<VehiclesOutcome> {
  const scope = new AbortController();
  const restore = waitControlRestored(ctx, scope.signal);
  restore.catch(() => undefined);
  try {
    send();
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
    () =>
      ctx.send(
        GameOpcode.CMSG_PLAYER_VEHICLE_ENTER,
        buildPlayerVehicleEnter(guid),
      ),
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
    () =>
      ctx.send(
        GameOpcode.CMSG_CONTROLLER_EJECT_PASSENGER,
        buildEjectPassenger(guid),
      ),
    (event) =>
      event.type === "spline" &&
      event.guid === guid &&
      (event.flags & SplineFlag.TRANSPORT_EXIT) !== 0,
  );
}

function watchControl(
  ctx: Ctx,
  store: VehiclesStore,
  core: CoreStores,
): () => void {
  let driven: bigint | undefined;
  return ctx.listen("control", (event) => {
    if (event.type !== "control_changed") return;
    const mover = event.state.mover;
    if (mover === driven) return;
    const previous = driven;
    driven = mover;
    if (mover === undefined) {
      if (previous !== undefined) store.setControlling(previous, false);
      return;
    }
    const motion = store.motionOf(mover);
    const pose = store.entityOf(mover)?.position ?? motion?.pose;
    core.self.receive({
      flags: motion?.flags,
      guid: mover,
      pose: pose && { ...pose },
      run: motion?.run,
      runBack: motion?.runBack,
      turn: motion?.turn,
      type: "mover_state",
    });
    store.setControlling(mover, true);
  });
}

export function vehiclesRuntime(
  ctx: Ctx,
  store: VehiclesStore,
  core: CoreStores,
): AreaRuntime<VehiclesActs> {
  const deps: SeatDeps = { core, ctx, store };
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
    if (event.type === "entered" || event.type === "seat_changed") {
      const pose = store.entityOf(event.vehicle)?.position;
      core.self.receive({
        duration: event.duration,
        facing: event.facing,
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
  const offControl = watchControl(ctx, store, core);
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
      changeSeatOnControlled: (accessory, seat) =>
        changeSeatControlled(deps, accessory, seat),
      dismissControlled: () => dismissSeat(deps),
    },
    dispose: () => {
      off();
      offControl();
    },
  };
}
