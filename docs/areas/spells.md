# spells

The `spells` area tracks the character's own channelled spells. The
channel lives in the cast tracker (`core.combat.casts.channel`), so a new
cast or item use is refused with `channelling` while it runs and `halt()`
cancels it with `CMSG_CANCEL_CHANNELLING`. World-service code reads it
through `session.areas.spells.state().channel` (spell, target, duration,
remaining time and expected end) and stops it with
`act.cancelChannel()`, which refuses with `not_channelling` or
`cancel_requested` and then sends nothing. The area emits
`channel_start` and `channel_end`; `channel_end` gives the reason
`finished`, `interrupted` or `cancelled`. `state().unitCasts` keeps the
current cast or channel of every other unit in view (guid, spell, kind,
start, duration, target and whether the caster targets the character or
attacks it), read through `castOf(guid)`. A timed `SMSG_SPELL_START`
opens an entry and emits `unit_cast_start`; `SMSG_SPELL_GO` ends it
`succeeded` and `SMSG_SPELL_FAILURE` or `SMSG_SPELL_FAILED_OTHER` ends
it `interrupted`, each emitting `unit_cast_end`, while instant casts
open nothing. `state().totems` keeps the four totem slots (fire 0, earth
1, water 2, air 3) with the totem guid, spell and expiry, fed by
`SMSG_TOTEM_CREATED`; a create for an occupied slot ends the old totem
as `replaced`. A totem clears when its guid disappears (`gone`), when
its duration runs out (`expired`), or after `act.destroyTotem(slot)`
sends `CMSG_TOTEM_DESTROYED` and the totem disappears (`destroyed`).
The area emits `totem_created` and `totem_gone`, and the harness writes
"Stoneskin Totem placed (earth)." and the gone row. The destroy act
refuses `invalid_slot` for a slot outside 0-3 and `no_totem` for an
`MSG_CHANNEL_START` and `MSG_CHANNEL_UPDATE` do the same for channels
(an update 0 waits 50 ms for the `SMSG_SPELL_FAILURE` AzerothCore sends
with each cancelled channel and ends `finished` when none comes).
Entries expire 1000 ms after their end and drop
when the caster disappears. The harness writes a row only for a caster the
character targets or that attacks it (`relevant` is 1 on the event):
`spells/target_start` "Scourge Invader starts casting Shadow Bolt." and, when
such a cast ends `interrupted`, `spells/target_interrupted`; other casters and
other outcomes write no row. `look` adds "channelling Arcane Missiles, 3 s
left" to the self line while a channel runs and "casting Fireball, 1.2 s left"
to the target line while the target has a cast in progress, and Jev's
observation carries the same cast as `targetCast` (spell, kind, duration and
time left).
`act.cancelAura(spellId)` drops one of the character's own auras with
`CMSG_CANCEL_AURA`. It refuses, and sends nothing, what the server would
drop in silence: `invalid_spell` for an id that is not a positive
integer, `not_cancellable` for a spell with `SPELL_ATTR0_NO_AURA_CANCEL`,
a passive spell or an aura with `AFLAG_NEGATIVE`, and `not_aura` when
the character wears no aura of the spell. A channelled spell id cancels
the running channel through `cancelChannel` (`not_channelling` when that
spell is not the channel). The attribute checks need the spell data;
without it the act checks only the aura flags. `act.cancelGrowthAura()`
sends the empty `CMSG_CANCEL_GROWTH_AURA`. `state().skills` keeps the
character's skill lines (id, name, step, value, max and both bonuses),
read from the 128 `PLAYER_SKILL_INFO` triples at update field 636. A
self update that adds an id or moves a value or max emits
`skill_changed` (with no `from` for a new id), and one that drops an id
emits `skill_removed`; the first read only seeds the baseline. The
harness writes `spells/skill_changed` "Mining is now 12/75." at most
once per skill per minute ("Mining learned, 1/75." for a new id) and
`spells/skill_removed` "Mining dropped.". `state().runes` keeps the death knight's
six runes (index, current type, readiness, elapsed cooldown byte and regen rate),
`undefined` for any other class, read from the class byte and the four
`PLAYER_RUNE_REGEN_1` rates in the self update, from the ready and spent masks and
the elapsed bytes of a peeked self `SMSG_SPELL_GO` rune list, and from
`SMSG_CONVERT_RUNE`, which changes one rune's type and emits `rune_converted` with
the index and both types. The base layout is two blood, two unholy and two frost;
the four rates start at 0.1. `act.unlearnSkill(id)` drops
a primary profession with `CMSG_UNLEARN_SKILL`; it refuses, and sends
nothing, `invalid_skill` for a non-positive id, `not_profession` for an
id outside the primary list, and `not_known` for a profession the
character lacks.

