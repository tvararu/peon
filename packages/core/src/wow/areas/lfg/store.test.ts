import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  lfgJoinResultBody,
  lfgPartyInfoBody,
  lfgPlayerInfoBody,
  lfgQueueStatusBody,
  lfgRoleCheckUpdateBody,
  lfgRoleChosenBody,
  lfgUpdatePlayerBody,
  lfgUpdateSearchBody,
} from "#test-support/areas/lfg";

import type { LfgEvent } from "#wow/areas/lfg/store";
import { GameOpcode } from "#wow/protocol/opcodes";

function setup() {
  const rig = areaRig("lfg", { now: () => 7 });
  const seen: LfgEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

describe("LfgStore", () => {
  test("starts with no status, selection or dungeons", () => {
    const { rig } = setup();
    try {
      expect(rig.handle.state()).toEqual({
        status: "none",
        selected: [],
        comment: "",
        searching: false,
        available: [],
        locks: [],
        locksAt: undefined,
        partyLocks: [],
        partyLocksAt: undefined,
        joinResult: undefined,
        queue: undefined,
        roleCheck: undefined,
        proposal: undefined,
        boot: undefined,
        teleportDenied: undefined,
        offerContinue: undefined,
        reward: undefined,
        raidLists: {},
      });
    } finally {
      rig.dispose();
    }
  });

  test("type 5 sets queued, selected and comment with a status event", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_UPDATE_PLAYER,
        lfgUpdatePlayerBody({
          updateType: 5,
          data: { queued: true, dungeons: [0x01_00_00_12], comment: "heal" },
        }),
      );
      expect(rig.handle.state()).toMatchObject({
        status: "queued",
        selected: [0x01_00_00_12],
        comment: "heal",
      });
      expect(seen).toEqual([
        {
          type: "status",
          status: "queued",
          previous: "none",
          source: "player",
          updateType: 5,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("type 7 clears the queue", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_UPDATE_PLAYER,
        lfgUpdatePlayerBody({
          updateType: 5,
          data: { queued: true, dungeons: [1] },
        }),
      );
      rig.inject(
        GameOpcode.SMSG_LFG_UPDATE_PLAYER,
        lfgUpdatePlayerBody({ updateType: 7 }),
      );
      expect(rig.handle.state()).toMatchObject({
        status: "none",
        selected: [],
      });
      expect(seen.at(-1)).toEqual({
        type: "status",
        status: "none",
        previous: "queued",
        source: "player",
        updateType: 7,
      });
    } finally {
      rig.dispose();
    }
  });

  test("type 12 queues while type 9 clears", () => {
    const { rig } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_UPDATE_PLAYER,
        lfgUpdatePlayerBody({
          updateType: 12,
          data: { queued: true, dungeons: [1] },
        }),
      );
      expect(rig.handle.state().status).toBe("queued");
      rig.inject(
        GameOpcode.SMSG_LFG_UPDATE_PLAYER,
        lfgUpdatePlayerBody({ updateType: 9 }),
      );
      expect(rig.handle.state().status).toBe("none");
    } finally {
      rig.dispose();
    }
  });

  test("unknown types keep the status and still emit", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_UPDATE_PLAYER,
        lfgUpdatePlayerBody({ updateType: 1 }),
      );
      expect(rig.handle.state().status).toBe("none");
      expect(seen).toEqual([
        {
          type: "status",
          status: "none",
          previous: "none",
          source: "player",
          updateType: 1,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("player info stores rewards and locks with the arrival time", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_PLAYER_INFO,
        lfgPlayerInfoBody({
          random: [{ entry: 0x01_00_00_12 }],
          locks: [{ entry: 0x01_00_00_12, status: 2 }],
        }),
      );
      const state = rig.handle.state();
      expect(state.available).toEqual([{ entry: 0x01_00_00_12, id: 18 }]);
      expect(state.locks).toEqual([
        {
          entry: 0x01_00_00_12,
          id: 18,
          type: 1,
          status: 2,
          reason: "too_low_level",
        },
      ]);
      expect(state.locksAt).toBe(7);
      expect(seen).toEqual([{ type: "dungeons", scope: "player" }]);
    } finally {
      rig.dispose();
    }
  });

  test("party info stores locks per member with party scope", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_PARTY_INFO,
        lfgPartyInfoBody([
          { guid: 0xden, locks: [{ entry: 0x01_00_00_12, status: 6 }] },
        ]),
      );
      const state = rig.handle.state();
      expect(state.partyLocks).toEqual([
        {
          guid: 0xden,
          locks: [
            {
              entry: 0x01_00_00_12,
              id: 18,
              type: 1,
              status: 6,
              reason: "raid_locked",
            },
          ],
        },
      ]);
      expect(state.partyLocksAt).toBe(7);
      expect(seen).toEqual([{ type: "dungeons", scope: "party" }]);
    } finally {
      rig.dispose();
    }
  });

  test("the search flag flips searching and emits a search status", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(GameOpcode.SMSG_LFG_UPDATE_SEARCH, lfgUpdateSearchBody(true));
      expect(rig.handle.state().searching).toBe(true);
      expect(seen.at(-1)).toMatchObject({ type: "status", source: "search" });
    } finally {
      rig.dispose();
    }
  });

  test("a bare join result names the ok reason and emits join_result (LFGMgr.h:100-121)", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_JOIN_RESULT,
        lfgJoinResultBody({ result: 0, state: 0 }),
      );
      expect(rig.handle.state().joinResult).toEqual({
        result: 0,
        state: 0,
        reason: "ok",
        partyLocks: [],
      });
      expect(seen).toEqual([
        { type: "join_result", result: 0, state: 0, reason: "ok" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a locked join result names the party reason and keeps the locks", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_JOIN_RESULT,
        lfgJoinResultBody({
          result: 6,
          state: 3,
          partyLocks: [
            { guid: 0xden, locks: [{ entry: 0x01_00_00_12, status: 2 }] },
          ],
        }),
      );
      const join = rig.handle.state().joinResult;
      expect(join?.reason).toBe("party_not_meet_reqs");
      expect(join?.partyLocks).toEqual([
        {
          guid: 0xden,
          locks: [
            {
              entry: 0x01_00_00_12,
              id: 18,
              type: 1,
              status: 2,
              reason: "too_low_level",
            },
          ],
        },
      ]);
      expect(seen).toEqual([
        {
          type: "join_result",
          result: 6,
          state: 3,
          reason: "party_not_meet_reqs",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a queue status sets queue and emits queue", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_QUEUE_STATUS,
        lfgQueueStatusBody({
          dungeon: 0x01_00_00_12,
          wait: 61,
          tanks: 1,
          queuedTime: 12,
        }),
      );
      expect(rig.handle.state().queue).toMatchObject({
        dungeon: 0x01_00_00_12,
        wait: 61,
        tanks: 1,
        queuedTime: 12,
      });
      expect(seen).toEqual([
        { type: "queue", dungeon: 0x01_00_00_12, queuedTime: 12 },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a role check update names the initializing state and emits role_check (LFGMgr.h:123-132)", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_ROLE_CHECK_UPDATE,
        lfgRoleCheckUpdateBody({
          state: 2,
          dungeons: [0x01_00_00_12],
          members: [{ guid: 0xan, roles: 8, level: 20 }],
        }),
      );
      expect(rig.handle.state().roleCheck).toMatchObject({
        state: 2,
        stateName: "initializing",
        ready: [0xan],
        pending: [],
      });
      expect(seen).toEqual([
        { type: "role_check", state: 2, stateName: "initializing" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a role chosen moves the member to ready and emits role_chosen", () => {
    const { rig, seen } = setup();
    try {
      rig.inject(
        GameOpcode.SMSG_LFG_ROLE_CHECK_UPDATE,
        lfgRoleCheckUpdateBody({
          state: 2,
          dungeons: [],
          members: [{ guid: 0xan, roles: 0, level: 20 }],
        }),
      );
      rig.inject(
        GameOpcode.SMSG_LFG_ROLE_CHOSEN,
        lfgRoleChosenBody({ guid: 0xan, roles: 2 }),
      );
      expect(rig.handle.state().roleCheck).toMatchObject({
        ready: [0xan],
        pending: [],
      });
      expect(seen.at(-1)).toEqual({
        type: "role_chosen",
        guid: 0xan,
        roles: 2,
        ready: true,
      });
    } finally {
      rig.dispose();
    }
  });
});
