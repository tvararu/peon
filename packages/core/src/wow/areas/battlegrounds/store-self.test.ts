import { describe, expect, test } from "bun:test";
import { battlegroundsScene } from "#test-support/areas/battlegrounds";
import type { BattlegroundsEvent } from "#wow/areas/battlegrounds/store";
import type { BattlegroundsFlag } from "#wow/areas/battlegrounds/store-self";

const flags = (event: BattlegroundsEvent): BattlegroundsFlag => {
  if (event.type !== "pvp_flag") throw new Error("expected pvp_flag");
  return event;
};

describe("battlegrounds store-self flags (Entities/Player/Player.h:467-477)", () => {
  test("self PLAYER_FLAGS 0x200 with byte2 0x01 emits pvp_flag on without timer", () => {
    const { rig, update } = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      update(0x0b_00n, { byte2: 0x01, playerFlags: 0x200 });
      const event = seen.find((candidate) => candidate.type === "pvp_flag");
      if (!event) throw new Error("no pvp_flag event");
      expect({ ...flags(event) }).toEqual({
        contested: false,
        ffa: false,
        flagged: true,
        sanctuary: false,
        timer: false,
        type: "pvp_flag",
        wants: true,
      });
      expect(rig.handle.state().self.wantsFlag).toBe(true);
      expect(rig.handle.state().self.flagged).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("PLAYER_FLAGS 0x40000 sets the timer; contested, ffa and sanctuary read too", () => {
    const { rig, update } = battlegroundsScene();
    try {
      update(0x0b_00n, {
        byte2: 0x0c,
        playerFlags: 0x40100,
      });
      const self = rig.handle.state().self;
      expect(self.timer).toBe(true);
      expect(self.contested).toBe(true);
      expect(self.ffa).toBe(true);
      expect(self.sanctuary).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("an other-guid update changes nothing", () => {
    const { rig, update } = battlegroundsScene();
    const seen: BattlegroundsEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      update(0x0c_00n, { byte2: 0x02_00_00_01, playerFlags: 0x200 });
      expect(seen).toEqual([]);
      expect(rig.handle.state().self.wantsFlag).toBe(false);
    } finally {
      rig.dispose();
    }
  });
});