`act.setActionButton(slot, button)` puts a spell, item, macro or
equipment set on one of the 144 action buttons with
`CMSG_SET_ACTION_BUTTON`; `undefined` clears the slot. The server sends
no reply, so the act updates the bar store (`getActionBar()`) when it
sends, as the client does. It refuses with `invalid_button`, and sends
nothing, what the server would drop in silence: a slot outside 0-143, an
id outside 1-0xFFFFFF, an unknown type, or a spell the character has not
learned. Whether an item id exists needs the server's item data, so the
act sends any item id. `act.setActionBarToggles(mask)` shows or hides
the extra bars with `CMSG_SET_ACTIONBAR_TOGGLES` and refuses a mask
outside 0-255 with `invalid_mask`. `state().barToggles` is the mask the
server last set on the character, and stays undefined until a self
update carries it.

`state().inactiveRanks` lists the lower spell ranks the server marks as
superseded; each `SMSG_SEND_UNLEARN_SPELLS` replaces the list.
`state().modifiers.flat` and `state().modifiers.pct` hold the talent and
aura spell-modifier totals, keyed by modifier op and then by the effect
mask bit. The server sends the total for one op and bit, so the latest
packet replaces the value, and a total of 0 removes the bit. When
`SMSG_MODIFY_COOLDOWN` names the character, the cast tracker moves that
spell's cooldown by the signed delta and marks it as the server's; the
area makes no cooldown for a spell that has none. None of these emits
an event.

`SMSG_PLAY_SPELL_VISUAL` and `SMSG_PLAY_SPELL_IMPACT` emit
`spell_visual` with the unit's guid, the visual kit and `impact` set for
the impact packet. The area keeps no state for them, and the harness
writes no log row. A trainer purchase sends both: the visual names the
trainer and the impact names the character.

The harness `spell` tool drives these acts. `do: "cast"` casts a known
spell by name or id on the character or on a `u<n>` unit through
`handle.cast`, takes the highest visible rank of a name, and is `DONE`
on the cast's success or a channel start, `FAILED` with the core reason,
or `UNCONFIRMED` when nothing answers within the cast time plus 3 s.
`do: "cancel_aura"` calls `act.cancelAura` and is `DONE` when the next
aura update removes the aura within 2 s. A mount aura cancels the same
way: the server treats it like any positive non-passive aura
(`Handlers/SpellHandler.cpp:568-601`). `do: "bar"` writes slot 1-144 as
0-143 with `act.setActionButton`, and a call with neither spell nor item
clears the slot. `do: "unlearn_profession"` names a profession or skill id,
refuses `needs_confirm` without `confirm: true`, and is `DONE` when the skill
leaves `state().skills` within 3 s. `do: "destroy_totem"` names the element
(fire 0, earth 1, water 2, air 3) and is `DONE` when the slot clears.
`journal about: "spells"` lists up to four cancellable
auras, four filled bar slots, four professions, four totems and four runes
before the spellbook, and leaves out the
ranks in `inactiveRanks`.

## Wire notes

