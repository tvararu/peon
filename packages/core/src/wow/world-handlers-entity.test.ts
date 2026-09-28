import { describe, expect, test } from "bun:test";
import { unitmotionCreateBody } from "#test-support/areas/unitmotion";
import { motionFixture } from "#test-support/remote-motion-fixtures";
import { MovementFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

const CREATURE = 0xf1_30_00_3e_ea_00_0a_bcn;

describe("entity handlers feed unit movement", () => {
  test("a create block reaches the unitmotion store with its flags and nine speeds", async () => {
    const f = await motionFixture();
    try {
      await f.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        unitmotionCreateBody({
          guid: CREATURE,
          flags: MovementFlag.HOVER | MovementFlag.DISABLE_GRAVITY,
          speeds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        }),
      );
      const row = f.handle.unitmotion
        .state()
        .units.find((unit) => unit.guid === CREATURE);
      expect(row?.flags).toBe(
        MovementFlag.HOVER | MovementFlag.DISABLE_GRAVITY,
      );
      expect(row?.serverControlled).toBe(true);
      expect(
        Object.fromEntries(
          Object.entries(row?.speeds ?? {}).map(([kind, reading]) => [
            kind,
            [reading.value, reading.source],
          ]),
        ),
      ).toEqual({
        walk: [1, "create"],
        run: [2, "create"],
        run_back: [3, "create"],
        swim: [4, "create"],
        swim_back: [5, "create"],
        flight: [6, "create"],
        flight_back: [7, "create"],
        turn: [8, "create"],
        pitch: [9, "create"],
      });
    } finally {
      await f.close();
    }
  });

  test("a unit that leaves view leaves the unitmotion store", async () => {
    const f = await motionFixture();
    try {
      await f.inject(
        GameOpcode.SMSG_UPDATE_OBJECT,
        unitmotionCreateBody({ guid: CREATURE }),
      );
      await f.inject(
        GameOpcode.SMSG_DESTROY_OBJECT,
        Uint8Array.of(0xbc, 0x0a, 0x00, 0xea, 0x3e, 0x00, 0x30, 0xf1, 0),
      );
      const guids = f.handle.unitmotion.state().units.map((unit) => unit.guid);
      expect(guids).not.toContain(CREATURE);
    } finally {
      await f.close();
    }
  });
});
