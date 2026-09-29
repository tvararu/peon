# lfg

The `lfg` area keeps the character's dungeon finder status, the random
dungeons it may queue for with their lock reasons, the party members'
locks and the raid-browser search flag. World-service code reads it
through `session.areas.lfg.state()`. The area emits `status` and
`dungeons` events. Three acts ask the server for the status, the
player's dungeons and the party's locks; the queue, role check and
proposal acts belong to later tasks.

## Wire notes

- `SMSG_LFG_UPDATE_PARTY` with data is join, queued, two zeroes, three
  more zeroes, the count, the entries and the comment
  (`Handlers/LFGHandler.cpp:362-368`), seven flag bytes where
  `wow_messages` `lfg/smsg_lfg_update_party.wowm` has four. AzerothCore
  wins.
- `SMSG_LFG_PLAYER_INFO` is a `u8` random count, one reward block per
  dungeon and a `u32` lock count
  (`Handlers/LFGHandler.cpp:152-228`), where `wow_messages`
  `lfg/smsg_lfg_player_info.wowm` has a `u8` count. AzerothCore wins.
- Only update types 5 and 12 carry queued true, so `SMSG_LFG_UPDATE_PLAYER`
  maps 5 and 12 to `queued`, 4, 6, 7, 8 and 9 to `none`, 13 to `proposal`
  and 14 to `queued` when its queued byte is set
  (`Handlers/LFGHandler.cpp:302-337`).
- The `ghostlands20` probe shows the finder enabled: the status flow
  receives `SMSG_LFG_UPDATE_PLAYER` and `SMSG_LFG_UPDATE_PARTY`, and the
  logout sends `SMSG_LFG_UPDATE_SEARCH`
  (`Handlers/LFGHandler.cpp:613-619`). The default options mask is 5
  (`worldserver.conf.dist:3471`).
- At level 20 the server offers one random dungeon, entry 100663554
  (id 258, type 6), and locks the rest with status 2 (`too_low_level`).
- `SMSG_LFG_DISABLED` has no caller: only
  `WorldSession::SendLfgDisabled` writes `SMSG_LFG_DISABLED`
  (`Handlers/LFGHandler.cpp:621-626`), so the client learns a disabled
  finder from a `CMSG_LFG_JOIN` with no reply
  (`Handlers/LFGHandler.cpp:50-55`).
- `CMSG_LFG_JOIN` is roles `u32`, two flag bytes, a `u8` entry count, one
  `u32` per entry, the constant `u8` 3, three `u8` needs and the comment
  CString (`Server/Packets/LFGPackets.cpp:20-34`); at most 50 entries
  (`Server/Packets/LFGPackets.h:34`).
- `SMSG_LFG_JOIN_RESULT` is `u32` result, `u32` state and the party lock
  block only when locks exist (`Handlers/LFGHandler.cpp:441-454`).
- `SMSG_LFG_QUEUE_STATUS` is the dungeon `u32`, five signed wait `i32`,
  three `u8` role counts and the queued `u32`
  (`Handlers/LFGHandler.cpp:456-473`).
- `SMSG_LFG_ROLE_CHOSEN` is the member `u64`, a ready `u8` and the roles
  `u32` (`Handlers/LFGHandler.cpp:383-392`); `SMSG_LFG_ROLE_CHECK_UPDATE`
  is the state `u32`, an initializing `u8`, a dungeon count, the entries,
  a member count and per member `u64`, ready `u8`, roles `u32`, level
  `u8` with the leader first (`Handlers/LFGHandler.cpp:394-439`).
- The `ghostlands20` queue flow joins entry 100663554 (id 258, type 6) as
  damage with comment `peon`, sees the join result, a type-5 update and
  the queue status, then leaves and sees the type-7 update. A two-puppet
  group starts a role check on the leader's join; both puppets see
  `SMSG_LFG_ROLE_CHECK_UPDATE` and `SMSG_LFG_ROLE_CHOSEN`, and the server
  follows with a proposal (`SMSG_LFG_PROPOSAL_UPDATE`, instances-8).

## Left out

- `SMSG_LFG_PROPOSAL_UPDATE`, `CMSG_LFG_PROPOSAL_RESULT`,
  `CMSG_LFG_TELEPORT`, `SMSG_LFG_TELEPORT_DENIED`,
  `SMSG_LFG_OFFER_CONTINUE`, `CMSG_LFG_SET_BOOT_VOTE`,
  `SMSG_LFG_BOOT_PROPOSAL_UPDATE` and `SMSG_LFG_PLAYER_REWARD`: built by
  `instances-8`.
