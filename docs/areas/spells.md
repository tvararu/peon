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
- The client direction of `MSG_CHANNEL_START` and `MSG_CHANNEL_UPDATE`
  is `Handle_NULL` (`Server/Protocol/Opcodes.cpp:444-445`).

Disagreements for opcodes later tasks build (AzerothCore wins):

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

- `CMSG_CANCEL_AURA`, `CMSG_CANCEL_GROWTH_AURA`: built by spells-3.
- `CMSG_SET_ACTION_BUTTON`, `CMSG_SET_ACTIONBAR_TOGGLES`,
  `SMSG_ACTION_BUTTONS`: built by spells-4.
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
| `SMSG_SPELL_UPDATE_CHAIN_TARGETS` | `dead` | no send site in AzerothCore `src/` or `modules/`; only the opcode table names it | `Server/Protocol/Opcodes.cpp:947` |
| `SMSG_RESYNC_RUNES` | `dead` | built only in `Player::ResyncRunes`, whose only call, in `Spell::EffectActivateRune`, is commented out | `Entities/Player/Player.cpp:13746-13756` |
| `SMSG_ADD_RUNE_POWER` | `dead` | built only in `Player::AddRunePower`, which has no caller | `Entities/Player/Player.cpp:13758-13763` |
