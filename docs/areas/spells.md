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
open nothing. Other casters' `MSG_CHANNEL_START` and `MSG_CHANNEL_UPDATE`
do the same for channels (`finished` on update 0 at or after the expected end, `interrupted` when it is more than 400 ms early; an update 0 inside the last 400 ms waits 50 ms for the `SMSG_SPELL_FAILURE` AzerothCore sends with each cancelled channel and ends `interrupted` when it comes). Entries expire 1000 ms after their end and drop when the caster disappears, and the harness
writes no log row for them.

`act.cancelAura(spellId)` drops one of the character's own auras with
`CMSG_CANCEL_AURA`. It refuses, and sends nothing, what the server would
drop in silence: `invalid_spell` for an id that is not a positive
integer, `not_cancellable` for a spell with `SPELL_ATTR0_NO_AURA_CANCEL`,
a passive spell or an aura with `AFLAG_NEGATIVE`, and `not_aura` when
the character wears no aura of the spell. A channelled spell id cancels
the running channel through `cancelChannel` (`not_channelling` when that
spell is not the channel). The attribute checks need the spell data;
without it the act checks only the aura flags. `act.cancelGrowthAura()`
sends the empty `CMSG_CANCEL_GROWTH_AURA`.

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
aura update removes the aura within 2 s; an aura with an effect that
applies `SPELL_AURA_MOUNTED` (`Spells/Auras/SpellAuraDefines.h:141`) is
refused with `use_dismount`. `do: "bar"` writes slot 1-144 as wire slot
0-143 with `act.setActionButton`, and a call with neither spell nor item
clears the slot. `journal about: "spells"` lists up to four cancellable
auras and four filled bar slots before the spellbook, and leaves out the
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
  remaining time (`Spells/Spell.cpp:8129-8173`).
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
- `CMSG_UPDATE_MISSILE_TRAJECTORY` ends with a `uint8` move stop and an
  optional movement packet (`Handlers/MiscHandler.cpp:1735`,
  `Handlers/MiscHandler.cpp:1758-1765`).

## Left out

- `SMSG_SPELL_FAILED_OTHER`: built by spells-2.
- `SMSG_TOTEM_CREATED`, `CMSG_TOTEM_DESTROYED`: built by spells-8.
- `CMSG_UNLEARN_SKILL`: built by spells-7.
- `SMSG_CONVERT_RUNE`: built by spells-9.
- `CMSG_FAR_SIGHT`, `CMSG_GET_MIRRORIMAGE_DATA`,
  `SMSG_MIRRORIMAGE_DATA`: built by spells-10.
- `CMSG_UPDATE_MISSILE_TRAJECTORY`, `CMSG_UPDATE_PROJECTILE_POSITION`,
  `SMSG_SET_PROJECTILE_POSITION`: built by spells-11.

## Capabilities row