- `MSG_CHANNEL_START` is the packed guid of the caster, the `uint32`
  spell and the `uint32` duration in milliseconds
  (`Spells/Spell.cpp:5362-5385`,
  `wow_message_parser/wowm/world/spell/msg_channel_start.wowm`).
- A channel with no end writes `0xFFFFFFFF` as its duration
  (`Spells/Spell.cpp:4247-4250`); the area reads it as no duration.
- `MSG_CHANNEL_UPDATE` is the packed guid of the caster and the `uint32`
  remaining time (`Spells/Spell.cpp:5342-5359`,
  `wow_message_parser/wowm/world/spell/msg_channel_update.wowm`). A
  non-zero value is pushback after a hit; 0 ends the channel.
- Pushback takes 25% of the channel duration per hit and sends the new
  remaining time (`Spells/Spell.cpp:8129-8173`). When pushback shortens
  the channel to zero the server sends the 0 update with no failure
  packet (`Spells/Spell.cpp:8147-8169`, `:4565-4580`), so the area
  reports it `finished` however early it comes.
- The server sends the spell-go packet before the channel start
  (`Spells/Spell.cpp:4072`, `Spells/Spell.cpp:4155`,
  `Spells/Spell.cpp:4243`), so the cast looks finished while the channel
  still runs.
- On an interrupt or a cancel the server sends the channel update 0
  first and the spell failure after it (`Spells/Spell.cpp:3845-3846`).
  The area therefore reads the reason at the 0 update: `cancelled` when
  the character asked to cancel, `interrupted` when a failure for the
  spell came first or the expected end (start plus duration, moved by
  each pushback update) is more than 400 ms away, else `finished`. A
  channel with no duration that ends without a cancel is `interrupted`.
- `CMSG_CANCEL_CAST` interrupts the channel with `bySelf` set
  (`Handlers/SpellHandler.cpp:565`).
- A cancel with `bySelf` set sends neither the 0 update nor the failure
  (`Spells/Spell.cpp:3834-3847`). The area therefore also ends the
  channel when the character's `UNIT_CHANNEL_SPELL` goes back to 0 after
  it named the spell, and the tracker stops refusing casts 2 s after the
  expected end.
- The server sets `UNIT_FIELD_CHANNEL_OBJECT` after it sends
  `MSG_CHANNEL_START` (`Spells/Spell.cpp:5380-5382`), so the channel
  target is the cast's target until the field arrives.
- `CMSG_CANCEL_CHANNELLING` is one `uint32` spell id
  (`Handlers/SpellHandler.cpp:653-684`,
  `wow_message_parser/wowm/world/chat/cmsg_cancel_channelling.wowm`).
  The server ignores it when the spell is not the current channel or has
  `SPELL_ATTR0_NO_AURA_CANCEL`.
- `CMSG_CANCEL_AURA` is one `uint32` spell id
  (`Handlers/SpellHandler.cpp:568-601`,
  `wow_message_parser/wowm/world/spell/cmsg_cancel_aura.wowm`). The
  server ignores an unknown spell or one that forbids a cancel,
  interrupts a channelled spell only when it is the current channel,
  and ignores a spell that is not positive or is passive.
- The bits the area checks: `SPELL_ATTR0_NO_AURA_CANCEL` 0x80000000
  (`SharedDefines.h:401`), `SPELL_ATTR0_PASSIVE` 0x40
  (`SharedDefines.h:376`), `AFLAG_NEGATIVE` 0x80 on the aura for "not
  positive" (`Spells/Auras/SpellAuraDefines.h:34`), and
  `SPELL_ATTR1_IS_CHANNELED` 0x4 or `SPELL_ATTR1_IS_SELF_CHANNELED` 0x40
  for "channelled" (`Spells/SpellInfo.cpp:1301-1304`).
- A cancelled aura comes back as `SMSG_AURA_UPDATE` for its slot
  (`Spells/Auras/SpellAuras.cpp:225-240`).
- A removal writes only the slot and a 0 spell id
  (`Spells/Auras/SpellAuras.cpp:191-195`).
