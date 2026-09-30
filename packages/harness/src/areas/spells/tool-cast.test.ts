import { describe, expect, jest, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import {
  fakeAwait,
  fakeRejection,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import { spellSpec } from "#harness/areas/spells/tool";
import { Refusal } from "#harness/ops/refusal";
import { setUnits, toolCtx, unitRow } from "#test-support/ops-fixtures";
import {
  combatEvent,
  definition,
  FIREBALL,
  FROST_ARMOR,
  SELF,
  type SpellWorld,
  type SpellWorldInit,
  spellWorld,
} from "#test-support/spell-tool-fixtures";

const WOLF = 0xf1_30_00_3e_ea_00_0a_bcn;

async function world(over: SpellWorldInit = {}) {
  const t = await spellWorld(over);
  setUnits(t.handle, [
    unitRow({ distance: 10, guid: WOLF, name: "Wolf", x: 10, y: 0 }),
  ]);
  t.rt.refs.refOf(WOLF);
  return t;
}

type Reply = "cast_succeeded" | "cast_failed" | "cast_interrupted";

function answer(t: SpellWorld, type: Reply, why = "") {
  return jest.spyOn(t.handle, "cast").mockImplementation((spellId) => {
    t.handle.triggerCombatEvent(
      combatEvent(t.state(), type, spellId, why || undefined),
    );
  });
}

async function refusal(promise: Promise<unknown>): Promise<Refusal> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof Refusal)) throw new Error("no refusal");
  return error;
}

