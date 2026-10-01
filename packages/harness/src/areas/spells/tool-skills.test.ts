import { describe, expect, jest, test } from "bun:test";
import type { AreaEventOf, AreaState } from "@peon/core";
import {
  elapse,
  fakeAwait,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import { spellSpec } from "#harness/areas/spells/tool";
import { Refusal } from "#harness/ops/refusal";
import { toolCtx } from "#test-support/ops-fixtures";
import { type SpellWorld, spellWorld } from "#test-support/spell-tool-fixtures";

const MINING = 186;

type SpellsState = {
  skills: AreaState<"spells">["skills"];
  totems: AreaState<"spells">["totems"];
};

type SkillInit = {
  id: number;
  max: number;
  name: string;
  permBonus: number;
  step: number;
  tempBonus: number;
  value: number;
};

function skill(init: Partial<SkillInit> & { id: number; name: string }) {
  return {
    max: 75,
    permBonus: 0,
    step: 1,
    tempBonus: 0,
    value: 12,
    ...init,
  };
}

function standingTotem(
  slot: number,
): NonNullable<SpellsState["totems"][number]> {
  return {
    durationMs: 120_000,
    guid: 0x1n,
    slot,
    spellId: 8071,
    spellName: "Stoneskin Totem",
    startedAt: 0,
  };
}

function withSpells(t: SpellWorld, state: SpellsState): void {
  const base = t.handle.spells.state();
  jest
    .spyOn(t.handle.spells, "state")
    .mockImplementation(() => ({ ...base, ...state }));
}

async function refusal(promise: Promise<unknown>): Promise<Refusal> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof Refusal)) throw new Error("no refusal");
  return error;
}

