import { describe, expect, jest, test } from "bun:test";
import type { SpellDefinition } from "@peon/core";
import { fakeAwait, withFakeTimers } from "@peon/core/test-support/fake-time";
import { petSpec } from "#harness/areas/pets/tool";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  barState,
  type PetsSnapshot,
  refusal,
  unit,
  world,
} from "#test-support/pets-command-fixture";
import { definition } from "#test-support/spell-tool-fixtures";

const RAVAGER = 31;
const DEMON_FAMILY = 15;
const CUNNING_TAB = 411;
const FEROCITY_TAB = 410;
const TALENTS: Record<number, { ranks: number[]; row: number; tab: number }> = {
  2107: { ranks: [61_700], row: 0, tab: FEROCITY_TAB },
  2118: { ranks: [61_682, 61_683], row: 0, tab: CUNNING_TAB },
  2119: { ranks: [61_690, 61_691], row: 0, tab: CUNNING_TAB },
  2165: { ranks: [61_720], row: 2, tab: CUNNING_TAB },
};
const NAMES: Record<number, string> = {
  61682: "Cobra Reflexes",
  61690: "Spider's Bite",
  61700: "Cobra Strikes",
  61720: "Wild Hunt",
};
function tabOf(id: number): { name: string; petMask: number } | undefined {
  if (id === CUNNING_TAB) return { name: "Cunning", petMask: 4 };
  if (id === FEROCITY_TAB) return { name: "Ferocity", petMask: 1 };
  return undefined;
}
const CATALOG = {
  glyph: () => undefined,
  slotType: () => undefined,
  tab: tabOf,
  talent: (id: number) => TALENTS[id],
  talentsForClass: () => [],
};

type PetTalents = {
  freePoints: number;
  talents: { talentId: number; rank: number }[];
};

async function rig(
  init: {
    family?: number;
    info?: PetTalents | undefined;
    catalog?: typeof CATALOG | undefined;
    pets?: PetsSnapshot;
  } = {},
) {
  const base = barState();
  const bar = base.bar && { ...base.bar, family: init.family ?? RAVAGER };
  const t = await world({
    petEntity: unit(),
    pets: init.pets ?? { ...base, bar },
  });
  const known: Record<number, SpellDefinition> = {};
  const catalog = "catalog" in init ? init.catalog : CATALOG;
  Object.assign(t.game.talents.act, { catalog: async () => catalog });
  const saved = "info" in init ? init.info : { freePoints: 2, talents: [] };
  Object.assign(t.game.talents, {
    state: () => ({ pet: saved && { kind: "pet", ...saved } }),
  });
  for (const [raw, name] of Object.entries(NAMES)) {
    const id = Number(raw);
    known[id] = definition({ id, name });
  }
  const lookup = t.game.spellDefinition;
  Object.assign(t.game, {
    spellDefinition: jest.fn((id: number) => known[id] ?? lookup(id)),
  });
  const reply = (talents: PetTalents["talents"], freePoints: number) =>
    t.game.triggerAreaEvent("talents", {
      freePoints,
      talents,
      type: "pet_info",
    } as never);
  return { reply, t };
}

