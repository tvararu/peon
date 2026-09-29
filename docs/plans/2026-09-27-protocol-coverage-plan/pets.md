# pets: pet bar, commands, spells, names, stable and pet talents (key: pets)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.12 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).

## What the unit delivers

A pet class plays with its pet, not only next to it. Core learns the pet
bar (commands, stances, spells, autocast, cooldowns, family, summon
duration), the pet's real name, the stable, and every pet refusal the
server sends. The agent gets a new tool `pet` (`do: status | call |
dismiss | revive | attack | follow | stay | stop | stance | cast |
autocast | rename | abandon | tame | talent`) and stable actions on
`interact`. The `SMSG_PET_SPELLS` parser is also the control bar of
vehicles, charmed and possessed units (`Entities/Player/Player.cpp:9828-9990`),
so the `vehicles` unit imports it.

- Unit `pets`, one code area `pets` (design 5.1). Worktree `proto-pets`,
  branch `proto/area-pets` (contract 0.1, D19):

  ```
  orca-ide worktree create --name proto-pets \
    --base-branch origin/factory/426-protocol-coverage \
    --parent-worktree active --setup run \
    --comment 'owner: coordinator, item 4 pets'
  git branch -m proto/area-pets
  ```

- Phase (design 5.1, N22): wave 1 for `pets-1` and `pets-2`; wave 2 for
  `pets-3` and `pets-9`; wave 3 for `pets-4` to `pets-7` and `pets-10` to
  `pets-12`; wave 4 for `pets-8`. One task at a time; each starts from the
  current `origin/factory/426-protocol-coverage` after the previous one
  landed. The sections below are in that build order.
- Owned opcodes: 30 relevant (29 missing, 1 absent:
  `CMSG_STABLE_REVIVE_PET`), 5 dead (design 5.12). The verify
  corrections move no row into or out of this area. No owned opcode is
  a stub today, so no task deletes a `stubs` line.
- Handled opcode with a body gap: `CMSG_PET_ACTION` (legacy send in
  `packages/core/src/wow/combat.ts:133-136`, builder
  `packages/core/src/wow/protocol/pet.ts:7-13`). `pets-2` adds the general
  form.
- Uses (peek, design 3.6): `SMSG_SPELL_COOLDOWN` and
  `SMSG_CLEAR_COOLDOWN`, whose legacy owners stay in
  `packages/core/src/wow/gameplay-handlers.ts:118-123`.
- Shared piece it owns (N28, contract 2.5):
  `packages/core/src/wow/protocol/pet-spells.ts` (`parsePetSpells`), used
  by `vehicles`.
- Names (contract D7): `PETS_OPCODES`, `petsArea`, `PetsStore`,
  `PetsState`, `PetsEvent`, `PetsActs`, `petsRuntime`, `petsHarness`,
  `petTool` (tool `pet`, kind `action`, contract 1.9 and D25). Log rows
  use the area domain: `pets/out`, `pets/gone`, `pets/learned`,
  `pets/refused`, `pets/stable` (contract 1.9; the area design's `pet/*`
  names do not apply).
- Test packet builders live in `packages/core/test-support/areas/pets.ts`
  as `pets<Opcode>Body(...)` (contract 1.8). `vehicles` tests reuse
  `petsPetSpellsBody`.
- Scenario ids: `t8-pets-command`, `t8-pets-spells`, `t8-pets-rename`,
  `t8-pets-abandon`, `t8-pets-stable`, `t8-pets-talent` (design 5.12).
  The coordinator lists them in the plan index with tier 8 (contract
  3.7).

### Unit files

Paths without a prefix are under `packages/core/src/wow/`.

| Path | Created by |
|---|---|
| `areas/pets/opcodes.ts`, `areas/pets/area.ts` | `SEED-1` (the unit fills `uses`, `unseen`, `dead`) |
| `protocol/pet-spells.ts` and test | pets-1 |
| `areas/pets/protocol.ts` and test | pets-1 (grows in 2-8) |
| `areas/pets/store.ts` and test | pets-1 (grows in 2-6, 8) |
| `areas/pets/view.ts` and test | pets-1 |
| `areas/pets/runtime.ts` and test | pets-1 (grows in 2-7) |
| `areas/pets/stable.ts` and test | pets-5 |
| `packages/core/test-support/areas/pets.ts` | pets-1 |
| `packages/harness/src/areas/pets/area.ts` and test | `SEED-1`; rules from pets-9 |
| `packages/harness/src/areas/pets/tool.ts`, `tool-command.ts`, `tool-spell.ts`, `tool-name.ts`, `tool-talent.ts` and tests | pets-9, pets-10, pets-12 |
| `packages/harness/src/tools/interact-stable.ts` and test | pets-11 (under the `interact` lease) |
| `packages/devtools/src/probe-flows/pets-bar.ts`, `pets-command.ts`, `pets-spell.ts`, `pets-name.ts`, `pets-stable.ts`, `pets-abandon.ts`, `pets-talent.ts` | pets-1 to pets-7 |
| `packages/harness/src/grader/scenarios/t8-pets-*.json` (six) | pets-9 to pets-12 |
| `docs/areas/pets.md` | pets-1 (each later task adds its proof rows) |
| `docs/protocol-coverage/pets.md` | regenerated only |

### Leases this unit needs (contract 2.7)

| Legacy file | Task | Edit |
|---|---|---|
| harness `tools/interact.ts`, `tools/interact*.ts` (new `interact-stable.ts`), and the `interactParams` block of `tools/params.ts` (`:99`) | pets-11 | `talk` at a stable master lists the stable; `do: stable \| unstable \| buy_slot` |

No other lease. Two leases that the contract lists for `pets` are not
needed:

- `protocol/pet.ts`: `buildPetAction` lives in `areas/pets/protocol.ts`,
  so `buildPetAttack` and `PET_ATTACK_ACTION` stay unchanged for
  `combat.ts:133` and the harness `petAttack` caller
  (`packages/harness/src/loops/combat-actions.ts:185`).
- `combat-store.ts`: pet-guid cooldowns reach the pets store through
  `wire.peek` on `SMSG_SPELL_COOLDOWN` and `SMSG_CLEAR_COOLDOWN`. The
  legacy `applyCooldown` and `applyClearCooldown` still drop a guid that
  is not the character's (`combat-store.ts:282-292`), and nothing edits
  them. This removes the collision with `combat-log` and `spells`.

### Pet staging (every live task)

- The one pet-class preset is `eversong10-hunter` (template `Tplhunter`,
  `packages/factory/src/soap-presets.ts:31`). Whether `Tplhunter` has a
  tamed pet could not be determined from the repo. pets-1 answers it
  first: `mise factory soap gm <ACCOUNT> read pet` (T-5) if T-5 has
  landed, else the owner's `UNIT_FIELD_SUMMON` after a Call Pet cast.
- If the template has no pet, the worker tames one with Tame Beast (1515,
  `src/server/scripts/Spells/spell_hunter.cpp:1002`) through
  `handle.cast(1515, guid)` (`client.ts:253`) on a low beast near the
  spawn, and every eval opens with `pet do:"tame"` (design 5.12
  Decisions). Which beast is nearest could not be determined; the
  builder picks one from `nearby --json`.
- Spell ids confirmed in AzerothCore: Tame Beast 1515, Dismiss Pet 2641
  (`Spells/SpellInfoCorrections.cpp:1318`), Summon Imp 688. Call Pet
  (883), Revive Pet (982) and Mend Pet (136) are unconfirmed; the builder
  resolves each by name through the spell catalog and records the id.
- Staging before login uses `mise factory soap setup <ACCOUNT>
  <endpoint>` (`docs/factory.md:74-86`): `level`, `money`,
  `spells/learn`. Their JSON body shapes are not in the repo and could
  not be determined; the builder reads them from the realm service. GM
  staging online uses `mise factory soap gm` (T-5) on the task's own
  character only (contract 0.7).
- No warlock or death knight preset exists (`soap-presets.ts:66-76`), so
  the warlock-only packets fall back to R22 mock proof.
- Every live task ends with `mise factory soap delete <ACCOUNT>`.

### Contract issues found while planning

These are gaps, not changes. The coordinator rules on each (contract
precedence 3); each is **accepted by the maintainer (P2-5)**. Until then
the plan works as stated.

1. **One store, not two.** Design 5.12 names `PetStore` and
   `StableStore`, but an area module has one `store()` (contract 1.2).
   The plan builds one `PetsStore` whose state holds `bar`, `cooldowns`,
   `names`, `lastRefusal`, `comboPoints` and `stable`; `areas/pets/stable.ts`
   holds the stable slice's reducer.
