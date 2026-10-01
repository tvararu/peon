import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import {
  talentParams,
  talentsRun,
  talentsSpec,
} from "#harness/areas/talents/tool";
import type {
  TalentsCatalog,
  TalentsSnapshot,
} from "#harness/areas/talents/tool-types";
import { Refusal } from "#harness/ops/refusal";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const CATALOG: TalentsCatalog = {
  glyph: () => undefined,
  slotType: (typeId) => {
    if (typeId === 21) return { typeFlags: 0 };
    if (typeId === 23) return { typeFlags: 1 };
  },
  tab: () => undefined,
  talent: () => undefined,
  talentsForClass: () => [],
};

type Held = {
  bag: number;
  slot: number;
  region: string;
  entry: number;
  name: string;
};

const GLYPH: Held = {
  bag: 255,
  entry: 43_395,
  name: "Glyph of Battle",
  region: "backpack",
  slot: 24,
};

function snapshot(glyphs: [number, number] = [0, 0]): TalentsSnapshot {
  return {
    fields: {
      enabledMask: 0b11,
      freePoints: 0,
      glyphs: [...glyphs, 0, 0, 0, 0],
      slotTypes: [21, 23, undefined, undefined, undefined, undefined],
    },
    pendingOffer: undefined,
    pet: undefined,
    player: undefined,
    slots: [
      { glyphId: glyphs[0], index: 0, typeId: 21, unlocked: true },
      { glyphId: glyphs[1], index: 1, typeId: 23, unlocked: true },
      { glyphId: undefined, index: 2, typeId: undefined, unlocked: false },
      { glyphId: undefined, index: 3, typeId: undefined, unlocked: false },
      { glyphId: undefined, index: 4, typeId: undefined, unlocked: false },
      { glyphId: undefined, index: 5, typeId: undefined, unlocked: false },
    ],
  } as unknown as TalentsSnapshot;
}

type Init = {
  catalog?: TalentsCatalog | undefined;
  held?: Held[];
  state?: TalentsSnapshot;
  apply?: unknown;
  remove?: unknown;
};

async function rig(init: Init = {}) {
  const t = await createTestRuntime();
  const catalog = "catalog" in init ? init.catalog : CATALOG;
  const held = init.held ?? [GLYPH];
  const apply = jest.fn(
    async () => init.apply ?? { glyphId: 21, outcome: "applied" },
  );
  const remove = jest.fn(async () => init.remove ?? { outcome: "removed" });
  Object.assign(t.handle.talents.act, {
    applyGlyph: apply,
    catalog: async () => catalog,
    removeGlyph: remove,
  });
  Object.assign(t.handle.talents, { state: () => init.state ?? snapshot() });
  const inventory = t.handle.getInventoryState();
  t.handle.getInventoryState = () => ({
    ...inventory,
    slots: held.map((item, index) => ({
      bag: item.bag,
      guid: BigInt(index + 1),
      item: { entry: item.entry, name: item.name },
      region: item.region,
      slot: item.slot,
      status: "occupied",
    })) as never,
  });
  return { apply, remove, t };
}

