import { describe, expect, test } from "bun:test";
import {
  GUILDADMIN_INFO,
  guildadminGuildInfoBody,
} from "#test-support/areas/guildadmin";
import {
  buildGuildCreate,
  parseGuildInfo,
} from "#wow/areas/guildadmin/protocol";
import { parsePackedTime } from "#wow/protocol/packed-time";
import { PacketReader } from "#wow/protocol/packet";

describe("guildadmin protocol (Server/Packets/GuildPackets.cpp:45-58)", () => {
  test("parseGuildInfo reads the name, packed creation time and counts", () => {
    expect(
      parseGuildInfo(
        new PacketReader(
          guildadminGuildInfoBody({
            ...GUILDADMIN_INFO,
            created: parsePackedTime(0x1a_90_6b_d0),
          }),
        ),
      ),
    ).toEqual({
      name: "FacSeedAlpha",
      created: parsePackedTime(0x1a_90_6b_d0),
      members: 1,
      accounts: 1,
    });
  });

  test("buildGuildCreate writes the guild name as a CString (GuildPackets.cpp:45-48)", () => {
    expect([...buildGuildCreate("Fac")]).toEqual([0x46, 0x61, 0x63, 0x00]);
  });
});
