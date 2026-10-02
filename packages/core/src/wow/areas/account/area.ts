import { ACCOUNT_OPCODES } from "#wow/areas/account/opcodes";
import {
  parseUpdateAccountData,
  parseUpdateAccountDataComplete,
} from "#wow/areas/account/protocol";
import { accountRuntime } from "#wow/areas/account/runtime";
import { AccountStore } from "#wow/areas/account/store";
import { defineArea } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";

export const accountArea = defineArea({
  eventTypes: ["account_data", "account_data_saved"],
  name: "account",
  opcodes: ACCOUNT_OPCODES,
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_UPDATE_ACCOUNT_DATA, (reader) => {
      store.receiveUpdate(parseUpdateAccountData(reader));
    });
    wire.on(GameOpcode.SMSG_UPDATE_ACCOUNT_DATA_COMPLETE, (reader) => {
      store.receiveComplete(parseUpdateAccountDataComplete(reader));
    });
  },
  runtime: accountRuntime,
  store: () => new AccountStore(),
});
