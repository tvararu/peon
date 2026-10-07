import { describe, expect, jest, test } from "bun:test";
import type { SpellDefinition } from "@peon/core";
import type { TravelAfter } from "#harness/contract/details";
import { createRefTable } from "#harness/ops/refs";
import { Refusal } from "#harness/ops/refusal";
import { travelSpec } from "#harness/tools/travel";
import { MOUNT_HINT_YD } from "#harness/tools/travel-mount";
import {
  driveGoto,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type TestRuntime,
} from "#test-support/runtime-fixture";
import {
  definition,
  installSpells,
  type SpellInit,
} from "#test-support/spell-tool-fixtures";

const MOUNTED_AURA = 78;
const FLIGHT_AURA = 207;
const OUTDOORS = 0x80_00;
const HORSE = definition({
  aura: MOUNTED_AURA,
  id: 458,
  name: "Brown Horse",
  raw: OUTDOORS,
});
const FIREBALL = definition({ id: 133, name: "Fireball" });

function flying(init: SpellInit) {
  const base = definition(init);
  const [first] = base.effects;
  if (!first) throw new Error("fixture has no effect");
  return {
    ...base,
    effects: [first, { ...first, applyAura: FLIGHT_AURA, effect: 6 }],
  };
}

const GRYPHON = flying({
  aura: MOUNTED_AURA,
  id: 461,
  name: "Gryphon",
  raw: OUTDOORS,
});

type Init = {
  book?: SpellDefinition[];
  distance?: number;
  learned?: number[];
  mapId?: number;
  mounted?: boolean;
  spellbookFailure?: string;
};

async function world(init: Init = {}): Promise<TestRuntime> {
  const t = await createTestRuntime({ parts: { refs: createRefTable() } });
  const distance = init.distance ?? MOUNT_HINT_YD + 50;
  installSpells(t.handle, {
    book: init.book ?? [HORSE, FIREBALL],
    ...(init.learned === undefined ? {} : { learned: init.learned }),
  });
  if (init.spellbookFailure !== undefined) {
    const failure = init.spellbookFailure;
    t.handle.getSpellbook = () => Promise.reject(new Error(failure));
  }
  setSelf(t.handle, { x: 0, y: 0 });
  setUnits(t.handle, [
    unitRow({
      distance,
      guid: 0x10n,
      name: "Far Innkeeper",
      relation: "friendly",
      x: distance,
      y: 0,
    }),
  ]);
  if (init.mapId !== undefined) {
    const control = t.handle.getControlState();
    const pose = control.pose;
    if (!pose) throw new Error("no pose");
    const poseAt = { ...pose, mapId: init.mapId };
    t.handle.getControlState = () => ({
      ...control,
      pose: poseAt,
      serverPose: poseAt,
    });
  }
  jest.spyOn(t.handle.selfstate, "state").mockReturnValue({
    ...t.handle.selfstate.state(),
    mounted: init.mounted ?? false,
  });
  driveGoto(t.handle, [{ arrive: { x: distance - 1, y: 0 } }]);
  return t;
}

async function travelText(t: TestRuntime, to: string) {
  const res = await travelSpec.run({ to }, toolCtx<TravelAfter>(t));
  return (res.body ?? []).join("\n") + (res.detail ?? "");
}

async function offer(t: TestRuntime, to: string, onFoot = false) {
  const refused = await travelSpec
    .run({ on_foot: onFoot, to }, toolCtx<TravelAfter>(t))
    .then(() => undefined)
    .catch((error: unknown) => error);
  return refused instanceof Refusal ? refused : undefined;
}

describe("travel mount offer", () => {
  test("a long outdoor unit walk is refused with the mount call", async () => {
    const t = await world();
    const refusal = await offer(t, "Far Innkeeper");
    expect(refusal?.reason).toBe("mount_available");
    expect(refusal?.next).toBe('spell(do: "mount", spell: "Brown Horse")');
  });

  test("a long outdoor point walk is refused with the mount call", async () => {
    const t = await world();
    const refusal = await offer(t, `${MOUNT_HINT_YD + 50} yd north`);
    expect(refusal?.next).toContain('spell(do: "mount"');
  });

  test("on_foot walks the long route instead of refusing", async () => {
    const t = await world();
    expect(await offer(t, "Far Innkeeper", true)).toBeUndefined();
    expect(await offer(t, "Far Innkeeper")).toBeDefined();
  });

  test("the refusal moves nothing and starts no run", async () => {
    const t = await world();
    const before = t.handle.getControlState().pose;
    await offer(t, "Far Innkeeper");
    expect(t.handle.getControlState().pose).toEqual(before);
    expect(t.rt.runs.active()).toBeUndefined();
  });

  test("a short walk, exactly the threshold, is not refused", async () => {
    const t = await world({ distance: MOUNT_HINT_YD });
    expect(await offer(t, "Far Innkeeper")).toBeUndefined();
    const far = await world({ distance: MOUNT_HINT_YD + 1 });
    expect(await offer(far, "Far Innkeeper")).toBeDefined();
  });

  test("a route on an instance map gets no hint", async () => {
    const t = await world({ mapId: 36 });
    expect(await offer(t, "Far Innkeeper")).toBeUndefined();
  });

  test("a route on each continent map gets the hint", async () => {
    for (const mapId of [0, 1, 530, 571]) {
      const t = await world({ mapId });
      expect(await offer(t, "Far Innkeeper")).toBeDefined();
    }
  });

  test("a failing spellbook lookup does not block the walk", async () => {
    const t = await world({ spellbookFailure: "missing Spell.dbc" });
    expect(await offer(t, "Far Innkeeper")).toBeUndefined();
    expect(await travelText(t, "Far Innkeeper")).not.toContain("mount");
  });

  test("a ghost is not refused", async () => {
    const t = await world();
    const recovery = { ...t.handle.getRecoveryState(), life: "ghost" as const };
    t.handle.getRecoveryState = () => recovery;
    expect(await offer(t, "Far Innkeeper")).toBeUndefined();
  });

  test("a mounted character is not refused", async () => {
    const t = await world({ mounted: true });
    expect(await offer(t, "Far Innkeeper")).toBeUndefined();
  });

  test("no mount spell, an unlearned one, or only a flying one is not refused", async () => {
    for (const init of [
      { book: [FIREBALL] },
      { book: [HORSE, FIREBALL], learned: [133] },
      { book: [GRYPHON, FIREBALL] },
    ]) {
      const t = await world(init);
      expect(await offer(t, "Far Innkeeper")).toBeUndefined();
    }
  });
});
