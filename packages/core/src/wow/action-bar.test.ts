import { describe, expect, test } from "bun:test";
import { spellsActionButtonsBody } from "#test-support/areas/spells";
import { ActionBarStore } from "#wow/action-bar";
import { PacketReader } from "#wow/protocol/packet";

const FIREBALL = 133;
const HEARTHSTONE = 6948;

describe("ActionBarStore.set", () => {
  test("sets a button, keeps slot order and removes it again", () => {
    const store = new ActionBarStore();
    store.set(11, { id: HEARTHSTONE, type: "item" });
    store.set(0, { id: FIREBALL, type: "spell" });
    expect(store.snapshot()).toEqual([
      { id: FIREBALL, slot: 0, type: "spell" },
      { id: HEARTHSTONE, slot: 11, type: "item" },
    ]);
    store.set(0, { id: 168, type: "spell" });
    store.set(11, undefined);
    expect(store.snapshot()).toEqual([{ id: 168, slot: 0, type: "spell" }]);
  });

  test("a later SMSG_ACTION_BUTTONS replaces every set button (Player.cpp:5732-5758)", () => {
    const store = new ActionBarStore();
    store.set(0, { id: FIREBALL, type: "spell" });
    store.receive(
      new PacketReader(
        spellsActionButtonsBody({
          buttons: { 72: 0x80_00_00_00 | HEARTHSTONE },
          state: 1,
        }),
      ),
    );
    expect(store.snapshot()).toEqual([
      { id: HEARTHSTONE, slot: 72, type: "item" },
    ]);
  });
});
