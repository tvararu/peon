import { describe, expect, test } from "bun:test";
import {
  guardReadyBody,
  guardWardenBody,
  readWorldTeleport,
} from "#test-support/areas/guard";
import {
  buildPrepareForRedirect,
  buildSetFactionCheat,
  buildWardenData,
  buildWorldTeleport,
  parseReadyForRedirect,
  parseWardenData,
} from "#wow/areas/guard/protocol";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

describe("guard builders", () => {
  test("world teleport writes the six fields and no guid", () => {
    const body = buildWorldTeleport({
      time: 99,
      map: 530,
      x: 1.5,
      y: -2.5,
      z: 3.25,
      orientation: 0.5,
    });
    expect(body.byteLength).toBe(24);
    expect(readWorldTeleport(body)).toEqual({
      time: 99,
      map: 530,
      x: 1.5,
      y: -2.5,
      z: 3.25,
      orientation: 0.5,
      remaining: 0,
    });
  });

  test("the faction cheat and the redirect request are empty", () => {
    expect(buildSetFactionCheat().byteLength).toBe(0);
    expect(buildPrepareForRedirect().byteLength).toBe(0);
  });

  test("the warden answer carries the payload unchanged", () => {
    const payload = Uint8Array.of(5, 1, 2, 3);
    const packet = buildWardenData(payload);
    expect(packet.opcode).toBe(GameOpcode.CMSG_WARDEN_DATA);
    expect(packet.body).toEqual(payload);
  });
});

describe("guard parsers", () => {
  test("a warden request keeps the body opaque and reports its size", () => {
    const reader = new PacketReader(guardWardenBody(37));
    expect(parseWardenData(reader)).toEqual({ size: 37 });
  });

  test("the redirect reply names success and failure", () => {
    expect(parseReadyForRedirect(new PacketReader(guardReadyBody(0)))).toEqual({
      code: 0,
      ok: true,
    });
    expect(parseReadyForRedirect(new PacketReader(guardReadyBody(1)))).toEqual({
      code: 1,
      ok: false,
    });
  });

  test("an empty redirect reply throws", () => {
    expect(() =>
      parseReadyForRedirect(new PacketReader(new Uint8Array())),
    ).toThrow(RangeError);
  });
});
