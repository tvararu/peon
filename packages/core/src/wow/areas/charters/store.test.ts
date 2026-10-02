import { describe, expect, test } from "bun:test";
import {
  ARENA_ENTRIES,
  CHARTERS_CHARTER,
  CHARTERS_GUILD_MASTER,
  CHARTERS_ME,
  CHARTERS_ORGANIZER,
  CHARTERS_PETITION_ID,
  CHARTERS_SIGNER,
  chartersCharter,
  chartersCommandResultBody,
  chartersQueryResponseBody,
  chartersScene,
  chartersSetGuild,
  chartersShowlistBody,
  chartersSignaturesBody,
  GUILD_ENTRY,
} from "#test-support/areas/charters";
import type { ChartersEvent } from "#wow/areas/charters/store";
import { GameOpcode } from "#wow/protocol/opcodes";

const NAME = "FacAbCdeFghIjKlMn";

function showlist(
  npc: bigint,
  entries: {
    index: number;
    entry: number;
    displayId: number;
    cost: number;
    unknown: number;
    required: number;
  }[],
) {
  return chartersShowlistBody(npc, entries);
}

describe("charters store", () => {
  test("a showlist stores offers per NPC and emits showlist", () => {
    const { rig } = chartersScene();
    const seen: ChartersEvent[] = [];
    rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(
        GameOpcode.SMSG_PETITION_SHOWLIST,
        showlist(CHARTERS_GUILD_MASTER, [GUILD_ENTRY]),
      );
      expect(
        rig.handle.state().offers[`0x${CHARTERS_GUILD_MASTER.toString(16)}`],
      ).toEqual([GUILD_ENTRY]);
      expect(seen.map((event) => event.type)).toContain("showlist");
    } finally {
      rig.dispose();
    }
  });

  test("a mismatched showlist reply is ignored by the pending request", () => {
    const { rig } = chartersScene();
    try {
      const pending = rig.handle.act.showList(CHARTERS_ORGANIZER);
      const done = pending.then((outcome) => outcome.status);
      rig.inject(
        GameOpcode.SMSG_PETITION_SHOWLIST,
        showlist(CHARTERS_GUILD_MASTER, [GUILD_ENTRY]),
      );
      expect(rig.handle.state().pending?.kind).toBe("showlist");
      rig.inject(
        GameOpcode.SMSG_PETITION_SHOWLIST,
        showlist(CHARTERS_ORGANIZER, [...ARENA_ENTRIES]),
      );
      return expect(done).resolves.toBe("ok");
    } finally {
      rig.dispose();
    }
  });

  test("a query response stores the petition by item guid", async () => {
    const { rig } = chartersScene((seeded) => {
      chartersCharter(seeded, 24, CHARTERS_CHARTER, CHARTERS_PETITION_ID);
    });
    try {
      const begin = rig.handle.act.query(CHARTERS_CHARTER);
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
      const outcome = await begin;
      expect(outcome.status).toBe("ok");
      const petition =
        rig.handle.state().petitions[`0x${CHARTERS_CHARTER.toString(16)}`];
      expect(petition?.name).toBe(NAME);
      expect(petition?.needed).toBe(9);
    } finally {
      rig.dispose();
    }
  });

  test("a query response for an unknown petition id stores nothing", () => {
    const { rig } = chartersScene();
    try {
      rig.inject(
        GameOpcode.SMSG_PETITION_QUERY_RESPONSE,
        chartersQueryResponseBody({
          id: 4242,
          name: NAME,
          needed: 9,
          owner: CHARTERS_ME,
          type: 0,
        }),
      );
      expect(rig.handle.state().petitions).toEqual({});
      expect(rig.handle.state().pending).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("signatures update the signers of a known charter", async () => {
    const { rig } = chartersScene((seeded) => {
      chartersCharter(seeded, 24, CHARTERS_CHARTER, CHARTERS_PETITION_ID);
    });
    try {
      const pending = rig.handle.act.showSignatures(CHARTERS_CHARTER);
      await Promise.resolve();
      rig.inject(
        GameOpcode.SMSG_PETITION_SHOW_SIGNATURES,
        chartersSignaturesBody({
          item: CHARTERS_CHARTER,
          petition: CHARTERS_PETITION_ID,
          requester: CHARTERS_ME,
          signers: [],
        }),
      );
      expect(await pending.then((outcome) => outcome.status)).toBe("ok");
      expect(rig.handle.state().pendingOffer).toBeUndefined();
    } finally {
      rig.dispose();
    }
  });

  test("signatures for an item not in the bags set pendingOffer", () => {
    const { rig } = chartersScene();
    try {
      rig.inject(
        GameOpcode.SMSG_PETITION_SHOW_SIGNATURES,
        chartersSignaturesBody({
          item: CHARTERS_CHARTER,
          petition: CHARTERS_PETITION_ID,
          requester: CHARTERS_ME,
          signers: [CHARTERS_SIGNER],
        }),
      );
      expect(rig.handle.state().pendingOffer?.item).toBe(CHARTERS_CHARTER);
      expect(rig.handle.state().pendingOffer?.signers).toEqual([
        CHARTERS_SIGNER,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("name taken refuses the pending buy", () => {
    const { rig } = chartersScene();
    try {
      const pending = rig.handle.act.buy(CHARTERS_GUILD_MASTER, NAME, 1);
      const done = pending.then((outcome) => outcome);
      rig.inject(
        GameOpcode.SMSG_GUILD_COMMAND_RESULT,
        chartersCommandResultBody(0, NAME, 7),
      );
      return expect(done).resolves.toEqual({
        reason: "name_taken",
        status: "refused",
      });
    } finally {
      rig.dispose();
    }
  });

  test("an invalid name refuses the pending rename", () => {
    const { rig } = chartersScene((seeded) => {
      chartersCharter(seeded, 24, CHARTERS_CHARTER, CHARTERS_PETITION_ID);
    });
    try {
      const pending = rig.handle.act.rename(CHARTERS_CHARTER, "x");
      const done = pending.then((outcome) => outcome);
      rig.inject(
        GameOpcode.SMSG_GUILD_COMMAND_RESULT,
        chartersCommandResultBody(0, "x", 6),
      );
      return expect(done).resolves.toEqual({
        reason: "name_invalid",
        status: "refused",
      });
    } finally {
      rig.dispose();
    }
  });

  test("an unrelated command result does not settle a pending buy", () => {
    const { rig } = chartersScene();
    try {
      const pending = rig.handle.act.buy(CHARTERS_GUILD_MASTER, NAME, 1);
      rig.inject(
        GameOpcode.SMSG_GUILD_COMMAND_RESULT,
        chartersCommandResultBody(5, "", 0),
      );
      expect(rig.handle.state().pending?.kind).toBe("buy");
      rig.dispose();
      return expect(pending).rejects.toThrow();
    } finally {
      rig.dispose();
    }
  });

  test("a buy while in a guild refuses locally without sending", () => {
    const { rig, world } = chartersScene();
    try {
      chartersSetGuild(world, 22);
      rig.touch();
      return expect(
        rig.handle.act.buy(CHARTERS_GUILD_MASTER, NAME, 1),
      ).resolves.toEqual({
        reason: "in_guild",
        status: "refused",
      });
    } finally {
      rig.dispose();
    }
  });
});
