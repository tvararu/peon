import { defineArea } from "#wow/areas/contract";
import { LFG_OPCODES } from "#wow/areas/lfg/opcodes";
import {
  parseLfgPlayerInfo,
  parseLfgUpdate,
  parsePartyLockBlock,
} from "#wow/areas/lfg/protocol";
import { lfgRuntime } from "#wow/areas/lfg/runtime";
import { createLfgStore } from "#wow/areas/lfg/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const lfgArea = defineArea({
  name: "lfg",
  opcodes: LFG_OPCODES,
  eventTypes: ["status", "dungeons"],
  store: (deps, core) => createLfgStore(deps, core),
  register: (wire, store) => {
    wire.on(GameOpcode.SMSG_LFG_UPDATE_PLAYER, (r) =>
      store.receiveUpdate(parseLfgUpdate(r, "player"), "player"),
    );
    wire.on(GameOpcode.SMSG_LFG_UPDATE_PARTY, (r) =>
      store.receiveUpdate(parseLfgUpdate(r, "party"), "party"),
    );
    wire.on(GameOpcode.SMSG_LFG_PLAYER_INFO, (r) =>
      store.receivePlayerInfo(parseLfgPlayerInfo(r)),
    );
    wire.on(GameOpcode.SMSG_LFG_PARTY_INFO, (r) =>
      store.receivePartyInfo(parsePartyLockBlock(r)),
    );
    wire.on(GameOpcode.SMSG_LFG_UPDATE_SEARCH, (r) =>
      store.receiveSearch(r.uint8() !== 0),
    );
  },
  runtime: lfgRuntime,
});
