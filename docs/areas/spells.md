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

`act.requestMirrorImage(guid)` sends `CMSG_GET_MIRRORIMAGE_DATA` (the full
`u64` guid) for a unit in view and refuses `not_visible` for any other guid and
`already_requested` for a second call on the same sighting; the mark clears
when the entity disappears. The server answers only for a unit that wears an
`SPELL_AURA_CLONE_CASTER` aura and stays silent otherwise
(`Handlers/SpellHandler.cpp:752-758`), so no reply is no error. The reply
`SMSG_MIRRORIMAGE_DATA` (68 bytes: guid, display id, race, gender, class, skin,
face, hair style, hair colour, facial hair, guild id and the 11 display ids of
head, shoulders, body, chest, waist, legs, feet, wrists, hands, back and tabard,
`Handlers/SpellHandler.cpp:760-831`) fills `state().mirrorImages` and emits
`mirror_image` (guid, display id, race, gender, class) only while the guid is
still a unit in view; a creature creator sends the same 68 bytes with zero look
bytes and items. An entry leaves with the entity and on dispose; the harness
writes no row for it. Nothing requests an image on its own.
`act.setFarSight(on)` sends the one-byte `CMSG_FAR_SIGHT` toggle and never
refuses; with no viewpoint the server only re-sets the seer to the character
(`Handlers/MiscHandler.cpp:1187-1234`).

`act.reportProjectile(spellId, x, y, z)` sends `CMSG_UPDATE_PROJECTILE_POSITION`
(the character's guid, the spell, the cast count of the running cast and the
position) and `act.reportMissileTrajectory(spellId, { elevation, speed,
current, target })` sends `CMSG_UPDATE_MISSILE_TRAJECTORY`; both refuse
`not_casting`, and send nothing, unless `core.combat.casts.casting` holds that
spell. `SMSG_SET_PROJECTILE_POSITION` emits `projectile_moved` (caster, cast
count, x, y, z) for any caster in view, because the server sends it to the whole
set (`Handlers/SpellHandler.cpp:871`); it keeps no state and the harness writes
no row for it. The `spells-missile` probe flow casts Flamestrike 2120 at the
nearest hostile and reports the target's position while the cast runs.

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
- `CMSG_UPDATE_PROJECTILE_POSITION` is a `uint64` caster guid, `uint32`
  spell, `uint8` cast count and three floats; the server needs only a unit
  with a current spell that has a destination, and answers by moving the
  destination and broadcasting `SMSG_SET_PROJECTILE_POSITION`: `uint64`
  caster, `uint8` count, three floats (`Handlers/SpellHandler.cpp:834-872`).
  No vehicle is involved.
- `CMSG_UPDATE_MISSILE_TRAJECTORY` is a `uint64` guid, `uint32` spell, two
  floats (elevation, speed), two vectors (current, target) and a `uint8`
  `moveStop`. The area always writes `moveStop` 0, so the server's tail read
  (`Handlers/MiscHandler.cpp:1758-1765`) never runs. It acts only on the
  caster's generic spell with both a source and a destination and drops the
  rest silently (`Handlers/MiscHandler.cpp:1724-1766`).

## Capabilities row