- `CMSG_CANCEL_GROWTH_AURA` has no body and the server does nothing with
  it (`Handlers/SpellHandler.cpp:642-644`,
  `wow_message_parser/wowm/world/spell/cmsg_cancel_growth_aura.wowm`).
- `CMSG_SET_ACTION_BUTTON` is a `uint8` slot and one packed `uint32`
  button; a packed 0 clears the slot
  (`Handlers/MiscHandler.cpp:899-938`,
  `wow_message_parser/wowm/world/login_logout/cmsg_set_action_button.wowm`).
- A packed button holds the id in the low 24 bits and the type in the
  high 8 (`Entities/Player/Player.h:235-237`). The types are spell 0x00,
  equipment set 0x20, macro 0x40 (0x41 for a character macro) and item
  0x80 (`Entities/Player/Player.h:222-227`).
- The server drops a button in silence when the slot is 144 or more, the
  id is 0x1000000 or more, the spell does not exist or is not known, or
  the item does not exist (`Entities/Player/Player.cpp:5760-5801`). It
  checks nothing for an equipment set or a macro, and it drops an
  unknown type (`Handlers/MiscHandler.cpp:931-934`).
- `CMSG_SET_ACTIONBAR_TOGGLES` is one `uint8` mask that the server
  writes to byte 2 of `PLAYER_FIELD_BYTES`
  (`Handlers/MiscHandler.cpp:952-965`,
  `wow_message_parser/wowm/world/login_logout/cmsg_set_actionbar_toggles.wowm`).
- `PLAYER_FIELD_BYTES` is update field 1197
  (`Entities/Object/Updates/UpdateFields.h:368`); the next self update
  carries the new mask.
- `SMSG_ACTION_BUTTONS` is a `uint8` state and, unless the state is 2,
  144 packed `uint32` buttons (`Entities/Player/Player.cpp:5732-5758`).
  The legacy `action-bar.ts` handler reads it.
- The login packets carry the saved bar
  (`Entities/Player/Player.cpp:11797`).
- `SMSG_SEND_UNLEARN_SPELLS` is a `uint32` count and that many `uint32`
  spell ids (`Entities/Player/Player.cpp:2885-2922`,
  `wow_message_parser/wowm/world/spell/smsg_send_unlearn_spells.wowm`).
- Login sends the unlearn list after the initial spells
  (`Entities/Player/Player.cpp:11795`).
- `SMSG_SET_FLAT_SPELL_MODIFIER` and `SMSG_SET_PCT_SPELL_MODIFIER` are a
  `uint8` effect mask bit, a `uint8` op and an `int32` total
  (`Entities/Player/Player.cpp:10103-10130`). Login resends every
  non-zero total (`Handlers/CharacterHandler.cpp:1218-1250`); a change
  at run time sends the new total, also when it is 0.
- `SMSG_MODIFY_COOLDOWN` is a `uint32` spell, the full `uint64` guid of
  the player and an `int32` change in milliseconds
  (`Entities/Player/Player.cpp:11276-11288`). The server sends it only
  for a spell that has a cooldown. Its senders are level-80 scripts
  (`Spells/Auras/SpellAuras.cpp:1811-1826`).
- A guid written with `<<` is the full `uint64`
  (`Entities/Object/ObjectGuid.cpp:70-73`).
- The shaman T10 two-piece proc also changes a cooldown
  (`scripts/Spells/spell_shaman.cpp:1024`).
- `SMSG_PLAY_SPELL_VISUAL` and `SMSG_PLAY_SPELL_IMPACT` are the full
  `uint64` guid of the unit and a `uint32` `SpellVisualKit.dbc` index
  (`Entities/Unit/Unit.cpp:14752-14758`,
  `Entities/Unit/Unit.cpp:14760-14766`,
  `Entities/Unit/Unit.cpp:14768-14778`,
  `wow_message_parser/wowm/world/spell/smsg_play_spell_visual.wowm`,
  `wow_message_parser/wowm/world/spell/smsg_play_spell_impact.wowm`).
