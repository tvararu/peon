import type { AreaRuntime, AreaRuntimeCtx } from "#wow/areas/contract";
import {
  loadTaxiCatalog,
  type TaxiCatalog,
  type TaxiNode,
} from "#wow/areas/travel/catalog";
import { activateFlight, observeFlightFlag } from "#wow/areas/travel/flight";
import {
  type BindPoint,
  buildBinderActivate,
  buildEnableTaxi,
  buildSetTaxiBenchmarkMode,
  buildTaxiNodeStatusQuery,
  buildTaxiQueryAvailableNodes,
} from "#wow/areas/travel/protocol";
import { taxiRoute } from "#wow/areas/travel/route";
import type { TravelEvent, TravelStore } from "#wow/areas/travel/store";
import type { Entity } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";

export const BIND_TIMEOUT_MS = 5000;
export const TAXI_TIMEOUT_MS = 3000;

export type TravelOutcome<T = Readonly<Record<never, never>>> =
  | ({ status: "ok" } & T)
  | { status: "refused"; reason: string }
  | {
      status: "refused";
      reason: "ambiguous";
      matches: { node: number; name: string }[];
    }
  | { status: "no_answer" };

export type TaxiDestination = {
  node: number;
  name: string;
  price: number;
  known: boolean;
};

export type TaxiNodeInfo = Pick<
  TaxiNode,
  "id" | "map" | "x" | "y" | "z" | "name"
>;

export type MapResult =
  | { kind: "map"; currentNode: number; known: readonly number[] }
  | { kind: "learned" };

export type RoutePlan = {
  nodes: readonly number[];
  price: number;
  destination: number;
};

export type TravelActs = {
  bindActivate: (npc: bigint) => Promise<TravelOutcome<{ home: BindPoint }>>;
  queryTaxiStatus: (npc: bigint) => Promise<TravelOutcome<{ known: boolean }>>;
  openTaxiMap: (
    npc: bigint,
    options?: { enable: boolean },
  ) => Promise<TravelOutcome<MapResult>>;
  setTaxiBenchmark: (on: boolean) => Promise<TravelOutcome<{ on: boolean }>>;
  destinations: (from: number) => Promise<
    TravelOutcome<{
      from: number;
      node: TaxiNodeInfo;
      list: readonly TaxiDestination[];
    }>
  >;
  planFlight: (
    from: number,
    destination: string,
  ) => Promise<TravelOutcome<RoutePlan>>;
  activateTaxi: (
    npc: bigint,
    route: RoutePlan,
    options?: { express?: boolean; unchecked?: boolean },
  ) => Promise<TravelOutcome<FlightResult>>;
};

export type FlightResult = {
  nodes: readonly number[];
  price: number;
};

type TaxiRuntime = {
  catalog: Promise<TaxiCatalog> | undefined;
  pending: Set<string>;
};

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === "timeout";
}

function benchmarkOf(entity: Entity | undefined): boolean | undefined {
  if (!entity) return undefined;
  const flags = entity.rawFields.get(PLAYER_FIELDS.FLAGS.offset);
  if (flags === undefined) return undefined;
  return (flags & 0x00_02_00_00) !== 0;
}

function catalogOf(
  ctx: AreaRuntimeCtx<TravelEvent>,
  state: TaxiRuntime,
): Promise<TaxiCatalog> {
  state.catalog ??= ctx.dbc
    ? loadTaxiCatalog(ctx.dbc)
    : Promise.reject(new Error("missing_taxi_data"));
  return state.catalog;
}

type CatalogRead =
  | { catalog: TaxiCatalog }
  | { error: { status: "refused"; reason: string } };

async function readCatalog(
  ctx: AreaRuntimeCtx<TravelEvent>,
  state: TaxiRuntime,
): Promise<CatalogRead> {
  try {
    return { catalog: await catalogOf(ctx, state) };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("missing_taxi_data")
    ) {
      state.catalog = undefined;
      return { error: { status: "refused", reason: "missing_taxi_data" } };
    }
    throw error;
  }
}

type DestinationPick =
  | { node: number }
  | { refusal: "unknown_node" }
  | {
      refusal: "ambiguous";
      matches: { node: number; name: string }[];
    };

function pickDestination(
  catalog: TaxiCatalog,
  destination: string,
): DestinationPick {
  const matches = catalog.nodesByName(destination);
  const folded = destination.toLowerCase();
  const exact = matches.filter((node) => node.name.toLowerCase() === folded);
  const firstExact = exact.length === 1 ? exact[0] : undefined;
  if (firstExact) return { node: firstExact.id };
  const only = matches.length === 1 ? matches[0] : undefined;
  if (only) return { node: only.id };
  if (matches.length === 0) return { refusal: "unknown_node" };
  return {
    refusal: "ambiguous",
    matches: matches.map((node) => ({ node: node.id, name: node.name })),
  };
}

