import { describe, expect, test } from "bun:test";
import {
  instancesDifficultyBody,
  instancesInstanceDifficultyBody,
  instancesLastInstanceBody,
  instancesLockWarningBody,
  instancesOwnershipBody,
  instancesRaidGroupOnlyBody,
  instancesRaidInstanceInfoBody,
  instancesRaidInstanceMessageBody,
} from "#test-support/areas/instances";
import {
  buildLockResponse,
  buildRequestRaidInfo,
  buildSetLockoutExtended,
  parseDifficulty,
  parseInstanceDifficulty,
  parseInstanceOwnership,
  parseLastInstance,
  parseLockWarning,
  parseRaidGroupOnly,
  parseRaidInstanceInfo,
  parseRaidInstanceMessage,
} from "#wow/areas/instances/protocol";
import { PacketReader } from "#wow/protocol/packet";

const reader = (body: Uint8Array) => new PacketReader(body);

describe("instances protocol", () => {
  test("MSG_SET_*_DIFFICULTY server form skips the constant u32 (InstancePackets.cpp:35-42,56-63)", () => {
    const solo = reader(
      instancesDifficultyBody({ difficulty: 1, inGroup: false }),
    );
    expect(parseDifficulty(solo)).toEqual({ difficulty: 1, inGroup: false });
    expect(solo.remaining).toBe(0);
    const group = reader(
      instancesDifficultyBody({ difficulty: 3, inGroup: true }),
    );
    expect(parseDifficulty(group)).toEqual({ difficulty: 3, inGroup: true });
    expect(group.remaining).toBe(0);
  });

  test("SMSG_INSTANCE_DIFFICULTY reads the difficulty and the dynamic flag (Player.cpp:11788-11792)", () => {
    const r = reader(
      instancesInstanceDifficultyBody({ difficulty: 1, dynamicHeroic: true }),
    );
    expect(parseInstanceDifficulty(r)).toEqual({
      difficulty: 1,
      dynamicHeroic: true,
    });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_UPDATE_INSTANCE_OWNERSHIP and SMSG_UPDATE_LAST_INSTANCE read one u32 (PlayerStorage.cpp:6782-6798)", () => {
    expect(
      parseInstanceOwnership(reader(instancesOwnershipBody(true))),
    ).toEqual({
      hasBinds: true,
    });
    expect(
      parseInstanceOwnership(reader(instancesOwnershipBody(false))),
    ).toEqual({
      hasBinds: false,
    });
    expect(parseLastInstance(reader(instancesLastInstanceBody(36)))).toEqual({
      mapId: 36,
    });
  });

  test("SMSG_RAID_INSTANCE_MESSAGE kind 4 ends with locked and extended, which wowm raid/smsg_raid_instance_message.wowm lacks; AzerothCore wins (Player.cpp:11975-12008)", () => {
    const r = reader(
      instancesRaidInstanceMessageBody({
        kind: 4,
        mapId: 533,
        difficulty: 1,
        secondsLeft: 86_400,
        locked: true,
        extended: false,
      }),
    );
    expect(parseRaidInstanceMessage(r)).toEqual({
      kind: 4,
      mapId: 533,
      difficulty: 1,
      secondsLeft: 86_400,
      locked: true,
      extended: false,
    });
    expect(r.remaining).toBe(0);
  });

  test("SMSG_RAID_INSTANCE_MESSAGE kinds 1-3 and 5 have no tail", () => {
    for (const kind of [1, 2, 3, 5]) {
      const r = reader(
        instancesRaidInstanceMessageBody({
          kind,
          mapId: 36,
          difficulty: 0,
          secondsLeft: 600,
        }),
      );
      expect(parseRaidInstanceMessage(r)).toEqual({
        kind,
        mapId: 36,
        difficulty: 0,
        secondsLeft: 600,
        locked: undefined,
        extended: undefined,
      });
      expect(r.remaining).toBe(0);
    }
  });

  test("SMSG_RAID_GROUP_ONLY returns raw numbers and accepts code 0, which wowm social/smsg_raid_group_only.wowm lacks (PlayerUpdates.cpp:1429-1455)", () => {
    expect(
      parseRaidGroupOnly(
        reader(instancesRaidGroupOnlyBody({ timerMs: 60_000, code: 1 })),
      ),
    ).toEqual({ timerMs: 60_000, code: 1 });
    const hide = reader(instancesRaidGroupOnlyBody({ timerMs: 0, code: 0 }));
    expect(parseRaidGroupOnly(hide)).toEqual({ timerMs: 0, code: 0 });
    expect(hide.remaining).toBe(0);
  });

  test("SMSG_RAID_INSTANCE_INFO reads an empty list", () => {
    const r = reader(instancesRaidInstanceInfoBody([]));
    expect(parseRaidInstanceInfo(r)).toEqual([]);
    expect(r.remaining).toBe(0);
  });

  test("SMSG_RAID_INSTANCE_INFO reads two locks; the fifth field is locked, which wowm raid/smsg_raid_instance_info.wowm calls expired (PlayerStorage.cpp:6726-6758)", () => {
    const r = reader(
      instancesRaidInstanceInfoBody([
        {
          mapId: 631,
          difficulty: 3,
          instanceGuid: 0x1f50_0000_0000_0007n,
          extended: false,
          secondsToReset: 86_400,
        },
        {
          mapId: 533,
          difficulty: 1,
          instanceGuid: 0x1f50_0000_0000_0009n,
          extended: true,
          secondsToReset: 0,
        },
      ]),
    );
    expect(parseRaidInstanceInfo(r)).toEqual([
      {
        mapId: 631,
        difficulty: 3,
        instanceGuid: 0x1f50_0000_0000_0007n,
        locked: true,
        extended: false,
        secondsToReset: 86_400,
      },
      {
        mapId: 533,
        difficulty: 1,
        instanceGuid: 0x1f50_0000_0000_0009n,
        locked: true,
        extended: true,
        secondsToReset: 0,
      },
    ]);
    expect(r.remaining).toBe(0);
  });

  test("SMSG_INSTANCE_LOCK_WARNING_QUERY reads the timeout, the encounter mask and the trailing byte (Map.cpp:2131-2139)", () => {
    const r = reader(
      instancesLockWarningBody({ timeoutMs: 60_000, encounterMask: 5 }),
    );
    expect(parseLockWarning(r)).toEqual({
      timeoutMs: 60_000,
      encounterMask: 5,
    });
    expect(r.remaining).toBe(0);
  });

  test("CMSG_REQUEST_RAID_INFO has an empty body (GroupHandler.cpp:1137-1141)", () => {
    expect(buildRequestRaidInfo()).toEqual(new Uint8Array());
  });

  test("CMSG_INSTANCE_LOCK_RESPONSE is one byte (InstancePackets.cpp:70-73)", () => {
    expect(buildLockResponse(true)).toEqual(new Uint8Array([1]));
    expect(buildLockResponse(false)).toEqual(new Uint8Array([0]));
  });

  test("CMSG_SET_SAVED_INSTANCE_EXTEND is u32 map, u32 difficulty, u8 flag; wowm raid/cmsg_set_saved_instance_extend.wowm makes the difficulty a u8, AzerothCore wins (CalendarHandler.cpp:793-817)", () => {
    const body = buildSetLockoutExtended({
      mapId: 631,
      difficulty: 1,
      extended: true,
    });
    expect(body.length).toBe(9);
    const r = reader(body);
    expect([r.uint32LE(), r.uint32LE(), r.uint8()]).toEqual([631, 1, 1]);
  });
});
