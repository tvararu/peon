import { describe, expect, jest, test } from "bun:test";
import type { AreaEventOf, RewardsState } from "@peon/core";
import {
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import { useSpec } from "#harness/areas/objects/tool";
import { Refusal } from "#harness/ops/refusal";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  combatEvent,
  definition,
  SELF,
  type SpellWorld,
  spellWorld,
} from "#test-support/spell-tool-fixtures";
import { stocked } from "#test-support/trade-fixtures";
import {
  gameObject,
  nearbyRow,
  selfPose,
  selfRow,
  setWorld,
} from "#test-support/world-fixtures";

const FISHING = 7620;
const POLE_ENTRY = 6256;
const POLE = 0x4000_0000_0000_0c10n;
const BOBBER = 0xf110_0000_0000_0090n;
const NOW = 1_000_000;
const HOOK_WAIT_MS = 40_000;

type ObjectsEventOf<T extends AreaEventOf<"objects">["type"]> = Extract<
  AreaEventOf<"objects">,
  { type: T }
>;

type World = SpellWorld & { order: string[] };

type WorldInit = {
  book?: boolean;
  fishing?: boolean;
  pole?: "pole" | "sword" | "none";
};

function fishingState(on: boolean | undefined) {
  return on ? { bobber: BOBBER, phase: "waiting" as const } : undefined;
}

async function world(init: WorldInit = {}): Promise<World> {
  const t = await spellWorld({
    book:
      init.book === false
        ? []
        : [definition({ id: FISHING, name: "Fishing", rank: "Apprentice" })],
  });
  const state = t.handle.objects.state();
  jest.spyOn(t.handle.objects, "state").mockImplementation(() => ({
    ...state,
    fishing: fishingState(init.fishing),
  }));
  if (init.pole !== "none")
    stocked(t.handle, [
      {
        bag: 255,
        entry: POLE_ENTRY,
        guid: POLE,
        name: init.pole === "sword" ? "Shortsword" : "Fishing Pole",
        slot: 15,
      },
    ]);
  jest.spyOn(t.handle, "getItemTemplate").mockResolvedValue({
    itemClass: 2,
    subclass: init.pole === "sword" ? 7 : 20,
  } as never);
  setWorld(t.handle, {
    pose: selfPose(NOW),
    rows: [
      selfRow(),
      nearbyRow(
        {
          ...gameObject(BOBBER, "Fishing Bobber"),
          entry: 35_591,
          gameObjectType: 17,
        },
        { bearingRadians: 0, distance: 12, horizontalDistance: 12 },
      ),
    ],
  });
  jest
    .spyOn(t.handle, "getControlState")
    .mockReturnValue({ ...t.handle.getControlState(), selfGuid: SELF });
  const baseRewards = t.handle.getRewardsState();
  t.handle.getRewardsState = (() => ({
    ...baseRewards,
    inventory: { ...baseRewards.inventory, freeSlots: 10 },
  })) as typeof t.handle.getRewardsState;
  return { ...t, order: [] };
}

function objectsEvent(t: World, event: AreaEventOf<"objects">): void {
  t.handle.triggerAreaEvent("objects", event);
}

function castThen(t: World, reply: () => void) {
  return jest.spyOn(t.handle, "cast").mockImplementation(() => {
    t.order.push("cast");
    reply();
  });
}

function hooked(t: World) {
  return castThen(t, () =>
    objectsEvent(t, {
      bobber: BOBBER,
      type: "fish_hooked",
    } satisfies ObjectsEventOf<"fish_hooked">),
  );
}

type Offer = { itemId: number; slot: number }[];

