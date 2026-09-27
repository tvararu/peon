import { describe, expect, test } from "bun:test";
import type {
  NamedTrainerSpell,
  TrainerEvent,
  VendorEvent,
} from "@tuicraft/core";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import {
  contentOf,
  limitProblem,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import {
  createTestRuntime,
  type MockHandle,
} from "#test-support/runtime-fixture";

const ARENA = 0x40n;

function spell(
  spellId: number,
  name: string,
  state: NamedTrainerSpell["state"],
  requiredLevel: number,
): NamedTrainerSpell {
  return {
    cost: 100,
    firstRank: spellId,
    name,
    rank: "Rank 2",
    requiredLevel,
    requiredSkill: 0,
    requiredSkillValue: 0,
    requiredSpells: [],
    spellId,
    state,
    talentPointCost: 0,
    usable: 0,
  };
}

function coinage(handle: MockHandle, copper: number): void {
  const inventory = handle.getInventoryState();
  handle.getInventoryState = () => ({ ...inventory, coinage: copper });
}

function trainerEvent(handle: MockHandle, type: TrainerEvent["type"]): void {
  handle.triggerTrainerEvent({
    at: 0,
    state: {
      coinage: undefined,
      lastOutcome: undefined,
      level: 10,
      offer: undefined,
      pending: undefined,
    },
    type,
  });
}

function vendorEvent(handle: MockHandle, type: VendorEvent["type"]): void {
  handle.triggerVendorEvent({ at: 0, state: handle.getVendorState(), type });
}

async function arena(
  roles: ("trainer" | "class_trainer" | "repair" | "vendor")[],
  spells: NamedTrainerSpell[],
) {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [
    unitRow({
      distance: 3,
      guid: ARENA,
      name: "Matron Arena",
      relation: "friendly",
      roles,
      x: 3,
      y: 0,
    }),
  ]);
  coinage(t.handle, 1000);
  t.handle.talk = () =>
    t.handle.triggerQuestEvent({
      source: "packet",
      state: t.handle.getQuestState(),
      type: "window",
    });
  t.handle.openTrainer = () => trainerEvent(t.handle, "listed");
  t.handle.getTrainerState = async () => ({
    coinage: 1000,
    lastOutcome: undefined,
    level: 10,
    offer: { greeting: "", guid: ARENA, receivedAt: 0, spells, trainerType: 0 },
    pending: undefined,
  });
  return t;
}

describe("interact trainer", () => {
  test("train learns every affordable spell and reports the cost", async () => {
    const t = await arena(
      ["trainer", "class_trainer"],
      [
        spell(1244, "Power Word: Fortitude", "available", 10),
        spell(591, "Smite", "too_low", 12),
      ],
    );
    const trained: number[] = [];
    t.handle.trainSpell = (spellId) => {
      trained.push(spellId);
      coinage(t.handle, 900);
      trainerEvent(t.handle, "trained");
    };
    const res = await interactSpec.run(
      { do: "train", npc: "Matron Arena" },
      toolCtx<InteractAfter>(t),
    );
    expect(trained).toEqual([1244]);
    expect(res).toMatchObject({
      detail:
        "learned Power Word: Fortitude (Rank 2) for 1s (money 0g 10s 0c -> 0g 9s 0c).",
      status: "DONE",
    });
    expect(limitProblem(contentOf(res))).toBeUndefined();
  });

  test("nothing to learn names the next level", async () => {
    const t = await arena(["trainer"], [spell(591, "Smite", "too_low", 12)]);
    const res = await interactSpec.run(
      { do: "train", npc: "Matron Arena" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.detail).toBe(
      `nothing to learn from Matron Arena (${res.after.npc.ref}) now. Next new spells at level 12.`,
    );
  });

  test("talk on a trainer lists what it teaches now", async () => {
    const t = await arena(
      ["trainer"],
      [spell(1244, "Power Word: Fortitude", "available", 10)],
    );
    const res = await interactSpec.run(
      { npc: "Matron Arena" },
      toolCtx<InteractAfter>(t),
    );
    expect(res.body).toContain(
      "Teaches now: Power Word: Fortitude (Rank 2) 1s.",
    );
  });

  test("repair opens the vendor window and settles on the repair", async () => {
    const t = await arena(["vendor", "repair"], []);
    t.handle.openVendor = () => vendorEvent(t.handle, "listed");
    t.handle.repairAll = () => {
      coinage(t.handle, 955);
      vendorEvent(t.handle, "repaired");
    };
    const res = await interactSpec.run(
      { do: "repair", npc: "Matron Arena" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({ after: { repairCost: 45 }, status: "DONE" });
    expect(res.detail).toBe(
      "repaired all gear for 45 copper (money 0g 10s 0c -> 0g 9s 55c).",
    );
  });

  test("repair with nothing damaged reports it and succeeds", async () => {
    const t = await arena(["vendor", "repair"], []);
    t.handle.openVendor = () => vendorEvent(t.handle, "listed");
    t.handle.repairAll = () => {
      throw new Error("Nothing needs repair");
    };
    const res = await interactSpec.run(
      { do: "repair", npc: "Matron Arena" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({
      after: { repairCost: 0 },
      detail: "nothing to repair: all gear is at full durability.",
      status: "DONE",
    });
  });

  test("repair at an NPC without the repair role refuses", async () => {
    const t = await arena(["trainer"], []);
    await expect(
      interactSpec.run(
        { do: "repair", npc: "Matron Arena" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      reason: "not_repairer",
    });
  });
});
