# looting

The `looting` area keeps who may loot each corpse and the character's
request to pass on group loot rolls. World-service code reads it through
`session.areas.looting.state()`: `owners` maps each creature guid to its
master looter, its group looter and `mine` (`yes`, `no` or `unknown`),
for the 64 newest kills; `masterCandidates` is empty; `passOnLoot` is
the last requested pass flag. The area emits one `loot_owner` event per
`SMSG_LOOT_LIST`. An owner goes away when its creature disappears. The
act `setPassOnLoot(pass)` sends `CMSG_OPT_OUT_OF_LOOT` and sets
`passOnLoot` at once, because the server sends no reply. The act
`setLootMethod({ method, threshold, master })` sends `CMSG_LOOT_METHOD`
from names: `method` is `free_for_all`, `round_robin`, `master_loot`,
`group_loot` or `need_before_greed`, `threshold` is `uncommon`, `rare`,
`epic`, `legendary` or `artifact`, and `master` is the name of another
party member, or empty for none. An unknown method or threshold, or a
master outside the party (`not in your party`), throws before any send.
The act does not wait: the leader's new rules arrive in the next
`SMSG_GROUP_LIST`, which the legacy party code reads. The harness
writes no game-log row for `loot_owner`, since the packet arrives on
every kill.

## Wire notes

AzerothCore and wow_messages agree on the three bodies
(`wow_message_parser/wowm/world/loot/smsg_loot_list.wowm`,
`wow_message_parser/wowm/world/loot/cmsg_opt_out_of_loot.wowm`,
`wow_message_parser/wowm/world/social/cmsg_loot_method.wowm`).

- `SMSG_LOOT_LIST` is the full `uint64` creature guid, then the master
  looter as a packed guid and the group looter as a packed guid. The
  group form writes `uint8 0` for a missing master or looter
  (`Groups/Group.cpp:1085-1101`); the master is set only under master
  loot with an item over the threshold. The solo form writes `uint8 0`
  twice (`Entities/Unit/Unit.cpp:13615-13618`), which reads as two empty
  packed guids, so the area reads both forms the same way.
- The solo `SMSG_LOOT_LIST` goes to every player near the killer
  (`Entities/Unit/Unit.cpp:13619`), so `owners` also holds kills of
  other players. Its `mine` is `unknown`, as for a group form with no
  master and no looter, which the wire cannot tell apart from it.
  `mine` is `yes` when self is the master or the looter, and `no` when
  another player is.
- `CMSG_OPT_OUT_OF_LOOT` is a `uint32`, 1 to pass and 0 to stop passing
  (`Handlers/GroupHandler.cpp:1143-1152`).
- `CMSG_LOOT_METHOD` is `uint32` method, the full `uint64` master
  looter guid and `uint32` threshold (`Handlers/GroupHandler.cpp:518-521`).
  The server drops the
  packet with no reply when the sender is not the leader, the group is a
  dungeon-finder group, the method is over 4, the threshold is outside
  uncommon to artifact, or master loot names a non-member
  (`Handlers/GroupHandler.cpp:524-540`); otherwise it answers with
  `SMSG_GROUP_LIST` to every member (`Handlers/GroupHandler.cpp:546`).

The five loot methods are 0 to 4 in the order the act names them
(`Loot/LootMgr.h:56-63`), and the thresholds are item qualities 2 to 6
(`src/server/shared/SharedDefines.h:319-323`).

The pass flag starts off in every session (`Entities/Player/Player.cpp:215`),
and a player with it on passes at once on each group roll
(`Groups/Group.cpp:1160`).

## Left out

- Self as master looter. `SMSG_GROUP_LIST` leaves the receiving player
  out of its member list (`Groups/Group.cpp:1917-1918`), and the area
  resolves names only through that list, so `setLootMethod` refuses the
  character's own name.
- `SMSG_LOOT_MASTER_LIST` and `CMSG_LOOT_MASTER_GIVE`: built by
  `group-5`.

## Capabilities row

No verb. `setPassOnLoot` and `setLootMethod` are core acts that the
puppet reaches through its calls of the same names; the `group` tool of
`group-9b` and `group-10c` adds the rows.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_LOOT_LIST` | `live` | probe flow `looting-kill` (`--expect SMSG_LOOT_LIST`) on an `eversong10-warrior` moved to East Sanctum with `soap gm tele EastSanctum`, exit 0; one received, the solo form for the flow's target, which the flow printed as its owner with `mine: unknown` | `Entities/Unit/Unit.cpp:13615-13618` |
| `CMSG_OPT_OUT_OF_LOOT` | `builder` | sent live, effect not seen: `--send CMSG_OPT_OUT_OF_LOOT --body 01000000` in the same `looting-kill` probe run, exit 0 with no error, and the puppet call `setPassOnLoot ["on"]` with the character still in the world 10 s later; the effect needs a group roll on an uncommon drop. Builder test "CMSG_OPT_OUT_OF_LOOT writes u32 1 to pass and 0 to stop" | `Handlers/GroupHandler.cpp:1143-1152` |
| `CMSG_LOOT_METHOD` | `live` | two `eversong10` puppets in a party: the leader's call `setLootMethod ["master_loot", "uncommon", "<partner>"]` sent the 16-byte body with the partner's guid, and the server answered with `SMSG_GROUP_LIST` holding method 2, the partner as looter and threshold 2, read as the legacy `group_list` event with `loot.method` `master_loot`. The raw body with threshold 1 got no `SMSG_GROUP_LIST`, and the puppet stayed in the world | `Handlers/GroupHandler.cpp:516-546` |
| `SMSG_LOOT_ITEM_NOTIFY` | `dead` | `STATUS_NEVER` and no send site in AzerothCore; wow_messages has no definition | `Server/Protocol/Opcodes.cpp:487` |
