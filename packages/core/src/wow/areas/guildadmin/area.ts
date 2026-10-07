import { defineArea } from "#wow/areas/contract";
import { GUILDADMIN_OPCODES } from "#wow/areas/guildadmin/opcodes";
import {
  parseGuildEventLog,
  parseGuildInfo,
  parseGuildPermissions,
  parseSaveEmblemResult,
  parseTabardVendor,
} from "#wow/areas/guildadmin/protocol";
import { guildadminRuntime } from "#wow/areas/guildadmin/runtime";
import { GuildadminStore } from "#wow/areas/guildadmin/store";
import {
  parseGuildCommandResult,
  parseGuildEvent,
  parseGuildQueryResponse,
  parseGuildRoster,
} from "#wow/protocol/guild";
import { GameOpcode } from "#wow/protocol/opcodes";

export const guildadminArea = defineArea({
  name: "guildadmin",
  opcodes: GUILDADMIN_OPCODES,
  eventTypes: [
    "info",
    "disbanded",
    "permissions",
    "event_log",
    "roster",
    "emblem",
    "emblem_result",
    "tabard_vendor",
    "rank_updated",
    "rank_deleted",
    "command_error",
  ],
  store: () => new GuildadminStore(),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_GUILD_INFO, (r) =>
      store.receiveInfo(parseGuildInfo(r)),
    );
    wire.on(GameOpcode.MSG_GUILD_PERMISSIONS, (r) =>
      store.receivePermissions(parseGuildPermissions(r)),
    );
    wire.on(GameOpcode.MSG_GUILD_EVENT_LOG_QUERY, (r) =>
      store.receiveEventLog(parseGuildEventLog(r)),
    );
    wire.on(GameOpcode.MSG_SAVE_GUILD_EMBLEM, (r) =>
      store.receiveEmblemResult(parseSaveEmblemResult(r)),
    );
    wire.on(GameOpcode.MSG_TABARDVENDOR_ACTIVATE, (r) =>
      store.receiveTabardVendor(parseTabardVendor(r)),
    );
    wire.peek(GameOpcode.SMSG_GUILD_EVENT, (r) => {
      const event = parseGuildEvent(r);
      store.receiveGuildEvent(event.eventType, event.params);
    });
    wire.peek(GameOpcode.SMSG_GUILD_ROSTER, (r) =>
      store.receiveRoster(parseGuildRoster(r)),
    );
    wire.peek(GameOpcode.SMSG_GUILD_QUERY_RESPONSE, (r) =>
      store.receiveEmblem(parseGuildQueryResponse(r).emblem),
    );
    wire.peek(GameOpcode.SMSG_GUILD_COMMAND_RESULT, (r) => {
      const result = parseGuildCommandResult(r);
      store.receiveCommandResult(result.command, result.name, result.result);
    });
  },
  runtime: guildadminRuntime,
});
