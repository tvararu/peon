# objects

The `objects` area keeps the game object templates the server sends,
uses game objects and sends area triggers as the character moves, keeps
the messages the server answers them with, and reads the page text of
books, plaques and shrines. World-service code reads it through
`session.areas.objects.state()`: `templates` maps each entry to its
template (type, display, names, the 24 data words, size, the quest items
that are set, and the lock id, page id and quest id read from the data
words by type, as `GameObjectTemplate::GetLockId` does,
`Entities/GameObject/GameObjectData.h:428-457`); `pendingUse` holds the
guid and entry of the last use and when it was sent, expiring after 5
s; `pages` caches each read page chain by its first page id; `triggers`
holds the state of the `AreaTrigger.dbc` catalog, the current map, the
triggers the character stands in and the triggers it has sent this
session; `lastMessage` holds the last trigger message and when it
arrived. The area emits `used`, `trigger_sent`, `trigger_message`,
`page_read`, `page_shown` and `page_unanswered` events, and its acts
`use(guid)` uses one object by hand, `open(guid, spellId)` casts an
open-lock spell at one object, `useItemOn(entry, target)` uses a carried
key on one object, `openLockSpell(entry)` picks the spell or key for a
lock, `enterTrigger(id)` sends one trigger by hand, and
`readPage(pageId)` resolves once with the chained pages, timing out
after 5 s. The harness `use` tool opens locked chests and quest objects
and reads shrines, plaques and books.

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
- `CMSG_PAGE_TEXT_QUERY` is a `uint32` page id and then a `uint64` guid
  the server skips (`Handlers/QueryHandler.cpp:361-366`).
- `SMSG_PAGE_TEXT_QUERY_RESPONSE` answers one `CMSG_PAGE_TEXT_QUERY` with
  the whole page chain, one packet per page
  (`Handlers/QueryHandler.cpp:367`, `:391`): each packet is a `uint32`
  page id, a C string and a `uint32` next page id. A missing page answers
  "Item page missing." with next page 0
  (`Handlers/QueryHandler.cpp:374-379`). The area keeps each chain under
  its first page id, reads at most 30 pages, and emits `page_read`;
  without a reply `readPage` times out after 5 s and emits
  `page_unanswered`.
- `SMSG_GAMEOBJECT_PAGETEXT` is one object guid of 8 bytes
  (`Entities/GameObject/GameObject.cpp:1630-1634`). The area looks up the
  object's template page id and emits `page_shown`; when the template has
  not arrived yet it keeps the guid and emits once it lands. A type-10
  goober with a page id answers the use with this packet.
- The quest loop treats an object as an objective in two ways. A quest
  target with a negative `npcOrGoId` is an object objective with the
  quest log counter at its index. A required item that no creature is
  named for is matched to the game objects whose template lists it among
  the quest items the server writes in the query reply
  (`Handlers/QueryHandler.cpp:205-211`). The loop only picks an object
  that carries `GO_DYNFLAG_LO_ACTIVATE`, which the server sets per player
  while the object serves an open quest (`Entities/GameObject/GameObject.cpp:2799-2811`).
  It walks to 3 yd, opens a chest with the spell of `openLockSpell` (a use
  first, then the cast, as `use do: open` does) and takes the loot with
  `lootObject`; any other usable object gets one use and a wait of 3 s
  for a quest update. An object whose visit fails is not tried again in
  that run. A live run on an `elwynn10` character raised to level 60,
  with quest 3904 staged by `soap gm quest add` and a teleport to the
  vineyard, looted 8 crates through the loop and `soap truth` showed the
  quest complete (status 1, item counts `[8, 0, 0, 0, 0, 0]`). The same run at
  level 20 looted 6 crates and then died to the vineyard thugs, whose hits
  interrupt the cast: the loop does not fight back.
- The guid of `SMSG_GAMEOBJECT_DESPAWN_ANIM` is not always a game
  object's.
  - A dynamic object sends the despawn animation with its own guid when
    it is removed (`Entities/DynamicObject/DynamicObject.cpp:182`).
