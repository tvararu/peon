import { describe, expect, test } from "bun:test";
import { transportsDbc } from "@peon/core/test-support/areas/transports";
import { travelTaxiDbc } from "@peon/core/test-support/areas/travel";
import {
  namesNear,
  readNodes,
  readPathStops,
  servesStop,
} from "#harness/areas/transports/stops";

const NODES = [
  { id: 35, map: 1, name: "Transport, Orgrimmar", x: 1320, y: -4649, z: 21 },
  { id: 22, map: 1, name: "Thunder Bluff, Mulgore", x: -1197, y: 29, z: 130 },
  { id: 90, map: 0, name: "Undercity", x: 1000, y: 0, z: 0 },
];

async function nodes() {
  return readNodes(travelTaxiDbc({ nodes: NODES, paths: [] }));
}

describe("transport stops", () => {
  test("names the nodes within range on the same map only", async () => {
    const read = await nodes();
    const at = { mapId: 1, x: -1026.9, y: 375.8 };
    expect(namesNear(read, at)).toEqual(["Thunder Bluff, Mulgore"]);
    expect(namesNear(read, { ...at, mapId: 0 })).toEqual([]);
  });

  test("a stop matches a node name by part, ignoring case", async () => {
    const read = await nodes();
    const dock = { mapId: 1, x: 1125.4, y: -4134.9 };
    expect(servesStop(read, dock, "orgrimmar")).toBe(true);
    expect(servesStop(read, dock, "Thunder Bluff")).toBe(false);
    expect(servesStop(read, dock, "  ")).toBe(false);
  });

  test("a missing node file rejects", async () => {
    await expect(
      readNodes(
        travelTaxiDbc({ nodes: NODES, omit: ["TaxiNodes.dbc"], paths: [] }),
      ),
    ).rejects.toThrow("TaxiNodes.dbc");
  });

  test("reads only the stop frames of each path", async () => {
    const source = transportsDbc({
      nodes: [
        { actionFlag: 2, index: 0, mapId: 1, path: 7, x: 1, y: 2, z: 3 },
        { index: 1, mapId: 1, path: 7, x: 50, y: 60, z: 3 },
        { actionFlag: 2, index: 2, mapId: 0, path: 7, x: 9, y: 8, z: 3 },
        { actionFlag: 2, index: 0, mapId: 1, path: 8, x: 4, y: 5, z: 3 },
      ],
    });
    const paths = await readPathStops(source);
    expect(paths.get(7)).toEqual([
      { mapId: 1, x: 1, y: 2 },
      { mapId: 0, x: 9, y: 8 },
    ]);
    expect(paths.get(8)).toEqual([{ mapId: 1, x: 4, y: 5 }]);
  });
});
