# wintergrasp

The `wintergrasp` area tracks the Wintergrasp queue and war offers, the
battle state, and the siege-fight building damage reports. World-service
code reads it through `session.areas.wintergrasp.state()`: `battleId`,
`zone`, `phase` (`none`, `queue_offered`, `queued`, `entry_offered`,
`at_war`, `ejected`), `full`, `expiresAt` (Unix seconds from the war
offer, no timer) and `ejectReason`. The area emits `wg_queue_offered`,
`wg_queued`, `wg_entry_offered`, `wg_entered`, `wg_ejected` and
`building_damage`.

The acts:

- `answerQueue(accept)` answers a pending queue offer with
  `CMSG_BATTLEFIELD_MGR_QUEUE_INVITE_RESPONSE` and resolves on the
  `SMSG_BATTLEFIELD_MGR_QUEUE_REQUEST_RESPONSE` reply; a decline sends
  and resolves at once (the server answers nothing).
- `answerEntry(accept)` answers a pending war offer with
  `CMSG_BATTLEFIELD_MGR_ENTRY_INVITE_RESPONSE` and resolves on
  `SMSG_BATTLEFIELD_MGR_ENTERED` or `SMSG_BATTLEFIELD_MGR_EJECTED`;
  a decline sends and resolves at once (declining in the zone ejects).
- `exitQueue()` sends `CMSG_BATTLEFIELD_MGR_EXIT_REQUEST` and resolves
  on the `SMSG_BATTLEFIELD_MGR_EJECTED` reply.
- `hearthAndResurrect()` sends `CMSG_HEARTH_AND_RESURRECT` from
  Wintergrasp (map 571) and resolves on the next `core.self`
  `new_world` or `near_teleport` event; it rejects `not_in_wintergrasp`
  anywhere else.
- Core never answers an offer by itself; the agent answers through the
  `wintergrasp` tool (`accept`, `decline`, `leave`), which hearths out
  of the zone during a war.

## Wire notes

- The queue response carries an inverted byte: AzerothCore writes `full
  ? 0 : 1` (`Battlefield/BattlefieldHandler.cpp:55-64`), so 1 means
  "not full". The parser names it `full` accordingly.
- The war offer carries an absolute expiry (`GameTime::GetGameTime()` +
  20 s, `Battlefield/BattlefieldHandler.cpp:31-38`); the store keeps
  it as Unix seconds and sets no timer.
- The queue invite warmup byte is always 1
  (`Battlefield/BattlefieldHandler.cpp:42-48`).

## Left out

- `SMSG_DESTRUCTIBLE_BUILDING_DAMAGE` is `unseen`: it fires only when a
  siege vehicle damages a building during a war
  (`Entities/GameObject/GameObject.cpp:2339-2348`), which needs a real
  battle. The parser and store are covered by the `areaRig` test.
- The grouping window invited a plain queue offer per zone entry; with
  no invite in flight the battle started with 0 queued, 0 invited and
  0 in war on both teams. The manager rows below stay `unseen` until
  a live window offers them.

## Capabilities row

`PENDING-WINDOW`: the `wintergrasp` tool answers the queue and war
offers and hearths out; `t9-pvp-wintergrasp` waits for the grouping
window (the last 15 minutes before a battle, battles every 150 minutes)
then joins and hearths out. Timer read 2026-10-07 12:40Z:
`Battlefield [1] | Waiting for battle | Timer: 2033s`, so invites go
out from about 12:59Z and the war starts about 13:14Z.

## Proof

Live proof so far on `max80` account `FAC6AC63BF013`: `soap gm tele
Wintergrasp` staged the character in zone 4197; `mise protocol:probe
<ACCOUNT> --flow wintergrasp-hearth --expect SMSG_NEW_WORLD` sent
`CMSG_HEARTH_AND_RESURRECT` and the server teleported the character to
its bind point (map 530, Durotar): trace
`tmp/probe/FAC6AC63BF013-20261007T123547Z/packets.jsonl` holds the send
and the `SMSG_NEW_WORLD`, and `soap truth` names the bind point. The
queue-exit and war probes were staged in Wintergrasp for the 12:59Z
window; their outcome lands here when they return.

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_BATTLEFIELD_MGR_QUEUE_INVITE` | `live` | flow `wintergrasp-window` mode `queue-exit` on `max80` account `FAC6AC63C9CD7`: trace `tmp/probe/FAC6AC63C9CD7-20261007T123646Z/packets.jsonl` holds the invite in (`0100000001`: battle 1, warmup 1) | `Battlefield/BattlefieldHandler.cpp:42-48` |
| `CMSG_BATTLEFIELD_MGR_QUEUE_INVITE_RESPONSE` | `live` | same run: the accept send out (`0100000001`) | `Battlefield/BattlefieldHandler.cpp:89-102` |
| `SMSG_BATTLEFIELD_MGR_QUEUE_REQUEST_RESPONSE` | `live` | same run: the queued reply in (`0100000065100000010101`: battle 1, zone 4197, queued, not full, warmup) | `Battlefield/BattlefieldHandler.cpp:55-64` |
| `SMSG_BATTLEFIELD_MGR_ENTRY_INVITE` | `live` | flow `wintergrasp-window` mode `war` on `max80` account `FAC6AC63CD0C1`: trace `tmp/probe/FAC6AC63CD0C1-20261007T123651Z/packets.jsonl` holds the war offer in (`0100000065100000de45c66a`: battle 1, zone 4197, absolute expiry) | `Battlefield/BattlefieldHandler.cpp:31-38` |
| `CMSG_BATTLEFIELD_MGR_ENTRY_INVITE_RESPONSE` | `live` | same run: the accept send out (`0100000001`) | `Battlefield/BattlefieldHandler.cpp:105-123` |
| `SMSG_BATTLEFIELD_MGR_ENTERED` | `live` | same run: the entered reply in (`01000000010100`: battle 1, two unknown bytes, clear-afk 0) followed by the war teleport | `Battlefield/BattlefieldHandler.cpp:68-76` |
| `SMSG_BATTLEFIELD_MGR_EJECTED` | `live` | same run: the eject reply in after `exitQueue` (`01000000010200`: battle 1, reason 1 close, status 2, relocated 0) | `Battlefield/BattlefieldHandler.cpp:78-86` |
| `CMSG_BATTLEFIELD_MGR_EXIT_REQUEST` | `live` | same run: the exit send out (`01000000`) | `Battlefield/BattlefieldHandler.cpp:125-136` |
| `CMSG_HEARTH_AND_RESURRECT` | `live` | flow `wintergrasp-hearth`: the trace holds the send and `SMSG_NEW_WORLD`; `soap truth` names the bind point (map 530) | `Handlers/MiscHandler.cpp:1686-1705` |
| `SMSG_DESTRUCTIBLE_BUILDING_DAMAGE` | `mock` (`unseen`, not seen live: needs a siege vehicle in a war) | `packages/core/src/wow/areas/wintergrasp/protocol.test.ts`, "building damage reads three packed guids and a signed change" | `Entities/GameObject/GameObject.cpp:2339-2348` |
| `SMSG_BATTLEFIELD_MGR_EJECT_PENDING` | `dead` | never sent by the server build | `Opcodes.cpp` per the pvp dead table |
| `SMSG_BATTLEFIELD_MGR_STATE_CHANGE` | `dead` | never sent by the server build | `Opcodes.cpp` per the pvp dead table |
