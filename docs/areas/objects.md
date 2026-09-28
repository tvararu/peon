# objects

The `objects` area keeps the game object templates the server sends,
uses game objects and sends area triggers as the character moves, and
keeps the messages the server answers them with. World-service code
reads it through `session.areas.objects.state()`: `templates` maps each
entry to its template (type, display, names, the 24 data words, size,
the quest items that are set, and the lock id, page id and quest id
read from the data words by type, as
`GameObjectTemplate::GetLockId` does,
`Entities/GameObject/GameObjectData.h:428-457`); `pendingUse` holds the
guid and entry of the last use and when it was sent, expiring after 5
s; `triggers` holds the state of the `AreaTrigger.dbc` catalog, the
current map, the triggers the character stands in and the triggers it
has sent this session; `lastMessage` holds the last trigger message
and when it arrived. The area emits `used`, `trigger_sent` and
`trigger_message` events, and its acts `use(guid)` uses one object by
hand and `enterTrigger(id)` sends one trigger by hand.

## Wire notes

- `SMSG_GAMEOBJECT_QUERY_RESPONSE` carries 24 `uint32` data words
  (`Handlers/QueryHandler.cpp:202`), then a `float` size and six
  `uint32` quest items (`Handlers/QueryHandler.cpp:203-211`). wow_messages
  declares six data words
  (`wow_message_parser/wowm/world/queries/smsg_gameobject_query_response.wowm:51`),
  which would misread the size and every quest item; the parser follows
  AzerothCore. A probe of entry 161557 on an `elwynn10` character read
  lock 43 and loot 10119. A missing entry comes back as the entry with the
  top bit set and nothing else (`Handlers/QueryHandler.cpp:220`). The
  legacy entity handler still owns the opcode for names; the area reads
  it with a peek.
  - `MAX_GAMEOBJECT_DATA` is 24 (`src/server/shared/SharedDefines.h:1603`).
- `GAMEOBJECT_DYNAMIC` is a `uint16` of dynamic flags and then a signed
  `int16` path progress (`Entities/GameObject/GameObject.cpp:2843-2844`).
  `GAMEOBJECT_CREATED_BY` is a guid over two fields. The area reads both
  from an object's raw fields with `objectFields(entity)`.
- `SMSG_PAGE_TEXT_QUERY_RESPONSE` answers one `CMSG_PAGE_TEXT_QUERY` with
  the whole page chain, one packet per page
  (`Handlers/QueryHandler.cpp:367`, `:391`).
- The guid of `SMSG_GAMEOBJECT_DESPAWN_ANIM` is not always a game
  object's.
  - A dynamic object sends the despawn animation with its own guid when
    it is removed (`Entities/DynamicObject/DynamicObject.cpp:182`).
- `CMSG_GAMEOBJ_USE` is one `ObjectGuid` (`Handlers/SpellHandler.cpp:329-347`).
  The server drops the use in silence when the object is too far; a
  type-2 quest giver answers by preparing and sending its gossip menu.
- `CMSG_GAMEOBJ_REPORT_USE` is one packed guid. The server ignores an
  unselectable or too-far object, runs the object's SmartAI greeting,
  then updates the use-object achievement criteria
  (`Handlers/SpellHandler.cpp:350-376`). A type-10 goober with a page
  id answers the use with `SMSG_GAMEOBJECT_PAGETEXT`, one guid of 8
  bytes (`Entities/GameObject/GameObject.cpp:1630-1634`).
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

- `CMSG_PAGE_TEXT_QUERY`, `SMSG_PAGE_TEXT_QUERY_RESPONSE` and
  `SMSG_GAMEOBJECT_PAGETEXT`: built by `objects-3`.
- `SMSG_GAMEOBJECT_CUSTOM_ANIM`, `SMSG_GAMEOBJECT_DESPAWN_ANIM`,
  `SMSG_FISH_NOT_HOOKED` and `SMSG_FISH_ESCAPED`: built by `objects-6`.

## Capabilities row

No verb for area triggers: core sends them while the character walks.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_GAMEOBJ_USE` | `live` | probe flow `objects-use` (`--arg entry=192709`, "The Schools of Arcane Magic - Abjuration", a type-10 goober with a page id) on a `fresh` character moved with `soap gm tele DalaranVisitorCenter`, exit 0; the flow walked to 2.0 yd, sent the use with the report use, and the server answered `SMSG_GAMEOBJECT_PAGETEXT` 4 ms later plus `SMSG_CRITERIA_UPDATE` | `Handlers/SpellHandler.cpp:336-346`, `Entities/GameObject/GameObject.cpp:1630-1634` |
| `CMSG_GAMEOBJ_REPORT_USE` | `accepted` | the same run sent the report use right after the use, with no disconnect and no error packet; builder tests cover the 8-byte body against `Handlers/SpellHandler.cpp:350-376` | `Handlers/SpellHandler.cpp:350-376` |
