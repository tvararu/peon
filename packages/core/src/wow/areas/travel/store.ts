import { Emitter, type Unsubscribe } from "#lib/emitter";
import type {
  ActivateTaxiReply,
  BinderConfirm,
  BindPoint,
  PlayerBound,
  ShowTaxiNodes,
  TaxiNodeStatus,
} from "#wow/areas/travel/protocol";

export const BIND_OFFER_TTL_MS = 60_000;

export type TravelOffer = { npc: bigint; at: number };
export type TravelBound = { binder: bigint; areaId: number; at: number };

export type TravelMaster = {
  npc: bigint;
  node: number | undefined;
  known: boolean | undefined;
};
export type FlightPhase = "idle" | "requested" | "flying" | "landed";
export type TravelFlight = {
  phase: FlightPhase;
  route: readonly number[] | undefined;
};
export type TravelState = {
  home: BindPoint | undefined;
  offer: TravelOffer | undefined;
  lastBound: TravelBound | undefined;
  bindPending: bigint | undefined;
  known: readonly number[] | undefined;
  masters: readonly TravelMaster[];
  learnedAt: number | undefined;
  mapPending: bigint | undefined;
  benchmark: boolean;
  lastReply: string | undefined;
  flight: TravelFlight;
};
export type TravelEvent =
  | ({ type: "bind_point"; reason: "login" | "bound" } & BindPoint)
  | { type: "bind_offer"; npc: bigint }
  | { type: "bound"; binder: bigint; areaId: number }
  | { type: "taxi_node_status"; npc: bigint; known: boolean }
  | { type: "taxi_node_learned"; npc: bigint | undefined }
  | { type: "taxi_map"; npc: bigint; currentNode: number; knownCount: number }
  | { type: "benchmark"; on: boolean }
  | { type: "taxi_reply"; code: number; name: string }
  | { type: "flight_started"; route: readonly number[] }
  | { type: "flight_landed" };

export type TravelStore = {
  snapshot: () => TravelState;
  onEvent: (cb: (event: TravelEvent) => void) => Unsubscribe;
  receiveBindPoint: (point: BindPoint) => void;
  receiveBinderConfirm: (confirm: BinderConfirm) => void;
  receivePlayerBound: (bound: PlayerBound) => void;
  beginBind: (npc: bigint) => void;
  endBind: () => void;
  receiveShowTaxiNodes: (map: ShowTaxiNodes) => void;
  receiveTaxiNodeStatus: (status: TaxiNodeStatus) => void;
  receiveNewTaxiPath: () => void;
  receiveSelfFlags: (on: boolean) => void;
  beginMap: (npc: bigint) => void;
  endMap: () => void;
  beginFlight: (route: readonly number[]) => void;
  endFlight: () => void;
  receiveActivateTaxiReply: (reply: ActivateTaxiReply) => void;
  receiveFlightFlag: (on: boolean) => void;
  dispose: () => void;
};
type TaxiFields = {
  known: readonly number[] | undefined;
  masters: Map<bigint, TravelMaster>;
  learnedAt: number | undefined;
  mapPending: bigint | undefined;
  benchmark: boolean;
  lastReply: string | undefined;
  flight: TravelFlight;
};

function trackMaster(taxi: TaxiFields, npc: bigint): TravelMaster {
  const master = taxi.masters.get(npc);
  if (master) return master;
  const fresh: TravelMaster = { npc, node: undefined, known: undefined };
  taxi.masters.set(npc, fresh);
  return fresh;
}

function receiveBindPoint(
  bind: BindFields,
  events: Emitter<[TravelEvent]>,
  point: BindPoint,
): void {
  bind.home = { ...point };
  bind.offer = undefined;
  const reason = bind.bindPending === undefined ? "login" : "bound";
  events.emit({ type: "bind_point", reason, ...point });
}

function receiveBinderConfirm(
  bind: BindFields,
  events: Emitter<[TravelEvent]>,
  npc: bigint,
  at: number,
): void {
  bind.offer = { npc, at };
  events.emit({ type: "bind_offer", npc });
}

function receivePlayerBound(
  bind: BindFields,
  events: Emitter<[TravelEvent]>,
  bound: PlayerBound,
  at: number,
): void {
  bind.lastBound = { ...bound, at };
  events.emit({ type: "bound", ...bound });
}

function receiveShowTaxiNodes(
  taxi: TaxiFields,
  events: Emitter<[TravelEvent]>,
  { npc, currentNode, known: ids }: ShowTaxiNodes,
): void {
  taxi.known = [...ids];
  trackMaster(taxi, npc).node = currentNode;
  events.emit({ type: "taxi_map", npc, currentNode, knownCount: ids.length });
}

function receiveTaxiNodeStatus(
  taxi: TaxiFields,
  events: Emitter<[TravelEvent]>,
  { npc, known: flag }: TaxiNodeStatus,
): void {
  trackMaster(taxi, npc).known = flag;
  events.emit({ type: "taxi_node_status", npc, known: flag });
}

function receiveNewTaxiPath(
  taxi: TaxiFields,
  events: Emitter<[TravelEvent]>,
  now: () => number,
): void {
  taxi.learnedAt = now();
  events.emit({ type: "taxi_node_learned", npc: taxi.mapPending });
}