Cancel one of its own buffs (`t4-spells-cancel-aura`; harmful and passive auras cannot be cancelled). The action bar (`t4-spells-action-bar`) is not proven: no truth pick reads the bar, so the verdict stays `blocked`. Stop ends an Evocation channel (`t4-spells-stop-channel`): the stop reflex halts the character, the cancelled `spells/channel_end` row lands, and no recast sits between the steer and the end.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_TOTEM_CREATED` | `mock` | `packages/core/src/wow/areas/spells/totems.test.ts` "SMSG_TOTEM_CREATED fills the slot and emits totem_created" builds the packet from the AzerothCore writer; not seen live (no shaman preset; a priest that learned 8071 with Earth Totem item 5175 in the bags casts 836 instead, and the create never comes) | `Server/Packets/TotemPackets.cpp:25-33` |
| `SMSG_CONVERT_RUNE` | `live` | eval `t4-spells-death-runes` round 1 replica 3 (verdict `fail` 2/3, on the report check only): agent casts Blood Tap 45529 (taught in setup), `gamelog.jsonl:26` records `spells/rune_converted` index 0 from 0 to 3, and `packets.jsonl` shows two `SMSG_CONVERT_RUNE` in (cast and aura fade); a `mise protocol:probe` cast of 45529 on a throwaway `eversong55-deathknight` drew the same two bodies, `0003` and `0000` | `Entities/Player/Player.cpp:13736-13743` |
| `CMSG_TOTEM_DESTROYED` | `builder` | sent live on a `max80` priest: `mise protocol:probe <ACCOUNT> --send CMSG_TOTEM_DESTROYED --body 00 --wait 8`, exit 0, one byte in the trace, no disconnect; effect not seen (slot 0 was empty, which the server ignores); not seen live | `Server/Packets/TotemPackets.cpp:20-23` |
| `CMSG_UNLEARN_SKILL` | `live` | eval `t4-spells-unlearn-profession` round 360 replica 2, verdict `pass` 2/2 (`tmp/evals/360/t4-spells-unlearn-profession-2`, `result.json`): agent calls `spell do=unlearn_profession` Mining, first REFUSED `needs_confirm`, then DONE; `packets.jsonl:197-203` shows `CMSG_UNLEARN_SKILL` out at 1790849260142, five `SMSG_REMOVED_SPELL` in 3 ms later and `SMSG_COMPRESSED_UPDATE_OBJECT` 4 ms after that; `gamelog.jsonl:29` records `spells/skill_removed` "Mining dropped." at 1790849260150; baseline truth holds 2575 (19 spells), final truth lacks 2575, 2580 and 2656 (18 spells) | `Handlers/SkillHandler.cpp:91-100` |
| `CMSG_CANCEL_AURA` | `live` | mount cancel on a throwaway `eversong10` character with spell 458 (Brown Horse): `mise protocol:probe <ACCOUNT> --flow selfstate-mount` reports spell 458, collision height null to 2.88, `cancel: ok`, height back to 2.03 after the dismount; the retained trace shows `CMSG_CAST_SPELL` out, `SMSG_MOVE_SET_COLLISION_HGT` and `SMSG_AURA_UPDATE` in, then `CMSG_CANCEL_AURA` out followed by `SMSG_AURA_UPDATE`, `SMSG_MOVE_SET_COLLISION_HGT` and `SMSG_DISMOUNT` in. A puppet cancel of the live mount aura (`CMSG_CAST_SPELL` then raw `CMSG_CANCEL_AURA`) shows the same packet sequence in its retained `packets.jsonl` | `Handlers/SpellHandler.cpp:568-601` |
| `SMSG_LEARNED_SPELL` | `live` | throwaway `eversong10` character: `soap setup spells/learn` of 33388, 458 and 20608 while offline sent no packet, and the next login's `SMSG_INITIAL_SPELLS` (73 spells) held 33388 and 458 and no 20608; with the character in the world, `soap gm learn 33388` drew `SMSG_LEARNED_SPELL` body `6c8200000000`, outcome `handled` | `Entities/Player/Player.cpp:3137-3145` |
| `CMSG_FAR_SIGHT` | `accepted` | sent live on a throwaway `eversong10-mage` character: `mise protocol:probe <ACCOUNT> --send CMSG_FAR_SIGHT --body 00 --wait 3`, exit 0, one byte out in the trace (`tmp/probe/FAC6ABEC72BCA-20261001T205004Z/packets.jsonl`), no packet error and no disconnect; the `00` body releases the viewpoint, which only re-sets the seer to the character | `Handlers/MiscHandler.cpp:1187-1234` |
| `CMSG_GET_MIRRORIMAGE_DATA` | `live` | the same character, level 80 with Mirror Image 55342 learned through `soap setup spells/learn`: `mise protocol:probe <ACCOUNT> --flow spells-mirror --arg spell=55342 --expect SMSG_MIRRORIMAGE_DATA`; the trace `tmp/probe/FAC6ABEC72BCA-20261001T204900Z/packets.jsonl:170-172` shows three eight-byte `CMSG_GET_MIRRORIMAGE_DATA` out, one per image of NPC 31216 | `Handlers/SpellHandler.cpp:741-758` |
| `SMSG_MIRRORIMAGE_DATA` | `live` | the same traces: `packets.jsonl:173-175` shows three 68-byte replies, outcome `handled`, 7 ms after the requests; the second run (`tmp/probe/FAC6ABEC72BCA-20261001T205400Z`, after the spell cooldown) reports each image as class 8, race 10, gender 1, display 15475 with items `[0, 0, 2163, 27529, 25858, 25876, 11060, 14736, 16592, 28042, 0]`; a run inside the cooldown cast nothing and found no image | `Handlers/SpellHandler.cpp:760-831` |
| `CMSG_UPDATE_PROJECTILE_POSITION` | `live` | probe flow `spells-missile` on a throwaway `eversong10-mage` at level 20 with Flamestrike 2120 learned through `soap setup spells/learn`, run `tmp/probe/spells-11-try3` (`FAC6ABED0172C`, deleted): `packets.jsonl:268-272` shows `CMSG_CAST_SPELL`, `SMSG_SPELL_START` in, then 25-byte `CMSG_UPDATE_PROJECTILE_POSITION` out 36 ms later and the broadcast back 6 ms after that, no disconnect | `Handlers/SpellHandler.cpp:834-872` |
| `SMSG_SET_PROJECTILE_POSITION` | `live` | the same run: `packets.jsonl:272` shows the 21-byte packet, outcome `handled`; the flow reports `projectile_moved` for caster `0x1331` (the character) with cast count 1 | `Handlers/SpellHandler.cpp:865-871` |
| `CMSG_UPDATE_MISSILE_TRAJECTORY` | `builder` | sent live in the same run (`packets.jsonl:271`, 45 bytes out, no disconnect); effect not seen: the server answers nothing and drops it unless the spell has both a source and a destination [INFERENCE: Flamestrike's source was not observed] | `Handlers/MiscHandler.cpp:1737-1743` |
