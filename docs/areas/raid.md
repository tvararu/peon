# raid

The `raid` area keeps the full group roster from `SMSG_GROUP_LIST`: the
group kind (party or raid), the battleground and dungeon-finder flags,
the character's own subgroup, flags and roles, every other member's
name, guid, status, subgroup, flags and roles, the leader, the loot
method with the master looter and threshold, and the three difficulty
bytes. It emits one `group_list` event per list with the `changes`
between the previous list and the new one (`converted`, `subgroup`,
`flag`, `loot`, `difficulty`, `joined`, `left`, `leader`). The server never lists the receiving character, so a
change to its own subgroup or flags, or a leader guid that no member row
holds, is a `subgroup`, `flag` or `leader` change with `self: true` and
no name, and one
`invite_blocked` event per `SMSG_GROUP_INVITE` with status 0. The
group is raid when bit `0x02` of the type is set, so a battleground raid
(`0x03`) reads as raid with `battleground` set. The counter belongs to
one group: a list whose group guid matches the held group and whose
counter is not newer changes nothing, a list of another group replaces
the held one, and a zero-member list of another group is ignored. The
"you left" form clears the group and emits `disbanded`. The legacy
party code reads the same packet for the `social` tool; this area only
peeks it. The area also keeps one `MemberStats` per roster member from
the peeked `SMSG_PARTY_MEMBER_STATS` and `SMSG_PARTY_MEMBER_STATS_FULL`:
status bits, health, power with its type, level, zone, position, auras,
pet fields and the vehicle seat, stamped with the area clock; stats for
a guid outside the roster are ignored. Each peek emits one
`member_stats` event with the full guid, the roster name and the
`transitions` (`died`, `ghost`, `revived`, `offline`, `online`) since
the previous stats for that member. The runtime sends one
`CMSG_REQUEST_PARTY_MEMBER_STATS` per member the roster adds; the act
`memberStats(name)` returns the held stats and refreshes a member whose
stats are missing or older than 30 s, at most one request per member
per 10 s; the act `requestMemberStats(name)` sends one request and
throws for a name outside the group. The harness writes one `passive`
row `member` per transition, for example "Tom died."; stats with no
transition write no row. The act `awaitGroupChange(match, timeoutMs)` resolves with
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
- The `SMSG_GROUP_LIST` counter is `Group::m_counter`, so it belongs to
  one group and rises on every send of that group
  (`Groups/Group.cpp:1913`).
- The group type is a flag set: `GROUPTYPE_BG` `0x01`, `GROUPTYPE_RAID`
  `0x02`, their mask `GROUPTYPE_BGRAID` and `GROUPTYPE_LFG` `0x08`
  (`Groups/Group.h:87-92`).
- `SMSG_GROUP_INVITE` with status 0 goes to an invitee who is already
  in a group (`Handlers/GroupHandler.cpp:160-176`); status 1 is a live
  invite, which the legacy code handles.
- `SMSG_PARTY_MEMBER_STATS` carries the changed fields of one member
  (`Handlers/GroupHandler.cpp:835-999`), and `SMSG_PARTY_MEMBER_STATS_FULL`
  carries the full reply to `CMSG_REQUEST_PARTY_MEMBER_STATS`
  (`Handlers/GroupHandler.cpp:1023-1135`): the full reply without the
  power-type bit defaults the power type to mana (0)
  (`Handlers/GroupHandler.cpp:1032-1033`), and the offline reply for a
  guid not in the raid carries only the status
  (`Handlers/GroupHandler.cpp:1011-1017`). The request reads one guid
  (`Handlers/GroupHandler.cpp:1002-1006`).
- `SMSG_PARTY_MEMBER_STATS` position is two `uint16` casts of floats
  (`Handlers/GroupHandler.cpp:887-889`), read here as signed `int16` so
  a negative Eversong y stays negative.
- The `SMSG_PARTY_MEMBER_STATS` status word sets `MEMBER_STATUS_ONLINE`
  and, when set, `MEMBER_STATUS_PVP`, `MEMBER_STATUS_DEAD` or
  `MEMBER_STATUS_GHOST`, `MEMBER_STATUS_PVP_FFA`, `MEMBER_STATUS_AFK`
  and `MEMBER_STATUS_DND` (`Handlers/GroupHandler.cpp:841-860`).

## Left out

- `CMSG_GROUP_UNINVITE_GUID`, `CMSG_GROUP_RAID_CONVERT`, `CMSG_GROUP_CHANGE_SUB_GROUP`,
  `CMSG_GROUP_SWAP_SUB_GROUP`, `CMSG_GROUP_ASSISTANT_LEADER`,
  `MSG_PARTY_ASSIGNMENT`, `MSG_MINIMAP_PING`, `MSG_RAID_READY_CHECK`,
  `MSG_RAID_READY_CHECK_CONFIRM`, `MSG_RAID_READY_CHECK_FINISHED`,
  `MSG_RAID_TARGET_UPDATE`, `SMSG_SUMMON_REQUEST` and
  `CMSG_SUMMON_RESPONSE`: built by later group tasks. The LFG form (type
  `0x08`) is not seen live until `instances` forms a dungeon-finder
  group.

## Live evidence

Three `eversong10` throwaway accounts A, B and C ran through their
puppets with `--packet-trace headers`: A invited B, B accepted, then C
(in no group) invited A. Kept, not committed, in the directory
`live-raid-fix1` of the `proto-group` worktree's scratch space, one `<ACCOUNT>-packets.jsonl` and one
`<ACCOUNT>-events.json` per account:

- A's trace holds `out CMSG_GROUP_INVITE`, `in SMSG_GROUP_INVITE` and
  three `in SMSG_GROUP_LIST`; A's events hold a raid `group_list` with
  `joined` for B and an `invite_blocked` for C.
- B's trace holds `in SMSG_GROUP_INVITE`, `out CMSG_GROUP_ACCEPT` and
  three `in SMSG_GROUP_LIST`; B's events hold a raid `group_list` with
  `joined` for A.
- C's trace holds the outgoing invite.

A second run over the same characters, kept under
`live-raid-fix1-regroup` of the same scratch space, found A and B still grouped from the
first run, so A's new invite of B was answered with status 0 and both
puppets logged `invite_blocked`.

Battleground groups and the self-only changes are proven by
`areaRig` tests built from the writer at `Groups/Group.cpp:1883-1950`,
not seen live.

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_GROUP_CANCEL` | `dead` | the server ignores it: no handler | `Server/Protocol/Opcodes.cpp:243` |
| `SMSG_REAL_GROUP_UPDATE` | `dead` | `STATUS_NEVER` and no send site in AzerothCore | `Server/Protocol/Opcodes.cpp:1050` |
