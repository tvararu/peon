# Protocol coverage: combat-log (key: combat-log)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design:
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md)
(section numbers such as "design 5.9" point into it).

The `combat-log` unit builds the code area `combatlog` (design 5.1,
5.9). It turns the server's combat log into facts: damage in and out,
heals, power gains, misses, immunities, dispels, spell effects, killing
blows and combo points. All 20 rows are server to client. 17 are
relevant: 5 are stubs today (`protocol/stubs.ts:23-26,54`) and 12 are
missing. 3 are dead (see the end). The area adds no verb (N23): the
facts reach the agent through a few `combatlog/*` log rows, the `engage`
result, the Jev observation and the vitals line.

- Worktree `proto-combat-log`, created with the command of contract 0.1;
  branch renamed to `proto/area-combat-log`. One task at a time.
- Phases (design 5.1): tasks 1, 6a, 6b, 7a and 7b in wave 1; tasks 2
  and 3 in wave 2 (parties and raids); tasks 4, 5 and 8 in wave 4 (long
  tail). No task is in wave 3.
- Task ids are `combat-log-<n>` (contract 0.10). Tasks 6 and 7 are each
  split into `a` and `b`, each with its own test cycle. A dependency on
  `combat-log-6` or `combat-log-7` means its `b` part.
- Owned paths (contract 2.5): `packages/core/src/wow/areas/combatlog/*`,
  `packages/core/test-support/areas/combatlog.ts`,
  `packages/harness/src/areas/combatlog/*` (the seeded `area.ts`, its
  test, and sibling rule files), `packages/devtools/src/probe-flows/combatlog-*.ts`,
  `docs/areas/combatlog.md`, `docs/protocol-coverage/combatlog.md`
  (regenerated only).
- Core paths without a package prefix are under `packages/core/src/wow/`;
  harness paths without a prefix are under `packages/harness/src/`.
  AzerothCore paths are relative to `src/server/game/` at `9d4e36d81`
  (contract 0.5). Peon lines are at `71fba0ab`; after item 6 the builder
  re-reads them.
- Every live proof in this unit runs on a character without `.cheat god`
  and without GM mode. God mode moves damage into absorb on the wire
  (`Entities/Unit/Unit.cpp:6644-6651`, `:6577-6581`), and a GM character
  takes no fall damage (`Entities/Player/Player.cpp:14189`).

## Contract issues

These are gaps found while planning. The contract is not changed; the
coordinator decides each one.

1. **`SMSG_POWER_UPDATE` has no write path into the entity store.** The
   design writes the value into the unit's `UNIT_FIELD_POWER1 + power`
   raw field through `EntityStore.update` (`entity-store.ts:189-217`), so
   `combatUnitOf` reads it (`combat-unit.ts:23-30`) and the store emits
   its `update` event. The area gets `SessionDeps` and `CoreStores`
   only. `CoreStores` holds no entity store (`session-stores.ts:24-37`),
   and `SessionDeps` exposes only `getEntity` (`session-stores.ts:20-21`).
   Setting `entity.rawFields` through `getEntity` would skip the `update`
   event. Options: a `COORD-<n>` commit that adds one entity write (for
   example `updateEntity: EntityStore["update"]`) to `SessionDeps` or to
   `LegacyViews`, or a lease that lets the task register the opcode in a
   legacy entity handler. The coordinator makes the edit before SEED-1,
   or task 6b takes its fallback: it registers the handler, keeps
   `{ guid, power, value, at }` per unit in area state, deletes the stub,
   proves the opcode live, and lists the entity write under "Left out" in
   `docs/areas/combatlog.md` as a named gap. The builder records the
   deviation. No opcode task depends on 6b or 7b (only task 8 depends on
   7b), so neither can stop the opcode tasks.
2. **`fight/end` totals cross a frozen file.** `fightEnd`
   (`events/rules-combat.ts:236-262`) sees only `RuleInput`, which has no
   handle (`events/rules.ts:6-13,23-32,75`). Totals need one new
   `RuleLookup` member (for example `combatTotals(since: number)`), which
   edits `events/rules.ts` and `lookupFor` in `events/router.ts:134`; the
   router is frozen after S0-5 (contract 2.3). Options: a `COORD-<n>`
   commit that adds the lookup member, or the design is amended so that
   the area's own rule writes a `combatlog/fight` row from owned files
   (the store then emits a `fight_closed` event on the first entry or
   read after the 6 s gap). The coordinator makes the `COORD` edit before
   SEED-1, or task 7b takes its fallback, which is the builder's default
   when the edit is absent at task start: an owned
   `areas/combatlog/runtime.ts` arms one timer after each kept entry that
   involves the character and, after 6 s of quiet, calls
   `store.closeFight()`, which emits `fight_closed` with the totals; the
   harness rule writes one `log` row `combatlog/fight` (`Fight over:
   dealt 312, took 145 (1 dodge, 1 resist).`). The runtime waits with
   `ctx.until(..., { timeoutMs: 6000, signal })` on the store's `entry`
   events, so the wait ends with the session (contract 1.3), and
   `fight_closed` is appended to `eventTypes` in `areas/combatlog/area.ts`.
   The store itself still arms no timer (contract 1.2). The builder records the deviation.
3. **The Jev lease names the wrong files.** Contract 2.7 lists
   `jev/*` for the observation. The observation is built in
   `CombatActions.observe` (`loops/combat-actions.ts:105-147`) with
   helpers in `loops/combat-actions-observation.ts`; candidates come from
   `spellAction` and `addCandidates` in the same class
   (`loops/combat-actions.ts:106-112`); the deps object is built at
   `loops/game.ts:122`. Task 7b needs the lease on those three files.
4. **`VitalsView.comboPoints` touches files with no combat-log lease.**
   D13 names the change, but the `tools/look.ts` lease list omits
   `combat-log`. The type is `VitalsView` (`contract/views.ts:26-32`); it
   is built by `vitalsView` (`ops/views.ts:139-150`); the `[now]` line is
   `events/now.ts:52`; the footer is `ui/footer.ts`. Task 7b needs a lease
   on `ops/views.ts`, `events/now.ts`, `ui/footer.ts` and the
   `VitalsView` block of `contract/views.ts`.
5. **The engage tally lease.** Contract 2.7 lists `tools/engage*.ts` for
   `combat-log`. Task 7b edits `tools/engage-tally.ts` (the `Tally` type,
   `tools/engage-tally.ts:17-27`, and its view at `:241-250`) and the
   `EngageAfter` block of `contract/details.ts` (D13). The renderer that
   prints the `engage` result line could not be determined from a quick
   read; the builder names it in its report and it falls under the same
   `tools/engage*.ts` lease only if it lives there.
6. **The ticker has no lease.** Task 8 edits `ui/ticker.ts`
   (`TickerSource`, `tickerLines`, `createTicker`, `:15-120`) and the
   source list built at `ui/install.ts:144`. Neither is in contract 2.7.
7. **Log row names.** Design 5.9 names the rows:
   domain `combatlog`, events `combatlog/immune`,
   `combatlog/killing_blow`, `combatlog/environmental`,
   `combatlog/dispelled` and `combatlog/heal_in`, not `combat/*`. The
   router sets the domain and event from the area rule (contract 1.9).
8. **Coverage reads `GameOpcode.<NAME>` literally**
   (`packages/core/test-support/protocol-coverage.ts:28`). Every
   registration in `areas/combatlog/area.ts` writes `GameOpcode.SMSG_...`
   in full.

Leases this unit needs in the plan index (contract 2.7), in build order:

| Task | Legacy file | Edit |
|---|---|---|
| combat-log-1 | `combat-store.ts` and its test | add `noteHostileDamage(guid)` |
| combat-log-6b | the entity write of issue 1 | `COORD` edit or lease, as ruled |
| combat-log-7b | `events/rules-combat.ts` | `fight/end` totals (after the `COORD` of issue 2) |
| combat-log-7b | `tools/engage-tally.ts`, the `EngageAfter` block of `contract/details.ts` (D13) | tally fields and the result line |
| combat-log-7b | `loops/combat-actions.ts`, `loops/combat-actions-observation.ts`, `loops/game.ts` | the Jev `combatLog` block and the immune filter |
| combat-log-7b | `contract/views.ts` (`VitalsView`), `ops/views.ts`, `events/now.ts`, `ui/footer.ts` | `comboPoints` |
| combat-log-8 | `ui/ticker.ts`, `ui/install.ts` | the human-only damage line |

---

## Task combat-log-1: Combat log store, melee and spell damage

Rulings: SR1-combat-log-8, SR1-combat-log-9, SR1-combat-log-10 (section "Seed rulings (SEED-1)").

**codeArea:** `combatlog`. **Phase:** 1. **Size:** M.

**Files:**

- Create: `packages/core/src/wow/areas/combatlog/protocol.ts` and
  `protocol.test.ts`; `areas/combatlog/store.ts` and `store.test.ts`;
  `areas/combatlog/area.test.ts`;
  `packages/core/test-support/areas/combatlog.ts`;
  `packages/devtools/src/probe-flows/combatlog-fight.ts`;
  `docs/areas/combatlog.md`.
- Modify (owned): `areas/combatlog/area.ts` (the seed),
  `areas/combatlog/opcodes.ts` (delete two `stubs` lines; check `dead`),
  `packages/harness/src/areas/combatlog/area.ts` and its test,
  `docs/protocol-coverage/combatlog.md` (regenerated).
- Modify (lease): `combat-store.ts` and `combat-store.test.ts`.

**Depends on:** item6, S0-5, SEED-1 (seeds `combatlog` in wave 1), T-2
(tap), T-3 (probe), T-4 (cite-check).

**Opcodes:** `SMSG_ATTACKERSTATEUPDATE` (stub),
`SMSG_SPELLNONMELEEDAMAGELOG` (stub).

**Steps:**

1. **Failing tests first.**
   - `areas/combatlog/protocol.test.ts`, bodies from
     `test-support/areas/combatlog.ts`:
     - `parseAttackerState`, built from `Entities/Unit/Unit.cpp:6661-6720`:
       (a) a plain hit, `count` 1, no flags; (b) a partial absorb with
       `count` 1 (`HITINFO_PARTIAL_ABSORB`); (c) a two-part swing, `count`
       2, with both absorb and resist flags, so both arrays hold two
       `u32` (`:6677-6691`; AzerothCore wins over
       `combat/smsg_attackerstateupdate_3_3_5.wowm:64-99`, which reads one
       of each); (d) `HITINFO_BLOCK` reads `blocked`; (e)
       `HITINFO_RAGE_GAIN` (0x800000) reads one extra `u32`, and
       `UNK19` (0x80000) alone reads none (`:6700-6701`); (f) `HITINFO_UNK1`
       reads and drops the 12-field block (`:6704-6717`). After the parts
       and arrays: `u8` victim state, `u32` unknown, `u32` melee spell id
       (`:6693-6695`). A short body throws.
     - `parseSpellDamage`, built from `Unit.cpp:6470-6483`: school is a
       mask `u8` (`:6476`), `hitFlags` are `SPELL_HIT_TYPE_*`
       (`src/server/shared/SharedDefines.h:1539-1544`), `crit` is
       `hitFlags & 0x2`, `split` is `& 0x8`; the trailing debug byte is
       read and ignored.
   - `areas/combatlog/store.test.ts`: an entry whose source or target is
     the character, its pet (`SUMMONEDBY` or `CREATEDBY` equal to the
     character, `protocol/update-fields.ts:64-65`), a party member (from
     `ctx.legacy.party()` or `core`), or a unit in the current fight is
     kept; a stranger's entry is dropped and counted in `dropped`; the
     ring keeps the last 500; a miss with no damage is still one entry;
     the fight window opens on the first entry that involves the
     character after 6 s of quiet and is reported closed on the next
     entry or `snapshot()` after 6 s (computed from `deps.now()`, no
     timer, contract 1.2); totals sum `dealt`, `taken`, `healed`, misses
     by outcome and crits.
   - `areas/combatlog/area.test.ts` with `areaRig("combatlog")`: an
     injected swing and an injected spell hit each emit one `entry`
     event and change `handle.state().entries`.
   - `combat-store.test.ts`: `noteHostileDamage(guid)` for a unit not in
     the attacker set adds it and emits `attacked` once; a second call
     emits nothing.
   - Harness `areas/combatlog/area.test.ts`: an `entry` event writes no
     row (the flood guard, G17).
   Each fails today: the modules do not exist, the opcodes are stubs, and
   `CombatStore` has no such method.
