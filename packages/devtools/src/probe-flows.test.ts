import { describe, expect, test } from "bun:test";
import type { Entity, WorldHandle } from "@peon/core";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import { type FlowContext, loadFlows } from "#tools/probe-flows";

type Row = ReturnType<WorldHandle["queryNearby"]>[number];
type Spec = {
  guid: bigint;
  entry: number;
  name: string;
  objectType: 3 | 4 | 5;
  distance: number | null;
  roles?: Row["roles"];
  self?: boolean;
};

function row(spec: Spec): Row {
  const { guid, entry, name, objectType, distance, roles = [] } = spec;
  const position = { mapId: 530, orientation: 0, x: 1, y: 2, z: 3 };
  const entity: Entity = {
    entry,
    guid,
    name,
    objectType,
    position,
    rawFields: new Map(),
    scale: 1,
  };
  return {
    attackable: false,
    attackingMe: false,
    bearingRadians: null,
    distance,
    entity,
    horizontalDistance: distance,
    lootable: false,
    originSource: null,
    originUpdatedAt: null,
    position,
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 0,
    relation: "friendly",
    remotePose: undefined,
    roles,
    self: spec.self ?? false,
    tapped: false,
    tappedByOther: false,
    targetOf: undefined,
    turnRadians: null,
  };
}

const ROWS = [
  row({
    distance: 0,
    entry: 0,
    guid: 1n,
    name: "Me",
    objectType: 4,
    self: true,
  }),
  row({
    distance: 4.26,
    entry: 15_278,
    guid: 0xf1_30n,
    name: "Magistrix Erona",
    objectType: 3,
    roles: ["gossip", "questgiver"],
  }),
  row({
    distance: 9.5,
    entry: 16_475,
    guid: 0xf1_31n,
    name: "Marshal Wolf",
    objectType: 3,
    roles: ["gossip"],
  }),
  row({
    distance: 12,
    entry: 181_222,
    guid: 0xf1_32n,
    name: "Chest",
    objectType: 5,
  }),
  row({ distance: 20, entry: 0, guid: 0x77n, name: "Fbuddy", objectType: 4 }),
];

function context(
  args: Record<string, string> = {},
): FlowContext & { talked: bigint[] } {
  const handle = createMockHandle();
  const talked: bigint[] = [];
  handle.queryNearby = () => ROWS;
  handle.talk = (guid) => talked.push(guid);
  return { args, handle, talked };
}

const flows = await loadFlows();

function flow(name: string) {
  const found = flows.get(name);
  if (!found) throw new Error(`no flow ${name}`);
  return found;
}

describe("loadFlows", () => {
  test("finds one flow per file in probe-flows", () => {
    expect([...flows.keys()].sort()).toEqual(["login", "nearest", "talk"]);
  });
});

describe("login flow", () => {
  test("reports where the character stands", async () => {
    const ctx = context();
    ctx.handle.getPlaceState = () => ({
      area: "Sunstrider Isle",
      areaId: 3431,
      at: 1,
      mapId: 530,
      zone: "Eversong Woods",
      zoneId: 3430,
    });
    expect(await flow("login").run(ctx)).toEqual({
      area: "Sunstrider Isle",
      mapId: 530,
      pose: null,
      zone: "Eversong Woods",
    });
  });
});

describe("nearest flow", () => {
  test("lists the nearest entities of a role, never the character", async () => {
    const result = await flow("nearest").run(context({ kind: "gossip" }));
    expect(result).toEqual({
      kind: "gossip",
      rows: [
        {
          distance: 4.3,
          entry: 15_278,
          guid: "0xf130",
          name: "Magistrix Erona",
          roles: ["gossip", "questgiver"],
          type: "unit",
        },
        {
          distance: 9.5,
          entry: 16_475,
          guid: "0xf131",
          name: "Marshal Wolf",
          roles: ["gossip"],
          type: "unit",
        },
      ],
    });
  });

  test("matches object types", async () => {
    const objects = await flow("nearest").run(context({ kind: "gameobject" }));
    const players = await flow("nearest").run(context({ kind: "player" }));
    expect(objects).toMatchObject({
      rows: [{ entry: 181_222, type: "gameobject" }],
    });
    expect(players).toMatchObject({
      rows: [{ name: "Fbuddy", type: "player" }],
    });
  });

  test("refuses an unknown kind", () => {
    const run = () => flow("nearest").run(context({ kind: "dragon" }));
    expect(run).toThrow("kind=");
  });
});

describe("talk flow", () => {
  test("talks to the nearest entity with the entry", async () => {
    const ctx = context({ entry: "16475" });
    expect(await flow("talk").run(ctx)).toEqual({
      distance: 9.5,
      entry: 16_475,
      guid: "0xf131",
      name: "Marshal Wolf",
      roles: ["gossip"],
      type: "unit",
    });
    expect(ctx.talked).toEqual([0xf1_31n]);
  });

  test("refuses when no such entity is nearby", () => {
    const ctx = context({ entry: "1" });
    expect(() => flow("talk").run(ctx)).toThrow("entry 1");
    expect(ctx.talked).toEqual([]);
  });

  test("refuses a missing or non-numeric entry", () => {
    const missing = () => flow("talk").run(context());
    const word = () => flow("talk").run(context({ entry: "x" }));
    expect(missing).toThrow("entry=");
    expect(word).toThrow("entry=");
  });
});