- A trainer purchase sends the visual 179 from the trainer and the impact
  362 on the player (`Creature/Trainer.cpp:111-112`); eating and drinking
  send a visual from the player (`Entities/Player/Player.cpp:1871`,
  `Entities/Player/Player.cpp:1876`).
- The trainer sends both to the units that see it, so a purchase made
  before the trainer is in view brings neither
  (`Entities/Unit/Unit.cpp:14757`).
- `SMSG_CONVERT_RUNE` is a `uint8` index and a `uint8` new type, sent only
  from `Player::ConvertRune` (`Entities/Player/Player.cpp:13736-13743`).
- The rune list in `SMSG_SPELL_GO` is a before mask, an after mask and one
  elapsed byte per spent rune, in slot order (`Spells/Spell.cpp:5033-5050`).
- The base layout read with `SMSG_CONVERT_RUNE` is two blood, two unholy and two
  frost. The rune types are 0 blood, 1 unholy, 2 frost and 3 death, and the four
  regen rates start at 0.1 (`Entities/Player/Player.cpp:13736-13743`).
- The client direction of `MSG_CHANNEL_START` and `MSG_CHANNEL_UPDATE`
  is `Handle_NULL` (`Server/Protocol/Opcodes.cpp:444-445`).

Disagreements (AzerothCore wins):

- The flat and percent spell modifier value is an `int32`
  (`Entities/Player/Player.cpp:10127`); wow_messages has a `u32`
  (`wow_message_parser/wowm/world/spell/smsg_set_flat_spell_modifier.wowm`,
  `wow_message_parser/wowm/world/spell/smsg_set_pct_spell_modifier.wowm`).
- `SMSG_MODIFY_COOLDOWN` carries signed milliseconds
  (`Entities/Player/Player.cpp:11284-11287`); wow_messages has
  `Milliseconds`, which is unsigned
  (`wow_message_parser/wowm/world/spell/smsg_modify_cooldown.wowm`).

Disagreements for opcodes later tasks build (AzerothCore wins):

- `CMSG_SET_ACTION_BUTTON` packs the id in 24 bits
  (`Handlers/MiscHandler.cpp:899-938`); wow_messages splits it into a
  `uint16` action and a `uint8` misc
  (`wow_message_parser/wowm/world/login_logout/cmsg_set_action_button.wowm`),
  which gives the same bytes but truncates a reading of ids above
  0xFFFF.

- `SMSG_SPELL_FAILED_OTHER` has the `SMSG_SPELL_FAILURE` body: packed
  guid, cast count, spell and result (`Spells/Spell.cpp:5334-5339`).
  wow_messages has a plain guid and the spell
  (`wow_message_parser/wowm/world/spell/smsg_spell_failed_other.wowm`).
- `SMSG_TOTEM_CREATED` is a `uint8` slot (0-3, the wire slot minus
  `SUMMON_SLOT_TOTEM_FIRE`), the `uint64` totem guid, the `uint32`
  duration in milliseconds and the `uint32` spell
  (`Server/Packets/TotemPackets.cpp:25-33`,
  `Entities/Totem/Totem.cpp:55-67`). The create goes out before the
  totem joins the world, so the slot stores the guid and a later
  disappear of that guid clears it; a zero duration expires on the
  next tick.
- `CMSG_TOTEM_DESTROYED` is one `uint8` slot
  (`Server/Packets/TotemPackets.cpp:20-23`); the server adds
  `SUMMON_SLOT_TOTEM_FIRE` back and drops the packet past the air slot
  without a reply (`Handlers/SpellHandler.cpp:686-705`). The
  `spells-totem` probe flow casts the spell, waits for the create,
  destroys the slot and waits for the totem's destroy object.