2. **Implementation.**
   - `areas/combatlog/protocol.ts`:
     - `parseAttackerState` returns `{ hitInfo, attacker, target, total,
       overkill, parts, absorbed, resisted, victimState, meleeSpellId,
       blocked?, rageGain?, crit, miss, glancing, crushing, offhand }`.
       `parts` is `{ schoolMask, amount }[]` (the `u32` of each part; the
       `f32` is read and dropped). `absorbed` and `resisted` hold one
       `u32` per part when their flags are set (absorb 0x20 or 0x40,
       resist 0x80 or 0x100), else `[]`. Derived flags: `crit` 0x200,
       `miss` 0x10, `glancing` 0x10000, `crushing` 0x20000, `offhand`
       0x4. `victimState` is a word from the victim state list
       (`dodge`, `parry`, `evade`, `immune`, ...;
       `Entities/Unit/Unit.h:83-94`).
     - `parseSpellDamage` returns `{ target, attacker, spellId, amount,
       overkill, schoolMask, absorbed, resisted, physical, blocked,
       hitFlags, crit, split }`.
     - The full `SPELL_MISS_*` list (`SharedDefines.h:1523-1534`),
       exported as `SPELL_MISS_NAMES`; core defines only
       `SPELL_MISS_REFLECT` today (`protocol/spell.ts:29`).
     The builder checks each `HITINFO_*` value against
     `Entities/Unit/Unit.h` before the fixtures use it.
     Parsers read `packedGuidBig()` where the writer writes a packed guid.
   - `areas/combatlog/store.ts`: `CombatlogStore` with `snapshot()`,
     `onEvent`, `dispose`, and `receive(entries)`. It defines the full
     kind union now, so later tasks only add parsers: `melee`,
     `spell_damage`, `periodic_damage`, `damage_shield`, `environmental`,
     `instakill`, `heal`, `periodic_heal`, `energize`, `periodic_power`,
     `miss`, `immune`, `dispel`, `dispel_failed`, `steal`, `execute`,
     `kill`. `CombatlogEntry = { at, kind, source, target, spellId?,
     amount, over?, schoolMask?, absorbed?, resisted?, blocked?, crit?,
     outcome?, power?, extra? }`. State
     `CombatlogState = { entries, fight, lastFight, immunities,
     comboPoints, kills, dropped }`, where `fight` and `lastFight` are
     `FightTotals | undefined`, `immunities` is
     `{ entry, spellId, at }[]` (empty until combat-log-3),
     `comboPoints` is `undefined` until combat-log-6a, and `kills` is `[]`
     until combat-log-6a. Events (`CombatlogEvent`): `{ type: "entry", ... }`
     with the entry's fields spread flat (strings, numbers and guids
     only, contract 1.2); `combo_points` and `kill` are declared now and
     emitted from 6a. A damage entry whose target is the character and
     whose source is not a known attacker calls
     `core.combat.noteHostileDamage(source)` (design 5.9 "Decisions").
   - `combat-store.ts` (lease): `noteHostileDamage(guid)`, next to the
     `SMSG_ATTACKSTART` path (`combat-store.ts:336-343`).
   - `areas/combatlog/area.ts`: `combatlogArea` with the store,
     `eventTypes: ["entry", "combo_points", "kill"]`, and `register` with
     `wire.on(GameOpcode.SMSG_ATTACKERSTATEUPDATE, ...)` and
     `wire.on(GameOpcode.SMSG_SPELLNONMELEEDAMAGELOG, ...)`. No runtime,
     no acts.
   - `areas/combatlog/opcodes.ts`: delete the two `stubs` lines. `dead`
     holds `SMSG_PROCRESIST`, `SMSG_FEIGN_DEATH_RESISTED` and
     `SMSG_HEALTH_UPDATE`; if the seed left one out, add it.
   - Harness `areas/combatlog/area.ts`:
     `rules: () => ({ event: () => [] })` until combat-log-7a;
     `worldActs: []`. The world service gets the read view
     `session.areas.combatlog` from step 0 (N5) with no code here.
   - `test-support/areas/combatlog.ts`: `combatlogAttackerStateBody`,
     `combatlogSpellDamageBody`.
   - Probe flow `combatlog-fight`, in the shape of `probe-flows/nearest.ts`
     (T-3; the exact flow signature could not be determined before T-3
     lands): args `spell=<id>` (optional). It walks to the nearest hostile
     creature, starts melee, casts the spell when given, and waits until
     the creature dies or 90 s pass.
   - `docs/areas/combatlog.md` with the fixed headings of contract 3.8:
     "Wire notes" (the six AzerothCore and wowm disagreements of design
     5.9, each with both citations), "Left out" (every owned opcode with
     the task that builds it, and the three dead rows),
     "Capabilities row": "No verb (N23)", and the Proof table with rows
     for this task and the three `dead` rows.
3. **Checks.** `mise test` on each test file, `mise typecheck core`,
   `mise typecheck harness`, `mise protocol:coverage`,
   `mise protocol:cite-check`, `mise ci:checks`.

