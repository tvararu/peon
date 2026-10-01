# spells: channels, casts, auras, the bar and class systems (key: spells)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.10 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).

## What the unit delivers

The character knows when it or another unit channels or casts, can stop
a channel, cancel its own buffs, write its action bar, drop a
profession and destroy a totem. Login noise (hidden ranks, spell
modifiers) and trainer visuals stop showing as `not_implemented`. The
agent gets a new tool `spell` (`do: cast | cancel_aura | bar |
unlearn_profession | destroy_totem`), `stop` ends a channel, `engage`
waits for a channel, and Jev and `look` see the target's cast.

- Unit `spells`, one code area `spells` (design 5.1). Worktree
  `proto-spells`, branch `proto/area-spells` (contract 0.1):

  ```
  orca-ide worktree create --name proto-spells \
    --base-branch origin/factory/426-protocol-coverage \
    --parent-worktree active --setup run \
    --comment 'owner: coordinator, item 4 spells'
  git branch -m proto/area-spells
  ```

- Phase (design 5.1): wave 1 for `spells-1`, `-3`, `-4`, `-5`, `-6`,
  `-12a`, `-12b`; wave 2 for `-2`, `-8`, `-13`; wave 3 for `-7`, `-9`,
  `-14`; wave 4 for `-10`, `-11`. The design's `spells-12` is split into
  `spells-12a` and `spells-12b` (contract 0.10), because it lands three
  scenarios, each in its own commit (D15). One task at a time; each
  starts from the current `origin/factory/426-protocol-coverage` after
  the previous one landed.
- Owned opcodes: 25 relevant, 3 dead (design 5.10). 24 need work;
  `SMSG_ACTION_BUTTONS` is already handled by the legacy
  `action-bar.ts`. The verify corrections move no row into or out of
  `spells`; `SMSG_SEND_UNLEARN_SPELLS` stays here, and
  `SMSG_RESYNC_RUNES` and `SMSG_ADD_RUNE_POWER` are dead (design N13).
- Uses (peek; legacy owners stay in `gameplay-handlers.ts`):
  `SMSG_SPELL_FAILURE` (spells-1), `SMSG_SPELL_START` and
  `SMSG_SPELL_GO` (spells-2, spells-9).
- Names (contract D7): `SPELLS_OPCODES`, `spellsArea`, `SpellsStore`,
  `SpellsState`, `SpellsEvent`, `SpellsActs`, `spellsRuntime`,
  `spellsHarness`, `spellTool` (kind `action`, contract 1.9). Log rows
  use the area domain (contract 1.9: the router sets `domain: "spells"`):
  `spells/channel_start`, `spells/channel_end`, `spells/target_start`,
  `spells/target_interrupted`, `spells/totem_created`,
  `spells/totem_gone`, `spells/skill_changed`. The area design's
  `cast/*`, `totem/*` and `skill/*` names do not apply.
- Store event types (`/^[a-z_]+$/`): `channel_start`, `channel_end`,
  `unit_cast_start`, `unit_cast_end`, `spell_visual`, `skill_changed`,
  `skill_removed`, `totem_created`, `totem_gone`, `rune_converted`,
  `mirror_image`, `projectile_moved`.
- Acts (`SpellsActs`, all in `areas/spells/runtime.ts`): `cancelChannel`,
  `cancelAura`, `cancelGrowthAura`, `setActionButton`,
  `setActionBarToggles`, `unlearnSkill`, `destroyTotem`, `setFarSight`,
  `requestMirrorImage`, `reportProjectile`, `reportMissileTrajectory`.
  Each validates what the server drops in silence and returns
  `{ ok: true }` or `{ ok: false, reason }`; none waits for a reply
  except where its task says so.
- Test packet builders live in `packages/core/test-support/areas/spells.ts`
  as `spells<Opcode>Body(...)` (contract 1.8).
- Update fields are read from `entity.rawFields.get(offset)` with offsets
  from `#wow/protocol/update-fields` (an allowed value import, contract
  1.12). `fieldOf` and `readSelfField` are outside the allow-list, so the
  unit needs no lease on `player-state.ts`. The runtime `listen("entity",
  ...)` pushes self changes into the store.

### Unit files

Paths without a prefix are under `packages/core/src/wow/`.

| Path | Created by |
|---|---|
| `areas/spells/opcodes.ts`, `areas/spells/area.ts` | `SEED-1` (the unit fills `uses`, `unseen`, and removes the `SMSG_PLAY_SPELL_VISUAL` stub line in spells-6) |
| `areas/spells/protocol.ts` and test | spells-1 (grows in every core task) |
| `areas/spells/store.ts` and test | spells-1 (grows in 2-11) |
| `areas/spells/runtime.ts` and test | spells-1 (grows in 3, 4, 7, 8, 10, 11) |
| `areas/spells/unit-casts.ts` and test | spells-2 |
| `areas/spells/skills.ts`, `areas/spells/skill-names.ts` and tests | spells-7 |
| `areas/spells/totems.ts` and test | spells-8 |
| `areas/spells/runes.ts` and test | spells-9 |
| `packages/core/test-support/areas/spells.ts` | spells-1 |
| `packages/harness/src/areas/spells/area.ts` and test | `SEED-1`; rules from spells-2, 6, 7, 8, 12b, 13 |
| `packages/harness/src/areas/spells/tool.ts`, `tool-cast.ts`, `tool-aura.ts`, `tool-bar.ts`, `tool-skills.ts` and tests | spells-12a, spells-14 |
| `packages/devtools/src/probe-flows/spells-channel.ts`, `spells-aura.ts`, `spells-bar.ts`, `spells-skill.ts`, `spells-totem.ts`, `spells-mirror.ts` | spells-1, 3, 4, 7, 8, 10 |
| `packages/harness/src/grader/scenarios/t4-spells-cancel-aura.json`, `t4-spells-action-bar.json`, `t4-spells-stop-channel.json`, `t4-spells-unlearn-profession.json`, `t4-spells-destroy-totem.json` | spells-12a, 12b, 14 |
| `docs/areas/spells.md` | spells-1 (each later task adds its proof rows) |
| `docs/protocol-coverage/spells.md` | regenerated only |

### Leases this unit needs (contract 2.7)

| Legacy file | Task | Edit |
|---|---|---|
| `combat-casts.ts` and test | spells-1 | channel state: `channel` getter, `beginChannel`, `updateChannel`, `endChannel`; `hasUncancelled` counts it; `cancel` picks `CMSG_CANCEL_CHANNELLING`; `send` and `sendItem` refuse `channelling`; `clear` drops it |
| `combat.test.ts` | spells-1 | one test: `halt()` cancels a running channel (`combat.ts` itself needs no edit, see issue 1) |
| `combat-casts.ts`, `cooldown-store.ts` and tests | spells-5 | `CooldownStore.shift(spellId, deltaMs)` and a pass-through `CombatCasts.shiftCooldown` (issue 3) |
| `action-bar.ts` and test | spells-4 | `ActionBarStore.set(slot, button \| undefined)` |
| harness `tools/journal.ts`, its `journalParams` block in `tools/params.ts`, the `journal` `After` block in `contract/details.ts` | spells-12a, then spells-14 | `about: "spells"` blocks: auras, bar, then professions, totems, runes |
| harness `tools/stop.ts`, `tools/engage*.ts` | spells-12b | the stop text names the ended channel; engage waits for a channel |
| harness `loops/combat-actions-spells.ts`, `loops/combat-rejections.ts`, `loops/combat-actions-observation.ts` | spells-12b, then spells-13 | `channelling` handling; Jev sees the channel, then the target's cast (issue 5) |
| harness `tools/look.ts` and its `lookParams` block | spells-13 | self channel and target cast words (issue 6) |

### Contract issues found while planning

These are gaps, not changes. The coordinator rules on each (contract
precedence 3). Until then the plan works as stated.

1. **Channel state without `combat-types.ts` and `combat-store.ts`.** The
   area design adds `channel` to `CombatState` and two members to
   `CombatEventType` (`combat-types.ts:66,88`); the snapshot is built in
   `combat-store.ts:147-165`. Neither file is on the `spells` lease list,
   and `combat-store.ts` belongs to `combat-log` and `pets`. Design 5.10
   asks only for "channel state inside the cast tracker (a lease on
   `combat-casts.ts`)". The plan keeps the state in `CombatCasts`
   (`core.combat.casts`, public at `combat-store.ts:63`) and exposes it
   through `SpellsState.channel`, which the store reads from
   `core.combat.casts.channel` at snapshot time. The channel events are
   area events. `halt()` needs no edit: `combat.ts:152-160` calls
   `interruptCast()`, which calls `casts.hasUncancelled()` and then
   `cancelCast()`, which calls `casts.cancel()`, both in the leased
   file.
2. **`SMSG_ACTION_BUTTONS` is legacy-handled** (`action-bar.ts:18-21`,
   registered by legacy code). If `SEED-1` lists it in `owns`, the area
   cannot register it ("already has a handler"). spells-4 writes its
   proof row and does not register it. If the registry test requires
   every owned opcode to have an area handler, the builder stops as
   `blocked` and the coordinator moves it to `uses` in a `COORD` commit.
3. **`cooldown-store.ts` is on no lease.** `SMSG_MODIFY_COOLDOWN` shifts a
   server cooldown (design 5.10, `CooldownStore.shift`), and
   `CombatStore.cooldowns` is private (`combat-store.ts:61`). The plan
   adds `shift` under a new lease on `cooldown-store.ts` and reaches it
   through a pass-through on the leased `CombatCasts`, whose deps hold
   the same `CooldownStore` (`combat-casts.ts:16-20`). Without the
   lease, spells-5 stops as `blocked`.
4. **The `channel_start` steer trigger has no owner.** `TriggerName`
   (`grader/scenarios.ts:4-11`) and `TRIGGER_EVENTS`
   (`grader/watch.ts:33-40`) are not in the shared-file table, and no
   tooling task adds the trigger (tooling.md "Deferred"). spells-12b
   asks the coordinator for a `COORD` commit that adds `channel_start`
   mapped to `spells/channel_start`. Until then the scenario uses the
   fallback `fight_start` with `delayMs: 1500`, which may fire before the
   channel starts or after it ends; the grader then reports the check
   `n/a` rather than a pass.
5. **The fight loop and Jev observation live in `loops/`**, not in
   `tools/engage*.ts` or `jev/*`: `loops/combat-actions-spells.ts`,
   `loops/combat-rejections.ts` and `loops/combat-actions-observation.ts`
   (`timeoutOutcome` at `:11`). None is on a lease list. spells-12b and
   spells-13 need them.
6. **`tools/look.ts` lists no `spells` lease** (contract 2.7), but design
   5.10 adds channel and target-cast words to `look`. spells-13 needs it
   after the other holders.
7. **Client opcodes with no live path.** `CMSG_TOTEM_DESTROYED` (if no
   character can place a totem), `CMSG_UPDATE_MISSILE_TRAJECTORY` and
   `CMSG_UPDATE_PROJECTILE_POSITION` (before `vehicles`) have no row in
   contract 0.6: they are neither N24 nor N25. The plan proves each with
   a builder test against the AzerothCore reader, lists it in `unseen`,
   writes proof `builder` with the evidence "not proven live: <reason>",
   and names it under "Left out". The coordinator confirms the row.
8. **A capped verdict.** `t4-spells-action-bar` grades from the session
   only (no truth pick for the bar), so its best verdict is `partial`.
   D16 covers `fail` and `blocked`. The plan lists a `partial` verdict as
   a "Not shown by any scenario" bullet with the gap "no server truth for
   the bar" (accepted by the maintainer (P2-5)).
9. **A legacy file imports an area builder.** `combat-casts.ts` imports
   `buildCancelChannelling` from `#wow/areas/spells/protocol`. Contract
   1.12 limits area imports only, so this is allowed as written; if the
   coordinator wants no legacy-to-area import, the builder moves into
   `combat-casts.ts`.

### Decisions this plan takes

Each is **accepted by the maintainer (P2-5)**.

- `spell do:"cast"` for unit and self targets lands here (spells-12a);
  `objects` adds object, item and ground targets and `self-state` adds
  `mount` and `dismount` later, each under a lease on
  `areas/spells/tool.ts` (contract 2.7, last row).
- `CMSG_CANCEL_GROWTH_AURA` is built (N24); proof `accepted`.
- Automatic mirror-image requests stay off. The missile builder writes
  `moveStop = 0` and never the movement tail.
- A new cast or item use while a channel runs is refused with
  `channelling`. The harness waits (spells-12b). spells-1 and spells-12b
  both land in wave 1, before the wave's eval round.
- `t4-spells-destroy-totem` lands as a scenario only if spells-8 placed a
  totem live; otherwise spells-14 adds a "Not shown by any scenario"
  bullet and no scenario file.

---

## spells-1: Channels

Rulings: SR1-spells-1, SR1-spells-2, SR1-spells-3, SR1-spells-4, SR1-spells-5.

**Files:**
- Create: `areas/spells/protocol.ts`, `areas/spells/store.ts`,
  `areas/spells/runtime.ts` and their tests
- Modify: `areas/spells/area.ts`, `areas/spells/opcodes.ts` (`uses`)
- Modify (lease): `combat-casts.ts` and `combat-casts.test.ts`;
  `combat.test.ts` (one test)
- Create: `packages/core/test-support/areas/spells.ts`
- Create: `packages/devtools/src/probe-flows/spells-channel.ts`
- Create: `docs/areas/spells.md`
- Regenerate: `docs/protocol-coverage/spells.md`

**Depends on:** item6, `S0-5`, `SEED-1`, `T-2` (tap), `T-3` (probe),
`T-4` (cite-check), `T-5` (gm).

**Opcodes:** `MSG_CHANNEL_START`, `MSG_CHANNEL_UPDATE`,
`CMSG_CANCEL_CHANNELLING`.

**Steps:**

