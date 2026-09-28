# pets

The `pets` area reads the pet bar the server sends for the character's
pet, vehicle, charmed or possessed unit. World-service code reads it
through `session.areas.pets.state()`: the bar with the pet's family,
duration, stance (`react`), command, flags, the ten slots, the spells
with their autocast state, the running cooldowns as end times, and a
`pet` view of the summoned pet (pet number, name timestamp, the rename
and abandon bits, happiness). The area emits `bar`, `spell_learned` and
`spell_unlearned` events, and the act `pets.requestPetInfo()` asks the
server for the bar again.

## Wire notes

- `SMSG_PET_SPELLS` is a `uint64` guid, a `uint16` family, a `uint32`
  duration, a `uint8` react state, a `uint8` command state, a `uint16`
  flags word, ten `uint32` slots, a `uint8` spell count with a `uint32`
  per spell, and a `uint8` cooldown count with `{ uint32 spell, uint16
  category, uint32 cooldown, uint32 category cooldown }` per cooldown
  (`Entities/Player/Player.cpp:9756-9826`). wow_messages reads an
  `unknown` byte and a `pet_enabled` byte where AzerothCore writes the
  one `uint16` flags word (`Entities/Player/Player.cpp:9773`,
  `wow_message_parser/wowm/world/pet/smsg_pet_spells.wowm`); the bytes
  are the same, and the area keeps the word, so the vehicle value 0x800
  survives (`Entities/Player/Player.cpp:9871`).
- Each slot and each spell is `action | type << 24`
  (`Entities/Unit/CharmInfo.h:31-33`). The type of a spell is its
  autocast state: 0xC1 on, 0x81 off, 0x01 passive
  (`Entities/Unit/CharmInfo.h:61-65`). A vehicle writes an empty slot as
  a `uint16` 0, a `uint8` 0 and a `uint8` slot index, which reads as the
  same `uint32` (`Entities/Player/Player.cpp:9879`).
- A cooldown with a category cooldown of 0x80000000 has no end
  (`Entities/Player/Player.cpp:9813-9819`); the area keeps it with
  `infinite` set and no end time. Other cooldowns become end times from
  the time the bar arrived.
- A charmed player writes a `uint32` 0 in place of the react state,
  command state and flags (`Entities/Player/Player.cpp:9964`); the same
  bytes read as zeros.
- When the pet goes away the server sends the guid 0 and nothing else
  (`Entities/Player/Player.cpp:9384-9387`,
  `Entities/Player/Player.cpp:9985-9990`); the area clears the bar and
  its cooldowns.
- The server sends the bar through `Player::PetSpellInitialize` at login
  (`Handlers/CharacterHandler.cpp:1269`) and when a pet loads on summon
  (`Entities/Pet/Pet.cpp:450`).
- `CMSG_REQUEST_PET_INFO` has an empty body, and its only reply is a new
  bar (`Handlers/MiscHandler.cpp:1560-1578`).
- `SMSG_PET_LEARNED_SPELL` and `SMSG_PET_UNLEARNED_SPELL` are one
  `uint32` spell id (`Server/Packets/PetPackets.cpp:42-46`,
  `Server/Packets/PetPackets.cpp:48-52`). A new rank
  sends the unlearn of the old rank, the learn of the new one and a new
  bar (`Entities/Pet/Pet.cpp:1911-1914`, `Entities/Pet/Pet.cpp:1965-1968`).
- The rename and abandon bits are byte 2 of `UNIT_FIELD_BYTES_2`
  (`Entities/Unit/UnitDefines.h:152-153`); happiness is the fifth power
  (`src/server/shared/SharedDefines.h:261`).
- Spell ids resolved by name through the spellbook of the
  `eversong10-hunter` preset: Call Pet 883, Dismiss Pet 2641.

## Left out

- `CMSG_PET_STOP_ATTACK`, `SMSG_PET_ACTION_FEEDBACK`,
  `SMSG_PET_ACTION_SOUND`, `SMSG_PET_DISMISS_SOUND`: built by pets-2.
