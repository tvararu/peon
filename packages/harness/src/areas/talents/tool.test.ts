import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { ObjectType, type UnitEntity } from "@peon/core";
import {
  talentParams,
  talentsSpec,
  talentsTool,
  wantsOf,
} from "#harness/areas/talents/tool";
import type {
  TalentsCatalog,
  TalentsSnapshot,
} from "#harness/areas/talents/tool-types";
import { toolCtx } from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { expectSendKind } from "#test-support/tool-harness";

const CATALOG: TalentsCatalog = {
  glyph: (id) => (id === 21 ? { spellId: 58_366, typeFlags: 0 } : undefined),
  slotType: (typeId) => {
    if (typeId === 21) return { typeFlags: 0 };
    if (typeId === 23) return { typeFlags: 1 };
  },
  tab: (id) => (id === 161 ? { id, name: "Arms" } : undefined),
  talent: (id) => {
    if (id === 124)
      return { ranks: [12_282, 12_663, 12_664], row: 0, tab: 161 };
    if (id === 1302) return { ranks: [12_297], row: 2, tab: 161 };
  },
  talentsForClass: (classId) =>
    classId === 1 ? [{ id: 124 }, { id: 1302 }] : [],
};

const SPELLS: Record<number, string> = {
  12282: "Improved Heroic Strike",
  12297: "Deflection",
  12663: "Improved Heroic Strike",
  12664: "Improved Heroic Strike",
  58366: "Glyph of Mocking Blow",
  122970: "Glyph of Charge",
};

type Init = {
  catalog?: TalentsCatalog | undefined;
  state?: TalentsSnapshot;
  names?: Record<number, string>;
};

function snapshot(over: Partial<TalentsSnapshot> = {}): TalentsSnapshot {
  const base = {
    fields: {
      enabledMask: 0b11,
      freePoints: 2,
      glyphs: [0, 0, 0, 0, 0, 0],
      slotTypes: [21, 23, undefined, undefined, undefined, undefined],
    },
    pendingOffer: undefined,
    pet: undefined,
    player: {
      activeSpec: 0,
      freePoints: 2,
      kind: "player",
      specCount: 1,
      specs: [
        { glyphs: [0, 0, 0, 0, 0, 0], talents: [{ rank: 0, talentId: 124 }] },
      ],
    },
    slots: [
      { glyphId: 0, index: 0, typeId: 21, unlocked: true },
      { glyphId: 21, index: 1, typeId: 23, unlocked: true },
      { glyphId: undefined, index: 2, typeId: undefined, unlocked: false },
      { glyphId: undefined, index: 3, typeId: undefined, unlocked: false },
      { glyphId: undefined, index: 4, typeId: undefined, unlocked: false },
      { glyphId: undefined, index: 5, typeId: undefined, unlocked: false },
    ],
  } as unknown as TalentsSnapshot;
  return { ...base, ...over };
}

function me(): UnitEntity {
  return {
    class_: 1,
    createComplete: true,
    displayId: 0,
    entry: 1,
    factionTemplate: 0,
    gender: 0,
    guid: 42n,
    health: 100,
    level: 12,
    maxHealth: 100,
    maxPower: [],
    name: "War",
    npcFlags: 0,
    objectType: ObjectType.PLAYER,
    position: undefined,
    power: [],
    race: 1,
    rawFields: new Map(),
    scale: 1,
    target: 0n,
    unitFlags: 0,
  };
}

async function rig(init: Init = {}) {
  const t = await createTestRuntime();
  const state = init.state ?? snapshot();
  const catalog = "catalog" in init ? init.catalog : CATALOG;
  const names = { ...SPELLS, ...(init.names ?? {}) };
  const learn = jest.fn(
    async (plan: readonly { talentId: number; rank: number }[]) => ({
      catalog: catalog !== undefined,
      entries: plan.map((entry) => ({
        ...entry,
        outcome: "learned",
      })),
    }),
  );
  Object.assign(t.handle.talents.act, {
    catalog: async () => catalog,
    learnTalents: learn,
  });
  Object.assign(t.handle.talents, { state: () => state });
  Object.assign(t.handle, {
    getControlState: jest.fn(() => ({ selfGuid: 42n })),
    getEntity: jest.fn(() => me()),
    spellDefinition: jest.fn((id: number) =>
      names[id] === undefined ? undefined : { id, name: names[id] },
    ),
  });
  return { learn, t };
}