2. **Leases not taken.** Contract 2.7 lists `protocol/pet.ts` and
   `combat-store.ts` for `pets`. The plan needs neither (section above).
   The coordinator may drop both rows from the lease table.
3. **`tools/params.ts` holds the `interact` schema** (`tools/params.ts:99-133`).
   The `interact` lease for pets-11 must include that block, as D13 does
   for `contract/details.ts` (the same gap objects reports).
4. **Entity helpers.** `fieldOf` and `isUnit` live in `#wow/entity-store`
   (`entity-store.ts:70,77`), which an area may not import as a value
   (contract 1.12). `areas/pets/view.ts` reads
   `deps.getEntity(guid)?.rawFields` with `UNIT_FIELDS` offsets
   (`protocol/update-fields.ts:60-62,106-108,135`) and `joinGuid` from
   `#wow/protocol/packet` (`packet.ts:3`), which needs no allow-list
   change.
5. **Pet talents cross an area line.** The pet form of
   `SMSG_TALENTS_INFO` and the talent catalog belong to `talents`, and an
   area never imports another area. pets-7 core acts send and return;
   the harness reads the `talents` area's `pet_info` event in pets-12.
6. **Eval checks on `.pet list`.** pets-10 and pets-11 need the console
   check source of T-10 (`source: "console"`, `soap gm read pet`), and
   the carve-out in contract 0.7 that tooling issue 4 asks for. Without
   it those checks fall back to game-log rows.

---

## pets-1: Pet bar and pet info (wave 1)

Rulings: SR1-pets-1, SR1-pets-3, SR1-pets-4, SR1-pets-5, SR1-pets-6, SR1-pets-7, SR1-pets-8, SR1-pets-12 (section "Seed rulings (SEED-1)").

**Files:**
- Create: `packages/core/src/wow/protocol/pet-spells.ts` and test
- Create: `areas/pets/protocol.ts`, `store.ts`, `view.ts`, `runtime.ts`
  and their tests
- Modify: `areas/pets/area.ts`, `areas/pets/opcodes.ts` (`unseen`,
  `dead`)
- Create: `packages/core/test-support/areas/pets.ts`
- Create: `packages/devtools/src/probe-flows/pets-bar.ts`
- Create: `docs/areas/pets.md`; regenerate `docs/protocol-coverage/pets.md`

**Depends on:** `S0-5`, `SEED-1` (seeds `pets`), `T-2` (tap), `T-3`
(probe).

**Opcodes:** `SMSG_PET_SPELLS`, `CMSG_REQUEST_PET_INFO`,
`SMSG_PET_LEARNED_SPELL`, `SMSG_PET_UNLEARNED_SPELL`.

**Steps:**

1. **Failing parser tests** (`protocol/pet-spells.test.ts`). Three
   bodies from `petsPetSpellsBody` in `test-support/areas/pets.ts`:
   - the pet form as `Player::PetSpellInitialize` writes it
     (`Entities/Player/Player.cpp:9756-9826`): guid, `u16` family,
     `u32` duration, `u8` react, `u8` command, `u16` flags, 10 slots of
     `u32`, `u8` spell count and packed spells, `u8` cooldown count and
     `{ u32 spell, u16 category, u32 cooldown, u32 categoryCooldown }`
     with one `categoryCooldown` of `0x80000000`
     (`Player.cpp:9813-9819`);
   - the vehicle form (`Player.cpp:9856-9929`): flags `0x800`
     (`:9871`), an empty slot written as `u16` 0, `u8` 0, `u8` slot
     (`:9879`);
   - the clear form, a guid of 0 only (`Player.cpp:9384-9387`,
     `:9985-9990`).
   Expect `parsePetSpells` to return `{ guid: 0n }` for the clear form;
   otherwise `family`, `durationMs`, `react`, `command`, `flags` (0x800
   kept), `slots` as `{ action: v & 0xFFFFFF, type: v >>> 24 }`,
   `spells`, and `cooldowns` with `infinite: true` for `0x80000000`.
   Run `mise test packages/core/src/wow/protocol/pet-spells.test.ts` and
   see it fail (no module). wow_messages reads two bytes where AzerothCore
   writes one `u16` flags word; the bytes are the same.
2. **Failing area parser tests** (`areas/pets/protocol.test.ts`):
   `parsePetSpellId` reads one `u32` for `SMSG_PET_LEARNED_SPELL`
   (`Entities/Pet/Pet.cpp:1911-1914`) and `SMSG_PET_UNLEARNED_SPELL`
   (`Pet.cpp:1965-1968`); `buildRequestPetInfo()` writes an empty body
   (`Handlers/MiscHandler.cpp:1560-1578`). See them fail.
3. **Failing store tests** (`areas/pets/store.test.ts`,
   `areaRig("pets")`): inject the pet form; expect
   `handle.state().bar` with react `defensive`, command `follow` and one
   `bar` event. Inject the clear form; expect `bar: undefined` and a
   `bar` event with `cleared: true`. Inject a learned spell; expect the
   spell in `bar.spells` with autocast `off` and one `spell_learned`
   event; an unlearned spell removes it and emits `spell_unlearned`.
   Spell autocast names come from the slot type byte: `0xC1` on, `0x81`
   off, `0x01` passive (`Entities/Unit/CharmInfo.h:61-65`). Cooldowns
   are stored as absolute end times from `deps.now()`.
4. **Failing view test** (`areas/pets/view.test.ts`): with a fake
   `getEntity`, `petView(getEntity, selfGuid)` joins the owner's
   `UNIT_FIELD_SUMMON` (offset 8), the pet's `PETNUMBER` (75),
   `PET_NAME_TIMESTAMP` (76), byte 2 of `UNIT_FIELD_BYTES_2` (122) as
   `canRename` (0x01) and `canAbandon` (0x02)
   (`Entities/Unit/UnitDefines.h:152-153`), and happiness from `POWER5`
   (`src/server/shared/SharedDefines.h:261`). No summon gives
   `undefined`. `PetsState.pet` is this view, computed in `snapshot()`.
5. **Failing runtime test** (`areas/pets/runtime.test.ts`):
   `handle.act.requestPetInfo()` records one `CMSG_REQUEST_PET_INFO` in
   `rig.sent` and returns `{ ok: true }`.
6. **Implement.** `parsePetSpells` in `protocol/pet-spells.ts` (exported
   types `PetBar`, `PetSlot`, `PetCooldown`); `PetsStore` with a plain
   `new Emitter()` and events `bar`, `spell_learned`, `spell_unlearned`;
   `register` calls `wire.on` for the three server opcodes;
   `petsRuntime` with the act `requestPetInfo`. `petsArea.eventTypes`
   lists the event types. `PETS_OPCODES.dead` gets the five dead rows
   (section "Dead opcodes") if `SEED-1` has not written them.
7. **Probe flow** `pets-bar`: casts Call Pet by name when no pet is out,
   waits for `SMSG_PET_SPELLS`, then calls `handle.pets.act.requestPetInfo()`
   and prints `handle.pets.state()`.
8. **Doc.** Create `docs/areas/pets.md` with the headings of contract
   3.8. Wire notes: the `u16` flags word (`Player.cpp:9773`, against
   `pet/smsg_pet_spells.wowm`), the charmed-player `u32` 0 in place of
   react, command and flags (`Player.cpp:9964`), the stable list without
   loyalty (`Handlers/NPCHandler.cpp:377-411`, against
   `pet/msg_list_stabled_pets_server.wowm`), the rename declined names
   (`Handlers/PetHandler.cpp:885-891`), the cast failure without
   `multiple_casts` (`Spells/Spell.cpp:4842-4861`). Left out: each other
   owned opcode with "built by pets-<n>"; the five dead rows.
9. `mise protocol:coverage`, `mise ci:checks`.

**Proof:**
- `SMSG_PET_SPELLS`, `CMSG_REQUEST_PET_INFO`: live. New
  `eversong10-hunter` account; answer the pet staging question first.
  `mise protocol:probe <ACCOUNT> --flow pets-bar --expect SMSG_PET_SPELLS
  --bodies`. The capture holds two bars: one from the summon
  (`Entities/Unit/Unit.cpp:7696`) and one as the reply to the request.
  A second run that casts Dismiss Pet (2641) captures the clear form.
- `SMSG_PET_LEARNED_SPELL`: try live with `mise factory soap gm
  <ACCOUNT> level 20` while the pet is out, then `--until
  SMSG_PET_LEARNED_SPELL` [I: a pet level-up grants a spell rank]. If it
  does not arrive: `mock` from `Pet.cpp:1911-1914`, listed in `unseen`;
  pets-7 moves the row to `live` when a talent learn sends it.
