import { describe, expect, test } from "bun:test";
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
import {
  buildKeepAlive,
  buildLogoutCancel,
  buildPlayerLogout,
  parseAccountDataTimes,
  parseAddonInfo,
  parseCharacterLoginFailed,
  parseClientCacheVersion,
  parseFeatureSystemStatus,
  parseLearnedDanceMoves,
  parsePong,
  parseTutorialFlags,
} from "#wow/areas/login/protocol";
import { PacketReader } from "#wow/protocol/packet";

const keyed = (n: number) => Array.from({ length: n }, () => ({ usePk: true }));
const plain = (n: number) =>
  Array.from({ length: n }, () => ({ usePk: false }));

describe("SMSG_ADDON_INFO (WorldSession.cpp:1352-1414)", () => {
  test("reads 23 entries, 19 keyed, and ends at the body's end", () => {
    const body = loginAddonInfoBody({
      banned: [],
      entries: [...keyed(10), ...plain(4), ...keyed(9)],
    });
    const r = new PacketReader(body);
    const info = parseAddonInfo(r);
    expect(info.addons).toHaveLength(23);
    expect(info.addons.filter((a) => a.keyed)).toHaveLength(19);
    expect(info.addons.every((a) => a.state === 2)).toBe(true);
    expect(info.banned).toEqual([]);
    expect(r.remaining).toBe(0);
  });

  test("an unkeyed entry is 8 bytes and a keyed entry 264 (WorldSession.cpp:1380-1396)", () => {
    expect(loginAddonInfoBody({ banned: [], entries: plain(1) })).toHaveLength(
      12,
    );
    expect(loginAddonInfoBody({ banned: [], entries: keyed(1) })).toHaveLength(
      268,
    );
  });

  test("a 4-byte body holds no addon", () => {
    const body = loginAddonInfoBody({ banned: [], entries: [] });
    expect(body).toHaveLength(4);
    expect(parseAddonInfo(new PacketReader(body))).toEqual({
      addons: [],
      banned: [],
    });
  });

  test("reads the banned list after the entries (WorldSession.cpp:1407-1414)", () => {
    const body = loginAddonInfoBody({
      banned: [
        { id: 7, timestamp: 1_700_000_000 },
        { id: 9, timestamp: 1_700_000_100 },
      ],
      entries: plain(2),
    });
    const r = new PacketReader(body);
    expect(parseAddonInfo(r).banned).toEqual([{ id: 7 }, { id: 9 }]);
    expect(r.remaining).toBe(0);
  });

  test("a body that is neither an entry nor a valid banned count throws", () => {
    const body = Uint8Array.from([0x03, 0x01, 0x00, 0x00, 0x00, 0x00]);
    expect(() => parseAddonInfo(new PacketReader(body))).toThrow();
    const short = loginAddonInfoBody({ banned: [], entries: keyed(1) });
    expect(() =>
      parseAddonInfo(new PacketReader(short.subarray(0, 100))),
    ).toThrow();
  });
});

describe("SMSG_ACCOUNT_DATA_TIMES (WorldSession.cpp:1057-1066)", () => {
  test("mask 0xEA gives one time per set bit, in bit order", () => {
    const body = loginAccountDataTimesBody({
      mask: 0xea,
      serverTime: 1_790_000_000,
      times: [11, 33, 55, 66, 77],
    });
    expect(parseAccountDataTimes(new PacketReader(body))).toEqual({
      mask: 0xea,
      serverTime: 1_790_000_000,
      times: [
        [1, 11],
        [3, 33],
        [5, 55],
        [6, 66],
        [7, 77],
      ],
    });
  });

  test("mask 0x15 gives three times", () => {
    const body = loginAccountDataTimesBody({
      mask: 0x15,
      serverTime: 5,
      times: [0, 2, 4],
    });
    expect(parseAccountDataTimes(new PacketReader(body)).times).toEqual([
      [0, 0],
      [2, 2],
      [4, 4],
    ]);
  });
});