**Proof (live):** `mise factory soap create` an `eversong10-mage`
account. `mise protocol:probe <ACCOUNT> --flow combatlog-fight --arg
spell=133 --expect SMSG_ATTACKERSTATEUPDATE --expect
SMSG_SPELLNONMELEEDAMAGELOG --bodies` (Fireball rank 1 is spell 133 [I];
the builder confirms it in the probe's `login` output). Exit 0 and trace
outcome `handled` for 0x14A and 0x250 are the evidence; the bodies must
show a swing in each direction. Add one captured two-part swing as a
fixture if the trace holds one. Delete the account. Then rerun
`t3-ghostlands-kill` and `t7-halt-resume` (the "Combat and Jev" row of
`docs/evals.md`; N23, contract 3.6): `t7-halt-resume` passes or fails
only with the known stale-wake cause, and `t3-ghostlands-kill` shows no
failure cause the R0 baseline did not show. Record the verdicts.

**Commit:**

```
feat: Read melee and spell damage logs

Every fight sent melee and spell damage logs that core dropped as not
implemented. A combat log store now keeps the entries that involve the
character, and damage from a caster that never swung marks it as an
attacker.
```

---

## Task combat-log-6a: Kill log and combo points

Rulings: SR1-combat-log-8, SR1-combat-log-11 (section "Seed rulings (SEED-1)").

**codeArea:** `combatlog`. **Phase:** 1. **Size:** S.

**Files:** `areas/combatlog/protocol.ts`, `protocol.test.ts`,
`areas/combatlog/store.ts`, `store.test.ts`, `areas/combatlog/area.ts`,
`area.test.ts`, `areas/combatlog/opcodes.ts` (`unseen`),
`packages/core/test-support/areas/combatlog.ts`,
`docs/areas/combatlog.md`, `docs/protocol-coverage/combatlog.md`.

**Depends on:** combat-log-1.

**Opcodes:** `SMSG_PARTYKILLLOG`, `SMSG_UPDATE_COMBO_POINTS`.

**Steps:**

1. **Failing tests.**
   - `protocol.test.ts`: `parsePartyKill` reads two `u64`
     (`Entities/Unit/Unit.cpp:13583-13585`). `parseComboPoints` reads a
     packed guid and a `u8` (`Unit.cpp:12854-12857`); a packed guid of 0
     (the single 0 byte of `:12851`) gives `target: undefined`.
   - `area.test.ts` (`areaRig("combatlog")`): a kill by the character
     emits `kill` with `bySelf: true` and adds one entry of kind `kill`;
     the list keeps the last 20; a kill of the character's current target
     by another player gives `bySelf: false`, `ourTarget: true` and
     `killerKind: "player"`. Combo points `3` on a target emit
     `combo_points` and set `state().comboPoints`; `0` with no target
     clears it.
   It fails because neither opcode has a handler.
2. **Implementation.** Two parsers; `wire.on(GameOpcode.SMSG_PARTYKILLLOG,
   ...)` and `wire.on(GameOpcode.SMSG_UPDATE_COMBO_POINTS, ...)`. The kill
   event carries `killer`, `victim`, `at`, `bySelf`, `ourTarget` and
   `killerKind` (`self`, `pet`, `player`, `creature` or `unknown`, from
   `deps.getEntity`). `ourTarget` reads the character's current target
   from the core stores; the exact member could not be determined (the
   builder finds it in `combat-store.ts` or `self-store.ts` and reads it
   through its existing entry point). Combo points belong to the
   character only; the pet form is `pets`' `SMSG_PET_UPDATE_COMBO_POINTS`.
   Builders `combatlogPartyKillBody`, `combatlogComboPointsBody`.
   `SMSG_UPDATE_COMBO_POINTS` goes into `unseen` unless proven live.
3. `mise protocol:coverage`; two Proof rows.

**Proof:** `SMSG_PARTYKILLLOG` live: the `combatlog-fight` flow on an
`eversong10-warrior` account, `--expect SMSG_PARTYKILLLOG`; exit 0 and
outcome `handled` for 0x1F5. `SMSG_UPDATE_COMBO_POINTS` mock, not seen
live: no rogue or druid preset exists (`docs/factory.md` presets), and
`soap gm` cannot change a class (design 4.3). The rig test body is built
from `Entities/Unit/Unit.cpp:12854-12857`. Delete the account. The Proof
row says the maintainer can add a rogue preset for a live proof (design
5.9 "Needs the maintainer").

**Commit:**

```
feat: Read kill logs and combo points

Each kill sent a party kill log that core ignored, and a rogue had no way
to know its combo points. The store now keeps recent kills with their
killer and the character's combo points.
```

---

## Task combat-log-6b: Power updates

Rulings: SR1-combat-log-1, SR1-combat-log-8, SR1-combat-log-11 (section "Seed rulings (SEED-1)").

**codeArea:** `combatlog`. **Phase:** 1. **Size:** S.

**Files:** `areas/combatlog/protocol.ts`, `protocol.test.ts`,
`areas/combatlog/area.ts`, `area.test.ts`, `areas/combatlog/opcodes.ts`
(delete one `stubs` line), `packages/core/test-support/areas/combatlog.ts`,
`docs/areas/combatlog.md`, `docs/protocol-coverage/combatlog.md`;
`areas/combatlog/store.ts` and `store.test.ts` under the fallback of
contract issue 1; the file of the entity-write ruling only if the ruling
is a lease.

**Depends on:** combat-log-6a. Uses the `COORD` edit or lease of
contract issue 1 if present at task start; otherwise the fallback of
that issue.

**Opcodes:** `SMSG_POWER_UPDATE` (stub).

**Steps:**

1. **Failing test.** `protocol.test.ts`: `parsePowerUpdate` reads a
   packed guid, a `u8` power and a `u32` value
   (`Entities/Unit/Unit.cpp:12015-12019`). `area.test.ts`
   (`areaRig("combatlog")` with a known unit in the entity store): the
   packet sets raw field `UNIT_FIELDS.POWER1.offset + power`
   (`protocol/update-fields.ts:71`) to the value, the entity store emits
   one `update` event, and `combatUnitOf` reads the new power; a packet
   for an unknown guid changes nothing. It fails because the opcode is a
   stub.
2. **Implementation.** `wire.on(GameOpcode.SMSG_POWER_UPDATE, ...)`
   writes through the entity write that the ruling provides. The value
   does not go into the log ring (design 5.9 "Store and events"). Delete the
   `SMSG_POWER_UPDATE` `stubs` line. Builder `combatlogPowerUpdateBody`.
3. `mise protocol:coverage`; one Proof row.

**Proof (live):** the `combatlog-fight` flow on an `eversong10-mage`
account with `--arg spell=133 --expect SMSG_POWER_UPDATE`; exit 0 and
outcome `handled` for 0x480. Delete the account. Rerun
`t3-ghostlands-kill` (N23): no new failure cause against the R0 baseline.

**Commit:**

```
feat: Apply power updates to units

The server sends a power update with every mana or rage change, and core
showed it as not implemented. The value now reaches the unit's power
field at once instead of with the next object update.
```

---

## Task combat-log-7a: Immunity and killing blow rows

Rulings: SR1-combat-log-7 (section "Seed rulings (SEED-1)").

**codeArea:** `combatlog`. **Phase:** 1. **Size:** S.

**Files:** `packages/harness/src/areas/combatlog/area.ts` and
`area.test.ts`; create `packages/harness/src/areas/combatlog/rules.ts`
and `rules.test.ts` if `area.ts` passes 200 lines;
`docs/areas/combatlog.md`.

**Depends on:** combat-log-6a.

**Opcodes:** none.

**Steps:**

1. **Failing tests** (harness, with the mock handle's
   `triggerAreaEvent("combatlog", ...)`, contract 1.8):
   - An `entry` of kind `immune` (or `miss` with reason `IMMUNE`, or
     melee outcome `immune`) writes one `log` row `combatlog/immune`,
     text like `Mottled Boar is immune to spell 122.` (the unit name from
     `rc.lookup.unitName`; `RuleInput` has no spell name lookup,
     `events/rules.ts:23-32`, so the text carries the spell id); the same creature
     entry and spell again writes nothing.
   - A `kill` with `ourTarget: true` and `killerKind` `player` or `pet`
     writes one `log` row `combatlog/killing_blow`; a kill by the
     character writes nothing (the `combat/kill_credit` path keeps it).
   - Any other `entry` writes nothing (flood guard).
   They fail because the rule returns `[]` for every event.
2. **Implementation.** `rules: () => {...}` builds the rule closure; the
   once-per-session set of `(entry, spellId)` lives in that closure, never
   in `RuleMemo` (that would edit `events/rules.ts`). Names from design
   5.9 (contract issue 7). Later opcode tasks add their own rows here:
   `heal_in` (combat-log-2), `environmental` (combat-log-3), `dispelled`
   (combat-log-4).
3. `mise test` on the harness test, `mise typecheck harness`,
   `mise ci:checks`.

**Proof (eval):** rerun `t3-ghostlands-kill` with `--packet-trace
headers` (N18). Count `combatlog/*` rows per fight and journal rows per
turn in the run's game log, and record the counts in the report and the
Proof section of `docs/areas/combatlog.md` as text (design 3.10: the
first high-rate areas measure the flood guard). No new failure cause
against the R0 baseline.

**Commit:**

```
feat: Log immunities and killing blows

The agent kept casting spells a creature was immune to and never learned
who stole a kill. Two quiet log rows now record each immunity once and a
killing blow on the character's target by someone else.
```

---

## Task combat-log-7b: Fight totals, Jev and combo points

Rulings: SR1-combat-log-2, SR1-combat-log-3, SR1-combat-log-4, SR1-combat-log-5, SR1-combat-log-6 (section "Seed rulings (SEED-1)").

**codeArea:** `combatlog`. **Phase:** 1. **Size:** M.

**Files:** under leases: `events/rules-combat.ts` and its test;
`tools/engage-tally.ts` and its test, the `EngageAfter` block of
`contract/details.ts`; `loops/combat-actions.ts`,
`loops/combat-actions-observation.ts`, `loops/game.ts` and their tests;
the `VitalsView` block of `contract/views.ts`, `ops/views.ts`,
`events/now.ts`, `ui/footer.ts` and their tests. Owned:
`docs/areas/combatlog.md`.

**Depends on:** combat-log-7a, the leases of contract issues 3, 4 and
5. Uses the `COORD` edit of contract issue 2 if present at task start;
otherwise the fallback of that issue (then `events/rules-combat.ts` is
not touched, and the task also owns `areas/combatlog/runtime.ts`, its
test, and the harness rule).

**Opcodes:** none.

**Steps:**

1. **Failing tests.**
   - `events/rules-combat.test.ts`: `fight/end` data gains `dealt`,
     `taken`, `healed` and `misses` from the combat log since the fight
     started, and its text reads like `Fight over: dealt 312, took 145
     (1 dodge, 1 resist).`
   - `tools/engage-tally.test.ts`: the tally gains `dealt`, `taken`,
     `healed`, `avoided` (`CodeWord[]` of the character's misses and the
     target's dodges, parries and blocks) and `immune` (spell names); the
     result line reads like `Dealt 312, took 145; avoided: dodge x1;
     immune: <spell name>.` (names from the character's own spell
     definitions, which the engage loop already reads)
   - `loops/combat-actions-observation.test.ts`: the
     observation gains a `combatLog` block (damage taken in the last 6 s
     by source and school mask, own misses in the last 6 s, the target's
     known immunities, combo points); a spell in the target entry's
     immunities is not a candidate and counts as cast error word
     `immune` in the tally (`tools/engage-tally.ts:23`).
   - `ops/views.test.ts` and the footer or `[now]` test: `comboPoints` is
     shown as `CP 3` when above 0 and absent at 0.
   They fail because nothing reads the combat log yet.
2. **Implementation.** Each surface reads `handle.combatlog.state()`
   (the step-0 sub-handle). Totals are summed from `entries` with
   `at >= fight start`, in a harness helper that the tally and the
   `fight/end` rule share; the `fight/end` row follows the tactics run,
   not the store's own window. `fightEnd` reads it through the
   `RuleLookup` member of contract issue 2. The Jev deps at
   `loops/game.ts:122` gain a reader of the combat log state. The immune
   drop is harness policy, not a core refusal.
3. `mise test` on each touched test file, `mise typecheck harness`,
   `mise ci:checks`.

**Proof (eval):** rerun `t3-ghostlands-kill` and `t7-halt-resume` (N23,
contract 3.6). The `t3-ghostlands-kill` game log must show `fight/end`
rows with totals (or `combatlog/fight` rows under the fallback of
contract issue 2) and an `engage` result with the damage line, and no
failure cause the R0 baseline did not show; `t7-halt-resume` passes or
fails only from the known stale wake. No new scenario and no
`docs/capabilities.md` row (R9, N23). The combo point line is unit-tested
only until a rogue preset exists.

**Commit:**

```
feat: Show fight totals and combo points

Fights ended with no word on damage dealt or taken, and Jev tried spells
the target was immune to. Fight results now carry totals, Jev skips
known immunities, and the vitals line shows combo points.
```

---

## Task combat-log-2: Heals, power gains and ticks

**codeArea:** `combatlog`. **Phase:** 2. **Size:** S.

**Files:** `areas/combatlog/protocol.ts`, `protocol.test.ts`,
`areas/combatlog/area.ts`, `area.test.ts`, `areas/combatlog/opcodes.ts`
(delete one `stubs` line; `unseen`),
`packages/core/test-support/areas/combatlog.ts`,
`packages/harness/src/areas/combatlog/area.ts` (or `rules.ts`) and test,
`docs/areas/combatlog.md`, `docs/protocol-coverage/combatlog.md`; create
`packages/devtools/src/probe-flows/combatlog-use.ts`.

**Depends on:** combat-log-1, combat-log-7a.

**Opcodes:** `SMSG_SPELLHEALLOG` (stub), `SMSG_SPELLENERGIZELOG`,
`SMSG_PERIODICAURALOG`.

**Steps:**

1. **Failing tests.**
   - `protocol.test.ts`: `parseSpellHeal` (packed victim, packed caster,
     spell, heal, overheal, absorb, crit `u8`, unused `u8`;
     `Entities/Unit/Unit.cpp:8098-8107`); `parseSpellEnergize` (packed
     victim, packed caster, spell, power `u32`, amount `u32`;
     `Unit.cpp:8128-8134`); `parsePeriodicAuraLog` with one fixture per
     aura family from `Unit.cpp:6563-6606`: damage types 3 and 89
     (amount, overkill, school mask `u32`, absorb, resist, crit `u8`;
     `:6583-6588`; AzerothCore wins over `spell/spell_common.wowm:35`,
     which reads a `u8` school), heal types 8 and 20 (`:6593-6596`),
     power types 21 and 24 (`:6600-6601`), mana leech 64 (power, amount,
     `f32` multiplier, `:6604-6606`). Any other aura type throws (AC
     sends none, `:6608-6610`).
   - `area.test.ts`: each opcode emits the matching `entry` kinds
     (`heal`, `energize`, `periodic_damage`, `periodic_heal`,
     `periodic_power`) and totals count heals.
   - Harness: `heal`/`periodic_heal` entries on the character from
     another unit write one `passive` row `combatlog/heal_in`: the first
     heal from a healer writes the row (`<healer> heals you for 540.`,
     name from `rc.lookup.unitName`), and later heals from the same
     healer within 10 s write nothing. The rule is called per event and
     arms no timer; the last-row time per healer lives in the rule
     closure. Self-heals write nothing.
   They fail because the opcodes have no handler.
2. **Implementation.** Three parsers, three `wire.on(GameOpcode.SMSG_...)`
   lines, the `SMSG_SPELLHEALLOG` `stubs` line deleted, builders
   `combatlogSpellHealBody`, `combatlogSpellEnergizeBody`,
   `combatlogPeriodicAuraLogBody`.
   Probe flow `combatlog-use`: args `item=<id>` or `spell=<id>`; it uses
   the item from the bags, or casts the spell on the character, then
   waits 10 s.
3. `mise protocol:coverage`; three Proof rows.

**Proof (live):** `soap create` an `eversong10-mage` account and, while it
is offline, `mise factory soap setup <ACCOUNT> items/add` a Minor Healing
Potion (item 118) and a Minor Mana Potion (item 2455) [I: ids from the
design, the builder confirms them]. Do not use `soap gm items`,
which mails them. Then `mise protocol:probe <ACCOUNT> --flow
combatlog-use --arg item=118 --expect SMSG_SPELLHEALLOG` and the same with
`item=2455 --expect SMSG_SPELLENERGIZELOG`. For `SMSG_PERIODICAURALOG`:
the `combatlog-fight` flow with `spell=133 --expect
SMSG_PERIODICAURALOG --bodies` (Fireball rank 1 leaves a damage over
time [I]); an `eversong10-hunter` with Serpent Sting is the fallback
[I]. The heal and power tick families are mock from `Unit.cpp:6593-6606`
unless a live tick shows them; that family is noted "not seen live" in
its Proof row text. Delete the account. Rerun `t3-ghostlands-kill`
(N23).

**Commit:**

```
feat: Read heal, energize and tick logs

Heals, power gains and damage over time ticks reached core as noise, so
the agent could not tell who healed it. The store now keeps them, and
heals from others show as one grouped row per healer.
```

---

## Task combat-log-3: Misses, immunity, shields, environment, instakill

**codeArea:** `combatlog`. **Phase:** 2. **Size:** M.

**Files:** `areas/combatlog/protocol.ts`, `protocol.test.ts`,
`areas/combatlog/store.ts`, `store.test.ts`, `areas/combatlog/area.ts`,
`area.test.ts`, `areas/combatlog/opcodes.ts` (`uses`, delete one `stubs`
line, `unseen`), `packages/core/test-support/areas/combatlog.ts`,
`packages/harness/src/areas/combatlog/area.ts` (or `rules.ts`) and test,
`docs/areas/combatlog.md`, `docs/protocol-coverage/combatlog.md`.

**Depends on:** combat-log-2.

**Opcodes:** `SMSG_SPELLLOGMISS`, `SMSG_SPELLORDAMAGE_IMMUNE`,
`SMSG_SPELLDAMAGESHIELD`, `SMSG_ENVIRONMENTAL_DAMAGE_LOG` (stub),
`SMSG_SPELLINSTAKILLLOG` (5). It also peeks `SMSG_SPELL_GO`, which it
does not own.

**Steps:**

1. **Failing tests.**
   - `protocol.test.ts`: `parseSpellMiss` (spell `u32`, caster `u64`, `u8`,
     count `u32`, then target `u64` and reason `u8`;
     `Entities/Object/Object.cpp:3832-3841`); `parseSpellImmune` (caster
     `u64`, target `u64`, spell, debug `u8`; `Entities/Unit/Unit.cpp:6628-6633`);
     `parseDamageShield` (shield owner `u64`, attacker `u64`, spell,
     damage, overkill, school mask `u32`; `Unit.cpp:2179-2187`;
     AzerothCore wins over `spell/smsg_spelldamageshield.wowm:20-28`,
     whose last field is a school index); `parseEnvironmentalDamage`
     (victim `u64`, type `u8` 0-5, amount, resisted, absorbed;
     `Server/Packets/CombatLogPackets.cpp:22-28`; AzerothCore wins over
     `combat/smsg_environmentaldamagelog.wowm:12-18`, which puts absorb
     first); `parseInstakill` (caster `u64`, target `u64`, spell;
     `Spells/SpellEffects.cpp:294-298`).
   - `store.test.ts`: `immune` entries, melee outcome `immune`, and
     `miss` entries with reason `IMMUNE` or `IMMUNE2` add
     `{ entry, spellId, at }` to `immunities` (creature entry id from
     `deps.getEntity`), kept for the session.
   - `area.test.ts` (`areaRig("combatlog")` with a no-op owner for
     `SMSG_SPELL_GO`, D24): an `SMSG_SPELL_GO` whose miss list holds an
     `IMMUNE` result for the character's target adds a `miss` entry and
     an immunity; a miss list of a stranger's cast is dropped. Bodies
     from the `SMSG_SPELL_GO` builder the core spell tests use, or a new
     one built from `Spells/Spell.cpp:5202-5221`.
   - Harness: an `environmental` entry on the character writes one row
     `combatlog/environmental`, class `wake` when no run is active and
     `log` inside a run (`rc.runActive`).
   They fail because the opcodes have no handler and nothing peeks.
2. **Implementation.** Five parsers and five `wire.on(GameOpcode.SMSG_...)`
   lines; `wire.peek(GameOpcode.SMSG_SPELL_GO, ...)` with `parseSpellGo`
   from `#wow/protocol/spell` (`protocol/spell.ts:200-207`); `uses` gains
   `SMSG_SPELL_GO`. No handler edit, no lease: `spells` may peek the same
   opcode (design 5.9 "Shared handler"). The environmental `kind` maps
   0-5 to `exhausted`, `drowning`, `fall`, `lava`, `slime`, `fire`
   (`Entities/Player/Player.h:826-835`). Delete the
   `SMSG_ENVIRONMENTAL_DAMAGE_LOG` `stubs` line. Builders
   `combatlogSpellMissBody`, `combatlogSpellImmuneBody`,
   `combatlogDamageShieldBody`, `combatlogEnvironmentalDamageBody`,
   `combatlogInstakillBody`.
3. `mise protocol:coverage`; five Proof rows; `unseen` for each opcode
   not seen live.

**Proof:**

- `SMSG_SPELLDAMAGESHIELD`: try live. While the `eversong10-mage`
  character is offline, `soap setup <ACCOUNT> spells/learn` druid Thorns
  (spell 467) [I: unconfirmed that a mage can cast it]; then
  `mise protocol:probe <ACCOUNT> --flow combatlog-use --arg spell=467`
  followed by `--flow combatlog-fight --expect SMSG_SPELLDAMAGESHIELD`
  in one probe run if the probe takes two flows, else two runs within the
  aura's duration [I]. If it does not arrive: mock from
  `Entities/Unit/Unit.cpp:2179-2187`, `unseen`.
- `SMSG_ENVIRONMENTAL_DAMAGE_LOG`: mock from
  `Server/Packets/CombatLogPackets.cpp:22-28`, `unseen`. A live fall needs
  direct drive to walk off a ledge on a non-GM character
  (`Entities/Player/Player.cpp:14183-14215`); the builder does not wait
  for it (contract 0.6).
- `SMSG_SPELLLOGMISS`, `SMSG_SPELLORDAMAGE_IMMUNE`,
  `SMSG_SPELLINSTAKILLLOG`: mock, not seen live, from
  `Entities/Object/Object.cpp:3832-3841`,
  `Entities/Unit/Unit.cpp:6628-6633` and
  `Spells/SpellEffects.cpp:294-298`. None can be forced in normal
  levelling: an ordinary cast miss rides the `SMSG_SPELL_GO` miss list
  (`Spells/Spell.cpp:5202-5221`), and these three need an evade after
  travel time, an immune target, or a boss spell.
- Delete the account. Rerun `t3-ghostlands-kill` (N23).

**Commit:**

```
feat: Read misses, immunity and shield logs

Spell misses, immunities, damage shields, falls and instant kills were
lost, so the agent could not learn what a creature was immune to. The
store now keeps them and remembers immunities for the session.
```

---

## Task combat-log-4: Dispels and spell steals

**codeArea:** `combatlog`. **Phase:** 4. **Size:** S.

**Files:** `areas/combatlog/protocol.ts`, `protocol.test.ts`,
`areas/combatlog/area.ts`, `area.test.ts`, `areas/combatlog/opcodes.ts`
(`unseen`), `packages/core/test-support/areas/combatlog.ts`,
`packages/harness/src/areas/combatlog/area.ts` (or `rules.ts`) and test,
`docs/areas/combatlog.md`, `docs/protocol-coverage/combatlog.md`.

**Depends on:** combat-log-3, T-5 (`soap gm learn`).

**Opcodes:** `SMSG_SPELLDISPELLOG`, `SMSG_DISPEL_FAILED`,
`SMSG_SPELLSTEALLOG`.

**Steps:**

1. **Failing tests.**
   - `protocol.test.ts`: `parseDispelLog` for both `SMSG_SPELLDISPELLOG`
     (`Spells/SpellEffects.cpp:2803-2817`) and `SMSG_SPELLSTEALLOG`
     (`:5990-6002`): packed victim, packed caster, spell, `u8`, count
     `u32`, then per aura `u32` id and `u8` flag. `parseDispelFailed`:
     caster `u64`, target `u64`, the dispel spell `u32`, then one `u32`
     per failed aura to the end of the body (`:2779-2787`; AzerothCore
     wins over `spell/smsg_dispel_failed.wowm:3-7`, which counts the
     dispel spell as a failed aura).
   - `area.test.ts`: the three opcodes emit `dispel`, `dispel_failed` and
     `steal` entries.
   - Harness: a `dispel` or `steal` entry that removed an aura from the
     character writes one `log` row `combatlog/dispelled`
     (`Defias Mage dispels your spell 168.`, spell id as in 7a).
2. **Implementation.** Two parsers, three `wire.on(GameOpcode.SMSG_...)`
   lines, builders `combatlogDispelLogBody`, `combatlogDispelFailedBody`.
3. `mise protocol:coverage`; three Proof rows.

**Proof:** try `SMSG_SPELLDISPELLOG` live once: an `eversong10-mage`
account learns Dispel Magic (spell 527) with `soap setup spells/learn`
while offline, and casts it with `combatlog-fight --arg spell=527` on a
creature that carries a magic buff [I: no such creature near the preset
start is known]. The builder spends at most one attempt. Otherwise all
three are mock, not seen live, from `Spells/SpellEffects.cpp:2803-2817`,
`:2779-2787` and `:5990-6002`, and go into `unseen`. Spellsteal is a
level 70 mage spell (30449) [I]; a `max80` mage would need `soap gm
learn 30449`, and the `max80` preset's class could not be determined, so
it is not planned. Delete every account.

**Commit:**

```
feat: Read dispel and spell steal logs

A dispel or spell steal on the character left no trace, so the agent
could not rebuff. The store now keeps dispels, steals and failed
dispels, and a removed buff shows as one row.
```

---

## Task combat-log-5: Spell execute log

**codeArea:** `combatlog`. **Phase:** 4. **Size:** M.

**Files:** `areas/combatlog/protocol.ts` (or a sibling
`areas/combatlog/execute.ts` and its test if `protocol.ts` nears 500
lines), `protocol.test.ts`, `areas/combatlog/area.ts`, `area.test.ts`,
`areas/combatlog/opcodes.ts` (`unseen` if needed),
`packages/core/test-support/areas/combatlog.ts`,
`docs/areas/combatlog.md`, `docs/protocol-coverage/combatlog.md`.

**Depends on:** combat-log-4.

**Opcodes:** `SMSG_SPELLLOGEXECUTE`.

**Steps:**

1. **Failing tests.** `parseSpellExecute` returns
   `{ caster, spellId, effects: { effect, records }[], truncated }`.
   Header from `Spells/Spell.cpp:5224-5256`; one fixture per record
   layout from `Spell.cpp:5258-5322`: power drain and burn (effects 8
   and 62; packed guid, `u32` amount, `u32` power, `f32` multiplier;
   `POWER_BURN` from `Spells/SpellEffects.cpp:1553`), extra attacks (19;
   packed guid, `u32`), interrupt (68; packed guid, `u32` spell),
   durability damage (111; packed guid, `i32` item, `i32` slot), create
   item (24) and feed pet (101; `u32` entry, `SpellEffects.cpp:4758`),
   guid only (18, 113, 33, 28, 50, 76, 83, 102, 104-107). A per-effect
   target count above 1 reads that many records (`Spell.cpp:8838-8845`;
   AzerothCore wins over `spell/smsg_spelllogexecute.wowm:1-8`, which
   fixes the count at 1 and reads a guid for feed pet). An effect not in
   the table keeps what was read and sets `truncated: true`. An
   `area.test.ts` case: one `execute` entry per record.
2. **Implementation.** The record table maps an effect number to its
   reader; `wire.on(GameOpcode.SMSG_SPELLLOGEXECUTE, ...)`; builder
   `combatlogSpellExecuteBody`. A `truncated` result is kept and counted
   in state, not thrown (design 5.9 "Decisions").
3. `mise protocol:coverage`; one Proof row.

**Proof (live):** an `eversong10-mage` account casts Conjure Water with
`combatlog-use --arg spell=5504 --expect SMSG_SPELLLOGEXECUTE --bodies`
(rank 1 id 5504 [I]; if the preset lacks it, `soap setup spells/learn`
while offline). The body must carry a create-item record (effect 24).
Exit 0 and outcome `handled` for 0x24C. Delete the account. The other
record layouts are rig tests only.

**Commit:**

```
feat: Read the spell execute log

Spell effects such as created items, interrupts and power drains arrive
in the execute log, which core ignored. The parser reads every record
layout the server writes and keeps a partial result for an unknown one.
```

---

## Task combat-log-8: Human-only damage line (optional)

**codeArea:** `combatlog`. **Phase:** 4. **Size:** S.

**Files:** under a lease (contract issue 6): `ui/ticker.ts` and
`ui/ticker.test.ts`, `ui/install.ts`.

**Depends on:** combat-log-7b, the ticker lease.

**Opcodes:** none.

**Steps:**

1. **Failing test.** `ui/ticker.test.ts`: `tickerLines` with a combat log
   source shows at most one damage line per second (`You hit Mottled Boar
   for 42.`), and the model's context never receives it (human-only
   lines, `docs/harness.md` "Screen").
2. **Implementation.** A combat log source for `createTicker`, fed from
   `handle.combatlog.onEvent` in `ui/install.ts:144`.
3. `mise test` on the ticker test, `mise typecheck harness`,
   `mise ci:checks`.

**Proof (unit):** unit tests only; a person who plays one fight by hand
in PLAY mode sees the line. This task is optional (design 5.9); if the
lease is not granted, it is skipped and recorded as a gap.

**Commit:**

```
feat: Add a damage line to the ticker

A person who plays by hand saw no damage numbers. The ticker now shows
one rate-limited damage line that the model never sees.
```

---

## Dead opcodes

| Opcode | Why dead |
|---|---|
| `SMSG_PROCRESIST` 0x260 | Its only writer, `Unit::SendSpellDamageResist` (`Entities/Unit/Unit.cpp:6616-6624`), has no caller: the declaration (`Entities/Unit/Unit.h:2051`) and the definition are the only hits. One of the six unreachable senders of N13. |
| `SMSG_FEIGN_DEATH_RESISTED` 0x2B4 | Both sites are inside `/* */` blocks (`Spells/Auras/SpellAuraEffects.cpp:2953-2958`, `:3038-3043`). |
| `SMSG_HEALTH_UPDATE` 0x47F | No send site: only `Server/Protocol/Opcodes.h` and `Opcodes.cpp` name it. It is a stub today (`protocol/stubs.ts:55`); the seed puts it in `dead` (design 5.9). |

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules every contract issue, lease request and decision
of this unit that a wave-1 task (`combat-log-1`, `combat-log-6a`,
`combat-log-6b`, `combat-log-7a`, `combat-log-7b`) meets. Contract issue
6 (the ticker lease) and the `combat-log-8` row of the lease table are
met only by `combat-log-8` in wave 4, so they wait for the `SEED-4`
pass and are not ruled here. Two rulings need a `COORD-<n>` commit
(SR1-combat-log-1 before `combat-log-6b`, SR1-combat-log-2 before
`combat-log-7b`); each task takes its fallback only if that commit is
absent at task start. A lease on a legacy file also covers its colocated
test file of the same stem, as in SR1-threat-7. Line numbers marked [M]
were read at `f3cb40a9`. Each ruling is **not yet ruled by the
maintainer**.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR1-combat-log-1 | Contract issue 1: "`SMSG_POWER_UPDATE` has no write path into the entity store ... The coordinator makes the edit before SEED-1, or task 6b takes its fallback" (`combat-log-6b`) | `COORD`, the design default (design 5.9 "Store and events": the value goes through the entity store's existing `update`). Before `combat-log-6b` starts, one `COORD-<n>` commit adds `updateEntity: EntityStore["update"]` to `SessionDeps` in `packages/core/src/wow/session-stores.ts` (a type import beside `EntityLookup`), sets it in `sessionDeps(conn)` to `(guid, fields, rawFields) => conn.entityStore.update(guid, fields, rawFields)`, and gives `testStores` in `packages/core/test-support/session-fixtures.ts` the default `updateEntity: () => undefined`. These are the only two full `SessionDeps` literals [M]; the rig and the mock handle build through `testStores` (contract 1.8), so the member is required. `register` gets only `wire` and the store, so the store gains one method (for example `applyPower({ guid, power, value })`) that calls `deps.updateEntity` and keeps nothing in the log ring. The write sets both the raw field `UNIT_FIELDS.POWER1.offset + power` and slot `power` of the typed `power` array (`entity-store.ts:39` [M]; `update` merges an array by index, `:201-203` [M]), so `combatUnitOf` and typed readers agree. A guid the entity store does not know changes nothing (`update` returns early, `:195` [M]). No lease: the unit's lease table row for `combat-log-6b` reads "no lease; `COORD`". The entity-store assertions go in `store.test.ts` (SR1-combat-log-11). If the commit is absent at task start, 6b takes the fallback of contract issue 1 as written | accepted by the maintainer (P2-5) |
| SR1-combat-log-2 | Contract issue 2: "`fight/end` totals cross a frozen file ... Totals need one new `RuleLookup` member ... Options: a `COORD-<n>` commit that adds the lookup member, or the design is amended" (`combat-log-7b`) | `COORD`, the design default (design 5.9 "Verbs": "`fight/end` gains totals"). After `combat-log-1` lands (so `AreaState<"combatlog">` is `CombatlogState`) and before `combat-log-7b` starts, one `COORD-<n>` commit adds a raw read view `combatlog: () => AreaState<"combatlog"> \| undefined` to `RuleLookup` in `packages/harness/src/events/rules.ts` (`AreaState` from `@peon/core`, whose barrel exports it, contract 1.6), returns `undefined` from `NO_LOOKUP` and `handle.combatlog.state()` from `lookupFor` in `packages/harness/src/events/router.ts`, and gives `testLookup` in `packages/harness/test-support/rule-fixtures.ts` the default `combatlog: () => undefined`. The member returns the state, not totals, so the sums stay in unit code: `combat-log-7b` creates `packages/harness/src/areas/combatlog/totals.ts` and its test (owned, a sibling of the seeded `area.ts`) with one helper that sums `entries` with `at >= since`; the `engage` tally and `fightEnd` both call it, and `fightEnd` passes the fight start `rc.memo.fights.get(runId).at` (`events/rules-combat.ts:241` [M]). The design is not amended, and no `combatlog/fight` row or `fight_closed` event is added. If the commit is absent at task start, 7b takes the fallback of contract issue 2 as written | accepted by the maintainer (P2-5) |
| SR1-combat-log-3 | Contract issue 3: "The Jev lease names the wrong files ... Task 7b needs the lease on those three files" (`combat-log-7b`) | Lease. `combat-log-7b` edits no `jev/*` file. It holds `packages/harness/src/loops/combat-actions.ts` and `packages/harness/src/loops/game.ts` (first holder of each, no next holder) and `packages/harness/src/loops/combat-actions-observation.ts` after `spells-12b` lands (SR1-spells-15), then hands it to `spells-13`. These are contract 2.7 fix-up rows ("harness engage loop") | accepted by the maintainer (P2-5) |
| SR1-combat-log-4 | Contract issue 4: "`VitalsView.comboPoints` touches files with no combat-log lease ... Task 7b needs a lease on `ops/views.ts`, `events/now.ts`, `ui/footer.ts` and the `VitalsView` block of `contract/views.ts`" (`combat-log-7b`) | Lease (contract 2.7 fix-up rows "harness observation" and "harness `ui/footer.ts`"). `combat-log-7b` holds `packages/harness/src/events/now.ts` and `packages/harness/src/ops/views.ts` after `self-state-11b` lands, then hands both to `self-state-10a`; it holds `packages/harness/src/ui/footer.ts` as first holder with no next holder. It holds only the `VitalsView` block of `packages/harness/src/contract/views.ts` (`:26-32` [M]); as in SR1-spells-11 it does not wait for the holders of other blocks (`threat-3b`, `quests-2`), and it takes the block when `self-state-11b` lands, since it waits for that task for `events/now.ts` in any case. After 7b the block goes to `remote-motion-7a` in the file's queue | accepted by the maintainer (P2-5) |
| SR1-combat-log-5 | Contract issue 5: "The engage tally lease ... The renderer that prints the `engage` result line could not be determined from a quick read" (`combat-log-7b`) | Lease. The model-facing result line is the `detail` built at `tools/engage-fight.ts:360` [M] (`creditText` and `gains`), which `runEnd` turns into the run summary (`tools/engage.ts:101` [M]). SR1-spells-17 refused the `tools/engage*.ts` glob to `spells-12b`, so `combat-log-7b` is the first holder of `packages/harness/src/tools/engage-tally.ts` and of `packages/harness/src/tools/engage-fight.ts`, with no next holder in the plan; the plan "Leases" table gains a `tools/engage-fight.ts` row. It also holds the `EngageAfter` block of `packages/harness/src/contract/details.ts` (D13) and, as in SR1-spells-11, does not wait for the holders of other blocks of that file. `ui/renderers/live-run.ts` (`tally`, `engageDetail`, `:202-239` [M]) renders `EngageAfter` for the human view and has no lease: 7b leaves it, and `docs/areas/combatlog.md` "Left out" names the human engage line as a gap | accepted by the maintainer (P2-5) |
| SR1-combat-log-6 | Found while ruling SR1-combat-log-3 to -5: `combat-log-7b` depends only on `combat-log-7a`, and its index entry has `leaseDeps: []`, so a scheduler that reads only dependencies starts it ahead of two holders it must wait for (`combat-log-7b`) | `combat-log-7b` starts only when `combat-log-7a`, `spells-12b` (`loops/combat-actions-observation.ts`) and `self-state-11b` (`events/now.ts`, `ops/views.ts`) have landed and the commit of SR1-combat-log-2 is in (or its absence is recorded, and the fallback applies). The coordinator enforces this in the scheduler (for example `lease:` entries on 7b in the plan index); the task's "Depends on" line is not changed here | accepted by the maintainer (P2-5) |
| SR1-combat-log-7 | Contract issue 7: "Log row names. Design 5.9 names the rows: domain `combatlog`, events `combatlog/immune`, `combatlog/killing_blow` ... not `combat/*`" (`combat-log-7a`) | Stands, no contract change. The harness rule returns drafts with `name: "immune"` and `name: "killing_blow"`; the router sets `domain: "combatlog"` and the event `combatlog/<name>` (contract 1.9). The once-per-session set of `(entry, spellId)` lives in the closure that `rules()` returns, never in `RuleMemo` | accepted by the maintainer (P2-5) |
| SR1-combat-log-8 | Contract issue 8: "Coverage reads `GameOpcode.<NAME>` literally ... Every registration in `areas/combatlog/area.ts` writes `GameOpcode.SMSG_...` in full" (`combat-log-1`, `combat-log-6a`, `combat-log-6b`) | Stands, no contract change. Each `wire.on` names `GameOpcode.SMSG_<NAME>` in full; no alias, table or loop registers an opcode | accepted by the maintainer (P2-5) |
| SR1-combat-log-9 | Lease table: "`combat-store.ts` and its test \| add `noteHostileDamage(guid)`" and design 5.9 "Decisions": "revisit after `threat`" (`combat-log-1`) | Lease. `combat-log-1` holds `packages/core/src/wow/combat-store.ts` and `combat-store.test.ts` from `SEED-1` for that one method next to the `SMSG_ATTACKSTART` path (`:336-343` [M]); no next holder in the plan. The decision stands: `combat-log-1` already depends on `threat-1`, which is the "after `threat`" of the design | accepted by the maintainer (P2-5) |
| SR1-combat-log-10 | Task body: "a party member (from `ctx.legacy.party()` or `core`) ... is kept" (`combat-log-1`) | Refused for wave 1. The store gets `deps` and `core` only; `ctx.legacy` is on the runtime context (contract 1.2), `combat-log-1` has no runtime, and `legacy` exists because `CoreStores` holds no party (design 3.3). `combat-log-1` keeps entries whose source or target is the character, its pet or a unit in the current fight, and a party member's entry against such a unit is kept through that unit. Party scope goes to wave 2 (parties and raids): `combat-log-2` may add a runtime that passes `ctx.legacy.party()` to the store. `docs/areas/combatlog.md` "Left out" names the gap, and the store test drops the party case | accepted by the maintainer (P2-5) |
| SR1-combat-log-11 | Task bodies: 6a tests `killerKind: "player"` and `ourTarget: true` over `areaRig("combatlog")`, and reads the target from "`combat-store.ts` or `self-store.ts`"; 6b tests over "`areaRig("combatlog")` with a known unit in the entity store" (`combat-log-6a`, `combat-log-6b`) | Refused as written, with this alternative and no rig edit. The rig builds over `testStores()`, whose `getEntity` returns `undefined`, and `init` takes no entity source (contract 1.8); the rig is frozen after S0-5. Cases that need an entity go in `areas/combatlog/store.test.ts`, which builds the store with its own `SessionDeps` (the area allow-list binds non-test source only, contract 1.12, so a test may build a real `EntityStore` from `#wow/entity-store`). In 6a that is `killerKind` `player` or `pet` and `ourTarget`; in 6b the write to a known unit, one `update` event and the new power through `combatUnitOf`. The rig tests keep what needs no entity: the opcode is handled, the stub is gone, `bySelf` from the rig's `selfGuid`, `killerKind: "unknown"`, and a power update for an unknown guid changes nothing. Neither store holds the character's target: `selectedGuid` comes from `control.snapshot().target` (`runtime.ts:208` [M]), which is not in `CoreStores`. `ourTarget` compares the victim with the character's `UNIT_FIELDS.TARGET` (offset 18, two words) read from `deps.getEntity(deps.selfGuid())?.rawFields` and joined with `joinGuid` from `#wow/protocol/packet`, as SR1-threat-4 reads the pet | accepted by the maintainer (P2-5) |

## Seed rulings (SEED-2)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-2 task meets, before `SEED-2`. The wave-2 tasks of this unit are combat-log-2 and combat-log-3 (phase B). Each ruling is a coordinator ruling (P2-17). Rows marked "for the maintainer's review" answer a design question with the recommended answer of the draft.

A task's own eval runs use the round number the coordinator gives in its build prompt (SEED2-1). Wave-2 scenarios run replica 1 only and no spawn grid is added (SEED2-2). `origin/factory/426-protocol-coverage` in this file means `origin/factory/431-wave2` for part 2 (SEED2-6). Paths without a prefix are under `packages/core/src/wow/` (core), `packages/harness/src/` (h:) or `packages/devtools/src/` (dev:); AzerothCore paths are relative to `src/server/game/` in `/home/deity/code/azerothcore-wotlk-playerbots` unless they start with `src/`, `data/` or `modules/`. Facts marked [M] were measured in this worktree or in AzerothCore; [INFERENCE] marks what was not observed.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR2-combat-log-1 | combat-log-2 Files (combat-log.md:558-564) do not name `store.ts` or `store.test.ts`, but the entry mapping (`heal`, `energize`, `periodic_*` entries) and a guard (SR2-combat-log-2) go there. `store.ts` is 412 and `store.test.ts` 489 non-blank now (limit 500); combat-log-3 names `store.ts` and `store.test.ts` (`:637-642`). | Both files belong to the `combatlog` area of the unit, so contract 0.9 (wave 1 of part 2 amendment, P2-17) lets combat-log-2 edit them. The entry builders move first ("Coordinator edits for SEED-2"): the new `areas/combatlog/entries.ts` holds `meleeEntry`, `spellDamageEntry`, `sum`, `meleeOutcome`, `optional`, `ABSORB_FULL`, `RESIST_FULL`, `AVOIDED`; the new builders of both tasks go there. New tests go in `entries.test.ts`, the moved "entry builders" block plus each task's new builder tests. | coordinator ruling (P2-17) |
| SR2-combat-log-2 | `CombatlogStore.markAttacker` (`store.ts`, after `noteImmunity`) calls `core.combat.noteHostileDamage(entry.source)` for any damage kind with the character as target unless the source is the character. `SMSG_PERIODICAURALOG` writes the caster with `WriteAsPacked` of a stored guid that may be empty (`Entities/Unit/Unit.cpp:6564-6566`), and an environmental entry has no source. `noteHostileDamage(0n)` would add guid 0 to `incomingAttackers` (`combat-store.ts:347-351`) and emit `attacked`. | combat-log-2 adds `if (entry.source === 0n) return;` at the top of `markAttacker` and a test (a `periodic_damage` entry with source 0 on the character marks nobody) in the attackers block of `store.test.ts`. Environmental, `heal` and `energize` entries never reach `markAttacker` for another reason (`DAMAGE` set membership); the guard covers the `periodic_damage` case that combat-log-2 adds. | coordinator ruling (P2-17) |
| SR2-combat-log-3 | combat-log-2 step 1: entries `heal`, `energize`, `periodic_*` without field mapping. `count()` adds `entry.amount` to `fight.healed` for `HEALS` (`store.ts` `count`). AzerothCore writes the gross heal and the overheal (`healInfo.GetHeal()`, `overheal = heal - effective`, `Entities/Unit/Unit.cpp:8091-8107`). | Mapping (source = the caster, target = the victim, `receive()` scopes them): `SMSG_SPELLHEALLOG` (`Unit.cpp:8098-8107`, victim first, caster second) → `{ kind: "heal", source: caster, target: victim, spellId, amount: max(0, heal - overheal), over: overheal, absorbed, crit }`, so the fight total `healed` is the effective heal; `SMSG_SPELLENERGIZELOG` (`Unit.cpp:8128-8134`) → `{ kind: "energize", source: caster, target: victim, spellId, power, amount }`; `SMSG_PERIODICAURALOG` (`Unit.cpp:6560-6606`, victim, caster, spell, `count`, then per effect `auraType`): types 3 and 89 → `periodic_damage` (`amount`, `over`, `schoolMask`, `absorbed`, `resisted`, `crit`), 8 and 20 → `periodic_heal` (as `heal`), 21 and 24 → `periodic_power` (`power` = misc value, `amount`), 64 → `periodic_power` with the multiplier read and dropped (`CombatlogEntry` has no float field). Damage `amount` stays as sent, heal `amount` is effective: record it in `docs/areas/combatlog.md`. The parser loops over `count` (AzerothCore always writes 1, `Unit.cpp:6567`) and throws on any other aura type as the plan says. Recommended; the alternative (gross `amount`) makes `healed` count overheal. | coordinator ruling (P2-17), for the maintainer's review |
| SR2-combat-log-4 | SR1-combat-log-10 (party scope): "`combat-log-2` may add a runtime that passes `ctx.legacy.party()` to the store". | Not needed and not done in wave 2. No opcode of combat-log-2 or -3 needs it: a heal on the character has the character as target and is kept by `isOurs(target)`. A party member's heal on another party member stays dropped. `docs/areas/combatlog.md` "Left out" keeps the gap. `runtime.ts` (32 non-blank, the fight timer) is not edited. | coordinator ruling (P2-17) |
| SR2-combat-log-5 | Plan follow-up (`design.md:4899`): "combat-log-3 must give immune and miss entries an outcome, source, target and spell id". Today `store.ts` `noteImmunity` needs `sourceOurs`, `spellId !== 0` and a creature target, and `count()` counts an entry in `fight.misses` only if `outcome` is set; the harness rule (`packages/harness/src/areas/combatlog/area.ts` `onEntry`) needs `e.source === rc.selfGuid` and, for kind `miss`, `outcome` in `immune`/`immune2`. | Mapping: `SMSG_SPELLLOGMISS` (`Entities/Object/Object.cpp:3832-3841`: spell, caster, `u8`, count, per target guid and `u8` reason) → one `{ kind: "miss", source: caster, target, spellId, amount: 0, outcome: SPELL_MISS_NAMES[reason] }` per target (`SPELL_MISS_NAMES` exists, `protocol.ts:30-43`; a reason outside 0-11 gives `unknown_<n>`); `SMSG_SPELLORDAMAGE_IMMUNE` (`Unit.cpp:6626-6633`: caster first, target second, spell, `u8`) → `{ kind: "immune", source: caster, target, spellId, amount: 0, outcome: "immune" }`; a `SMSG_SPELL_GO` miss list entry → `{ kind: "miss", source: go.caster, target: miss.guid, spellId: go.spellId, amount: 0, outcome: SPELL_MISS_NAMES[miss.reason] }`. Every miss and immune entry carries all four fields and an outcome, so `fight.misses.immune` counts and `noteImmunity` and the `combatlog/immune` row fire live. The builder tests assert the four fields on each mapping. | coordinator ruling (P2-17) |
| SR2-combat-log-6 | `SMSG_SPELLDAMAGESHIELD` and `SMSG_ENVIRONMENTAL_DAMAGE_LOG` entries: the plan lists the parsers, not the entries. | `SMSG_SPELLDAMAGESHIELD` (`Unit.cpp:2179-2187`, `DealDamageShieldDamage`: first guid = the shield owner, second = the attacker who takes the damage) → `{ kind: "damage_shield", source: shield owner, target: attacker, spellId, amount: damage, over: overkill, schoolMask }`. `SMSG_ENVIRONMENTAL_DAMAGE_LOG` (`Server/Packets/CombatLogPackets.cpp:22-28`, victim, `u8` type, amount, resisted, absorbed) → `{ kind: "environmental", source: 0n, target: victim, amount, resisted, absorbed, extra: type }`. The type name is not stored in `outcome` (that would be counted as a miss); `extra` holds the wire type 0-5 and the harness maps `exhausted, drowning, fall, lava, slime, fire` (`Entities/Player/Player.h:826-833`). The wire never carries 6: `DAMAGE_FALL_TO_VOID` is sent as `DAMAGE_FALL` (`Entities/Player/Player.cpp:865`). `SMSG_SPELLINSTAKILLLOG` (`Spells/SpellEffects.cpp:294-298`) → `{ kind: "instakill", source: caster, target, spellId, amount: 0 }`. | coordinator ruling (P2-17) |
| SR2-combat-log-7 | combat-log-3 step 2: `wire.peek(GameOpcode.SMSG_SPELL_GO, ...)`; "`uses` gains `SMSG_SPELL_GO`"; step 1 test "with a no-op owner for `SMSG_SPELL_GO`, D24"; "Bodies from the builder the core spell tests use, or a new one". | `COMBATLOG_OPCODES.uses` = `["SMSG_SPELL_GO"]` (unit-owned). The no-op owner is automatic (`area-rig.ts:73-75`). No builder exists (SR2-spells-6), so combat-log-3 adds `combatlogSpellGoBody` (hits list, miss list with reasons, empty targets) to `test-support/areas/combatlog.ts` from `Spells/Spell.cpp:5163-5221` (miss list) and `:5013`. The peek maps every entry of the miss list, plain misses included (`SPELL_MISS_MISS` never goes through `SMSG_SPELLLOGMISS`, `Spells/Spell.cpp:2751-2752`); the store scope drops the casts of strangers. `SMSG_SPELLLOGMISS` is sent for the later result of a hit (evade, immune at hit time, resist), so one cast can produce a `SMSG_SPELL_GO` miss and a later `SMSG_SPELLLOGMISS`; no dedupe. | coordinator ruling (P2-17) |
| SR2-combat-log-8 | combat-log-3 Proof: "Rerun `t3-ghostlands-kill` (N23)"; follow-up: "`combatlog/killing_blow` needs a two-account live proof". `combat-log-7a` found that `SMSG_PARTYKILLLOG` goes only to the loot recipient and its group (`Entities/Unit/Unit.cpp:13593,13611`), and `onKill` needs `killerKind === "player"` and `ourTarget` (`harness/areas/combatlog/area.ts` `onKill`). | The proof is two accounts, grouped, on the puppets. Account A is the observer: `tmp/puppet-<A> start --packet-trace headers`, `call selectTarget [<mob guid>]`, then `events --json` shows the `combatlog` `kill` event (`bySelf` 0, `ourTarget` 1, `killerKind` `player`) and the tap shows `SMSG_PARTYKILLLOG` `handled`. Account B kills the mob: `call invite` / `acceptInvite` group them, B fires a cast with `raw CMSG_CAST_SPELL`. The row itself (`combatlog/killing_blow`) is proven by the router test fed with the captured event, and the report says the game-log row was not seen live. No committed scenario (read-surface area, contract 0.6, R9). If the row is wanted live, a throwaway scenario JSON in the builder's `tmp/` (never committed) is the route. Recommended. The two puppets cannot walk (`puppet/calls.ts` has no move call), so the mob is reached as in SR2-combat-log-11. | coordinator ruling (P2-17) |
| SR2-combat-log-9 | combat-log-2 Proof: Minor Healing Potion 118 and Minor Mana Potion 2455 via `soap setup <ACCOUNT> items/add`; "Do not use `soap gm items`". | Stands (it is the right call, see SR2-spells-9). The `combatlog-use` flow is created by combat-log-2 (unit-owned probe flow). The heal-over-time and power-tick families stay "not seen live" as the plan says. Optional live `heal_in`: with the two accounts of SR2-combat-log-8, B casts a GM-learned Lesser Heal (2050, `soap gm <B> learn 2050`) on A through `raw CMSG_CAST_SPELL`; A's tap shows `SMSG_SPELLHEALLOG` with B as caster. Whether a non-priest may cast it [INFERENCE, could not determine]: if it fails the row stays "not seen live". | coordinator ruling (P2-17) |
| SR2-combat-log-10 | combat-log-2 harness: "Self-heals write nothing"; the healer name comes from `rc.lookup.unitName` (rule text `<healer> heals you for 540.`). A periodic heal may have an empty caster (SR2-combat-log-2). | The rule also writes nothing when the source is `0n` (no name to give). The amount in the row is the effective heal of SR2-combat-log-3; a heal whose effective amount is 0 (all overheal) writes no row. The closure keeps `lastRowAt` per healer guid; class `passive`, as the plan says. | coordinator ruling (P2-17) |
| SR2-combat-log-11 | Environmental row and the live staging of `SMSG_SPELLDAMAGESHIELD`. combat-log-3 Proof: Thorns 467 "unconfirmed that a mage can cast it". The mobs near the spawn: none within 100 yd of Fairbreeze (pets-2 Q4). | The environmental row is class `wake` when `!rc.runActive`, else `log`, name `environmental`, text from the type name and `amount`. For the damage shield the builder tries Thorns as planned (`soap gm <ACCOUNT> learn 467` on the mage), stands in melee range of a mob so that it hits the character, and reads `SMSG_SPELLDAMAGESHIELD` from the tap; otherwise mock and `unseen`. For any live fight: `soap gm <ACCOUNT> tele EversongWoods` on the task's own character (offline, as pets-2 did), where the nearest hostile was a Springpaw Stalker 99 yd away; the flow walks to about 25 yd first (`handle.walkTowardPoint`, as `pets-command` does). | coordinator ruling (P2-17) |
| SR2-combat-log-12 | `protocol.test.ts` is 347 non-blank; combat-log-2 adds three parsers and combat-log-3 five, about 200 lines together. | New parser tests go in new files of the unit: `protocol-heal.test.ts` (combat-log-2) and `protocol-avoid.test.ts` (combat-log-3); `protocol.test.ts` is not edited. `protocol.ts` (175) takes the parsers as is (about 300 after both). The area tests go in `area-heal.test.ts` and `area-avoid.test.ts` next to `area.test.ts` (237). | coordinator ruling (P2-17) |

## Build rulings

Recorded by the builder of combat-log-2. Each is a builder ruling for the coordinator to confirm.

| Id | Issue | Ruling |
|---|---|---|
| BR-combat-log-2-1 | The harness tests of the plan body are "Harness: ... test" without a file name, and `areas/combatlog/area.test.ts` held a case that expected a `heal` entry from another unit to write no row, which the new rule reverses. | The `heal_in` cases are in the new `packages/harness/src/areas/combatlog/area-heal.test.ts`. In `area.test.ts` the quiet case now uses a self-heal (`source` = `target` = the character), the one heal that still writes nothing. |
| BR-combat-log-2-2 | The live heal and energize proofs need a character below full health and mana: a Minor Healing or Mana Potion fails with `SMSG_CAST_FAILED` at full. | The proof hurts the character first (a `combatlog-fight` run after `soap gm tele EastSanctum`) and spends mana with `CMSG_CAST_SPELL` of Frost Armor (168) through the puppet `raw` command. The `combatlog-use` flow itself does not stage either. |
| BR-combat-log-2-3 | `optional()` in `entries.ts` drops fields equal to 0, and power type 0 is mana. | `energizeEntry` and the `periodic_power` entry set `power` and `amount` directly, so mana stays `power: 0` on the entry. |

## Seed rulings (SEED-4)

Wave 4 slice (BR-wave4-1): combat-log-4, combat-log-5. The coordinator's SEED-4 agents drafted these rows against `factory/431-wave4` at `851d14fc` and AzerothCore; each is a coordinator ruling (P2-17) and the maintainer may reverse any at PR review. Marks: `[M]` read or measured, `[INFERENCE]` not observed. Paths without a prefix are under `packages/core/src/wow/`; `h:` is `packages/harness/src/`, `dev:` `packages/devtools/src/`, `cts:` `packages/core/test-support/`. "Finding <n>" names a finding of the same draft below.

| Id | Plan text or question | Ruling | Status |
|---|---|---|---|
| SR4-combat-log-2 | Plan step 2 names "Two parsers, three `wire.on` lines, builders `combatlogDispelLogBody`, `combatlogDispelFailedBody`" but not the entry mapping or the entry fields (`combat-log.md:763-764`); design 5.9 only names the kinds. `CombatlogEntry` has no field for the removed aura (`entries.ts:44-58`). | Parsers in `protocol.ts` (`parseDispelLog`, used for both `SMSG_SPELLDISPELLOG` and `SMSG_SPELLSTEALLOG`: `{ victim, caster, spellId, auras: { spellId, flag }[] }`; `parseDispelFailed`: `{ caster, target, spellId, failed: number[] }`, reading `u32` while `remaining >= 4`). Entry builders in `entries.ts`: one entry per aura, `source` = caster, `target` = victim, `spellId` = the dispel spell, `amount: 0`, `extra` = the aura spell id (as `environmental` keeps its wire type in `extra`, SR2-combat-log-6), kind `dispel` (log `SMSG_SPELLDISPELLOG`), `steal` (`SMSG_SPELLSTEALLOG`), `dispel_failed` (one per failed aura). `outcome` is never set (it is counted into `fight.misses`, `store.ts:233-234`). The `u8` flag and the `u8` "not used" header byte are read and dropped (AzerothCore always writes 0, `SpellEffects.cpp:2808,2815,5995,6000`). `wire.on` lines name `GameOpcode.SMSG_SPELLDISPELLOG`, `SMSG_DISPEL_FAILED`, `SMSG_SPELLSTEALLOG` in full (SR1-combat-log-8). Builders in `cts: areas/combatlog.ts`: `combatlogDispelLogBody` (takes the opcode-independent body), `combatlogDispelFailedBody` (full `u64` guids, not packed). | coordinator ruling (P2-17) |
| SR4-combat-log-1 | combat-log-4 Files (`combat-log.md:736-740`): `protocol.ts`, `protocol.test.ts`, `area.ts`, `area.test.ts`, `opcodes.ts`, `cts: areas/combatlog.ts`, `h: areas/combatlog/area.ts` "(or `rules.ts`)", docs. Plan index owner list adds `h: rules.ts` and `rules.test.ts` (no such files). | Owner files of combat-log-4: `core:` `areas/combatlog/protocol.ts`, `entries.ts`, `store.ts`, `area.ts`, `opcodes.ts` (only if a proof ends `unseen`), new tests `protocol-dispel.test.ts`, `entries-dispel.test.ts`, `store-dispel.test.ts`, `area-dispel.test.ts` (none of `protocol.test.ts`, `store.test.ts`, `area.test.ts` is edited, SR2-combat-log-12); `cts: areas/combatlog.ts`; `h:` `areas/combatlog/area.ts` and new `areas/combatlog/area-dispel.test.ts`; `dev:` `probe-flows/combatlog-fight.ts` and `combatlog-fight.test.ts` (SR4-combat-log-6); `docs/areas/combatlog.md` (remove the "Left out" bullet at `:244-245` for the three opcodes; the wire notes at `:167-175` already exist, do not repeat them), `docs/protocol-coverage/combatlog.md` (regenerated). No `rules.ts`. | coordinator ruling (P2-17) |
| SR4-combat-log-4 | Harness rule (`combat-log.md:760-762`): "a `dispel` or `steal` entry that removed an aura from the character writes one `log` row `combatlog/dispelled` (`Defias Mage dispels your spell 168.`)". The text reads as a hostile removal; a friendly cleanse of a debuff (target = character, caster = party member) also arrives as `SMSG_SPELLDISPELLOG`. `onEntry` returns `[]` for any entry whose source is not the character (`h:areas/combatlog/area.ts`, line after the heal branch). | In `onEntry`, before that early return, add `if (e.kind === "dispel" \|\| e.kind === "steal") return onDispelled(e, rc)`. `onDispelled` writes a row only when `e.target === rc.selfGuid`, `e.source !== rc.selfGuid` and `e.source !== 0n`: name `dispelled`, class `log`, text `${named(e.source, rc)} dispels spell ${e.extra} from you.` (`steals spell ... from you.` for `steal`), data `{ kind, spellId, aura: e.extra, source: guidText(e.source) }`, through `unitRow(e.source, ...)`. One row per entry, no throttle (Mass Dispel is bounded). The text says "from you", not "your spell", so a cleanse reads right. `dispel_failed` and `execute` write nothing (they already fall through `isImmune`, which is false for them). New harness tests in `area-dispel.test.ts` (patterns of `area-heal.test.ts`). | coordinator ruling (P2-17) |
| SR4-combat-log-3 | Plan does not say how the new kinds interact with fight totals (`combat-log.md:758-762`). `count()` opens a fight for every ours entry (`store.ts:224-243`); the harness writes a `fight` row per closed fight (`h:areas/combatlog/area.ts` `onFightClosed`). | In `store.ts` add `const UTILITY = new Set<CombatlogKind>(["dispel", "dispel_failed", "steal", "execute"])` and make `count()` return at once for those kinds (they still go into the ring and emit `entry`; they neither open nor extend a fight and join no unit to it). Tests (new `store-dispel.test.ts`): a dispel entry on the character with no fight open leaves `snapshot().fight` undefined and no `fight_closed` after the quiet window; during an open fight it leaves the totals unchanged. combat-log-4 adds the set with all four kinds so that combat-log-5 needs no `count()` edit. | coordinator ruling (P2-17) |
| SR4-combat-log-5 | combat-log-5 Files list `protocol.ts` "or a sibling `execute.ts` if `protocol.ts` nears 500 lines", `protocol.test.ts`, `area.ts`, `area.test.ts`, `opcodes.ts`, `cts: combatlog.ts` (`combat-log.md:794-799`); plan index owner already lists `execute.ts` and `execute.test.ts`. Step 1 gives no entry mapping; step 2 says a `truncated` result is "counted in state". Design: "an unknown execute-log effect sets `truncated`". | `protocol.ts` (359) is not edited by combat-log-5: `execute.ts` (new) holds `parseSpellExecute` returning `{ caster, spellId, effects: { effect, records }[], truncated }` and `executeEntries(parsed)`. Owner files: `core:` `areas/combatlog/execute.ts`, `execute.test.ts`, `area.ts` (one `wire.on(GameOpcode.SMSG_SPELLLOGEXECUTE, ...)`), `store.ts` (one method `noteTruncated()`), `store-execute.test.ts`, `area-execute.test.ts`; `cts: areas/combatlog.ts` (`combatlogSpellExecuteBody`, effects list with typed records); docs; no `opcodes.ts` edit if the proof is live (the opcode is already in `owns`), `unseen` only if the live try fails. Entry mapping (one `execute` entry per record; `source` = caster; `spellId` = the log's spell; `extra` = the effect number): effects 8 and 62 `target` = the guid, `amount` = power taken, `power` = power type (the `f32` multiplier is read and dropped); 19 `target` = guid, `amount` = extra attacks; 68 `target` = guid, `amount` = the interrupted spell id; 111 `target` = guid, `amount` = item entry (`-1` for all items; the slot is read and dropped); 24 and 101 `target` = `0n`, `amount` = item entry; guid-only effects (18, 113, 33, 28, 50, 76, 83, 102, 104-107) `target` = the guid, `amount` = 0. A truncated packet keeps the entries read and calls `store.noteTruncated()`, which adds 1 to the existing `dropped` counter (the unread tail IS dropped data); no new `CombatlogState` field, so the three typed literals of the state outside the unit (`h:tools/engage-tally.test.ts:56`, `h:loops/combat-actions-observation.test.ts:21`, `h:ops/views.test.ts:122`) stay as they are. Also truncate when a record count exceeds `remaining` bytes divided by the smallest record (4), instead of reading past the end. Confirmed: a truncated execute log counts in the existing `dropped` counter. | coordinator ruling (P2-17) |
| SR4-combat-log-8 | Plan step 3 and Proof rows "three Proof rows" / "one Proof row" (`combat-log.md:765,826`) | Proof rows go through `mise protocol:coverage` as in earlier tasks: `SMSG_SPELLDISPELLOG` and `SMSG_SPELLSTEALLOG` `live` with the probe flow and arguments, or `mock` with `SpellEffects.cpp:2803-2817` / `:5990-6002` and `unseen`; `SMSG_DISPEL_FAILED` `mock` with `:2779-2787` and `unseen`; `SMSG_SPELLLOGEXECUTE` `live`. No scenario, no eval (read-surface area, N23). combat-log-5 reruns no scenario beyond the closest existing one required by the contract 3.6 gate that the coordinator runs once for the wave. | coordinator ruling (P2-17) |
| SR4-combat-log-7 | Proof of combat-log-5 (`combat-log.md:828-833`): `eversong10-mage` casts Conjure Water with `combatlog-use --arg spell=5504 --expect SMSG_SPELLLOGEXECUTE --bodies`; "rank 1 id 5504 [I]"; "The other record layouts are rig tests only". | Conjure Water rank 1 is 5504, effect 24 (create item), 3000 ms cast time index 14, base level 4; rank 2 is 5505 (level 10) [M `Spell.dbc`]. The writer sends one effect with one record (`u32` 1, `u32` item entry), via `Spell::EffectCreateItem` (`SpellEffects.cpp:1884`). The flow `combatlog-use` waits 10 s and prints entries by kind, so the proof line is `entries` containing `execute out`, outcome `handled` for `0x24c`, and the trace body (`--bodies`) showing effect 24. If the preset lacks the spell, `soap setup <ACCOUNT> spells/learn` offline. Two tries (BR-wave3-6); the opcode stays out of `unseen` when live. OPTIONAL second live layout, one try, no gate: `max80` priest casts Mana Burn (rank 1 is 8129, effect 62, level 24 [M]; the priest holds a higher rank, so use the id from the spellbook) at a mana-using Shadowpine Witch after `tele ZebSora`: the record carries `u32` power taken, `u32` power type, `f32` 0.0 (`SpellEffects.cpp:1553`). If T-11 lands first, a rogue (Kick 1766) or shaman (Wind Shear 57994) casts at a Witch that is mid-cast for the interrupt record (effect 68; whether a Witch casts is [INFERENCE]). Summon Imp 688 writes no record (effect 56, its log call is commented out, `SpellEffects.cpp:3480`); do not use it. Any record layout seen live is noted in `docs/areas/combatlog.md`; the others stay rig tests. | coordinator ruling (P2-17) |
| SR4-combat-log-6 | Proof of combat-log-4 (`combat-log.md:767-776`): one live attempt with `eversong10-mage` and Dispel Magic 527, "no such creature near the preset start is known", "a `max80` mage would need `soap gm learn 30449`, and the `max80` preset's class could not be determined, so it is not planned". BR-wave3-6 allows mock only after two failed live tries when the server cannot be made to send the opcode. | The server can be made to send both logs, so the live tries are planned (two per opcode, BR-wave3-6). Try 1: `mise factory soap create max80` (a Blood Elf priest, finding 3), then `mise factory soap gm <ACCOUNT> tele ZebSora` (offline, the run's own character), read the spellbook for the Dispel Magic id (988 expected), then `mise protocol:probe <ACCOUNT> --flow combatlog-fight --arg spell=<id> --arg entry=16341 --wait 20 --expect SMSG_SPELLDISPELLOG --bodies`; the flow prints `dispel out` in `entries`. Steal: same account, `soap gm <ACCOUNT> learn 30449` (cross-class learn, [INFERENCE: not observed]) and `--arg spell=30449`; `--expect SMSG_SPELLSTEALLOG`. Try 2 for either: `eversong10-mage` account, `soap setup <ACCOUNT> spells/learn` 527 or 30449 offline, `soap gm <ACCOUNT> tele ZebSora`, same flow (the mage may die after the first cast; one cast is the proof). `combatlog-fight.ts` gains an optional `--arg entry=<creature entry>` that filters `nearestHostile` by `row.entity.entry` (`:36-47`; the 19 yd Witch is the nearest hostile, but two Rippers stand 23-24 yd away), usage text and a test in `combatlog-fight.test.ts`. `SMSG_DISPEL_FAILED` is sent only when a roll fails (`SpellEffects.cpp:2750-2787`, `CalcDispelChance`); a level 80 caster against a level 11 target will not draw it, so it stays `mock` from the writer (`:2779-2787`) and goes into `unseen`, unless a live run happens to show it. A proof that fails twice puts that opcode in `unseen` as `mock` ("not seen live"). Delete every account. Confirmed: the `max80` priest staging with `soap gm tele ZebSora` on the task's own throwaway account is allowed (R12). | coordinator ruling (P2-17) |

### Findings behind the SEED-4 rulings

From the `combatlog-spells` draft:

- **Finding 1.** **The plan's file lists for combat-log-4 are stale; the real owner files differ.** `h: areas/combatlog/rules.ts` and `rules.test.ts` do not exist: the harness rules live in `h:areas/combatlog/area.ts` (159 non-blank) [M], with `totals.ts` (102). The entry builders live in `core:areas/combatlog/entries.ts` (267) since SR2-combat-log-1, not in `protocol.ts` (359). `store.ts` (308) needs an edit (finding 2), which the plan does not list. Sibling test files are the unit's pattern (`protocol-heal.test.ts`, `area-avoid.test.ts`, SR2-combat-log-12), because `protocol.test.ts` is 347 and `store.test.ts` 409. Affects: combat-log-4, combat-log-5.
- **Finding 2.** **Dispel, steal and execute entries would open a fight and write a bogus "Fight over" row unless the store skips them.** `CombatlogStore.receiveOne` calls `count()` for every entry whose source or target is ours (`store.ts:188-210`); `count()` opens a fight (`this.fight ?? this.open(entry.at)`, `:224-243`) and counts any `entry.outcome` into `fight.misses` (`:233-234`). The harness writes a `combatlog/fight` row for every closed fight (`h:areas/combatlog/area.ts` `onFightClosed`, text `Fight over: dealt 0, took 0.` from `fightText`, `totals.ts:113-119`). A Conjure Water cast (combat-log-5 live proof) would therefore log a fight row 6 s later, and a friendly cleanse on the character would too. Affects: combat-log-4, combat-log-5.
- **Finding 3.** **Live staging for dispel and steal is reachable today, with no T-11 preset.** [M] Base data: Shadowpine Witch (entry 16341, level 11-12, faction 1643, `creature_template_addon` auras `12550` Lightning Shield, `data/sql/base/db_world/creature_template_addon.sql:3713`) stands in the Zeb'Sora troll camp; Lightning Shield 12550 has dispel type 1 (Magic), a positive aura [M `Spell.dbc` dispel field]. `game_tele` row `ZebSora` is `(8027.92, -7831.6, 174.185)` map 530 (`game_tele.sql`, id 1366); the nearest spawn is a Witch 19 yd away, then Shadowpine Rippers (16340, level 10, no aura) at 23-30 yd, then more Witches at 44-63 yd [M, join of `creature.sql` and `creature_template.sql`]. Map 530 has navigation data. `soap gm <ACCOUNT> tele ZebSora` works on the run's own offline character. `max80` is a Blood Elf priest [M `docs/areas/items.md:198`, `docs/areas/selfstate.md:255`], so it already has Dispel Magic (rank 2, spell 988, level 36; `Spell.dbc` effect 38 [M]) and survives level 11 mobs; the plan's note "the `max80` preset's class could not be determined" is resolved. The plan's "[I: no such creature near the preset start is known]" is resolved by the tele target. Affects: combat-log-4.
- **Finding 4.** **A mage at level 10 cannot be the dispel caster (it would die to the Zeb'Sora camp) but remains the fallback.** `eversong10-mage` plus `spells/learn` 527 and 30449 works offline (`realm-service.ts:15-18`). Spellsteal 30449 is effect 126, level 70 [M `Spell.dbc`]; Dispel Magic 527 is rank 1, level 18, 988 rank 2 level 36 [M]. A level 80 priest holds only the highest learned rank active, so the cast uses the id that the spellbook shows (988 [INFERENCE: not read from a live book]); 527 on a priest that has 988 would fail `SMSG_CAST_FAILED` [INFERENCE, AzerothCore disables lower ranks]. Affects: combat-log-4.
- **Finding 5.** **T-11 changes no proof of these four tasks, so none of them takes a T-11 dependency.** T-11 is parked (branch `origin/factory/431-wave3-parked-T-11`, tip `bc8be618`, not an ancestor of `851d14fc` [M]); its table gives `eversong10-priest` (template `Tpleversong`, no stage), `eversong10-shaman`, `-warlock`, `-rogue`, `-druid` (created, level 10) and `eversong55-deathknight` (`tooling.md:934-941`). A priest preset adds nothing over `max80` (finding 3) and a level 10 priest still needs 527 from `spells/learn`; a rogue or druid has no spell that makes the server send any of the four tasks' opcodes; a shaman's Far Sight (6196, level 26, effect 72 [M]) needs a ground-targeted cast and the handle has no ground cast (`WorldHandle.cast(spellId, targetGuid)` only, `client.ts:267`; `SpellTarget` kind `dest` exists only in the builder, `protocol/spell-targets.ts:3-8`). If T-11 stays parked: no change (the required proofs below do not use a class preset). If T-11 lands first: a rogue (Kick 1766, level 12, effect 68 [M]) or shaman (Wind Shear 57994, effect 68 [M]) MAY add an interrupt record to combat-log-5 (SR4-combat-log-7), never required. Affects: combat-log-4, combat-log-5, spells-10, spells-11.
- **Finding 9.** **No task here reads a client DBC file through `ctx.dbc`, so no `REQUIRED_DBC_FILES` or `docs/harness.md` edit.** The dispel text keeps spell ids (the harness `RuleLookup` has no spell-name member, SR2-spells-5). `Spell.dbc` was read only to confirm staging ids. Affects: all four.
- **Finding 10.** **No other task of this wave's slice owns a file that these four own.** Scan of the 23 slice rows in `plan/index.json` against `areas/combatlog`, `areas/spells`, `test-support/areas/combatlog|spells`, `probe-flows/combatlog*|spells*`, `docs/areas/combatlog|spells`, `loops/combat-actions-observation*`, `events/rules-combat` found no hit [M]. The two units run side by side; inside each unit the two tasks share files and run in series (combat-log-4 then -5; spells-10 then -11). Affects: all four.
- **Finding 11.** **No file needs a pre-split.** Largest results after the work (estimates, [INFERENCE]): `core:areas/combatlog/protocol.ts` 359 to about 405 (two parsers, combat-log-5 keeps its parser in `execute.ts`); `entries.ts` 267 to about 325; `store.ts` 308 to about 325; `cts: areas/combatlog.ts` 311 to about 430 (split into `areas/combatlog-execute.ts` before adding if it would pass 450); `core:areas/spells/store.ts` 347 to about 380 (the mirror logic goes to a new `mirror.ts`); `runtime.ts` 210 to about 225; `protocol.ts` 122 to about 200; `docs/areas/spells.md` 349 to about 400. `unit-casts.test.ts` (482) is not touched. Affects: all four.