function lootWindow(t: World, items: Offer) {
  const base = t.handle.getRewardsState();
  const offered = items.map((item) => ({
    count: 1,
    displayId: 0,
    itemId: item.itemId,
    randomPropertyId: 0,
    randomSuffix: 0,
    slot: item.slot,
    slotType: 0,
  }));
  const open = (list: typeof offered): RewardsState => ({
    ...base,
    loot: {
      guid: BOBBER,
      invalidatedReason: undefined,
      items: list,
      lootType: 3,
      money: 0,
      openedAt: 0,
      phase: "open",
    },
  });
  const closed: RewardsState = {
    ...base,
    lastRelease: { guid: BOBBER, observedAt: 0, status: 1 },
    loot: { phase: "closed" },
  };
  const set = (state: RewardsState) => {
    t.handle.getRewardsState = (() => state) as typeof t.handle.getRewardsState;
  };
  set({ ...base, loot: { phase: "closed" } });
  t.handle.openLoot = ((guid: bigint) => {
    t.order.push(`open:${guid === BOBBER}`);
    const state = open(offered);
    set(state);
    t.handle.triggerRewardsEvent({ at: 0, state, type: "loot_opened" });
  }) as typeof t.handle.openLoot;
  t.handle.objects.act.use = ((guid: bigint) => {
    t.order.push(`use:${guid === BOBBER}`);
    return { ok: true as const, record: { entry: 35_591, guid } };
  }) as typeof t.handle.objects.act.use;
  t.handle.takeLoot = ((slot: number) => {
    t.order.push(`take:${slot}`);
    const index = offered.findIndex((item) => item.slot === slot);
    if (index >= 0) offered.splice(index, 1);
    const removed = open(offered);
    set(removed);
    t.handle.triggerRewardsEvent({
      at: 0,
      state: removed,
      type: "loot_removed",
    });
    const push: RewardsState = {
      ...removed,
      lastItemPush: {
        bagSlot: 0,
        count: 1,
        created: 0,
        guid: 0n,
        itemId: 6291,
        observedAt: 0,
        randomPropertyId: 0,
        randomSuffix: 0,
        received: 0,
        showInChat: 0,
        slot: 0,
        totalCount: 1,
      },
    };
    t.handle.triggerRewardsEvent({ at: 0, state: push, type: "item_push" });
  }) as typeof t.handle.takeLoot;
  t.handle.releaseLoot = (() => {
    t.order.push("release");
    set(closed);
    t.handle.triggerRewardsEvent({
      at: 0,
      state: closed,
      type: "loot_release_observed",
    });
  }) as typeof t.handle.releaseLoot;
}

async function refusal(promise: Promise<unknown>): Promise<Refusal> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof Refusal)) throw new Error("no refusal");
  return error;
}

type RunArgs = Parameters<typeof useSpec.run>[0];
type RunCtx = Parameters<typeof useSpec.run>[1];

function runFish(args: RunArgs, ctx: RunCtx) {
  return withFakeTimers(() => fakeAwait(useSpec.run(args, ctx), 10_000));
}

function runRefusal(args: RunArgs, ctx: RunCtx) {
  return refusal(runFish(args, ctx));
}