describe("the fixed login bodies", () => {
  test("SMSG_TUTORIAL_FLAGS reads eight u32 (WorldSession.cpp:1084-1090)", () => {
    const flags = [1, 2, 3, 0xff_ff_ff_ff, 0, 0, 7, 8];
    expect(
      parseTutorialFlags(new PacketReader(loginTutorialFlagsBody({ flags }))),
    ).toEqual({ flags });
  });

  test("SMSG_CLIENTCACHE_VERSION reads the version (AuthHandler.cpp:56-61)", () => {
    const body = loginClientCacheVersionBody({ version: 3 });
    expect(parseClientCacheVersion(new PacketReader(body))).toEqual({
      version: 3,
    });
  });

  test("SMSG_FEATURE_SYSTEM_STATUS reads complaints and voice (CharacterHandler.cpp:836-839)", () => {
    const body = loginFeatureSystemStatusBody({ complaints: 2, voice: 0 });
    expect(parseFeatureSystemStatus(new PacketReader(body))).toEqual({
      complaints: 2,
      voice: 0,
    });
  });

  test("SMSG_LEARNED_DANCE_MOVES reads two u32 (CharacterHandler.cpp:882-885)", () => {
    expect(
      parseLearnedDanceMoves(new PacketReader(loginLearnedDanceMovesBody())),
    ).toEqual({ moves: [0, 0] });
  });

  test("a short body throws", () => {
    expect(() =>
      parseTutorialFlags(new PacketReader(new Uint8Array(28))),
    ).toThrow();
    expect(() =>
      parseFeatureSystemStatus(new PacketReader(new Uint8Array(1))),
    ).toThrow();
  });
});

describe("link packets", () => {
  test("SMSG_PONG echoes the ping sequence as one u32 (WorldSocket.cpp:799-801)", () => {
    const r = new PacketReader(loginPongBody({ seq: 0x01_02_03_04 }));
    expect(parsePong(r)).toEqual({ seq: 0x01_02_03_04 });
    expect(r.remaining).toBe(0);
  });

  test("a short SMSG_PONG throws", () => {
    expect(() => parsePong(new PacketReader(new Uint8Array(3)))).toThrow();
  });

  test("CMSG_KEEP_ALIVE is empty (WorldSocket.cpp:452-462)", () => {
    expect(buildKeepAlive()).toEqual(new Uint8Array(0));
  });
});

describe("login failure and logout packets", () => {
  test("SMSG_CHARACTER_LOGIN_FAILED names each LoginFailureReason (CharacterHandler.cpp:2622-2627, SharedDefines.h:4001-4012)", () => {
    const names = Array.from({ length: 9 }, (_, code) => {
      const r = new PacketReader(loginCharacterLoginFailedBody({ code }));
      const parsed = parseCharacterLoginFailed(r);
      expect(r.remaining).toBe(0);
      return parsed;
    });
    expect(names).toEqual([
      { code: 0, reason: "failed" },
      { code: 1, reason: "no_world" },
      { code: 2, reason: "duplicate_character" },
      { code: 3, reason: "no_instances" },
      { code: 4, reason: "disabled" },
      { code: 5, reason: "no_character" },
      { code: 6, reason: "locked_for_transfer" },
      { code: 7, reason: "locked_by_billing" },
      { code: 8, reason: "using_remote" },
    ]);
  });

  test("an unknown login failure code reads as unknown", () => {
    const r = new PacketReader(loginCharacterLoginFailedBody({ code: 12 }));
    expect(parseCharacterLoginFailed(r)).toEqual({
      code: 12,
      reason: "unknown",
    });
  });

  test("CMSG_PLAYER_LOGOUT and CMSG_LOGOUT_CANCEL are empty (MiscHandler.cpp:476-497)", () => {
    expect(buildPlayerLogout()).toEqual(new Uint8Array(0));
    expect(buildLogoutCancel()).toEqual(new Uint8Array(0));
  });
});