describe("spell do:unlearn_profession", () => {
  test("without confirm it refuses and names the confirmed call", async () => {
    const t = await spellWorld();
    withSpells(t, {
      skills: [skill({ id: MINING, name: "Mining" })],
      totems: [],
    });
    const act = jest.spyOn(t.handle.spells.act, "unlearnSkill");
    const refused = await refusal(
      spellSpec.run({ do: "unlearn_profession", spell: "Mining" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("needs_confirm");
    expect(act).not.toHaveBeenCalled();
  });

  test("with confirm it calls unlearnSkill and is DONE when the skill leaves state", async () => {
    const t = await spellWorld();
    const state = {
      skills: [skill({ id: MINING, name: "Mining" })],
      totems: [],
    };
    withSpells(t, state);
    const act = jest
      .spyOn(t.handle.spells.act, "unlearnSkill")
      .mockImplementation(() => {
        state.skills = [];
        const event: AreaEventOf<"spells"> = {
          id: MINING,
          name: "Mining",
          type: "skill_removed",
        };
        t.handle.triggerAreaEvent("spells", event);
        return { ok: true };
      });
    const out = await spellSpec.run(
      { confirm: true, do: "unlearn_profession", spell: "Mining" },
      toolCtx(t),
    );
    expect(act).toHaveBeenCalledWith(MINING);
    expect(out.status).toBe("DONE");
    expect(out.after).toMatchObject({ do: "unlearn_profession" });
  });

  test("a skill id resolves without the name table", async () => {
    const t = await spellWorld();
    const state = {
      skills: [skill({ id: MINING, name: "Mining" })],
      totems: [],
    };
    withSpells(t, state);
    const act = jest
      .spyOn(t.handle.spells.act, "unlearnSkill")
      .mockImplementation(() => {
        state.skills = [];
        const event: AreaEventOf<"spells"> = {
          id: MINING,
          name: "Mining",
          type: "skill_removed",
        };
        t.handle.triggerAreaEvent("spells", event);
        return { ok: true };
      });
    const out = await spellSpec.run(
      { confirm: true, do: "unlearn_profession", spell: "186" },
      toolCtx(t),
    );
    expect(act).toHaveBeenCalledWith(MINING);
    expect(out.status).toBe("DONE");
  });

  test("a skill that stays is UNCONFIRMED after 3 s", async () => {
    await withFakeTimers(async () => {
      const t = await spellWorld();
      withSpells(t, {
        skills: [skill({ id: MINING, name: "Mining" })],
        totems: [],
      });
      jest
        .spyOn(t.handle.spells.act, "unlearnSkill")
        .mockImplementation(() => ({ ok: true }));
      const started = performance.now();
      const run = spellSpec.run(
        { confirm: true, do: "unlearn_profession", spell: "Mining" },
        toolCtx(t),
      );
      const out = await fakeAwait(run, 5000);
      expect(out.status).toBe("UNCONFIRMED");
      expect(performance.now() - started).toBeGreaterThanOrEqual(3000);
      expect(performance.now() - started).toBeLessThan(3500);
    });
  });

  test("a non-profession the state lacks is REFUSED not_profession", async () => {
    const t = await spellWorld();
    withSpells(t, { skills: [], totems: [] });
    const act = jest.spyOn(t.handle.spells.act, "unlearnSkill");
    const refused = await refusal(
      spellSpec.run(
        { confirm: true, do: "unlearn_profession", spell: "Cooking" },
        toolCtx(t),
      ),
    );
    expect(refused.reason).toBe("not_profession");
    expect(act).not.toHaveBeenCalled();
  });

  test("an act refusal becomes REFUSED with the same reason", async () => {
    const t = await spellWorld();
    withSpells(t, {
      skills: [skill({ id: MINING, name: "Mining" })],
      totems: [],
    });
    for (const reason of ["not_profession", "not_known"]) {
      jest
        .spyOn(t.handle.spells.act, "unlearnSkill")
        .mockReturnValue({ ok: false, reason });
      const refused = await refusal(
        spellSpec.run(
          { confirm: true, do: "unlearn_profession", spell: "Mining" },
          toolCtx(t),
        ),
      );
      expect(refused.reason).toBe(reason);
      jest.restoreAllMocks();
      withSpells(t, {
        skills: [skill({ id: MINING, name: "Mining" })],
        totems: [],
      });
    }
  });
});

describe("spell do:destroy_totem", () => {
  test("destroying the earth totem calls destroyTotem with slot 1 and is DONE when the slot clears", async () => {
    const t = await spellWorld();
    const state: SpellsState = {
      skills: [],
      totems: [undefined, standingTotem(1), undefined, undefined],
    };
    withSpells(t, state);
    const act = jest
      .spyOn(t.handle.spells.act, "destroyTotem")
      .mockImplementation(() => {
        state.totems = [undefined, undefined, undefined, undefined];
        const event: AreaEventOf<"spells"> = {
          guid: 0x1n,
          reason: "destroyed",
          slot: 1,
          spellId: 8071,
          spellName: "Stoneskin Totem",
          type: "totem_gone",
        };
        t.handle.triggerAreaEvent("spells", event);
        return { ok: true };
      });
    const out = await spellSpec.run(
      { do: "destroy_totem", element: "earth" },
      toolCtx(t),
    );
    expect(act).toHaveBeenCalledWith(1);
    expect(out.status).toBe("DONE");
    expect(out.after).toMatchObject({ do: "destroy_totem" });
  });

  test("an empty slot is REFUSED no_totem through the act", async () => {
    const t = await spellWorld();
    withSpells(t, { skills: [], totems: [] });
    const refused = await refusal(
      spellSpec.run({ do: "destroy_totem", element: "fire" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("no_totem");
  });

  test("an unknown element is REFUSED unknown_element", async () => {
    const t = await spellWorld();
    withSpells(t, { skills: [], totems: [] });
    const act = jest.spyOn(t.handle.spells.act, "destroyTotem");
    const refused = await refusal(
      spellSpec.run({ do: "destroy_totem", element: "storm" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("unknown_element");
    expect(act).not.toHaveBeenCalled();
  });

  test("a totem that stays is UNCONFIRMED after 3 s", async () => {
    await withFakeTimers(async () => {
      const t = await spellWorld();
      withSpells(t, {
        skills: [],
        totems: [standingTotem(0), undefined, undefined, undefined],
      });
      jest
        .spyOn(t.handle.spells.act, "destroyTotem")
        .mockImplementation(() => ({ ok: true }));
      const started = performance.now();
      const run = spellSpec.run(
        { do: "destroy_totem", element: "fire" },
        toolCtx(t),
      );
      await elapse(500);
      const out = await fakeAwait(run, 5000);
      expect(out.status).toBe("UNCONFIRMED");
      expect(performance.now() - started).toBeGreaterThanOrEqual(3000);
    });
  });
});