- `SMSG_TOTEM_CREATED`, `CMSG_TOTEM_DESTROYED`: not seen live (no
  shaman preset; a priest that learned 8071 with the Earth Totem item
  5175 in the bags casts 836, and the create never comes). The parser
  test builds the packet from the AzerothCore writer, and a live
  `CMSG_TOTEM_DESTROYED` of empty slot 0 sent one byte with no
  disconnect.
- `SMSG_LEARNED_SPELL` is the `uint32` spell and a `uint16` 0
  (`Entities/Player/Player.cpp:3139-3141`). Offline `spells/learn`
  writes a character that setup refuses to stage while online, so no
  such packet follows it; the row lands in the spellbook at the next
  login, which packs the `m_spells` map into `SMSG_INITIAL_SPELLS`
  (`Entities/Player/Player.cpp:2796-2799`). A spell learned while the
  character is in the world, with `soap gm <ACCOUNT> learn <spell>`,
  arrives as `SMSG_LEARNED_SPELL` with no relog: the same throwaway
  `eversong10` that saw no packet from offline learns of 33388, 458
  and 20608, and found only 33388 and 458 in its 73-spell next-login
  `SMSG_INITIAL_SPELLS`, drew `SMSG_LEARNED_SPELL` body `6c8200000000`
  for 33388 with outcome `handled`. A flow that needs a spell learns
  it online, or stages it before the login and reads it from
  `SMSG_INITIAL_SPELLS`.
- `Player::learnSpell` only sends the packet when the player is in the
  world, behind the `IsInWorld` guard
  (`Entities/Player/Player.cpp:3439-3440`); the login load keeps a
  stored spell only when its skill line fits the race and class and
  deletes the row (`Entities/Player/PlayerStorage.cpp:6678-6681`),
  logging which skill a bad spell would teach
  (`Entities/Player/Player.cpp:3233-3236`).
- The probe flow `selfstate-mount` defaults to 458 because spell 33388
  is Apprentice Riding, not a mount: `Spell.dbc` gives it effects 3
  (dummy) and 118 (skill) with no aura, and the passive flag. A mount
  spell has effect 6 with aura 78 (`SPELL_AURA_MOUNTED`), as Brown Horse
  458 and Frostwolf Howler 23509 do; `Unit::Mount` sends the height
  packet, packed guid, counter and height
  (`Entities/Unit/Unit.cpp:10272-10275`), named
  `SMSG_MOVE_SET_COLLISION_HGT`.
- The server drops a client `CMSG_CAST_SPELL` of a spell it does not
  know or a passive spell without a reply
  (`Handlers/SpellHandler.cpp:449-450`).
- A skill slot is three `uint32`: the id in the low `u16` of word 0
  with the step in the high `u16`, the value and max in the low and
  high `u16` of word 1, and the temporary and permanent bonuses as the
  two signed `int16` of word 2 (`Entities/Player/Player.h:79-89`).
- `CMSG_UNLEARN_SKILL` is one `uint32` skill id; the server unlearns the
  skill when it is a primary profession and drops the rest without a
  reply (`Handlers/SkillHandler.cpp:91-100`).
- A primary profession is a `SkillLine` row whose category is 11, while
  9 marks a secondary profession (`Spells/SpellMgr.cpp:38-48`,
  `src/server/shared/SharedDefines.h:3309-3311`).
- Learning a profession spell grants its skill line: `Player::addSpell`
  reads the spell's `SpellLearnSkillNode` and calls `SetSkill`
  (`Entities/Player/Player.cpp:3355-3374`); `SetSkill(id, 0, 0, 0)`
  clears the triple and removes the skill's spells and auras
  (`Entities/Player/Player.cpp:5537-5556`).
- Skill names and the profession category come from `SkillLine.dbc`
  (category 11 is primary, 9 is secondary); without the file the area
  names the eleven primary and four secondary professions from a static
  table and other skills as `skill <id>`.
## Left out

- `CMSG_FAR_SIGHT`, `CMSG_GET_MIRRORIMAGE_DATA`,
  `SMSG_MIRRORIMAGE_DATA`: built by spells-10.