- `CMSG_GAMEOBJ_USE` is one `ObjectGuid` (`Handlers/SpellHandler.cpp:329-347`).
  The server drops the use in silence when the object is too far; a
  type-2 quest giver answers by preparing and sending its gossip menu.
- `CMSG_GAMEOBJ_USE` doubles as the harness object proof: `look find:
  "object"` lists the nearby objects as `o<n>` refs with their template
  kind, distance, and the `quest`, `locked` and `busy` flags. `travel to:
  "o<n>"` stops inside the object's interaction distance minus 1 yd,
  because the server drops the use in silence past
  `obj->GetInteractionDistance()`
  (`Handlers/SpellHandler.cpp:329-347`). A harness run on
  a throwaway `elwynn1` character teleported to NorthshireVineyards listed 161557
  Milly's Harvest as `o1` 8 yd N and walked `travel to: o1` to 4.3 yd
  away.
- `CMSG_GAMEOBJ_REPORT_USE` follows the gossip: `interact npc: "o<n>"`
  talks to a type-2 quest giver by sending the use to the object guid,
  which runs the object's greeting (`Handlers/SpellHandler.cpp:350-376`).
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

`CMSG_GAMEOBJ_USE` doubles as the knock before an open-lock cast: the
probe sends it first (as the playerbot does,
`modules/mod-playerbots/src/Bot/PlayerbotAI.cpp:3738-3748`), then
`CMSG_CAST_SPELL` with the object target. The cast is a `uint8` cast
count, a `uint32` spell id, a `uint8` cast flag and then the targets the
server reads (`Handlers/SpellHandler.cpp:383`): a `uint32` mask, then a
packed guid for a unit or game object target, a packed guid for an item
target, and a zero packed transport guid plus three `f32` for a
destination (the targets the cast handler reads,
`Handlers/SpellHandler.cpp:441-445`). `CMSG_USE_ITEM` is bag, slot,
cast count, spell id, item guid, glyph index and cast flags, then the
same targets (`Handlers/SpellHandler.cpp:67-73`, `:193`). One
`writeSpellTargets` writer serves both bodies; a `bigint` still writes
today's unit bytes.

The target mask order (object guid, then item guid, then source and
destination locations) is the order the target reader consumes
(`Spells/Spell.cpp:163-200`).

The open-lock choice reads the lock table (format
`"niiiiiiiiiiiiiiiiiiiiiiiixxxxxxxx"`,
`src/server/shared/DataStores/DBCfmt.h:85`) into lock cases and picks
the spell with the effect-33 `miscValue` the lock index needs, the lock's
own spell for a spell case, or the key item the character carries
(`Entities/GameObject/GameObject.cpp:3035-3092`,
`Spells/Spell.cpp:8707-8760`). A skill case compares the player skill
its lock type names (lockpicking 633, herbalism 182, mining 186,
fishing 356, inscription 773, `src/server/shared/SharedDefines.h:3253-3271`);
other lock types need no skill. Skill values come from the self skill
info fields (`Entities/Player/Player.cpp:5631-5646`).

A key item opens through `useItemOn`, which uses the carried key on the
object with the key's on-use spell: the server casts only the item's
on-use spells, with the key as cast item
(`Entities/Player/Player.cpp:7623-7650`), and a key case passes only for
that cast item (`Spells/Spell.cpp:8726-8730`). A key without an on-use
spell answers `no_use_spell`.

Both `open` and `useItemOn` ask core's rewards for the loot window first
and give it back when the server reports that the spell failed, or when
no loot window arrives within 15 seconds. The failure body starts with
the cast count, the spell id and the result
(`Spells/Spell.cpp:4704-4708`).

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

- `SMSG_GAMEOBJECT_CUSTOM_ANIM`, `SMSG_GAMEOBJECT_DESPAWN_ANIM`,
  `SMSG_FISH_NOT_HOOKED` and `SMSG_FISH_ESCAPED`: built by `objects-6`.

## Capabilities row

