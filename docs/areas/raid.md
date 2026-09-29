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
throws for a name outside the group. The raid structure acts each send
one packet: `convertToRaid()` sends the empty convert;
`moveToSubgroup(name, group)` takes the tool group 1-8 and sends the
wire group 0-7, throwing for a tool group outside 1-8 because the
server drops it with no reply; `swapSubgroups(name, withName)` sends
both names; `setAssistant(name, on)` sends the member guid and the
flag byte; `setMainTank(name, on)` and `setMainAssist(name, on)` send
the role byte (main tank 0, main assist 1), the apply byte and the guid;
`uninviteGuid(name, reason)` sends the member guid and the reason. Every
act names another member: a name outside the roster throws
`not in your party`, and the caller's own name throws too because the
server never lists the receiving character. The peeked
`SMSG_PARTY_COMMAND_RESULT` emits one `command_result` event with the
operation and result as names and the member name; unknown codes keep
their number (`result_<n>`, `operation_<n>`). The harness writes one
`wake` row `command` per result, and one `passive` row `roster` per
change, except `joined` and `left`, which the legacy `group/roster` row
already says; `invite_blocked` writes one `log` row.

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
- `SMSG_PARTY_MEMBER_STATS` writes a zero pet guid when the member has
  no pet (`Handlers/GroupHandler.cpp:909-915`). A full
  `SMSG_PARTY_MEMBER_STATS_FULL` reply adds the pet name, model and
  auras even for a member without a pet
  (`Handlers/GroupHandler.cpp:1028-1037`).
- The `SMSG_PARTY_MEMBER_STATS` status word sets `MEMBER_STATUS_ONLINE`
  and, when set, `MEMBER_STATUS_PVP`, `MEMBER_STATUS_DEAD` or
  `MEMBER_STATUS_GHOST`, `MEMBER_STATUS_PVP_FFA`, `MEMBER_STATUS_AFK`
  and `MEMBER_STATUS_DND` (`Handlers/GroupHandler.cpp:841-860`).
- `SMSG_PARTY_COMMAND_RESULT` carries the operation, the member name, the
  result and a value word
  (`Handlers/GroupHandler.cpp:53-62`).
- `CMSG_GROUP_RAID_CONVERT` carries no body; the leader's convert is
  answered with operation 0 result 0 and then the raid roster, while a
  member below the raid level is refused with result 25
  (`Handlers/GroupHandler.cpp:647-670`).
- `CMSG_GROUP_CHANGE_SUB_GROUP` carries the member name and the wire
  subgroup 0-7; a value at or above `MAX_RAID_SUBGROUPS` is dropped with
  no reply (`Handlers/GroupHandler.cpp:672-707`).
- `CMSG_GROUP_SWAP_SUB_GROUP` carries two member names; bad names are
  answered with operation 4 result 14
  (`Handlers/GroupHandler.cpp:1154-1180`).
- `CMSG_GROUP_ASSISTANT_LEADER` carries the member guid and the apply
  flag (`Handlers/GroupHandler.cpp:709-726`).
- `MSG_PARTY_ASSIGNMENT` carries the role byte (main tank
  `GROUP_ASSIGN_MAINTANK` 0, main assist `GROUP_ASSIGN_MAINASSIST` 1),
  the apply flag and the member guid
  (`Handlers/GroupHandler.cpp:728-758`).
- `CMSG_GROUP_UNINVITE_GUID` carries the member guid and the reason
  (`Handlers/GroupHandler.cpp:353-360`).
- The `SMSG_PARTY_COMMAND_RESULT` result `raid_disallowed_by_level` is
  code 25 and `group_swap_failed` is code 14; the operation `swap` is
  code 4.

## Left out

- `MSG_MINIMAP_PING`, `MSG_RAID_READY_CHECK`,
  `MSG_RAID_READY_CHECK_CONFIRM`, `MSG_RAID_READY_CHECK_FINISHED`,
  `MSG_RAID_TARGET_UPDATE`, `SMSG_SUMMON_REQUEST` and
  `CMSG_SUMMON_RESPONSE`: built by later group tasks. The LFG form (type
  `0x08`) is not seen live until `instances` forms a dungeon-finder
  group. The acts name other members only: the caller's own name throws
  `not in your party`, because the server never lists the receiving
  character in `SMSG_GROUP_LIST`.

## Live evidence

Three `eversong10` throwaway accounts A (Fgkllmaablf), B (Fgkllmaabbk)
and C (Fgkllmaabkl) ran through their puppets with `--packet-trace
headers`. Kept, not committed, in the directory `live-group3` of the
`proto-group` worktree's scratch space, one `<ACCOUNT>-packets.jsonl`
per account. No account from the run remains: each one is deleted.

- A invited B and C; both accepted. A's trace holds `out
  CMSG_GROUP_INVITE` twice and the `SMSG_GROUP_LIST` replies.
- `call convertToRaid` on A wrote `out CMSG_GROUP_RAID_CONVERT`; A's
  trace holds `in SMSG_PARTY_COMMAND_RESULT` (operation 0, result 0)
  and then `in SMSG_GROUP_LIST` with kind `raid`, and A's events hold a
  raid `command_result` `invite` / `ok` and a `group_list` with the
  `converted` change.
- `call moveToSubgroup '["<B>", 2]'` wrote `out
  CMSG_GROUP_CHANGE_SUB_GROUP`; A's events hold a `group_list` with B's
  `subgroup` change from 0 to 1.
- `call swapSubgroups '["<B>", "<C>"]'` wrote `out
  CMSG_GROUP_SWAP_SUB_GROUP`; A's events hold `group_list` rows moving
  B and then C between the subgroups.
- `call setAssistant '["<B>", "on"]'` wrote `out
  CMSG_GROUP_ASSISTANT_LEADER`; A's events hold a `group_list` with B's
  `flag` change to assistant.
- `call setMainTank '["<B>", "on"]'` and `call setMainAssist '["<B>",
  "on"]'` each wrote `out MSG_PARTY_ASSIGNMENT`; A's events hold
  `group_list` rows with B's `flag` changes to main tank and main
  assist.
