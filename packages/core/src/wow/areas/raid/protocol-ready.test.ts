import { describe, expect, test } from "bun:test";
import {
  raidReadyCheckBody,
  raidReadyConfirmBody,
} from "#test-support/areas/raid";
import {
  buildReadyCheckAnswer,
  buildReadyCheckFinished,
  buildReadyCheckStart,
  parseReadyCheckConfirm,
  parseReadyCheckStart,
} from "#wow/areas/raid/protocol-ready";
import { PacketReader } from "#wow/protocol/packet";

const TOM = 0x10n;

describe("ready check server forms", () => {
  test("the start is the initiator guid alone", () => {
    expect(
      parseReadyCheckStart(new PacketReader(raidReadyCheckBody(TOM))),
    ).toEqual({ initiator: TOM });
  });

  test("the confirm is a guid and a state byte", () => {
    expect(
      parseReadyCheckConfirm(new PacketReader(raidReadyConfirmBody(TOM, 1))),
    ).toEqual({ guid: TOM, ready: true });
    expect(
      parseReadyCheckConfirm(new PacketReader(raidReadyConfirmBody(TOM, 0))),
    ).toEqual({ guid: TOM, ready: false });
  });
});

describe("ready check client forms", () => {
  test("the start and the finish are empty", () => {
    expect(buildReadyCheckStart()).toHaveLength(0);
    expect(buildReadyCheckFinished()).toHaveLength(0);
  });

  test("an answer is one state byte", () => {
    expect([...buildReadyCheckAnswer(true)]).toEqual([1]);
    expect([...buildReadyCheckAnswer(false)]).toEqual([0]);
  });
});
