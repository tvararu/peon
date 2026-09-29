# pets

The `pets` area reads the pet bar the server sends for the character's
pet, vehicle, charmed or possessed unit. World-service code reads it
through `session.areas.pets.state()`: the bar with the pet's family,
duration, stance (`react`), command, flags, the ten slots, the spells
with their autocast state, the running cooldowns as end times, and a
`pet` view of the summoned pet (pet number, name timestamp, the rename
and abandon bits, happiness), and the last refusal the server sent. The
area emits `bar`, `spell_learned`, `spell_unlearned` and `feedback`
events. The act `pets.requestPetInfo()` asks the server for the bar
again. `pets.petCommand("stay" | "follow")` and
`pets.petStance("passive" | "defensive" | "aggressive")` send the order
and then ask for the bar, which confirms it. `pets.petCommand("dismiss")`
sends the dismiss command alone, and `pets.petStopAttack()` stops the
pet's attack. Each returns `{ ok: false, reason: "no_pet" }` and
sends nothing when there is no bar, and `petCommand("dismiss")` returns
`hunter_pet_dismiss` for a pet with the abandon bit, because that command
deletes a hunter pet (`Handlers/PetHandler.cpp:287-288`).

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
- `CMSG_PET_ACTION` is a `uint64` pet guid, a `uint32` `action | type <<
  24` and a `uint64` target guid (`Handlers/PetHandler.cpp:57-65`). The
  server sends no reply; the next bar carries the new react and command
  states (`Handlers/PetHandler.cpp:162-324`). The attack form has the
  same bytes as the legacy attack command
  (`packages/core/src/wow/protocol/pet.ts`).
- A pet action of type 0x07 is a command (0 stay, 1 follow, 2 attack, 3
  abandon or dismiss) and one of type 0x06 a stance (0 passive, 1
  defensive, 2 aggressive) (`Entities/Unit/CharmInfo.h:61-65`,
  `Entities/Unit/Unit.h:565-578`).
- `CMSG_PET_STOP_ATTACK` is the pet guid
  (`Server/Packets/PetPackets.cpp:30-33`, `Handlers/PetHandler.cpp:127-148`).
  The server answers with `SMSG_ATTACKSTOP` for the pet and no other
  reply.
- A unit that stops its attack clears its target field
  (`Entities/Unit/Unit.cpp:7221`).
- `SMSG_PET_ACTION_FEEDBACK` is one `uint8`
  (`Entities/Unit/Unit.cpp:12556-12564`). The area reads 1, 2 and 3 as
  `pet_dead`, `nothing_to_attack` and `cant_attack`, and any other value
  as `unknown`.
- The feedback values are 1 pet dead, 2 nothing to attack and 3 cannot
  attack the target (`Entities/Pet/PetDefines.h:71-77`). wow_messages
  also names 4 "no path to"
  (`wow_message_parser/wowm/world/pet/smsg_pet_action_feedback.wowm`),
  which AzerothCore never writes.
- `SMSG_PET_ACTION_SOUND` is the unit guid as a raw `uint64` and an
  `int32` action (`Server/Packets/PetPackets.cpp:54-59`);
  `SMSG_PET_DISMISS_SOUND` is an `int32` model id and three `float`
  coordinates (`Server/Packets/PetPackets.cpp:61-68`). The area reads
  both and keeps nothing.
- Only a summoned (warlock) pet plays the attack sound and the dismiss
  sound (`Handlers/PetHandler.cpp:256`, `Handlers/PetHandler.cpp:291`).
- Spell ids resolved by name through the spellbook of the
  `eversong10-hunter` preset: Call Pet 883, Dismiss Pet 2641.
- `CMSG_PET_CAST_SPELL` is the pet guid, a `uint8` cast count, the
  `uint32` spell, a `uint8` flags byte of 0 and the target block
  (`Handlers/PetHandler.cpp:1018-1023`); the area keeps its own
  counter, 1-255 wrapping to 1. `SMSG_PET_CAST_FAILED` carries the
  count, spell and result (`Spells/Spell.cpp:4842-4861`); the extra
  `multiple_casts` byte of wowm does not exist in AzerothCore.
- `CMSG_PET_SPELL_AUTOCAST` is the pet guid, the `uint32` spell and a
  `uint8` flag (`Server/Packets/PetPackets.cpp:35-40`); the bar shows
  autocast-on spells as type `0xc1`, autocast-off as `0x81` and
  passive spells as `0x01`. `CMSG_PET_SET_ACTION` is the pet guid and
  one or two `{ uint32 slot, uint32 packed }` pairs; the pair count
  comes from the packet size (`Handlers/PetHandler.cpp:696-716`).
  Slots outside 0-9 are refused (`Handlers/PetHandler.cpp:726-727`).