- A raw `CMSG_GROUP_SWAP_SUB_GROUP` with a bad first name was answered
  with `in SMSG_PARTY_COMMAND_RESULT`, and A's events hold a raid
  `command_result` `swap` / `group_swap_failed`. The tool refuses the
  same call before any send with `not in your party`, so no `out` row
  is written for it.
- After B and C stopped, `call uninviteGuid '["<C>", "test"]'` wrote
  `out CMSG_GROUP_UNINVITE_GUID`; A's trace holds `in
  SMSG_GROUP_DESTROYED` and a `group_list` with C's `left` change.
- A regrouped with B, B was set to level 9 by GM, and `call
  convertToRaid` was answered with `in SMSG_PARTY_COMMAND_RESULT`
  (operation 0, result 25); A's events hold a raid `command_result`
  `invite` / `raid_disallowed_by_level`.

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

Two throwaway accounts A (`eversong10`, Fgkllkghmhk) and B
(`ghostlands20`, Fgkllkghpll) ran through their puppets with
`--packet-trace headers`: A invited B, B accepted. Kept, not committed,
in the directory `live-group2` of the `proto-group` worktree's scratch
space, one `<ACCOUNT>-packets.jsonl` per account:

- A's trace holds `out CMSG_GROUP_INVITE`, `in SMSG_GROUP_LIST`, two
  `in SMSG_PARTY_MEMBER_STATS` (the zone and y of out-of-range B),
  `out CMSG_REQUEST_PARTY_MEMBER_STATS` (sent by the roster-add policy)
  and `in SMSG_PARTY_MEMBER_STATS_FULL`.
- a `requestMemberStats` puppet call for B wrote
  `out CMSG_REQUEST_PARTY_MEMBER_STATS` and
  `in SMSG_PARTY_MEMBER_STATS_FULL`.
- After B's puppet stopped, A's trace holds the offline
  `SMSG_GROUP_LIST` (status 0), and a later `requestMemberStats` for B
  wrote `out CMSG_REQUEST_PARTY_MEMBER_STATS` with the 10-byte offline
  `in SMSG_PARTY_MEMBER_STATS_FULL`. That run's events file was empty,
  so the second run below is the proof of the `offline` event.

A second run repeated the pair with an `eversong10-hunter` account A
(Fgkllkkgkjo) and an `eversong10` account B (Fgkllkkhgne), both puppets
started with `--packet-trace bodies`. Kept, not committed, in the
directory `live-group2-fix2` of the same scratch space: both packet
traces and the `events --json` reads.

- B's trace holds the hunter's `in SMSG_PARTY_MEMBER_STATS_FULL`
  (77 bytes). Decoded, it has zone 3430, x 8735, y -6685 (a negative
  `int16`), and the pet fields for the hunter's starting pet: guid
  `0xf140000d730004ff`, name `Ravager`, model 17061, health 344 of 344,
  power type 2 and power 100 of 100. The pet was already summoned at
  login, so the pet fields were seen live.
- A's trace holds the 49-byte full reply for B with the same zone and
  y. Before B logged out, A's events hold `member_stats` for B with the
  `online` transition.
- After B's puppet stopped, A's trace holds the offline
  `SMSG_GROUP_LIST` (status 0) and, after a `requestMemberStats` for B,
  the 10-byte offline `in SMSG_PARTY_MEMBER_STATS_FULL`
  (`00032a0f010000000000`). A's events then hold `member_stats` for B
  with the `offline` transition. Removal clears both stores' pet state,
  proven by `areaRig` tests, not seen live.


## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_REQUEST_PARTY_MEMBER_STATS` | `live` | A's trace: roster-add request, `requestMemberStats` call, offline reply after B stopped | `live-group2` scratch dir |
| `CMSG_GROUP_RAID_CONVERT` | `live` | A's trace: `out` row, then `in SMSG_PARTY_COMMAND_RESULT` (op 0, result 0) and the raid roster; the level-9 rerun answers result 25 | `live-group3` scratch dir |
| `CMSG_GROUP_CHANGE_SUB_GROUP` | `live` | A's trace: `out` row, then the roster with B moved to group 2 | `live-group3` scratch dir |
| `CMSG_GROUP_SWAP_SUB_GROUP` | `live` | A's trace: `out` row, then the rosters swapping B and C; the bad-name raw send answers `SMSG_PARTY_COMMAND_RESULT` op 4 result 14 | `live-group3` scratch dir |
| `CMSG_GROUP_ASSISTANT_LEADER` | `live` | A's trace: `out` row, then the roster with B flagged assistant | `live-group3` scratch dir |
| `MSG_PARTY_ASSIGNMENT` | `live` | A's trace: two `out` rows, then the rosters with B flagged main tank and main assist | `live-group3` scratch dir |
| `CMSG_GROUP_UNINVITE_GUID` | `live` | A's trace: `out` row, then `SMSG_GROUP_DESTROYED` and the roster with C's `left` change | `live-group3` scratch dir |
| `CMSG_GROUP_CANCEL` | `dead` | the server ignores it: no handler | `Server/Protocol/Opcodes.cpp:243` |
| `SMSG_REAL_GROUP_UPDATE` | `dead` | `STATUS_NEVER` and no send site in AzerothCore | `Server/Protocol/Opcodes.cpp:1050` |
