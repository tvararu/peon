import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  loginAccountDataTimesBody,
  loginAddonInfoBody,
  loginCharacterLoginFailedBody,
  loginClientCacheVersionBody,
  loginFeatureSystemStatusBody,
  loginLearnedDanceMovesBody,
  loginPongBody,
  loginTutorialFlagsBody,
} from "#test-support/areas/login";
import { GameOpcode } from "#wow/protocol/opcodes";

const FLAGS = [0xff_ff_ff_ff, 0x3, 0, 0, 0, 0, 0, 0];

describe("login area wiring", () => {
  test("the server's login order fills the state and fires login_noise once", () => {
    const rig = areaRig("login");
    try {
      const seen: unknown[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.inject(
        GameOpcode.SMSG_ADDON_INFO,
        loginAddonInfoBody({
          banned: [],
          entries: [{ usePk: true }, { usePk: false }],
        }),
      );
      rig.inject(
        GameOpcode.SMSG_CLIENTCACHE_VERSION,
        loginClientCacheVersionBody({ version: 3 }),
      );
      rig.inject(
        GameOpcode.SMSG_TUTORIAL_FLAGS,
        loginTutorialFlagsBody({ flags: FLAGS }),
      );
      rig.inject(
        GameOpcode.SMSG_ACCOUNT_DATA_TIMES,
        loginAccountDataTimesBody({
          mask: 0xea,
          serverTime: 1_790_000_000,
          times: [1, 3, 5, 6, 7],
        }),
      );
      rig.inject(
        GameOpcode.SMSG_FEATURE_SYSTEM_STATUS,
        loginFeatureSystemStatusBody({ complaints: 2, voice: 0 }),
      );
      rig.inject(
        GameOpcode.SMSG_LEARNED_DANCE_MOVES,
        loginLearnedDanceMovesBody(),
      );
      rig.inject(
        GameOpcode.SMSG_LEARNED_DANCE_MOVES,
        loginLearnedDanceMovesBody(),
      );
      expect(rig.handle.state()).toEqual({
        accountDataTimes: {
          mask: 0xea,
          serverTime: 1_790_000_000,
          times: [
            [1, 1],
            [3, 3],
            [5, 5],
            [6, 6],
            [7, 7],
          ],
        },
        addons: { banned: 0, count: 2, keyed: 1 },
        cacheVersion: 3,
        danceMoves: [0, 0],
        features: { complaints: 2, voice: 0 },
        link: { lastPongAt: undefined, lastSeq: 0, rttMs: undefined },
        tutorials: FLAGS,
      });
      expect(seen).toEqual([
        { mask: 0xea, type: "account_data_times" },
        {
          addons: 2,
          cacheVersion: 3,
          complaints: 2,
          keyed: 1,
          type: "login_noise",
          voice: 0,
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_PONG answers the pending ping and emits pong", () => {
    const rig = areaRig("login", { now: () => 1030 });
    try {
      const seen: unknown[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.stores.areas.login.nextPing(1000);
      rig.inject(GameOpcode.SMSG_PONG, loginPongBody({ seq: 1 }));
      expect(rig.handle.state().link).toEqual({
        lastPongAt: 1030,
        lastSeq: 1,
        rttMs: 30,
      });
      expect(seen).toEqual([{ rttMs: 30, seq: 1, type: "pong" }]);
    } finally {
      rig.dispose();
    }
  });

  test("SMSG_CHARACTER_LOGIN_FAILED and SMSG_LOGOUT_CANCEL_ACK reach the store as events", () => {
    const rig = areaRig("login");
    try {
      const seen: unknown[] = [];
      rig.handle.onEvent((event) => seen.push(event));
      rig.inject(
        GameOpcode.SMSG_CHARACTER_LOGIN_FAILED,
        loginCharacterLoginFailedBody({ code: 5 }),
      );
      rig.inject(GameOpcode.SMSG_LOGOUT_CANCEL_ACK, new Uint8Array(0));
      expect(seen).toEqual([
        { code: 5, reason: "no_character", type: "login_failed" },
        { type: "logout_cancelled" },
      ]);
    } finally {
      rig.dispose();
    }
  });
});
