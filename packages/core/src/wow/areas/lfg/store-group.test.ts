import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  lfgBootBody,
  lfgOfferContinueBody,
  lfgProposalBody,
  lfgRewardBody,
  lfgTeleportDeniedBody,
} from "#test-support/areas/lfg";
import { areaStubs } from "#wow/areas/compose";
import type { LfgEvent } from "#wow/areas/lfg/store";
import type { LfgTeleportReason } from "#wow/areas/lfg/views";
import { GameOpcode } from "#wow/protocol/opcodes";

function setup(now: { at: number } = { at: 1000 }) {
  const rig = areaRig("lfg", { now: () => now.at });
  const seen: LfgEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen, now };
}

const PLAYERS = [
  { role: 2, self: true },
  { role: 8, answered: true, accepted: true },
];

function proposal(state: number, id = 5) {
  return lfgProposalBody({
    dungeon: 0x06_00_00_02,
    state,
    id,
    encounters: 3,
    players: PLAYERS,
  });
}

describe("LfgStore proposal", () => {
  test("state 0 sets the proposal with a deadline 40 s after arrival and emits proposal", () => {
    const { rig, seen } = setup({ at: 1000 });
    try {
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0));
      expect(rig.handle.state().proposal).toEqual({
        id: 5,
        dungeon: 0x06_00_00_02,
        state: 0,
        encounters: 3,
        silent: false,
        players: [
          {
            role: 2,
            self: true,
            inDungeon: false,
            sameGroup: false,
            answered: false,
            accepted: false,
          },
          {
            role: 8,
            self: false,
            inDungeon: false,
            sameGroup: false,
            answered: true,
            accepted: true,
          },
        ],
        at: 1000,
        deadline: 41_000,
      });
      expect(seen).toEqual([
        { type: "proposal", id: 5, dungeon: 0x06_00_00_02, state: 0 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a later state 0 update for the same id keeps the original deadline", () => {
    const now = { at: 1000 };
    const { rig } = setup(now);
    try {
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0));
      now.at = 9000;
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0));
      expect(rig.handle.state().proposal?.deadline).toBe(41_000);
      expect(rig.handle.state().proposal?.at).toBe(9000);
    } finally {
      rig.dispose();
    }
  });

  test("a new proposal id restarts the deadline", () => {
    const now = { at: 1000 };
    const { rig } = setup(now);
    try {
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0, 5));
      now.at = 9000;
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0, 6));
      expect(rig.handle.state().proposal?.deadline).toBe(49_000);
    } finally {
      rig.dispose();
    }
  });

  test.each([1, 2])(
    "state %i ends the proposal and still emits proposal",
    (state) => {
      const { rig, seen } = setup();
      try {
        rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0));
        rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(state));
        expect(rig.handle.state().proposal).toBeUndefined();
        expect(seen.at(-1)).toEqual({
          type: "proposal",
          id: 5,
          dungeon: 0x06_00_00_02,
          state,
        });
      } finally {
        rig.dispose();
      }
    },
  );

  test("the SMSG_LFG_PROPOSAL_UPDATE stub pair is gone from areaStubs", () => {
    expect(areaStubs().some(([, label]) => label === "LFG proposal")).toBe(
      false,
    );
  });
});

describe("LfgStore boot vote", () => {
  test("an update in progress sets the boot with a deadline from the time left", () => {
    const { rig, seen } = setup({ at: 2000 });
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_BOOT_PROPOSAL_UPDATE,
        lfgBootBody({
          inProgress: true,
          victim: 0xabn,
          votes: 1,
          agrees: 1,
          didVote: true,
          agree: true,
          timeLeft: 120,
          reason: "afk",
        }),
      );
      expect(rig.handle.state().boot).toEqual({
        victim: 0xabn,
        didVote: true,
        agree: true,
        votes: 1,
        agrees: 1,
        needed: 3,
        reason: "afk",
        deadline: 122_000,
      });
      expect(seen).toEqual([
        {
          type: "boot",
          inProgress: true,
          victim: 0xabn,
          votes: 1,
          agrees: 1,
          needed: 3,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("an update that is not in progress ends the vote", () => {
    const { rig, seen } = setup();
    try {
      const vote = { victim: 0xabn, timeLeft: 100, reason: "afk" };
      rig.inject(
        GameOpcode.SMSG_LFG_BOOT_PROPOSAL_UPDATE,
        lfgBootBody({ inProgress: true, ...vote }),
      );
      rig.inject(
        GameOpcode.SMSG_LFG_BOOT_PROPOSAL_UPDATE,
        lfgBootBody({ inProgress: false, votes: 3, agrees: 3, ...vote }),
      );
      expect(rig.handle.state().boot).toBeUndefined();
      expect(seen.at(-1)).toMatchObject({
        type: "boot",
        inProgress: false,
        agrees: 3,
      });
    } finally {
      rig.dispose();
    }
  });
});

describe("LfgStore teleport, offer and reward", () => {
  test.each<[number, LfgTeleportReason]>([
    [1, "dead"],
    [2, "falling"],
    [3, "in_vehicle"],
    [4, "fatigue"],
    [6, "invalid_location"],
    [8, "combat"],
    [7, "unknown"],
  ])("teleport denied %i is %s", (code, reason) => {
    const { rig, seen } = setup({ at: 55 });
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_TELEPORT_DENIED,
        lfgTeleportDeniedBody(code),
      );
      expect(rig.handle.state().teleportDenied).toEqual({
        code,
        reason,
        at: 55,
      });
      expect(seen).toEqual([{ type: "teleport_denied", code, reason }]);
    } finally {
      rig.dispose();
    }
  });

  test("offer continue records the dungeon entry", () => {
    const { rig, seen } = setup({ at: 66 });
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_OFFER_CONTINUE,
        lfgOfferContinueBody(0x01_00_00_10),
      );
      expect(rig.handle.state().offerContinue).toEqual({
        entry: 0x01_00_00_10,
        at: 66,
      });
      expect(seen).toEqual([{ type: "offer_continue", entry: 0x01_00_00_10 }]);
    } finally {
      rig.dispose();
    }
  });

  test("a reward records money, xp and items", () => {
    const { rig, seen } = setup({ at: 77 });
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_PLAYER_REWARD,
        lfgRewardBody({
          randomDungeon: 0x06_00_00_02,
          dungeon: 0x01_00_00_10,
          done: true,
          money: 999,
          xp: 1500,
          items: [{ itemId: 47_241, displayId: 1, count: 2 }],
        }),
      );
      expect(rig.handle.state().reward).toEqual({
        randomDungeon: 0x06_00_00_02,
        dungeon: 0x01_00_00_10,
        done: true,
        money: 999,
        xp: 1500,
        items: [{ itemId: 47_241, displayId: 1, count: 2 }],
        at: 77,
      });
      expect(seen).toEqual([
        {
          type: "reward",
          randomDungeon: 0x06_00_00_02,
          dungeon: 0x01_00_00_10,
          money: 999,
          xp: 1500,
          itemCount: 1,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("each snapshot copies the proposal players", () => {
    const { rig } = setup();
    try {
      rig.inject(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, proposal(0));
      const first = rig.handle.state().proposal?.players;
      const second = rig.handle.state().proposal?.players;
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
      expect(first?.[0]).not.toBe(second?.[0]);
    } finally {
      rig.dispose();
    }
  });
});
