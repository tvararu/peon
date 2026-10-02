import { ignoreFailure } from "#lib/ignore-failure";
import type { WorldHandle } from "#wow/client";
import { isUnit } from "#wow/entity-store";
import type { GuildRoster } from "#wow/guild-store";
import {
  buildJoinChannel,
  buildLeaveChannel,
  buildRandomRoll,
} from "#wow/protocol/chat";
import { buildDuelAccepted, buildDuelCancelled } from "#wow/protocol/duel";
import { ChatType } from "#wow/protocol/enums";
import {
  buildGroupAccept,
  buildGroupDecline,
  buildGroupDisband,
  buildGroupInvite,
  buildGroupSetLeader,
  buildGroupUninvite,
} from "#wow/protocol/group";
import {
  buildGuildDemote,
  buildGuildInvite,
  buildGuildLeader,
  buildGuildMotd,
  buildGuildPromote,
  buildGuildQuery,
  buildGuildRemove,
  GuildCommand,
} from "#wow/protocol/guild";
import { GameOpcode } from "#wow/protocol/opcodes";
import {
  buildAddFriend,
  buildAddIgnore,
  buildDelFriend,
  buildDelIgnore,
} from "#wow/protocol/social";
import { PLAYER_FIELDS } from "#wow/protocol/update-fields";
import type { WorldConn } from "#wow/world-conn";
import { selfGuid, sendPacket } from "#wow/world-handlers";

function notify(conn: WorldConn, message: string): void {
  conn.events.message.emit({ type: ChatType.SYSTEM, sender: "", message });
}
function acceptPending(conn: WorldConn): void {
  if (conn.pendingRequest === "duel") {
    sendPacket(
      conn,
      GameOpcode.CMSG_DUEL_ACCEPTED,
      buildDuelAccepted(conn.duelArbiter),
    );
  } else if (conn.pendingRequest === "group") {
    sendPacket(conn, GameOpcode.CMSG_GROUP_ACCEPT, buildGroupAccept());
  } else {
    notify(conn, "Nothing to accept.");
  }
  conn.pendingRequest = null;
}

function declinePending(conn: WorldConn): void {
  if (conn.pendingRequest === "duel") {
    sendPacket(
      conn,
      GameOpcode.CMSG_DUEL_CANCELLED,
      buildDuelCancelled(conn.duelArbiter),
    );
  } else if (conn.pendingRequest === "group") {
    sendPacket(conn, GameOpcode.CMSG_GROUP_DECLINE, buildGroupDecline());
  } else {
    notify(conn, "Nothing to decline.");
  }
  conn.pendingRequest = null;
}

export function groupMethods(conn: WorldConn) {
  return {
    getPartyState() {
      return conn.party.snapshot((guid) => {
        const entity = conn.entityStore.get(guid);
        if (!isUnit(entity) || entity.maxHealth === 0) return;
        const type = entity.powerType ?? 0;
        return {
          health: entity.health,
          level: entity.level,
          maxHealth: entity.maxHealth,
          maxPower: entity.maxPower[type] ?? 0,
          power: entity.power[type] ?? 0,
          powerType: type,
        };
      }, Date.now());
    },
    invite(name) {
      sendPacket(conn, GameOpcode.CMSG_GROUP_INVITE, buildGroupInvite(name));
    },
    uninvite(name) {
      sendPacket(
        conn,
        GameOpcode.CMSG_GROUP_UNINVITE,
        buildGroupUninvite(name),
      );
    },
    leaveGroup() {
      sendPacket(conn, GameOpcode.CMSG_GROUP_DISBAND, buildGroupDisband());
    },
    joinChannel(name, password) {
      sendPacket(
        conn,
        GameOpcode.CMSG_JOIN_CHANNEL,
        buildJoinChannel(name, password),
      );
    },
    leaveChannel(name) {
      sendPacket(conn, GameOpcode.CMSG_LEAVE_CHANNEL, buildLeaveChannel(name));
    },
    setLeader(name) {
      const member = conn.partyMembers.get(name);
      if (!member) {
        notify(conn, `"${name}" is not in your party.`);
        return;
      }
      sendPacket(
        conn,
        GameOpcode.CMSG_GROUP_SET_LEADER,
        buildGroupSetLeader(member.guidLow, member.guidHigh),
      );
    },
    acceptInvite() {
      acceptPending(conn);
    },
    declineInvite() {
      declinePending(conn);
    },
    onGroupEvent(cb) {
      return conn.events.group.subscribe(cb);
    },
  } satisfies Partial<WorldHandle>;
}

export function socialMethods(conn: WorldConn) {
  return {
    onEntityEvent(cb) {
      return conn.events.entity.subscribe(cb);
    },
    onPacketError(cb) {
      return conn.events.packetError.subscribe(cb);
    },
    getNearbyEntities() {
      return conn.entityStore.all();
    },
    getEntity(guid) {
      return conn.entityStore.get(guid);
    },
    getFriends() {
      return conn.friendStore.all();
    },
    addFriend(name) {
      sendPacket(conn, GameOpcode.CMSG_ADD_FRIEND, buildAddFriend(name, ""));
    },
    removeFriend(name) {
      const friend = conn.friendStore.findByName(name);
      if (!friend) {
        notify(conn, `"${name}" is not on your friends list.`);
        return;
      }
      sendPacket(conn, GameOpcode.CMSG_DEL_FRIEND, buildDelFriend(friend.guid));
    },
    sendRoll(min, max) {
      sendPacket(conn, GameOpcode.MSG_RANDOM_ROLL, buildRandomRoll(min, max));
    },
    onFriendEvent(cb) {
      return conn.events.friend.subscribe(cb);
    },
  } satisfies Partial<WorldHandle>;
}

