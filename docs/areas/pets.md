# pets

The `pets` area reads the pet bar the server sends for the character's
pet, vehicle, charmed or possessed unit. World-service code reads it
through `session.areas.pets.state()`: the bar with the pet's family,
duration, stance (`react`), command, flags, the ten slots, the spells
with their autocast state, the running cooldowns as end times, the
names known by pet number, and a
`pet` view of the summoned pet (pet number, name timestamp, the rename
and abandon bits, happiness), and the last refusal the server sent. The
area emits `bar`, `spell_learned`, `spell_unlearned`, `feedback`,
`cast_failed`, `name`, `name_invalid` and `unanswered` events. The act
`pets.requestPetInfo()` asks the server for the bar
again. `pets.queryPetName()` asks for the current pet's name again.
`pets.petCommand("stay" | "follow")` and
`pets.petStance("passive" | "defensive" | "aggressive")` send the order
and then ask for the bar, which confirms it. `pets.petCommand("dismiss")`
sends the dismiss command alone, and `pets.petStopAttack()` stops the
pet's attack. Each returns `{ ok: false, reason: "no_pet" }` and
sends nothing when there is no bar, and `petCommand("dismiss")` returns
`hunter_pet_dismiss` for a pet with the abandon bit, because that command
deletes a hunter pet while a summoned pet without the bit is left as a
corpse (`Handlers/PetHandler.cpp:287-294`).

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
  `multiple_casts` byte of wowm does not exist in AzerothCore. The area
  refuses a spell whose attribute is passive before counting or sending,
  as the server skips unlearned and passive spells without a reply
  (`Handlers/PetHandler.cpp:1041-1044`); a bar type of 0x01 alone is not
  a refusal. When the combat catalog has no definition for the spell
  (no spell data loaded) the attribute check cannot run: the cast is
  still sent, and the outcome says `confirmed: false`.
- The bar marks every non-autocastable spell passive
  (`Entities/Pet/Pet.cpp:1810-1816`); a spell that only carries
  `SPELL_ATTR1_NO_AUTOCAST_AI` is still manually castable, which is
  why the `IsAutocastable` check (`Spells/SpellInfo.cpp:1149-1155`)
  differs from the passive-attribute check
  (`Spells/SpellInfo.cpp:1143-1147`).
- `CMSG_PET_SPELL_AUTOCAST` is the pet guid, the `uint32` spell and a
  `uint8` flag (`Server/Packets/PetPackets.cpp:35-40`); the bar shows
  autocast-on spells as type `0xc1`, autocast-off as `0x81` and
  passive spells as `0x01`. `CMSG_PET_SET_ACTION` is the pet guid and
  one or two `{ uint32 slot, uint32 packed }` pairs; the pair count
  comes from the packet size (`Handlers/PetHandler.cpp:696-716`).
  Slots outside 0-9 are refused (`Handlers/PetHandler.cpp:726-727`).
  A single pair carrying a command or reaction type is refused, as the
  server ignores it (`Handlers/PetHandler.cpp:732-740`).
- `CMSG_PET_NAME_QUERY` is a `uint32` pet number and the `uint64` pet guid
  (`Handlers/PetHandler.cpp:616-627`). `SMSG_PET_NAME_QUERY_RESPONSE` is the
  number, the name, the `uint32` name timestamp, a `uint8` declined-names flag
  and, when the flag is 1, five declined-name strings
  (`Handlers/PetHandler.cpp:656-668`); the not-found form carries an empty
  name, timestamp 0 and flag 0 (`Handlers/PetHandler.cpp:632-640`). The area
  asks once per bar and again when the pet's `UNIT_FIELD_PET_NAME_TIMESTAMP`
  grows past the cached entry, and keeps the reply by pet number; a not-found
  reply caches nothing. Pets without a pet number (`UNIT_FIELD_PETNUMBER` 0)
  are never asked.
