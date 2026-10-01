import { describe, expect, test } from "bun:test";
import { spellsMirrorImageBody } from "#test-support/areas/spells";
import {
  buildFarSight,
  buildMirrorImageRequest,
  parseMirrorImage,
} from "#wow/areas/spells/protocol";
import { PacketReader } from "#wow/protocol/packet";

const IMAGE = 0xf1_30_00_79_d8_00_00_11n;
const ITEMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

describe("far sight and mirror image wire", () => {
  test("buildFarSight writes one byte, 1 to apply and 0 to release (MiscHandler.cpp:1187-1190)", () => {
    expect([...buildFarSight(true)]).toEqual([1]);
    expect([...buildFarSight(false)]).toEqual([0]);
  });

  test("buildMirrorImageRequest writes the full u64 guid, not a packed one (SpellHandler.cpp:741-746)", () => {
    const body = buildMirrorImageRequest(IMAGE);
    expect(body.length).toBe(8);
    expect(new PacketReader(body).uint64LE()).toBe(IMAGE);
  });

  test("parseMirrorImage reads the 68-byte player reply in the writer's order (SpellHandler.cpp:760-831)", () => {
    const body = spellsMirrorImageBody({
      classId: 8,
      displayId: 15_476,
      gender: 1,
      guid: IMAGE,
      guild: 77,
      items: ITEMS,
      look: [3, 4, 5, 6, 7],
      race: 10,
    });
    expect(body.length).toBe(68);
    expect(parseMirrorImage(new PacketReader(body))).toEqual({
      classId: 8,
      displayId: 15_476,
      facialHair: 7,
      face: 4,
      gender: 1,
      guid: IMAGE,
      guild: 77,
      hairColor: 6,
      hairStyle: 5,
      items: ITEMS,
      race: 10,
      skin: 3,
    });
  });

  test("a creature creator's reply (zero look bytes and items) parses to zeros (SpellHandler.cpp:809-824)", () => {
    const body = spellsMirrorImageBody({
      classId: 1,
      displayId: 25_000,
      gender: 0,
      guid: IMAGE,
      guild: 0,
      items: new Array(11).fill(0),
      look: [0, 0, 0, 0, 0],
      race: 0,
    });
    const image = parseMirrorImage(new PacketReader(body));
    expect(image.items).toEqual(new Array(11).fill(0));
    expect(image.skin).toBe(0);
    expect(image.displayId).toBe(25_000);
  });
});
