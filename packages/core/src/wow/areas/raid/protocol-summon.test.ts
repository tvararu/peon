import { describe, expect, test } from "bun:test";
import { raidSummonRequestBody } from "#test-support/areas/raid";
import {
  buildSummonResponse,
  parseSummonRequest,
} from "#wow/areas/raid/protocol-summon";
import { PacketReader } from "#wow/protocol/packet";

const TOM = 0x1_0000_0010n;

describe("summon server forms", () => {
  test("the request is summoner, zone and timeout in milliseconds", () => {
    expect(
      parseSummonRequest(
        new PacketReader(raidSummonRequestBody(TOM, 3430, 120_000)),
      ),
    ).toEqual({ summoner: TOM, timeoutMs: 120_000, zoneId: 3430 });
  });

  test("the response is the full summoner guid and one byte", () => {
    expect([...buildSummonResponse(TOM, true)]).toEqual([
      0x10, 0, 0, 0, 1, 0, 0, 0, 1,
    ]);
    expect([...buildSummonResponse(TOM, false)]).toEqual([
      0x10, 0, 0, 0, 1, 0, 0, 0, 0,
    ]);
  });
});
