import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import type { AreaState, GameObjectEntity } from "@peon/core";
import { objectRows, reachYd } from "#harness/areas/objects/reads";
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

type KnownTemplates = boolean | "generic" | "unusable" | "unlocked" | "text";

function knownTemplates(templates: KnownTemplates) {
  if (templates === "generic")
    return new Map([[161_557, { ...crateTemplate(), type: 10 }]]);
  if (templates === "unusable")
    return new Map([[161_557, { ...crateTemplate(), type: 5 }]]);
  if (templates === "unlocked")
    return new Map([[161_557, { ...crateTemplate(), lockId: 0 }]]);
  if (templates === "text")
    return new Map([[161_557, { ...crateTemplate(), pageId: 2936, type: 9 }]]);
  return templates ? state().templates : new Map();
}

async function world(distance = 2, templates: KnownTemplates = true) {
  const t = await createTestRuntime({ parts: { refs: createRefTable() } });
  jest
    .spyOn(t.handle.objects, "state")
    .mockImplementation(() => state({ templates: knownTemplates(templates) }));
  setWorld(t.handle, {
    pose: selfPose(NOW),
    rows: [
      selfRow(),
      nearbyRow(
        crate(distance, templates === "text" ? { gameObjectType: 9 } : {}),
        {
          bearingRadians: 0,
          distance,
          horizontalDistance: distance,
        },
      ),
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

  test("a plain use past interaction distance refuses too_far", async () => {
    const t = await world(8, "generic");
    const outcome = await useSpec.run({ object: "o1" }, toolCtx(t)).then(
      () => ({ reason: "resolved" }),
      (error: unknown) => error,
    );
    expect(outcome).toMatchObject({
      next: 'travel(to: "o1")',
      reason: "too_far",
    });
  });

  test("a wide shrine widens the walk-up range past the centre range", async () => {
    const t = await world(5, "text");
    const store = {
      ...state(),
      boundsOf: () => ({
        id: 3011,
        maxX: 0.236,
        maxY: 0.4726,
        maxZ: 0,
        minX: -0.236,
        minY: 0.0004,
        minZ: 0.083,
      }),
      displayOf: () => 3011,
      templates: new Map([
        [
          161_557,
          { ...crateTemplate(), displayId: 3011, pageId: 2936, type: 9 },
        ],
      ]),
    };
    jest.spyOn(t.handle.objects, "state").mockImplementation(() => store);
    (t.handle.getEntity as ReturnType<typeof jest.fn>).mockImplementation(
      (guid: bigint) =>
        guid === CRATE
          ? {
              ...gameObject(CRATE, "Shrine"),
              entry: 161_557,
              gameObjectType: 9,
              scale: 1.91,
            }
          : undefined,
    );
    const rows = objectRows(toolCtx(t));
    const row = rows.find((near) => near.guid === CRATE);
    expect(row?.distance).toBe(5);
    expect(reachYd(row as never)).toBeLessThan(5);
    expect(reachYd(row as never, toolCtx(t))).toBeGreaterThanOrEqual(5);
  });

  test("a kind outside the usable set refuses not_usable", async () => {
    const t = await world(2, "unusable");
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
    const outcome = await useSpec.run({ object: "o1" }, toolCtx(t)).then(
      () => ({ reason: "resolved" }),
      (error: unknown) => error,
    );
    expect(outcome).toMatchObject({ reason: "not_usable" });
  });

  test("a default chest use asks for its open spell", async () => {
    const t = await world();
    t.handle.objects.act.openLockSpell = async () => ({
      need: 1,
      ok: false as const,
      reason: "locked" as const,
      skill: 633,
    });
    const outcome = await useSpec.run({ object: "o1" }, toolCtx(t)).then(
      () => ({ reason: "resolved" }),
      (error: unknown) => error,
    );
    expect(outcome).toMatchObject({ reason: "locked" });
  });

  test("a far open stays server-decidable through the cast margin", async () => {
    const t = await world(10);
    const outcome = await useSpec
      .run({ do: "open", object: "o1" }, toolCtx(t))
      .then(
        () => ({ reason: "resolved" }),
        (error: unknown) => error,
      );
    expect(outcome).not.toMatchObject({ reason: "too_far" });
  });

  test("an unlocked chest without an open spell refuses no_open_spell", async () => {
    const t = await world(2, "unlocked");
    t.handle.objects.act.openLockSpell = async () => ({
      need: 0,
      ok: false as const,
      reason: "locked" as const,
      skill: 0,
    });
    const acts = t.handle.objects.act;
    const sends: string[] = [];
    acts.use = ((guid: bigint) => {
      sends.push("use");
      return { ok: true as const, record: { entry: 161_557, guid } };
    }) as typeof acts.use;
    const outcome = await useSpec
      .run({ do: "open", object: "o1" }, toolCtx(t))
      .then(
        () => ({ reason: "resolved" }),
        (error: unknown) => error,
      );
    expect(outcome).toMatchObject({ reason: "no_open_spell" });
    expect(sends).toEqual([]);
  });

  test("an unlocked chest opens through its opening spell, not GAMEOBJ_USE", async () => {
    const t = await world(2, "unlocked");
    t.handle.objects.act.openLockSpell = async () => ({
      by: "spell",
      spellId: 3365,
    });
    const acts = t.handle.objects.act;
    const baseRewards = t.handle.getRewardsState();
    const opened = {
      ...baseRewards,
      loot: {
        guid: CRATE,
        invalidatedReason: undefined,
        items: [],
        lootType: 1,
        money: 0,
        openedAt: 0,
        phase: "open" as const,
      },
    };
    const closedLoot = { phase: "closed" as const };
    const closed = {
      ...baseRewards,
      lastRelease: { guid: CRATE, observedAt: 0, status: 1 as const },
      loot: closedLoot,
    };
    const order: string[] = [];
    const opening = {
      ...baseRewards,
      loot: { guid: CRATE, phase: "opening" as const, requestedAt: 0 },
    };
    acts.open = ((_guid: bigint, spellId: number) => {
      order.push(`open:${spellId}`);
      t.handle.getRewardsState = (() =>
        opening) as typeof t.handle.getRewardsState;
      queueMicrotask(() => {
        t.handle.getRewardsState = (() =>
          opened) as typeof t.handle.getRewardsState;
        t.handle.triggerRewardsEvent({
          at: 0,
          state: opened,
          type: "loot_opened",
        });
      });
      return { ok: true as const };
    }) as typeof acts.open;
    t.handle.getRewardsState = (() =>
      closed) as typeof t.handle.getRewardsState;
    t.handle.releaseLoot = (() => {
      t.handle.getRewardsState = (() =>
        closed) as typeof t.handle.getRewardsState;
      t.handle.triggerRewardsEvent({
        at: 0,
        state: closed,
        type: "loot_release_observed",
      });
    }) as typeof t.handle.releaseLoot;
    const outcome = (await useSpec.run(
      { do: "open", object: "o1" },
      toolCtx(t),
    )) as { status: string };
    expect(outcome.status).toBe("DONE");
    expect(order).toEqual(["open:3365"]);
  });

  test("a default goober with a page reads instead of using", async () => {
    const t = await world(2, "text");
    t.handle.objects.act.readPage = (async () => ({
      firstPageId: 2936,
      pages: [{ pageId: 2936, text: "You have discovered the shrine." }],
    })) as typeof t.handle.objects.act.readPage;
    const outcome = (await useSpec.run({ object: "o1" }, toolCtx(t))) as {
      status: string;
    };
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
    const t = await world(2, "generic");
    const { text } = await runTool(useTool.definition(t.rt), {
      object: "o1",
    });
    expect(text).toContain("Used Milly's Harvest (o1).");
    expect(contentOf).toBeDefined();
  });
});