1. **Failing parser and builder tests** (`protocol.test.ts`).
   `parseChannelStart` reads packed guid caster, `u32` spell, `u32`
   duration, from `spellsChannelStartBody` built as
   `Spell::SendChannelStart` writes it (`Spells/Spell.cpp:5362-5385`);
   a duration `0xFFFFFFFF` gives `durationMs: undefined` (endless,
   `Spell.cpp:4247-4250`). `parseChannelUpdate` reads packed guid and
   `u32 remainingMs` (`Spell.cpp:5342-5360`).
   `buildCancelChannelling(spellId)` writes one `u32`, as
   `HandleCancelChanneling` reads it (`Handlers/SpellHandler.cpp:653-684`).
   Run `mise test packages/core/src/wow/areas/spells/protocol.test.ts`
   and see it fail.
2. **Failing tracker tests** (`combat-casts.test.ts`): after a
   `SpellGo`, `beginChannel({ spellId, target, durationMs })` sets
   `channel`; `hasUncancelled()` is true; `cancel(send)` with no pending
   or current cast sends `CMSG_CANCEL_CHANNELLING` with the channel's
   spell and marks `cancelRequested`; with a pending cast it still sends
   `CMSG_CANCEL_CAST`; `send()` and `sendItem()` throw `channelling`
   while a channel runs; `updateChannel(ms)` sets `remainingMs`;
   `endChannel()` returns the channel and clears it; `clear()` drops it.
   `combat.test.ts`: `halt()` with a running channel sends
   `CMSG_CANCEL_CHANNELLING`. See them fail.
3. **Failing area test** (`store.test.ts`, `areaRig("spells")` with
   `selfGuid` set): inject `MSG_CHANNEL_START` for self, expect event
   `channel_start { spellId, durationMs }` and
   `handle.state().channel` from `core.combat.casts.channel`; inject
   `MSG_CHANNEL_UPDATE` 2000 then 0, expect `channel_end { reason:
   "finished" }`; a peeked `SMSG_SPELL_FAILURE` for the channel spell
   before the 0 update gives `interrupted`; `act.cancelChannel()` before
   the 0 update gives `cancelled` and `rig.sent` holds one
   `CMSG_CANCEL_CHANNELLING`; `cancelChannel()` with no channel returns
   `{ ok: false, reason: "not_channelling" }` and sends nothing. A
   channel of another caster changes no self state (spells-2 records
   it). The channel target comes from `UNIT_FIELD_CHANNEL_OBJECT`
   (`update-fields.ts:67`) in the self entity's `rawFields`, else the
   last cast's target.
4. **Implement.** The tracker methods in `combat-casts.ts`; the parsers
   and builder in `areas/spells/protocol.ts`; the store (holding
   `core`, calling `core.combat.casts` for self) with `on` for both
   channel opcodes and `peek` for `SMSG_SPELL_FAILURE`, which joins
   `SPELLS_OPCODES.uses`; the runtime act `cancelChannel` calls
   `core.combat.casts.cancel(ctx.send)` under the same checks.
5. **Probe flow** `spells-channel`: `--arg spell=<id> --arg
   mode=finish|cancel|hit` finds the nearest hostile (as the `nearest`
   flow), targets it, casts, and on `channel_start` either waits,
   calls `handle.spells.act.cancelChannel()` after 1 s, or (mode `hit`)
   waits while the mob strikes back.
6. **Doc.** Create `docs/areas/spells.md` with the headings of contract
   3.8. Wire notes: the endless channel `0xFFFFFFFF`
   (`Spell.cpp:4247-4250`), the order `SMSG_SPELL_GO` then
   `MSG_CHANNEL_START` (`Spell.cpp:4072,4155,4243`), and the four
   disagreements of design 5.10 (`SMSG_SPELL_FAILED_OTHER` body against
   `spell/smsg_spell_failed_other.wowm:1`; `int32` modifiers,
   `Entities/Player/Player.cpp:10127`; signed `SMSG_MODIFY_COOLDOWN`,
   `Player.cpp:11284-11287`; the missile `moveStop` tail,
   `Handlers/MiscHandler.cpp:1735,1758-1765`). Left out: each owned
   opcode not yet built, as "built by spells-<n>". Proof rows for the
   three dead opcodes (section "Dead opcodes"). Capabilities row: "Stop
   a channel (proposed; spells-12b)".
7. `mise protocol:coverage`, `mise ci:checks`.

**Proof:** live. New `eversong10-mage` account. If the `login` flow
shows Arcane Missiles (5143 [I]; the builder checks the id in the
trainer data) is not known, `mise factory soap gm <ACCOUNT> learn 5143`
while the probe holds the character online, or `mise factory soap setup
<ACCOUNT> spells/learn` while it is offline. Then three runs of `mise
protocol:probe <ACCOUNT> --flow spells-channel --arg spell=5143 --arg
mode=<mode> --expect MSG_CHANNEL_START --expect MSG_CHANNEL_UPDATE`:
`finish` (update 0, reason `finished`), `cancel` (the sent
`CMSG_CANCEL_CHANNELLING`, update 0, reason `cancelled`), `hit` (a
non-zero update after damage, `DelayedChannel`, `Spell.cpp:8129-8173`).
Move the character next to a hostile first with its
`tmp/puppet-<ACCOUNT>` wrapper if `nearest` finds none in 30 yd.

**Commit:**

```
feat: Track and cancel channels

A channel looked finished at the spell-go packet, so halt could not stop
it and a new cast cut it short. The spells area now tracks channel start,
pushback and end, and halt cancels a running channel.
```

---

## spells-3: Aura cancel

Rulings: SR1-spells-9, SR1-spells-10.

**Files:**
- Modify: `areas/spells/protocol.ts`, `runtime.ts`, `area.ts`,
  `opcodes.ts` and tests; `packages/core/test-support/areas/spells.ts`
- Create: `packages/devtools/src/probe-flows/spells-aura.ts`
- Modify: `docs/areas/spells.md`; regenerate
  `docs/protocol-coverage/spells.md`

**Depends on:** spells-1.

**Opcodes:** `CMSG_CANCEL_AURA`, `CMSG_CANCEL_GROWTH_AURA`.

**Steps:**

1. **Failing builder tests:** `buildCancelAura(spellId)` writes one
   `u32` (`Handlers/SpellHandler.cpp:568-600`);
   `buildCancelGrowthAura()` writes an empty body
   (`SpellHandler.cpp:642-644`). See them fail.
2. **Failing runtime tests** (`areaRig`): with Frost Armor (168) in
   `core.combat.record(undefined).auras` (`combat-store.ts:147-165`),
   `act.cancelAura(168)` sends one `CMSG_CANCEL_AURA`. Refusals, each
   sending nothing: a non-integer id (`invalid_spell`), no such aura on
   the character (`not_aura`), an aura with `AFLAG_NEGATIVE` 0x80
   (`Spells/Auras/SpellAuraDefines.h:34`) or a spell whose catalog
   attributes mark it passive or `SPELL_ATTR0_NO_AURA_CANCEL`
   (`not_cancellable`, the checks of `SpellHandler.cpp:568-600`; the
   builder reads the attribute bits from `spell-catalog.ts` and states
   any it cannot see). A channelled spell id calls `cancelChannel`
   instead (`SpellHandler.cpp:585-591`). `act.cancelGrowthAura()` sends
   one empty packet.
3. **Implement** both acts.
4. **Probe flow** `spells-aura`: `--arg spell=<id>` casts the spell on
   self (`handle.cast(id, 0n)`), waits for the aura, then calls
   `act.cancelAura` and waits for `SMSG_AURA_UPDATE`.
5. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:**
- `CMSG_CANCEL_AURA`: live. New `eversong10-mage` account; `mise
  protocol:probe <ACCOUNT> --flow spells-aura --arg spell=168 --expect
  SMSG_AURA_UPDATE --bodies`. The second `SMSG_AURA_UPDATE` removes the
  aura slot. If Frost Armor is not known, `soap gm learn 168` first.
- `CMSG_CANCEL_GROWTH_AURA`: `accepted` (N24). `mise protocol:probe
  <ACCOUNT> --send CMSG_CANCEL_GROWTH_AURA --wait 3`; no disconnect, no
  error packet.

**Commit:**

```
feat: Cancel own auras

The character could not drop a buff, form or food aura. The spells area
now sends an aura cancel after checking what the server would refuse in
silence, and sends the empty growth-aura cancel the server accepts.
```

---

## spells-4: Action bar writes

Rulings: SR1-spells-6, SR1-spells-7.

**Files:**
- Modify: `areas/spells/protocol.ts`, `store.ts`, `runtime.ts`,
  `area.ts`, `opcodes.ts` and tests; `packages/core/test-support/areas/spells.ts`
- Modify (lease): `action-bar.ts` and `action-bar.test.ts`
- Create: `packages/devtools/src/probe-flows/spells-bar.ts`
- Modify: `docs/areas/spells.md`; regenerate
  `docs/protocol-coverage/spells.md`

**Depends on:** spells-1.

**Opcodes:** `CMSG_SET_ACTION_BUTTON`, `CMSG_SET_ACTIONBAR_TOGGLES`;
`SMSG_ACTION_BUTTONS` (already handled by `action-bar.ts`; this task
writes its proof row only, issue 2).

**Steps:**

1. **Failing builder tests:** `buildSetActionButton(slot, button)`
   writes `u8 slot` and one `u32` `id & 0xFFFFFF | typeCode << 24`
   (`Handlers/MiscHandler.cpp:899-938`, `Entities/Player/Player.h:235-237`),
   with the type codes of `protocol/action-buttons.ts:17-23`; `undefined`
   writes 0 (remove). `buildActionBarToggles(mask)` writes one `u8`
   (`MiscHandler.cpp:952-965`). See them fail.
2. **Failing store test** (`action-bar.test.ts`): `set(0, { type:
   "spell", id: 133 })` then `snapshot()` holds the button; `set(0,
   undefined)` removes it; a later `SMSG_ACTION_BUTTONS` replaces all.
3. **Failing runtime and store tests** (`areaRig`):
   `act.setActionButton(0, { type: "spell", id: 133 })` with 133 learned
   sends one packet and updates `core.actionBar`; slot 144, id
   `0x1000000`, an unlearned spell or type `equipment_set` with no known
   set return `invalid_button` and send nothing (the silent drops of
   `Player.cpp:5760-5799`; the builder mirrors each check that needs no
   server data). `act.setActionBarToggles(256)` returns `invalid_mask`.
   A self update with `PLAYER_FIELD_BYTES` (`update-fields.ts:155`) byte
   2 set to 0x0f gives `handle.state().barToggles` 15.
4. **Implement.** The server never echoes the button, so the act updates
   the store when it sends, as the client does.
5. **Probe flow** `spells-bar`: `--arg slot=<n> --arg spell=<id>` or
   `--arg item=<id>`, then `--arg toggles=<mask>`.
6. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** live. New `eversong10-mage` account.
- `CMSG_SET_ACTION_BUTTON`: `mise protocol:probe <ACCOUNT> --flow
  spells-bar --arg slot=0 --arg spell=133`, then again with `--arg
  slot=11 --arg item=6948` (Hearthstone). The probe logs out, which
  saves the bar (`Player.cpp:11797` sends it at the next login). A third
  run `--flow login --expect SMSG_ACTION_BUTTONS --bodies` shows both
  buttons.
- `CMSG_SET_ACTIONBAR_TOGGLES`: `--flow spells-bar --arg toggles=15`;
  the next self `SMSG_UPDATE_OBJECT` carries byte 2 of
  `PLAYER_FIELD_BYTES` (`MiscHandler.cpp:964`).
- `SMSG_ACTION_BUTTONS`: live, the login capture above.

**Commit:**

```
feat: Write the action bar

Direct drive and a human rebinding keys need to change the bar, which
core could only read. The spells area now sets and clears buttons and
the bar toggles, and keeps the bar store in step because the server
sends no reply.
```

---

## spells-5: Spellbook housekeeping

Rulings: SR1-spells-3, SR1-spells-8.

**Files:**
- Modify: `areas/spells/protocol.ts`, `store.ts`, `area.ts`,
  `opcodes.ts` (`unseen`) and tests; `packages/core/test-support/areas/spells.ts`
- Modify (lease, issue 3): `cooldown-store.ts`, `combat-casts.ts` and
  their tests
- Modify: `docs/areas/spells.md`; regenerate
  `docs/protocol-coverage/spells.md`

**Depends on:** spells-1 (the `combat-casts.ts` lease passes on when it lands).

**Opcodes:** `SMSG_SEND_UNLEARN_SPELLS`, `SMSG_SET_FLAT_SPELL_MODIFIER`,
`SMSG_SET_PCT_SPELL_MODIFIER`, `SMSG_MODIFY_COOLDOWN`.

**Steps:**

1. **Failing parser tests:** `parseUnlearnSpells` reads `u32 count` and
   `count` spell ids (`Entities/Player/Player.cpp:2885-2922`);
   `parseSpellModifier` reads `u8 bit`, `u8 op`, `int32 value`
   (`Player.cpp:10103-10130`, `Handlers/CharacterHandler.cpp:1218-1250`;
   a test with value -10 guards the sign); `parseModifyCooldown` reads
   `u32 spell`, `u64 guid`, `int32 deltaMs`
   (`Player.cpp:11275-11288`; a negative delta shortens). See them fail.
2. **Failing store tests** (`areaRig`): each `SMSG_SEND_UNLEARN_SPELLS`
   replaces `inactiveRanks`; two modifier packets for the same bit and
   op keep the last value (the server sends the total,
   `Player.cpp:10112-10127`), under `modifiers.flat` or
   `modifiers.pct`; `SMSG_MODIFY_COOLDOWN` for self moves the server
   cooldown by `deltaMs` and keeps `source: "server"`
   (`cooldown-store.test.ts`: `shift` on a known entry, and no entry
   created for an unknown one). No events.
