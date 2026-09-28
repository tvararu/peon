# objects

The `objects` area sends area triggers as the character moves and keeps
the messages the server answers them with. World-service code reads it
through `session.areas.objects.state()`: `triggers` holds the state of the
`AreaTrigger.dbc` catalog, the current map, the triggers the character
stands in and the triggers it has sent this session; `lastMessage` holds
the last trigger message and when it arrived. The area emits
`trigger_sent` and `trigger_message` events, and its act
`enterTrigger(id)` sends one trigger by hand.

## Wire notes

- `CMSG_AREATRIGGER` is one `uint32`, the trigger id
  (`Handlers/MiscHandler.cpp:691-697`). The server ignores it while the
  character is on a taxi flight (`Handlers/MiscHandler.cpp:699-704`) and
  when the character is not in the trigger.
- `SMSG_AREA_TRIGGER_MESSAGE` is a `uint32` length and then a C string.
  The server writes one packet per line, with the length of that line
  plus one, but the string runs from that line to the end of the whole
  message (`Server/WorldSession.cpp:288-298`). A packet of a message with
  more than one line therefore holds more bytes than its length says. The
  parser reads to the NUL and ignores the length. wow_messages declares
  the body as one `SizedCString`
  (`wow_message_parser/wowm/world/gameobject/smsg_area_trigger_message.wowm:3-5`),
  whose length covers the whole string, so it agrees with AzerothCore
  only for a message of one line.

The catalog reads `AreaTrigger.dbc` from the configured `spell_data_dir`
(ten fields of four bytes: id, map, x, y, z, radius, length, width,
height, orientation, in the order the server loads its `areatrigger`
table, `Globals/ObjectMgr.cpp:7251`). Without the file the watcher stays
off and `triggers.catalog` says `none` or `failed`.

The watcher tests the triggers of the current map after each movement
packet the character sends. A trigger with a radius is a sphere; one
without is a box turned by its orientation, as the server checks it
(`Entities/Player/Player.cpp:2218-2238`,
`Entities/Object/Position.cpp:118-141`). The server subtracts the
character's size from the distance (`Entities/Object/Object.cpp:1316-1320`),
so its test is a little looser than the watcher's. The watcher sends each
trigger once on entry and again only after the character leaves it. It
sends nothing while the self unit has the taxi flight flag. After a login,
a far teleport or a near teleport it marks the triggers at the arrival
point as entered without sending them, so a teleport never bounces the
character back through a portal.

## Left out

- `CMSG_GAMEOBJ_USE` and `CMSG_GAMEOBJ_REPORT_USE`: built by `objects-2`.
- `CMSG_PAGE_TEXT_QUERY`, `SMSG_PAGE_TEXT_QUERY_RESPONSE` and
  `SMSG_GAMEOBJECT_PAGETEXT`: built by `objects-3`.
- `SMSG_GAMEOBJECT_CUSTOM_ANIM`, `SMSG_GAMEOBJECT_DESPAWN_ANIM`,
  `SMSG_FISH_NOT_HOOKED` and `SMSG_FISH_ESCAPED`: built by `objects-6`.

## Capabilities row

No verb for area triggers: core sends them while the character walks.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_AREATRIGGER` | `live` | probe flow `objects-trigger` (`--arg to=` the centre of trigger 88) on an `elwynn10` character moved with `soap gm tele FargodeepMine` and given quest 62 while online, exit 0; the watcher sent trigger 88 once, the server answered `SMSG_QUESTUPDATE_COMPLETE`. A second run into trigger 78 at level 10 was answered with `SMSG_TRANSFER_PENDING` and `SMSG_NEW_WORLD` to map 36 | `Handlers/MiscHandler.cpp:691-697` |
| `SMSG_AREA_TRIGGER_MESSAGE` | `live` | probe flow `objects-trigger` (`--arg to=` the centre of trigger 78) on a level 1 `elwynn1` character moved with `soap gm tele TheDeadmines`, exit 0; the watcher sent trigger 78 and the flow reported the message "You must be at least level 10 to enter." | `Server/WorldSession.cpp:288-298` |