async function guard<T>(
  state: TaxiRuntime,
  kind: string,
  run: () => Promise<T>,
): Promise<T | { status: "refused"; reason: string }> {
  if (state.pending.has(kind)) return { status: "refused", reason: "busy" };
  state.pending.add(kind);
  try {
    return await run();
  } finally {
    state.pending.delete(kind);
  }
}

async function waitStatus(
  ctx: AreaRuntimeCtx<TravelEvent>,
  npc: bigint,
): Promise<TravelOutcome<{ known: boolean }>> {
  try {
    const event = await ctx.until(
      (e) => e.type === "taxi_node_status" && e.npc === npc,
      { timeoutMs: TAXI_TIMEOUT_MS },
    );
    if (event.type !== "taxi_node_status") return { status: "no_answer" };
    return { status: "ok", known: event.known };
  } catch (error) {
    if (isTimeout(error)) return { status: "no_answer" };
    throw error;
  }
}

async function waitMap(
  ctx: AreaRuntimeCtx<TravelEvent>,
  store: TravelStore,
  npc: bigint,
): Promise<TravelOutcome<MapResult>> {
  try {
    const event = await ctx.until(
      (e) =>
        (e.type === "taxi_map" && e.npc === npc) ||
        (e.type === "taxi_node_learned" && e.npc === npc),
      { timeoutMs: TAXI_TIMEOUT_MS },
    );
    if (event.type === "taxi_map")
      return {
        status: "ok",
        kind: "map",
        currentNode: event.currentNode,
        known: store.snapshot().known ?? [],
      };
    return { status: "ok", kind: "learned" };
  } catch (error) {
    if (isTimeout(error)) return { status: "no_answer" };
    throw error;
  }
}

async function waitBenchmark(
  ctx: AreaRuntimeCtx<TravelEvent>,
  on: boolean,
): Promise<TravelOutcome<{ on: boolean }>> {
  try {
    const event = await ctx.until(
      (e) => e.type === "benchmark" && e.on === on,
      { timeoutMs: TAXI_TIMEOUT_MS },
    );
    if (event.type !== "benchmark") return { status: "no_answer" };
    return { status: "ok", on: event.on };
  } catch (error) {
    if (isTimeout(error)) return { status: "no_answer" };
    throw error;
  }
}

function sendMapQuery(
  ctx: AreaRuntimeCtx<TravelEvent>,
  npc: bigint,
  enable: boolean,
): void {
  ctx.send(
    enable
      ? GameOpcode.CMSG_ENABLETAXI
      : GameOpcode.CMSG_TAXIQUERYAVAILABLENODES,
    enable ? buildEnableTaxi(npc) : buildTaxiQueryAvailableNodes(npc),
  );
}

function destinationList(
  catalog: TaxiCatalog,
  known: ReadonlySet<number>,
  from: number,
): readonly TaxiDestination[] {
  return catalog.edgesFrom(from).map((edge) => ({
    node: edge.to,
    name: catalog.node(edge.to)?.name ?? String(edge.to),
    price: edge.price,
    known: known.has(edge.to),
  }));
}

type TaxiDeps = {
  ctx: AreaRuntimeCtx<TravelEvent>;
  store: TravelStore;
  state: TaxiRuntime;
};

async function bindActivate(
  { ctx, store }: TaxiDeps,
  npc: bigint,
): Promise<TravelOutcome<{ home: BindPoint }>> {
  if (store.snapshot().bindPending !== undefined)
    return { status: "refused", reason: "busy" };
  store.beginBind(npc);
  try {
    ctx.send(GameOpcode.CMSG_BINDER_ACTIVATE, buildBinderActivate(npc));
    await ctx.until((e) => e.type === "bind_point" && e.reason === "bound", {
      timeoutMs: BIND_TIMEOUT_MS,
    });
    const home = store.snapshot().home;
    return home ? { status: "ok", home } : { status: "no_answer" };
  } catch (error) {
    if (isTimeout(error)) return { status: "no_answer" };
    throw error;
  } finally {
    store.endBind();
  }
}

function queryTaxiStatus(
  deps: TaxiDeps,
  npc: bigint,
): Promise<TravelOutcome<{ known: boolean }>> {
  const { ctx, state } = deps;
  return guard(state, "status", () => {
    ctx.send(
      GameOpcode.CMSG_TAXINODE_STATUS_QUERY,
      buildTaxiNodeStatusQuery(npc),
    );
    return waitStatus(ctx, npc);
  });
}

