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
`finished`, `interrupted` or `cancelled`.

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
- The client direction of `MSG_CHANNEL_START` and `MSG_CHANNEL_UPDATE`
  is `Handle_NULL` (`Server/Protocol/Opcodes.cpp:444-445`).

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
- The flat and percent spell modifier value is an `int32`
  (`Entities/Player/Player.cpp:10127`).
- `SMSG_MODIFY_COOLDOWN` carries signed milliseconds
  (`Entities/Player/Player.cpp:11284-11287`).
- `CMSG_UPDATE_MISSILE_TRAJECTORY` ends with a `uint8` move stop and an
  optional movement packet (`Handlers/MiscHandler.cpp:1735`,
  `Handlers/MiscHandler.cpp:1758-1765`).

## Left out

- `SMSG_SEND_UNLEARN_SPELLS`, `SMSG_SET_FLAT_SPELL_MODIFIER`,
  `SMSG_SET_PCT_SPELL_MODIFIER`, `SMSG_MODIFY_COOLDOWN`: built by
  spells-5.
- `SMSG_PLAY_SPELL_VISUAL`, `SMSG_PLAY_SPELL_IMPACT`: built by spells-6.
- `SMSG_SPELL_FAILED_OTHER`: built by spells-2.
- `SMSG_TOTEM_CREATED`, `CMSG_TOTEM_DESTROYED`: built by spells-8.
- `CMSG_UNLEARN_SKILL`: built by spells-7.
- `SMSG_CONVERT_RUNE`: built by spells-9.
- `CMSG_FAR_SIGHT`, `CMSG_GET_MIRRORIMAGE_DATA`,
  `SMSG_MIRRORIMAGE_DATA`: built by spells-10.
- `CMSG_UPDATE_MISSILE_TRAJECTORY`, `CMSG_UPDATE_PROJECTILE_POSITION`,
  `SMSG_SET_PROJECTILE_POSITION`: built by spells-11.

## Capabilities row

Stop a channel (proposed; spells-12b).

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `MSG_CHANNEL_START` | `live` | probe flow `spells-channel` (`--arg spell=5143`, modes `finish`, `cancel` and `hit`, `--expect` 0x139, 0x13a) on an `eversong10-mage` moved to East Sanctum with `soap gm tele EastSanctum`, exit 0 each; received after `SMSG_SPELL_GO` with duration 3000 | `Spells/Spell.cpp:5362-5385` |
| `MSG_CHANNEL_UPDATE` | `live` | probe flow `spells-channel`, exit 0: mode `finish` got 0 about 3000 ms after the start (`finished`); mode `cancel` got 0 right after the cancel, then `SMSG_SPELL_FAILURE` (`cancelled`); mode `hit` got 1606 after a melee hit, then 0 at the moved end (`finished`) | `Spells/Spell.cpp:5342-5359` |
| `CMSG_CANCEL_CHANNELLING` | `live` | probe flow `spells-channel` mode `cancel`, exit 0; sent 1 s into the channel, and `MSG_CHANNEL_UPDATE` 0 and `SMSG_SPELL_FAILURE` followed | `Handlers/SpellHandler.cpp:653-684` |
| `CMSG_CANCEL_AURA` | `live` | probe flow `spells-aura` (`--arg spell=168`, `--expect` 0x496) on an `eversong10-mage`, exit 0 on two runs: Frost Armor applied in slot 0 with flags 0x3b, `CMSG_CANCEL_AURA` body `a8000000` sent, and the next `SMSG_AURA_UPDATE` (body `03ed0d0000000000`) cleared slot 0 within 16 ms | `Handlers/SpellHandler.cpp:568-601` |
| `CMSG_CANCEL_GROWTH_AURA` | `accepted` | `mise protocol:probe --send CMSG_CANCEL_GROWTH_AURA --wait 3`, exit 0: empty body sent, no error packet, and the session ran on to a normal logout | `Handlers/SpellHandler.cpp:642-644` |
| `CMSG_SET_ACTION_BUTTON` | `live` | probe flow `spells-bar` on an `eversong10-mage`, exit 0 twice: `--arg slot=0 --arg spell=133` and `--arg slot=11 --arg item=6948` each sent one 5-byte packet; the server sent no reply, and the next login's `SMSG_ACTION_BUTTONS` held slot 0 `85000000` and slot 11 `241b0080` | `Handlers/MiscHandler.cpp:899-938` |
| `CMSG_SET_ACTIONBAR_TOGGLES` | `live` | probe flow `spells-bar` on an `eversong10-mage`, exit 0: `--arg toggles=15` sent body `0f` and the self update 23 ms later set field 1197 to 0x000f0000; `--arg toggles=7` logged in with 0x000f0000 saved, sent `07`, and the self update set 0x00070000, so `state().barToggles` read 7 | `Handlers/MiscHandler.cpp:952-965` |
| `SMSG_ACTION_BUTTONS` | `live` | `mise protocol:probe --flow login --expect SMSG_ACTION_BUTTONS --bodies` after the two button writes, exit 0: state 1, slots 0 and 1 `85000000` (spell 133), slot 11 `241b0080` (item 6948), and 577 bytes in all (1 + 144 × 4); the legacy handler read it | `Entities/Player/Player.cpp:5732-5758` |
| `SMSG_SPELL_UPDATE_CHAIN_TARGETS` | `dead` | no send site in AzerothCore `src/` or `modules/`; only the opcode table names it | `Server/Protocol/Opcodes.cpp:947` |
| `SMSG_RESYNC_RUNES` | `dead` | built only in `Player::ResyncRunes`, whose only call, in `Spell::EffectActivateRune`, is commented out | `Entities/Player/Player.cpp:13746-13756` |
| `SMSG_ADD_RUNE_POWER` | `dead` | built only in `Player::AddRunePower`, which has no caller | `Entities/Player/Player.cpp:13758-13763` |
