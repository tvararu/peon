import { defineArea } from "#wow/areas/contract";
import { RAID_OPCODES } from "#wow/areas/raid/opcodes";
import { readRaidGroup } from "#wow/areas/raid/protocol";
import { raidRuntime } from "#wow/areas/raid/runtime";
import { RaidAreaStore } from "#wow/areas/raid/store";
import { parsePartyCommandResult } from "#wow/protocol/group";
import {
  type GroupInviteReceived,
  type GroupList,
  parseGroupInvite,
  parseGroupList,
} from "#wow/protocol/group-list";
import { parsePartyMemberStats } from "#wow/protocol/group-stats";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { PacketReader } from "#wow/protocol/packet";

function receiveList(store: RaidAreaStore, parsed: GroupList): void {
  store.receiveList(readRaidGroup(parsed), parsed.counter);
}

function receiveInvite(
  store: RaidAreaStore,
  parsed: GroupInviteReceived,
): void {
  if (parsed.status === 0) store.receiveInviteBlocked(parsed.name);
}

function receiveCommandResult(store: RaidAreaStore, r: PacketReader): void {
  store.receiveCommandResult(parsePartyCommandResult(r));
}

export const raidArea = defineArea({
  name: "raid",
  opcodes: RAID_OPCODES,
  eventTypes: [
    "group_list",
    "invite_blocked",
    "member_stats",
    "command_result",
  ],
  store: (deps) => new RaidAreaStore(deps.now),
  register: (wire, store) => {
    wire.peek(GameOpcode.SMSG_GROUP_LIST, (r) =>
      receiveList(store, parseGroupList(r)),
    );
    wire.peek(GameOpcode.SMSG_GROUP_INVITE, (r) =>
      receiveInvite(store, parseGroupInvite(r)),
    );
    wire.peek(GameOpcode.SMSG_PARTY_COMMAND_RESULT, (r) =>
      receiveCommandResult(store, r),
    );
    wire.peek(GameOpcode.SMSG_PARTY_MEMBER_STATS, (r) =>
      store.receiveStats(parsePartyMemberStats(r)),
    );
    wire.peek(GameOpcode.SMSG_PARTY_MEMBER_STATS_FULL, (r) =>
      store.receiveStats(parsePartyMemberStats(r, true)),
    );
  },
  runtime: raidRuntime,
});
