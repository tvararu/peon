import { defineArea } from "#wow/areas/contract";
import { GUILDBANK_OPCODES } from "#wow/areas/guildbank/opcodes";
import {
  parseBankList,
  parseBankLog,
  parseBankText,
  parseMoneyWithdrawn,
} from "#wow/areas/guildbank/protocol";
import { guildbankRuntime } from "#wow/areas/guildbank/runtime";
import { GuildBankStore } from "#wow/areas/guildbank/store";
import { parseGuildCommandResult } from "#wow/protocol/guild";
import { GameOpcode } from "#wow/protocol/opcodes";

export const guildbankArea = defineArea({
  eventTypes: [
    "opened",
    "tab",
    "tab_bought",
    "tab_renamed",
    "money_moved",
    "moved",
    "text_set",
    "logged",
    "money_queried",
    "refused",
    "no_change",
    "unanswered",
  ],
  name: "guildbank",
  opcodes: GUILDBANK_OPCODES,
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_GUILD_BANK_LIST, (reader) => {
      const parsed = parseBankList(reader);
      if (parsed) store.receiveList(parsed);
    });
    wire.on(GameOpcode.MSG_GUILD_BANK_LOG_QUERY, (reader) => {
      const parsed = parseBankLog(reader);
      if (parsed) store.receiveLog(parsed);
    });
    wire.on(GameOpcode.MSG_QUERY_GUILD_BANK_TEXT, (reader) => {
      const parsed = parseBankText(reader);
      if (parsed) store.receiveText(parsed);
    });
    wire.peek(GameOpcode.SMSG_GUILD_COMMAND_RESULT, (reader) => {
      const result = parseGuildCommandResult(reader);
      store.receiveCommandResult(result.command, result.result);
    });
    wire.on(GameOpcode.MSG_GUILD_BANK_MONEY_WITHDRAWN, (reader) => {
      const parsed = parseMoneyWithdrawn(reader);
      if (parsed !== undefined) store.receiveMoneyWithdrawn(parsed);
    });
  },
  runtime: guildbankRuntime,
  store: (deps) => new GuildBankStore(deps),
});
