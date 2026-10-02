import type { GuildMember } from "#wow/guild-store";
import {
  GuildEventCode,
  parseGuildCommandResult,
  parseGuildEvent,
  parseGuildInvitePacket,
  parseGuildQueryResponse,
  parseGuildRoster,
} from "#wow/protocol/guild";
import type { PacketReader } from "#wow/protocol/packet";
import type { WorldConn } from "#wow/world-conn";

export function handleGuildRoster(conn: WorldConn, r: PacketReader): void {
  const raw = parseGuildRoster(r);
  const members: GuildMember[] = raw.members.map((m) => ({ ...m }));
  conn.guildStore.setRoster(raw.motd, raw.guildInfo, members);
}

export function handleGuildQueryResponse(
  conn: WorldConn,
  r: PacketReader,
): void {
  const result = parseGuildQueryResponse(r);
  conn.guildStore.setGuildMeta(result.name, result.rankNames);
}

function toUint(value: string): number | undefined {
  if (!/^[0-9]+$/.test(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return undefined;
  return parsed;
}

export function handleGuildEvent(conn: WorldConn, r: PacketReader): void {
  const raw = parseGuildEvent(r);
  const param = (index: number): string => raw.params[index] ?? "";
  switch (raw.eventType) {
    case GuildEventCode.PROMOTION:
      conn.events.guild.emit({
        type: "promotion",
        officer: param(0),
        member: param(1),
        rank: param(2),
      });
      break;
    case GuildEventCode.DEMOTION:
      conn.events.guild.emit({
        type: "demotion",
        officer: param(0),
        member: param(1),
        rank: param(2),
      });
      break;
    case GuildEventCode.REMOVED:
      conn.events.guild.emit({
        type: "removed",
        member: param(0),
        officer: param(1),
      });
      break;
    case GuildEventCode.RANK_UPDATED: {
      const rankId = toUint(param(0));
      const rankCount = toUint(param(2));
      if (rankId === undefined || rankCount === undefined) break;
      conn.events.guild.emit({
        type: "rank_updated",
        rankId,
        name: param(1),
        rankCount,
      });
      break;
    }
    case GuildEventCode.RANK_DELETED: {
      const rankCount = toUint(param(0));
      if (rankCount === undefined) break;
      conn.events.guild.emit({ type: "rank_deleted", rankCount });
      break;
    }
    case GuildEventCode.BANK_TAB_PURCHASED:
      conn.events.guild.emit({ type: "bank_tab_purchased" });
      break;
    case GuildEventCode.BANK_TAB_UPDATED: {
      const tabId = toUint(param(0));
      if (tabId === undefined) break;
      conn.events.guild.emit({
        type: "bank_tab_updated",
        tabId,
        name: param(1),
        icon: param(2),
      });
      break;
    }
    case GuildEventCode.BANK_MONEY_SET: {
      const balance = parseBankBalance(param(0));
      if (balance === undefined) break;
      conn.events.guild.emit({ type: "bank_money", balance });
      break;
    }
    case GuildEventCode.BANK_TAB_AND_MONEY_UPDATED:
      conn.events.guild.emit({ type: "bank_reset" });
      break;
    case GuildEventCode.LEADER_CHANGED:
      conn.events.guild.emit({
        type: "leader_changed",
        oldLeader: param(0),
        newLeader: param(1),
      });
      break;
    default:
      emitGuildNotice(conn, raw.eventType, param);
      break;
  }
}

function emitGuildNotice(
  conn: WorldConn,
  eventType: number,
  param: (index: number) => string,
): void {
  switch (eventType) {
    case GuildEventCode.MOTD:
      conn.events.guild.emit({ type: "motd", text: param(0) });
      break;
    case GuildEventCode.JOINED:
      conn.events.guild.emit({ type: "joined", name: param(0) });
      break;
    case GuildEventCode.LEFT:
      conn.events.guild.emit({ type: "left", name: param(0) });
      break;
    case GuildEventCode.LEADER_IS:
      conn.events.guild.emit({ type: "leader_is", name: param(0) });
      break;
    case GuildEventCode.DISBANDED:
      conn.events.guild.emit({ type: "disbanded" });
      break;
    case GuildEventCode.SIGNED_ON:
      conn.events.guild.emit({ type: "signed_on", name: param(0) });
      break;
    case GuildEventCode.SIGNED_OFF:
      conn.events.guild.emit({ type: "signed_off", name: param(0) });
      break;
    default:
      break;
  }
}

export function parseBankBalance(param: string): bigint | undefined {
  if (!/^[0-9A-F]{16}$/.test(param)) return undefined;
  let balance = 0n;
  for (let i = 0; i < 8; i++) {
    const byte = Number.parseInt(param.slice(2 * i, 2 * i + 2), 16);
    balance = (balance << 8n) | BigInt(byte);
  }
  return balance;
}

export function handleGuildCommandResult(
  conn: WorldConn,
  r: PacketReader,
): void {
  const packet = parseGuildCommandResult(r);
  conn.events.guild.emit({
    type: "command_result",
    command: packet.command,
    name: packet.name,
    result: packet.result,
  });
}

export function handleGuildInvitePacket(
  conn: WorldConn,
  r: PacketReader,
): void {
  const packet = parseGuildInvitePacket(r);
  conn.events.guild.emit({
    type: "guild_invite",
    inviter: packet.inviterName,
    guildName: packet.guildName,
  });
}