- `CMSG_PET_RENAME` is the pet guid, the new name and a `uint8` 0 for the
  declined-names flag the area never sends (`Handlers/PetHandler.cpp:846-852`).
  `SMSG_PET_NAME_INVALID` is the `uint32` reason, the refused name, the
  declined-names flag and the five strings when the flag is 1
  (`Handlers/PetHandler.cpp:1112-1126`); the area maps the reason number to
  the server's `PetNameInvalidReason` names (`too_short`, `too_long` and the
  rest). A successful rename sends no
  packet: the server clears `UNIT_CAN_BE_RENAMED` and rewrites
  `UNIT_FIELD_PET_NAME_TIMESTAMP` from seconds-resolution game time
  (`Handlers/PetHandler.cpp:859-929`), so a rename inside the load's second
  keeps the same timestamp. The rename-bit transition triggers the next name
  query even at the same timestamp, and the rename wait confirms only on the
  requested name for that pet number: a newer reply for another name leaves
  the wait running, and only a `name_invalid` carrying the requested name
  ends it. `pets.renamePet(name)` returns `not_renamable` when the pet's
  rename bit is clear and otherwise sends, then waits 5 s for the matching
  `name` or the matching `name_invalid`; silence emits `unanswered` with
  `request: "rename"` through the store. A second `renamePet` cancels the
  earlier wait, so only the newest request can emit `unanswered`.
- `CMSG_PET_CANCEL_AURA` is the pet guid and the `uint32` spell
  (`Handlers/SpellHandler.cpp:604-610`); the server removes only an
  aura the pet owns (`Handlers/SpellHandler.cpp:639`).
- Every stable request carries the stable master's guid (`WorldSession`
  `GetNPCIfCanInteractWith`, `Handlers/NPCHandler.cpp:341` handles
  `MSG_LIST_STABLED_PETS`): out of interact range the server sends nothing
  for the list and `0x06` for the rest. The stable list reply starts with
  the current pet when one is out, else the unslotted hunter pet, each with
  a flag of 1, then the stabled pets each with a flag of 2
  (`Handlers/NPCHandler.cpp:378-398` writes `MSG_LIST_STABLED_PETS`, slots
  byte at `:372`). With no `PetStable` the list still answers: `guid`,
  count 0, slots 0 (`Handlers/NPCHandler.cpp:365-368`); the silent
  no-`PetStable` branch (`Handlers/NPCHandler.cpp:449-450`) belongs to
  `HandleStablePet`, not the list handler. A 1-byte `SMSG_STABLE_RESULT`
  reports
  `STABLE_ERR_MONEY` 0x01, `STABLE_ERR_STABLE` 0x06, `STABLE_SUCCESS_STABLE`
  0x08, `STABLE_SUCCESS_UNSTABLE` 0x09, `STABLE_SUCCESS_BUY_SLOT` 0x0a and
  `STABLE_ERR_EXOTIC` 0x0c (`Handlers/NPCHandler.cpp:418` sends
  `SMSG_STABLE_RESULT`): stabling needs one bought slot
  (`Handlers/NPCHandler.cpp:434` handles `CMSG_STABLE_PET`), the revive
  handler is empty (`Handlers/NPCHandler.cpp:641` handles
  `CMSG_STABLE_REVIVE_PET`), and the first slot price comes out of
  `StableSlotPrices.dbc` read by the server (`Handlers/NPCHandler.cpp:627`
  inside the `CMSG_BUY_STABLE_SLOT` handler). `pets.listStabledPets`,
  `pets.stablePet`, `pets.unstablePet`, `pets.swapStabledPet` and
  `pets.buyStableSlot` each wait 5 s for the list or the result and
  otherwise report `unanswered` with `request: "stable"`;
  `pets.stableRevivePet` sends and returns. The stable slice clears on
  logout.
- `CMSG_PET_ABANDON` is the pet guid (`Handlers/PetHandler.cpp:931-949`):
  for a hunter pet the server lowers happiness and deletes the pet row at
  once (`PET_SAVE_AS_DELETED`, `:948`), sending no reply except the
  cleared bar. `pets.abandonPet()` returns `no_pet` and sends nothing
  unless a bar and the summoned pet view are both present, else sends the
  bar's guid.
- `SMSG_PET_TAME_FAILURE` is one `uint8`
  (`Entities/Unit/Unit.cpp:15561-15566`). The area keeps the
  reason as the last refusal and emits `tame_failed` with the code and
  the name. After an abandon the hunter's `PetStable` still exists and
  holds no pet, so Call Pet (883) takes the no-pet branch and the server
  answers `SMSG_PET_TAME_FAILURE` with reason 7 (`no_pet`).