function receiveSelfFlags(
  taxi: TaxiFields,
  events: Emitter<[TravelEvent]>,
  on: boolean,
): void {
  if (on === taxi.benchmark) return;
  taxi.benchmark = on;
  events.emit({ type: "benchmark", on });
}

function enterFlying(taxi: TaxiFields, events: Emitter<[TravelEvent]>): void {
  if (taxi.flight.phase === "flying") return;
  taxi.flight = {
    phase: "flying",
    route: taxi.flight.route ? [...taxi.flight.route] : undefined,
  };
  events.emit({
    type: "flight_started",
    route: taxi.flight.route ? [...taxi.flight.route] : [],
  });
}

function receiveActivateTaxiReply(
  taxi: TaxiFields,
  events: Emitter<[TravelEvent]>,
  reply: ActivateTaxiReply,
): void {
  taxi.lastReply = reply.name;
  events.emit({ type: "taxi_reply", code: reply.code, name: reply.name });
  if (reply.name === "ok") enterFlying(taxi, events);
}

function receiveFlightFlag(
  taxi: TaxiFields,
  events: Emitter<[TravelEvent]>,
  on: boolean,
): void {
  if (on) {
    enterFlying(taxi, events);
    return;
  }
  if (taxi.flight.phase !== "flying") return;
  taxi.flight = { phase: "landed", route: undefined };
  events.emit({ type: "flight_landed" });
}

type BindFields = {
  home: BindPoint | undefined;
  offer: TravelOffer | undefined;
  lastBound: TravelBound | undefined;
  bindPending: bigint | undefined;
};

function snapshotState(
  bind: BindFields,
  taxi: TaxiFields,
  freshOffer: () => TravelOffer | undefined,
): TravelState {
  return {
    home: bind.home && { ...bind.home },
    offer: freshOffer(),
    lastBound: bind.lastBound && { ...bind.lastBound },
    bindPending: bind.bindPending,
    known: taxi.known && [...taxi.known],
    masters: [...taxi.masters.values()].map((master) => ({ ...master })),
    learnedAt: taxi.learnedAt,
    mapPending: taxi.mapPending,
    benchmark: taxi.benchmark,
    lastReply: taxi.lastReply,
    flight: {
      phase: taxi.flight.phase,
      route: taxi.flight.route ? [...taxi.flight.route] : undefined,
    },
  };
}
function emptyBind(): BindFields {
  return {
    home: undefined,
    offer: undefined,
    lastBound: undefined,
    bindPending: undefined,
  };
}

function emptyTaxi(): TaxiFields {
  return {
    known: undefined,
    masters: new Map<bigint, TravelMaster>(),
    learnedAt: undefined,
    mapPending: undefined,
    benchmark: false,
    lastReply: undefined,
    flight: { phase: "idle", route: undefined },
  };
}

export function createTravelStore(now: () => number): TravelStore {
  const events = new Emitter<[TravelEvent]>();
  const bind = emptyBind();
  const taxi = emptyTaxi();

  const freshOffer = () =>
    bind.offer && now() - bind.offer.at <= BIND_OFFER_TTL_MS
      ? { ...bind.offer }
      : undefined;

  return {
    snapshot: (): TravelState => snapshotState(bind, taxi, freshOffer),
    onEvent: (cb: (event: TravelEvent) => void): Unsubscribe =>
      events.subscribe(cb),
    receiveBindPoint: (point) => receiveBindPoint(bind, events, point),
    receiveBinderConfirm: ({ npc }) =>
      receiveBinderConfirm(bind, events, npc, now()),
    receivePlayerBound: (bound) =>
      receivePlayerBound(bind, events, bound, now()),
    beginBind(npc: bigint): void {
      bind.bindPending = npc;
    },
    endBind(): void {
      bind.bindPending = undefined;
    },
    receiveShowTaxiNodes(map: ShowTaxiNodes): void {
      receiveShowTaxiNodes(taxi, events, map);
    },
    receiveTaxiNodeStatus(status: TaxiNodeStatus): void {
      receiveTaxiNodeStatus(taxi, events, status);
    },
    receiveNewTaxiPath(): void {
      receiveNewTaxiPath(taxi, events, now);
    },
    receiveSelfFlags(on: boolean): void {
      receiveSelfFlags(taxi, events, on);
    },
    beginMap(npc: bigint): void {
      taxi.mapPending = npc;
    },
    endMap(): void {
      taxi.mapPending = undefined;
    },
    beginFlight(route: readonly number[]): void {
      taxi.flight = { phase: "requested", route: [...route] };
    },
    endFlight(): void {
      if (taxi.flight.phase === "requested")
        taxi.flight = { phase: "idle", route: undefined };
    },
    receiveActivateTaxiReply(reply: ActivateTaxiReply): void {
      receiveActivateTaxiReply(taxi, events, reply);
    },
    receiveFlightFlag(on: boolean): void {
      receiveFlightFlag(taxi, events, on);
    },
    dispose(): void {
      events.clear();
    },
  };
}
