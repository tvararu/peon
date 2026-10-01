import { ignoreFailure } from "#lib/ignore-failure";
import type { AreaRuntimeCtx } from "#wow/areas/contract";
import type { TaxiCatalog } from "#wow/areas/travel/catalog";
import {
  buildActivateTaxi,
  buildActivateTaxiExpress,
} from "#wow/areas/travel/protocol";
import type { TravelEvent, TravelStore } from "#wow/areas/travel/store";
import type { Entity } from "#wow/entity-store";
import { UnitFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

type RoutePlan = { nodes: readonly number[]; price: number };
type FlightResult = {
  instant: boolean;
  nodes: readonly number[];
  price: number;
};
type TravelOutcome<T> =
  | ({ status: "ok" } & T)
  | { status: "refused"; reason: string }
  | { status: "no_answer" };

const ARRIVALS: Record<string, true> = {
  near_teleport: true,
  new_world: true,
  teleport: true,
};

const FLIGHT_TIMEOUT_MS = 5000;
type CatalogRead =
  | { catalog: TaxiCatalog }
  | { error: { status: "refused"; reason: string } };

export type FlightDeps = {
  ctx: AreaRuntimeCtx<TravelEvent>;
  store: TravelStore;
  readCatalog: () => Promise<CatalogRead>;
};

type FlightRefusal =
  | { status: "refused"; reason: string }
  | { status: "no_answer" };

function checkFlightRoute(
  catalog: TaxiCatalog,
  known: ReadonlySet<number> | undefined,
  route: RoutePlan,
): FlightRefusal | undefined {
  if (route.nodes.length < 2)
    return { status: "refused", reason: "no_such_path" };
  if (known) {
    for (const node of route.nodes) {
      if (catalog.node(node) === undefined || !known.has(node))
        return { status: "refused", reason: "not_known" };
    }
  }
  for (let hop = 0; hop + 1 < route.nodes.length; hop++) {
    const from = route.nodes[hop];
    const to = route.nodes[hop + 1];
    if (from === undefined || to === undefined)
      return { status: "refused", reason: "no_such_path" };
    const edge = catalog.edgesFrom(from).some((step) => step.to === to);
    if (!edge) return { status: "refused", reason: "no_such_path" };
  }
  return undefined;
}

function sendFlight(
  ctx: AreaRuntimeCtx<TravelEvent>,
  npc: bigint,
  route: RoutePlan,
  express: boolean,
): void {
  if (express || route.nodes.length > 2)
    ctx.send(
      GameOpcode.CMSG_ACTIVATETAXIEXPRESS,
      buildActivateTaxiExpress(npc, route.nodes),
    );
  else {
    const from = route.nodes[0];
    const to = route.nodes[1];
    if (from === undefined || to === undefined) return;
    ctx.send(GameOpcode.CMSG_ACTIVATETAXI, buildActivateTaxi(npc, from, to));
  }
}

type TeleportWait = { promise: Promise<void>; cancel: () => void };

function awaitTeleport(
  deps: FlightDeps,
  state: { arrived: boolean },
): TeleportWait {
  let cancel = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    cancel = deps.ctx.listen("control", ({ type, state: pose, reason }) => {
      if (type === "server_correction" && ARRIVALS[reason ?? ""] && pose.pose) {
        state.arrived = true;
        resolve();
      }
    });
  });
  return { promise, cancel };
}

async function settleFlight(
  route: RoutePlan,
  wait: Promise<TravelEvent>,
  teleport: TeleportWait,
  arrived: { arrived: boolean },
): Promise<TravelOutcome<FlightResult>> {
  const ok = (): TravelOutcome<FlightResult> => ({
    instant: arrived.arrived,
    nodes: [...route.nodes],
    price: route.price,
    status: "ok",
  });
  try {
    const event = await wait;
    if (event.type !== "taxi_reply") return { status: "no_answer" };
    if (event.name !== "ok") return { status: "refused", reason: event.name };
    return ok();
  } catch (error) {
    if (!(error instanceof Error && error.message === "timeout")) throw error;
    if (!arrived.arrived) return { status: "no_answer" };
    return ok();
  } finally {
    teleport.cancel();
  }
}

export async function activateFlight(
  deps: FlightDeps,
  npc: bigint,
  route: RoutePlan,
  options?: { express?: boolean; unchecked?: boolean },
): Promise<TravelOutcome<FlightResult>> {
  const { ctx, store } = deps;
  const startPhase = store.snapshot().flight.phase;
  if (startPhase === "requested" || startPhase === "flying")
    return { status: "refused", reason: "flight_active" };
  store.beginFlight(route.nodes, route.price);
  let loaded: CatalogRead;
  try {
    loaded = await deps.readCatalog();
  } catch (error) {
    store.endFlight();
    throw error;
  }
  if (ctx.signal.aborted) {
    store.endFlight();
    const reason = ctx.signal.reason;
    const aborted =
      reason instanceof Error
        ? reason
        : new DOMException("The operation was aborted.", "AbortError");
    return Promise.reject(aborted);
  }
  if (store.snapshot().flight.phase !== "requested") {
    store.endFlight();
    return { status: "refused", reason: "flight_active" };
  }
  if ("error" in loaded) {
    store.endFlight();
    return loaded.error;
  }
  const known = store.snapshot().known;
  const bad = checkFlightRoute(
    loaded.catalog,
    options?.unchecked || known === undefined ? undefined : new Set(known),
    route,
  );
  if (bad) {
    store.endFlight();
    return bad;
  }
  return sendFlightWait(deps, npc, route, options?.express === true);
}

async function sendFlightWait(
  deps: FlightDeps,
  npc: bigint,
  route: RoutePlan,
  express: boolean,
): Promise<TravelOutcome<FlightResult>> {
  const { ctx, store } = deps;
  const reply = new AbortController();
  const waited = ctx.until((e) => e.type === "taxi_reply", {
    timeoutMs: FLIGHT_TIMEOUT_MS,
    signal: AbortSignal.any
      ? AbortSignal.any([ctx.signal, reply.signal])
      : ctx.signal,
  });
  waited.catch(ignoreFailure);
  const arrived = { arrived: false };
  const teleport = awaitTeleport(deps, arrived);
  try {
    sendFlight(ctx, npc, route, express);
  } catch (error) {
    reply.abort();
    store.endFlight();
    teleport.cancel();
    await waited.catch(ignoreFailure);
    throw error;
  }
  try {
    return await settleFlight(route, waited, teleport, arrived);
  } finally {
    reply.abort();
    await waited.catch(ignoreFailure);
    if (store.snapshot().flight.phase === "requested") store.endFlight();
  }
}

function flightFlagOf(entity: Entity | undefined): boolean | undefined {
  if (!entity) return undefined;
  const flags = entity.rawFields.get(UNIT_FIELDS.FLAGS.offset);
  if (flags === undefined) return undefined;
  return (flags & UnitFlag.TAXI_FLIGHT) !== 0;
}

export function observeFlightFlag(
  deps: Pick<FlightDeps, "ctx" | "store">,
  entity: Entity | undefined,
): void {
  if (!entity || entity.guid !== deps.ctx.selfGuid()) return;
  const on = flightFlagOf(entity);
  if (on !== undefined) deps.store.receiveFlightFlag(on);
}