describe("pet talent", () => {
  test("a name in the pet's tree learns the first rank and is DONE on the pet_info that holds it", async () => {
    const { reply, t } = await rig();
    const learn = jest
      .spyOn(t.game.pets.act, "learnPetTalent")
      .mockImplementation(() => {
        reply([{ rank: 0, talentId: 2118 }], 1);
        return { ok: true };
      });
    const out = await petSpec.run(
      { do: "talent", what: "cobra reflexes" },
      toolCtx(t),
    );
    expect(learn).toHaveBeenCalledWith(2118, 0);
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Cobra Reflexes");
    expect(out.detail).toContain("1/2");
    expect(out.detail).toContain("1 point");
  });

  test("a held rank sends the next rank, 0-based on the wire", async () => {
    const { reply, t } = await rig({
      info: { freePoints: 1, talents: [{ rank: 0, talentId: 2119 }] },
    });
    const learn = jest
      .spyOn(t.game.pets.act, "learnPetTalent")
      .mockImplementation(() => {
        reply([{ rank: 1, talentId: 2119 }], 0);
        return { ok: true };
      });
    const out = await petSpec.run({ do: "talent", what: "2119" }, toolCtx(t));
    expect(learn).toHaveBeenCalledWith(2119, 1);
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("2/2");
  });

  test("a talent already at its top rank is refused and sends nothing", async () => {
    const { t } = await rig({
      info: { freePoints: 3, talents: [{ rank: 0, talentId: 2165 }] },
    });
    const learn = jest.spyOn(t.game.pets.act, "learnPetTalent");
    const out = await refusal(
      petSpec.run({ do: "talent", what: "Wild Hunt" }, toolCtx(t)),
    );
    expect(out.reason).toBe("max_rank");
    expect(learn).not.toHaveBeenCalled();
  });

  test("no free point is FAILED and nothing is sent", async () => {
    const { t } = await rig({ info: { freePoints: 0, talents: [] } });
    const learn = jest.spyOn(t.game.pets.act, "learnPetTalent");
    const out = await petSpec.run({ do: "talent", what: "2118" }, toolCtx(t));
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("no_points");
    expect(learn).not.toHaveBeenCalled();
  });

  test("a reply that does not hold the rank is FAILED, not DONE", async () => {
    const { reply, t } = await rig();
    jest.spyOn(t.game.pets.act, "learnPetTalent").mockImplementation(() => {
      reply([], 2);
      return { ok: true };
    });
    const out = await petSpec.run({ do: "talent", what: "2118" }, toolCtx(t));
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("refused_by_server");
  });

  test("a talent of another family's tree is refused and sends nothing", async () => {
    const { t } = await rig();
    const learn = jest.spyOn(t.game.pets.act, "learnPetTalent");
    const out = await refusal(
      petSpec.run({ do: "talent", what: "Cobra Strikes" }, toolCtx(t)),
    );
    expect(out.reason).toBe("unknown_talent");
    expect(learn).not.toHaveBeenCalled();
    const byId = await refusal(
      petSpec.run({ do: "talent", what: "2107" }, toolCtx(t)),
    );
    expect(byId.reason).toBe("wrong_tree");
    expect(learn).not.toHaveBeenCalled();
  });

  test("a pet with no talent tree and a missing pet are refused", async () => {
    const demon = await rig({ family: DEMON_FAMILY });
    const noTree = await refusal(
      petSpec.run({ do: "talent" }, toolCtx(demon.t)),
    );
    expect(noTree.reason).toBe("no_tree");
    const none = await rig({
      pets: {
        bar: undefined,
        cooldowns: [],
        lastRefusal: undefined,
        pet: undefined,
      },
    });
    const gone = await refusal(
      petSpec.run({ do: "talent", what: "2118" }, toolCtx(none.t)),
    );
    expect(gone.reason).toBe("no_pet");
  });

  test("a name needs talent data, an id does not", async () => {
    const { t } = await rig({ catalog: undefined });
    const learn = jest
      .spyOn(t.game.pets.act, "learnPetTalent")
      .mockImplementation(() => ({ ok: true }));
    const named = await refusal(
      petSpec.run({ do: "talent", what: "Cobra Reflexes" }, toolCtx(t)),
    );
    expect(named.reason).toBe("names_need_talent_data");
    expect(learn).not.toHaveBeenCalled();
  });

  test("an act refusal reaches the caller", async () => {
    const { t } = await rig();
    jest
      .spyOn(t.game.pets.act, "learnPetTalent")
      .mockImplementation(() => ({ ok: false, reason: "no_pet" }));
    const out = await refusal(
      petSpec.run({ do: "talent", what: "2118" }, toolCtx(t)),
    );
    expect(out.reason).toBe("no_pet");
  });

  test("no reply is UNCONFIRMED after five seconds", async () => {
    await withFakeTimers(async () => {
      const { t } = await rig();
      jest
        .spyOn(t.game.pets.act, "learnPetTalent")
        .mockImplementation(() => ({ ok: true }));
      const out = await fakeAwait(
        petSpec.run({ do: "talent", what: "2118" }, toolCtx(t)),
        10_000,
      );
      expect(out.status).toBe("UNCONFIRMED");
      expect(out.reason).toBe("no_reply");
    });
  });

  test("an abort while queued behind the mutex sends nothing", async () => {
    const { t } = await rig();
    const learn = jest
      .spyOn(t.game.pets.act, "learnPetTalent")
      .mockImplementation(() => ({ ok: true }));
    const gate = Promise.withResolvers<void>();
    const held = t.rt.mutex.run(() => gate.promise);
    const controller = new AbortController();
    const run = petSpec.run(
      { do: "talent", what: "2118" },
      toolCtx(t, controller.signal),
    );
    await Promise.resolve();
    controller.abort(new Error("run stopped"));
    gate.resolve();
    await held;
    await expect(run).rejects.toThrow("run stopped");
    expect(learn).not.toHaveBeenCalled();
  });

  test("without a what it lists free points and the pet's tree, never another tree", async () => {
    const { t } = await rig({
      info: { freePoints: 2, talents: [{ rank: 0, talentId: 2118 }] },
    });
    const learn = jest.spyOn(t.game.pets.act, "learnPetTalent");
    const out = await petSpec.run({ do: "talent" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("2 ");
    expect(out.detail).toContain("Cunning");
    const body = out.body.join("\n");
    expect(body).toContain("Cobra Reflexes (2118) 1/2");
    expect(body).toContain("Spider's Bite (2119) 0/2");
    expect(body).not.toContain("Cobra Strikes");
    expect(learn).not.toHaveBeenCalled();
  });

  test("the list says the points are unknown before the server reports them", async () => {
    const { t } = await rig({ info: undefined });
    const out = await petSpec.run({ do: "talent" }, toolCtx(t));
    expect(out.detail).toContain("unknown");
    expect(out.status).toBe("DONE");
  });
});
