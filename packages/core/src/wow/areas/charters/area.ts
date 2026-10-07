import { parseTeamCommandResult } from "#wow/areas/arena/protocol";
import { CHARTERS_OPCODES } from "#wow/areas/charters/opcodes";
import {
  parseDecline,
  parseQueryResponse,
  parseRename,
  parseShowlist,
  parseSignatures,
  parseSignResult,
  parseTurnInResult,
} from "#wow/areas/charters/protocol";
import { chartersRuntime } from "#wow/areas/charters/runtime";
import { ChartersStore } from "#wow/areas/charters/store";
import { defineArea } from "#wow/areas/contract";
import { parseGuildCommandResult } from "#wow/protocol/guild";
import { parseInventoryChangeFailure } from "#wow/protocol/inventory";
import { parseItemPushResult } from "#wow/protocol/loot";
import { GameOpcode } from "#wow/protocol/opcodes";
import { parseBuyFailed } from "#wow/protocol/vendor";

export const chartersArea = defineArea({
  name: "charters",
  opcodes: CHARTERS_OPCODES,
  eventTypes: [
    "showlist",
    "query",
    "signatures",
    "renamed",
    "bought",
    "refused",
    "unanswered",
    "sign_result",
    "declined",
    "turn_in",
  ],
  store: (deps, core) => new ChartersStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_PETITION_SHOWLIST, (reader) => {
      store.receiveShowlist(parseShowlist(reader));
    });
    wire.on(GameOpcode.SMSG_PETITION_QUERY_RESPONSE, (reader) => {
      store.receiveQueryResponse(parseQueryResponse(reader));
    });
    wire.on(GameOpcode.SMSG_PETITION_SHOW_SIGNATURES, (reader) => {
      store.receiveSignatures(parseSignatures(reader));
    });
    wire.on(GameOpcode.MSG_PETITION_RENAME, (reader) => {
      const renamed = parseRename(reader);
      store.receiveRename(renamed.item, renamed.name);
    });
    wire.on(GameOpcode.SMSG_PETITION_SIGN_RESULTS, (reader) => {
      store.receiveSignResult(parseSignResult(reader));
    });
    wire.on(GameOpcode.MSG_PETITION_DECLINE, (reader) => {
      store.receiveDecline(parseDecline(reader));
    });
    wire.on(GameOpcode.SMSG_TURN_IN_PETITION_RESULTS, (reader) => {
      store.receiveTurnIn(parseTurnInResult(reader));
    });
    wire.peek(GameOpcode.SMSG_ITEM_PUSH_RESULT, (reader) => {
      const push = parseItemPushResult(reader);
      if (
        push.itemId === 5863 ||
        push.itemId === 23_560 ||
        push.itemId === 23_561 ||
        push.itemId === 23_562
      )
        store.receiveItemPush(push);
    });
    wire.peek(GameOpcode.SMSG_BUY_FAILED, (reader) => {
      const failure = parseBuyFailed(reader);
      if (
        failure.itemId === 5863 ||
        failure.itemId === 23_560 ||
        failure.itemId === 23_561 ||
        failure.itemId === 23_562
      )
        store.receiveBuyFailure(failure);
    });
    wire.peek(GameOpcode.SMSG_GUILD_COMMAND_RESULT, (reader) => {
      const result = parseGuildCommandResult(reader);
      if (result.result !== 0)
        store.receiveCommandResult(result.command, result.result);
    });
    wire.peek(GameOpcode.SMSG_ARENA_TEAM_COMMAND_RESULT, (reader) => {
      const result = parseTeamCommandResult(reader);
      if (result.error !== 0) store.receiveArenaCommandResult(result.error);
    });
    wire.peek(GameOpcode.SMSG_INVENTORY_CHANGE_FAILURE, (reader) => {
      const failure = parseInventoryChangeFailure(reader);
      if (failure.kind === "error" && failure.result !== 59)
        store.receiveInventoryFailure(failure);
    });
  },
  runtime: chartersRuntime,
});