3. **Implement.** `CooldownStore.shift`, the pass-through
   `CombatCasts.shiftCooldown`, the parsers and the store fields.
4. Proof rows (`SMSG_MODIFY_COOLDOWN` in `unseen`),
   `mise protocol:coverage`, `mise ci:checks`.

**Proof:**
- `SMSG_SEND_UNLEARN_SPELLS`, `SMSG_SET_PCT_SPELL_MODIFIER`: live. New
  `ghostlands20` account; `mise protocol:probe <ACCOUNT> --flow login
  --expect SMSG_SEND_UNLEARN_SPELLS --expect SMSG_SET_PCT_SPELL_MODIFIER`
  (login sends them, `Player.cpp:11795`).
- `SMSG_SET_FLAT_SPELL_MODIFIER`: live when the same login carries it;
  otherwise mock from `Player.cpp:10103-10130`, marked "not seen live".
- `SMSG_MODIFY_COOLDOWN`: mock (R22) from `Player.cpp:11284-11287`,
  marked "not seen live". Its only senders are level-80 scripts
  (`scripts/Spells/spell_shaman.cpp:1024`,
  `Spells/Auras/SpellAuras.cpp:1811-1826`).

**Commit:**

```
feat: Read spell ranks and modifiers

Every login showed the hidden-rank and spell-modifier packets as not
implemented. The spells area now keeps inactive ranks and modifier
totals, and shifts a cooldown when the server changes it.
```

---

## spells-6: Spell visuals

**Files:**
- Modify: `areas/spells/protocol.ts`, `store.ts`, `area.ts` and tests;
  `areas/spells/opcodes.ts` (deletes the `SMSG_PLAY_SPELL_VISUAL` stub
  line); `packages/core/test-support/areas/spells.ts`
- Modify: `packages/harness/src/areas/spells/area.ts` and test (a
  `spell_visual` rule that writes no row)
- Modify: `docs/areas/spells.md`; regenerate
  `docs/protocol-coverage/spells.md`

**Depends on:** spells-1.

**Opcodes:** `SMSG_PLAY_SPELL_VISUAL`, `SMSG_PLAY_SPELL_IMPACT`.

**Steps:**

1. **Failing tests:** `parseSpellVisual` reads `u64 guid`, `u32 kit`
   (`Entities/Unit/Unit.cpp:14752-14766` and `:14768-14778`); injecting
   either opcode emits `spell_visual { guid, kit, impact }` and keeps no
   state. Harness: the `spell_visual` rule returns `[]` (no fallback
   row). See them fail.
2. **Implement**; delete the stub line.
3. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** live. New `eversong10-mage` account; `mise factory soap gm
<ACCOUNT> money 10000` and `level 12`, so the trainer offers a rank.
Start a harness run with `--packet-trace headers` and ask the agent to
train at the mage trainer (`interact train`); the trace shows
`SMSG_PLAY_SPELL_VISUAL` kit 179 and `SMSG_PLAY_SPELL_IMPACT` kit 362
(`Creature/Trainer.cpp:111-112`). A `rest` that eats also sends a
visual (`Player.cpp:1871,1876`).

**Commit:**

```
feat: Read spell visual packets

Trainer purchases and eating sent visual packets that showed as not
implemented. The spells area now reads them as one visual event and
writes no log row.
```

---

## spells-12a: The spell tool: cast, cancel aura and bar

Rulings: SR1-spells-11, SR1-spells-12, SR1-spells-13.

**Files:**
- Create: `packages/harness/src/areas/spells/tool.ts`, `tool-cast.ts`,
  `tool-aura.ts`, `tool-bar.ts` and tests
- Modify: `packages/harness/src/areas/spells/area.ts` (`worldActs:
  ["cancelAura", "setActionButton"]`) and test
- Modify (lease): `tools/journal.ts` and test, the `journalParams` block
  of `tools/params.ts`, the `journal` `After` block of
  `contract/details.ts`
- Append (shared, contract 2.6): `contract/result.ts` (`"spell"` at the
  end of `ToolName`), `tools/registry.ts` (`spellTool` at the end of
  `GAME_TOOLS`), `docs/harness.md` (tool row)
- Create: `packages/harness/src/grader/scenarios/t4-spells-cancel-aura.json`,
  `t4-spells-action-bar.json`; append each to `ROUND_1`,
  `docs/capabilities.md`, and the `docs/evals.md` "Which scenarios to
  run" row `| Spells (spell tool, stop on channels) | ... |`

**Depends on:** spells-3, spells-4, `S0-3`, `T-8a` (the `spells` pick).

**Opcodes:** none (harness).

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

1. **Failing tool tests** (tool harness, mock game):
   - `do: "cast"` with `spell` (name or id) and no target casts on self;
     with a unit ref (`n<k>` from `look`) it casts on that unit through
     `handle.cast`. An unknown spell is `REFUSED` `unknown_spell`.
     `DONE` on the cast's `cast_succeeded` or channel start, `FAILED`
     with the core reason.
   - `do: "cancel_aura"` calls `handle.spells.act.cancelAura`. `DONE`
     when an aura update removes the aura within 2 s, `UNCONFIRMED`
     otherwise (the server refuses in silence). A mount aura (the
     builder names the catalog check it uses) is `REFUSED`
     `use_dismount`, which names the self-state verb.
   - `do: "bar"` with `slot` 1-144 in text (0-143 on the wire) and
     `spell` or `item`; neither clears. `DONE` after the send, and the
     body shows the bar row.
   - `expectSendKind(spellTool)` passes (kind `action`, sends inside
     `ctx.rt.mutex.run`).
   - `journal about:"spells"` adds, capped at 4 lines each, the
     cancellable auras and the filled bar slots, and hides
     `inactiveRanks` from the spellbook list.
   See them fail with `mise test packages/harness/src/areas/spells/tool.test.ts`.
2. **Implement** the tool module, its `After` type and renderers in the
   module (contract 1.9), the three appends, and the journal blocks.
3. **Scenario 1, own commit:** `t4-spells-cancel-aura`, preset
   `eversong10-mage`, setup `spells/learn` Frost Armor 168 (offline
   endpoint; the builder checks whether the template already knows it),
   task "Put Frost Armor on, then take it off again." Checks:
   `game_log` `aura/fade` for 168 after `aura/gain`
   (`events/rules-combat.ts:111-140`), with no cast between them;
   `session`: the agent used `spell do:"cancel_aura"`. Run `mise test
   packages/harness/src/grader/scenarios.test.ts`, then `mise eval` the
   scenario. Capabilities row on a pass: "Cancel one of its own buffs |
   `t4-spells-cancel-aura` | Harmful and passive auras cannot be
   cancelled."
4. **Scenario 2, own commit:** `t4-spells-action-bar`, preset
   `eversong10-mage`, task "Put Fireball on action bar slot 1 and your
   hearthstone on slot 12." Check: `session` that the character sent
   both buttons; the verdict is capped at `partial` (issue 8).
5. `mise ci:checks` before each commit.

**Proof:** eval. `t4-spells-cancel-aura` and `t4-spells-action-bar` with
`mise eval`, verdicts in the report and the proof table (no new
opcode). Regression: `t3-ghostlands-kill` and `t7-halt-resume` under the
gates of contract 3.6.

**Commits:**

```
feat: Add the spell tool

The agent could cast only inside a fight, and could not drop a buff or
set its bar. The spell tool casts a named spell, cancels an aura and
writes the action bar.
```

```
test: Add the cancel aura scenario

The eval shows the character putting on and taking off its own buff
through the spell tool.
```

```
test: Add the action bar scenario

The eval records the bar writes; the server sends no reply, so the
check reads the session until truth covers the bar.
```

---

## spells-12b: Stop ends channels, engage waits

Rulings: SR1-spells-5, SR1-spells-14, SR1-spells-15, SR1-spells-16, SR1-spells-17.

**Files:**
- Modify (lease): `tools/stop.ts` and test; `tools/engage*.ts` and
  tests as needed; `loops/combat-actions-spells.ts`,
  `loops/combat-rejections.ts`, `loops/combat-actions-observation.ts`
  and tests (issue 5)
- Modify: `packages/harness/src/areas/spells/area.ts` and test (rules
  for `channel_start` and `channel_end`)
- Create: `packages/harness/src/grader/scenarios/t4-spells-stop-channel.json`;
  append to `ROUND_1`, `docs/capabilities.md`, and the spells row of
  `docs/evals.md`

**Depends on:** spells-1, spells-12a.

**Opcodes:** none (harness).

**Steps:**

1. **Failing tests:**
   - Rules: `channel_start` writes one row `spells/channel_start`
     "Channelling Arcane Missiles."; `channel_end` writes
     `spells/channel_end` "Arcane Missiles ended (finished)." with the
     reason in `data`.
   - `stop` with a running channel (a mock `spells.state().channel`)
     names the channel in its detail; `handle.halt()` still does the
     cancel.
   - The fight loop: a `channelling` error from `handle.cast` waits for
     `channel_end` or the target's death and does not count as a
     rejection; the danger line may cancel the channel
     (`act.cancelChannel`). `timeoutOutcome`
     (`loops/combat-actions-observation.ts:11`) does not time out a
     running channel.
   - Jev's observation holds "channelling <name>, <n> s left".
   See them fail.
2. **Implement.**
3. **Scenario, own commit:** `t4-spells-stop-channel`, preset
   `eversong10-mage`, setup `spells/learn` 5143 if needed, field
   `fairbreeze-stalkers` (a slot of its spawn group), task "Kill a
   Springpaw Stalker with Arcane Missiles, using the spell tool." Steer
   "Stop!" on `channel_start` when the coordinator has added it (issue
   4), else `fight_start` with `delayMs: 1500`. Checks: `game_log`
   `spells/channel_end` with reason `cancelled` within 2 s of the steer;
   no `combat/cast` row for the next 5 s. Capabilities: add "also ends
   a channel" to the stop row.
4. `mise ci:checks` before each commit.

**Proof:** eval. `t4-spells-stop-channel` with `mise eval`; reruns of
`t7-halt-resume` and `t3-ghostlands-kill` under contract 3.6.

**Commits:**

```
feat: Stop and wait for channels

A new cast cut a channel short and stop could not end one. Engage now
waits for a channel to finish, stop ends it, and the log shows when a
channel starts and ends.
```

```
test: Add the stop channel scenario

The eval steers a channelling mage to stop and checks that the channel
ends as cancelled with no cast after it.
```

---

## spells-2: Other units' casts

**Files:**
- Create: `areas/spells/unit-casts.ts` and test
- Modify: `areas/spells/protocol.ts`, `store.ts`, `runtime.ts`,
  `area.ts`, `opcodes.ts` (`uses`) and tests;
  `packages/core/test-support/areas/spells.ts`
- Modify: `packages/harness/src/areas/spells/area.ts` and test (rules
  that write no row for `unit_cast_*` until spells-13)
- Modify: `docs/areas/spells.md`; regenerate
  `docs/protocol-coverage/spells.md`

**Depends on:** spells-1, `SEED-2`, `T-7c`.

**Opcodes:** `SMSG_SPELL_FAILED_OTHER`.

**Steps:**

1. **Failing parser test:** `SMSG_SPELL_FAILED_OTHER` reads with the
   existing `parseSpellFailure` (`protocol/spell.ts:354`), body built as
   `Spell.cpp:5334-5339` writes it: packed guid, `u8` cast count, `u32`
   spell, `u8` result (not wowm's plain guid and spell). See it fail on
   the missing handler.
2. **Failing unit-cast tests** (`areaRig`): peeked `SMSG_SPELL_START`
   of another caster sets `castOf(guid)` to `{ spellId, kind: "cast",
   startedAt, durationMs, target }` and emits `unit_cast_start`;
   `SMSG_SPELL_GO` ends it `succeeded`; `SMSG_SPELL_FAILURE` or
   `SMSG_SPELL_FAILED_OTHER` ends it `interrupted`; `MSG_CHANNEL_START`
   and `MSG_CHANNEL_UPDATE` 0 for another caster give `kind: "channel"`
   and `finished`. An entry reads as expired at `startedAt + durationMs
   + 1000` from `now()` (no timer), and goes on the caster's entity
   destroy (runtime `listen("entity", ...)`). `SMSG_SPELL_FAILED_OTHER`
   for self is ignored, and the legacy `cast_interrupted` combat event
   fires exactly once for the character's own interrupted cast (the
   server sends both packets, `Spell.cpp:5332,5339`).
3. **Implement.** `peek` `SMSG_SPELL_START` and `SMSG_SPELL_GO` (join
   `uses`); the channel handlers of spells-1 fan out to the unit-cast
   map for other casters. No lease on `gameplay-handlers.ts`.
4. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** live. New `eversong10-mage` account, started with its
`tmp/puppet-<ACCOUNT>` wrapper and `start --packet-trace` (T-7c). Target
a hostile, start Fireball (133) and move during the cast; the trace
holds both `SMSG_SPELL_FAILURE` and `SMSG_SPELL_FAILED_OTHER` for self. A second capture near a caster mob
(the builder picks one near the Eversong spawn and names it) shows a
`unit_cast_start` in the store.

**Commit:**

```
feat: See other units' casts

Core dropped every cast packet of another caster, so the agent could not
see a mob's spell or an interrupt. The spells area now keeps each unit's
current cast or channel and how it ended.
```

---

## spells-8: Totems

**Files:**
- Create: `areas/spells/totems.ts` and test
- Modify: `areas/spells/protocol.ts`, `store.ts`, `runtime.ts`,
  `area.ts`, `opcodes.ts` and tests;
  `packages/core/test-support/areas/spells.ts`
- Modify: `packages/harness/src/areas/spells/area.ts` and test (rows
  `spells/totem_created`, `spells/totem_gone`)
- Create: `packages/devtools/src/probe-flows/spells-totem.ts`
- Modify: `docs/areas/spells.md`; regenerate
  `docs/protocol-coverage/spells.md`

**Depends on:** spells-1, `SEED-2`.