| Use a game object and read a shrine plaque | `t0-objects-read-shrine` | |

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `CMSG_AREATRIGGER` | `live` | probe flow `objects-trigger` (`--arg to=` the centre of trigger 88) on an `elwynn10` character moved with `soap gm tele FargodeepMine` and given quest 62 while online, exit 0; the watcher sent trigger 88 once, the server answered `SMSG_QUESTUPDATE_COMPLETE`. A second run into trigger 78 at level 10 was answered with `SMSG_TRANSFER_PENDING` and `SMSG_NEW_WORLD` to map 36 | `Handlers/MiscHandler.cpp:691-697` |
| `SMSG_AREA_TRIGGER_MESSAGE` | `live` | probe flow `objects-trigger` (`--arg to=` the centre of trigger 78) on a level 1 `elwynn1` character moved with `soap gm tele TheDeadmines`, exit 0; the watcher sent trigger 78 and the flow reported the message "You must be at least level 10 to enter." | `Server/WorldSession.cpp:288-298` |
| `CMSG_GAMEOBJ_USE` | `live` | probe flow `objects-use` (`--arg entry=192709`, "The Schools of Arcane Magic - Abjuration", a type-10 goober with a page id) on a `fresh` character moved with `soap gm tele DalaranVisitorCenter`, exit 0; the flow walked to 2.0 yd, sent the use with the report use, and the server answered `SMSG_GAMEOBJECT_PAGETEXT` 4 ms later plus `SMSG_CRITERIA_UPDATE` | `Handlers/SpellHandler.cpp:336-346`, `Entities/GameObject/GameObject.cpp:1630-1634` |
| `CMSG_GAMEOBJ_REPORT_USE` | `accepted` | the same run sent the report use right after the use, with no disconnect and no error packet; builder tests cover the 8-byte body against `Handlers/SpellHandler.cpp:350-376` | `Handlers/SpellHandler.cpp:350-376` |
| `CMSG_PAGE_TEXT_QUERY` | `live` | probe flow `objects-read` (`--arg page=2936`) on a `fresh` character, exit 0; the client sent one `CMSG_PAGE_TEXT_QUERY` and the server answered `SMSG_PAGE_TEXT_QUERY_RESPONSE` with the shrine text starting "You have discovered the location of the shrine!" | `Handlers/QueryHandler.cpp:361-366` |
| `SMSG_PAGE_TEXT_QUERY_RESPONSE` | `live` | the same run read page 2936 in one packet; a second run with `--arg page=2147483647` answered "Item page missing." with next page 0 | `Handlers/QueryHandler.cpp:367-392` |
| `SMSG_GAMEOBJECT_PAGETEXT` | `live` | probe flow `objects-use` (`--arg entry=180516`, the Shrine of Dath'Remar, a type-10 goober with page 2936) on a `fresh` character moved with `soap gm tele ShrineOfDathRemar`, exit 0; the flow reported `shown` with guid 0xf11002c124000887 and page 2936 | `Entities/GameObject/GameObject.cpp:1630-1634` |
| `CMSG_CAST_SPELL` | `live` | probe flow `objects-open` (`--arg entry=161557`) on an `elwynn1` character given quest 3904, raised to level 20 so the vineyard thugs could not interrupt the cast, and moved with `soap gm tele NorthshireVineyards`, exit 0 (run `tmp/probe/FAC6ABA6E7843-20260928T134300Z`); the flow found Milly's Harvest (`0xf11002771500078e`), walked to 2.0 yards, chose spell 6478 from the lock, and sent the cast with the object target; the server answered `SMSG_SPELL_START` and then `SMSG_LOOT_RESPONSE` for the crate (no items offered). An earlier level 1 try was interrupted (`SMSG_CAST_FAILED` result 40) when thugs killed the character | `Handlers/SpellHandler.cpp:441-445` |
| `CMSG_USE_ITEM` | `mock` | object-target body covered by builder tests (`item.test.ts`) and the key use by `useItemOn` in `runtime-open.test.ts` (Bamboo Cage Key 12301, on-use spell 3366); no key-locked object was staged live, not seen live | `Handlers/SpellHandler.cpp:67-73`, `:193` |