Cancel one of its own buffs (`t4-spells-cancel-aura`; harmful and passive auras cannot be cancelled). The action bar (`t4-spells-action-bar`) is not proven: no truth pick reads the bar, so the verdict stays `blocked`. Stop ends an Evocation channel (`t4-spells-stop-channel`): the stop reflex halts the character, the cancelled `spells/channel_end` row lands, and no recast sits between the steer and the end.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `MSG_CHANNEL_START` | `live` | probe flow `spells-channel` (`--arg spell=5143`, modes `finish`, `cancel` and `hit`, `--expect` 0x139, 0x13a) on an `eversong10-mage` moved to East Sanctum with `soap gm tele EastSanctum`, exit 0 each; received after `SMSG_SPELL_GO` with duration 3000 | `Spells/Spell.cpp:5362-5385` |
| `MSG_CHANNEL_UPDATE` | `live` | probe flow `spells-channel`, exit 0: mode `finish` got 0 about 3000 ms after the start (`finished`); mode `cancel` got 0 right after the cancel, then `SMSG_SPELL_FAILURE` (`cancelled`); mode `hit` got 1606 after a melee hit, then 0 at the moved end (`finished`) | `Spells/Spell.cpp:5342-5359` |
| `CMSG_CANCEL_CHANNELLING` | `live` | probe flow `spells-channel` mode `cancel`, exit 0; sent 1 s into the channel, and `MSG_CHANNEL_UPDATE` 0 and `SMSG_SPELL_FAILURE` followed | `Handlers/SpellHandler.cpp:653-684` |
| `CMSG_CANCEL_AURA` | `live` | probe flow `spells-aura` (`--arg spell=168`, `--expect` 0x496) on an `eversong10-mage`, exit 0 on two runs: Frost Armor applied in slot 0 with flags 0x3b, `CMSG_CANCEL_AURA` body `a8000000` sent, and the next `SMSG_AURA_UPDATE` (body `03ed0d0000000000`) cleared slot 0 within 16 ms; eval `t4-spells-cancel-aura` (pass) sent it through `spell do:"cancel_aura"` on Frost Armor rank 2 (spell 7300) and the aura faded | `Handlers/SpellHandler.cpp:568-601` |
| `CMSG_CANCEL_GROWTH_AURA` | `accepted` | `mise protocol:probe --send CMSG_CANCEL_GROWTH_AURA --wait 3`, exit 0: empty body sent, no error packet, and the session ran on to a normal logout | `Handlers/SpellHandler.cpp:642-644` |
| `CMSG_SET_ACTION_BUTTON` | `live` | probe flow `spells-bar` on an `eversong10-mage`, exit 0 twice: `--arg slot=0 --arg spell=133` and `--arg slot=11 --arg item=6948` each sent one 5-byte packet; the server sent no reply, and the next login's `SMSG_ACTION_BUTTONS` held slot 0 `85000000` and slot 11 `241b0080`; eval `t4-spells-action-bar` (verdict `blocked`, no server truth for the bar) sent two through `spell do:"bar"` | `Handlers/MiscHandler.cpp:899-938` |
| `CMSG_SET_ACTIONBAR_TOGGLES` | `live` | probe flow `spells-bar` on an `eversong10-mage`, exit 0: `--arg toggles=15` sent body `0f` and the self update 23 ms later set field 1197 to 0x000f0000; `--arg toggles=7` logged in with 0x000f0000 saved, sent `07`, and the self update set 0x00070000, so `state().barToggles` read 7 | `Handlers/MiscHandler.cpp:952-965` |
| `SMSG_ACTION_BUTTONS` | `live` | `mise protocol:probe --flow login --expect SMSG_ACTION_BUTTONS --bodies` after the two button writes, exit 0: state 1, slots 0 and 1 `85000000` (spell 133), slot 11 `241b0080` (item 6948), and 577 bytes in all (1 + 144 × 4); the legacy handler read it | `Entities/Player/Player.cpp:5732-5758` |
| `SMSG_SPELL_FAILED_OTHER` | `live` | `mise protocol:probe FAC6ABB9C9BB6 --flow unitmotion-cast --arg spell=133` on an `eversong10-mage` at East Sanctum, exit 0: `SMSG_SPELL_START` at 1790680488701 for Fireball (133, cast time 1500 ms) followed in the same run at 1790680489193 by `SMSG_SPELL_FAILURE` and `SMSG_SPELL_FAILED_OTHER` (both body `03100f058f00000028`, result 40 `SPELL_FAILED_INTERRUPTED`), after the caster moved mid-cast; a second probe cancelled the cast through `handle.cancelCast`, and the caster trace held `SMSG_CAST_FAILED` (result 40), then `SMSG_SPELL_FAILURE` and `SMSG_SPELL_FAILED_OTHER` in the same millisecond; two-account run (two `eversong10-mage` accounts teleported to East Sanctum, the caster casting Fireball at a hostile creature and walking 2 yards 600 ms in, the observer a second session that only listened): the observer trace held `SMSG_SPELL_START` (Fireball 133, timer 1500 ms, caster `0x0f2403`) at 1790683470821, then `SMSG_SPELL_FAILURE` at ...471414 and `SMSG_SPELL_FAILED_OTHER` at ...471415 (both body `03240f018500000028`, result 40), and the observer's store gave `unit_cast_start` (`durationMs` 1500, `kind` cast, `relevant` 0) with one `state().unitCasts` entry, then `unit_cast_end` `interrupted` with `unitCasts` empty (runs not committed) | `Spells/Spell.cpp:5325-5339` |
| `SMSG_SEND_UNLEARN_SPELLS` | `live` | `mise protocol:probe --flow login --expect SMSG_SEND_UNLEARN_SPELLS --expect SMSG_SET_PCT_SPELL_MODIFIER --expect SMSG_SET_FLAT_SPELL_MODIFIER --bodies` on a `ghostlands20` account, exit 0, nothing missing: one packet after the initial spells, body `00000000` (no inactive rank), outcome `handled` | `Entities/Player/Player.cpp:2885-2922` |
| `SMSG_SET_FLAT_SPELL_MODIFIER` | `live` | the same login probe: 4 packets, outcome `handled`, among them `4a1c1e000000` (bit 74, op 28, 30) and `320b3850ffff` (bit 50, op 11, -45000); at logout the server sent both bits again with total 0 (`4a1c00000000`, `320b00000000`) | `Entities/Player/Player.cpp:10103-10130` |
| `SMSG_SET_PCT_SPELL_MODIFIER` | `live` | the same login probe: 44 packets, outcome `handled`, among them `000805000000` (bit 0, op 8, 5) and `0402ecffffff` (bit 4, op 2, -20) | `Handlers/CharacterHandler.cpp:1218-1250` |
| `SMSG_MODIFY_COOLDOWN` | `mock` | `packages/core/src/wow/areas/spells/store-spellbook.test.ts` "SMSG_MODIFY_COOLDOWN for self moves the server cooldown by the signed delta"; not seen live (its senders are level-80 scripts) | `Entities/Player/Player.cpp:11284-11287` |
| `SMSG_PLAY_SPELL_VISUAL` | `live` | `mise protocol:probe --flow nearest --arg kind=trainer --send CMSG_TRAINER_BUY_SPELL --body 0e25008d3f0030f191000000 --expect SMSG_PLAY_SPELL_VISUAL --expect SMSG_PLAY_SPELL_IMPACT --bodies` on an `eversong10-mage` at level 12 next to the Falconwing Square mage trainer, exit 0: after the buy of spell 145, body `0e25008d3f0030f1b3000000` (the trainer's guid, kit 179), outcome `handled` | `Entities/Unit/Unit.cpp:14752-14758` |
| `SMSG_PLAY_SPELL_IMPACT` | `live` | the same probe: in the same millisecond, body `1e0e0000000000006a010000` (the character's guid, kit 362), outcome `handled`, then `SMSG_LEARNED_SPELL` and `SMSG_TRAINER_BUY_SUCCEEDED` | `Entities/Unit/Unit.cpp:14768-14778` |
| `SMSG_SPELL_UPDATE_CHAIN_TARGETS` | `dead` | no send site in AzerothCore `src/` or `modules/`; only the opcode table names it | `Server/Protocol/Opcodes.cpp:947` |
| `SMSG_RESYNC_RUNES` | `dead` | built only in `Player::ResyncRunes`, whose only call, in `Spell::EffectActivateRune`, is commented out | `Entities/Player/Player.cpp:13746-13756` |
| `SMSG_ADD_RUNE_POWER` | `dead` | built only in `Player::AddRunePower`, which has no caller | `Entities/Player/Player.cpp:13758-13763` |
