import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  lfgBootBody,
  lfgProposalBody,
  lfgTeleportDeniedBody,
} from "#test-support/areas/lfg";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import { partyMember, partyState } from "#test-support/party-fixtures";
import type { SentPacket } from "#wow/areas/port";
import type { Entity } from "#wow/entity-store";
import { ObjectType, UnitFlag } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";

const SELF = 0x11n;
const DEADMINES = { mapId: 36, x: 0, y: 0, z: 0, orientation: 0 };

type World = {
  now: number;
  health: number;
  ghost: boolean;
  flags: number;
  lfgGroup: boolean;
};

function build(world: Partial<World> = {}) {
  const state: World = {
    now: 1000,
    health: 100,
    ghost: false,
    flags: 0,
    lfgGroup: true,
    ...world,
  };
  const rig = areaRig("lfg", {
    now: () => state.now,
    selfGuid: SELF,
    getEntity: (guid) =>
      guid === SELF
        ? ({
            guid,
            objectType: ObjectType.PLAYER,
            createComplete: true,
            rawFields: new Map([
              [0x18, state.health],
              [0x96, state.ghost ? 0x10 : 0],
            ]),
            unitFlags: state.flags,
          } as unknown as Entity)
        : undefined,
    legacy: {
      party: () =>
        state.lfgGroup
          ? partyState({
              inGroup: true,
              members: [partyMember({ guid: 0xden })],
              dungeonFinder: { status: 0, dungeonId: 258 },
            })
          : partyState({
              inGroup: true,
              members: [partyMember({ guid: 0xden })],
            }),
      friends: () => [],
      ignored: () => [],
      guild: () => undefined,
      channels: () => [],
    },
  });
  return { rig, state };
}

function sent(rig: { sent: readonly SentPacket[] }, opcode: number) {
  return rig.sent.filter((p) => p.opcode === opcode);
}

function proposal(
  state: number,
  id = 5,
  self: { answered?: boolean; accepted?: boolean } = {},
  other: { answered?: boolean; accepted?: boolean } = {},
) {
  return lfgProposalBody({
    dungeon: 0x06_00_00_02,
    state,
    id,
    players: [
      { role: 8, self: true, ...self },
      { role: 2, self: false, ...other },
    ],
  });
}

function boot(inProgress: boolean, didVote = false) {
  return lfgBootBody({
    inProgress,
    didVote,
    victim: 0xabn,
    timeLeft: 100,
    reason: "afk",
  });
}

describe("lfg answerProposal", () => {
  test("refuses no_proposal with no send", async () => {
    const { rig } = build();
    try {
      expect(await rig.handle.act.answerProposal(true)).toEqual({
        status: "refused",
        reason: "no_proposal",
      });
      expect(sent(rig, GameOpcode.CMSG_LFG_PROPOSAL_RESULT)).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("refuses expired after the deadline with no send", async () => {
    const { rig, state } = build();
    try {
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0));
      state.now = 1000 + 40_000;
      expect(await rig.handle.act.answerProposal(true)).toEqual({
        status: "refused",
        reason: "expired",
      });
      expect(sent(rig, GameOpcode.CMSG_LFG_PROPOSAL_RESULT)).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("sends the stored id and settles on the next update for that id", async () => {
    const { rig } = build();
    try {
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0, 5));
      const pending = rig.handle.act.answerProposal(true);
      const packets = sent(rig, GameOpcode.CMSG_LFG_PROPOSAL_RESULT);
      expect(packets).toHaveLength(1);
      expect(packets[0]?.body).toEqual(new Uint8Array([5, 0, 0, 0, 1]));
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0, 9));
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(2, 5));
      expect(await pending).toEqual({ status: "ok", state: 2 });
    } finally {
      rig.dispose();
    }
  });

  test("a decline settles on the failed update", async () => {
    const { rig } = build();
    try {
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0, 5));
      const pending = rig.handle.act.answerProposal(false);
      expect(sent(rig, GameOpcode.CMSG_LFG_PROPOSAL_RESULT)[0]?.body).toEqual(
        new Uint8Array([5, 0, 0, 0, 0]),
      );
      rig.inject(
        GameOpcode.SMSG_LFG_PROPOSAL_UPDATE,
        proposal(1, 5, { answered: true, accepted: false }),
      );
      expect(await pending).toEqual({ status: "ok", state: 1 });
    } finally {
      rig.dispose();
    }
  });

  test("another member's reply before this player's answer does not settle", async () => {
    const { rig } = build();
    try {
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0, 5));
      const pending = rig.handle.act.answerProposal(true);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      rig.inject(
        GameOpcode.SMSG_LFG_PROPOSAL_UPDATE,
        proposal(0, 5, {}, { answered: true, accepted: true }),
      );
      await Promise.resolve();
      expect(settled).toBe(false);
      rig.inject(
        GameOpcode.SMSG_LFG_PROPOSAL_UPDATE,
        proposal(
          0,
          5,
          { answered: true, accepted: true },
          { answered: true, accepted: true },
        ),
      );
      expect(await pending).toEqual({ status: "ok", state: 0 });
    } finally {
      rig.dispose();
    }
  });

  test("a state 0 update that records the opposite answer does not settle", async () => {
    const { rig } = build();
    try {
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0, 5));
      const pending = rig.handle.act.answerProposal(false);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      rig.inject(
        GameOpcode.SMSG_LFG_PROPOSAL_UPDATE,
        proposal(0, 5, { answered: true, accepted: true }),
      );
      await Promise.resolve();
      expect(settled).toBe(false);
      rig.inject(
        GameOpcode.SMSG_LFG_PROPOSAL_UPDATE,
        proposal(1, 5, { answered: true, accepted: false }),
      );
      expect(await pending).toEqual({ status: "ok", state: 1 });
    } finally {
      rig.dispose();
    }
  });

  test("a proposal that fails on another member's decline is refused, not ok", async () => {
    const { rig } = build();
    try {
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0, 5));
      const pending = rig.handle.act.answerProposal(true);
      rig.inject(
        GameOpcode.SMSG_LFG_PROPOSAL_UPDATE,
        proposal(1, 5, {}, { answered: true, accepted: false }),
      );
      expect(await pending).toEqual({
        status: "refused",
        reason: "proposal_failed",
      });
    } finally {
      rig.dispose();
    }
  });

  test("settles no_answer after 5 s of silence", async () => {
    await withFakeTimers(async () => {
      const { rig } = build();
      try {
        rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0));
        const pending = rig.handle.act.answerProposal(true);
        await elapse(5000);
        expect(await pending).toEqual({ status: "no_answer" });
      } finally {
        rig.dispose();
      }
    });
  });

  test("a second act while one waits is refused busy", async () => {
    const { rig } = build();
    try {
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0));
      const first = rig.handle.act.answerProposal(true);
      expect(await rig.handle.act.answerProposal(true)).toEqual({
        status: "refused",
        reason: "busy",
      });
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(2));
      await first;
    } finally {
      rig.dispose();
    }
  });
});