- `CMSG_PET_CANCEL_AURA` is the pet guid and the `uint32` spell
  (`Handlers/SpellHandler.cpp:604-610`); the server removes only an
  aura the pet owns (`Handlers/SpellHandler.cpp:639`).
- The area peeks `SMSG_SPELL_COOLDOWN` (guid, flags, spell and time
  per entry, `Entities/Unit/Unit.cpp:16618-16625`) and
  `SMSG_CLEAR_COOLDOWN` (spell then pet guid, `Entities/Pet/Pet.cpp:2458`)
  for the pet's guid only; both are `uses`, owned at
  `gameplay-handlers.ts:123-128`. The pet's normal cooldowns arrive in
  `SMSG_PET_SPELLS`; a pet-guid `SMSG_SPELL_COOLDOWN` is only sent when
  `RequireCooldownInfo()` holds (`Spells/Spell.cpp:4493-4498`).

## Left out

- `CMSG_PET_NAME_QUERY`, `SMSG_PET_NAME_QUERY_RESPONSE`, `CMSG_PET_RENAME`,

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
| `CMSG_PET_STOP_ATTACK` | `live` | probe flow `pets-command --arg do=stop --arg yards=120`, exit 0: the pet sent at a Springpaw Stalker, `SMSG_ATTACKSTART` for the pet, then `CMSG_PET_STOP_ATTACK`, `SMSG_ATTACKSTOP` for the pet 1 ms later and the pet's `UNIT_FIELD_TARGET` cleared | `Server/Packets/PetPackets.cpp:30-33` |
| `SMSG_PET_ACTION_FEEDBACK` | `mock` | `packages/core/src/wow/areas/pets/store.test.ts` "action feedback sets the last refusal and emits a feedback event" | `Entities/Unit/Unit.cpp:12556-12564` |
| `CMSG_PET_CAST_SPELL` | `live` | probe flow `pets-spell --arg spell=Growl` on an `eversong10-hunter` with its Ravager out, exit 0: one 18-byte `CMSG_PET_CAST_SPELL` out, answered by `SMSG_PET_CAST_FAILED` with reason `bad_implicit_targets` (Growl cast with no target; no hostile within 35 yards and the flow does not walk) | `Handlers/PetHandler.cpp:1018-1023` |
| `SMSG_PET_CAST_FAILED` | `live` | the same `pets-spell` run: `SMSG_PET_CAST_FAILED` size 6 after the cast, parsed as count 1, spell 14916, result `bad_implicit_targets`; a second cast fails the same way (Growl has no cooldown, so no `not_ready`) | `Spells/Spell.cpp:4842-4861` |
| `CMSG_PET_SPELL_AUTOCAST` | `live` | probe flow `pets-spell --arg autocast=Bite:on --bodies`, exit 0: 13-byte `CMSG_PET_SPELL_AUTOCAST` (spell 17255, flag 1), and the next 144-byte `SMSG_PET_SPELLS` shows Bite as type `0xc1` where it was `0x81` before | `Server/Packets/PetPackets.cpp:35-40` |
| `CMSG_PET_SET_ACTION` | `live` | probe flow `pets-spell --arg swap=3,4 --bodies`, exit 0: the flow asks for the bar again first, then one 24-byte `CMSG_PET_SET_ACTION` (slot 3 packed `0xc1004367`, slot 4 packed `0x81003a44`); the next `SMSG_PET_SPELLS` shows slots 3 and 4 swapped (Growl `0x81003a44` and Bite `0xc1004367` exchange places) | `Handlers/PetHandler.cpp:696-716` |
| `CMSG_PET_CANCEL_AURA` | `accepted` | `--send CMSG_PET_CANCEL_AURA` with the pet guid and spell 17255 (Bite), exit 3 for the missing `--expect SMSG_PET_ACTION_FEEDBACK` only: the 12-byte send went out, no disconnect and no error packet; the server removes only an aura the pet owns, and the pet had none | `Handlers/SpellHandler.cpp:604-610` |
| `SMSG_SPELL_COOLDOWN` (pets peek) | `mock` | `packages/core/src/wow/areas/pets/store.test.ts` "a pet-guid SMSG_SPELL_COOLDOWN sets a pet cooldown and the character's guid changes nothing"; no pet-guid packet arrived live (Growl casts failed before any cooldown; sent only when `RequireCooldownInfo()` holds). A `uses` opcode takes no `unseen` entry | `Entities/Unit/Unit.cpp:16618-16625` |
| `SMSG_CLEAR_COOLDOWN` (pets peek) | `mock` | `packages/core/src/wow/areas/pets/store.test.ts` "SMSG_CLEAR_COOLDOWN clears only the pet's row for its own guid"; no pet-guid packet arrived live. A `uses` opcode takes no `unseen` entry | `Entities/Pet/Pet.cpp:2458` |
