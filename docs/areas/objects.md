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
s; `pages` caches each read page chain by its first page id; the area also loads `GameObjectDisplayInfo.dbc` into a display catalog keyed by display id (bounds `minX`–`maxZ`, `src/server/shared/DataStores/DBCfmt.h:56`, loaded as `src/server/game/DataStores/DBCStores.cpp:321`), and object reach follows `GameObject::IsAtInteractDistance` (`src/server/game/Entities/GameObject/GameObject.cpp:3008-3028`): the interaction radius per type (`src/server/game/Entities/GameObject/GameObject.cpp:2898-2940`) widened by the scaled display bounds, falling back to the centre distance without the DBC file, while a plain use also needs the use-packet gate the server checks first (`src/server/game/Handlers/SpellHandler.cpp:336-339`): the centre distance inside the interaction radius plus the player size (`src/server/game/Entities/GameObject/GameObject.h:421-426`, `src/server/game/Entities/Object/Object.cpp:1514-1533`, `src/server/game/Entities/Object/Object.cpp:2897-2900`, `src/server/game/Entities/Object/ObjectDefines.h:44`); `triggers`
holds the state of the `AreaTrigger.dbc` catalog, the current map, the
triggers the character stands in and the triggers it has sent this
session; `lastMessage` holds the last trigger message and when it
arrived; `anims` keeps the last object animation by guid and
`despawning` keeps the guids the server played the despawn animation for
(bounded at 256), both cleared for a guid when it disappears; `fishing`
holds the fishing phase (`cast`, then `waiting` once the character's own
bobber appears, then `hooked` on its splash animation) and the bobber
guid, cleared when the fish is hooked-no-more, escapes, the cast fails
or the bobber disappears. The area emits `used`, `trigger_sent`,
`trigger_message`, `page_read`, `page_shown`, `page_unanswered`,
`fish_hooked`, `fish_not_hooked` and `fish_escaped` events, and its acts
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
  first, then the cast, as `use do: open` does) or, when the lock wants a
  key item, with `useItemOn`, and takes the loot with `lootObject`; any
  other usable object gets one use and a wait of 3 s for a quest update. A
  chest is wanted only while a required item it holds is still short of its
  count in the bags. An object whose visit moves no quest counter is picked
  again once and then dropped for the run; a chest whose loot was taken is
  dropped at once. After the last loot the loop waits up to 3 s for the
  quest-complete flag before it reports absent targets, and a unit that
  starts attacking mid-loop is fought through the engage path before the
  loop resumes. Eval `t4-objects-quest-loot` rewards quest 3903 at setup
  and starts at Milly Osworth by Northshire Abbey, so the agent takes
  quest 3904 itself and gathers the harvest from the vineyard crates
  through the use path.
- The guid of `SMSG_GAMEOBJECT_DESPAWN_ANIM` is not always a game
  object's.
  - A dynamic object sends the despawn animation with its own guid when
    it is removed (`Entities/DynamicObject/DynamicObject.cpp:182`).
- `SMSG_GAMEOBJECT_CUSTOM_ANIM` is the object guid and then a `uint32`
  anim (`Entities/GameObject/GameObject.cpp:2148-2154`).
  `SMSG_GAMEOBJECT_DESPAWN_ANIM` is one guid
  (`Entities/Object/Object.cpp:2189-2194`), which a deleted game object
  sends when it is removed.
  `SMSG_FISH_NOT_HOOKED` and `SMSG_FISH_ESCAPED` are empty
  (`Entities/GameObject/GameObject.cpp:1796-1803`, `:626-640`).
- A fishing cast (spell 7620, Fishing) moves `fishing` to `cast` on the
  character's own `SMSG_SPELL_START`; a failed cast while still in `cast`
  clears it. The own bobber (entry 35591, its `createdBy` the self guid)
  moves the phase to `waiting`; the bobber's splash animation sends
  `SMSG_GAMEOBJECT_CUSTOM_ANIM` in the last 5 s and moves it to `hooked`
  with a `fish_hooked` event
  (`Entities/GameObject/GameObject.cpp:498-521`). An early use answers
  an empty `SMSG_FISH_NOT_HOOKED` and no use after the splash an empty
  `SMSG_FISH_ESCAPED`, both clearing the state
  (`Entities/GameObject/GameObject.cpp:1796-1803`, `:626-640`).