- `CMSG_UPDATE_MISSILE_TRAJECTORY`, `CMSG_UPDATE_PROJECTILE_POSITION`,
  `SMSG_SET_PROJECTILE_POSITION`: built by spells-11.

## Capabilities row

Cancel one of its own buffs (`t4-spells-cancel-aura`; harmful and passive auras cannot be cancelled). The action bar (`t4-spells-action-bar`) is not proven: no truth pick reads the bar, so the verdict stays `blocked`. Stop ends an Evocation channel (`t4-spells-stop-channel`): the stop reflex halts the character, the cancelled `spells/channel_end` row lands, and no recast sits between the steer and the end.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_TOTEM_CREATED` | `mock` | `packages/core/src/wow/areas/spells/totems.test.ts` "SMSG_TOTEM_CREATED fills the slot and emits totem_created" builds the packet from the AzerothCore writer; not seen live (no shaman preset; a priest that learned 8071 with Earth Totem item 5175 in the bags casts 836 instead, and the create never comes) | `Server/Packets/TotemPackets.cpp:25-33` |
| `SMSG_CONVERT_RUNE` | `mock` | `packages/core/src/wow/areas/spells/runes.test.ts` "parseConvertRune reads the index and the new type" builds the packet from the AzerothCore writer; not seen live (no death knight preset: T-11 parked, `mise factory soap create eversong55-deathknight` fails unknown preset) | `Entities/Player/Player.cpp:13736-13743` |
| `CMSG_TOTEM_DESTROYED` | `builder` | sent live on a `max80` priest: `mise protocol:probe <ACCOUNT> --send CMSG_TOTEM_DESTROYED --body 00 --wait 8`, exit 0, one byte in the trace, no disconnect; effect not seen (slot 0 was empty, which the server ignores); not seen live | `Server/Packets/TotemPackets.cpp:20-23` |
| `CMSG_UNLEARN_SKILL` | `live` | throwaway `eversong10` priest: offline `spells/learn` 2575 scrubbed at login (no skill 186); online `gm learn 2575` while the puppet stood in the world filled the triple (five `SMSG_LEARNED_SPELL` after the learn at trace time 1790847631601-1602); raw `CMSG_UNLEARN_SKILL` (`ba000000`) drew five `SMSG_REMOVED_SPELL` 7 ms later and cleared 2575 from truth (18 spells); the `COMPRESSED_UPDATE_OBJECT` in the same window carries the cleared triple (`skill_removed`) | `Handlers/SkillHandler.cpp:91-100` |
| `CMSG_CANCEL_AURA` | `live` | mount cancel on a throwaway `eversong10` character with spell 458 (Brown Horse): `mise protocol:probe <ACCOUNT> --flow selfstate-mount` reports spell 458, collision height null to 2.88, `cancel: ok`, height back to 2.03 after the dismount; the retained trace shows `CMSG_CAST_SPELL` out, `SMSG_MOVE_SET_COLLISION_HGT` and `SMSG_AURA_UPDATE` in, then `CMSG_CANCEL_AURA` out followed by `SMSG_AURA_UPDATE`, `SMSG_MOVE_SET_COLLISION_HGT` and `SMSG_DISMOUNT` in. A puppet cancel of the live mount aura (`CMSG_CAST_SPELL` then raw `CMSG_CANCEL_AURA`) shows the same packet sequence in its retained `packets.jsonl` | `Handlers/SpellHandler.cpp:568-601` |
| `SMSG_LEARNED_SPELL` | `live` | throwaway `eversong10` character: `soap setup spells/learn` of 33388, 458 and 20608 while offline sent no packet, and the next login's `SMSG_INITIAL_SPELLS` (73 spells) held 33388 and 458 and no 20608; with the character in the world, `soap gm learn 33388` drew `SMSG_LEARNED_SPELL` body `6c8200000000`, outcome `handled` | `Entities/Player/Player.cpp:3137-3145` |
