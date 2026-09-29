# raid

The `raid` area keeps the full group roster from `SMSG_GROUP_LIST`: the
group kind (party or raid), the battleground and dungeon-finder flags,
the character's own subgroup, flags and roles, every other member's
name, guid, status, subgroup, flags and roles, the leader, the loot
method with the master looter and threshold, and the three difficulty
bytes. It emits one `group_list` event per list with the `changes`
between the previous list and the new one (`converted`, `subgroup`,
`flag`, `loot`, `difficulty`, `joined`, `left`, `leader`), and one
`invite_blocked` event per `SMSG_GROUP_INVITE` with status 0. A list
whose counter is not newer than the last one changes nothing. The
"you left" form clears the group and emits `disbanded`. The legacy
party code reads the same packet for the `social` tool; this area only
peeks it. The act `awaitGroupChange(match, timeoutMs)` resolves with
the first `group_list` event whose `changes` hold every named kind, and
rejects with `timeout` after `timeoutMs`. The harness writes one
`passive` row `roster` per change, except `joined` and `left`, which the
legacy `group/roster` row already says; `invite_blocked` writes one
`log` row.

## Wire notes

- `SMSG_GROUP_LIST` (type, own subgroup/flags/roles, the dungeon-finder
  insert, group guid, counter, member count, one row per member except
  self, leader guid, loot block) is written by `Group::SendUpdateToPlayer`
  (`Groups/Group.cpp:1900-1950`).
- `SMSG_GROUP_LIST` skips the receiving member
  (`Groups/Group.cpp:1917-1918`), so the legacy party code resolves
  names only through the other members.
- `SMSG_GROUP_LIST` marks bit `0x01` of the member status as online; a
  battleground member carries bit `0x02` (`Groups/Group.cpp:1920-1923`),
  which still reads as offline here.
- `SMSG_GROUP_LIST` member flags are assistant `0x01`, main tank `0x02`
  and main assist `0x04`, written per member
  (`Groups/Group.cpp:1928`).
- The `SMSG_GROUP_LIST` counter rises on every send
  (`Groups/Group.cpp:1914`).
- `SMSG_GROUP_INVITE` with status 0 goes to an invitee who is already
  in a group (`Handlers/GroupHandler.cpp:160-176`); status 1 is a live
  invite, which the legacy code handles.

## Left out

- `CMSG_GROUP_UNINVITE_GUID`, `CMSG_REQUEST_PARTY_MEMBER_STATS`,
  `CMSG_GROUP_RAID_CONVERT`, `CMSG_GROUP_CHANGE_SUB_GROUP`,
  `CMSG_GROUP_SWAP_SUB_GROUP`, `CMSG_GROUP_ASSISTANT_LEADER`,
  `MSG_PARTY_ASSIGNMENT`, `MSG_MINIMAP_PING`, `MSG_RAID_READY_CHECK`,
  `MSG_RAID_READY_CHECK_CONFIRM`, `MSG_RAID_READY_CHECK_FINISHED`,
  `MSG_RAID_TARGET_UPDATE`, `SMSG_SUMMON_REQUEST` and
  `CMSG_SUMMON_RESPONSE`: built by later group tasks. The LFG form (type
  `0x08`) is not seen live until `instances` forms a dungeon-finder
  group.

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_GROUP_CANCEL` | `dead` | the server ignores it: no handler | `Server/Protocol/Opcodes.cpp:243` |
| `SMSG_REAL_GROUP_UPDATE` | `dead` | `STATUS_NEVER` and no send site in AzerothCore | `Server/Protocol/Opcodes.cpp:1050` |
