import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import type { AreaState, GameObjectEntity } from "@peon/core";
import {
  emptyUse,
  useParams,
  useSpec,
  useTool,
} from "#harness/areas/objects/tool";
import { createRefTable } from "#harness/ops/refs";
import { contentOf, toolCtx } from "#test-support/ops-fixtures";
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
const CRATE = 0xf110_0000_0000_0070n;

type ObjectsState = AreaState<"objects">;

function crateTemplate() {
  return {
    castBarCaption: "",
    data: [],
    displayId: 0,
    entry: 161_557,
    iconName: "",
    lockId: 43,
    name: "Milly's Harvest",
    pageId: undefined,
    questId: 3904,
    questItems: [],
    size: 1,
    type: 3,
  };
}

function state(over: Partial<ObjectsState> = {}): ObjectsState {
  return {
    lastMessage: undefined,
    pages: new Map(),
    pendingUse: undefined,
    templates: new Map([[161_557, crateTemplate()]]),
    triggers: { catalog: "none", inside: [], map: undefined, sent: [] },
    ...over,
  };
}

function crate(distance: number, over: Partial<GameObjectEntity> = {}) {
  return {
    ...gameObject(CRATE, "Milly's Harvest"),
    entry: 161_557,
    gameObjectType: 3,
    position: { mapId: 0, orientation: 0, x: distance, y: 0, z: 0 },
    ...over,
  };
}

async function world(distance = 2, templates = true) {
  const t = await createTestRuntime({ parts: { refs: createRefTable() } });
  jest
    .spyOn(t.handle.objects, "state")
    .mockImplementation(() =>
      state({ templates: templates ? state().templates : new Map() }),
    );
  setWorld(t.handle, {
    pose: selfPose(NOW),
    rows: [
      selfRow(),
      nearbyRow(crate(distance), {
        bearingRadians: 0,
        distance,
        horizontalDistance: distance,
      }),
    ],
  });
  t.rt.refs.refOf(CRATE);
  return t;
}

describe("use tool", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: useParams },
        {
          arguments: useSpec.minimalArgs,
          id: "c1",
          name: "probe",
          type: "toolCall",
        },
      ),
    ).toEqual(useSpec.minimalArgs);
  });

  test("an unknown object refuses not_found", async () => {
    const t = await world();
    const outcome = await useSpec.run({ object: "o9" }, toolCtx(t)).then(
      () => ({ reason: "resolved" }),
      (error: unknown) => error,
    );
    expect(outcome).toMatchObject({ reason: "not_found" });
    await expectSendKind(useTool, { object: "o9" });
  });

  test("a far object refuses too_far with a travel next", async () => {
    const t = await world(20);
    const outcome = await useSpec.run({ object: "o1" }, toolCtx(t)).then(
      () => ({ reason: "resolved" }),
      (error: unknown) => error,
    );
    expect(outcome).toMatchObject({
      next: 'travel(to: "o1")',
      reason: "too_far",
    });
  });

  test("an unusable kind refuses not_usable", async () => {
    const t = await world();
    setWorld(t.handle, {
      pose: selfPose(NOW),
      rows: [
        selfRow(),
        nearbyRow(crate(2, { gameObjectType: 5 }), {
          bearingRadians: 0,
          distance: 2,
          horizontalDistance: 2,
        }),
      ],
    });
    const outcome = await useSpec.run({ object: "o1" }, toolCtx(t));
    expect(outcome.status).toBe("DONE");
  });

  test("a locked chest without an open spell refuses locked", async () => {
    const t = await world();
    t.handle.objects.act.openLockSpell = async () => ({
      need: 1,
      ok: false as const,
      reason: "locked" as const,
      skill: 633,
    });
    const res = useSpec.run({ do: "open", object: "o1" }, toolCtx(t));
    await expect(res).rejects.toMatchObject({ reason: "locked" });
  });

  test("fallback returns an empty after", () => {
    expect(emptyUse()).toEqual({
      do: "use",
      object: "",
      opened: false,
      taken: [],
      text: undefined,
    });
  });

  test("the call renders as use", async () => {
    const t = await world();
    const { text } = await runTool(useTool.definition(t.rt), {
      object: "o1",
    });
    expect(text).toContain("Used Milly's Harvest (o1).");
    expect(contentOf).toBeDefined();
  });
});
