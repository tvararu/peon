import { describe, expect, jest, test } from "bun:test";
import { type AreaState, DisplayCatalog } from "@peon/core";
import { useSpec } from "#harness/areas/objects/tool";
import { createRefTable } from "#harness/ops/refs";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import {
  gameObject,
  nearbyRow,
  selfPose,
  selfRow,
  setWorld,
} from "#test-support/world-fixtures";

const NOW = 1_000_000;
const PLAQUE = 0xf110_0000_0000_0071n;
const ENTRY = 180_516;

function plaqueState(): AreaState<"objects"> {
  return {
    anims: new Map(),
    despawning: new Set(),
    displays: new DisplayCatalog([
      {
        id: 3011,
        maxX: 5,
        maxY: 0.5,
        maxZ: 0.1,
        minX: -5,
        minY: -0.5,
        minZ: 0,
      },
    ]),
    fishing: undefined,
    lastMessage: undefined,
    pages: new Map(),
    pendingUse: undefined,
    templates: new Map([
      [
        ENTRY,
        {
          castBarCaption: "",
          data: [],
          displayId: 3011,
          entry: ENTRY,
          iconName: "",
          lockId: 0,
          name: "Shrine of Dath'Remar",
          pageId: 2936,
          questId: 0,
          questItems: [],
          size: 1,
          type: 9,
        },
      ],
    ]),
    triggers: { catalog: "none", inside: [], map: undefined, sent: [] },
  };
}

async function shrineWorld(selfX: number) {
  const t = await createTestRuntime({ parts: { refs: createRefTable() } });
  jest.spyOn(t.handle.objects, "state").mockImplementation(plaqueState);
  const read = jest.fn(async () => ({
    firstPageId: 2936,
    pages: [{ pageId: 2936, text: "You have discovered the shrine." }],
  }));
  t.handle.objects.act.readPage =
    read as unknown as typeof t.handle.objects.act.readPage;
  (t.handle.getEntity as ReturnType<typeof jest.fn>).mockImplementation(
    (guid: bigint) =>
      guid === PLAQUE
        ? {
            ...gameObject(PLAQUE, "Shrine of Dath'Remar"),
            entry: ENTRY,
            gameObjectType: 9,
            scale: 1,
          }
        : undefined,
  );
  const plaque = (x: number) => ({
    ...gameObject(PLAQUE, "Shrine of Dath'Remar"),
    entry: ENTRY,
    gameObjectType: 9,
    position: { mapId: 0, orientation: 0, x, y: 0, z: 72 },
  });
  const at = { x: selfX, y: 0, z: 72 };
  setWorld(t.handle, {
    pose: selfPose(NOW, at),
    rows: [
      selfRow(),
      nearbyRow(plaque(0), {
        bearingRadians: 0,
        distance: 8,
        horizontalDistance: 0,
      }),
    ],
  });
  t.rt.refs.refOf(PLAQUE);
  return { read, t };
}

describe("use read reach", () => {
  test("a page object outside the display reach refuses too_far", async () => {
    const { read, t } = await shrineWorld(30);
    const outcome = await useSpec
      .run({ do: "read", object: "o1" }, toolCtx(t))
      .then(
        () => ({ reason: "resolved" }),
        (error: unknown) => error,
      );
    expect(outcome).toMatchObject({
      next: 'travel(to: "o1")',
      reason: "too_far",
    });
    expect(read).not.toHaveBeenCalled();
  });

  test("a page object inside the display reach is read", async () => {
    const { read, t } = await shrineWorld(0);
    const outcome = (await useSpec.run(
      { do: "read", object: "o1" },
      toolCtx(t),
    )) as { status: string };
    expect(outcome.status).toBe("DONE");
    expect(read).toHaveBeenCalledTimes(1);
  });
});