- `SMSG_PET_UNLEARNED_SPELL`: `mock` from `Pet.cpp:1965-1968`, listed in
  `unseen` (no staging path found).

**Commit:**

```
feat: Read the pet bar
```

Body: "Core knew nothing of the pet but its guid. The pets area now reads
the pet bar with its stance, command, spells and cooldowns, keeps the
vehicle form intact for vehicles, and can ask the server for the bar."

---

## pets-2: Pet commands and stances (wave 1)

Rulings: SR1-pets-2, SR1-pets-5, SR1-pets-6, SR1-pets-7, SR1-pets-8, SR1-pets-9, SR1-pets-10, SR1-pets-11 (section "Seed rulings (SEED-1)").

**Files:**
- Modify: `areas/pets/protocol.ts`, `store.ts`, `runtime.ts`, `area.ts`,
  `opcodes.ts` (`unseen`) and tests;
  `packages/core/test-support/areas/pets.ts`
- Create: `packages/devtools/src/probe-flows/pets-command.ts`
- Modify: `docs/areas/pets.md`; regenerate `docs/protocol-coverage/pets.md`

**Depends on:** pets-1.

**Opcodes:** `CMSG_PET_STOP_ATTACK`, `SMSG_PET_ACTION_FEEDBACK`,
`SMSG_PET_ACTION_SOUND`, `SMSG_PET_DISMISS_SOUND`. Body fix of the
handled `CMSG_PET_ACTION` (no proof row).

**Steps:**

1. **Failing builder tests** (`protocol.test.ts`):
   `buildPetAction(pet, type, action, target)` writes guid, one `u32`
   `(type << 24) | action` and a target guid, as `HandlePetAction` reads
   it (`Handlers/PetHandler.cpp:160-330`); type `0x07` command (0 stay,
   1 follow, 2 attack, 3 dismiss) and `0x06` reaction (0 passive,
   1 defensive, 2 aggressive) (`CharmInfo.h:61-65`). The attack case
   equals `buildPetAttack`'s bytes. `buildPetStopAttack(pet)` writes one
   guid (`PetHandler.cpp:127-148`).
2. **Failing parser tests:** `parsePetActionFeedback` reads one `u8`
   with names `pet_dead`, `nothing_to_attack`, `cant_attack` for 1-3
   (`Entities/Pet/PetDefines.h:71-77`; wowm's value 4 does not exist in
   AzerothCore); `parsePetActionSound` reads guid and `u32`
   (`Server/Packets/PetPackets.cpp:54-59`); `parsePetDismissSound` reads
   `u32` model id and three `f32` (`PetPackets.cpp:61-68`).
3. **Failing store and runtime tests** (`areaRig`):
   - `act.petCommand("follow")` sends `CMSG_PET_ACTION` then
     `CMSG_REQUEST_PET_INFO`, because the server sends no reply and the
     next bar confirms it (`MiscHandler.cpp:1567-1568`); `petStance` and
     `stay` do the same.
   - With no bar, each act returns `{ ok: false, reason: "no_pet" }` and
     sends nothing.
   - `petCommand("dismiss")` on a pet whose `canAbandon` is set returns
     `hunter_pet_dismiss` and sends nothing, because command 3 deletes a
     hunter pet (`PetHandler.cpp:287-288`, the flag set at
     `Entities/Pet/Pet.cpp:314,1034`).
   - `petStopAttack()` sends one `CMSG_PET_STOP_ATTACK`.
   - Injecting feedback 1 sets `lastRefusal` and emits `feedback` with
     `pet_dead`. The two sound bodies change no state and emit nothing.
4. **Implement.** Acts `petCommand`, `petStance`, `petStopAttack` in
   `petsRuntime`; `register` gets `wire.on` for the three server opcodes.
5. **Probe flow** `pets-command`: `--arg do=<stay|follow|passive|defensive|aggressive|stop>`
   calls the act and prints the next bar.
6. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:**
- `CMSG_PET_ACTION` (body): live, no row. On an `eversong10-hunter`
  account with a pet out, run the `pets-command` flow once per stance and
  per `stay` and `follow`, each with `--expect SMSG_PET_SPELLS --bodies`;
  each next bar shows the new react or command.
- `CMSG_PET_STOP_ATTACK`: live. The worker sends the pet at a nearby
  beast (`petAttack`), then runs `--arg do=stop`; the pet's
  `UNIT_FIELD_TARGET` clears in the next update [I]. No reply packet.
- `SMSG_PET_ACTION_FEEDBACK`: try live: let the pet die against a beast
  well above its level, then send `CMSG_PET_CANCEL_AURA` for a pet spell
  before the corpse goes (`Handlers/SpellHandler.cpp:635`) [I]. That send
  needs the pets-3 builder, so pets-2 records `mock` from
  `Entities/Unit/Unit.cpp:12556-12564`, listed in `unseen`, and pets-3
  tries the live capture.
- `SMSG_PET_ACTION_SOUND`, `SMSG_PET_DISMISS_SOUND`: `mock` from
  `PetPackets.cpp:54-68` and `Unit.cpp:12567-12576`, listed in `unseen`.
  Only a warlock pet sends them (`PetHandler.cpp:256,291`), and no
  warlock preset exists.

**Commit:**

```
feat: Command the pet and set its stance
```

Body: "Core could only send the pet to attack. The pets area now sends
stay, follow, stop and the three stances, confirms each through the
next pet bar, and refuses the command that would delete a hunter pet."

---

## pets-3: Pet spells and the bar layout (wave 2)

**Files:**
- Modify: `areas/pets/protocol.ts`, `store.ts`, `runtime.ts`, `area.ts`,
  `opcodes.ts` (`uses`, `unseen`) and tests;
  `packages/core/test-support/areas/pets.ts`
- Create: `packages/devtools/src/probe-flows/pets-spell.ts`
- Modify: `docs/areas/pets.md`; regenerate `docs/protocol-coverage/pets.md`

**Depends on:** pets-2, `SEED-2`, `objects-4` (`protocol/spell-targets.ts`).

**Opcodes:** `CMSG_PET_CAST_SPELL`, `SMSG_PET_CAST_FAILED`,
`CMSG_PET_SPELL_AUTOCAST`, `CMSG_PET_SET_ACTION`,
`CMSG_PET_CANCEL_AURA`. Uses (peek): `SMSG_SPELL_COOLDOWN`,
`SMSG_CLEAR_COOLDOWN`.

**Steps:**

1. **Failing builder tests** (`protocol.test.ts`):
   - `buildPetCastSpell(pet, castCount, spellId, target)` writes guid,
     `u8` cast count, `u32` spell, `u8` flags 0, then the target block
     through `writeSpellTargets` from `#wow/protocol/spell-targets`
     (`PetHandler.cpp:1011-1110`); a unit target and a `none` target.
   - `buildPetSpellAutocast(pet, spellId, on)` writes guid, `u32`, `u8`
     (`PetPackets.cpp:35-40`).
   - `buildPetSetAction(pet, pairs)` writes guid and one or two
     `{ u32 slot, u32 packed }` pairs (`PetHandler.cpp:696-838`; the pair
     count comes from the packet size, `:716`).
   - `buildPetCancelAura(pet, spellId)` writes guid and `u32`
     (`SpellHandler.cpp:604-640`).
2. **Failing parser test:** `SMSG_PET_CAST_FAILED` parses with the
   existing `parseCastFailed` (`protocol/spell.ts:345-352`): `u8` cast
   count, `u32` spell, `u8` result, extras (`Spell.cpp:4842-4861`). The
   test body has no `multiple_casts` byte; wowm's extra byte does not
   exist in AzerothCore.
3. **Failing store and runtime tests** (`areaRig`):
   - `act.petCast(spellId, target)` returns `not_known` when the spell is
     not in `bar.spells`, `dead` when the pet's health is 0, else sends.
   - `act.petAutocast(spellId, false)` sends `CMSG_PET_SPELL_AUTOCAST`
     then `CMSG_REQUEST_PET_INFO`; a passive spell returns
     `not_autocastable`.
   - `petSetAction(slot, action, type)` refuses a slot outside 0-9
     (`PetHandler.cpp:726-727`); `petSwapActions(a, b)` sends one packet
     with two pairs; `petCancelAura` sends one packet.
   - Injecting a cast failure with result `not_ready` sets `lastRefusal`
     and emits `cast_failed` with the reason name from
     `spell-cast-result.ts`.
   - Injecting `SMSG_SPELL_COOLDOWN` with the pet's guid sets a pet
     cooldown; with the character's guid it changes nothing in the pets
     store. `SMSG_CLEAR_COOLDOWN` with the pet guid clears it. The rig
     passes the legacy `registerGameplayHandlers` owner through
     `init.register` (contract 1.8, D24), or the no-op fill covers it.