function openTaxiMap(
  deps: TaxiDeps,
  npc: bigint,
  options?: { enable: boolean },
): Promise<TravelOutcome<MapResult>> {
  const { ctx, store, state } = deps;
  return guard(state, "map", async () => {
    store.beginMap(npc);
    try {
      sendMapQuery(ctx, npc, options?.enable === true);
      return await waitMap(ctx, store, npc);
    } finally {
      store.endMap();
    }
  });
}

function setTaxiBenchmark(
  deps: TaxiDeps,
  on: boolean,
): Promise<TravelOutcome<{ on: boolean }>> {
  const { ctx, store, state } = deps;
  return guard(state, "benchmark", () => {
    if (store.snapshot().benchmark === on) {
      ctx.send(
        GameOpcode.CMSG_SET_TAXI_BENCHMARK_MODE,
        buildSetTaxiBenchmarkMode(on),
      );
      return Promise.resolve({ status: "ok", on });
    }
    ctx.send(
      GameOpcode.CMSG_SET_TAXI_BENCHMARK_MODE,
      buildSetTaxiBenchmarkMode(on),
    );
    return waitBenchmark(ctx, on);
  });
}

async function destinations(
  deps: TaxiDeps,
  from: number,
): Promise<
  TravelOutcome<{
    from: number;
    node: TaxiNodeInfo;
    list: readonly TaxiDestination[];
  }>
> {
  const { ctx, store, state } = deps;
  const loaded = await readCatalog(ctx, state);
  if ("error" in loaded) return loaded.error;
  const record = loaded.catalog.node(from);
  if (record === undefined)
    return { status: "refused", reason: "unknown_node" };
  return {
    status: "ok",
    from,
    node: {
      id: record.id,
      map: record.map,
      x: record.x,
      y: record.y,
      z: record.z,
      name: record.name,
    },
    list: destinationList(
      loaded.catalog,
      new Set(store.snapshot().known ?? []),
      from,
    ),
  };
}

async function planFlight(
  deps: TaxiDeps,
  from: number,
  destination: string,
): Promise<TravelOutcome<RoutePlan>> {
  const { ctx, store, state } = deps;
  const loaded = await readCatalog(ctx, state);
  if ("error" in loaded) return loaded.error;
  if (loaded.catalog.node(from) === undefined)
    return { status: "refused", reason: "unknown_node" };
  const picked = pickDestination(loaded.catalog, destination);
  if ("refusal" in picked && picked.refusal === "ambiguous")
    return {
      status: "refused",
      reason: picked.refusal,
      matches: picked.matches,
    };
  if ("refusal" in picked) return { status: "refused", reason: picked.refusal };
  const known = new Set(store.snapshot().known ?? []);
  if (!known.has(picked.node))
    return { status: "refused", reason: "not_known" };
  const route = taxiRoute(loaded.catalog, known, from, picked.node);
  if (!route) return { status: "refused", reason: "no_route" };
  return { status: "ok", ...route, destination: picked.node };
}

function observeBenchmark(deps: TaxiDeps, entity: Entity | undefined): void {
  const { ctx, store } = deps;
  if (!entity || entity.guid !== ctx.selfGuid()) return;
  const on = benchmarkOf(entity);
  if (on !== undefined) store.receiveSelfFlags(on);
}

export function travelRuntime(
  ctx: AreaRuntimeCtx<TravelEvent>,
  store: TravelStore,
): AreaRuntime<TravelActs> {
  const state: TaxiRuntime = { catalog: undefined, pending: new Set() };
  const deps: TaxiDeps = { ctx, store, state };
  const offEntity = ctx.listen("entity", (event) => {
    if (event.type === "disappear") return;
    observeBenchmark(deps, event.entity);
    observeFlightFlag(deps, event.entity);
  });

  return {
    act: {
      bindActivate: (npc) => bindActivate(deps, npc),
      queryTaxiStatus: (npc) => queryTaxiStatus(deps, npc),
      openTaxiMap: (npc, options) => openTaxiMap(deps, npc, options),
      setTaxiBenchmark: (on) => setTaxiBenchmark(deps, on),
      destinations: (from) => destinations(deps, from),
      planFlight: (from, destination) => planFlight(deps, from, destination),
      activateTaxi: (npc, route, options) =>
        activateFlight(
          { ctx, store, readCatalog: () => readCatalog(ctx, state) },
          npc,
          route,
          options,
        ),
    },
    dispose: () => {
      offEntity();
    },
  };
}
