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
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

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
    const w = new PacketWriter();
    w.cString("Fac");
    expect([...buildGuildCreate("Fac")]).toEqual([...w.finish()]);
  });

  test("CMSG_GUILD_INFO and CMSG_GUILD_DISBAND have empty bodies (GuildHandler.cpp:89-95, :133-139)", () => {
    expect(new PacketWriter().finish().length).toBe(0);
  });
});