4. **Implement.** Acts `petCast`, `petAutocast`, `petSetAction`,
   `petSwapActions`, `petCancelAura`; `register` adds `wire.on` for
   `SMSG_PET_CAST_FAILED` and `wire.peek` for the two cooldown opcodes,
   parsed with the existing parsers in `#wow/protocol/spell`.
   `PETS_OPCODES.uses` gains both cooldown opcodes.
5. **Probe flow** `pets-spell`: `--arg spell=<name> [--arg target=nearest]`
   casts, `--arg autocast=<name>:off` toggles, `--arg swap=<a>,<b>` swaps.
7. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:**
- `CMSG_PET_CAST_SPELL`, `SMSG_PET_CAST_FAILED`: live. On a hunter with
  a pet out near a beast: `pets-spell --arg spell=Growl --arg
  target=nearest` twice in a row `--expect SMSG_PET_CAST_FAILED`; the
  second cast fails `not_ready`. The first cast's pet-guid
  `SMSG_SPELL_COOLDOWN` shows in `handle.pets.state().cooldowns`.
- `CMSG_PET_SPELL_AUTOCAST`: live. `--arg autocast=Growl:off --expect
  SMSG_PET_SPELLS`; the next bar shows Growl with type `0x81`.
- `CMSG_PET_SET_ACTION`: live. `--arg swap=<slot a>,<slot b>` of two
  spell slots, then `requestPetInfo`; the next bar shows them swapped.
- `CMSG_PET_CANCEL_AURA`: `accepted` (a live send with a hunter pet
  spell id; no disconnect, no error). The server removes only an aura
  the pet owns (`SpellHandler.cpp:639`), and a level-10 hunter pet has
  none [I]. The builder also tries the dead-pet send of pets-2; if
  `SMSG_PET_ACTION_FEEDBACK` arrives, it moves that row to `live` and out
  of `unseen`. This proof kind is **accepted by the maintainer (P2-5)**.

**Commit:**

```
feat: Cast and arrange pet spells
```

Body: "The pet's own spells were out of reach. The pets area now casts
them at a target, turns autocast on and off, arranges the bar, and keeps
the pet's cooldowns and cast failures."

---

## pets-9: The pet tool: status and commands (wave 2)

Two commits: the tool, then the scenario (contract 3.2).

**Files:**
- Create: `packages/harness/src/areas/pets/tool.ts`, `tool-command.ts`
  and tests
- Modify: `packages/harness/src/areas/pets/area.ts` and test (rules,
  `worldActs: ["petCommand", "petStance", "petStopAttack",
  "requestPetInfo"]`, glyph)
- Append (shared, contract 2.6): `contract/result.ts` `ToolName`
  (`"pet"`), `tools/registry.ts` `GAME_TOOLS` (`petTool`),
  `docs/harness.md` tool table row
- Create: `packages/harness/src/grader/scenarios/t8-pets-command.json`
- Append: `grader/scenarios.ts` `ROUND_1`, `docs/capabilities.md`,
  `docs/evals.md` ("Which scenarios to run", the `pets` row)

**Depends on:** pets-3, `item6`, `S0-3`, `S0-4`.

**Opcodes:** none (harness).

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The description and guideline below (step 2) are the tool text. The guideline goes in `petTool`'s `text.guidelines`; `prompt/install.ts:40-45` puts it in the prompt. A test checks that `minimalArgs` passes the tool's `parameters` schema.

1. **Failing tool tests** (`tool.test.ts`, mock game, `expectSendKind`):
   - `pet` with no `do` (status) reads `handle.pets.state()` and prints
     name, family, level, health, happiness, stance, command, spells with
     autocast and cooldowns; without a pet: "You have no pet out." It
     sends nothing.
   - `do: "call"`, `"revive"` cast the owner's spell found by name
     through `handle.cast` and settle `DONE` on a `bar` event, `FAILED`
     on `tame_failed` or a cast failure, `UNCONFIRMED` after 5 s.
     `do: "dismiss"` casts Dismiss Pet (2641) for a hunter and settles on
     the `bar` clear; for a pet without `canAbandon` it uses
     `petCommand("dismiss")`. The tool never sends command 3 for a
     hunter pet.
   - `do: "attack"` with `target` uses today's `petAttack` and settles
     on the pet's `UNIT_FIELD_TARGET`, or on the `threat` area's reaction
     event when `threat` has landed (design 5.12).
   - `follow`, `stay`, `stance what:"passive"` call the act and settle
     `DONE` only when the next `bar` shows the change, else
     `UNCONFIRMED`. `stop` sends `petStopAttack`, then `follow`.
   - Rules (`area.test.ts`): `bar` with a new guid gives one `log` row
     `pets/out` ("Fang (Wolf) is out: defensive, follow."); the clear
     gives `pets/gone`; `cast_failed`, `tame_failed`, `feedback`,
     `name_invalid` give `pets/refused`; `spell_learned` gives
     `pets/learned`; `stable_result` gives `pets/stable`; stance and
     command changes, sounds and combo points return `[]`.
2. **Implement.** Kind `action` (D25); `status` runs in order and is
   refused while the human drives in PLAY mode. Sends run inside
   `ctx.rt.mutex.run` through `claim.areas.pets`. Tool text in STE, at
   most 60 words: "Control your pet: call, dismiss, revive, attack,
   follow, stay, stop, set its stance, cast or autocast its spells,
   rename or abandon it." Guideline: "Before a group pull, set the
   stance to passive or defensive." It goes in `petTool`'s `text.guidelines`
   (`tools/game-tool.ts:12-16`); `prompt/install.ts:40-45` puts it in the
   prompt.
   `do` values beyond this task (`cast`, `autocast`, `rename`, `abandon`,
   `tame`, `talent`) come in pets-10 and pets-12; the schema lists only
   the built values.
3. Commit 1 after `mise ci:checks`.
4. **Scenario `t8-pets-command`.** Preset `eversong10-hunter`; `setup`
   learns Call Pet and Dismiss Pet through `spells/learn` if the pet
   staging check showed them missing. Task: "Call your pet, set it to
   passive, send it at the nearest Springpaw, then call it back and
   dismiss it." Checks, all `game_log`: `pets/out`; a bar with react
   passive; `combat/pet_attack`; `pets/gone`. Run `mise test
   packages/harness/src/grader/scenarios.test.ts`, then `mise eval run
   t8-pets-command --round <n>`. One commit with the JSON, `ROUND_1`, the
   capabilities row "Command a pet: call, dismiss, attack, follow, stay,
   stop and stance" (limits: hunter only; no warlock or death knight
   preset) and the evals row `| Pets (pet, interact stable) |
   \`t8-pets-command\` |`.

**Proof:** eval. `t8-pets-command` runs with `mise eval`; its verdict
goes into the proof table and the report. A fail goes under "Not shown
by any scenario" (contract 3.4, D16).

**Commits:**

```
feat: Add the pet tool for pet commands
```

Body: "A pet class could not stop or steer its pet, so a pet could pull
a second pack. The pet tool calls, dismisses, commands and sets the
stance, and confirms each change through the pet bar."

```
test: Prove pet commands with a hunter
```

Body: "A pass shows the pet called, set to passive, sent to attack and
dismissed on the live server."

---

## pets-4: Pet names and rename (wave 3)

**Files:**
- Modify: `areas/pets/protocol.ts`, `store.ts`, `runtime.ts`, `area.ts`
  and tests; `packages/core/test-support/areas/pets.ts`
- Create: `packages/devtools/src/probe-flows/pets-name.ts`
- Modify: `docs/areas/pets.md`; regenerate `docs/protocol-coverage/pets.md`

**Depends on:** pets-9, `SEED-3`.

**Opcodes:** `CMSG_PET_NAME_QUERY`, `SMSG_PET_NAME_QUERY_RESPONSE`,
`CMSG_PET_RENAME`, `SMSG_PET_NAME_INVALID`.

**Steps:**

1. **Failing tests** (`protocol.test.ts`):
   - `buildPetNameQuery(number, guid)` writes `u32` then `u64`
     (`PetHandler.cpp:616-627`).
   - `parsePetNameQueryResponse` reads `u32` number, string, `u32`
     timestamp, `u8` flag and five strings when the flag is 1
     (`PetHandler.cpp:656-668`); the not-found form (`:632-640`) gives an
     empty name.
   - `buildPetRename(pet, name)` writes guid, string and `u8` 0; the five
     declined names that AzerothCore reads when the flag is set
     (`PetHandler.cpp:885-891`) are never sent.
   - `parsePetNameInvalid` reads `u32` reason, string, `u8` flag and the
     optional five strings (`PetHandler.cpp:1112-1126`), with reason
     names from `src/server/shared/SharedDefines.h:3911-3929`.
