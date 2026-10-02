import { describe, expect, test } from "bun:test";
import {
  ARENA_ENTRIES,
  CHARTERS_CHARTER,
  CHARTERS_GUILD_MASTER,
  CHARTERS_ME,
  CHARTERS_ORGANIZER,
  CHARTERS_PETITION_ID,
  GUILD_ENTRY,
  chartersBuyFailedBody,
  chartersCharter,
  chartersFailureBody,
  chartersItemPushBody,
  chartersQueryResponseBody,
  chartersRenameBody,
  chartersScene,
  chartersShowlistBody,
  chartersSignaturesBody,
} from "#test-support/areas/charters";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import {
  buildPetitionBuy,
  buildPetitionQuery,
  buildPetitionRename,
} from "#wow/areas/charters/protocol";
import { CHARTERS_ANSWER_MS } from "#wow/areas/charters/runtime";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const NAME = "FacAbCdeFghIjKlMn";

function sentBodies(rig: { sent: readonly { body: Uint8Array | undefined }[] }) {
  return rig.sent.map((packet) => packet.body ?? new Uint8Array());
}

describe("charters acts", () => {
  test("showList sends CMSG_PETITION_SHOWLIST and settles on its reply", async () => {
    const { rig } = chartersScene();
    try {
      const pending = rig.handle.act.showList(CHARTERS_GUILD_MASTER);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_PETITION_SHOWLIST,
      ]);
      expect(new PacketReader(sentBodies(rig)[0] ?? new Uint8Array()).uint64LE()).toBe(
        CHARTERS_GUILD_MASTER,
      );
      rig.inject(
        GameOpcode.SMSG_PETITION_SHOWLIST,
        chartersShowlistBody(CHARTERS_GUILD_MASTER, [GUILD_ENTRY]),
      );
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("buy sends the full buy body; the item push settles it with the new charter", async () => {
    const { rig, world } = chartersScene();
    try {
      const pending = rig.handle.act.buy(CHARTERS_GUILD_MASTER, NAME, 1);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_PETITION_BUY,
      ]);
      expect(sentBodies(rig)[0]).toEqual(
        buildPetitionBuy(CHARTERS_GUILD_MASTER, 1, NAME),
      );
      chartersCharter(world, 24, CHARTERS_CHARTER, CHARTERS_PETITION_ID);
      rig.touch();
      rig.inject(GameOpcode.SMSG_ITEM_PUSH_RESULT, chartersItemPushBody(CHARTERS_ME, 5863));
      const outcome = await pending;
      expect(outcome.status).toBe("ok");
      expect(outcome).toEqual({ item: CHARTERS_CHARTER, status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("buy refuses on SMSG_BUY_FAILED without enough money", async () => {
    const { rig } = chartersScene();
    try {
      const pending = rig.handle.act.buy(CHARTERS_GUILD_MASTER, NAME, 1);
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_BUY_FAILED,
        chartersBuyFailedBody(CHARTERS_GUILD_MASTER, 5863, 2),
      );
      expect(await pending).toEqual({ reason: "not_enough_money", status: "refused" });
    } finally {
      rig.dispose();
    }
  });

  test("buy refuses when the bags are full", async () => {
    const { rig } = chartersScene();
    try {
      const pending = rig.handle.act.buy(CHARTERS_GUILD_MASTER, NAME, 1);
      await Promise.resolve();
      rig.inject(GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE, chartersFailureBody(50));
      expect(await pending).toEqual({ reason: "inventory_full", status: "refused" });
    } finally {
      rig.dispose();
    }
  });

  test("query sends the stored petition id, else zero", async () => {
    const { rig } = chartersScene((seeded) => {
      chartersCharter(seeded, 24, CHARTERS_CHARTER, CHARTERS_PETITION_ID);
    });
    try {
      const known = rig.handle.act.query(CHARTERS_CHARTER);
      await Promise.resolve();
      expect(sentBodies(rig)[0]).toEqual(
        buildPetitionQuery(CHARTERS_PETITION_ID, CHARTERS_CHARTER),
      );
      rig.inject(
        GameOpcode.SMSG_PETITION_QUERY_RESPONSE,
        chartersQueryResponseBody({
          id: CHARTERS_PETITION_ID,
          name: NAME,
          needed: 9,
          owner: CHARTERS_ME,
          type: 0,
        }),
      );
      expect(await known).toEqual({ item: CHARTERS_CHARTER, status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("query of a charter without a petition id sends zero", async () => {
    const { rig } = chartersScene((seeded) => {
      chartersCharter(seeded, 24, CHARTERS_CHARTER, undefined);
    });
    try {
      const pending = rig.handle.act.query(CHARTERS_CHARTER);
      await Promise.resolve();
      expect(sentBodies(rig)[0]).toEqual(buildPetitionQuery(0, CHARTERS_CHARTER));
      rig.dispose();
      await expect(pending).rejects.toThrow();
    } finally {
      rig.dispose();
    }
  });

  test("showSignatures sends the item guid and settles on the roster", async () => {
    const { rig } = chartersScene((seeded) => {
      chartersCharter(seeded, 24, CHARTERS_CHARTER, CHARTERS_PETITION_ID);
    });
    try {
      const pending = rig.handle.act.showSignatures(CHARTERS_CHARTER);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_PETITION_SHOW_SIGNATURES,
      ]);
      rig.inject(
        GameOpcode.SMSG_PETITION_SHOW_SIGNATURES,
        chartersSignaturesBody({
          item: CHARTERS_CHARTER,
          petition: CHARTERS_PETITION_ID,
          requester: CHARTERS_ME,
          signers: [],
        }),
      );
      expect(await pending).toEqual({ item: CHARTERS_CHARTER, status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("rename sends the item guid and name, settling on the echo", async () => {
    const renamed = "FacAbCdeFghIjKlMo";
    const { rig } = chartersScene((seeded) => {
      chartersCharter(seeded, 24, CHARTERS_CHARTER, CHARTERS_PETITION_ID);
    });
    try {
      const pending = rig.handle.act.rename(CHARTERS_CHARTER, renamed);
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.MSG_PETITION_RENAME,
      ]);
      expect(sentBodies(rig)[0]).toEqual(buildPetitionRename(CHARTERS_CHARTER, renamed));
      rig.inject(
        GameOpcode.MSG_PETITION_RENAME,
        chartersRenameBody(CHARTERS_CHARTER, renamed),
      );
      expect(await pending).toEqual({ item: CHARTERS_CHARTER, status: "ok" });
      expect(rig.handle.state().petitions[`0x${CHARTERS_CHARTER.toString(16)}`]).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("rename updates the stored petition name", async () => {
    const renamed = "FacAbCdeFghIjKlMo";
    const { rig } = chartersScene((seeded) => {
      chartersCharter(seeded, 24, CHARTERS_CHARTER, CHARTERS_PETITION_ID);
    });
    try {
      const query = rig.handle.act.query(CHARTERS_CHARTER);
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_PETITION_QUERY_RESPONSE,
        chartersQueryResponseBody({
          id: CHARTERS_PETITION_ID,
          name: NAME,
          needed: 9,
          owner: CHARTERS_ME,
          type: 0,
        }),
      );
      expect((await query).status).toBe("ok");
      const pending = rig.handle.act.rename(CHARTERS_CHARTER, renamed);
      await Promise.resolve();
      rig.inject(
        GameOpcode.MSG_PETITION_RENAME,
        chartersRenameBody(CHARTERS_CHARTER, renamed),
      );
      expect(await pending).toEqual({ item: CHARTERS_CHARTER, status: "ok" });
      expect(
        rig.handle.state().petitions[`0x${CHARTERS_CHARTER.toString(16)}`]?.name,
      ).toBe(renamed);
    } finally {
      rig.dispose();
    }
  });

  test("an arena showlist stores the three entries", async () => {
    const { rig } = chartersScene();
    try {
      const pending = rig.handle.act.showList(CHARTERS_ORGANIZER);
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_PETITION_SHOWLIST,
        chartersShowlistBody(CHARTERS_ORGANIZER, [...ARENA_ENTRIES]),
      );
      expect(await pending).toEqual({ status: "ok" });
      expect(
        rig.handle.state().offers[`0x${CHARTERS_ORGANIZER.toString(16)}`]?.map((entry) => entry.required),
      ).toEqual([2, 3, 5]);
    } finally {
      rig.dispose();
    }
  });

  test("buy refuses a non-petitioner without sending", async () => {
    const { rig } = chartersScene();
    try {
      const outcome = await rig.handle.act.buy(0x99n, NAME, 1);
      expect(outcome).toEqual({ reason: "not_petitioner", status: "refused" });
      expect(rig.sent).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("a second request while one is pending throws", async () => {
    const { rig } = chartersScene();
    try {
      const first = rig.handle.act.showList(CHARTERS_GUILD_MASTER);
      await Promise.resolve();
      await expect(rig.handle.act.showList(CHARTERS_GUILD_MASTER)).rejects.toThrow(
        "a charters request is already pending",
      );
      rig.dispose();
      await expect(first).rejects.toThrow();
    } finally {
      rig.dispose();
    }
  });

  test("silence settles no_reply after 5 s", async () => {
    await withFakeTimers(async () => {
      const { rig } = chartersScene();
      try {
        const pending = rig.handle.act.showList(CHARTERS_GUILD_MASTER);
        await elapse(CHARTERS_ANSWER_MS);
        expect(await pending).toEqual({ status: "no_reply" });
      } finally {
        rig.dispose();
      }
    });
  });
});