export function ignoreMethods(conn: WorldConn) {
  return {
    getIgnored() {
      return conn.ignoreStore.all();
    },
    addIgnore(name) {
      sendPacket(conn, GameOpcode.CMSG_ADD_IGNORE, buildAddIgnore(name));
    },
    removeIgnore(name) {
      const entry = conn.ignoreStore.findByName(name);
      if (!entry) {
        notify(conn, `"${name}" is not on your ignore list.`);
        return;
      }
      sendPacket(conn, GameOpcode.CMSG_DEL_IGNORE, buildDelIgnore(entry.guid));
    },
    onIgnoreEvent(cb) {
      return conn.events.ignore.subscribe(cb);
    },
  } satisfies Partial<WorldHandle>;
}

function selfGuildId(conn: WorldConn): number {
  const self = conn.entityStore.get(selfGuid(conn));
  return self?.rawFields.get(PLAYER_FIELDS.GUILDID.offset) ?? conn.guildId;
}

async function awaitGuildQuery(
  conn: WorldConn,
  queryWaiter: Promise<unknown>,
): Promise<void> {
  const error = await new Promise<Error | undefined>((resolve) => {
    const off = conn.events.packetError.subscribe((opcode, err) => {
      if (opcode !== GameOpcode.SMSG_GUILD_QUERY_RESPONSE) return;
      off();
      resolve(err);
    });
    queryWaiter.then(
      () => {
        off();
        resolve(undefined);
      },
      (err: unknown) => {
        off();
        resolve(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
  if (error) throw error;
  await queryWaiter;
}

async function requestGuildRoster(
  conn: WorldConn,
): Promise<GuildRoster | undefined> {
  sendPacket(conn, GameOpcode.CMSG_GUILD_ROSTER);
  const guildId = selfGuildId(conn);
  if (guildId !== 0) {
    sendPacket(conn, GameOpcode.CMSG_GUILD_QUERY, buildGuildQuery(guildId));
  }
  const rosterWaiter = conn.dispatch.expect(GameOpcode.SMSG_GUILD_ROSTER);
  rosterWaiter.catch(ignoreFailure);
  const queryWaiter =
    guildId === 0
      ? undefined
      : conn.dispatch.expect(GameOpcode.SMSG_GUILD_QUERY_RESPONSE);
  queryWaiter?.catch(ignoreFailure);
  const noGuild = new Promise<"no-guild">((resolve) => {
    const off = conn.events.guild.subscribe((event) => {
      if (
        event.type !== "command_result" ||
        event.command !== GuildCommand.ROSTER
      )
        return;
      off();
      resolve("no-guild");
    });
    rosterWaiter.then(
      () => off(),
      () => off(),
    );
  });
  const settled = await Promise.race([
    rosterWaiter.then(() => "roster" as const),
    noGuild,
  ]);
  if (settled === "no-guild") return undefined;
  if (queryWaiter) await awaitGuildQuery(conn, queryWaiter);
  return conn.guildStore.get();
}

export function guildMethods(conn: WorldConn) {
  return {
    requestGuildRoster() {
      return requestGuildRoster(conn);
    },
    onGuildEvent(cb) {
      return conn.events.guild.subscribe(cb);
    },
    guildInvite(name) {
      sendPacket(conn, GameOpcode.CMSG_GUILD_INVITE, buildGuildInvite(name));
    },
    guildRemove(name) {
      sendPacket(conn, GameOpcode.CMSG_GUILD_REMOVE, buildGuildRemove(name));
    },
    guildLeave() {
      sendPacket(conn, GameOpcode.CMSG_GUILD_LEAVE);
    },
    guildPromote(name) {
      sendPacket(conn, GameOpcode.CMSG_GUILD_PROMOTE, buildGuildPromote(name));
    },
    guildDemote(name) {
      sendPacket(conn, GameOpcode.CMSG_GUILD_DEMOTE, buildGuildDemote(name));
    },
    guildLeader(name) {
      sendPacket(conn, GameOpcode.CMSG_GUILD_LEADER, buildGuildLeader(name));
    },
    guildMotd(motd) {
      sendPacket(conn, GameOpcode.CMSG_GUILD_MOTD, buildGuildMotd(motd));
    },
    acceptGuildInvite() {
      sendPacket(conn, GameOpcode.CMSG_GUILD_ACCEPT);
    },
    declineGuildInvite() {
      sendPacket(conn, GameOpcode.CMSG_GUILD_DECLINE);
    },
    onDuelEvent(cb) {
      return conn.events.duel.subscribe(cb);
    },
  } satisfies Partial<WorldHandle>;
}