2. **Failing store and runtime tests** (`areaRig`):
   - A new `bar.guid` with a pet number sends one `CMSG_PET_NAME_QUERY`;
     an `entity` `update` event (`ctx.listen("entity", ...)`,
     `entity-store.ts:86-97`) whose `PET_NAME_TIMESTAMP` is newer than
     the cached one sends another; a cached newer entry sends nothing.
   - The reply fills `names` and emits `name`.
   - `act.renamePet("Fangtooth")` returns `not_renamable` when
     `canRename` is clear, else sends; the runtime waits 5 s for the
     timestamp change and the next `name`, then emits `unanswered` with
     `request: "rename"` through a store method. A `name_invalid` ends
     the wait (fake timers inside `try`/`finally`).
3. **Implement.** Acts `queryPetName`, `renamePet`; the name policy in
   the runtime.
4. **Probe flow** `pets-name`: `--arg rename=<name>` renames and prints
   the next `name` or `name_invalid` event.
5. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:**
- `CMSG_PET_NAME_QUERY`, `SMSG_PET_NAME_QUERY_RESPONSE`: live. The
  `pets-bar` flow on a hunter with a pet out, `--expect
  SMSG_PET_NAME_QUERY_RESPONSE`.
- `SMSG_PET_NAME_INVALID`: live. `pets-name --arg rename=A --expect
  SMSG_PET_NAME_INVALID`; reason `too_short` (`PetHandler.cpp:867-871`).
- `CMSG_PET_RENAME`: live, on a pet never renamed (`UNIT_CAN_BE_RENAMED`,
  `PetHandler.cpp:859-865`). `pets-name --arg rename=Fangtooth --expect
  SMSG_PET_NAME_QUERY_RESPONSE`; the reply carries the new name. Then
  `mise factory soap gm <ACCOUNT> read pet` shows it after logout.

**Commit:**

```
feat: Read and change the pet's name
```

Body: "The pet showed its beast name, not the name its owner gave it.
The pets area now asks for the real name when the pet appears or is
renamed, and renames a hunter pet with the server's refusals."

---

## pets-5: Stable (wave 3)

**Files:**
- Create: `areas/pets/stable.ts` and test
- Modify: `areas/pets/protocol.ts`, `store.ts`, `runtime.ts`, `area.ts`,
  `opcodes.ts` (`unseen`) and tests;
  `packages/core/test-support/areas/pets.ts`
- Create: `packages/devtools/src/probe-flows/pets-stable.ts`
- Modify: `docs/areas/pets.md`; regenerate `docs/protocol-coverage/pets.md`

**Depends on:** pets-4, `S0-2` (the `CMSG_STABLE_REVIVE_PET` name in
`protocol/opcodes.ts`, contract 1.11).

**Opcodes:** `MSG_LIST_STABLED_PETS`, `CMSG_STABLE_PET`,
`CMSG_UNSTABLE_PET`, `CMSG_STABLE_SWAP_PET`, `CMSG_BUY_STABLE_SLOT`,
`SMSG_STABLE_RESULT`, `CMSG_STABLE_REVIVE_PET`.

**Steps:**

1. **Failing tests** (`protocol.test.ts`):
   - `buildListStabledPets(npc)`, `buildStablePet(npc)`,
     `buildBuyStableSlot(npc)`, `buildStableRevivePet(npc)` write one
     guid; `buildUnstablePet(npc, number)` and
     `buildStableSwapPet(npc, number)` write guid and `u32`
     (`Handlers/NPCHandler.cpp:334-353,425-491,493-605,607-639,641-644,646-738`).
   - `parseStabledPets` reads the AzerothCore layout
     (`NPCHandler.cpp:355-416`): npc guid, `u8` count, `u8` slots, then
     per pet `u32` number, `u32` entry, `u32` level, string name, `u8`
     flag (1 active, 2 stabled), with no loyalty field (wowm has one;
     AzerothCore wins).
   - `parseStableResult` reads one `u8` with names `money`, `refused`,
     `stabled`, `unstabled`, `slot_bought`, `exotic` for 1, 6, 8, 9, 10,
     12 (`NPCHandler.cpp:38-46`).
2. **Failing store and runtime tests** (`areaRig`): a list reply fills
   `stable { npc, slots, pets }` and emits `stable_list`; a result emits
   `stable_result`; each stable act sends one packet and starts a 5 s
   `until` on `stable_list` or `stable_result`, else the store emits
   `unanswered` with `request: "stable"` (the server is silent when it
   has no stable data, `NPCHandler.cpp:449-451`, and on a failed NPC
   check, `:341-342`). The stable slice clears on logout.
3. **Implement.** Acts `listStabledPets`, `stablePet`, `unstablePet`,
   `swapStabledPet`, `buyStableSlot`, `stableRevivePet` (sends and
   returns; no wait, the handler is empty).
4. **Probe flow** `pets-stable`: `--arg npc=nearest --arg
   do=<list|buy|stable|unstable|swap|revive>`; `nearest` finds the
   closest unit with the `stable_master` role
   (`packages/core/src/wow/npc-roles.ts:22,48`).
5. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:**
- Stage before login: `mise factory soap setup <ACCOUNT> money` with at
  least 10 gold [I: the first slot price comes from
  `StableSlotPrices.dbc`, `NPCHandler.cpp:627`; the builder checks it].
  A new character has 0 stable slots
  (`data/sql/base/db_characters/characters.sql:64`). Where the nearest
  stable master to the `eversong10` spawn stands could not be
  determined; the builder finds one with the probe's `nearest` flow and
  walks there with the puppet or `travel`.
- `MSG_LIST_STABLED_PETS`, `CMSG_BUY_STABLE_SLOT`, `SMSG_STABLE_RESULT`,
  `CMSG_STABLE_PET`, `CMSG_UNSTABLE_PET`: live. At the stable master:
  `do=list --expect MSG_LIST_STABLED_PETS`, `do=buy --expect
  SMSG_STABLE_RESULT` (`slot_bought`), `do=stable` (`stabled`),
  `do=unstable` (`unstabled`). `soap gm read pet` shows the slot after
  logout.
- `CMSG_STABLE_SWAP_PET`: live if the worker tames a second beast with
  Tame Beast after stabling the first, then `do=swap`. Otherwise a
  builder test against `NPCHandler.cpp:646-738`, proof `builder`, listed
  in `unseen`, **accepted by the maintainer (P2-5)**.
- `CMSG_STABLE_REVIVE_PET`: `accepted` (N24, design 5.12 Decisions). A
  live `do=revive` send at the stable master; no disconnect and no error
  packet. The handler is empty (`NPCHandler.cpp:641-644`).

**Commit:**

```
feat: Stable and unstable the pet
```

Body: "A hunter could not keep a second pet or buy stable room. The pets
area now lists the stable, buys a slot, stables, unstables and swaps a
pet, and reports every stable result."

---

## pets-6: Abandon, tame failures and companions (wave 3)

**Files:**
- Modify: `areas/pets/protocol.ts`, `store.ts`, `runtime.ts`, `area.ts`,
  `opcodes.ts` and tests; `packages/core/test-support/areas/pets.ts`
- Create: `packages/devtools/src/probe-flows/pets-abandon.ts`
- Modify: `docs/areas/pets.md`; regenerate `docs/protocol-coverage/pets.md`

**Depends on:** pets-5.

**Opcodes:** `CMSG_PET_ABANDON`, `SMSG_PET_TAME_FAILURE`,
`CMSG_DISMISS_CRITTER`.

**Steps:**

1. **Failing tests** (`protocol.test.ts`): `buildPetAbandon(pet)` and
   `buildDismissCritter(guid)` write one guid (`PetHandler.cpp:931-953`;
   `PetPackets.cpp:20-23`, handler `PetHandler.cpp:39-55`);
   `parsePetTameFailure` reads one `u8` with names from
   `src/server/shared/SharedDefines.h:3939-3944` (7 `no_pet`, 10 `dead`, 12 `exotic`).
2. **Failing store and runtime tests** (`areaRig`): `act.abandonPet()`
   returns `no_pet` with no bar, else sends; `act.dismissCritter()`
   returns `no_critter` when the owner's `UNIT_FIELD_CRITTER` (offset 10)
   is 0, else sends with that guid; injecting reason 7 sets
   `lastRefusal` and emits `tame_failed` with `no_pet`.