describe("lfg teleport", () => {
  test("refuses not_in_lfg_group outside an LFG group with no send", async () => {
    const { rig } = build({ lfgGroup: false });
    try {
      expect(await rig.handle.act.teleport(false)).toEqual({
        status: "refused",
        reason: "not_in_lfg_group",
        code: 6,
      });
      expect(sent(rig, GameOpcode.CMSG_LFG_TELEPORT)).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test.each([
    ["dead", { health: 0 }],
    ["dead", { ghost: true, health: 1 }],
  ])(
    "refuses %s with the server's code 1 and no send",
    async (reason, world) => {
      const { rig } = build(world);
      try {
        expect(await rig.handle.act.teleport(false)).toEqual({
          status: "refused",
          reason,
          code: 1,
        });
        expect(sent(rig, GameOpcode.CMSG_LFG_TELEPORT)).toHaveLength(0);
      } finally {
        rig.dispose();
      }
    },
  );

  test("refuses in_combat with code 8 and no send", async () => {
    const { rig } = build({ flags: UnitFlag.IN_COMBAT });
    try {
      expect(await rig.handle.act.teleport(false)).toEqual({
        status: "refused",
        reason: "in_combat",
        code: 8,
      });
      expect(sent(rig, GameOpcode.CMSG_LFG_TELEPORT)).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("checks the LFG group before life, as the server does (LFGMgr.cpp:2236-2246)", async () => {
    const { rig } = build({ lfgGroup: false, health: 0 });
    try {
      expect(await rig.handle.act.teleport(true)).toMatchObject({
        reason: "not_in_lfg_group",
      });
    } finally {
      rig.dispose();
    }
  });

  test("force sends the request even when the group check would refuse", async () => {
    await withFakeTimers(async () => {
      const { rig } = build({ lfgGroup: false });
      try {
        const pending = rig.handle.act.teleport(false, { force: true });
        expect(sent(rig, GameOpcode.CMSG_LFG_TELEPORT)[0]?.body).toEqual(
          new Uint8Array([0]),
        );
        rig.inject(
          GameOpcode.SMSG_LFG_TELEPORT_DENIED,
          lfgTeleportDeniedBody(6),
        );
        expect(await pending).toEqual({
          status: "refused",
          reason: "invalid_location",
          code: 6,
        });
      } finally {
        rig.dispose();
      }
    });
  });

  test("settles ok on a map change", async () => {
    const { rig } = build();
    try {
      const pending = rig.handle.act.teleport(false);
      expect(sent(rig, GameOpcode.CMSG_LFG_TELEPORT)[0]?.body).toEqual(
        new Uint8Array([0]),
      );
      rig.stores.self.receive({ type: "new_world", position: DEADMINES });
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("teleport out sends 1", async () => {
    const { rig } = build();
    try {
      const pending = rig.handle.act.teleport(true);
      expect(sent(rig, GameOpcode.CMSG_LFG_TELEPORT)[0]?.body).toEqual(
        new Uint8Array([1]),
      );
      rig.stores.self.receive({ type: "new_world", position: DEADMINES });
      await pending;
    } finally {
      rig.dispose();
    }
  });

  test("settles refused with the denial code", async () => {
    const { rig } = build();
    try {
      const pending = rig.handle.act.teleport(false);
      rig.inject(GameOpcode.SMSG_LFG_TELEPORT_DENIED, lfgTeleportDeniedBody(2));
      expect(await pending).toEqual({
        status: "refused",
        reason: "falling",
        code: 2,
      });
    } finally {
      rig.dispose();
    }
  });

  test("settles no_answer after 10 s and frees the act", async () => {
    await withFakeTimers(async () => {
      const { rig } = build();
      try {
        const pending = rig.handle.act.teleport(true);
        await elapse(9990);
        rig.stores.self.receive({ type: "transfer_pending", mapId: 0 });
        await elapse(10);
        expect(await pending).toEqual({ status: "no_answer" });
        const again = rig.handle.act.teleport(true);
        rig.inject(
          GameOpcode.SMSG_LFG_TELEPORT_DENIED,
          lfgTeleportDeniedBody(8),
        );
        expect(await again).toMatchObject({ code: 8 });
      } finally {
        rig.dispose();
      }
    });
  });

  test("a map change after the act settled does not leak into the next act", async () => {
    const { rig } = build();
    try {
      const first = rig.handle.act.teleport(false);
      rig.stores.self.receive({ type: "new_world", position: DEADMINES });
      await first;
      const second = rig.handle.act.teleport(false);
      rig.inject(GameOpcode.SMSG_LFG_TELEPORT_DENIED, lfgTeleportDeniedBody(1));
      expect(await second).toMatchObject({ status: "refused", code: 1 });
    } finally {
      rig.dispose();
    }
  });
});

describe("lfg voteKick", () => {
  test("refuses no_vote with no send", async () => {
    const { rig } = build();
    try {
      expect(await rig.handle.act.voteKick(true)).toEqual({
        status: "refused",
        reason: "no_vote",
      });
      expect(sent(rig, GameOpcode.CMSG_LFG_SET_BOOT_VOTE)).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("refuses already_voted with no send once this player has voted", async () => {
    const { rig } = build();
    try {
      rig.inject(GameOpcode.SMSG_LFG_BOOT_PROPOSAL_UPDATE, boot(true, true));
      expect(await rig.handle.act.voteKick(true)).toEqual({
        status: "refused",
        reason: "already_voted",
      });
      expect(sent(rig, GameOpcode.CMSG_LFG_SET_BOOT_VOTE)).toHaveLength(0);
    } finally {
      rig.dispose();
    }
  });

  test("sends the vote and settles on the next boot update", async () => {
    const { rig } = build();
    try {
      rig.inject(GameOpcode.SMSG_LFG_BOOT_PROPOSAL_UPDATE, boot(true));
      const pending = rig.handle.act.voteKick(false);
      expect(sent(rig, GameOpcode.CMSG_LFG_SET_BOOT_VOTE)[0]?.body).toEqual(
        new Uint8Array([0]),
      );
      rig.inject(GameOpcode.SMSG_LFG_BOOT_PROPOSAL_UPDATE, boot(true, true));
      expect(await pending).toEqual({ status: "ok" });
    } finally {
      rig.dispose();
    }
  });

  test("a vote that ends the boot settles ok and a later vote is refused", async () => {
    const { rig } = build();
    try {
      rig.inject(GameOpcode.SMSG_LFG_BOOT_PROPOSAL_UPDATE, boot(true));
      const pending = rig.handle.act.voteKick(true);
      expect(sent(rig, GameOpcode.CMSG_LFG_SET_BOOT_VOTE)[0]?.body).toEqual(
        new Uint8Array([1]),
      );
      rig.inject(GameOpcode.SMSG_LFG_BOOT_PROPOSAL_UPDATE, boot(false));
      expect(await pending).toEqual({ status: "ok" });
      expect(await rig.handle.act.voteKick(true)).toMatchObject({
        reason: "no_vote",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a non-decisive vote with no update settles ok after the window", async () => {
    await withFakeTimers(async () => {
      const { rig } = build();
      try {
        rig.inject(GameOpcode.SMSG_LFG_BOOT_PROPOSAL_UPDATE, boot(true));
        const pending = rig.handle.act.voteKick(true);
        await elapse(5000);
        expect(await pending).toEqual({ status: "ok" });
        expect(sent(rig, GameOpcode.CMSG_LFG_SET_BOOT_VOTE)).toHaveLength(1);
      } finally {
        rig.dispose();
      }
    });
  });
});
