import { describe, expect, test } from "bun:test";
import {
  buildCharCustomize,
  buildCharDelete,
  buildCharFactionChange,
  buildCharRename,
  parseCharDelete,
  parseCharNamedResult,
  parseRosterRow,
  splitAppearance,
} from "#wow/areas/character/select";
import { PacketReader } from "#wow/protocol/packet";

const GUID = 0x0000000100000042n;

function rowBody(): Uint8Array {
  const name = new TextEncoder().encode("Bankalt\0");
  const rest = new Uint8Array(
    8 + name.length + 8 + 2 + 4 + 4 + 4 + 12 + 4 + 4 + 4 + 4 + 1,
  );
  const view = new DataView(rest.buffer);
  view.setUint32(0, 0x42, true);
  view.setUint32(4, 0x01, true);
  rest.set(name, 8);
  let at = 8 + name.length;
  const bytes = [2, 6, 0, 1, 7, 5, 3, 2, 10];
  for (const b of bytes) rest[at++] = b;
  view.setUint32(at, 12, true);
  at += 4;
  view.setUint32(at, 530, true);
  at += 4;
  at += 12;
  view.setUint32(at, 77, true);
  at += 4;
  view.setUint32(at, 0x40, true);
  at += 4;
  view.setUint32(at, 1, true);
  at += 4;
  rest[at] = 0;
  return rest;
}

describe("character select", () => {
  test("delete writes the full guid and names the result byte", () => {
    expect([...buildCharDelete(GUID)]).toEqual([0x42, 0, 0, 0, 1, 0, 0, 0]);
    expect(parseCharDelete(new PacketReader(new Uint8Array([0x47])))).toEqual({
      code: 0x47,
      result: "success",
    });
    expect(parseCharDelete(new PacketReader(new Uint8Array([0x4a])))).toEqual({
      code: 0x4a,
      result: "guild_leader",
    });
  });

  test("rename writes guid plus name and reports failures", () => {
    const body = buildCharRename(GUID, "Newname");
    expect(new PacketReader(body).uint64LE()).toEqual(GUID);
    expect(new PacketReader(body.subarray(8)).cString()).toEqual("Newname");
    const failed = parseCharNamedResult(
      new PacketReader(new Uint8Array([0x59])),
    );
    expect(failed).toMatchObject({
      code: 0x59,
      result: "no_name",
      guid: undefined,
    });
  });

  test("rename success carries guid and name", () => {
    const name = new TextEncoder().encode("Newname\0");
    const body = new Uint8Array(1 + 8 + name.length);
    body[0] = 0;
    new DataView(body.buffer).setBigUint64(1, GUID, true);
    body.set(name, 9);
    expect(parseCharNamedResult(new PacketReader(body))).toMatchObject({
      code: 0,
      result: "success",
      guid: GUID,
      name: "Newname",
    });
  });

  test("customize and faction change write appearance in server order", () => {
    const appearance = {
      gender: 0,
      skin: 1,
      face: 2,
      hairStyle: 3,
      hairColor: 4,
      facialHair: 5,
    };
    const tail = [...buildCharCustomize(GUID, "N", appearance)].slice(-6);
    expect(tail).toEqual([0, 1, 4, 3, 5, 2]);
    const wide = [...buildCharFactionChange(GUID, "N", 6, appearance)].slice(
      -7,
    );
    expect(wide).toEqual([0, 1, 4, 3, 5, 2, 6]);
  });

  test("splitAppearance reads the reply tail", () => {
    expect(
      splitAppearance(new Uint8Array([0, 1, 2, 3, 4, 5, 6]), true),
    ).toEqual({
      appearance: {
        gender: 0,
        skin: 1,
        face: 2,
        hairStyle: 3,
        hairColor: 4,
        facialHair: 5,
      },
      race: 6,
    });
    expect(splitAppearance(new Uint8Array([0, 1]), true)).toEqual({
      appearance: undefined,
      race: undefined,
    });
  });

  test("roster row reads appearance, flags and customize flags", () => {
    expect(parseRosterRow(new PacketReader(rowBody()))).toEqual({
      guid: GUID,
      name: "Bankalt",
      race: 2,
      classId: 6,
      level: 10,
      zone: 12,
      map: 530,
      guildId: 77,
      gender: 0,
      skin: 1,
      face: 7,
      hairStyle: 5,
      hairColor: 3,
      facialHair: 2,
      flags: 0x40,
      customizeFlags: 1,
      firstLogin: false,
    });
  });

  test("whois reply parses the bare account line", () => {
    const line = "Bankalt's account is ACC, e-mail: a@b, last ip: 1.2.3.4";
    const body = new TextEncoder().encode(`${line}\0`);
    expect(new PacketReader(body).cString()).toEqual(line);
  });
});