- `CMSG_PET_LEARN_TALENT` is the pet guid, a `uint32` talent id and a
  `uint32` 0-based rank (`Handlers/PetHandler.cpp:1128-1138`):
  `pets.learnPetTalent(talent, rank)` returns `no_pet` with no bar, else
  sends the bar's guid with the talent and rank. The server learns the
  talent and answers with the pet form of `SMSG_TALENTS_INFO`
  (`Entities/Player/Player.cpp:14840-14849`); the area itself keeps no
  talent state, and the `talents` area's `pet_info` event confirms the
  learn.
- `CMSG_LEARN_PREVIEW_TALENTS_PET` is the pet guid, a `uint32` count and
  a `uint32` talent with a `uint32` rank per entry
  (`Handlers/PetHandler.cpp:1140-1165`); the server learns at most the
  first 30 (`MaxTalentsCount`, `:1153-1155`), then answers with the pet
  form of `SMSG_TALENTS_INFO` like the single learn. The spell id the
  pet learns arrives in `SMSG_PET_LEARNED_SPELL`
  (`Entities/Pet/Pet.cpp:1911-1914`). `pets.learnPetTalents(picks)`
  refuses `no_pet` with no bar, `empty_list` for an empty list and
  `too_many` past 30 entries, else sends the bar's guid with the list.
- `CMSG_DISMISS_CRITTER` is the critter guid
  (`Server/Packets/PetPackets.cpp:20-23`, handler
  `Handlers/PetHandler.cpp:39-55`): when the guid is the owner's critter
  the server unsummons it. `pets.dismissCritter()` reads the owner's
  `UNIT_FIELD_CRITTER` (the same offset 10 the view reads for the summon)
  and returns `no_critter` with nothing sent when it is 0, else sends
  that guid.

## Left out

- `SMSG_PET_UPDATE_COMBO_POINTS`: built by pets-8.
- `SMSG_PET_MODE`, `SMSG_PET_BROKEN`, `CMSG_PET_UNLEARN`,
  `SMSG_PET_UNLEARN_CONFIRM`, `SMSG_PET_GUIDS`: dead (see Proof).

## Capabilities row

No agent verb; the world-service acts `pets.requestPetInfo`,
`pets.petCommand`, `pets.petStance`, `pets.petStopAttack`,
`pets.petCast`, `pets.petAutocast`, `pets.petSetAction`,
`pets.petSwapActions`, `pets.petCancelAura`, `pets.queryPetName`,
`pets.renamePet`, `pets.listStabledPets`, `pets.stablePet`,
`pets.unstablePet`, `pets.swapStabledPet`, `pets.buyStableSlot`,
`pets.stableRevivePet`, `pets.abandonPet`, `pets.dismissCritter`,
`pets.learnPetTalent` and `pets.learnPetTalents` only.

## The pet tool