- `CMSG_SEARCH_LFG_JOIN`, `CMSG_SEARCH_LFG_LEAVE` and
  `SMSG_UPDATE_LFG_LIST`: built by `instances-9`.
- A non-leader in a partly filled `CMSG_LFG_JOIN` group may join
  (`Handlers/LFGHandler.cpp:50-55`); the join act still refuses
  `not_leader` for every non-leader (SR2-instances-15).

## Capabilities row

No verb (N23).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_LFG_GET_STATUS` | `live` | probe flow `lfg-status`, exit 0; both updates follow | `Handlers/LFGHandler.cpp:281-300` |
| `SMSG_LFG_UPDATE_PLAYER` | `live` | probe flow `lfg-status`, exit 0; solo body is type 0 with no data | `Handlers/LFGHandler.cpp:302-337` |
| `SMSG_LFG_UPDATE_PARTY` | `live` | probe flow `lfg-status`, exit 0; solo body is type 0 with no data | `Handlers/LFGHandler.cpp:339-381` |
| `CMSG_LFD_PLAYER_LOCK_INFO_REQUEST` | `live` | probe flow `lfg-status`, exit 0; player info follows | `Handlers/LFGHandler.cpp:152-228` |
| `SMSG_LFG_PLAYER_INFO` | `live` | probe flow `lfg-status`, exit 0; one random dungeon at level 20 | `Handlers/LFGHandler.cpp:169-227` |
| `CMSG_LFD_PARTY_LOCK_INFO_REQUEST` | `mock` | mock request body built by `buildPartyLockInfoRequest`; the two-puppet request trace was not retained, so not seen live | `Handlers/LFGHandler.cpp:230-263` |
| `SMSG_LFG_PARTY_INFO` | `mock` | mock party body built by `lfgPartyInfoBody`; the two-puppet reply trace was not retained, so not seen live | `Handlers/LFGHandler.cpp:230-263` |
| `SMSG_LFG_UPDATE_SEARCH` | `live` | probe flow `lfg-status`, exit 0; sent at logout | `Handlers/LFGHandler.cpp:613-619` |
| `SMSG_LFG_DISABLED` | `dead` | no caller for `SendLfgDisabled`; a join with no reply means off | `Handlers/LFGHandler.cpp:621-626` |
| `CMSG_LFG_JOIN` | `live` | probe flow `lfg-queue`, exit 0; trace shows `out` size 20, then `SMSG_LFG_JOIN_RESULT` | `Handlers/LFGHandler.cpp:50-55` |
| `SMSG_LFG_JOIN_RESULT` | `live` | probe flow `lfg-queue`, exit 0; trace shows `in` size 8, `handled`, same tick as the type-5 update | `Handlers/LFGHandler.cpp:441-454` |
| `SMSG_LFG_QUEUE_STATUS` | `live` | probe flow `lfg-queue`, exit 0; two `in` rows of size 31, `handled`, during the 12 s wait | `Handlers/LFGHandler.cpp:456-473` |
| `CMSG_LFG_LEAVE` | `live` | probe flow `lfg-queue`, exit 0; trace shows `out` size 0, then the type-7 update | `Handlers/LFGHandler.cpp:78-93` |
| `CMSG_SET_LFG_COMMENT` | `live` | probe flow `lfg-queue`, exit 0; trace shows `out` size 5 before the join | `Handlers/LFGHandler.cpp:122-131` |
| `CMSG_LFG_SET_ROLES` | `mock` | mock request body built by `buildLfgSetRoles`; the two-puppet `setRoles` trace was not retained, so not seen live | `Handlers/LFGHandler.cpp:106-120` |
| `SMSG_LFG_ROLE_CHECK_UPDATE` | `mock` | mock check body built by `lfgRoleCheckUpdateBody`; the two-puppet group trace was not retained, so not seen live | `Handlers/LFGHandler.cpp:394-439` |
| `SMSG_LFG_ROLE_CHOSEN` | `mock` | mock answer body built by `lfgRoleChosenBody`; the two-puppet group trace was not retained, so not seen live | `Handlers/LFGHandler.cpp:383-392` |
