import { describe, expect, test } from "bun:test";
import { travelTaxiDbc } from "#test-support/areas/travel";
import { loadTaxiCatalog } from "#wow/areas/travel/catalog";
import { taxiRoute } from "#wow/areas/travel/route";

const NODES = [
  {
    id: 82,
    map: 530,
    x: 9411.31,
    y: -7278.72,
    z: 15.9,
    name: "Silvermoon City",
  },
  { id: 83, map: 530, x: 7535.26, y: -6812.75, z: 84.92, name: "Tranquillien" },
  { id: 84, map: 530, x: 8434.9, y: -7287.13, z: 148.02, name: "Zul'Aman" },
];
const PATHS = [
  { id: 1, from: 82, to: 83, price: 210 },
  { id: 2, from: 83, to: 82, price: 210 },
  { id: 3, from: 83, to: 84, price: 430 },
  { id: 4, from: 84, to: 83, price: 430 },
];

describe("taxi catalog", () => {
  test("loads nodes with id, map, position and name and edges with from, to and price (DBCfmt.h:123-124)", async () => {
    const catalog = await loadTaxiCatalog(
      travelTaxiDbc({ nodes: NODES, paths: PATHS }),
    );
    expect(catalog.node(82)).toMatchObject({
      id: 82,
      map: 530,
      name: "Silvermoon City",
    });
    expect(catalog.node(83)?.x).toBeCloseTo(7535.26, 2);
    expect(catalog.edgesFrom(82)).toEqual([{ from: 82, to: 83, price: 210 }]);
  });

  test("rejects missing_taxi_data when the source has no TaxiNodes.dbc", async () => {
    await expect(
      loadTaxiCatalog(
        travelTaxiDbc({ nodes: NODES, paths: PATHS, omit: ["TaxiNodes.dbc"] }),
      ),
    ).rejects.toThrow("missing_taxi_data");
  });

  test("rejects missing_taxi_data when the source has no TaxiPath.dbc", async () => {
    await expect(
      loadTaxiCatalog(
        travelTaxiDbc({ nodes: NODES, paths: PATHS, omit: ["TaxiPath.dbc"] }),
      ),
    ).rejects.toThrow("missing_taxi_data");
  });
});

describe("taxi route", () => {
  test("returns the cheapest chain of direct edges over known nodes with the summed list price (ObjectMgr.cpp:7183-7203)", async () => {
    const catalog = await loadTaxiCatalog(
      travelTaxiDbc({ nodes: NODES, paths: PATHS }),
    );
    expect(taxiRoute(catalog, new Set([82, 83, 84]), 82, 84)).toEqual({
      nodes: [82, 83, 84],
      price: 640,
    });
  });

  test("returns undefined when a hop crosses an unknown node or no chain exists", async () => {
    const catalog = await loadTaxiCatalog(
      travelTaxiDbc({ nodes: NODES, paths: PATHS }),
    );
    expect(taxiRoute(catalog, new Set([82, 84]), 82, 84)).toBeUndefined();
    expect(taxiRoute(catalog, new Set([82]), 82, 84)).toBeUndefined();
  });

  test("returns the reverse chain with its summed price over known nodes", async () => {
    const catalog = await loadTaxiCatalog(
      travelTaxiDbc({ nodes: NODES, paths: PATHS }),
    );
    expect(taxiRoute(catalog, new Set([82, 83, 84]), 84, 82)).toEqual({
      nodes: [84, 83, 82],
      price: 640,
    });
  });
});
