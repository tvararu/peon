import { describe, expect, jest, test } from "bun:test";
import type { AreaState } from "@peon/core";
import { createRefTable } from "#harness/ops/refs";
import { lookTool } from "#harness/tools/look";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { expectSendKind, runTool } from "#test-support/tool-harness";
import {
  gameObject,
  nearbyRow,
  selfPose,
  selfRow,
  setWorld,
} from "#test-support/world-fixtures";

const NOW = 1_000_000;
const OBJECT_GUID = 0xf110_0000_0000_0070n;

type ObjectsState = AreaState<"objects">;

function objectState(over: Partial<ObjectsState>): ObjectsState {
  return {
    displays: undefined,
    lastMessage: undefined,
    pages: new Map(),
    pendingUse: undefined,
    templates: new Map([
      [
        161_557,
        {
          castBarCaption: "",
          data: [],
          displayId: 0,
          entry: 161_557,
          iconName: "",
          lockId: 0,
          name: "Milly's Harvest",
          pageId: undefined,
          questId: 3904,
          questItems: [],
          size: 1,
          type: 3,
        },
      ],
    ]),
    triggers: { catalog: "none", inside: [], map: undefined, sent: [] },
    ...over,
  };
}

async function world() {
  const { clock, handle, rt } = await createTestRuntime({
    parts: { refs: createRefTable() },
  });
  clock.set(NOW);
  jest.spyOn(handle.objects, "state").mockImplementation(() => objectState({}));
  const object = {
    ...gameObject(OBJECT_GUID, "Milly's Harvest"),
    entry: 161_557,
    gameObjectType: 3,
    position: { mapId: 530, orientation: 0, x: 8735, y: -6665, z: 72 },
    rawFields: new Map([[14, 1]]),
  };
  setWorld(handle, {
    place: { area: "Northshire", zone: "Elwynn Forest" },
    pose: selfPose(NOW),
    rows: [
      selfRow(),
      nearbyRow(object, {
        bearingRadians: 0,
        distance: 20,
        horizontalDistance: 20,
      }),
    ],
  });
  return { handle, rt, tool: lookTool.definition(rt) };
}

describe("look at objects", () => {
  test("find object lists the crate with kind, distance and flags", async () => {
    const { tool } = await world();
    const { details, text } = await runTool(tool, { find: "object" });
    expect(text.split("\n")).toContain(
      "- o1 Milly's Harvest, chest, quest, 20 yd N",
    );
    const after = details.tool === "look" ? details.result.after : undefined;
    expect(after).toMatchObject({ filter: "any", matched: 0 });
    await expectSendKind(lookTool, { find: "object" });
  });

  test("locked and busy flags appear when set", async () => {
    const { handle, rt } = await world();
    const again = {
      ...gameObject(OBJECT_GUID, "Milly's Harvest"),
      entry: 161_557,
      flags: 3,
      gameObjectType: 3,
      position: { mapId: 530, orientation: 0, x: 8735, y: -6665, z: 72 },
      rawFields: new Map([[14, 1]]),
    };
    setWorld(handle, {
      place: { area: "Northshire", zone: "Elwynn Forest" },
      pose: selfPose(NOW),
      rows: [
        selfRow(),
        nearbyRow(again, {
          bearingRadians: 0,
          distance: 20,
          horizontalDistance: 20,
        }),
      ],
    });
    const { text } = await runTool(lookTool.definition(rt), {
      find: "object",
    });
    expect(text.split("\n")).toContain(
      "- o1 Milly's Harvest, chest, quest, locked, busy, 20 yd N",
    );
  });

  test("nothing matching says no objects within range", async () => {
    const { tool } = await world();
    const { text } = await runTool(tool, { find: "object", name: "zzz" });
    expect(text).toContain("No objects within 60 yd.");
  });

  test("within narrows the object range", async () => {
    const { tool } = await world();
    const { details, text } = await runTool(tool, {
      find: "object",
      within: 10,
    });
    expect(text).toContain("No objects within 10 yd.");
    const after = details.tool === "look" ? details.result.after : undefined;
    expect(after?.rows).toEqual([]);
  });
});