3. **Implement.** Acts `abandonPet`, `dismissCritter`; `register` adds
   `SMSG_PET_TAME_FAILURE`.
4. **Probe flow** `pets-abandon`: abandons the pet out, then casts Call
   Pet by name.
5. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:**
- `CMSG_PET_ABANDON`, `SMSG_PET_TAME_FAILURE`: live, on a throwaway
  hunter only (abandon deletes the pet, `PetHandler.cpp:948`).
  `mise protocol:probe <ACCOUNT> --flow pets-abandon --expect
  SMSG_PET_TAME_FAILURE --bodies`; reason 7 (`Spells/Spell.cpp:6709`;
  the summon check sends it, `Spell.cpp:6662-6710`). `soap gm read pet`
  shows no row after logout.
- `CMSG_DISMISS_CRITTER`: live if the builder finds a companion item in
  `data/sql/base/db_world/item_template.sql` whose spell summons a
  critter, stages it with `soap setup <ACCOUNT> items/add`, uses it, and
  sees the critter's destroy and the owner's `UNIT_FIELD_CRITTER` go to 0
  after the send. Otherwise a builder test against
  `PetPackets.cpp:20-23`, proof `builder`, listed in `unseen`. This
  choice is **accepted by the maintainer (P2-5)**.

**Commit:**

```
feat: Abandon a pet and dismiss a companion
```

Body: "The pets area now abandons a hunter pet, dismisses a companion
critter, and reads the tame failures the server sends when Call Pet or
Tame Beast cannot work."

---

## pets-7: Pet talents in core (wave 3)

**Files:**
- Modify: `areas/pets/protocol.ts`, `runtime.ts` and tests;
  `packages/core/test-support/areas/pets.ts`
- Create: `packages/devtools/src/probe-flows/pets-talent.ts`
- Modify: `docs/areas/pets.md` (and the `SMSG_PET_LEARNED_SPELL` row
  when captured), `areas/pets/opcodes.ts` (`unseen`); regenerate
  `docs/protocol-coverage/pets.md`

**Depends on:** pets-6, `talents-1` (the pet form of
`SMSG_TALENTS_INFO`, for the live proof).

**Opcodes:** `CMSG_PET_LEARN_TALENT`, `CMSG_LEARN_PREVIEW_TALENTS_PET`.

**Steps:**

1. **Failing tests** (`protocol.test.ts`): `buildPetLearnTalent(pet,
   talentId, rank)` writes guid, `u32`, `u32`
   (`PetHandler.cpp:1128-1138`); `buildLearnPreviewTalentsPet(pet, list)`
   writes guid, `u32` count, then `u32` talent and `u32` rank per entry
   (`PetHandler.cpp:1140-1165`). Ranks are 0-based on the wire.
2. **Failing runtime tests** (`areaRig`): `act.learnPetTalent` returns
   `no_pet` with no bar, else sends; `act.learnPetTalents` refuses more
   than 30 entries (`PetHandler.cpp:1153-1155`) and an empty list.
   Neither waits; the `talents` area's `pet_info` event confirms.
