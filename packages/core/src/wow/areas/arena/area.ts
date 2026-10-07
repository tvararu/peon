import { ARENA_OPCODES } from "#wow/areas/arena/opcodes";
import {
  parseArenaError,
  parseInspectArenaTeams,
  parseQueueStatus,
  parseTeamCommandResult,
  parseTeamEvent,
  parseTeamInvite,
  parseTeamQuery,
  parseTeamRoster,
  parseTeamStats,
} from "#wow/areas/arena/protocol";
import { arenaRuntime } from "#wow/areas/arena/runtime";
import { ArenaStore } from "#wow/areas/arena/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const arenaArea = defineArea({
  name: "arena",
  opcodes: ARENA_OPCODES,
  eventTypes: [
    "team",
    "stats",
    "roster",
    "invited",
    "team_event",
    "result",
    "arena_error",
    "inspect",
    "queue",
    "queue_refused",
    "unit_destroyed",
  ],
  store: (deps) => new ArenaStore(deps),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_ARENA_TEAM_QUERY_RESPONSE, (reader) => {
      store.receiveQuery(parseTeamQuery(reader));
    });
    wire.on(GameOpcode.SMSG_ARENA_TEAM_STATS, (reader) => {
      store.receiveStats(parseTeamStats(reader));
    });
    wire.on(GameOpcode.SMSG_ARENA_TEAM_ROSTER, (reader) => {
      store.receiveRoster(parseTeamRoster(reader));
    });
    wire.on(GameOpcode.SMSG_ARENA_TEAM_INVITE, (reader) => {
      store.receiveInvite(parseTeamInvite(reader));
    });
    wire.on(GameOpcode.SMSG_ARENA_TEAM_EVENT, (reader) => {
      store.receiveTeamEvent(parseTeamEvent(reader));
    });
    wire.on(GameOpcode.SMSG_ARENA_TEAM_COMMAND_RESULT, (reader) => {
      store.receiveCommandResult(parseTeamCommandResult(reader));
    });
    wire.on(GameOpcode.SMSG_ARENA_ERROR, (reader) => {
      store.receiveArenaError(parseArenaError(reader).arenaType);
    });
    wire.on(GameOpcode.MSG_INSPECT_ARENA_TEAMS, (reader) => {
      store.receiveInspect(parseInspectArenaTeams(reader));
    });
    wire.on(GameOpcode.SMSG_ARENA_UNIT_DESTROYED, (reader) => {
      store.receiveUnitDestroyed(reader.uint64LE());
    });
    wire.peek(GameOpcode.SMSG_BATTLEFIELD_STATUS, (reader) => {
      store.receiveQueueStatus(parseQueueStatus(reader));
    });
    wire.peek(GameOpcode.SMSG_GROUP_JOINED_BATTLEGROUND, (reader) => {
      const result = reader.int32LE();
      if (result <= 0) store.receiveQueueRefused(result);
    });
  },
  runtime: arenaRuntime,
});