**Opcodes:** `SMSG_TOTEM_CREATED`, `CMSG_TOTEM_DESTROYED`.

**Steps:**

1. **Failing tests:** `parseTotemCreated` reads `u8 slot`, `u64 guid`,
   `u32 durationMs`, `u32 spell` (`Server/Packets/TotemPackets.cpp:25-33`,
   sent from `Entities/Totem/Totem.cpp:55-67`, slot already 0-3,
   `Totem.cpp:61`); `buildTotemDestroyed(slot)` writes one `u8`
   (`TotemPackets.cpp:20-23`, `Handlers/SpellHandler.cpp:686-705`).
   Store: four slots; `totem_created`; the slot clears on the totem's
   entity destroy or at `startedAt + durationMs` read from `now()`, with
   `totem_gone`. `act.destroyTotem(4)` and an empty slot return
   `no_totem`. Rules write "Stoneskin Totem placed (earth)." and the
   gone row. See them fail.
2. **Implement.**
3. **Probe flow** `spells-totem`: `--arg spell=<id>` casts it, waits for
   `SMSG_TOTEM_CREATED`, then `act.destroyTotem(slot)` and waits for
   `SMSG_DESTROY_OBJECT` of the totem guid.
4. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** try live, then mock. No preset is a shaman
(`docs/factory.md` "Game accounts"). New `eversong10` account;
`mise factory soap gm <ACCOUNT> learn 8071` (Stoneskin Totem [I]) and
`items 5175:1` (Earth Totem [I]; the builder checks both ids in the
AzerothCore data), then `mise protocol:probe <ACCOUNT> --flow
spells-totem --arg spell=8071 --expect SMSG_TOTEM_CREATED`. If a
non-shaman cannot cast it (could not determine), `SMSG_TOTEM_CREATED`
is mock from `TotemPackets.cpp:25-33` and "not seen live", and
`CMSG_TOTEM_DESTROYED` is `builder` "not proven live: no shaman" (issue
7), both in `unseen`. The report says which path held; spells-14 reads
it.

**Commit:**

```
feat: Track totems

Totems a character placed were invisible, and it could not remove one.
The spells area now keeps the four totem slots with their timers and
sends the totem destroy.
```

---

## spells-13: Target casts in the harness

**Files:**
- Modify: `packages/harness/src/areas/spells/area.ts` and test (rows
  `spells/target_start`, `spells/target_interrupted`)
- Modify (lease): `tools/look.ts` and its `lookParams` block (issue 6);
  `loops/combat-actions-observation.ts` and test (issue 5)

**Depends on:** spells-2, spells-12b (the `loops/` lease passes on).

**Opcodes:** none (harness).

**Steps:**

1. **Failing tests:** a `unit_cast_start` of the current target or an
   attacker writes "Scourge Invader starts casting Shadow Bolt."; any
   other caster writes no row; `unit_cast_end` `interrupted` writes the
   interrupted row. `look` adds "channelling Arcane Missiles, 3 s left"
   on the self line and "casting Fireball, 1.2 s left" on the target
   line. Jev's observation gains the target's cast. See them fail.
2. **Implement**, `mise ci:checks`.

**Proof:** eval rerun, no new scenario (no verb, R9). `mise eval run
t3-ghostlands-kill --round <n>`; the game log shows `spells/target_*` rows when a
caster mob fights, and the gates of contract 3.6 hold.

**Commit:**

```
feat: Show the target's cast

The agent could not see what its target was casting, so a class with an
interrupt could not choose it. Look, Jev and the log now name the
target's current cast.
```

---

## spells-7: Professions and skills

**Files:**
- Create: `areas/spells/skills.ts`, `areas/spells/skill-names.ts` and
  tests
- Modify: `areas/spells/protocol.ts`, `store.ts`, `runtime.ts`,
  `area.ts` and tests; `packages/core/test-support/areas/spells.ts`
- Modify: `packages/harness/src/areas/spells/area.ts` and test (row
  `spells/skill_changed`, at most one per skill per minute)
- Create: `packages/devtools/src/probe-flows/spells-skill.ts`
- Modify: `docs/areas/spells.md`; regenerate
  `docs/protocol-coverage/spells.md`

**Depends on:** spells-1, `SEED-3`.

**Opcodes:** `CMSG_UNLEARN_SKILL`.

**Steps:**

1. **Failing tests:** `readSkills(rawFields)` reads the 128 triples at
   `PLAYER_SKILL_INFO` offset 636 (`update-fields.ts:276`): word 0 id
   (low `u16`) and step (high), word 1 value and max, word 2 temporary
   and permanent bonus as `int16` (`Entities/Player/Player.h:79-89`).
   A self update that raises Mining emits `skill_changed`; one that
   drops the id emits `skill_removed`. `buildUnlearnSkill(id)` writes
   one `u32` (`Handlers/SkillHandler.cpp:91-100`).
   `act.unlearnSkill(186)` sends only when the skill is in the store and
   is a primary profession (`Spells/SpellMgr.cpp:38-46`), else
   `not_profession`. `skill-names.ts` names the primary and secondary
   professions. The harness rule writes "Mining is now 12/75." at most
   once per skill per minute. See them fail.
2. **Implement.**
3. **Probe flow** `spells-skill`: `--arg unlearn=<id>`.
4. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** live. New `eversong10` account; hold it online and `mise
factory soap gm <ACCOUNT> learn 2575` (Apprentice Mining [I]; the
builder checks the id). The next self update shows skill 186. Then
`mise protocol:probe <ACCOUNT> --flow spells-skill --arg unlearn=186`;
the next self update clears the slot.

**Commit:**

```
feat: Read skills and drop a profession

Core never read the skill fields, so professions were invisible and the
character could not drop one. The spells area now keeps skill values and
sends the profession unlearn.
```

---

## spells-9: Death knight runes

**Files:**
- Create: `areas/spells/runes.ts` and test
- Modify: `areas/spells/protocol.ts`, `store.ts`, `area.ts`,
  `opcodes.ts` (`uses`, `unseen`) and tests;
  `packages/core/test-support/areas/spells.ts`
- Modify: `docs/areas/spells.md`; regenerate
  `docs/protocol-coverage/spells.md`

**Depends on:** spells-2 (the `SMSG_SPELL_GO` peek), `SEED-3`.

**Opcodes:** `SMSG_CONVERT_RUNE`.

**Steps:**

1. **Failing tests:** `parseConvertRune` reads `u8 index`, `u8 type`
   (`Entities/Player/Player.cpp:13736-13743`). The rune store starts
   from AzerothCore's base layout (2 blood, 2 unholy, 2 frost,
   `Player.cpp:13765-13773`), converts on the packet with
   `rune_converted`, reads the ready mask and cooldown bytes from a
   peeked self `SMSG_SPELL_GO` `runes` field (`protocol/spell.ts:210-219`)
   and the regen rates from `PLAYER_RUNE_REGEN_1..4`
   (`update-fields.ts:321`). A non-death-knight never creates runes. See
   them fail.
2. **Implement.** `SMSG_SPELL_GO` is already in `uses` (spells-2).
3. Proof row, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** mock (R22) from `Player.cpp:13740-13742`, marked "not seen
live". No preset is a death knight and a GM command cannot make one.

**Commit:**

```
feat: Track death knight runes

A death knight's rune types and readiness were unknown. The spells area
now keeps the six runes from the convert packet, the spell-go rune bytes
and the regen fields.
```

---

## spells-14: The spell tool: professions and totems

**Files:**
- Create: `packages/harness/src/areas/spells/tool-skills.ts` and test
- Modify: `packages/harness/src/areas/spells/tool.ts`, `area.ts`
  (`worldActs` gains `unlearnSkill`, `destroyTotem`) and tests
- Modify (lease): `tools/journal.ts` and test, its `tools/params.ts`
  and `contract/details.ts` blocks
- Create: `packages/harness/src/grader/scenarios/t4-spells-unlearn-profession.json`
  and, only if spells-8 proved a totem live,
  `t4-spells-destroy-totem.json`; append each to `ROUND_1`,
  `docs/capabilities.md` and the spells row of `docs/evals.md`

**Depends on:** spells-7, spells-8, spells-12a, `T-8a`.

**Opcodes:** none (harness).

**Steps:**

1. **Failing tests:** `do: "unlearn_profession"` needs `confirm: true`
   (else `REFUSED` `needs_confirm`), calls `act.unlearnSkill`, and is
   `DONE` when the skill store drops the skill within 3 s, else
   `UNCONFIRMED`. `do: "destroy_totem"` with `element` calls
   `act.destroyTotem` and is `DONE` when the slot clears. `journal
   about:"spells"` adds professions (value and max) and, by class,
   totems or runes, 4 lines each. `expectSendKind(spellTool)` still
   passes. See them fail.
2. **Implement.**
3. **Scenario, own commit:** `t4-spells-unlearn-profession`, preset
   `eversong10`, setup `spells/learn` 2575, task "You won't need Mining.
   Drop the profession." Check: `truth` pick `spells` shows the Mining
   spells gone (whether `SetSkill(id, 0, 0, 0)` removes them could not
   be determined; the builder checks on the first run and uses the
   `session` source if not). Capabilities row: "Drop a profession |
   `t4-spells-unlearn-profession` | Only primary professions."
4. **Totem scenario** (decision above): with a live totem path, add
   `t4-spells-destroy-totem` (preset `eversong10`, setup `spells/learn`
   8071 and `items/add` 5175, task "Drop a Stoneskin Totem, then get rid
   of it.", checks `game_log` `spells/totem_created` then
   `spells/totem_gone`). Without it, add the bullet "- Place and remove
   a totem (`t4-spells-destroy-totem`, no shaman preset)." under "Not
   shown by any scenario" and no file.
5. `mise ci:checks` before each commit.

**Proof:** eval. `t4-spells-unlearn-profession` (and the totem scenario
when it exists) with `mise eval`.

**Commits:**

```
feat: Drop professions and totems with spell

The agent could not drop a profession or remove a totem. The spell tool
now does both, with a confirm step for the profession because it loses
progress.
```

```
test: Add the unlearn profession scenario

The eval asks the character to drop Mining and checks that the server no
longer lists its spells.
```

---

## spells-10: Far sight and mirror images

**Files:**
- Modify: `areas/spells/protocol.ts`, `store.ts`, `runtime.ts`,
  `area.ts`, `opcodes.ts` and tests;
  `packages/core/test-support/areas/spells.ts`
- Create: `packages/devtools/src/probe-flows/spells-mirror.ts`
- Modify: `docs/areas/spells.md`; regenerate
  `docs/protocol-coverage/spells.md`

**Depends on:** spells-1, `SEED-4`.

**Opcodes:** `CMSG_FAR_SIGHT`, `CMSG_GET_MIRRORIMAGE_DATA`,
`SMSG_MIRRORIMAGE_DATA`.

**Steps:**

1. **Failing tests:** `buildFarSight(on)` writes `u8` 0 or 1
   (`Handlers/MiscHandler.cpp:1187-1234`); `buildMirrorImageRequest(guid)`
   writes `u64` (`Handlers/SpellHandler.cpp:741`); `parseMirrorImage`
   reads the 68-byte reply: `u64 guid`, `u32 display`, `u8` race,
   gender, class, five look bytes, `u32 guild`, 11 `u32` display ids
   (`SpellHandler.cpp:760` onward; the builder cites the last line).
   The store keeps `guid -> appearance` and emits `mirror_image`.
   `act.requestMirrorImage` refuses a guid that is not a visible unit
   (`not_visible`) and sends at most once per guid per sighting; no
   automatic request. See them fail.
2. **Implement.**
3. **Probe flow** `spells-mirror`: `--arg spell=55342` casts Mirror
   Image [I], then requests each summoned image.
4. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:**
- `CMSG_FAR_SIGHT`: `accepted`. `mise protocol:probe <ACCOUNT> --send
  CMSG_FAR_SIGHT --body 00 --wait 3`; no disconnect, no error. The
  server sets the seer itself (`Entities/Player/Player.cpp:13480-13498`).
- `CMSG_GET_MIRRORIMAGE_DATA`, `SMSG_MIRRORIMAGE_DATA`: try live on a new
  `eversong10-mage` account: `mise factory soap gm <ACCOUNT> level 80`,
  `learn 55342`, then `--flow spells-mirror --expect
  SMSG_MIRRORIMAGE_DATA`. If the cast fails (a reagent or a zone rule;
  could not determine), mock from the `SpellHandler.cpp` writer, marked
  "not seen live", and the request is `builder` "not proven live"
  (issue 7).

**Commit:**

```
feat: Read mirror images and far sight

Mirror images and the far-sight packet showed as unknown. The spells
area now requests and keeps an image's appearance on demand and sends
the far-sight toggle.
```

---

## spells-11: Projectiles and missiles

**Files:**
- Modify: `areas/spells/protocol.ts`, `store.ts`, `runtime.ts`,
  `area.ts`, `opcodes.ts` (`unseen`) and tests;
  `packages/core/test-support/areas/spells.ts`
- Modify: `docs/areas/spells.md`; regenerate
  `docs/protocol-coverage/spells.md`

**Depends on:** spells-1, `SEED-4`.

**Opcodes:** `CMSG_UPDATE_MISSILE_TRAJECTORY`,
`CMSG_UPDATE_PROJECTILE_POSITION`, `SMSG_SET_PROJECTILE_POSITION`.

**Steps:**

1. **Failing tests:** `buildMissileTrajectory` writes `u64` guid, `u32`
   spell, `f32` elevation, `f32` speed, two `vec3` and `u8 moveStop` 0
   (`Handlers/MiscHandler.cpp:1724-1766`; the tail of `:1758-1765` is
   never written); `buildProjectilePosition` writes `u64` caster, `u32`
   spell, `u8` cast count, three `f32` (`Handlers/SpellHandler.cpp:834`
   onward); `parseProjectilePosition` reads `u64` caster, `u8` count,
   three `f32` (`SpellHandler.cpp:865-871`) and emits `projectile_moved`.
   `act.reportProjectile` and `act.reportMissileTrajectory` refuse a
   spell the character is not casting (`not_casting`). See them fail.
