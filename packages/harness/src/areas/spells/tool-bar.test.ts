import { describe, expect, jest, test } from "bun:test";
import type { ActionButton, NamedInventoryState } from "@peon/core";
import { spellSpec } from "#harness/areas/spells/tool";
import { Refusal } from "#harness/ops/refusal";
import { toolCtx } from "#test-support/ops-fixtures";
import {
  FIREBALL,
  HEARTHSTONE,
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

function hearthstoneInBags(t: SpellWorld): void {
  const inventory = t.handle.getInventoryState();
  const named: NamedInventoryState = {
    ...inventory,
    slots: [
      {
        bag: 255,
        guid: 0x1000n,
        item: {
          count: 1,
          entry: HEARTHSTONE,
          name: "Hearthstone",
          quality: 1,
        },
        region: "backpack",
        slot: 23,
        status: "occupied",
      } as unknown as NamedInventoryState["slots"][number],
    ],
  };
  jest.spyOn(t.handle, "getInventoryState").mockReturnValue(named);
  jest
    .spyOn(t.handle, "itemLabel")
    .mockReturnValue({ name: "Hearthstone", quality: 1 });
}

function barShows(t: SpellWorld, buttons: ActionButton[]): void {
  jest.spyOn(t.handle, "getActionBar").mockReturnValue(buttons);
}

describe("spell do:bar", () => {
  test("a spell goes to the zero-based wire slot and the body shows the bar row", async () => {
    const t = await spellWorld();
    const act = jest
      .spyOn(t.handle.spells.act, "setActionButton")
      .mockReturnValue({ ok: true });
    barShows(t, [{ id: FIREBALL, slot: 0, type: "spell" }]);
    const out = await spellSpec.run(
      { do: "bar", slot: 1, spell: "Fireball" },
      toolCtx(t),
    );
    expect(act).toHaveBeenCalledWith(0, { id: FIREBALL, type: "spell" });
    expect(out.status).toBe("DONE");
    expect(out.body).toEqual(["slot 1: Fireball (spell 133)"]);
  });

  test("slot 144 is the last wire slot 143", async () => {
    const t = await spellWorld();
    const act = jest
      .spyOn(t.handle.spells.act, "setActionButton")
      .mockReturnValue({ ok: true });
    await spellSpec.run(
      { do: "bar", slot: 144, spell: "Fireball" },
      toolCtx(t),
    );
    expect(act).toHaveBeenCalledWith(143, { id: FIREBALL, type: "spell" });
  });

  test("an item name in the bags goes to the slot as an item button", async () => {
    const t = await spellWorld();
    hearthstoneInBags(t);
    const act = jest
      .spyOn(t.handle.spells.act, "setActionButton")
      .mockReturnValue({ ok: true });
    barShows(t, [{ id: HEARTHSTONE, slot: 11, type: "item" }]);
    const out = await spellSpec.run(
      { do: "bar", item: "hearthstone", slot: 12 },
      toolCtx(t),
    );
    expect(act).toHaveBeenCalledWith(11, { id: HEARTHSTONE, type: "item" });
    expect(out.body).toEqual(["slot 12: Hearthstone (item 6948)"]);
  });

  test("an item id in text needs no bag lookup and sends the real packet", async () => {
    const t = await spellWorld();
    const before = t.handle.sent.length;
    const out = await spellSpec.run(
      { do: "bar", item: "6948", slot: 12 },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(t.handle.sent.length - before).toBe(1);
  });

  test("neither spell nor item clears the slot", async () => {
    const t = await spellWorld();
    const act = jest
      .spyOn(t.handle.spells.act, "setActionButton")
      .mockReturnValue({ ok: true });
    barShows(t, []);
    const out = await spellSpec.run({ do: "bar", slot: 3 }, toolCtx(t));
    expect(act).toHaveBeenCalledWith(2, undefined);
    expect(out.status).toBe("DONE");
    expect(out.detail).toContain("Cleared");
    expect(out.body).toEqual(["slot 3: empty"]);
  });

  test("a slot outside 1-144 or not a whole number is REFUSED invalid_slot", async () => {
    const t = await spellWorld();
    const act = jest.spyOn(t.handle.spells.act, "setActionButton");
    for (const slot of [0, 145, -1, 1.5]) {
      const refused = await refusal(
        spellSpec.run({ do: "bar", slot, spell: "Fireball" }, toolCtx(t)),
      );
      expect(refused.reason).toBe("invalid_slot");
    }
    expect(act).not.toHaveBeenCalled();
  });

  test("a missing slot is REFUSED missing_slot", async () => {
    const t = await spellWorld();
    const refused = await refusal(
      spellSpec.run({ do: "bar", spell: "Fireball" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("missing_slot");
  });

  test("spell and item together are REFUSED", async () => {
    const t = await spellWorld();
    const refused = await refusal(
      spellSpec.run(
        { do: "bar", item: "6948", slot: 1, spell: "Fireball" },
        toolCtx(t),
      ),
    );
    expect(refused.reason).toBe("spell_or_item");
  });

  test("an unknown spell or bag item is REFUSED and sends nothing", async () => {
    const t = await spellWorld();
    const act = jest.spyOn(t.handle.spells.act, "setActionButton");
    const spell = await refusal(
      spellSpec.run({ do: "bar", slot: 1, spell: "Pyroblast" }, toolCtx(t)),
    );
    const item = await refusal(
      spellSpec.run({ do: "bar", item: "Ruby Ring", slot: 1 }, toolCtx(t)),
    );
    expect(spell.reason).toBe("unknown_spell");
    expect(item.reason).toBe("unknown_item");
    expect(act).not.toHaveBeenCalled();
  });

  test("an act refusal becomes REFUSED with the same reason", async () => {
    const t = await spellWorld();
    jest
      .spyOn(t.handle.spells.act, "setActionButton")
      .mockReturnValue({ ok: false, reason: "invalid_button" });
    const refused = await refusal(
      spellSpec.run({ do: "bar", slot: 1, spell: "Fireball" }, toolCtx(t)),
    );
    expect(refused.reason).toBe("invalid_button");
  });
});
