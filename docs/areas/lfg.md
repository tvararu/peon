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

## Left out

- `CMSG_LFG_JOIN`, `CMSG_LFG_LEAVE`, `SMSG_LFG_JOIN_RESULT`,
  `SMSG_LFG_QUEUE_STATUS`, `CMSG_SET_LFG_COMMENT`,
  `CMSG_LFG_SET_ROLES`, `SMSG_LFG_ROLE_CHECK_UPDATE` and
  `SMSG_LFG_ROLE_CHOSEN`: built by `instances-7`.
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
| `CMSG_LFD_PARTY_LOCK_INFO_REQUEST` | `live` | partner group, `call requestPartyLocks`; the A trace `tmp/lfg-party-locks-packets.jsonl` shows the `out` packet with size 0 | `Handlers/LFGHandler.cpp:230-263` |
| `SMSG_LFG_PARTY_INFO` | `live` | partner group, `call requestPartyLocks`; the same trace shows `in` size 1061, outcome `handled`, 13 ms after the request | `Handlers/LFGHandler.cpp:255-262` |
| `SMSG_LFG_UPDATE_SEARCH` | `live` | probe flow `lfg-status`, exit 0; sent at logout | `Handlers/LFGHandler.cpp:613-619` |
| `SMSG_LFG_DISABLED` | `dead` | no caller for `SendLfgDisabled`; a join with no reply means off | `Handlers/LFGHandler.cpp:621-626` |
