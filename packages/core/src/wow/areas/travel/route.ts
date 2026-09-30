import type { TaxiCatalog } from "#wow/areas/travel/catalog";

export type TaxiRoute = { nodes: readonly number[]; price: number };

type Search = {
  best: Map<number, number>;
  prev: Map<number, number>;
  visited: Set<number>;
};

function cheapestOpen(
  search: Search,
): { node: number; cost: number } | undefined {
  let found: { node: number; cost: number } | undefined;
  for (const [node, cost] of search.best) {
    if (search.visited.has(node)) continue;
    if (found === undefined || cost < found.cost) found = { node, cost };
  }
  return found;
}

function buildRoute(
  search: Search,
  from: number,
  to: number,
  price: number,
): TaxiRoute | undefined {
  const nodes = [to];
  for (let node = to; node !== from; ) {
    const back = search.prev.get(node);
    if (back === undefined) return undefined;
    nodes.unshift(back);
    node = back;
  }
  return { nodes, price };
}

type Step = {
  catalog: TaxiCatalog;
  known: ReadonlySet<number>;
  current: number;
  currentCost: number;
};

function relax(search: Search, step: Step): void {
  for (const edge of step.catalog.edgesFrom(step.current)) {
    if (!step.known.has(edge.to) || search.visited.has(edge.to)) continue;
    const cost = step.currentCost + edge.price;
    const seen = search.best.get(edge.to);
    if (seen === undefined || cost < seen) {
      search.best.set(edge.to, cost);
      search.prev.set(edge.to, step.current);
    }
  }
}

export function taxiRoute(
  catalog: TaxiCatalog,
  known: ReadonlySet<number>,
  from: number,
  to: number,
): TaxiRoute | undefined {
  if (!(known.has(from) && known.has(to))) return undefined;
  const search: Search = {
    best: new Map([[from, 0]]),
    prev: new Map(),
    visited: new Set(),
  };
  for (;;) {
    const open = cheapestOpen(search);
    if (open === undefined) return undefined;
    if (open.node === to) return buildRoute(search, from, to, open.cost);
    search.visited.add(open.node);
    relax(search, {
      catalog,
      known,
      current: open.node,
      currentCost: open.cost,
    });
  }
}