- `CMSG_PET_CAST_SPELL`, `SMSG_PET_CAST_FAILED`, `CMSG_PET_SPELL_AUTOCAST`,
  `CMSG_PET_SET_ACTION`, `CMSG_PET_CANCEL_AURA`: built by pets-3.
- `CMSG_PET_NAME_QUERY`, `SMSG_PET_NAME_QUERY_RESPONSE`, `CMSG_PET_RENAME`,
  `SMSG_PET_NAME_INVALID`: built by pets-4.
- `MSG_LIST_STABLED_PETS`, `CMSG_STABLE_PET`, `CMSG_UNSTABLE_PET`,
  `CMSG_STABLE_SWAP_PET`, `CMSG_BUY_STABLE_SLOT`, `SMSG_STABLE_RESULT`,
  `CMSG_STABLE_REVIVE_PET`: built by pets-5.
- `CMSG_PET_ABANDON`, `SMSG_PET_TAME_FAILURE`, `CMSG_DISMISS_CRITTER`:
  built by pets-6.
- `CMSG_PET_LEARN_TALENT`, `CMSG_LEARN_PREVIEW_TALENTS_PET`: built by
  pets-7.
- `SMSG_PET_UPDATE_COMBO_POINTS`: built by pets-8.
- `SMSG_PET_MODE`, `SMSG_PET_BROKEN`, `CMSG_PET_UNLEARN`,
  `SMSG_PET_UNLEARN_CONFIRM`, `SMSG_PET_GUIDS`: dead (see Proof).

## Capabilities row

No agent verb; the world-service act `pets.requestPetInfo` only.

## Proof

| Opcode | Proof | Evidence | Source |
|---|---|---|---|
| `SMSG_PET_SPELLS` | `live` | probe flow `pets-bar --arg dismiss=1` on an `eversong10-hunter` (`--expect SMSG_PET_SPELLS`), exit 0: the pet form at login and as the reply to the request, then the clear form after Dismiss Pet | `Entities/Player/Player.cpp:9756-9826` |
| `CMSG_REQUEST_PET_INFO` | `live` | probe flow `pets-bar`, exit 0: one `CMSG_REQUEST_PET_INFO` in `counts.sent`, answered by a second `SMSG_PET_SPELLS` within 3 ms | `Handlers/MiscHandler.cpp:1560-1578` |
| `SMSG_PET_LEARNED_SPELL` | `live` | probe flow `pets-bar` with `--until SMSG_PET_LEARNED_SPELL`, exit 0, while `soap gm level 40` raised the pet from level 15 to 35: four received, each followed by a new bar | `Entities/Pet/Pet.cpp:1911-1914` |
| `SMSG_PET_UNLEARNED_SPELL` | `live` | the same `pets-bar` run: three received, one per replaced rank | `Entities/Pet/Pet.cpp:1965-1968` |
| `SMSG_PET_MODE` | `dead` | no AzerothCore code builds it; the react and command states travel in `SMSG_PET_SPELLS` | `Server/Protocol/Opcodes.cpp:509` |
| `SMSG_PET_BROKEN` | `dead` | no send site in AzerothCore; wow_messages notes no Wrath emulator implements it (`wow_message_parser/wowm/world/pet/smsg_pet_broken.wowm`) | `Server/Protocol/Opcodes.cpp:818` |
| `CMSG_PET_UNLEARN` | `dead` | `STATUS_NEVER` with `Handle_NULL` | `Server/Protocol/Opcodes.cpp:883` |
| `SMSG_PET_UNLEARN_CONFIRM` | `dead` | no send site in AzerothCore | `Server/Protocol/Opcodes.cpp:884` |
| `SMSG_PET_GUIDS` | `dead` | only a comment names it (`Entities/Player/Player.cpp:11812`) | `Server/Protocol/Opcodes.cpp:1325` |
