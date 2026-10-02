import { describe, expect, test } from "bun:test";
import { startMockWorldServer } from "#test-support/mock-world-server";
import {
  base,
  fakeAuth,
  waitForEchoProbe,
} from "#test-support/world-handlers-fixtures";
import type { GuildRoster, WorldHandle } from "#wow/client";
import { worldSession } from "#wow/client";
import {
  guildadminCommandResultBody,
  guildadminQueryResponseBody,
  guildadminRosterBody,
} from "#test-support/areas/guildadmin";
import {
  GuildCommand,
  GuildCommandResult,
  GuildMemberStatus,
} from "#wow/protocol/guild";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

type Server = {
  inject: (opcode: number, body: Uint8Array) => void;
  waitForCapture: (
    match: (packet: { opcode: number; body: Uint8Array }) => boolean,
  ) => Promise<{ opcode: number; body: Uint8Array }>;
};

async function guildSession(
  opts: { guildId?: number },
  body: (handle: WorldHandle, ws: Server) => Promise<void>,
): Promise<void> {
  const ws = await startMockWorldServer(opts);
  try {
    const handle = await worldSession(
      { ...base, host: "127.0.0.1", port: ws.port },
      fakeAuth(ws.port),
    );
    await waitForEchoProbe(handle);
    await body(handle, ws as unknown as Server);
    handle.close();
    await handle.closed;
  } finally {
    ws.stop();
  }
}

function rosterBody(): Uint8Array {
  return guildadminRosterBody({
    motd: "Welcome!",
    info: "",
    ranks: [
      {
        rights: 0x00f1_1d00,
        goldPerDay: 0xffff_ffff,
        tabs: [0, 1, 2, 3, 4, 5].map((i) => ({ flags: i, slots: i })),
      },
    ],
    members: [
      {
        guid: 0x10n,
        status: GuildMemberStatus.ONLINE,
        name: "Thrall",
        rankIndex: 0,
        level: 80,
        playerClass: 7,
        gender: 0,
        area: 4395,
        timeOffline: 0,
        publicNote: "",
        officerNote: "",
      },
    ],
  });
}

function notInGuildBody(): Uint8Array {
  return guildadminCommandResultBody({
    command: GuildCommand.ROSTER,
    name: "",
    result: GuildCommandResult.GUILD_PLAYER_NOT_IN_GUILD,
  });
}

describe("requestGuildRoster", () => {
  test("resolves undefined on the not-in-guild result instead of hanging", async () => {
    await guildSession({}, async (handle, ws) => {
      const rosterPromise: Promise<GuildRoster | undefined> =
        handle.requestGuildRoster();
      await ws.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_GUILD_ROSTER,
      );
      ws.inject(GameOpcode.SMSG_GUILD_COMMAND_RESULT, notInGuildBody());
      await expect(rosterPromise).resolves.toBeUndefined();
    });
  });

  test("resolves the roster when the server sends it", async () => {
    await guildSession({}, async (handle, ws) => {
      const rosterPromise: Promise<GuildRoster | undefined> =
        handle.requestGuildRoster();
      await ws.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_GUILD_ROSTER,
      );
      ws.inject(GameOpcode.SMSG_GUILD_ROSTER, rosterBody());
      const roster = await rosterPromise;
      expect(roster?.members.map((m) => m.name)).toEqual(["Thrall"]);
    });
  });

  test("a command result for another command does not end the request", async () => {
    await guildSession({}, async (handle, ws) => {
      const rosterPromise: Promise<GuildRoster | undefined> =
        handle.requestGuildRoster();
      await ws.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_GUILD_ROSTER,
      );
      ws.inject(
        GameOpcode.SMSG_GUILD_COMMAND_RESULT,
        guildadminCommandResultBody({
          command: GuildCommand.INVITE,
          name: "Jaina",
          result: GuildCommandResult.ALREADY_IN_GUILD_S,
        }),
      );
      ws.inject(GameOpcode.SMSG_GUILD_ROSTER, rosterBody());
      const roster = await rosterPromise;
      expect(roster?.members.map((m) => m.name)).toEqual(["Thrall"]);
    });
  });

  test("sends the query with the login guild id", async () => {
    await guildSession({ guildId: 42 }, async (handle, ws) => {
      const rosterPromise: Promise<GuildRoster | undefined> =
        handle.requestGuildRoster();
      const queryCapture = await ws.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_GUILD_QUERY,
      );
      expect(queryCapture.body.byteLength).toBe(4);
      expect(new PacketReader(queryCapture.body).uint32LE()).toBe(42);
      ws.inject(GameOpcode.SMSG_GUILD_ROSTER, rosterBody());

      ws.inject(
        GameOpcode.SMSG_GUILD_QUERY_RESPONSE,
        guildadminQueryResponseBody({
          id: 42,
          name: "Horde Elite",
          rankNames: ["Guild Master"],
          emblem: {
            style: 0,
            color: 0,
            borderStyle: 0,
            borderColor: 0,
            backgroundColor: 0,
          },
          rankCount: 1,
        }),
      );
      const roster = await rosterPromise;
      expect(roster?.guildName).toBe("Horde Elite");
    });
  });
});
