import { describe, expect, test } from "bun:test";
import {
  buildAlterAppearance,
  buildPlayedTime,
  buildRealmSplit,
  buildSetSheathed,
  buildShowing,
  buildWhois,
  parseBarberShopResult,
  parsePlayedTime,
  parseRealmSplit,
  parseWhois,
} from "#wow/areas/character/protocol";
import { PacketReader } from "#wow/protocol/packet";

describe("character protocol", () => {
  test("realm split writes the realm id and reads echo, state and date", () => {
    expect(buildRealmSplit(5)).toEqual(new Uint8Array([5, 0, 0, 0]));
    const body = new Uint8Array([
      5,
      0,
      0,
      0,
      2,
      0,
      0,
      0,
      ...new TextEncoder().encode("01/01/01"),
      0,
    ]);
    expect(parseRealmSplit(new PacketReader(body))).toEqual({
      date: "01/01/01",
      echo: 5,
      state: 2,
    });
  });

  test("played time round-trips the trigger byte with both counters", () => {
    const body = buildPlayedTime(false);
    expect(body).toEqual(new Uint8Array([0]));
    expect(buildPlayedTime(true)).toEqual(new Uint8Array([1]));
    expect(
      parsePlayedTime(
        new PacketReader(new Uint8Array([10, 0, 0, 0, 3, 0, 0, 0, 1])),
      ),
    ).toEqual({
      totalSeconds: 10,
      levelSeconds: 3,
      trigger: true,
    });
  });

  test("sheathe writes the raw sheath state word", () => {
    expect(buildSetSheathed("unarmed")).toEqual(new Uint8Array([0, 0, 0, 0]));
    expect(buildSetSheathed("melee")).toEqual(new Uint8Array([1, 0, 0, 0]));
    expect(buildSetSheathed("ranged")).toEqual(new Uint8Array([2, 0, 0, 0]));
  });

  test("helm and cloak visibility writes one bool byte", () => {
    expect(buildShowing(false)).toEqual(new Uint8Array([0]));
    expect(buildShowing(true)).toEqual(new Uint8Array([1]));
  });

  test("alter appearance writes four style words", () => {
    expect(
      buildAlterAppearance({ hair: 5, color: 2, facialHair: 7, skinColor: 0 }),
    ).toEqual(new Uint8Array([5, 0, 0, 0, 2, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0]));
  });

  test("barber result names the server's status word", () => {
    for (const [code, result] of [
      [0, "ok"],
      [1, "not_enough_money"],
      [2, "not_seated"],
      [3, "not_enough_money"],
    ] as const) {
      expect(
        parseBarberShopResult(
          new PacketReader(new Uint8Array([code, 0, 0, 0])),
        ),
      ).toEqual({ code, result });
    }
    expect(
      parseBarberShopResult(new PacketReader(new Uint8Array([9, 0, 0, 0]))),
    ).toEqual({ code: 9, result: "code_9" });
  });

  test("whois round-trips the target name", () => {
    const name = "Bankalt";
    expect(parseWhois(new PacketReader(buildWhois(name)))).toEqual(name);
  });
});
