import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { lfgListBody } from "#test-support/areas/lfg";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import type { SentPacket } from "#wow/areas/port";
import { GameOpcode } from "#wow/protocol/opcodes";

const ENTRY = 0x02_00_00_2a;
const DUNGEON = 0x2a;

function sent(rig: { sent: readonly SentPacket[] }, opcode: number) {
  return rig.sent.filter((p) => p.opcode === opcode);
}

describe("lfg searchRaids", () => {
  test("sends the entry as given and settles on the first list for the masked id", async () => {
    const rig = areaRig("lfg");
    try {
      const pending = rig.handle.act.searchRaids(ENTRY);
      const packets = sent(rig, GameOpcode.CMSG_SEARCH_LFG_JOIN);
      expect(packets).toHaveLength(1);
      expect(packets[0]?.body).toEqual(new Uint8Array([0x2a, 0, 0, 2]));
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({ dungeon: DUNGEON + 1 }),
      );
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({ dungeon: DUNGEON }),
      );
      expect(await pending).toEqual({ status: "ok", form: "full" });
      expect(rig.handle.state().raidLists[DUNGEON]).toBeDefined();
    } finally {
      rig.dispose();
    }
  });

  test("a difference list for the entry settles too and reports its form", async () => {
    const rig = areaRig("lfg");
    try {
      const pending = rig.handle.act.searchRaids(DUNGEON);
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({ dungeon: DUNGEON, deleted: [] }),
      );
      expect(await pending).toEqual({ status: "ok", form: "difference" });
    } finally {
      rig.dispose();
    }
  });

  test.each([0, -1, 1.5, 2 ** 32, Number.NaN, 2 ** 33])(
    "refuses bad_entry for %p with no send",
    async (entry) => {
      const rig = areaRig("lfg");
      try {
        expect(await rig.handle.act.searchRaids(entry)).toEqual({
          status: "refused",
          reason: "bad_entry",
        });
        expect(sent(rig, GameOpcode.CMSG_SEARCH_LFG_JOIN)).toHaveLength(0);
      } finally {
        rig.dispose();
      }
    },
  );

  test("settles no_answer after 5 s and frees the act", async () => {
    await withFakeTimers(async () => {
      const rig = areaRig("lfg");
      try {
        const pending = rig.handle.act.searchRaids(ENTRY);
        await elapse(5000);
        expect(await pending).toEqual({ status: "no_answer" });
        const again = rig.handle.act.searchRaids(ENTRY);
        rig.inject(
          GameOpcode.SMSG_UPDATE_LFG_LIST,
          lfgListBody({ dungeon: DUNGEON }),
        );
        expect(await again).toEqual({ status: "ok", form: "full" });
        expect(sent(rig, GameOpcode.CMSG_SEARCH_LFG_JOIN)).toHaveLength(2);
      } finally {
        rig.dispose();
      }
    });
  });

  test("a second search while one waits is refused busy", async () => {
    const rig = areaRig("lfg");
    try {
      const first = rig.handle.act.searchRaids(ENTRY);
      expect(await rig.handle.act.searchRaids(ENTRY)).toEqual({
        status: "refused",
        reason: "busy",
      });
      expect(sent(rig, GameOpcode.CMSG_SEARCH_LFG_JOIN)).toHaveLength(1);
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({ dungeon: DUNGEON }),
      );
      await first;
    } finally {
      rig.dispose();
    }
  });

  test("disposing the session rejects a waiting search", async () => {
    const rig = areaRig("lfg");
    const pending = rig.handle.act.searchRaids(ENTRY);
    const outcome = pending.then(
      () => "settled",
      () => "rejected",
    );
    rig.dispose();
    expect(await outcome).toBe("rejected");
  });
});

describe("lfg stopSearch", () => {
  test("sends the leave with the entry and settles ok at once", async () => {
    const rig = areaRig("lfg");
    try {
      expect(await rig.handle.act.stopSearch(ENTRY)).toEqual({ status: "ok" });
      const packets = sent(rig, GameOpcode.CMSG_SEARCH_LFG_LEAVE);
      expect(packets).toHaveLength(1);
      expect(packets[0]?.body).toEqual(new Uint8Array([0x2a, 0, 0, 2]));
    } finally {
      rig.dispose();
    }
  });

  test("keeps the lists the search collected", async () => {
    const rig = areaRig("lfg");
    try {
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({ dungeon: DUNGEON }),
      );
      await rig.handle.act.stopSearch(ENTRY);
      expect(rig.handle.state().raidLists[DUNGEON]).toBeDefined();
    } finally {
      rig.dispose();
    }
  });

  test("refuses bad_entry with no send", async () => {
    const rig = areaRig("lfg");
    try {
      expect(await rig.handle.act.stopSearch(0)).toEqual({
        status: "refused",
        reason: "bad_entry",
      });
      expect(sent(rig, GameOpcode.CMSG_SEARCH_LFG_LEAVE)).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("is not blocked by a search that waits", async () => {
    const rig = areaRig("lfg");
    try {
      const search = rig.handle.act.searchRaids(ENTRY);
      expect(await rig.handle.act.stopSearch(ENTRY)).toEqual({ status: "ok" });
      rig.inject(
        GameOpcode.SMSG_UPDATE_LFG_LIST,
        lfgListBody({ dungeon: DUNGEON }),
      );
      await search;
    } finally {
      rig.dispose();
    }
  });
});
