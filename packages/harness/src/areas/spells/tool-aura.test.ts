import { describe, expect, jest, test } from "bun:test";
import type { AreaEventOf } from "@peon/core";
import {
  elapse,
  fakeAwait,
  withFakeTimers,
} from "@peon/core/test-support/fake-time";
import { spellSpec } from "#harness/areas/spells/tool";
import { Refusal } from "#harness/ops/refusal";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  aura,
  FROST_ARMOR,
  FROST_ARMOR_SPELL,
  mountAura,
  type SpellWorld,
  spellWorld,
} from "#test-support/spell-tool-fixtures";

async function refusal(promise: Promise<unknown>): Promise<Refusal> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!(error instanceof Refusal)) throw new Error("no refusal");
  return error;
}

function removesAura(t: SpellWorld) {
  return jest
    .spyOn(t.handle.spells.act, "cancelAura")
    .mockImplementation(() => {
      t.auras.length = 0;
      t.handle.triggerCombatEvent({ state: t.state(), type: "aura" });
      return { ok: true };
    });
}

describe("spell do:cancel_aura", () => {
  test("calls the cancelAura act and is DONE when the aura update removes the aura", async () => {
    const t = await spellWorld({ auras: [aura()] });
    const act = removesAura(t);
    const out = await spellSpec.run(
      { do: "cancel_aura", spell: "Frost Armor" },
      toolCtx(t),
    );
    expect(act).toHaveBeenCalledWith(FROST_ARMOR);
    expect(out.status).toBe("DONE");
    expect(out.after).toMatchObject({
      do: "cancel_aura",
      spell: { id: FROST_ARMOR, name: "Frost Armor" },
    });
  });

  test("a spell id in text cancels that aura", async () => {
    const t = await spellWorld({ auras: [aura()] });
    const act = removesAura(t);
    await spellSpec.run({ do: "cancel_aura", spell: "168" }, toolCtx(t));
    expect(act).toHaveBeenCalledWith(FROST_ARMOR);
  });

  test("an aura that another aura update leaves in place stays UNCONFIRMED after 2 s", async () => {
    await withFakeTimers(async () => {
      const t = await spellWorld({ auras: [aura()] });
      jest
        .spyOn(t.handle.spells.act, "cancelAura")
        .mockImplementation(() => ({ ok: true }));
      const started = performance.now();
      const run = spellSpec.run(
        { do: "cancel_aura", spell: "Frost Armor" },
        toolCtx(t),
      );
      await elapse(100);
      t.handle.triggerCombatEvent({ state: t.state(), type: "aura" });
      const out = await fakeAwait(run, 5000);
      expect(out.status).toBe("UNCONFIRMED");
      expect(performance.now() - started).toBeGreaterThanOrEqual(2000);
      expect(performance.now() - started).toBeLessThan(2500);
    });
  });

  test("a channel end for the spell also settles the cancel", async () => {
    const t = await spellWorld({ auras: [aura()] });
    jest.spyOn(t.handle.spells.act, "cancelAura").mockImplementation(() => {
      const event: AreaEventOf<"spells"> = {
        reason: "cancelled",
        spellId: FROST_ARMOR,
        type: "channel_end",
      };
      t.handle.triggerAreaEvent("spells", event);
      return { ok: true };
    });
    const out = await spellSpec.run(
      { do: "cancel_aura", spell: "Frost Armor" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
  });

  test("a mount aura is cancelled like any cancellable aura", async () => {
    const mount = mountAura();
    const t = await spellWorld({
      auras: [mount.aura],
      definitions: [mount.spell],
    });
    const act = removesAura(t);
    const out = await spellSpec.run(
      { do: "cancel_aura", spell: "Brown Horse" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(act).toHaveBeenCalledWith(mount.spell.id);
  });

  test("an act refusal becomes REFUSED with the same reason", async () => {
    for (const reason of ["not_aura", "not_cancellable", "cancel_requested"]) {
      const t = await spellWorld({ auras: [aura()] });
      jest
        .spyOn(t.handle.spells.act, "cancelAura")
        .mockReturnValue({ ok: false, reason });
      const refused = await refusal(
        spellSpec.run({ do: "cancel_aura", spell: "Frost Armor" }, toolCtx(t)),
      );
      expect(refused.reason).toBe(reason);
    }
  });

  test("a spell that is neither an aura nor known is REFUSED unknown_spell", async () => {
    const t = await spellWorld({ auras: [aura()] });
    const act = jest.spyOn(t.handle.spells.act, "cancelAura");
    const refused = await refusal(
      spellSpec.run({ do: "cancel_aura", spell: "Pyroblast" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("unknown_spell");
    expect(act).not.toHaveBeenCalled();
  });

  test("a known spell that is not worn is REFUSED not_aura through the act", async () => {
    const t = await spellWorld({ auras: [] });
    const refused = await refusal(
      spellSpec.run({ do: "cancel_aura", spell: "Frost Armor" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("not_aura");
  });

  test("a missing spell is REFUSED missing_spell", async () => {
    const t = await spellWorld({ auras: [aura()] });
    const refused = await refusal(
      spellSpec.run({ do: "cancel_aura" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("missing_spell");
  });

  test("an aura name is found among the worn auras when the spellbook lacks it", async () => {
    const proc = aura({ name: "Clearcasting", slot: 2, spellId: 12_536 });
    const t = await spellWorld({ auras: [proc], book: [FROST_ARMOR_SPELL] });
    const act = removesAura(t);
    await spellSpec.run(
      { do: "cancel_aura", spell: "clearcasting" },
      toolCtx(t),
    );
    expect(act).toHaveBeenCalledWith(12_536);
  });
});