2. **Implement.**
3. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** `SMSG_SET_PROJECTILE_POSITION`: mock (R22) from
`SpellHandler.cpp:865-871`, "not seen live". The two client opcodes:
`builder`, "not proven live: needs vehicle combat" (issue 7), all three
in `unseen`. `vehicles` owns when to send them and may prove them live
later.

**Commit:**

```
feat: Build projectile and missile reports

Vehicle aiming reports projectile and missile positions to the server.
The spells area now builds both reports and reads the server's
projectile position.
```

---

## Dead opcodes

`SPELLS_OPCODES.dead` holds three rows (the seed writes them, spells-1
writes their proof rows):

| Opcode | Why dead |
|---|---|
| `SMSG_SPELL_UPDATE_CHAIN_TARGETS` | No send site in AzerothCore `src/` or `modules/`; only `Server/Protocol/Opcodes.cpp` names it. |
| `SMSG_RESYNC_RUNES` | Built only in `Player::ResyncRunes` (`Entities/Player/Player.cpp:13746-13756`); its only call is commented out (`Spells/SpellEffects.cpp:6155`). |
| `SMSG_ADD_RUNE_POWER` | Built only in `Player::AddRunePower` (`Player.cpp:13758-13763`), which has no caller. |

The client direction of `MSG_CHANNEL_START` and `MSG_CHANNEL_UPDATE` is
`Handle_NULL` in `Server/Protocol/Opcodes.cpp`; only the server direction
is built (spells-1).

## Seed rulings (SEED-1)

The coordinator rules every open issue, lease request and decision of
this file that a wave-1 task (`spells-1`, `-3`, `-4`, `-5`, `-6`,
`-12a`, `-12b`) meets. Each ruling is **not yet ruled by the
maintainer**. A lease line below goes into the plan index "Lease
handovers" as a `COORD-<n>` line when its holder lands (contract 2.7,
D12). A lease on a legacy file `<name>.ts` includes `<name>.test.ts` in
the same directory and nothing else.