describe("talents glyph", () => {
  test("glyph sends the 0-based slot and the bag position and names the kind", async () => {
    const { apply, t } = await rig();
    const out = await talentsSpec.run(
      { do: "glyph", item: "Glyph of Battle", slot: 2 },
      toolCtx(t),
    );
    expect(apply).toHaveBeenCalledWith({ bag: 255, glyphSlot: 1, slot: 24 });
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Glyph of Battle");
    expect(out.detail).toContain("minor slot 2");
  });

  test("glyph accepts a kind word and picks the open slot of that kind", async () => {
    const { apply, t } = await rig();
    await talentsSpec.run(
      { do: "glyph", item: "item 43395", slot: "major" },
      toolCtx(t),
    );
    expect(apply).toHaveBeenCalledWith({ bag: 255, glyphSlot: 0, slot: 24 });
  });

  test("a kind word prefers an empty slot over a filled one of the same kind", async () => {
    const slots = snapshot([5, 0]).slots.map((slot) => ({ ...slot }));
    const third = slots[2];
    if (third) {
      third.glyphId = 0;
      third.typeId = 21;
      third.unlocked = true;
    }
    const { apply, t } = await rig({ state: { ...snapshot([5, 0]), slots } });
    await talentsSpec.run(
      { do: "glyph", item: "Glyph of Battle", slot: "major" },
      toolCtx(t),
    );
    expect(apply).toHaveBeenCalledWith({ bag: 255, glyphSlot: 2, slot: 24 });
  });

  test("a kind word without talent data is refused and sends nothing", async () => {
    const { apply, t } = await rig({ catalog: undefined });
    const run = talentsSpec.run(
      { do: "glyph", item: "Glyph of Battle", slot: "minor" },
      toolCtx(t),
    );
    await expect(run).rejects.toBeInstanceOf(Refusal);
    expect(apply).not.toHaveBeenCalled();
  });

  test("a slot outside 1-6 or a locked kind is refused before sending", async () => {
    const { apply, t } = await rig();
    for (const slot of [0, 7, "huge"]) {
      await expect(
        talentsSpec.run(
          { do: "glyph", item: "Glyph of Battle", slot } as never,
          toolCtx(t),
        ),
      ).rejects.toBeInstanceOf(Refusal);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  test("glyph needs an item and a slot", async () => {
    const { apply, t } = await rig();
    const reasons: string[] = [];
    for (const args of [
      { do: "glyph", slot: 1 },
      { do: "glyph", item: "Glyph of Battle" },
    ] as const) {
      try {
        await talentsRun(args, toolCtx(t));
        reasons.push("sent");
      } catch (error) {
        reasons.push((error as Refusal).reason);
      }
    }
    expect(reasons).toEqual(["missing_item", "missing_slot"]);
    expect(apply).not.toHaveBeenCalled();
  });

  test("an equipped bag in slots 19-22 is not a glyph source", async () => {
    const { apply, t } = await rig({
      held: [{ ...GLYPH, region: "bag", slot: 19 }],
    });
    await expect(
      talentsSpec.run(
        { do: "glyph", item: "Glyph of Battle", slot: 1 },
        toolCtx(t),
      ),
    ).rejects.toBeInstanceOf(Refusal);
    expect(apply).not.toHaveBeenCalled();
  });

  test("two glyphs with one name need a bag and slot", async () => {
    const twin: Held = { ...GLYPH, slot: 25 };
    const { apply, t } = await rig({ held: [GLYPH, twin] });
    await expect(
      talentsSpec.run(
        { do: "glyph", item: "Glyph of Battle", slot: 1 },
        toolCtx(t),
      ),
    ).rejects.toBeInstanceOf(Refusal);
    await talentsSpec.run(
      { do: "glyph", item: "bag 255 slot 25", slot: 1 },
      toolCtx(t),
    );
    expect(apply).toHaveBeenCalledWith({ bag: 255, glyphSlot: 0, slot: 25 });
  });

  test("a glyph in a bag item slot uses that bag's number", async () => {
    const { apply, t } = await rig({
      held: [{ ...GLYPH, bag: 19, region: "bag_item", slot: 3 }],
    });
    await talentsSpec.run(
      { do: "glyph", item: "Glyph of Battle", slot: 1 },
      toolCtx(t),
    );
    expect(apply).toHaveBeenCalledWith({ bag: 19, glyphSlot: 0, slot: 3 });
  });

  test("refusal outcomes give REFUSED with the reason and the item stays", async () => {
    for (const outcome of [
      "slot_locked",
      "not_a_glyph",
      "wrong_slot_type",
      "glyph_socket_locked",
      "unique_glyph",
      "busy",
    ]) {
      const { t } = await rig({ apply: { outcome } });
      const out = await talentsSpec.run(
        { do: "glyph", item: "Glyph of Battle", slot: 1 },
        toolCtx(t),
      );
      expect(out.status).toBe("REFUSED");
      expect(out.reason).toBe(outcome);
    }
  });

  test("invalid_glyph proposes the same call on the other open slot", async () => {
    const { t } = await rig({ apply: { outcome: "invalid_glyph" } });
    const out = await talentsSpec.run(
      { do: "glyph", item: "Glyph of Battle", slot: 1 },
      toolCtx(t),
    );
    expect(out.status).toBe("REFUSED");
    expect(out.reason).toBe("invalid_glyph");
    expect(out.next).toContain("slot: 2");
  });

  test("a failed cast carries the server reason", async () => {
    const { t } = await rig({ apply: { outcome: "failed", reason: "dead" } });
    const out = await talentsSpec.run(
      { do: "glyph", item: "Glyph of Battle", slot: 1 },
      toolCtx(t),
    );
    expect(out.status).toBe("REFUSED");
    expect(out.detail).toContain("dead");
  });

  test("no reply is UNCONFIRMED", async () => {
    const { t } = await rig({ apply: { outcome: "no_reply" } });
    const out = await talentsSpec.run(
      { do: "glyph", item: "Glyph of Battle", slot: 1 },
      toolCtx(t),
    );
    expect(out.status).toBe("UNCONFIRMED");
  });

  test("the act runs inside the world mutex", async () => {
    const { apply, t } = await rig();
    const order: string[] = [];
    apply.mockImplementation(async () => {
      order.push("apply");
      return { glyphId: 21, outcome: "applied" };
    });
    const blocker = t.rt.mutex.run(async () => {
      await Promise.resolve();
      order.push("blocker");
    });
    const run = talentsSpec.run(
      { do: "glyph", item: "Glyph of Battle", slot: 1 },
      toolCtx(t),
    );
    await Promise.all([blocker, run]);
    expect(order).toEqual(["blocker", "apply"]);
  });

  test("aborting while queued behind the mutex sends nothing", async () => {
    const { apply, t } = await rig();
    let release!: () => void;
    const busy = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const holder = t.rt.mutex.run(() => busy);
    await Promise.resolve();
    const stop = new AbortController();
    const pending = talentsSpec.run(
      { do: "glyph", item: "Glyph of Battle", slot: 1 },
      toolCtx(t, stop.signal),
    );
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    stop.abort();
    release();
    await holder;
    await expect(pending).rejects.toThrow();
    await t.rt.mutex.run(() => {});
    expect(apply).not.toHaveBeenCalled();
  });

  test("an act rejection reaches the caller", async () => {
    const { apply, t } = await rig();
    apply.mockRejectedValue(new Error("boom"));
    await expect(
      talentsSpec.run(
        { do: "glyph", item: "Glyph of Battle", slot: 1 },
        toolCtx(t),
      ),
    ).rejects.toThrow("boom");
  });
});

describe("talents unglyph", () => {
  test("unglyph sends the 0-based slot and says what came out", async () => {
    const { remove, t } = await rig({ state: snapshot([0, 21]) });
    const out = await talentsSpec.run({ do: "unglyph", slot: 2 }, toolCtx(t));
    expect(remove).toHaveBeenCalledWith(1);
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("minor slot 2");
    expect(out.detail).toContain("cleared");
  });

  test("an empty slot is REFUSED slot_empty", async () => {
    const { t } = await rig({ remove: { outcome: "slot_empty" } });
    const out = await talentsSpec.run({ do: "unglyph", slot: 1 }, toolCtx(t));
    expect(out.status).toBe("REFUSED");
    expect(out.reason).toBe("slot_empty");
  });

  test("no reply is UNCONFIRMED", async () => {
    const { t } = await rig({
      remove: { outcome: "no_reply" },
      state: snapshot([0, 21]),
    });
    const out = await talentsSpec.run({ do: "unglyph", slot: 2 }, toolCtx(t));
    expect(out.status).toBe("UNCONFIRMED");
  });

  test("unglyph needs a slot from 1 to 6", async () => {
    const { remove, t } = await rig();
    for (const slot of [undefined, 0, 7, "major"]) {
      await expect(
        talentsSpec.run({ do: "unglyph", slot } as never, toolCtx(t)),
      ).rejects.toBeInstanceOf(Refusal);
    }
    expect(remove).not.toHaveBeenCalled();
  });

  test("aborting while queued behind the mutex clears nothing", async () => {
    const { remove, t } = await rig({ state: snapshot([0, 21]) });
    let release!: () => void;
    const busy = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const holder = t.rt.mutex.run(() => busy);
    await Promise.resolve();
    const stop = new AbortController();
    const pending = talentsSpec.run(
      { do: "unglyph", slot: 2 },
      toolCtx(t, stop.signal),
    );
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    stop.abort();
    release();
    await holder;
    await expect(pending).rejects.toThrow();
    await t.rt.mutex.run(() => {});
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("talents glyph schema", () => {
  test("glyph arguments validate with a number or a word slot", () => {
    for (const slot of [2, "minor"]) {
      const args = { do: "glyph", item: "Glyph of Battle", slot };
      expect(
        validateToolArguments(
          { description: "probe", name: "probe", parameters: talentParams },
          { arguments: args, id: "c", name: "probe", type: "toolCall" },
        ),
      ).toEqual(args);
    }
  });
});
