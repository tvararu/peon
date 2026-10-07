import { describe, expect, test } from "bun:test";
import {
  wintergraspBuildingDamageBody,
  wintergraspEjectedBody,
  wintergraspEnteredBody,
  wintergraspEntryInviteBody,
  wintergraspQueueInviteBody,
  wintergraspQueueResponseBody,
} from "#test-support/areas/wintergrasp";
import {
  buildEntryInviteResponse,
  buildExitRequest,
  buildQueueInviteResponse,
  parseBuildingDamage,
  parseEjected,
  parseEntered,
  parseEntryInvite,
  parseQueueInvite,
  parseQueueResponse,
} from "#wow/areas/wintergrasp/protocol";
import { PacketReader } from "#wow/protocol/packet";

describe("wintergrasp protocol", () => {
  test("entry invite keeps the absolute expiry", () => {
    const body = wintergraspEntryInviteBody({
      battleId: 1,
      expiry: 1_791_000_020,
      zone: 4197,
    });
    expect(parseEntryInvite(new PacketReader(body))).toEqual({
      battleId: 1,
      expiresAt: 1_791_000_020,
      zone: 4197,
    });
  });

  test("queue invite reads the warmup byte", () => {
    const body = wintergraspQueueInviteBody({ battleId: 1, warmup: true });
    expect(parseQueueInvite(new PacketReader(body))).toEqual({
      battleId: 1,
      warmup: true,
    });
  });

  test("queue response reads the not-full byte as inverted", () => {
    const queued = wintergraspQueueResponseBody({
      battleId: 1,
      canQueue: true,
      full: false,
      zone: 4197,
    });
    expect(parseQueueResponse(new PacketReader(queued))).toEqual({
      battleId: 1,
      full: false,
      queued: true,
      warmup: true,
      zone: 4197,
    });
    const full = wintergraspQueueResponseBody({
      battleId: 1,
      canQueue: false,
      full: true,
      zone: 4197,
    });
    const parsed = parseQueueResponse(new PacketReader(full));
    expect(parsed.full).toBe(true);
    expect(parsed.queued).toBe(false);
  });

  test("entered reads the clear-afk byte after the two unknown bytes", () => {
    const body = wintergraspEnteredBody({ afk: true, battleId: 1 });
    expect(parseEntered(new PacketReader(body))).toEqual({
      battleId: 1,
      clearAfk: true,
    });
  });

  test("ejected reads reason, status and relocated", () => {
    const body = wintergraspEjectedBody({ battleId: 1, reason: 8 });
    expect(parseEjected(new PacketReader(body))).toEqual({
      battleId: 1,
      reason: 8,
      relocated: false,
      status: 2,
    });
  });

  test("building damage reads three packed guids and a signed change", () => {
    const heal = wintergraspBuildingDamageBody({
      attacker: 0x2000n,
      building: 0xf1_30_00_00_00_00_00_05n,
      player: 0x07n,
      spell: 50_000,
      wireChange: -300,
    });
    expect(parseBuildingDamage(new PacketReader(heal))).toEqual({
      attacker: 0x2000n,
      building: 0xf1_30_00_00_00_00_00_05n,
      damage: -300,
      player: 0x07n,
      spell: 50_000,
    });
  });

  test("client builders match the AzerothCore readers", () => {
    expect([...buildQueueInviteResponse(1, true)]).toEqual([1, 0, 0, 0, 1]);
    expect([...buildEntryInviteResponse(1, false)]).toEqual([1, 0, 0, 0, 0]);
    expect([...buildExitRequest(1)]).toEqual([1, 0, 0, 0]);
  });
});