- Fishing stage on a fresh `eversong10-fishing` character: auto-equip pole
  6256 from bag 255 slot 28 into slot 15, move it with an online
  `soap gm tele LakeElrendar` and log in again, then cast with no target and
  without a `facing` argument. The Lake Elrendar frogs kill a level 10
  character within a minute and a dead character's cast fails with result
  0x17 (`SPELL_FAILED_CASTER_DEAD`), so `soap gm revive` and the tele go
  before each try. About a third of the casts land in water; the rest fail
  with 0x3c (`SPELL_FAILED_NOT_HERE`, `Spells/Spell.cpp:1479`). The splash
  came 10.5 to 10.7 s into the 17 s channel and the escape 4 s after it.
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

Known gap: the skeleton key skill bonus is not modelled. For a skill
lock the server adds the effect base points of a key item's spell to the
skill value when the spell targets a game object item and is not a
lockpicking ability, and counts no character skill for a cast item
(`Spells/Spell.cpp:8746-8756`). `openLockSpell` compares the
character's own skill only, and its key path matches an item lock alone,
so a skeleton key never opens a skill lock through it.

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

`triggersNear(map, x, y, radius)` lists the catalog's triggers on a map
within `radius` yards of a point in the plane, nearest first, each with its
id and centre. The sphere test includes height, so the Fargodeep Mine
trigger 88 (z 5.37) lies about 33 yd below the hillside (ground at 38.14) and a walk to its
x and y on the surface never enters it.

## Left out

Nothing left out: every owned opcode is handled.

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
| `CMSG_USE_ITEM` | `live` | probe flow `objects-open` (`--arg entry=185220`, the Massive Treasure Chest, a type-3 chest whose Data0 is Lock.dbc entry 1726, a lock of type item that needs the Derelict Caravan Chest Key, item 31705) on a `max80` character given the key with `soap gm items 31705:1` (delivered by mail), retrieved at the Ironforge mailbox with probe `--send CMSG_GET_MAIL_LIST` and `CMSG_MAIL_TAKE_ITEM` (the mail then held no item), and moved with `soap gm tele DerelictCaravan`, exit 0 (kept packet trace lines 320-323 and 455): the flow sent `CMSG_GAMEOBJ_USE`, `CMSG_GAMEOBJ_REPORT_USE` and then `CMSG_USE_ITEM` with the key on the chest; the server answered `SMSG_SPELL_START` 8 ms later and `SMSG_LOOT_RESPONSE` at the end of the cast (no items offered). The object-target body is covered by builder tests (`item.test.ts`) and the key use by `useItemOn` in `runtime-open.test.ts` (Bamboo Cage Key 12301, on-use spell 3366) | `Handlers/SpellHandler.cpp:67-73`, `:193` |
| `SMSG_GAMEOBJECT_CUSTOM_ANIM` | `live` | probe flow `objects-fish` (`--arg use=hooked`) on an `eversong10-fishing` character with pole 6256 equipped, moved with an online `soap gm tele LakeElrendar` and logged in again, exit 0 (run `tmp/probe/objects-6-hooked1`): the cast (spell 7620, no target) got `MSG_CHANNEL_START` and the bobber (entry 35591); the splash `SMSG_GAMEOBJECT_CUSTOM_ANIM` for the bobber guid arrived 10.47 s into the 17 s channel and the area emitted `fish_hooked`; the flow used the bobber at once and the server answered `SMSG_LOOT_RESPONSE` for it 10 ms later (the rewards store, not asked to open it, drops that window; the server released it on logout) | `Entities/GameObject/GameObject.cpp:2148-2154` |
| `SMSG_GAMEOBJECT_DESPAWN_ANIM` | `live` | the same flow (`--arg use=3`, run `tmp/probe/objects-6-proof-noth`) and the escape run below: the bobber's guid came back in the despawn animation each time the bobber was removed (after `SMSG_FISH_NOT_HOOKED`, after `SMSG_FISH_ESCAPED`, and after the channel was cancelled), as `GameObject::Delete` sends it | `Entities/Object/Object.cpp:2189-2194` |
| `SMSG_FISH_NOT_HOOKED` | `live` | the same flow (`--arg use=3`, run `tmp/probe/objects-6-proof-noth`): the use 3 s after the cast, before the splash, was answered by the empty `SMSG_FISH_NOT_HOOKED` and then the despawn animation; the flow reported `fish_not_hooked` and the state cleared | `Entities/GameObject/GameObject.cpp:1796-1803` |
| `SMSG_FISH_ESCAPED` | `live` | the same flow with no use (`--arg seconds=40`, run `tmp/probe/objects-6-escapedb3`): the splash `SMSG_GAMEOBJECT_CUSTOM_ANIM` came 10.74 s after the cast and the empty `SMSG_FISH_ESCAPED` 4 s later, then `MSG_CHANNEL_UPDATE` and the despawn animation; the flow reported `fish_hooked` and `fish_escaped` | `Entities/GameObject/GameObject.cpp:626-640` |