describe("use do:fish", () => {
  test("a character without the Fishing spell is refused no_fishing and casts nothing", async () => {
    const t = await world({ book: false });
    const cast = castThen(t, () => undefined);
    const out = await runRefusal({ do: "fish" }, toolCtx(t));
    expect(out.reason).toBe("no_fishing");
    expect(cast).not.toHaveBeenCalled();
  });

  test("an empty main hand is refused no_pole and casts nothing", async () => {
    const t = await world({ pole: "none" });
    const cast = castThen(t, () => undefined);
    const out = await runRefusal({ do: "fish" }, toolCtx(t));
    expect(out.reason).toBe("no_pole");
    expect(cast).not.toHaveBeenCalled();
  });

  test("a main-hand weapon that is not a fishing pole is refused no_pole", async () => {
    const t = await world({ pole: "sword" });
    const cast = castThen(t, () => undefined);
    const out = await runRefusal({ do: "fish" }, toolCtx(t));
    expect(out.reason).toBe("no_pole");
    expect(cast).not.toHaveBeenCalled();
  });

  test("a line already in the water is refused already_fishing", async () => {
    const t = await world({ fishing: true });
    const cast = castThen(t, () => undefined);
    const out = await runRefusal({ do: "fish" }, toolCtx(t));
    expect(out.reason).toBe("already_fishing");
    expect(cast).not.toHaveBeenCalled();
  });

  test("a bite uses the bobber at once, loots the empty window and releases it", async () => {
    const t = await world();
    const cast = hooked(t);
    lootWindow(t, []);
    const out = await runFish({ do: "fish" }, toolCtx(t));
    expect(cast).toHaveBeenCalledWith(FISHING, 0n);
    expect(t.order).toEqual(["cast", "use:true", "open:true", "release"]);
    expect(out.status).toBe("DONE");
    expect(out.after).toMatchObject({ do: "fish", opened: true, taken: [] });
  });

  test("a caught item is taken and named in the result", async () => {
    const t = await world();
    hooked(t);
    stocked(t.handle, [
      {
        bag: 255,
        entry: POLE_ENTRY,
        guid: POLE,
        name: "Fishing Pole",
        slot: 15,
      },
      {
        bag: 23,
        entry: 6291,
        guid: 0x4000_0000_0000_0c20n,
        name: "Raw Brilliant Smallfish",
        slot: 0,
      },
    ]);
    lootWindow(t, [{ itemId: 6291, slot: 0 }]);
    const out = await runFish({ do: "fish" }, toolCtx(t));
    expect(t.order).toEqual([
      "cast",
      "use:true",
      "open:true",
      "take:0",
      "release",
    ]);
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Raw Brilliant Smallfish");
    expect(out.after).toMatchObject({
      taken: ["1 x Raw Brilliant Smallfish"],
    });
  });

  test("a stale open loot window is released before the bobber is used", async () => {
    const t = await world();
    hooked(t);
    lootWindow(t, []);
    const base = t.handle.getRewardsState();
    t.handle.getRewardsState = (() => ({
      ...base,
      loot: {
        guid: 0x99n,
        invalidatedReason: undefined,
        items: [],
        lootType: 1,
        money: 0,
        openedAt: 0,
        phase: "open" as const,
      },
    })) as typeof t.handle.getRewardsState;
    const release = t.handle.releaseLoot;
    await runFish({ do: "fish" }, toolCtx(t));
    expect(t.order.slice(0, 3)).toEqual(["cast", "release", "use:true"]);
    expect(release).toBeDefined();
  });

  test("fish_not_hooked ends FAILED and never uses the bobber", async () => {
    const t = await world();
    castThen(t, () => objectsEvent(t, { type: "fish_not_hooked" }));
    lootWindow(t, []);
    const out = await runFish({ do: "fish" }, toolCtx(t));
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("not_hooked");
    expect(t.order).toEqual(["cast"]);
  });

  test("fish_escaped ends FAILED and never uses the bobber", async () => {
    const t = await world();
    castThen(t, () => objectsEvent(t, { type: "fish_escaped" }));
    lootWindow(t, []);
    const out = await runFish({ do: "fish" }, toolCtx(t));
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("escaped");
    expect(t.order).toEqual(["cast"]);
  });

  test("a failed cast ends FAILED with the server's reason", async () => {
    const t = await world();
    castThen(t, () =>
      t.handle.triggerCombatEvent(
        combatEvent(t.state(), "cast_failed", FISHING, "no_fishable_water"),
      ),
    );
    const out = await runFish({ do: "fish" }, toolCtx(t));
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("no_fishable_water");
  });

  test("a failure of another spell does not end the wait", async () => {
    await withFakeTimers(async () => {
      const t = await world();
      castThen(t, () =>
        t.handle.triggerCombatEvent(combatEvent(t.state(), "cast_failed", 133)),
      );
      const out = await fakeAwait(
        useSpec.run({ do: "fish" }, toolCtx(t)),
        HOOK_WAIT_MS,
      );
      expect(out.status).toBe("UNCONFIRMED");
    });
  });

  test("no bite within 30 s is UNCONFIRMED no_bite", async () => {
    await withFakeTimers(async () => {
      const t = await world();
      castThen(t, () => undefined);
      lootWindow(t, []);
      const out = await fakeAwait(
        useSpec.run({ do: "fish" }, toolCtx(t)),
        HOOK_WAIT_MS,
      );
      expect(out.status).toBe("UNCONFIRMED");
      expect(out.reason).toBe("no_bite");
      expect(t.order).toEqual(["cast"]);
    });
  });

  test("an abort while waiting for the bite rejects", async () => {
    await withFakeTimers(async () => {
      const t = await world();
      castThen(t, () => undefined);
      const stop = new AbortController();
      const run = useSpec.run({ do: "fish" }, toolCtx(t, stop.signal));
      stop.abort(new Error("human_stop"));
      expect(await fakeRejection(run, 1000)).toBe("human_stop");
    });
  });

  test("a bite after the wait ended is ignored by the next fish call", async () => {
    await withFakeTimers(async () => {
      const t = await world();
      castThen(t, () => undefined);
      await fakeAwait(useSpec.run({ do: "fish" }, toolCtx(t)), HOOK_WAIT_MS);
      lootWindow(t, []);
      objectsEvent(t, { bobber: BOBBER, type: "fish_hooked" });
      expect(t.order).toEqual(["cast"]);
    });
  });

  test("the other verbs without an object are refused missing_object", async () => {
    const t = await world();
    for (const verb of ["use", "open", "read"] as const) {
      const out = await runRefusal({ do: verb }, toolCtx(t));
      expect(out.reason).toBe("missing_object");
    }
  });
});