| Id | Issue (source) | Ruling | Status |
|---|---|---|---|
| SR1-spells-1 | Issue 1: "The plan keeps the state in `CombatCasts` (`core.combat.casts`, public at `combat-store.ts:63`) and exposes it through `SpellsState.channel`" (spells-1) | Stands. The channel state stays in `combat-casts.ts`; `SpellsState.channel` reads `core.combat.casts.channel` at snapshot time; `channel_start` and `channel_end` are area events. `combat-types.ts` and `combat-store.ts` get no edit. `halt()` cancels through `interruptCast()` and `casts.cancel()`, so `combat.ts` gets no edit | accepted by the maintainer (P2-5) |
| SR1-spells-2 | Leases table: "`combat.test.ts` \| spells-1 \| one test: `halt()` cancels a running channel (`combat.ts` itself needs no edit, see issue 1)"; the plan index "Leases" row is `combat.ts` spells-1 (spells-1) | Lease: spells-1 holds `combat.ts` with `combat.test.ts` and edits only `combat.test.ts` (one test). No next holder | accepted by the maintainer (P2-5) |
| SR1-spells-3 | Leases table: "`combat-casts.ts` and test \| spells-1" and "`combat-casts.ts`, `cooldown-store.ts` and tests \| spells-5"; spells-5 "Depends on: spells-1 (the `combat-casts.ts` lease passes on when it lands)" (spells-1, spells-5) | Lease: spells-1 holds `combat-casts.ts` and its test, then spells-5, then talents-5a (phase C). spells-1 edits only the members its lease row names; spells-5 adds only `shiftCooldown` | accepted by the maintainer (P2-5) |
| SR1-spells-4 | Issue 9: "`combat-casts.ts` imports `buildCancelChannelling` from `#wow/areas/spells/protocol`" (spells-1) | Allowed as written: contract 0.3 lets core runtime import any `#wow/*` module, and contract 1.12 limits only area imports. `areas/spells/protocol.ts` imports no value from `combat-casts.ts` or any other legacy module (the allow-list of contract 1.12 holds), so there is no import cycle | accepted by the maintainer (P2-5) |
| SR1-spells-5 | Decision: "A new cast or item use while a channel runs is refused with `channelling`. The harness waits (spells-12b)" (spells-1, spells-12b) | Stands (design 5.10). Between the landings of spells-1 and spells-12b, the fight loop reads `channelling` as a cast error. The wave's eval round runs after both land | accepted by the maintainer (P2-5) |
| SR1-spells-6 | Issue 2: "`SMSG_ACTION_BUTTONS` is legacy-handled (`action-bar.ts:18-21`) ... If `SEED-1` lists it in `owns`, the area cannot register it" (spells-4) | `SEED-1` keeps `SMSG_ACTION_BUTTONS` in `SPELLS_OPCODES.owns`, with no `stubs` line (it is not in `STUBS` since #422). The area never registers it. Coverage renders it `handled` from the legacy handler (design 3.4 `owns`; step0 test 19 renders `handled` for any `on` handler). spells-4 writes its proof row only. If a registry or coverage test still requires an area handler for every owned opcode, spells-4 stops `blocked` and the coordinator moves the opcode to `uses` in a `COORD-<n>` commit | accepted by the maintainer (P2-5) |
| SR1-spells-7 | Leases table: "`action-bar.ts` and test \| spells-4 \| `ActionBarStore.set(slot, button \| undefined)`" (spells-4) | Lease: spells-4 holds `action-bar.ts` and its test and adds only `set`. The runtime act calls it through `core.actionBar`, with a type-only import. No next holder | accepted by the maintainer (P2-5) |
| SR1-spells-8 | Issue 3: "`cooldown-store.ts` is on no lease ... Without the lease, spells-5 stops as `blocked`" (spells-5) | Granted. Contract 2.7 "Leases added by the plan fix-up" names `cooldown-store.ts` for spells, and the plan index "Leases" row is `cooldown-store.ts` spells-5. spells-5 holds it with its test and adds only `CooldownStore.shift`; the store reaches it through `CombatCasts.shiftCooldown` (SR1-spells-3). No next holder | accepted by the maintainer (P2-5) |
| SR1-spells-9 | spells-3 step 2: "the builder reads the attribute bits from `spell-catalog.ts` and states any it cannot see" (spells-3) | The area reads the definition at run time through `core.combat.definition(id)` (`combat-store.ts:108-110`), with a type-only import of `SpellDefinition`. It imports no value from `#wow/spell-catalog`, which is not on the allow-list of contract 1.12, and it takes no lease on `spell-catalog.ts` (objects-4 holds it). The builder cites the passive and `SPELL_ATTR0_NO_AURA_CANCEL` bit values from AzerothCore `SharedDefines.h` | accepted by the maintainer (P2-5) |
| SR1-spells-10 | Decision: "`CMSG_CANCEL_GROWTH_AURA` is built (N24); proof `accepted`" (spells-3) | Stands (design N24 names the opcode) | accepted by the maintainer (P2-5) |
| SR1-spells-11 | Leases table: "harness `tools/journal.ts`, its `journalParams` block in `tools/params.ts`, the `journal` `After` block in `contract/details.ts` \| spells-12a, then spells-14" (spells-12a) | Lease: the `journalParams` block and the `journal` `After` block ride with the `tools/journal.ts` lease (contract 2.7 fix-up row for `tools/params.ts`, D13). spells-12a takes all three when quests-4 lands (queue items-5b, quests-4, spells-12a, then world-8b). It does not wait for the holders of other blocks of `tools/params.ts` or `contract/details.ts` (objects-7, travel-5, quests-2) and edits no other block. The new tool keeps its own `After` type and parameters in `areas/spells/tool*.ts` (contract 1.9) | accepted by the maintainer (P2-5) |
| SR1-spells-12 | Decision: "`spell do:"cast"` for unit and self targets lands here (spells-12a); `objects` adds object, item and ground targets and `self-state` adds `mount` and `dismount` later" (spells-12a) | Stands for spells-12a: unit and self targets only. The later lease on `areas/spells/tool.ts` (self-state-10a, phase C) is ruled at its seed | accepted by the maintainer (P2-5) |
| SR1-spells-13 | Issue 8: "`t4-spells-action-bar` grades from the session only (no truth pick for the bar), so its best verdict is `partial`. D16 covers `fail` and `blocked`" (spells-12a) | Stands (design 5.10: "partial until truth has the bar"). A `partial` verdict is not a pass: the commit adds the bullet "- Set the action bar (`t4-spells-action-bar`, no server truth for the bar)." under "Not shown by any scenario" and no table row (contract 3.4, D16). The scenario, its `ROUND_1` entry, the bullet and the `docs/evals.md` row land in one commit (D15) | accepted by the maintainer (P2-5) |
| SR1-spells-14 | Issue 4: "The `channel_start` steer trigger has no owner ... spells-12b asks the coordinator for a `COORD` commit that adds `channel_start` mapped to `spells/channel_start`" (spells-12b) | Granted (design 5.10: the scenario "needs a `channel_start` steer trigger in the grader"). The coordinator adds it in one `COORD-<n>` commit after `SEED-1` (which makes `spells/<event>` a `LogEvent`) and before spells-12b starts: `"channel_start"` appended to `TriggerName` (`grader/scenarios.ts`), the sorted key `channel_start: ["spells/channel_start"]` in `TRIGGER_EVENTS` (`grader/watch.ts`) and in the expected map of `grader/watch-rows.test.ts`, and `"channel_start"` appended to both trigger `enum` lists of `grader/scenario.schema.json`. The scenario steers on `channel_start`; the `fight_start` fallback is withdrawn | accepted by the maintainer (P2-5) |
| SR1-spells-15 | Issue 5: "The fight loop and Jev observation live in `loops/` ... None is on a lease list. spells-12b and spells-13 need them" (spells-12b) | Lease: spells-12b holds `loops/combat-actions-spells.ts` and `loops/combat-rejections.ts` (no next holder) and `loops/combat-actions-observation.ts` (next combat-log-7b, then spells-13), each with its test. Jev's channel line goes in `combat-actions-observation.ts`; spells-12b edits no `jev/*` file | accepted by the maintainer (P2-5) |
| SR1-spells-16 | Leases table: "harness `tools/stop.ts` ... \| spells-12b \| the stop text names the ended channel" (spells-12b) | Lease: spells-12b holds `tools/stop.ts` with its test, and the `stop` `After` block of `contract/details.ts` rides with it (D13). No next holder | accepted by the maintainer (P2-5) |
| SR1-spells-17 | Leases table: "harness `tools/stop.ts`, `tools/engage*.ts` \| spells-12b \| ... engage waits for a channel"; spells-12b Files: "`tools/engage*.ts` and tests as needed" (spells-12b) | Refused. The plan index "Leases" gives the engage files to other tasks (`engage.ts` self-state-10b, `engage-approach.ts` threat-3c, `engage-tally.ts` combat-log-7b, `engage-choose.ts` pvp-11d) and none to spells-12b. The builder puts the wait for a channel in the fight loop it holds (`loops/combat-actions-spells.ts`, `loops/combat-rejections.ts`, `timeoutOutcome` in `loops/combat-actions-observation.ts`, SR1-spells-15). If a test shows that an `engage*.ts` member must change, spells-12b stops `blocked` and names the file and the member | accepted by the maintainer (P2-5) |

**Left for later seeds.** Only tasks of later waves meet these, so this
pass does not rule them: issue 6 (`tools/look.ts`, spells-13, wave 2),
issue 7 (client opcodes with no live path: spells-8 wave 2, spells-10
and spells-11 wave 4), and the decisions on automatic mirror-image
requests and the missile `moveStop` tail (spells-10, spells-11) and on
`t4-spells-destroy-totem` (spells-14, wave 3). spells-6 meets no open
issue.

## Seed rulings (SEED-2)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-2 task meets, before `SEED-2`. The wave-2 tasks of this unit are spells-2, spells-8 and spells-13 (phase B). Each ruling is a coordinator ruling (P2-17). Rows marked "for the maintainer's review" answer a design question with the recommended answer of the draft.

A task's own eval runs use the round number the coordinator gives in its build prompt (SEED2-1). Wave-2 scenarios run replica 1 only and no spawn grid is added (SEED2-2). `origin/factory/426-protocol-coverage` in this file means `origin/factory/431-wave2` for part 2 (SEED2-6). Paths without a prefix are under `packages/core/src/wow/` (core), `packages/harness/src/` (h:) or `packages/devtools/src/` (dev:); AzerothCore paths are relative to `src/server/game/` in `/home/deity/code/azerothcore-wotlk-playerbots` unless they start with `src/`, `data/` or `modules/`. Facts marked [M] were measured in this worktree or in AzerothCore; [INFERENCE] marks what was not observed.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR2-spells-1 | spells-2 step 3: "`peek` `SMSG_SPELL_START` and `SMSG_SPELL_GO` ...; the channel handlers of spells-1 fan out to the unit-cast map for other casters" (spells.md:741-743), and the spells-1 report note that the `SMSG_SPELL_FAILURE` peek already exists in `areas/spells/area.ts:46-48`. | Extend the existing peek: `store.spellFailure` keeps its self path and also ends the unit-cast entry of any other caster. Do not add a second peek on `SMSG_SPELL_FAILURE`. `SMSG_SPELL_START` and `SMSG_SPELL_GO` are new peeks. `MSG_CHANNEL_START` and `MSG_CHANNEL_UPDATE` keep their `wire.on` (`area.ts:22-27`); `store.channelStart` and `channelUpdate` drop the `caster !== self` early return (`store.ts` `channelStart`, `channelUpdate`) and send the other-caster case to the unit-cast map. No lease on `gameplay-handlers.ts` (the peeks need none). | coordinator ruling (P2-17) |
| SR2-spells-2 | spells-2 step 3: "join `uses`". | `SPELLS_OPCODES.uses` becomes `["SMSG_SPELL_FAILURE", "SMSG_SPELL_GO", "SMSG_SPELL_START"]` (unit-owned file, contract 2.5; the registry test "each area registers only what it owns and uses", `registry.test.ts:207-221`, needs both). `SMSG_SPELL_FAILED_OTHER` is already in `owns` (`opcodes.ts:20`) and gets a `wire.on`. Nothing goes in `unseen` for the two peeks (SR2-pets-4 rule). | coordinator ruling (P2-17) |
| SR2-spells-3 | spells-2 Files: "harness rules that write no row for `unit_cast_*` until spells-13" (spells.md:713-714). The harness rule's last line is `return [quiet(event)]` (`packages/harness/src/areas/spells/area.ts:57-60`), which writes a `fallback: true` log row for every event type it does not name. | spells-2 adds `if (event.type === "unit_cast_start" \|\| event.type === "unit_cast_end") return [];` before the fallback, plus a test that a mob cast writes no row. Without it every mob cast in view floods the game log. spells-8 replaces its two types with real rows (`totem_created`, `totem_gone`) in the same way. The `quiet` fallback stays. | coordinator ruling (P2-17) |
| SR2-spells-4 | spells-2 step 2: "sets `castOf(guid)` to `{ spellId, kind, startedAt, durationMs, target }`" gives no state shape, no rule for instant casts and no bound. | State: `SpellsState.unitCasts: readonly UnitCast[]` with `UnitCast = { guid: bigint; spellId: number; kind: "cast" \| "channel"; startedAt: number; durationMs: number; target: bigint \| undefined; relevant: boolean }`; `castOf(guid)` is a store method, not a state field. An entry is created only when `SMSG_SPELL_START` has `timer > 0` (`parseSpellStart` gives `timer`; AzerothCore writes `int32(m_timer)`, `Spells/Spell.cpp:4924`) or on `MSG_CHANNEL_START` with a finite duration. A start with `timer <= 0` (instant) creates no entry and no event: every instant spell of every unit in view would otherwise emit a start/end pair. `SMSG_SPELL_GO` for a guid with no entry is ignored. Expiry is read, not timed: `snapshot()` and `castOf` hide an entry at `startedAt + durationMs + 1000` from `deps.now()`. The store keeps at most 64 entries (oldest out). The entry goes on the caster's `disappear` (`EntityEvent`, `entity-store.ts:86-97`; the runtime already listens to `"entity"`, `runtime.ts:105-107`, which today filters `update` of self; it adds `disappear`). Recommended answer; the coordinator may choose to keep instants. | coordinator ruling (P2-17), for the maintainer's review |
| SR2-spells-5 | spells-13 step 1 needs a row "Scourge Invader starts casting Shadow Bolt." for "the current target or an attacker", but `RuleLookup` has no spell-name, self-target or attacker member (`packages/harness/src/events/rules.ts:19-29`; `lookupFor` in `events/router.ts:142-175` is frozen after S0-5). | No `RuleLookup` edit. The core store decides relevance and names the spell, so the rule only formats: `unit_cast_start` = `{ type, guid, spellId, spellName, kind, durationMs, relevant: 1 \| 0 }`, `unit_cast_end` = `{ type, guid, spellId, spellName, outcome: "succeeded" \| "interrupted" \| "expired", relevant: 1 \| 0 }`. `relevant` is computed at start and stored on the entry: the caster is the self target (`UNIT_FIELDS.TARGET` of the self entity through `deps.getEntity`, as `combatlog/store.ts` `selfTarget()` does) or `core.combat.isAttackingSelf(guid)` (`combat-store.ts:135-139`). `spellName` is `core.combat.definition(spellId)?.name` (no value import; precedent SR1-spells-9). Numbers, not booleans, on the event, as combatlog `kill` does (`bySelf`). The rule writes the unit name with `rc.lookup.unitName(guid)`. | coordinator ruling (P2-17), for the maintainer's review |
| SR2-spells-6 | spells-2 step 1-2 need `SMSG_SPELL_START`, `SMSG_SPELL_GO` and `SMSG_SPELL_FAILED_OTHER` bodies. `test-support/areas/spells.ts` has none (`spellsSpellFailureBody` is the nearest, `:25`). The only builders are private (`combat-auto-repeat.test.ts:190` `spellStartBytes`, `combat-casts.test.ts:44` `go`). | spells-2 adds `spellsSpellStartBody`, `spellsSpellGoBody` and `spellsSpellFailedOtherBody` to `packages/core/test-support/areas/spells.ts` (unit-owned). Contract 0.5 forbids a shared builder inside a test file that two files use. combat-log-3 writes its own `combatlogSpellGoBody` (SR2-combat-log-7); test-support files never import each other. | coordinator ruling (P2-17) |
| SR2-spells-7 | spells-2 step 1: `SMSG_SPELL_FAILED_OTHER` "reads with the existing `parseSpellFailure` (`protocol/spell.ts:354`)". | Correct in substance, wrong line: `parseSpellFailure` is at `protocol/spell.ts:358`. No new parser, no new type. AzerothCore body: packed guid, `u8` cast count, `u32` spell, `u8` result (`Spells/Spell.cpp:5334-5339`, `SendInterrupted`). The handler ignores `caster === deps.selfGuid()`. The "`cast_interrupted` fires exactly once" test runs the legacy owner through `areaRig` `init.register` (RigInit has it). | coordinator ruling (P2-17) |
| SR2-spells-8 | spells-2 Proof: one `eversong10-mage` account, Fireball, move during the cast; "a second capture near a caster mob (the builder picks one near the Eversong spawn and names it)". No mob that casts near the spawn is known from the repo (could not determine), and `walkTowardPoint` needs a hostile within reach (pets-2 found the nearest hostile 99 yd from the spawn, `pets-2.md` Q4). | Two accounts, both `eversong10-mage`, same spawn. Account A observes (probe or puppet with `--packet-trace`), account B casts through its `tmp/puppet-<ACCOUNT>` wrapper. B casts a self cast with a cast time (Conjure Water, level 4, cast time 3 s [INFERENCE, builder confirms the id in the spellbook]) with `raw CMSG_CAST_SPELL`, then `raw CMSG_CANCEL_CAST` (`buildCancelCast`, `protocol/spell.ts:276`): A's tap holds `SMSG_SPELL_START`, `SMSG_SPELL_FAILURE` and `SMSG_SPELL_FAILED_OTHER` with B's guid, and A's `handle.spells.state().unitCasts` shows the entry then its end. For the channel: B is staged with `level 20` and `spells/learn 12051` (Evocation; the `t4-spells-stop-channel` setup does the same), casts it, and cancels. The own-character proof of the plan (Fireball, move) stays for the self packets. A hostile caster mob is optional. | coordinator ruling (P2-17) |
| SR2-spells-9 | spells-8 Proof: "`mise factory soap gm <ACCOUNT> learn 8071` and `items 5175:1`". `soap gm items` is `send items` (a mail to the character, `packages/factory/src/soap-gm.ts` `items()`), and the character cannot open mail before `economy`. | `learn 8071` stays a `soap gm` verb (own character, contract 0.7). The Earth Totem (5175, the builder confirms the id in the AzerothCore data) is staged offline with `mise factory soap setup <ACCOUNT> items/add` (body `{"item":5175,"count":1}`, the shape `t8-items-ammo` uses), never with `soap gm items`. | coordinator ruling (P2-17) |
| SR2-spells-10 | spells-8 step 1: "`act.destroyTotem(4)` and an empty slot return `no_totem`"; slots "already 0-3"; "clears on the totem's entity destroy or at `startedAt + durationMs` read from `now()`". | (a) The wire slot is 0-3 (fire, earth, water, air): the writer sends `slot - SUMMON_SLOT_TOTEM_FIRE` (`Entities/Totem/Totem.cpp:61-65`, `SUMMON_SLOT_TOTEM_FIRE = 1 .. AIR = 4`, `src/server/shared/SharedDefines.h:3545-3548`); the handler adds 1 and drops silently at `>= MAX_TOTEM_SLOT` (5) (`Handlers/SpellHandler.cpp:691-697`, `SharedDefines.h:3555`). So `destroyTotem(slot)` returns `invalid_slot` for a non-integer or a slot outside 0-3 (the server drops it without a word) and `no_totem` for an empty slot; the plan text ("4 returns `no_totem`") is amended. (b) The row text takes the element from the slot: 0 fire, 1 earth, 2 water, 3 air. (c) The server sends `SMSG_TOTEM_CREATED` before the totem is added to the world (`Totem.cpp:55` comment), so the entity may not be in the store yet; the slot stores the guid and a later `disappear` of that guid clears it. A `SMSG_TOTEM_CREATED` for an occupied slot ends the old totem with `totem_gone` reason `replaced`. (d) Expiry: the store never arms a timer (contract 1.2); the runtime arms one timer per totem, cleared on `ctx.signal`, as `combatlog/runtime.ts:11-31` does, and calls a store method that emits `totem_gone` reason `expired`; `disappear` gives reason `gone`, the destroy act `destroyed`. Events `totem_created` `{ slot, guid, spellId, spellName, durationMs }` and `totem_gone` `{ slot, guid, spellId, spellName, reason }`. | coordinator ruling (P2-17) |
| SR2-spells-11 | Contract issue 7 (spells.md:154-160): `CMSG_TOTEM_DESTROYED` with no live path; "the coordinator confirms the row". | Confirmed. If the live totem of SR2-spells-9 works, both opcodes are `live`. If not: `SMSG_TOTEM_CREATED` is `mock` from `Server/Packets/TotemPackets.cpp:25-33` and `Totem.cpp:55-67` and stays in `unseen`; `CMSG_TOTEM_DESTROYED` gets the contract 0.6 row "A client opcode with a real effect that no worker can make visible": a live send (slot 0, an empty slot, which the server ignores at `SpellHandler.cpp:697-698`) with no disconnect, proof `builder`, evidence "sent live, effect not seen", listed in `unseen`. spells-14 (wave 3) reads which path held. | coordinator ruling (P2-17) |
| SR2-spells-12 | Contract issue 6 (spells.md:151-153): "`tools/look.ts` lists no `spells` lease". SEED-1 already assigned the look files to spells-13 in the queue (plan index lines 701-705, `spells-13 (B)`). | Granted, narrowed. spells-13 edits only `tools/look.ts` and `tools/look-self.ts` (with their tests) and the `LookAfter` block of `contract/details.ts` (rider, D13). It edits no `SelfView` or `UnitView`, so it needs no lease on `contract/views.ts` or `ops/views.ts` (held by `self-state-11b → combat-log-7b → self-state-10a`). New optional fields on `LookAfter`: `channel?: { spellId; spellName; remainingMs }` (self) and `targetCast?: { spellId; spellName; remainingMs }` (target). `look.ts` fills them from `handle.spells.state()` (`channel` and `unitCasts`), `look-self.ts` prints them: "channelling Arcane Missiles, 3 s left" on the self line, "casting Fireball, 1.2 s left" on the target line (`statusLine`). It edits no look param: `tools/params.ts`, `params-look.ts`, `look-find.ts` and `look-rows.ts` drop out of its lease rows. | coordinator ruling (P2-17) |
| SR2-spells-13 | spells-13 Files: "`loops/combat-actions-observation.ts` and test (issue 5)". The Jev frame is built in `CombatActions.observe` and `baseObservation` (`loops/combat-actions.ts:114-186`), the deps type is `ActionDeps` (`:67-75`), and `game.ts:122-130` builds the deps. spells-13 needs a new dep and one more observation key, and `combat-actions.ts` has 498 non-blank lines (limit 500); no next holder was named after combat-log-7b. | Pre-split (SR2-spells-14) and lease: spells-13 holds the new `loops/combat-actions-frame.ts` and `loops/game.ts` (one line, `spells: () => handle.spells.state()`, next to `combatLog:` at `game.ts:124`) and keeps `loops/combat-actions-observation.ts` (its function `targetCastObservation` lives there, 156 non-blank now). `ActionDeps` gains `spells?: () => AreaState<"spells"> \| undefined`. The observation gains a `targetCast` key next to `combatLog`. `combat-actions.ts` itself is edited only by the coordinator pre-split. | coordinator ruling (P2-17) |
| SR2-spells-14 | `loops/combat-actions.ts` is 498 non-blank. | Coordinator edit row: move `type ActionDeps` (`:67-75`) and `baseObservation` (`:144-186`) into a new `loops/combat-actions-frame.ts` as `export type ActionDeps` and `export function baseObservation(deps, rejections, context, state, spells)`; `observe` calls it; drop the imports it no longer uses (`auraObservation`, `combatLogObservation`, `hex`, `navigationObservation`, `outcomeObservation`, `unitObservation`, `hunterObservation`, `AreaState`, `EntityLookup`, `FactionRelation`). Result: `combat-actions.ts` about 440, the new file about 85. | coordinator ruling (P2-17) |
| SR2-spells-15 | spells-13 Files: "`tools/look.ts` ... and its `lookParams` block"; owner list has `tools/look.test.ts` (494 non-blank) and `tools/params.ts`. | spells-13 puts its tests in `look-self.test.ts` (36 non-blank; the `jest.spyOn(handle.selfstate, "state")` pattern there works for `handle.spells.state`) and a new `look-cast.test.ts`; it does not edit `look.test.ts`. If an edit of `look.test.ts` proves unavoidable it stops `blocked` and the coordinator splits it ("Coordinator edits for SEED-2", fallback row). | coordinator ruling (P2-17) |
| SR2-spells-16 | spells-13 Proof: "the game log shows `spells/target_*` rows when a caster mob fights". `t3-ghostlands-kill` may meet no caster (preset `ghostlands20`, field `ghostlands-tranquillien`). | Stands with a fallback: the eval reruns for the contract 3.6 gates; if no caster fights, the report says "no `spells/target_*` row seen" and the mock-game tests plus `look-self.test.ts` are the proof; that is not a failure (no new scenario, R9). | coordinator ruling (P2-17) |
| SR2-spells-17 | Three tasks of one unit edit `areas/spells/{protocol,store,runtime,area,opcodes}.ts`, `test-support/areas/spells.ts` and the harness `area.ts` (owner lists). | The unit runs them one at a time. Order: spells-2, spells-13, spells-8 (spells-13 needs only spells-2, and it unblocks the look-lease holders after it; spells-8 has the GM staging that may stall). Each task adds its harness rules in its own sibling file only if `area.ts` (62 non-blank) would pass 250 lines; otherwise inline. | coordinator ruling (P2-17) |

## Seed rulings (SEED-3)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-3 task meets, before `SEED-3`. The wave-3 tasks of this unit are spells-7, spells-9, spells-14 (phase C). Each ruling is a coordinator ruling (P2-17). `core:` = `packages/core/src/wow/`, `h:` = `packages/harness/src/`, `cts:` = `packages/core/test-support/`, `dev:` = `packages/devtools/src/`. A task's own eval runs use the round number the coordinator hands the builder. The `SR3-spells-<n>` ids supersede nothing earlier; section "Coordinator edits for SEED-3" in the plan index holds the seed edits (the `SEED3-<n>` ids).

| Id | Issue and task | Ruling | Status |
|---|---|---|---|
| SR3-spells-1 | spells-7 step 1: `skill-names.ts` "names the primary and secondary professions"; no source named, and `SkillLine.dbc` is absent (F1). The server only accepts primary professions (`IsPrimaryProfessionSkill`: `SkillLine` `categoryId == SKILL_CATEGORY_PROFESSION` 11, `Spells/SpellMgr.cpp:38-48`, `src/server/shared/SharedDefines.h:3309-3311`). | superseded by the coordinator decision (DBCs staged): `SkillLine.dbc` is staged: `skill-names.ts` keeps the static table as the file-absent branch, and the runtime reads skill names and the primary-profession category (11) from `SkillLine.dbc` through `ctx.dbc` when it loads; `act.unlearnSkill` still returns `not_profession` for ids outside the primary list. Each task that reads a staged file through `ctx.dbc` adds its row to the `docs/harness.md` "DBC files" table. Draft text, kept as the no-file branch (P2-8 degraded ids): `skill-names.ts` is a static table, no DBC: primary (category 11) Alchemy 171, Blacksmithing 164, Enchanting 333, Engineering 202, Herbalism 182, Inscription 773, Jewelcrafting 755, Leatherworking 165, Mining 186, Skinning 393, Tailoring 197; secondary (category 9) Cooking 185, First Aid 129, Fishing 356, Riding 762 (`SharedDefines.h:3125-3237`). The table says which ids are primary. `act.unlearnSkill(id)` returns `not_profession` for any id outside the primary list (also for an id the character lacks: `not_known`), so the act never sends what the server silently drops (`Handlers/SkillHandler.cpp:91-100`). Other skills (weapons, languages) get the name `skill <id>`. | coordinator ruling (P2-17) |
| SR3-spells-2 | spells-7 step 1: `readSkills(rawFields)` "reads the 128 triples at `PLAYER_SKILL_INFO` offset 636". `objects` already reads the same fields in `areas/objects/open-acts.ts:60-88` (`skillOf`, value plus both `int16` bonuses). | Stands: `PLAYER_FIELDS.SKILL_INFO` is `{ offset: 636, size: 384 }` (`protocol/update-fields.ts:276`) = 128 triples. `readSkills` is a new pure function in `skills.ts` with its own tests; it does not import or edit `objects/open-acts.ts` (contract 1.12 forbids area-to-area imports; duplicated logic is accepted). Shape: `Skill = { id, name, step, value, max, tempBonus, permBonus }` (id = low `u16` of word 0, step = high `u16`; value and max = low and high `u16` of word 1; bonuses = the two signed `int16` of word 2, the same sign handling as `open-acts.ts:83-88`). An empty slot (id 0) is skipped. | coordinator ruling (P2-17) |
| SR3-spells-3 | spells-7 state and events. `SpellsState` is `{ channel, barToggles, inactiveRanks, modifiers, unitCasts, totems }` (`areas/spells/store.ts:24-31`); `eventTypes` is the list at `areas/spells/area.ts:17-25`. No field, event shape or trigger for "self update" is named. | `SpellsState.skills: readonly Skill[]` (required; F6 literals get `skills: []`). Events `{ type: "skill_changed"; id; name; from: number \| undefined; to; max }` and `{ type: "skill_removed"; id; name }`, both appended to `eventTypes`. The snapshot reads the fields lazily from `deps.getEntity(deps.selfGuid())?.rawFields` (as `areas/talents/fields.ts` does); change detection is in `runtime.ts`: `ctx.listen("entity", ...)` for the self guid, as `areas/reputation/runtime.ts:39-42` does, calling `store.readSkills()`. The first read only seeds the baseline and emits nothing (otherwise login writes a row per skill); later reads compare against it by id. `value` changes within the same `max` and a new id emit `skill_changed`; a vanished id emits `skill_removed`. | coordinator ruling (P2-17) |
| SR3-spells-4 | spells-7 harness rule "Mining is now 12/75." — the harness cannot import `skill-names.ts` (not exported from `@peon/core`; no `index.ts` in the owner list). | The core event carries `name` (from `skill-names.ts`, `skill <id>` fallback), as SR2-spells-5 did for spell names. The harness rule in `h: areas/spells/area.ts` only formats `"<name> is now <to>/<max>."` and `"<name> dropped."`; `skill_changed` with `from === undefined` reads `"<name> learned, <to>/<max>."`. At most one row per skill per minute: a `Map<id, lastRowAt>` in the rule closure keyed on `rc.now` (the harness rule has `rc.now`; same pattern as combat-log `lastRowAt`). `skill_removed` is never throttled. | coordinator ruling (P2-17) |
| SR3-spells-5 | spells-7 Proof: "`mise factory soap gm <ACCOUNT> learn 2575` (Apprentice Mining); the builder checks the id". Unknown: does learning spell 2575 give skill 186? And does the offline `spells/learn` setup endpoint (used by the spells-14 scenario, `realm-service.ts:14-16`) do it? | DESIGN answered: E4 accepted: if offline `spells/learn` 2575 does not give skill 186, no scenario can stage the profession and `t4-spells-unlearn-profession` is bullet-only (SR3-spells-16). AzerothCore gives the skill when the spell is added: `Player::addSpell` takes the `SpellLearnSkillNode` of the spell and calls `SetSkill` (`Entities/Player/Player.cpp:3355-3374`), and `SetSkill` with a new id fills the triple (`:5547-5565`). So `soap gm <ACCOUNT> learn 2575` (online, `packages/factory/src/soap-gm.ts:214-216,251`) is expected to put skill 186 in the next self update. The offline path is `[INFERENCE]`: the realm service writes outside `addSpell`. spells-7 therefore uses ONE account: `soap setup <ACCOUNT> spells/learn '{"spell":2575}'` while offline, login, read `state().skills`; record in `docs/areas/spells.md` Wire notes whether skill 186 is present (this answer gates the spells-14 scenario, SR3-spells-16). If absent, continue the same account with the online `gm learn 2575`. Then `mise protocol:probe <ACCOUNT> --flow spells-skill --arg unlearn=186`. Delete the account. Preset: `eversong10`. | coordinator ruling (P2-17) |
| SR3-spells-6 | spells-7 `CMSG_UNLEARN_SKILL` proof and what the server does: the plan leaves open "whether `SetSkill(id, 0, 0, 0)` removes the spells". | Answered from source: `SetSkill(id, 0, 0, 0)` clears the triple and calls `removeSpell(GetFirstSpellInChain(ability.Spell))` and `RemoveAurasDueToSpell` for every `SkillLineAbility` of the skill (`Player.cpp:5537-5556`). So the spells of the profession do disappear from the spellbook (`SMSG_REMOVED_SPELL`/unlearn packets) and the truth `spells` pick in the spells-14 scenario is valid, no `session` fallback needed. The proof row for `CMSG_UNLEARN_SKILL` is `live` when the next self update clears the slot (`skill_removed`) and the probe trace shows the removed-spell packets. | coordinator ruling (P2-17) |
| SR3-spells-9 | spells-9 Proof: "mock (R22) ... No preset is a death knight and a GM command cannot make one." P2-6 builds a DK preset at the start of wave 3. `SMSG_RESYNC_RUNES` and `SMSG_ADD_RUNE_POWER` stay `dead`. | Decision: T-11 builds the death knight preset `eversong55-deathknight` first (BR-wave3-5) and spells-9 depends on `T-11`, so the two live tries run on it. The drafted mock fallback applies only when T-11 records the DK part as not built or both tries fail (BR-wave3-6). The plan's "mock only" is replaced by the rule "make the live try you planned" (rules.md item 5): two tries, about 10 minutes, on the DK preset once it exists in `soap-presets.ts`. Source facts: `SMSG_CONVERT_RUNE` goes out only from `Player::ConvertRune` (`Player.cpp:13736-13743`), reached from a `SPELL_AURA_CONVERT_RUNE` (249) aura apply or removal (`Spells/Auras/SpellAuraEffects.cpp:5771-5800`, `Player.cpp:13695-13724`), so the live spell is one whose effect is that aura. The builder finds such a spell by scanning the loaded `Spell.dbc` (present, F1) for effect aura 249 and GM-learns it with `soap gm <ACCOUNT> learn <id>` (Blood Tap, 45529, is the usual candidate `[INFERENCE]`); a rune-cost spell cast at a target proves the `SMSG_SPELL_GO` rune bytes. If the DK preset is missing or neither try works: mock from `Player.cpp:13736-13743`, `SMSG_CONVERT_RUNE` goes into `unseen` (the only `opcodes.ts` edit), doc says "not seen live". `SMSG_RESYNC_RUNES` (writer `Player.cpp:13746-13756`, call commented out at `SpellEffects.cpp:6155`) and `SMSG_ADD_RUNE_POWER` (writer `:13758-13763`, no caller) stay `dead`. | coordinator ruling (P2-17) |
| SR3-spells-10 | spells-9 step 1 state: "rune store starts from AzerothCore's base layout ... A non-death-knight never creates runes". Class source and state shape are not named. | Base layout `[blood, blood, unholy, unholy, frost, frost]` (`Player.cpp:13765-13773`), types 0 blood, 1 unholy, 2 frost, 3 death `[INFERENCE, SharedDefines RuneType not read]`. `SpellsState.runes: readonly Rune[] \| undefined` with `Rune = { index, type, ready, cooldown, regen? }`; `undefined` unless the self class is 6 (death knight), read from byte 1 of `UNIT_FIELDS.BYTES_0` in the self entity's `rawFields` (`update-fields.ts:69`, as talents-3a reads the class). Regen rates come from `PLAYER_FIELDS.RUNE_REGEN_1` (4 floats, `update-fields.ts:321`, AzerothCore writes 0.1 at init: `Player.cpp:13796`), read lazily in `snapshot()`; no runtime edit is needed. Event `rune_converted { index, from, to }`. F6: `runes: undefined` goes in the two shared typed literals. The store reads only rune state; it does not guess cooldown ticks (no timer). | coordinator ruling (P2-17) |
| SR3-spells-11 | spells-14 Files: `tools/params.ts` and "its `tools/params.ts` block" (F3). | Dropped. `journalParams.about` already lists `spells` (`tools/params-journal.ts:4-7`) and spells-14 adds no journal argument. The new `spell` arguments (`confirm`, `element`, two `do` values) live in `h: areas/spells/tool.ts` `spellParams` (`tool.ts:19-49`), a unit file. So spells-14 holds no lease on any `params*.ts` file. | coordinator ruling (P2-17) |
| SR3-spells-12 | spells-14 Files: lease on `tools/journal.ts` (472 non-blank, F5) and its `contract/details.ts` block; `journal about:"spells"` adds professions, totems or runes. The spells result is built in `tools/journal.ts:409-440` (`spellLine`, `spellText`, `spellsResult`) from `spellsJournalExtras` (`areas/spells/journal.ts:21-36`). | Coordinator pre-split (SEED3-13): move `spellLine`, `spellText` and `spellsResult` into `h: areas/spells/journal.ts` (unit file). Then spells-14 adds its lines there and never edits `tools/journal.ts` (no lease on the file; `economy-8` and `economy-10` keep it). It keeps the `JournalAfter` block lease of `contract/details.ts` (`:340-345`): the `spells` variant gains `professions: ProfessionLine[]`, `totems: TotemLine[]`, `runes: RuneLine[]` (line types added beside `AuraLine`/`BarLine`). New block lines obey the `LINES_PER_BLOCK = 4` cap with the `capped()` helper (`areas/spells/journal.ts:6-12`): professions first, then totems, then runes; a block appears only when non-empty, so no class lookup is needed (a non-DK has `runes === undefined`, a character with no totem has none). Tests go in `tools/journal-spells.test.ts` (120), not `journal.test.ts` (444). | coordinator ruling (P2-17) |
| SR3-spells-13 | spells-14 Files: `area.ts` "(`worldActs` gains `unlearnSkill`, `destroyTotem`)". | `destroyTotem` is already in `worldActs` (`h: areas/spells/area.ts:170`: `["cancelAura", "destroyTotem", "setActionButton"]`, spells-8 landed). spells-14 adds only `unlearnSkill`. The registry test checks each listed name is a function on the mock handle (`h: areas/registry.test.ts:31-34`). | coordinator ruling (P2-17) |
| SR3-spells-14 | spells-14 step 1: tool arguments. `do` enum is `["cast", "cancel_aura", "bar"]` (`h: areas/spells/tool.ts:19-22`). | `do` gains `unlearn_profession` and `destroy_totem`. New optional arguments: `confirm: boolean` (for `unlearn_profession`) and `element: "fire" \| "earth" \| "water" \| "air"` (for `destroy_totem`; wire slots fire 0, earth 1, water 2, air 3, `docs/areas/spells.md:19-24`). `spell` (existing) names the profession ("Mining") or takes a skill id; the tool resolves the name against `handle.spells.state().skills[].name`, so it needs no table import. `unlearn_profession` without `confirm: true` is `REFUSED` `needs_confirm` with `next` = the same call plus `confirm: true`; a non-profession is `REFUSED` `not_profession`; the act result `not_known` is `REFUSED`. `DONE` when the skill is gone from `state().skills` within 3 s, else `UNCONFIRMED` (`settle` helper, `areas/spells/tool-aura.ts:127-133`). `destroy_totem` with no totem in the element's slot is `REFUSED` `no_totem` (act result, SR2-spells-10); `DONE` when `state().totems[slot]` clears. `kind` stays `action`; `minimalArgs` stays the cast call; `expectSendKind(spellTool)` stays true. New flows go in `tool-skills.ts` (`skillsFlow`, `totemFlow`), called from `spellRun` (`tool.ts:70-76`). The `spellSpec.text` description (`h: areas/spells/tool.ts:110-121`) gains the two verbs in STE, under 60 words; quote the final text in the report (tool spec, contract 1.9). | coordinator ruling (P2-17) |
| SR3-spells-15 | spells-14 decision: `t4-spells-destroy-totem` "lands as a scenario only if spells-8 placed a totem live". spells-8 did not: `SMSG_TOTEM_CREATED` is `mock` and in `unseen` (`docs/areas/spells.md:258-263,313`; `areas/spells/opcodes.ts:40-44`). P2-6 now builds a shaman preset. | DESIGN answered: E3 accepted: the totem scenario waits for the shaman preset `eversong10-shaman` of T-11, and spells-14 depends on `T-11` (BR-wave3-5). The condition becomes: spells-14 makes the live try first. With a shaman preset in `soap-presets.ts`: GM-learn is unnecessary at level 4+ (the class knows Stoneskin Totem 8071 `[INFERENCE]`); stage `soap setup <ACCOUNT> items/add '{"item":5175,"count":1}'` offline (never `soap gm items`: that mails, SR2-spells-9) and `spells/learn 8071` if the spell is missing; run the existing `spells-totem` flow (`dev: probe-flows/spells-totem.ts`). Two tries, about 10 minutes. Live success: move `SMSG_TOTEM_CREATED` and `CMSG_TOTEM_DESTROYED` out of `unseen`, rewrite both proof rows and the "Left out" paragraph (`docs/areas/spells.md`, `docs/protocol-coverage/spells.md`; these are unit files, contract 0.9, and the edit is its own commit), add the scenario. Failure or no shaman preset: keep both in `unseen` and add the plan's bullet "- Place and remove a totem (`t4-spells-destroy-totem`, <reason>)." under "Not shown by any scenario" and no scenario file. Scenario spawn: blood elves cannot be shamans, so the preset is not Eversong; `spawnOf` returns `undefined` for a preset absent from `SPAWN_OF` and `startSlots` then adds no position step (`grader/spawn-slots.ts:248-256,267-272`), so the agent starts where the preset places it. No `field`, `partner: null`, no grid edit. Setup: `items/add` 5175 and `spells/learn` 8071 (idempotent). | coordinator ruling (P2-17) |
| SR3-spells-16 | spells-14 step 3: `t4-spells-unlearn-profession`, "whether `SetSkill(id, 0, 0, 0)` removes them could not be determined; ... `session` source if not". Staging uses the offline `spells/learn` 2575. | Check source is `truth`, evidence `{ "truth": ["spells"] }` (`spells` is a truth pick: `grader/scenario.schema.json:121`, `truth.ts:71`): "T final has none of the Mining spells 2575, 2580, 2656" (SR3-spells-6; the builder lists the profession's spells from `SkillLineAbility.dbc` for skill 186, present in `spell_data_dir`, and quotes them). The scenario exists only if SR3-spells-5 found that offline `spells/learn` 2575 gives skill 186; otherwise add the bullet "- Drop a profession (`t4-spells-unlearn-profession`, the offline spell setup does not give the skill and an eval has no GM step)." and no scenario. Preset `eversong10` (already in `scenarios.test.ts` `PRESETS`), `partner: null`, no `field` (no mobs), `navBound: false`, budget start 6 minutes, 12 tools, 6 turns. The `EVERSONG` grid takes it (F8). Task text, limit row and docs as the plan, one commit each (D15). | coordinator ruling (P2-17) |
| SR3-spells-17 | spells-14 deps `spells-7, spells-8, spells-12a, T-8a`. The runes journal lines need `SpellsState.runes` (spells-9), and the `JournalAfter` block lease follows `economy-8`. | Decision: `T-11` joins the dependencies of spells-14 (BR-wave3-5). Add dependencies `spells-9` and `lease:contract/details.ts` (chain `economy-8 → spells-14 → economy-10 → social-14`, per-block: spells-14 edits only the `JournalAfter` `spells` variant and waits for no other block holder). Drop the `lease:tools/journal.ts` and `lease:tools/params.ts` waits (none is listed in leaseDeps today; the plan row would otherwise add them). | coordinator ruling (P2-17) |
| SR3-spells-18 | spells-7 and spells-9 share `docs/areas/spells.md` (299), `docs/protocol-coverage/spells.md`, `opcodes.ts`, `store.ts` (246), `protocol.ts` (111), `area.ts` (73) and `cts: areas/spells.ts` (148). `runtime.ts` is 181. | Run serially (F11). All stay under 500 after both tasks (estimated `store.ts` about 330 with the skills and runes reads moved into `skills.ts`/`runes.ts`; keep the new logic in the new files, only the wiring in `store.ts`). spells-9 has no `runtime.ts` in its owner list and needs none (SR3-spells-10). spells-14 edits `docs/areas/spells.md` only for the rows of SR3-spells-15; the capability rows go in `docs/capabilities.md`/`docs/evals.md` (append-only shared files, contract 2.6). | coordinator ruling (P2-17) |

### Findings behind the SEED-3 rulings

1. Superseded by the coordinator decision (DBCs staged): the talent, glyph and skill files are staged; workers still never write into `spell_data_dir`. Draft text, kept as the no-file branch (P2-8 degraded ids): **F1. The DBC data source (P2-8).** The configured `spell_data_dir` is `/home/deity/code/peon/tmp/gameplay-data/raw` (`~/.config/peon/config.toml:10`). It holds `AreaTrigger`, `FactionTemplate`, `Lock`, `SkillLineAbility`, `Spell`, `SpellCastTimes`, `SpellCategory`, `SpellDifficulty`, `SpellDuration`, `SpellRadius`, `SpellRange` and nothing else. `Talent.dbc`, `TalentTab.dbc`, `GlyphProperties.dbc`, `GlyphSlot.dbc` and `SkillLine.dbc` are all absent. No copy exists elsewhere on the machine (a `find` for the four talent and glyph names across the filesystem finds none); the only source is the maintainer's client archives, which rules.md item 6 forbids workers to extract into `spell_data_dir`. AzerothCore's `data/sql/base/db_world/{talent,talenttab,glyphproperties,glyphslot,skillline}_dbc.sql` are empty override tables (no `INSERT`), useful only as column-layout evidence. Consequence: at run time and in every eval the talent catalog is absent and the talents tools run in degraded (ids) mode; the catalog path is proven only by packed-DBC unit tests. Affects: SR3-talents-1 to -5, -10, -21; SR3-spells-2.

2. **F3. `tools/params.ts` is a 17-line re-export facade.** `interactParams` lives in `h: tools/params-interact.ts` and `journalParams` in `tools/params-journal.ts`; `params.ts` is "coordinator only" (plan Leases row). The owner lists of `talents-4b` and `spells-14` name `tools/params.ts`; they are remapped (SR3-talents-18, SR3-spells-11).

3. **F5. `tools/journal.ts` is 472 non-blank lines.** `economy-8` edits it before `spells-14` and `economy-10` after. A pre-split moves the spells block out (SEED3 row B1) so `spells-14` never edits the file (SR3-spells-12).

4. **F6. `SpellsState` gains required fields.** `spells-7` adds `skills`, `spells-9` adds `runes`. Two typed literals of the state in other units' tests must get the empty value (field only, BR-wave2-2): `h: loops/combat-actions-observation.test.ts:233` (`totems: []` literal) and `h: tools/look-cast.test.ts:51`. Both builders may add `skills: []` / `runes: undefined` there and nothing else (SR3-spells-3, SR3-spells-10).

5. Superseded by the coordinator decision (DBCs staged): T-11 builds the shaman and death knight presets first (BR-wave3-5); spells-9 and spells-14 depend on it. Draft text, kept as the no-file branch (P2-8 degraded ids): **F7. The P2-6 class preset task is not in the index and not in the repo.** `packages/factory/src/soap-presets.ts:13-76` (nine `presetSpecs` entries, none shaman or death knight) and none is a shaman, death knight, priest, rogue, druid or warlock. `spells-9` (DK live try) and `spells-14` (totem scenario, shaman) need it. Both tasks carry a written fallback (mock and `unseen`; bullet and no scenario) so neither blocks; when the coordinator adds the preset task id to the index it should be added to the deps of `spells-9` and `spells-14` (SR3-spells-9, SR3-spells-15). Blood elves cannot be shamans, so a shaman preset is not an Eversong preset; see SR3-spells-15 for the spawn consequence.

6. **F8. Spawn grids.** `spawnOf` maps a preset to one fixed grid (`grader/spawn-slots.ts:161-167,248-256`); `run.ts:443-448` appends the slot `position` step after the scenario's own `setup`, so a scenario `position` step is overwritten. The `EVERSONG` grid has 49 points for 12 scenarios now (measured with a throwaway script over `ROUND_1`: 24 slots at replica 1 and 2). This pair of units adds three Eversong scenarios (`t4-spells-unlearn-profession`, `t8-talents-spend`, `t8-talents-glyph`): 15 of 24. Other wave-3 units add more; the coordinator totals them. `t8-talents-reset` needs a class trainer that the Eversong grid cannot reach (SR3-talents-19).

7. **F11. Order inside the units.** `spells`: spells-7 → spells-9 → spells-14 (all three edit `areas/spells/{protocol,store,runtime,area,opcodes}.ts` or the harness `area.ts`; `parallel.spells` stays empty; spells-14 also needs spells-9 for the runes journal line). `talents`: talents-2 → talents-3a → talents-4a → talents-5a on the core side (all four edit `areas/talents/{protocol,store,runtime,area}.ts` and `cts: areas/talents.ts`), and talents-3b → talents-4b / talents-5b on the harness side. Safe pairs: (talents-3b, talents-4a) and (talents-4b, talents-5a); never two tasks of the same side together.


## Staging for wave 3

| Task | Preset | Partners | Zone and spawn | GM staging |
|---|---|---|---|---|
| spells-7 (live) | `eversong10` | 0 | Fairbreeze spawn | first `soap setup <ACCOUNT> spells/learn '{"spell":2575}'` offline, then login and read `skills`; if no skill 186, `soap gm <ACCOUNT> learn 2575` online; `--flow spells-skill --arg unlearn=186`; delete the account |
| spells-9 (live try, then mock) | `eversong55-deathknight` of T-11 | 0 | the preset's own spawn | `soap gm <ACCOUNT> learn <spell with aura 249>` (found by a read-only scan of `Spell.dbc`), a rune-cost spell on a reachable target; delete the account; else mock (BR-wave3-6) |
| spells-14 (eval, plus totem try) | `eversong10` for `t4-spells-unlearn-profession`; `eversong10-shaman` of T-11 for `t4-spells-destroy-totem` | 0 | `eversong10` on the `EVERSONG` grid; the shaman preset on its own spawn (no grid entry) | scenario `setup` only (`spells/learn`, `items/add`); no `soap gm` inside an eval; the totem try uses `items/add` 5175 and `spells/learn` 8071 offline |
## COMPLETE

## Build rulings

| Id | Issue | Ruling | Status |
|---|---|---|---|
| BR-spells-12a-1 | spells-12a appends `"eversong10-mage"` to `PRESETS` in the shared `grader/scenarios.test.ts`, which its scenario needs; it also adds `packages/harness/test-support/spell-tool-fixtures.ts` and `tools/journal-spells.test.ts` | Accepted: an append-only preset line, and test files that serve only this unit's tool and its `journal.ts` lease | coordinator ruling (P2-17) |
| BR-spells-12a-2 | The TUI journal card (`ui/renderers/card.ts`) does not render the new aura and bar rows | Out of this task's scope; one follow-up renders every new journal field (bags and spells) | coordinator ruling (P2-17) |
| BR-spells-12b-1 | The fight loop cannot see a running channel: `CombatPort` has no spells access and `CombatActions` has no channel reader | spells-12b holds `loops/combat-actions.ts` and `loops/ports.ts` (and test files that build a `CombatPort` literal) for a channel reader and cancel; the `combat-actions.ts` lease then passes to combat-log-7b; no `game.ts` edit | coordinator ruling (P2-17) |
| BR-spells-2-1 | Round-5 review of spells-2, after four fix rounds: a channel that pushback shortens to zero is reported `interrupted` (`Spell.cpp:8147-8169`) | Coordinator ruling (P2-17): spells-2 lands. The case is recorded in `docs/areas/spells.md` "Left out", and a follow-up issue covers it. | coordinator ruling (P2-17) |
| BR-spells-14-1 | The journal's new profession, totem and rune lines also need the TUI card (`packages/harness/src/ui/renderers/card.ts`), which BR-spells-12a-2 left to an unnamed follow-up and no lease grants | Coordinator ruling (P2-17): spells-14 may add the professions, totems and runes blocks to `card.ts` (lines 277-296 in its diff) and their assertions in `card.test.ts`, nothing else in those files. |