function callOf() {
  return {
    arguments: talentsSpec.minimalArgs,
    id: "c1",
    name: "probe",
    type: "toolCall",
  } as const;
}

describe("talents tool spec", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: talentParams },
        callOf(),
      ),
    ).toEqual(talentsSpec.minimalArgs);
  });

  test("wantsOf reads talent with rank and plan ranks", () => {
    expect(wantsOf({ do: "learn", rank: 2, talent: "124" })).toEqual([
      { rank: 2, talent: "124" },
    ]);
    expect(wantsOf({ do: "learn", plan: [{ rank: 1, talent: "a" }] })).toEqual([
      { rank: 1, talent: "a" },
    ]);
    expect(wantsOf({ do: "learn" })).toEqual([]);
  });

  test("expectSendKind passes for show", async () => {
    await expectSendKind(talentsTool, { do: "show" });
  });
});

describe("talents show", () => {
  test("show lists free points, specs, talents and glyph slots and sends nothing", async () => {
    const { t } = await rig();
    const out = await talentsSpec.run({ do: "show" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("2 talent points free");
    expect(out.detail).toContain("spec 1 of 1");
    expect(out.detail).toContain("1 talents learned");
    expect(out.body.join("\n")).toContain(
      "Improved Heroic Strike rank 1 1/3 (Arms)",
    );
    expect(out.body.join("\n")).toContain("slot 1 (major, open): empty");
    expect(out.body.join("\n")).toContain(
      "slot 2 (minor, open): Glyph of Mocking Blow",
    );
    expect(t.handle.sent).toHaveLength(0);
  });

  test("show in degraded mode prints ids and the names hint", async () => {
    const { t } = await rig({ catalog: undefined });
    const out = await talentsSpec.run({ do: "show" }, toolCtx(t));
    expect(out.body.join("\n")).toContain("talent 124 rank 1");
    expect(out.body.join("\n")).toContain(
      "Talent names need talent data; use ids.",
    );
  });
});

describe("talents learn", () => {
  test("learn resolves the name, converts 1-based rank and prints the tab", async () => {
    const { learn, t } = await rig();
    const out = await talentsSpec.run(
      { do: "learn", plan: [{ rank: 2, talent: "Improved Heroic Strike" }] },
      toolCtx(t),
    );
    expect(learn).toHaveBeenCalledWith([{ rank: 1, talentId: 124 }]);
    expect(out.status).toBe("DONE");
    expect(out.body.join("\n")).toContain(
      "Learned Improved Heroic Strike 2/3 (Arms). 2 points left.",
    );
  });

  test("learn accepts a digits-string id and a number id in both modes", async () => {
    const { learn, t } = await rig({ catalog: undefined });
    const out = await talentsSpec.run(
      { do: "learn", plan: [{ rank: 2, talent: "124" }] },
      toolCtx(t),
    );
    expect(learn).toHaveBeenCalledWith([{ rank: 1, talentId: 124 }]);
    expect(out.status).toBe("DONE");
  });

  test("learn refuses a name in degraded mode with names_need_talent_data", async () => {
    const { t } = await rig({ catalog: undefined });
    await expect(
      talentsSpec.run(
        { do: "learn", plan: [{ rank: 2, talent: "Improved Heroic Strike" }] },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "names_need_talent_data" });
  });

  test("learn refuses a name two talents share with ambiguous_name", async () => {
    const shared: TalentsCatalog = {
      ...CATALOG,
      talent: (id) =>
        id === 124 || id === 1302
          ? { ranks: [12_282], row: 0, tab: 161 }
          : undefined,
      talentsForClass: () => [{ id: 124 }, { id: 1302 }],
    };
    const { t } = await rig({ catalog: shared });
    await expect(
      talentsSpec.run(
        { do: "learn", plan: [{ rank: 1, talent: "Improved Heroic Strike" }] },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "ambiguous_name" });
  });

  test("learn reports a tier lock with the tab point count", async () => {
    const { learn, t } = await rig();
    learn.mockImplementation(async () => ({
      catalog: true,
      entries: [{ outcome: "tier_locked", rank: 0, talentId: 1302 }],
    }));
    const out = await talentsSpec.run(
      { do: "learn", plan: [{ rank: 1, talent: "Deflection" }] },
      toolCtx(t),
    );
    expect(out.status).toBe("REFUSED");
    expect(out.reason).toBe("tier_locked");
    expect(out.body.join("\n")).toContain(
      "Deflection not learned: a higher row in the same tab is locked. (Arms has 1 of 10 points)",
    );
  });
});