describe("spell do:cast", () => {
  test("no target casts on the character itself and is DONE on cast_succeeded", async () => {
    const t = await world();
    const cast = answer(t, "cast_succeeded");
    const out = await spellSpec.run(
      { do: "cast", spell: "Frost Armor" },
      toolCtx(t),
    );
    expect(cast).toHaveBeenCalledWith(FROST_ARMOR, SELF);
    expect(out.status).toBe("DONE");
    expect(out.after).toMatchObject({
      do: "cast",
      spell: { id: FROST_ARMOR, name: "Frost Armor" },
    });
  });

  test("a unit ref casts on that unit", async () => {
    const t = await world();
    const cast = answer(t, "cast_succeeded");
    const out = await spellSpec.run(
      { do: "cast", spell: "Fireball", target: "u1" },
      toolCtx(t),
    );
    expect(cast).toHaveBeenCalledWith(FIREBALL, WOLF);
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Wolf");
  });

  test("a spell id in text casts that spell", async () => {
    const t = await world();
    const cast = answer(t, "cast_succeeded");
    await spellSpec.run({ do: "cast", spell: "133" }, toolCtx(t));
    expect(cast).toHaveBeenCalledWith(FIREBALL, SELF);
  });

  test("an unknown spell name or id is REFUSED unknown_spell and sends nothing", async () => {
    const t = await world();
    const cast = answer(t, "cast_succeeded");
    for (const spell of ["Pyroblast", "9999"]) {
      const refused = await refusal(
        spellSpec.run({ do: "cast", spell }, toolCtx(t)),
      );
      expect(refused.reason).toBe("unknown_spell");
    }
    expect(cast).not.toHaveBeenCalled();
  });

  test("casting the hearthstone points at travel to hearth", async () => {
    const t = await world();
    const cast = answer(t, "cast_succeeded");
    for (const spell of ["Hearthstone", "hearth", "8690"]) {
      const refused = await refusal(
        spellSpec.run({ do: "cast", spell }, toolCtx(t)),
      );
      expect(refused.next).toContain("travel");
      expect(refused.next).toContain("hearth");
    }
    expect(cast).not.toHaveBeenCalled();
  });

  test("a missing spell is REFUSED missing_spell", async () => {
    const t = await world();
    const refused = await refusal(spellSpec.run({ do: "cast" }, toolCtx(t)));
    expect(refused.reason).toBe("missing_spell");
  });

  test("an unseen target is REFUSED not_seen and sends nothing", async () => {
    const t = await world();
    const cast = answer(t, "cast_succeeded");
    const refused = await refusal(
      spellSpec.run(
        { do: "cast", spell: "Fireball", target: "u9" },
        toolCtx(t),
      ),
    );
    expect(refused.reason).toBe("not_seen");
    expect(cast).not.toHaveBeenCalled();
  });

  test("an object ref is not a unit target", async () => {
    const t = await world();
    answer(t, "cast_succeeded");
    const refused = await refusal(
      spellSpec.run(
        { do: "cast", spell: "Fireball", target: "o1" },
        toolCtx(t),
      ),
    );
    expect(refused.reason).toBe("not_seen");
  });

  test("a hidden lower rank is not picked and the highest visible rank wins", async () => {
    const rank1 = definition({ id: 133, name: "Fireball", rank: "Rank 1" });
    const rank2 = definition({ id: 143, name: "Fireball", rank: "Rank 2" });
    const rank3 = definition({ id: 145, name: "Fireball", rank: "Rank 3" });
    const t = await world({ book: [rank1, rank2, rank3], inactive: [145] });
    const cast = answer(t, "cast_succeeded");
    await spellSpec.run({ do: "cast", spell: "fireball" }, toolCtx(t));
    expect(cast).toHaveBeenCalledWith(143, SELF);
  });

  test("cast_failed is FAILED with the core reason", async () => {
    const t = await world();
    answer(t, "cast_failed", "not_enough_mana");
    const out = await spellSpec.run(
      { do: "cast", spell: "Fireball", target: "u1" },
      toolCtx(t),
    );
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("not_enough_mana");
  });

  test("an interrupted cast is FAILED with the core reason", async () => {
    const t = await world();
    answer(t, "cast_interrupted", "interrupted");
    const out = await spellSpec.run(
      { do: "cast", spell: "Fireball", target: "u1" },
      toolCtx(t),
    );
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("interrupted");
  });

  test("a core throw such as channelling is FAILED with its code", async () => {
    const t = await world();
    jest.spyOn(t.handle, "cast").mockImplementation(() => {
      throw new Error("channelling");
    });
    const out = await spellSpec.run(
      { do: "cast", spell: "Frost Armor" },
      toolCtx(t),
    );
    expect(out.status).toBe("FAILED");
    expect(out.reason).toBe("channelling");
  });

  test("the reply of another spell does not settle the cast", async () => {
    await withFakeTimers(async () => {
      const t = await world();
      jest.spyOn(t.handle, "cast").mockImplementation(() => {
        t.handle.triggerCombatEvent(
          combatEvent(t.state(), "cast_succeeded", FROST_ARMOR),
        );
      });
      const run = spellSpec.run(
        { do: "cast", spell: "Fireball", target: "u1" },
        toolCtx(t),
      );
      const out = await fakeAwait(run, 10_000);
      expect(out.status).toBe("UNCONFIRMED");
    });
  });

  test("a channel start settles the cast as DONE", async () => {
    const t = await world();
    jest.spyOn(t.handle, "cast").mockImplementation((spellId) => {
      const event: AreaEventOf<"spells"> = {
        durationMs: 8000,
        spellId,
        target: undefined,
        type: "channel_start",
      };
      t.handle.triggerAreaEvent("spells", event);
    });
    const out = await spellSpec.run(
      { do: "cast", spell: "Frost Armor" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
  });

  test("no reply within the cast time and a margin is UNCONFIRMED", async () => {
    await withFakeTimers(async () => {
      const t = await world();
      const run = spellSpec.run(
        { do: "cast", spell: "Fireball", target: "u1" },
        toolCtx(t),
      );
      const out = await fakeAwait(run, 10_000);
      expect(out.status).toBe("UNCONFIRMED");
      expect(t.handle.cast).toHaveBeenCalledTimes(1);
    });
  });

  test("an abort while waiting rejects", async () => {
    await withFakeTimers(async () => {
      const t = await world();
      const stop = new AbortController();
      const run = spellSpec.run(
        { do: "cast", spell: "Frost Armor" },
        toolCtx(t, stop.signal),
      );
      stop.abort(new Error("human_stop"));
      expect(await fakeRejection(run, 1000)).toBe("human_stop");
    });
  });
});