The `pet` tool checks the pet's status, calls, dismisses or revives it,
attacks with it, moves it (`follow`, `stay`, `stop`) or sets its stance
(`passive`, `defensive`, `aggressive`). Status (`status` or no `do`)
prints the pet's name, family, level, health, happiness, stance, command
and the spells with their autocast state and cooldown ends; it sends
nothing. Happiness words come from the pet's happiness level
(`Entities/Pet/Pet.cpp:894-898`, `src/server/shared/SharedDefines.h:261`),
and family names from the creature family list
(`src/server/shared/SharedDefines.h:2644-2670`). Sends run inside
`ctx.rt.mutex.run` through `claim.areas.pets` and settle with `settle`
(subscribe before send). `call`, `revive` and `dismiss` cast the owner's
spell found by name (Call Pet 883, Dismiss Pet 2641,
`Entities/Pet/Pet.cpp:450`) and settle `DONE` on a `bar` event, `FAILED`
on an owner cast failure, `UNCONFIRMED` after the spell's cast time plus
5 s. Only the owner's combat `cast_failed` or `cast_interrupted` fails
the tool; the pet's own `feedback` and `cast_failed` rows are ignored and
the wait continues. `revive` of a dead pet that is still out settles
`DONE` when the pet entity's health leaves 0 for above 0: the corpse stays
summoned (`Entities/Pet/Pet.cpp:671`), `EffectResurrectPet` revives it in
place without a new bar (`Entities/ObjectUpdates/Unit.cpp` resurrect path
and `Spells/SpellEffects.cpp:5496-5525`). `dismiss` for a pet without
the abandon bit uses `petCommand("dismiss")`, which leaves a summoned pet
as a corpse (`Handlers/PetHandler.cpp:287-294`). `call` is refused with `already_out`
when a bar is present. `attack` uses `petAttack` and settles `DONE` when
the pet's target field equals the target or the `threat` area emits
`reaction` for the pet, `UNCONFIRMED` with a `travel` `Next` after 5 s.
`follow`, `stay` and `stance` settle `DONE` only when the next bar shows
the change, else `UNCONFIRMED`. `stop` sends `petStopAttack` (a unit that
stops its attack clears its target field, `Entities/Unit/Unit.cpp:7221`)
and then `follow`. `queryPetName` asks for the current pet's name again and `renamePet` renames a hunter pet whose rename bit is set, waiting 5 s for the `name` carrying the requested name or a `name_invalid` refusing it before the store reports `unanswered`.
`cast`, `autocast`, `abandon`, `tame` and `talent` are refused with `not_built`: pets-10 and pets-12 own them.

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
| `SMSG_PET_ACTION_SOUND` | `mock` | `packages/core/src/wow/areas/pets/store.test.ts` "the action and dismiss sounds change no state and emit nothing" | `Server/Packets/PetPackets.cpp:54-59` |
| `SMSG_PET_DISMISS_SOUND` | `mock` | `packages/core/src/wow/areas/pets/store.test.ts` "the action and dismiss sounds change no state and emit nothing" | `Server/Packets/PetPackets.cpp:61-68` |
| `CMSG_PET_CAST_SPELL` | `builder` | not seen live: probe flow `pets-spell --arg spell=Growl` on an `eversong10-hunter` with its Ravager out, exit 0: one 18-byte `CMSG_PET_CAST_SPELL` out, answered by `SMSG_PET_CAST_FAILED` with reason `bad_implicit_targets` (Growl cast with no target selected and no hostile within 35 yards; the selected unit falls back only after an explicit target, `Handlers/PetHandler.cpp:1061-1064`). A second try at Fairbreeze Village with `--arg target=nearest` found no hostile within 35 yards even after the attack flow engaged a Springpaw Stalker, so no targeted cast went out. Builder test "petCast sends a non-autocastable bar spell and refuses one whose attribute is passive" | `Handlers/PetHandler.cpp:1018-1023` |
| `SMSG_PET_CAST_FAILED` | `live` | probe flow `pets-spell --arg spell=Growl`, exit 0: `SMSG_PET_CAST_FAILED` size 6 after the cast, parsed as count 1, spell 14916, result `bad_implicit_targets`; a second cast fails the same way (Growl has no cooldown, so no `not_ready`) | `Spells/Spell.cpp:4842-4861` |
| `CMSG_PET_SPELL_AUTOCAST` | `live` | probe flow `pets-spell --arg autocast=Bite:on --bodies`, exit 0: 13-byte `CMSG_PET_SPELL_AUTOCAST` (spell 17255, flag 1), and the next 144-byte `SMSG_PET_SPELLS` shows Bite as type `0xc1` where it was `0x81` before | `Server/Packets/PetPackets.cpp:35-40` |
| `CMSG_PET_SET_ACTION` | `live` | probe flow `pets-spell --arg swap=3,4 --bodies`, exit 0: the flow asks for the bar again first, then one 24-byte `CMSG_PET_SET_ACTION` (slot 3 packed `0xc1004367`, slot 4 packed `0x81003a44`); the next `SMSG_PET_SPELLS` shows slots 3 and 4 swapped (Growl `0x81003a44` and Bite `0xc1004367` exchange places) | `Handlers/PetHandler.cpp:696-716` |
| `CMSG_PET_CANCEL_AURA` | `accepted` | `--send CMSG_PET_CANCEL_AURA` with the pet guid and spell 17255 (Bite), exit 3 for the missing `--expect SMSG_PET_ACTION_FEEDBACK` only: the 12-byte send went out, no disconnect and no error packet; the server removes only an aura the pet owns, and the pet had none | `Handlers/SpellHandler.cpp:604-610` |
| `SMSG_SPELL_COOLDOWN` (pets peek) | `mock` | `packages/core/src/wow/areas/pets/store.test.ts` "a pet-guid SMSG_SPELL_COOLDOWN sets a pet cooldown and the character's guid changes nothing"; no pet-guid packet arrived live (Growl casts failed before any cooldown; sent only when `RequireCooldownInfo()` holds). A `uses` opcode takes no `unseen` entry | `Entities/Unit/Unit.cpp:16618-16625` |
| `SMSG_CLEAR_COOLDOWN` (pets peek) | `mock` | `packages/core/src/wow/areas/pets/store.test.ts` "SMSG_CLEAR_COOLDOWN clears only the pet's row for its own guid"; no pet-guid packet arrived live. A `uses` opcode takes no `unseen` entry | `Entities/Pet/Pet.cpp:2458` |
| `CMSG_PET_NAME_QUERY` | `live` | probe flow `pets-bar` on an `eversong10-hunter` (`--expect SMSG_PET_NAME_QUERY_RESPONSE`): four 12-byte `CMSG_PET_NAME_QUERY` out, four 17-byte `SMSG_PET_NAME_QUERY_RESPONSE` in | `Handlers/PetHandler.cpp:616-627` |
| `SMSG_PET_NAME_QUERY_RESPONSE` | `live` | the same `pets-bar` run: four replies, each naming the hunter pet (pet number 3711, "Ravager") with its name timestamp, parsed into `names[3711]` | `Handlers/PetHandler.cpp:656-668` |
| `CMSG_PET_RENAME` | `live` | probe flow `pets-name --arg rename=Fangtooth` on the same account: one 19-byte `CMSG_PET_RENAME` out, and `soap gm read pet` afterwards names the pet Fangtooth; the rename cleared `UNIT_CAN_BE_RENAMED`, so a later `pets-name --arg rename=Rex` returns `not_renamable` with nothing sent | `Handlers/PetHandler.cpp:846-852` |
| `SMSG_PET_NAME_INVALID` | `live` | probe flow `pets-name --arg rename=A` on the same account while the rename bit was still set: one 11-byte `CMSG_PET_RENAME` out, one 7-byte `SMSG_PET_NAME_INVALID` in, matching `too_short` (`uint32` 3, name "A", flag 0) | `Handlers/PetHandler.cpp:1112-1126` |
| `MSG_LIST_STABLED_PETS` | `live` | probe flow `pets-stable --arg do=list,buy,list,stable,list` on an `eversong10-hunter` staged to the Tranquillien platform with `money 1000000` (pet Ravager 3722), exit 0: one 8-byte `MSG_LIST_STABLED_PETS` out per list, one 31-byte reply in per list, and from-interact-range `nearest` settled Paniar `0xf13000411900070d`; a `pets-stable --arg do=list` from 49 yards earlier went out with the server silent and `unanswered` reported | `Handlers/NPCHandler.cpp:341` |
| `CMSG_BUY_STABLE_SLOT` | `live` | the same run, exit 0: one 8-byte `CMSG_BUY_STABLE_SLOT` out to Paniar, answered by a 1-byte `SMSG_STABLE_RESULT` (`slot_bought`); `soap gm truth` showed money 999500 copper after staging 1000000, a 500-copper fall that equals the first staged `StableSlotPrices.dbc` row (row 0 is id 1 price 500, read with a throwaway `openDbc` script per SR3-pets-7's script branch) | `Handlers/NPCHandler.cpp:607` |
| `SMSG_STABLE_RESULT` | `live` | the same run: one 1-byte `slot_bought` after the buy, one 1-byte `stabled` after the stable; the `--arg do=list,unstable,list,revive` run answered the unstable with `unstabled`; the first `--arg do=buy` try from out of interact range answered `refused` (`0x06`) | `Handlers/NPCHandler.cpp:418` |
| `CMSG_STABLE_PET` | `live` | the same run, exit 0: one 8-byte `CMSG_STABLE_PET` out, answered by `SMSG_STABLE_RESULT` (`stabled`); `soap gm read pet` afterwards showed pet 3722 in Slot 1, and after logout showed the slot still holds it | `Handlers/NPCHandler.cpp:425` |
| `CMSG_UNSTABLE_PET` | `live` | probe flow `pets-stable --arg do=list,unstable,list,revive --arg number=3722`, exit 0: one 12-byte `CMSG_UNSTABLE_PET` out (guid plus number), answered by `SMSG_STABLE_RESULT` (`unstabled`); `soap gm read pet` afterwards showed pet 3722 back in Slot 0 | `Handlers/NPCHandler.cpp:493` |
| `CMSG_STABLE_REVIVE_PET` | `accepted` | the same run, exit 0: one 8-byte `CMSG_STABLE_REVIVE_PET` out, no disconnect and no error packet; the handler is empty | `Handlers/NPCHandler.cpp:641` |
| `CMSG_STABLE_SWAP_PET` | `live` | probe flow `pets-stable --arg do=list,swap --arg number=3722` on the staged Tranquillien hunter (Ravager 3722 stabled, no pet out), exit 0: one 12-byte `CMSG_STABLE_SWAP_PET` out, one 1-byte `SMSG_STABLE_RESULT` in, `results: 1` and `refusals: 0` in the probe output, the listing marked `stale: true`, and a fresh 144-byte `SMSG_PET_SPELLS` pet bar right after in the packet trace (the probe output and trace are not committed). The load-a-stabled-pet branch needs neither a current pet nor a second beast: it loads the stabled pet when both `CurrentPet` and `UnslottedPets` are empty and reports `STABLE_SUCCESS_UNSTABLE` | `Handlers/NPCHandler.cpp:646` |
| `CMSG_PET_ABANDON` | `live` | probe flow `pets-abandon` on an `eversong10-hunter`, exit 0: one 8-byte `CMSG_PET_ABANDON` out carrying the pet guid, answered by two 8-byte all-zero `SMSG_PET_SPELLS` (the cleared bar); `soap gm read pet` afterwards shows no row | `Handlers/PetHandler.cpp:931` |
| `SMSG_PET_TAME_FAILURE` | `live` | the same run: the flow casts Call Pet (883) after the abandon, and the server answers one 1-byte `SMSG_PET_TAME_FAILURE` with code 7 (`no_pet`), parsed into `lastRefusal` and a `tame_failed` event | `Entities/Unit/Unit.cpp:15561` |
| `CMSG_PET_LEARN_TALENT` | `live` | probe flow `pets-talent --arg talent=2118` on an `eversong10-hunter` staged with `soap gm level 40` (pet Ravager family 31, Cunning tree, four free points at pet level 35): one 16-byte `CMSG_PET_LEARN_TALENT` out (pet guid, talent 2118, rank 0), one 4-byte `SMSG_PET_LEARNED_SPELL` in (spell 61682, the first rank of talent 2118) and one 11-byte pet-form `SMSG_TALENTS_INFO` in listing talent 2118 with 3 free points left; the flow reported `confirmed: true` because that reply holds the requested talent. A later `pets-talent --arg talent=2120` drew `SMSG_PET_LEARNED_SPELL` 61686 and a 16-byte reply with 2118 and 2120, and `--arg talent=2165` at zero free points (a second-row talent) drew only an unchanged reply and `confirmed: false`. The three `packets.jsonl` traces are not committed | `Handlers/PetHandler.cpp:1128` |
| `CMSG_LEARN_PREVIEW_TALENTS_PET` | `live` | probe flow `pets-talent --arg talents=2119,2121` on the same hunter with two free points, built by `learnPetTalents`: one 28-byte `CMSG_LEARN_PREVIEW_TALENTS_PET` out (pet guid, count 2, talents 2119 and 2121 at rank 0), two 4-byte `SMSG_PET_LEARNED_SPELL` in (spells 61684 and 61689) and one 26-byte pet-form `SMSG_TALENTS_INFO` in listing 2118, 2119, 2120 and 2121 with 0 free points; the flow reported `confirmed: true`. The pet guid changes at every login (`0xf140000ed1000975` to `...976` to `...977`), so a hand-written body with a guid from an earlier session is ignored by `Player::LearnPetTalent` and only draws the unchanged reply. The `packets.jsonl` trace is not committed | `Handlers/PetHandler.cpp:1140` |
| `CMSG_DISMISS_CRITTER` | `live` | probe flow `pets-abandon --arg companion=1` on a fresh `eversong10-hunter` staged with `items/add '{"item":4401}'` and `--expect CMSG_DISMISS_CRITTER`, exit 3 (the sink checks expectations against inbound packets only, so a client opcode in `--expect` is always reported missing; the live effect is unaffected and a rerun should omit that `--expect`): `CMSG_USE_ITEM` for the Mechanical Squirrel Box, `CMSG_CAST_SPELL` for Mechanical Squirrel (4055), then one 8-byte `CMSG_DISMISS_CRITTER` out carrying the owner's critter guid, and the owner's `UNIT_FIELD_CRITTER` reads 0 afterwards | `Server/Packets/PetPackets.cpp:20` |