3. **Implement.** Acts `learnPetTalent`, `learnPetTalents`.
4. **Probe flow** `pets-talent`: `--arg talent=<id> --arg rank=0`.
5. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** live. Stage `soap setup <ACCOUNT> level 20` before login, log
in, check the pet level with `soap gm read pet` [I: the pet follows the
hunter's level]. Pick a tier-1 talent id of the pet's tree from
`Talent.dbc` (the builder records the id). `pets-talent --expect
SMSG_TALENTS_INFO --until SMSG_PET_LEARNED_SPELL --bodies`: the pet form
of `SMSG_TALENTS_INFO` shows the talent (`Player.cpp:14840-14849`). Run
it once with each builder. If `SMSG_PET_LEARNED_SPELL` arrives, the
builder moves that row to `live` and removes it from `unseen`.

**Commit:**

```
feat: Learn pet talents
```

Body: "A pet from level 20 has talent points that nothing could spend.
The pets area now sends one talent or a preview list of up to thirty,
and the talent info reply confirms it."

---

## pets-10: The pet tool: spells, rename, abandon and tame (wave 3)

Four commits: the tool change, then one commit per scenario (contract
3.2).

**Files:**
- Create: `packages/harness/src/areas/pets/tool-spell.ts`,
  `tool-name.ts` and tests
- Modify: `packages/harness/src/areas/pets/tool.ts`, `area.ts` and
  tests (`worldActs` gains `petCast`, `petAutocast`, `renamePet`,
  `abandonPet`);
  `abandonPet` in `worldActs` also exposes the one irreversible pet act
  to world-service extensions, **accepted by the maintainer (P2-5)**
- Create: `packages/harness/src/grader/scenarios/t8-pets-spells.json`,
  `t8-pets-rename.json`, `t8-pets-abandon.json`
- Append: `grader/scenarios.ts` `ROUND_1`, `docs/capabilities.md`,
  `docs/evals.md` (the `pets` row)

**Depends on:** pets-7, `T-10` (console check source) for the rename
and abandon checks.

**Opcodes:** none (harness).

**Steps:**

1. **Failing tool tests** (mock game, `expectSendKind`):
   - `do: "cast" what:"Growl" target:"u3"` resolves the name against
     `bar.spells` and the spell catalog, calls `petCast`, settles `DONE`
     on the pet-guid cooldown, `FAILED` with the reason from
     `cast_failed`.
   - `do: "autocast" what:"Growl off"` settles `DONE` only when the next
     bar shows type `0x81`.
   - `do: "rename" what:"Fangtooth"` settles `DONE` on `name`,
     `REFUSED` with the reason on `name_invalid`, `UNCONFIRMED` on
     `unanswered`.
   - `do: "abandon"` runs only when `what` equals the pet's current name,
     else `REFUSED confirm_name`; it is the one irreversible pet action.
   - `do: "tame" target:"u3"` casts Tame Beast (1515) and settles on a
     new `bar`, or `FAILED` on `tame_failed`.
2. **Implement**, `mise ci:checks`, commit 1.
3. **Scenario `t8-pets-spells`.** Preset `eversong10-hunter`. Task:
   "Turn off your pet's Growl autocast, then have it use Growl on the
   nearest Springpaw." Checks (`game_log`): the bar shows Growl `off`; a
   pet cast with `DONE` or a `pets/refused` row. Commit with `ROUND_1`,
   the capabilities row "Cast and autocast pet spells" (limits: Feed Pet
   needs an item-target cast) and the evals row id.
4. **Scenario `t8-pets-rename`.** A pet never renamed. Task: "Rename
   your pet to Fangtooth." Check (`console`, `read pet`): the name is
   `Fangtooth`. Same commit rule, capabilities row "Rename or abandon a
   hunter pet" (limits: a pet can be renamed once).
5. **Scenario `t8-pets-abandon`.** Task: "You no longer need your pet.
   Abandon it." Check (`console`, `read pet`): no pet rows. Its id joins
   the rename row.
6. Before each commit: `mise test
   packages/harness/src/grader/scenarios.test.ts`, then `mise eval run
   <id> --round <n>`.

**Proof:** eval. Each verdict goes into the proof table and the report;
a fail goes under "Not shown by any scenario" (D16). If T-10 has not
landed, the rename and abandon checks fall back to game-log rows and the
report says so (contract issue 6).

**Commits:**

```
feat: Cast, rename and abandon with the pet tool
```

Body: "The pet tool could only command the pet. It now casts and
autocasts pet spells, renames and tames, and abandons a pet only when
the agent names it."

```
test: Prove pet spells and autocast
```

Body: "A pass shows Growl autocast turned off and a pet cast on the live
server."

```
test: Prove renaming a hunter pet
```

Body: "A pass shows a hunter pet renamed on the live server, confirmed by
the pet list."

```
test: Prove abandoning a hunter pet
```

Body: "A pass shows a hunter pet abandoned on the live server, with no
pet row left."

---

## pets-11: Stable on interact (wave 3)

Two commits: the `interact` change, then the scenario.

**Files:**
- Lease: `packages/harness/src/tools/interact.ts`, new
  `tools/interact-stable.ts` and test, `tools/interact.test.ts`, and the
  `interactParams` block of `tools/params.ts`
- Create: `packages/harness/src/grader/scenarios/t8-pets-stable.json`
- Append: `grader/scenarios.ts` `ROUND_1`, `docs/capabilities.md`,
  `docs/evals.md` (the `pets` row)

**Depends on:** pets-10, the `interact` lease (contract 2.7, issue 3),
`T-10`.

**Opcodes:** none (harness).

**Steps:**

1. **Failing tests** (`interact-stable.test.ts`, mock game):
   - `talk` at a unit with the `stable_master` role also calls
     `listStabledPets` and lists the stabled pets, the free slots and
     the pet out.
   - `do: "stable"`, `"unstable" what:"<name or line>"`, `"buy_slot"`
     each call the pets act and map `stable_result`: `stabled`,
     `unstabled`, `slot_bought` give `DONE`; `money`, `refused`,
     `exotic` give `FAILED` with the reason; `unanswered` gives
     `UNCONFIRMED`. `unstable` with a pet out swaps
     (`NPCHandler.cpp:541-551`).
2. **Implement**, `mise ci:checks`, commit 1.
3. **Scenario `t8-pets-stable`.** First confirm a stable master near the
   hunter spawn (pets-5 found one); if none is in reach, stop as
   `blocked` for the coordinator to pick a spawn. `setup`: `money` for
   one slot. Task: "Go to the stable master, buy a stable slot and put
   your pet in it." Checks: truth money delta equals minus the slot
   price; `console` `read pet` shows the pet in slot 1
   (`Entities/Pet/PetDefines.h:40-47`); `game_log` `pets/stable` rows.
   Commit with `ROUND_1`, the capabilities row "Stable, unstable and buy
   stable slots" (limits: needs a stable master near the spawn) and the
   evals row id.

**Proof:** eval, as pets-10.

**Commits:**

```
feat: Stable pets through interact
```

Body: "The stable is an NPC service, so interact at a stable master now
lists the stable and buys a slot, stables and unstables the pet."

```
test: Prove buying a slot and stabling a pet
```

Body: "A pass shows the stable list, a slot purchase and a stabled pet
on the live server."

---

## pets-12: The pet talent verb (wave 3)

Two commits: the verb, then the scenario.

**Files:**
- Create: `packages/harness/src/areas/pets/tool-talent.ts` and test
- Modify: `packages/harness/src/areas/pets/tool.ts`, `area.ts`
  (`worldActs` gains `learnPetTalent`) and tests
- Create: `packages/harness/src/grader/scenarios/t8-pets-talent.json`
- Append: `grader/scenarios.ts` `ROUND_1`, `docs/capabilities.md`,
  `docs/evals.md` (the `pets` row)

**Depends on:** pets-11, `talents-2` (the talent catalog), `talents-3`
(the `talents` harness module and the pet form in its state).

**Opcodes:** none (harness).

**Steps:**

1. **Failing tests** (mock game): `pet do:"talent" what:"<talent
   name>"` resolves the name in the pet's tree through the `talents`
   area's catalog, calls `learnPetTalent` with the next rank, and settles
   `DONE` on the `talents` `pet_info` event that shows the rank,
   `FAILED` when no point is free, `UNCONFIRMED` after 5 s.
   `do:"talent"` with no `what` lists the free points and the choices.
2. **Implement**, `mise ci:checks`, commit 1.
3. **Scenario `t8-pets-talent`.** `setup`: `level` 20 or higher. Task:
   "Spend your pet's talent point." Checks: `game_log` `talents` pet
   row; `console` `read pet` if it shows the talent [I]. Commit with
   `ROUND_1`, the capabilities row "Spend pet talent points" and the
   evals row id.

**Proof:** eval, as pets-10.

**Commits:**

```
feat: Spend pet talent points
```

Body: "The pet tool now spends the pet's talent points by talent name
and confirms each rank through the server's talent info."

```
test: Prove spending a pet talent point
```

Body: "A pass shows a pet talent learned on the live server."

---

## pets-8: Pet combo points (wave 4)

**Files:**
- Modify: `areas/pets/protocol.ts`, `store.ts`, `area.ts`, `opcodes.ts`
  (`unseen`) and tests; `packages/core/test-support/areas/pets.ts`
- Modify: `docs/areas/pets.md`; regenerate `docs/protocol-coverage/pets.md`

**Depends on:** pets-12, `SEED-4`.

**Opcodes:** `SMSG_PET_UPDATE_COMBO_POINTS`.

**Steps:**

1. **Failing parser test:** `parsePetComboPoints` reads two packed guids
   (unit, target) and one `u8` (`Entities/Unit/Unit.cpp:12844-12880`,
   writer `:12867-12879`).
2. **Failing store test** (`areaRig`): the packet sets
   `comboPoints { unit, target, points }` and emits `combo_points`; the
   harness rule already returns `[]` for it (pets-9).
3. **Implement**, proof row, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** `mock` from `Unit.cpp:12867-12879`, listed in `unseen`
("not seen live"). Hunter and warlock pets build no combo points [I]; a
vehicle with combo points may send it later in `vehicles`.

**Commit:**

```
feat: Read pet combo points
```

Body: "A unit the character controls can hold combo points, which the
server reports in their own packet. The pets area now keeps them, so a
controlled unit's finishers can be timed."

---

## Dead opcodes

All five go in `PETS_OPCODES.dead` with a `dead` proof row.

| Opcode | Why it is dead |
|---|---|
| `SMSG_PET_MODE` | No AzerothCore code constructs it; the name appears only in `Server/Protocol/Opcodes.*`. The react and command state travel in `SMSG_PET_SPELLS`. |
| `SMSG_PET_BROKEN` | No send site in AzerothCore. wow_messages notes it is not implemented in any Wrath emulator (`pet/smsg_pet_broken.wowm`). |
| `CMSG_PET_UNLEARN` | `STATUS_NEVER` with `Handle_NULL` (`Server/Protocol/Opcodes.cpp:883`). |
| `SMSG_PET_UNLEARN_CONFIRM` | No send site (`Server/Protocol/Opcodes.cpp:884`). |
| `SMSG_PET_GUIDS` | Only a comment names it (`Entities/Player/Player.cpp:11812`). |

Two more pet opcodes exist in AzerothCore but not in `GameOpcode`, so
they are not rows here: `SMSG_PET_RENAMEABLE` (`Opcodes.cpp:1272`, no send
site found) and `CMSG_PET_UNLEARN_TALENTS` (`Handle_NULL`,
`Opcodes.cpp:1278`). Both are dead. `CMSG_STABLE_REVIVE_PET` is relevant
and gets the `accepted` proof of pets-5 (N24).

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules every contract issue, lease request and decision of
this file that a wave-1 task (`pets-1`, `pets-2`) meets, before `SEED-1`.
Precedence: the design, then the plan index with the contract and the
Gate R rulings, then this file. Each ruling is **not yet ruled by the
maintainer**. No ruling amends the contract or the design, and neither
wave-1 task holds a lease: both edit only files of the `pets` unit
(contract 2.5), and the plan index gives both `leaseDeps: []`.

Not ruled here: contract issue 3 and the `interact` lease request (only
pets-11, wave 3, meets them), issue 5 (pets-7 and pets-12, wave 3),
issue 6 (pets-10 and pets-11, wave 3), the `combat-store.ts` half of
issue 2 (the cooldown peek of pets-3, wave 2), and the staging rule "every
eval opens with `pet do:"tame"`" (pets-9 onward). The `SEED-2` and
`SEED-3` ruling passes rule them.

| Id | Issue (source) | Ruling | Status |
|---|---|---|---|
| SR1-pets-1 | Contract issue 1: "Design 5.12 names `PetStore` and `StableStore`, but an area module has one `store()` (contract 1.2)" (`pets-1`) | Stands. Contract 1.2 gives an area module one `store`, so the unit builds one `PetsStore`. pets-1 creates the state with `bar`, `cooldowns`, `lastRefusal` and the computed `pet` view; `names`, `stable` and `comboPoints` join the state in the tasks that read their packets (pets-4, pets-5, pets-8), and `areas/pets/stable.ts` holds the stable slice's reducer from pets-5. The names `PetStore` and `StableStore` of design 5.12 read as slices of `PetsStore`. No amendment | accepted by the maintainer (P2-5) |
| SR1-pets-2 | Contract issue 2, `protocol/pet.ts` half: "Contract 2.7 lists `protocol/pet.ts` and `combat-store.ts` for `pets`. The plan needs neither" (`pets-2`) | Stands for `protocol/pet.ts`. The plan "Leases" table already has no `protocol/pet.ts` row, so there is nothing to drop. pets-2 writes `buildPetAction` and `buildPetStopAttack` in `areas/pets/protocol.ts`; `buildPetAttack` and `PET_ATTACK_ACTION` in `packages/core/src/wow/protocol/pet.ts` stay unchanged for `combat.ts:133` and the harness `petAttack` caller. The byte test in `areas/pets/protocol.test.ts` imports `buildPetAttack` from `#wow/protocol/pet`, an allowed import (contract 1.12). The contract 2.7 candidate row stays a candidate with no holder. The `combat-store.ts` half is not ruled here (pets-3) | accepted by the maintainer (P2-5) |
| SR1-pets-3 | Contract issue 4: "`fieldOf` and `isUnit` live in `#wow/entity-store` ... which an area may not import as a value (contract 1.12)" (`pets-1`) | Stands, as SR1-threat-4 rules for `threat`. `areas/pets/view.ts` reads `deps.getEntity(guid)?.rawFields` (`SessionDeps.getEntity`, `session-stores.ts:21` [M]; `Entity.rawFields: Map<number, number>`, `entity-store.ts:18` [M]) with the `UNIT_FIELDS` offsets from `#wow/protocol/update-fields` (`SUMMON` 8, `POWER5` 29, `PETNUMBER` 75, `PET_NAME_TIMESTAMP` 76, `BYTES_2` 122 [M]) and joins the summon guid with `joinGuid` from `#wow/protocol/packet` (`packet.ts:3` [M]). It imports `EntityLookup` from `#wow/entity-store` as a type only. No allow-list change | accepted by the maintainer (P2-5) |
| SR1-pets-4 | pets-1 step 6: "`PETS_OPCODES.dead` gets the five dead rows (section 'Dead opcodes') if `SEED-1` has not written them" | The contract wins (contract 1.5: the seed writes the dead rows of N13 in `dead`). `SEED-1` writes `SMSG_PET_MODE`, `SMSG_PET_BROKEN`, `CMSG_PET_UNLEARN`, `SMSG_PET_UNLEARN_CONFIRM` and `SMSG_PET_GUIDS` into `PETS_OPCODES.dead`. pets-1 checks that all five are there and writes their `dead` proof rows in `docs/areas/pets.md` with the evidence of section "Dead opcodes". If the seed did not write one, pets-1 writes it (its own file) and reports the deviation | accepted by the maintainer (P2-5) |
| SR1-pets-5 | pets-1 step 8: "Left out: each other owned opcode with 'built by pets-<n>'"; contract 3.8: "Every opcode in the area's `owns` has exactly one row" (`pets-1`, `pets-2`) | Stands, as SR1-talents-2 rules. "Exactly one row" holds when the unit's last task lands; until then an owned opcode that is not built has one line under "Left out" and no row in "Proof", and each task moves its opcodes from "Left out" into "Proof". No placeholder proof value is written. If `mise lint:docs` refuses "built by pets-<n>", the line reads "Not built." with the reason. The wire notes of pets-1 step 8 for opcodes that later tasks build stay in pets-1 only if `mise protocol:cite-check` gives `ok` or `unbound` for each (GR-21); a citation that gives `mismatch` moves to the task that builds that opcode. If any check requires a proof row for every owned opcode, the builder stops `blocked` and names the check | accepted by the maintainer (P2-5) |
| SR1-pets-6 | Section "Pet staging": "Whether `Tplhunter` has a tamed pet could not be determined from the repo"; the setup bodies of `level`, `money` and `spells/learn` "could not be determined"; Call Pet, Revive Pet and Mend Pet ids are unconfirmed (`pets-1`, `pets-2`) | T-5 has landed with the `pet` read (`soap-gm.ts:24` [M], GR-24). pets-1 answers the staging question first with `mise factory soap gm <ACCOUNT> read pet` on its new `eversong10-hunter` account; the owner's `UNIT_FIELD_SUMMON` after a Call Pet cast is the fallback only. If the template has no pet or lacks a pet spell, the builder stages online with `mise factory soap gm <ACCOUNT> learn <spell>` (`soap-gm.ts:31` [M]) on its own character (contract 0.7) and does not use the `soap setup` endpoints whose bodies are unknown. Taming stands as written (`handle.cast(1515, guid)` on a low beast from `nearby --json`). Spell ids resolve by name through `handle.getSpellbook()` (`client.ts:250` [M], `SpellDefinition.name`, `spell-catalog.ts:88` [M]); the probe flow `pets-bar` finds Call Pet the same way. The builder records each resolved id in its report and in `docs/areas/pets.md` "Wire notes". The warlock mock fallback (R22) stands | accepted by the maintainer (P2-5) |
| SR1-pets-7 | pets-1 step 7 and pets-2 step 5 add probe flows `pets-bar` and `pets-command`; the T-3 loader test pins the flow list (`packages/devtools/src/probe-flows.test.ts:116` [M]) | The `COORD-<n>` commit of SR1-threat-10 changes that test to `expect.arrayContaining` before `threat-1` starts, and pets-1 depends on `threat-1`, so no new edit is needed. Each flow follows SR1-threat-6: `export const flow: ProbeFlow = { name: "pets-bar", usage, run }` (the name is the file stem) and `run({ handle, args, settle })` returns `Json`; `--arg` follows `--flow` (`probe-args.ts:58-63` [M]). For the `CMSG_PET_STOP_ATTACK` proof, `pets-command` also accepts `--arg do=attack`, which calls the legacy `handle.petAttack(pet, target)` (`client.ts:261` [M]) on the nearest beast; the legacy member does not change. If the loader-test commit has not landed when pets-1 starts, pets-1 stops `blocked` on its first edit of `probe-flows/pets-bar.ts` and names that test | accepted by the maintainer (P2-5) |
| SR1-pets-8 | pets-1 and pets-2 proofs: `CMSG_REQUEST_PET_INFO` and `CMSG_PET_STOP_ATTACK` are sent by the flow, not by `--send` | GR-19 applies: the probe report's `sent` lists only `--send` steps. The evidence of a flow's own send is `counts.sent` in the report and the `out` row in the probe's `packets.jsonl`; for `CMSG_REQUEST_PET_INFO` the second `SMSG_PET_SPELLS` in the capture confirms the effect, and for `CMSG_PET_STOP_ATTACK` the cleared `UNIT_FIELD_TARGET` of the pet [I, as the task body states]. An empty `sent` in the report is not a failure. If the target does not clear, the row is `builder` with the reader's `path:line`, the evidence "sent live, effect not seen" and the opcode in `unseen` (contract 0.6, the row added by the plan fix-up) | accepted by the maintainer (P2-5) |
| SR1-pets-9 | pets-2: "Body fix of the handled `CMSG_PET_ACTION` (no proof row)"; `CMSG_PET_ACTION` is not in the unit's 30 relevant rows | Stands. `CMSG_PET_ACTION` stays out of `PETS_OPCODES.owns` and keeps its row in `docs/protocol-coverage/core.md`; the `pets` runtime sends it through `ctx.send` (contract 1.2 puts no ownership rule on sends except the `CMSG_MOVE_` and `MSG_MOVE_` rule of contract 1.12). pets-2 writes a wire note on the full body in `docs/areas/pets.md` and no proof row. A move of the opcode into `owns` is a `COORD` commit (contract 2.5) and is not made | accepted by the maintainer (P2-5) |
| SR1-pets-10 | pets-2 proof: `SMSG_PET_ACTION_FEEDBACK` is `mock` in pets-2 and "pets-3 tries the live capture"; `SMSG_PET_ACTION_SOUND` and `SMSG_PET_DISMISS_SOUND` are `mock` because no warlock preset exists | Stands. pets-2 lists all three in `PETS_OPCODES.unseen` with `mock` rows from the AzerothCore writers (R22). pets-3 moves the feedback row to `live` only with a capture. No warlock preset is added for this unit | accepted by the maintainer (P2-5) |
| SR1-pets-11 | pets-2 step 3: "`petCommand("dismiss")` on a pet whose `canAbandon` is set returns `hunter_pet_dismiss` and sends nothing" (plan index risk 2, N29) | Stands. The act reads `canAbandon` from the store's computed `pet` view. When the bar is present but the view is `undefined` (the pet entity or its fields are not seen yet), `petCommand("dismiss")` returns `{ ok: false, reason: "no_pet" }` and sends nothing, so a command 3 never goes out without a read of the flag. The `areaRig` test covers that case too | accepted by the maintainer (P2-5) |
| SR1-pets-12 | pets-1 proof: `SMSG_PET_LEARNED_SPELL` "try live with `mise factory soap gm <ACCOUNT> level 20` while the pet is out" [I] | Stands. The `level` verb exists (`soap-gm.ts:141` [M], `character level`), on the task's own character (contract 0.7). The builder runs it once with `--until SMSG_PET_LEARNED_SPELL`; if the packet does not arrive, the row is `mock` from `Pet.cpp:1911-1914`, listed in `unseen`, and pets-7 tries it live. The builder reports which branch it took | accepted by the maintainer (P2-5) |
