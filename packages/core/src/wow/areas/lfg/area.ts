import { defineArea } from "#wow/areas/contract";
import { LFG_OPCODES } from "#wow/areas/lfg/opcodes";
import {
  parseBootProposal,
  parseLfgJoinResult,
  parseLfgPlayerInfo,
  parseLfgProposal,
  parseLfgQueueStatus,
  parseLfgReward,
  parseLfgUpdate,
  parseOfferContinue,
  parsePartyLockBlock,
  parseRoleCheckUpdate,
  parseRoleChosen,
  parseTeleportDenied,
} from "#wow/areas/lfg/protocol";
import { lfgRuntime } from "#wow/areas/lfg/runtime";
import { createLfgStore } from "#wow/areas/lfg/store";
import { GameOpcode } from "#wow/protocol/opcodes";

export const lfgArea = defineArea({
  name: "lfg",
  opcodes: LFG_OPCODES,
  eventTypes: [
    "status",
    "dungeons",
    "join_result",
    "queue",
    "role_check",
    "role_chosen",
    "proposal",
    "boot",
    "teleport_denied",
    "offer_continue",
    "reward",
  ],
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
    wire.on(GameOpcode.SMSG_LFG_JOIN_RESULT, (r) =>
      store.receiveJoinResult(parseLfgJoinResult(r)),
    );
    wire.on(GameOpcode.SMSG_LFG_QUEUE_STATUS, (r) =>
      store.receiveQueueStatus(parseLfgQueueStatus(r)),
    );
    wire.on(GameOpcode.SMSG_LFG_ROLE_CHECK_UPDATE, (r) =>
      store.receiveRoleCheck(parseRoleCheckUpdate(r)),
    );
    wire.on(GameOpcode.SMSG_LFG_ROLE_CHOSEN, (r) =>
      store.receiveRoleChosen(parseRoleChosen(r)),
    );
    wire.on(GameOpcode.SMSG_LFG_PROPOSAL_UPDATE, (r) =>
      store.receiveProposal(parseLfgProposal(r)),
    );
    wire.on(GameOpcode.SMSG_LFG_BOOT_PROPOSAL_UPDATE, (r) =>
      store.receiveBoot(parseBootProposal(r)),
    );
    wire.on(GameOpcode.SMSG_LFG_TELEPORT_DENIED, (r) =>
      store.receiveTeleportDenied(parseTeleportDenied(r).code),
    );
    wire.on(GameOpcode.SMSG_LFG_OFFER_CONTINUE, (r) =>
      store.receiveOfferContinue(parseOfferContinue(r).entry),
    );
    wire.on(GameOpcode.SMSG_LFG_PLAYER_REWARD, (r) =>
      store.receiveReward(parseLfgReward(r)),
    );
  },
  runtime: lfgRuntime,
});
