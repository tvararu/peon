# Protocol coverage: threat (key: threat)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design:
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md)
(section numbers such as "design 5.8" point into it).

The `threat` unit builds the code area `threat` (design 5.1, 5.8). It
reads the server's threat tables, the creature reactions and the target
breaks, and shows them to the agent in `look`, the danger view, the engage
loop and the game log. It is the pilot of wave 1: it is small, touches no
control file, and proves the flood guard (design 3.10, N12).

- Phase: 1 (wave 1, first area; design 5.1 and N22).
- Worktree: `proto-threat`, created with the command of contract 0.1,
  branch renamed to `proto/area-threat`.
- Opcodes: 7 relevant, 0 dead, all missing today. Every one is a server
  notice (`STATUS_NEVER`, AzerothCore `Server/Protocol/Opcodes.cpp:447,469,1090,1285-1288`).
  The area sends no packet, so it has no act.
- No verb, no eval and no `docs/capabilities.md` row (N23). The proof is
  a live probe run for the core tasks and a rerun of the closest existing
  scenarios for the harness tasks (contract 3.6).
- Owned paths (contract 2.5): `packages/core/src/wow/areas/threat/*`,
  `packages/core/test-support/areas/threat.ts`,
  `packages/harness/src/areas/threat/*`,
  `packages/devtools/src/probe-flows/threat-*.ts`, `docs/areas/threat.md`,
  `docs/protocol-coverage/threat.md` (regenerated only).
- Leases wanted (contract 2.7): `tools/look.ts` with the `UnitView` block
  of `contract/views.ts` (D13), `ops/danger.ts`, and `tools/engage-approach.ts`
  (the engage loop). Plus `ops/views.ts`, which has no lease candidate
  (contract issue 1).

Tasks, in order (one at a time in the unit, contract 0.1):

| Id | Title | Opcodes | Size | Depends on |
|---|---|---|---|---|
| `threat-1` | Threat tables | 4 | M | `S0-5`, `SEED-1`, `T-2`, `T-3` |
| `threat-2` | Reactions and target breaks | 3 | S | `threat-1` |
| `threat-3a` | Threat rows in the game log | 0 | S | `threat-2` |
| `threat-3b` | Threat in `look` and the danger view | 0 | M | `threat-3a`, leases on `look.ts`, `views.ts`, `danger.ts` |
| `threat-3c` | Target breaks end the engage target | 0 | S | `threat-3b`, lease on `engage-approach.ts` |

The design's `threat-3` is split into three parts (contract 0.10), so
each lease is held by one short task (D12). A dependency on `threat-3`
means `threat-3c`.

## Contract issues

These are gaps found while planning. The contract is not changed. The
plan works around each one as stated, and each workaround is a decision
**accepted by the maintainer (P2-5)**.

1. **`ops/views.ts` has no lease.** `UnitView` rows are built by
   `unitViews` in `packages/harness/src/ops/views.ts:205` (`attackingMe:
   row.attackingMe`), not in `tools/look.ts`. Contract 2.7 lists no lease
   for `ops/views.ts`. The plan fills the three new fields in `look.ts`
   with a decorate step over the rows `unitViews(ctx)` returns
   (`tools/look.ts:304`), so `ops/views.ts` stays untouched. If the
   builder finds the fields must be built in `ops/views.ts` (for example
   because another reader of `UnitView` needs them), `threat-3b` stops as
   `blocked` and names that file.
2. **The harness cannot import core's derived reads.** `index.ts` never
   gets a per-area line (contract 1.6), and the harness reaches core only
   through the barrel (contract 0.3). So `threatOn`, `engagedWith`,
   `aggroOn` and `pullMargin` (design 5.8) are split: core puts the
   per-table reads into the snapshot as plain data (sorted entries with
   percent and pull thresholds), and the per-guid reads are pure functions
   in the unit-owned harness file `packages/harness/src/areas/threat/reads.ts`
   over `AreaState<"threat">`. Contract 2.5 lists only `area.ts` and
   `tool*.ts` under `packages/harness/src/areas/<area>/`; the plan reads
   contract 0.2 ("split by responsibility into sibling files in the same
   directory, owned by the same unit") as allowing `reads.ts`.
3. **Rules see no party, pet, range or combat state.** `RuleInput`
   (`packages/harness/src/events/rules.ts:6-13,23-33,75`) carries the
   character's guid and name, `runActive`, `refOf` and name lookups, and no
   party list, pet guid, melee range or attacker list. The rules of
   `threat-3a` therefore use two proxies: a player guid (high part 0) other
   than the character's stands for a party member, and a pet guid (high
   type `0xF140`) stands for a pet. Per-unit memory ("first entry", "once
   per unit per victim") lives in a closure inside the `rules: () => ...`
   factory, not in `RuleMemo`. If the coordinator adds party and pet
   lookups to `RuleLookup` in a `COORD` commit first, the builder uses
   them instead.
4. **Pet guid in core.** The area design takes the pet guid from
   `CombatState.petCommand.pet`, which exists only after a pet command
   (`packages/core/src/wow/combat-store.ts:186-187`). The harness already
   reads the pet from the character's `UNIT_FIELDS.SUMMON`
   (`packages/harness/src/loops/combat-actions-pet.ts:22-31`). The store
   does the same through `deps.getEntity(deps.selfGuid())?.rawFields` with
   `UNIT_FIELDS` from `#wow/protocol/update-fields` and `joinGuid` from
   `#wow/protocol/packet` (both allowed value imports, contract 1.12),
   and falls back to `core.combat`'s `petCommand.pet`. `fieldOf` and
   `isUnit` live in `#wow/entity-store`, which an area may import only as
   a type, so the store reads `rawFields` directly.
5. **The engage fight path is not leased.** The design treats
   `target_broken` for the engage target like a lost target. The approach
   phase checks losses in `lossOf` (`packages/harness/src/tools/engage-approach.ts:71-80`),
   which is under the `tools/engage*.ts` lease. The fight itself runs in
   `packages/harness/src/loops/combat-actions*.ts`, which has no lease
   candidate. `threat-3c` covers the approach phase only and reports the
   fight-phase gap.
6. **Probe flow signature.** T-3 fixes the flow module shape
   (design 4.2). This plan names the flow file and its behaviour; the
   builder copies the shape of `packages/devtools/src/probe-flows/nearest.ts`
   as T-3 lands it. Its exact signature could not be determined before
   T-3 lands.

---

## Task threat-1: Threat tables

Rulings: SR1-threat-6, SR1-threat-10.

**codeArea:** `threat`. **Phase:** 1. **Size:** M. **Proof:** live.

**Files:**

- Create: `packages/core/src/wow/areas/threat/protocol.ts`,
  `packages/core/src/wow/areas/threat/protocol.test.ts`
- Create: `packages/core/src/wow/areas/threat/store.ts`,
  `packages/core/src/wow/areas/threat/store.test.ts`
- Create: `packages/core/src/wow/areas/threat/runtime.ts`,
  `packages/core/src/wow/areas/threat/runtime.test.ts`
- Create: `packages/core/src/wow/areas/threat/area.test.ts`
- Create: `packages/core/test-support/areas/threat.ts`
- Create: `packages/devtools/src/probe-flows/threat-fight.ts` (and its
  test, if T-3 gives flows tests)
- Create: `docs/areas/threat.md`
- Modify: `packages/core/src/wow/areas/threat/area.ts` (seeded by
  `SEED-1`), `packages/core/src/wow/areas/threat/opcodes.ts` (`uses`,
  `unseen`; never `owns`)
- Regenerate: `docs/protocol-coverage/threat.md` with `mise protocol:coverage`

**Depends on:** `S0-5` (the area mechanism and `areaRig`), `SEED-1` (the
`threat` seed), `T-2` (the tap, for the probe's received counts), `T-3`
(the probe).

**Opcodes:** `SMSG_HIGHEST_THREAT_UPDATE` (0x482), `SMSG_THREAT_UPDATE`
(0x483), `SMSG_THREAT_REMOVE` (0x484), `SMSG_THREAT_CLEAR` (0x485).

**Wire** (AzerothCore `Combat/ThreatManager.cpp`, all layouts agree with
wowm `threat/smsg_*.wowm`):

- 0x483: packed guid of the creature, `u32` count, then per entry a packed
  guid of the victim and `u32` threat x 100 (`:880-898`). 0x482 adds the
  packed guid of the new victim after the creature (`:884-885`). The list
  is not sorted (`:889`), skips offline refs (`:891-892`), and may hold 0
  entries (the count is written after the skip, `:886-897`).
- 0x484: packed guid of the creature, packed guid of the victim
  (`:872-878`).
- 0x485: packed guid of the creature (`:865-870`).
- The server sends a table at most once a second per creature
  (`Combat/ThreatManager.h:94`, `THREAT_UPDATE_INTERVAL = 1000`) to every
  player that sees the creature.

**Steps:**

- [ ] **Step 1: Write the packet builders.** In
  `packages/core/test-support/areas/threat.ts`, add
  `threatHighestThreatUpdateBody({ unit, newVictim, entries })`,
  `threatThreatUpdateBody({ unit, entries })`,
  `threatThreatRemoveBody({ unit, victim })` and
  `threatThreatClearBody({ unit })`, each returning `Uint8Array` from a
  `PacketWriter` (`packedGuidBig` at `protocol/packet.ts:211`,
  `uint32LE`). They write the fields in the order of the AzerothCore
  writers above. `entries` is `{ victim: bigint; threat: number }[]`, with
  `threat` the wire value (hundredths).
- [ ] **Step 2: Write the failing parser tests.** In `protocol.test.ts`:
  - `parseThreatUpdate(reader, { highest: false })` reads a creature guid
    with high bytes set (`0xF130...`, a creature) and three entries in the
    order 300, 900, 100, and returns them in wire order, not sorted.
  - `parseThreatUpdate(reader, { highest: true })` returns `newVictim`.
  - A count of 0 returns `entries: []`.
  - `parseThreatRemove` and `parseThreatClear` return `{ unit, victim }`
    and `{ unit }`.
  Test titles may name the AzerothCore writer line. Run
  `mise test packages/core/src/wow/areas/threat/protocol.test.ts` and see
  it fail on the missing module.
- [ ] **Step 3: Implement the parsers.** `protocol.ts` exports
  `parseThreatUpdate(reader, { highest })` returning
  `{ unit, newVictim?, entries: { victim, threat }[] }`, `parseThreatRemove`
  and `parseThreatClear`. `threat` stays the raw `u32`. Use
  `reader.packedGuidBig()` (`protocol/packet.ts:119`). Do not sort keys in
  object literals that read packets.
- [ ] **Step 4: Write the failing store tests.** In `store.test.ts`, over
  `new ThreatStore(deps, core)` with test deps:
  - 0x482 sets `victim` and replaces the entries; a later 0x483 replaces
    the entries and keeps `victim`.
  - A list is replaced whole: an entry missing from the next 0x483 is gone.
  - The snapshot's `entries` are sorted by threat, highest first, each
    with `pct` of the top entry (rounded to a whole number) and
    `isVictim`; the table carries `pullAt: { melee, ranged }`, the
    current victim's threat x 1.1 and x 1.3 (the rule of
    `Combat/ThreatManager.cpp:655-678`), or `undefined` with no victim.
  - 0x484 deletes one entry; when it was the victim, `victim` becomes
    `undefined`.
  - 0x485 deletes the table.
  - `forget(unit)` deletes the table and emits no event; `clear()` deletes
    every table.
  - Events: `table` on every 0x483 (`unit`, `victim`, `entries`);
    `victim_changed` on a 0x482 whose new victim differs from the stored
    one (`unit`, `from`, `to`); `removed` (`unit`, `victim`); `cleared`
    (`unit`). A 0x482 with an unchanged victim emits `table`, not
    `victim_changed`.
- [ ] **Step 5: Implement the store.** `store.ts` exports:

  ```ts
  export type ThreatEntry = {
    victim: bigint;
    threat: number;
    pct: number;
    isVictim: boolean;
  };
  export type ThreatTable = {
    unit: bigint;
    victim: bigint | undefined;
    entries: readonly ThreatEntry[];
    pullAt: { melee: number; ranged: number } | undefined;
    updatedAt: number;
  };
  export type ThreatState = { tables: readonly ThreatTable[] };
  export type ThreatEvent =
    | { type: "table"; unit: bigint; victim: bigint | undefined; entries: readonly ThreatEntry[] }
    | { type: "victim_changed"; unit: bigint; from: bigint | undefined; to: bigint }
    | { type: "removed"; unit: bigint; victim: bigint }
    | { type: "cleared"; unit: bigint };
  export class ThreatStore { /* AreaStore<ThreatState, ThreatEvent> plus
    update, remove, clearTable, forget, clear */ }
  ```

  `threat-2` extends `ThreatState` and `ThreatEvent`. The emitter is a
  plain `new Emitter()`; the store sends nothing and arms no timer
  (contract 1.2). `updatedAt` comes from `deps.now()`.
- [ ] **Step 6: Write the failing runtime test.** In `runtime.test.ts`,
  over `areaRig("threat")`: after a 0x483 for unit U, an entity
  `disappear` for U on `rig.events.entity` removes U's table; an entity
  `update` whose entity has `health` 0 removes it too. After a
  `SMSG_NEW_WORLD` injected through the rig (a `uses` opcode, which the
  rig gives a no-op owner, contract 1.8), the store holds no table.
- [ ] **Step 7: Implement the runtime and registration.**
  - `runtime.ts` exports `threatRuntime(ctx, store)`: it calls
    `ctx.listen("entity", ...)` and calls `store.forget(guid)` on
    `disappear` and on an `update` whose entity is a unit at 0 health. It
    returns `{ act: {}, dispose }` and unsubscribes in `dispose`. This
    bounds memory near crowded fights (design 5.8 "Risks").
  - `area.ts` registers `on` for 0x482-0x485 and `peek` for
    `SMSG_NEW_WORLD`, which calls `store.clear()`. `eventTypes` lists the
    four event types. `store: (deps, core) => new ThreatStore(deps, core)`.
  - `opcodes.ts`: `uses: ["SMSG_NEW_WORLD"]`. The seed holds no `stubs`
    line for this area (all 7 were missing).
- [ ] **Step 8: Write the area test.** `area.test.ts`, over
  `areaRig("threat")`: inject each of the four opcodes built by the step 1
  builders and check `rig.handle.state()` and the events on
  `rig.handle.onEvent`. Run it and see it pass. Run the reviewer's revert
  check on your own tree once: without `protocol.ts`, `store.ts` and
  `runtime.ts` the tests fail.
- [ ] **Step 9: Write the probe flow.** `probe-flows/threat-fight.ts`, in
  the shape T-3 gives `nearest.ts`. It finds the nearest living hostile
  creature within 35 yd of the character, reads the pet guid from the
  character's `UNIT_FIELDS.SUMMON` (exported from `@peon/core`,
  `packages/core/src/wow/index.ts:134`), sends `handle.petAttack(pet,
  target)` when a pet exists, then `handle.cast(75, target)` (Auto Shot),
  and waits until the target dies, the character dies or 180 s pass. With
  `--arg pull=<n>` it attacks up to n creatures at once (pet on the
  first, Auto Shot on the others), so the pet or the character can die
  and the server sends 0x484. It uses only `@peon/core` and
  `@peon/core/session`. If T-3 gives flows tests, test the target choice
  and the stop conditions over a fake session.
- [ ] **Step 10: Live proof.** From the worktree root:
  1. `mise factory soap create eversong10-hunter` (note the account).
  2. `mise protocol:probe <ACCOUNT> --flow threat-fight --expect
     SMSG_HIGHEST_THREAT_UPDATE --expect SMSG_THREAT_UPDATE --expect
     SMSG_THREAT_CLEAR --wait 200`. Exit 0 proves 0x482, 0x483 and 0x485
     live. Record the received counts from the probe's JSON and whether a
     0x482 named the pet and later the character (a victim switch).
  3. `mise protocol:probe <ACCOUNT> --flow threat-fight --arg pull=3
     --expect SMSG_THREAT_REMOVE --wait 300`. Exit 0 proves 0x484 live.
     The server sends it when a victim on the list dies
     (`Combat/ThreatManager.cpp:576-581`, `:798-805`). If it exits 3 once,
     keep the mock proof: the `area.test.ts` case built from
     `Combat/ThreatManager.cpp:872-878`, add `SMSG_THREAT_REMOVE` to
     `unseen`, and write the proof row as `mock`, "not seen live".
  4. `mise factory soap delete <ACCOUNT>`.
  No `soap gm` command is needed. If the server or SOAP is down, report it
  and stop (contract 0.6). If the preset logs in with no pet, or Auto Shot
  fails, the flow still proves the four opcodes through any pull; record
  what happened. SOAP cannot read a threat table (`.debug threat` is
  `Console::No`, `src/server/scripts/Commands/cs_debug.cpp:84-85`), so the
  creature's `UNIT_FIELD_TARGET` in the probe output is the only
  independent evidence of the victim.
- [ ] **Step 11: Write `docs/areas/threat.md`** with the fixed headings of
  contract 3.8, present tense, no dates:
  - Wire notes: the value is threat x 100
    (`Combat/ThreatManager.cpp:894`); the list is unsorted (`:889`) and
    skips offline refs (`:891-892`); tables are full lists, not deltas.
  - Left out: none.
  - Capabilities row: "No verb (N23)".
  - Proof: one row each for 0x482, 0x483, 0x485 (`live`, the probe flow
    `threat-fight` and its exit code, source `Combat/ThreatManager.cpp:880-898`
    or `:865-870`) and 0x484 (`live` or `mock`, source
    `Combat/ThreatManager.cpp:872-878`). `threat-2` adds its three rows.
  Run `mise protocol:cite-check` and `mise lint:docs`.
- [ ] **Step 12: Checks.** `mise protocol:coverage`, then
  `mise typecheck core`, `mise typecheck devtools`,
  `mise lint packages/core/src/wow/areas/threat`, `mise ci:checks`.
- [ ] **Step 13: Commit.** `git add` the paths above, then
  `mise exec -- git commit`:

  ```
  feat: Read creature threat tables

  The server sends every engaged creature's threat list about once a
  second, and Peon dropped them. Keeping them gives the harness the
  server's own answer to who a creature is fighting.
  ```

  If the probe flow lands as a separate commit first, its subject is
  `chore: Add the threat fight probe flow`.

---

## Task threat-2: Reactions and target breaks

Rulings: SR1-threat-4.

**codeArea:** `threat`. **Phase:** 1. **Size:** S. **Proof:** live
(`SMSG_AI_REACTION`) and mock (`SMSG_BREAK_TARGET`, `SMSG_CLEAR_TARGET`).

**Files:**

- Modify: `packages/core/src/wow/areas/threat/protocol.ts` and
  `protocol.test.ts`, `store.ts` and `store.test.ts`, `area.ts` and
  `area.test.ts`, `opcodes.ts` (`unseen`)
- Modify: `packages/core/test-support/areas/threat.ts`
- Modify: `docs/areas/threat.md` (three proof rows, wire notes, left out)
- Regenerate: `docs/protocol-coverage/threat.md`

**Depends on:** `threat-1` (the same store and protocol files).

**Opcodes:** `SMSG_AI_REACTION` (0x13C), `SMSG_BREAK_TARGET` (0x152),
`SMSG_CLEAR_TARGET` (0x3BF).

**Wire:**

- 0x13C: full 8-byte guid, `u32` reaction
  (`Entities/Creature/Creature.cpp:2477-2487`, broadcast with self; pet
  form `Entities/Unit/Unit.cpp:12578-12587`, sent only to the owner with
  the pet's guid). Values: `ALERT` 0, `FRIENDLY` 1, `HOSTILE` 2, `AFRAID`
  3, `DESTROY` 4 (`src/server/shared/SharedDefines.h:3471-3478`). Only
  `ALERT` and `HOSTILE` have send sites. `HOSTILE` is sent once per new
  victim (`Entities/Unit/Unit.cpp:7097-7117,7174`), not on every attack
  as the wowm comment and the AzerothCore enum comment say.
- 0x152: packed guid of the unit (`Entities/Unit/Unit.cpp:15842-15847`),
  to every player in view except the unit.
- 0x3BF: full 8-byte guid of the caster (`Spells/SpellEffects.cpp:5019-5024`),
  only to players hostile to the caster.

**Steps:**

- [ ] **Step 1: Add the builders.** `threatAiReactionBody({ unit, reaction })`,
  `threatBreakTargetBody({ unit })` (packed guid) and
  `threatClearTargetBody({ caster })` (`uint64LE`).
- [ ] **Step 2: Write the failing parser tests.** `parseAiReaction`
  returns `{ unit, reaction, code }` with `reaction` one of `alert`,
  `friendly`, `hostile`, `afraid`, `destroy`, and `unknown` for any other
  code, without throwing (a case with code 9). `parseBreakTarget` returns
  `{ unit }` from a packed creature guid with high bytes set.
  `parseClearTarget` returns `{ caster }` from a full guid. Run
  `mise test packages/core/src/wow/areas/threat/protocol.test.ts` and see
  them fail.
- [ ] **Step 3: Implement the parsers** in `protocol.ts`.
- [ ] **Step 4: Write the failing store tests.**
  - A reaction from a unit is kept as the last reaction of that unit
    (`reactions`, one per unit, with `at`), and emits `reaction` with
    `unit`, `reaction`, `code` and `pet: false`.
  - A reaction whose guid is the character's pet (the character entity's
    `UNIT_FIELDS.SUMMON`; contract issue 4) sets `petReaction: { pet, at }`
    and emits `reaction` with `pet: true`. With no summon field, the
    `core.combat` `petCommand.pet` decides.
  - 0x152 emits `target_broken` with `unit` and `hostileOnly: false`;
    0x3BF emits it with `unit` (the caster) and `hostileOnly: true`.
    Neither changes core's selection (design 5.8 decision).
  - `forget(unit)` also drops that unit's reaction.
- [ ] **Step 5: Implement.** `ThreatState` gains
  `reactions: readonly { unit: bigint; reaction: AiReaction; code: number; at: number }[]`
  and `petReaction: { pet: bigint; at: number } | undefined`.
  `ThreatEvent` gains `reaction` and `target_broken`. `area.ts` registers
  the three opcodes and lists the two new event types.
- [ ] **Step 6: Area test.** Inject each opcode through `areaRig("threat")`
  and check state and events. These are the R22 mock proofs for 0x152 and
  0x3BF and for the `ALERT` value.
- [ ] **Step 7: Live proof.** Create an `eversong10-hunter` account and
  run `mise protocol:probe <ACCOUNT> --flow threat-fight --expect
  SMSG_AI_REACTION --wait 200`. Exit 0 proves 0x13C live (`HOSTILE` on the
  pull). Record whether a pet reaction arrived after `petAttack`
  (`Handlers/PetHandler.cpp:260`). Delete the account.
  `SMSG_BREAK_TARGET` and `SMSG_CLEAR_TARGET` have no live path today:
  their sources are Shadowmeld, Mirror Image, Killing Spree and a unit
  boarding a vehicle (`Spells/SpellEffects.cpp:5007-5017`,
  `Entities/Vehicle/Vehicle.cpp:448`), and no preset or puppet verb can
  make them. `ALERT` needs a stealthed player, and `.learn` is
  `Console::No` (`src/server/scripts/Commands/cs_learn.cpp:60`).
- [ ] **Step 8: Records.** `opcodes.ts`:
  `unseen: ["SMSG_BREAK_TARGET", "SMSG_CLEAR_TARGET"]` (plus
  `SMSG_THREAT_REMOVE` if `threat-1` left it there). `docs/areas/threat.md`:
  rows for 0x13C (`live`, `threat-fight`, source
  `Entities/Creature/Creature.cpp:2477-2487`), 0x152 (`mock`, the area test
  title, source `Entities/Unit/Unit.cpp:15842-15847`) and 0x3BF (`mock`,
  source `Spells/SpellEffects.cpp:5019-5024`); a wire note on `HOSTILE`
  once per victim; "Left out" names the `ALERT` value and the two target
  breaks as not seen live, with the reason. `mise protocol:coverage`,
  `mise protocol:cite-check`, `mise ci:checks`.
- [ ] **Step 9: Commit.**

  ```
  feat: Read creature reactions and target breaks

  A creature's aggro and alert reactions and a unit dropping out of
  targeting arrived as unhandled packets. The threat store now keeps them
  so the harness can react to a creature that noticed the character.
  ```

---

## Task threat-3a: Threat rows in the game log

Rulings: SR1-threat-2, SR1-threat-3, SR1-threat-8, SR1-threat-9.

**codeArea:** `threat`. **Phase:** 1. **Size:** S. **Proof:** live (a
rerun, N23).

**Files:**

- Modify: `packages/harness/src/areas/threat/area.ts` (seeded by
  `SEED-1`) and create `packages/harness/src/areas/threat/area.test.ts`
- Create: `packages/harness/src/areas/threat/reads.ts` and `reads.test.ts`
  (contract issue 2)

**Depends on:** `threat-2`. No lease.

**Opcodes:** none new.

**Steps:**

- [ ] **Step 1: Write the failing reads test.** `reads.ts` exports pure
  functions over `AreaState<"threat">`: `engagedWith(state, guid)` (every
  unit whose table holds `guid`), `aggroOn(state, guid)` (every unit whose
  `victim` is `guid`) and `threatOf(state, unit, guid)` (the entry of
  `guid` in the unit's table, with `pct` and `pullAt`). Test each over a
  hand-built state. Run `mise test packages/harness/src/areas/threat/reads.test.ts`.
- [ ] **Step 2: Implement `reads.ts`.**
- [ ] **Step 3: Write the failing rule tests** in `area.test.ts`, calling
  `threatHarness.rules?.()` and its `event` with a `RuleInput`:
  - `table`, `removed`, `cleared` and `reaction hostile` return `[]` (the
    flood guard: no fallback row for them).
  - `threat/engaged`: the first `table` whose entries hold `rc.selfGuid`
    for a unit returns one row, "<name> <ref> is fighting you.", class
    `wake` when `rc.runActive` is false and `log` inside a run. The next
    `table` for the same unit returns `[]`. After `removed` of the
    character or `cleared` for that unit, a new entry logs again.
  - `threat/aggro_switch`: `victim_changed` where `from` or `to` is the
    character, a pet guid or another player guid (contract issue 3)
    returns one `log` row, "<unit> <ref> turned from <from> to <to>."; it
    is `wake` when `to` is the character and `from` is another player.
  - `threat/pull_warning`: a `table` whose victim is another player and
    in which the character's threat has reached 90% of `pullAt.melee`
    returns one `log` row worded "near", naming the 110% melee rule; at
    most once per unit per victim. The rule cannot tell melee from ranged
    (contract issue 3), so it uses the melee threshold and says so in the
    text.
  - `threat/alerted`: `reaction` `alert` returns one `wake` row
    "<name> <ref> noticed you."
  - `threat/target_lost`: `target_broken` for a unit the rule has logged as
    engaged returns one `log` row "Your target <ref> vanished from
    targeting."
  Run the test and see it fail.
- [ ] **Step 4: Implement the rules** in `area.ts`: `glyph` of the
  combat rows (the builder picks the existing `GlyphName` the `combat`
  domain uses in `ui/draw.ts`), `worldActs: []`, and
  `rules: () => { ...closure memory...; return { event } }`. Row names:
  `engaged`, `aggro_switch`, `pull_warning`, `alerted`, `target_lost`
  (the router makes them `threat/<name>`, contract 1.9). Names come from
  `rc.lookup.unitName` and `rc.refOf`. No `attach` rule.
- [ ] **Step 5: Checks.** `mise typecheck harness`,
  `mise lint packages/harness/src/areas/threat`, `mise ci:checks`.
- [ ] **Step 6: Live proof.** Rerun the closest scenario of the "Combat
  and Jev" row (contract 3.6): `mise eval run t3-ghostlands-kill --round <n>` and
  `mise eval run t7-halt-resume --round <n>` (the
  grader passes `--packet-trace headers`, N18). From each run's game log
  and packet counts, record: the number of `threat/*` rows per fight, the
  number of threat fallback rows (must be 0 for the event types the rules
  cover), the journal rows per turn, and the 0x482-0x485 and 0x13C counts.
  Gates (D17): `t7-halt-resume` passes or fails only with the known stale
  `life/low_health` wake, quoted by the grader; `t3-ghostlands-kill` shows
  no failure cause that the R0 baseline run did not show. Neither needs
  to pass. Record the verdicts in the proof rows' evidence (the eval id
  and verdict) in `docs/areas/threat.md` only if a row changes; otherwise
  in the report.
- [ ] **Step 7: Commit.**

  ```
  feat: Log who is fighting you from threat

  The threat tables show a creature engaging the character before it
  swings, including casters. The log gains engage, aggro switch, pull
  warning and alert rows, and drops the once-a-second table updates.
  ```

---

## Task threat-3b: Threat in `look` and the danger view

Rulings: SR1-threat-1, SR1-threat-2, SR1-threat-7, SR1-threat-8, SR1-threat-9.

**codeArea:** `threat`. **Phase:** 1. **Size:** M. **Proof:** live (a
rerun, N23).

**Files (under leases):**

- Modify: `packages/harness/src/tools/look.ts` and `look.test.ts` (lease
  on `tools/look.ts`)
- Modify: `packages/harness/src/contract/views.ts`, the `UnitView` block
  only (D13, same lease)
- Modify: `packages/harness/src/ops/danger.ts` and `danger.test.ts` (lease
  on `ops/danger.ts`)

**Depends on:** `threat-3a` (`reads.ts`); the `look.ts` and `danger.ts`
leases. Not `ops/views.ts` (contract issue 1).

**Opcodes:** none new.

**Steps:**

- [ ] **Step 1: Write the failing `look` test.** With the harness mock
  game, stub `handle.threat.state` (`jest.spyOn`) to return a table on
  unit U whose victim is the character and whose entries hold the
  character at 100% and the pet at 60%. `look` shows U's row with
  "fighting you" and "aggro on you" and the character's share; a unit
  with no table shows no new text. The result's unit data carries
  `fightingMe: true`, `aggro: "you"` and `myThreatPct: 100`. The test calls
  `expectSendKind` once (contract 1.9). Run
  `mise test packages/harness/src/tools/look.test.ts` and see it fail.
- [ ] **Step 2: Implement.** `UnitView` gains optional
  `fightingMe?: boolean`, `aggro?: string` (`"you"`, or `<name> <ref>`) and
  `myThreatPct?: number`. `look.ts` decorates the rows of
  `unitViews(ctx)` with them from `ctx.handle.threat.state()` and
  `reads.ts`, and adds the words to `rowLine` (`tools/look.ts:201`) only
  for units with a table. `text.guidelines` gains one line: "fighting
  you" is the server's threat list, `aggro` is who the unit attacks now,
  and the share is your threat against its top entry. `look.ts` is 401
  lines: if the change passes 500 non-blank lines, move the decorate step
  into `packages/harness/src/areas/threat/reads.ts`.
- [ ] **Step 3: Write the failing danger tests.** In `danger.test.ts`:
  `dangerView` counts a unit whose table holds the character as an
  attacker when `getCombatState().attackers` does not hold it (a caster
  that never melees); a unit in both appears once. `watchInterrupts` with
  `newAttacker: true` fires `attacked` when a `victim_changed` event with
  `to` = the character arrives (`triggerAreaEvent("threat", ...)`) for a
  unit not yet known, and not for a known one.
- [ ] **Step 4: Implement** in `ops/danger.ts`: `dangerView`
  (`:84-92`) unions `attackers` with `engagedWith(state, self)`;
  `watchInterrupts` (`:164-204`) adds `handle.threat.onEvent` to its
  `offs` and reuses `onAttacked`'s `known` set.
- [ ] **Step 5: Checks.** `mise typecheck harness`, `mise lint` on the
  three files, `mise ci:checks`.
- [ ] **Step 6: Live proof.** Rerun `t0-hostiles` (the `look` row of
  "Which scenarios to run") and `t3-ghostlands-kill` with the D17 gates of
  `threat-3a`. Record the verdicts and one `look` line from the run's game
  log that shows the threat words during a fight, or say that none was
  captured.
- [ ] **Step 7: Commit.**

  ```
  feat: Show threat in look and the danger view

  A caster that never melees was missing from the danger view, and look
  could not say who a creature was attacking. Both now read the server's
  threat tables.
  ```

---

## Task threat-3c: Target breaks end the engage target

Rulings: SR1-threat-5, SR1-threat-7, SR1-threat-8, SR1-threat-9.

**codeArea:** `threat`. **Phase:** 1. **Size:** S. **Proof:** mock (the
event cannot be made live; a rerun checks for no regression).

**Files (under lease):**

- Modify: `packages/harness/src/tools/engage-approach.ts` and
  `engage-approach.test.ts` (lease on `tools/engage*.ts`)

**Depends on:** `threat-3b`; the engage lease.

**Opcodes:** none new.

**Steps:**

- [ ] **Step 1: Write the failing test.** In `engage-approach.test.ts`: a
  `target_broken` event for the chosen unit, emitted with
  `triggerAreaEvent("threat", ...)` during the approach, ends the approach
  with the loss `target_not_observed` ("is not in view any more"), not a
  cast at nothing. A `target_broken` for another unit changes nothing.
- [ ] **Step 2: Implement.** `lossOf` (`tools/engage-approach.ts:71-80`)
  also returns `LOSSES.gone` when the threat area reported a
  `target_broken` for `choice.guid` after the approach started. The
  approach subscribes with `handle.threat.onEvent` and unsubscribes when
  it ends. The selection is left as it is (design 5.8 decision).
- [ ] **Step 3: Checks.** `mise test` on the file, `mise typecheck
  harness`, `mise ci:checks`.
- [ ] **Step 4: Live check.** Rerun `t3-ghostlands-kill` and
  `t7-halt-resume` with the D17 gates. The event has no live source
  (`threat-2`), so the proof of the path is the test; the rerun shows no
  new failure cause.
- [ ] **Step 5: Report** the fight-phase gap (contract issue 5): the
  fight in `loops/combat-actions*.ts` still ignores `target_broken`.
- [ ] **Step 6: Commit.**

  ```
  feat: Drop an engage target that left targeting

  A unit that vanishes from targeting (Shadowmeld, Mirror Image, a
  vehicle) left the approach chasing it. The approach now ends with the
  target out of view, as it does for a despawn.
  ```

---

## Dead opcodes

None. All 7 `threat` rows are relevant: each has a live AzerothCore
writer (`Combat/ThreatManager.cpp:865-898`,
`Entities/Creature/Creature.cpp:2477-2487`,
`Entities/Unit/Unit.cpp:12578-12587,15842-15847`,
`Spells/SpellEffects.cpp:5019-5024`). The corrections of the research
move no opcode into or out of this unit.

`SMSG_SET_FORCED_REACTIONS` stays in the `world` unit.

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules every contract issue, lease request and decision of
this unit before `SEED-1`. All five tasks (`threat-1`, `threat-2`,
`threat-3a`, `threat-3b`, `threat-3c`) are in wave 1, so no issue of this
unit waits for a later wave. No ruling amends the contract or the design.
One ruling (SR1-threat-10) needs a `COORD-<n>` commit before `threat-1`
starts. Each ruling is **not
yet ruled by the maintainer**.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR1-threat-1 | Contract issue 1: "`ops/views.ts` has no lease. `UnitView` rows are built by `unitViews` in `packages/harness/src/ops/views.ts:205`" (`threat-3b`) | No lease on `ops/views.ts` for `threat-3b`. Contract 2.7 "Leases added by the plan fix-up" names `threat` for the observation files, but the plan "Leases" queue for `ops/views.ts` is `self-state-11b` → `combat-log-7b` → `self-state-10a`, and `threat-3b` needs no edit there. The decorate step in `tools/look.ts` over the rows of `unitViews(ctx)` stands, and the three new `UnitView` fields stay optional, so other readers of `UnitView` do not change. If the builder finds that the fields must be built in `ops/views.ts`, `threat-3b` stops `blocked` (contract 0.9) and names the file and the member; the coordinator then puts `threat-3b` at the head of that queue, before `self-state-11b` | accepted by the maintainer (P2-5) |
| SR1-threat-2 | Contract issue 2: "The harness cannot import core's derived reads ... the plan reads contract 0.2 ... as allowing `reads.ts`" (`threat-3a`, `threat-3b`) | The reading stands, with no amendment. `packages/harness/src/areas/threat/reads.ts` and `reads.test.ts` are sibling files of the unit-owned `area.ts` (contract 0.2), and the `threat` unit owns them. They are not tool modules, so the `tool*.ts` limit of contract 2.5 does not apply to them. Core keeps the per-table reads (`pct`, `isVictim`, `pullAt`) in the snapshot; the per-guid reads live in `reads.ts`. `tools/look.ts` and `ops/danger.ts` import `reads.ts` through `#harness/areas/threat/reads`. The overflow clause of `threat-3b` step 2 (the decorate step moves into `reads.ts`) also stands | accepted by the maintainer (P2-5) |
| SR1-threat-3 | Contract issue 3: "Rules see no party, pet, range or combat state. `RuleInput` ... carries ... no party list, pet guid, melee range or attacker list" (`threat-3a`) | The proxies stand: a player guid (high part 0) other than `rc.selfGuid` stands for a party member, and a guid with high type `0xF140` stands for a pet. Per-unit memory lives in a closure inside the `rules: () => ...` factory, not in `RuleMemo`, and the rule deletes a unit's entry on `cleared` for that unit and on `removed` of the character. The coordinator adds no party or pet lookup to `RuleLookup` before `threat-3a`; `events/rules.ts` does not change. The pull-warning text names the melee threshold, as the task body says | accepted by the maintainer (P2-5) |
| SR1-threat-4 | Contract issue 4: "Pet guid in core. The area design takes the pet guid from `CombatState.petCommand.pet`, which exists only after a pet command" (`threat-2`) | The workaround stands. The store reads the character's pet from `deps.getEntity(deps.selfGuid())?.rawFields` at `UNIT_FIELDS.SUMMON.offset` (low word) and the next offset (high word), joined with `joinGuid(low, high)`. `UNIT_FIELDS` comes from `#wow/protocol/update-fields` and `joinGuid` from `#wow/protocol/packet`, both allowed value imports (contract 1.12). A zero or missing field falls back to `core.combat`'s `petCommand.pet`. The store imports nothing from `#wow/entity-store` as a value | accepted by the maintainer (P2-5) |
| SR1-threat-5 | Contract issue 5: "The engage fight path is not leased ... `threat-3c` covers the approach phase only and reports the fight-phase gap" (`threat-3c`) | Refused: `threat-3c` takes no lease on `loops/combat-actions*.ts`. Contract 2.7 "Leases added by the plan fix-up" names `threat` for the engage loop files, but the plan "Leases" queue gives `loops/combat-actions.ts` and `loops/combat-actions-observation.ts` to other tasks and holds no threat task, and `target_broken` has no live source (`threat-2` step 7). The builder changes the approach phase only (`lossOf` in `tools/engage-approach.ts`) and reports the fight-phase gap in its report (step 5). The coordinator decides from that report whether a later task takes the fight phase | accepted by the maintainer (P2-5) |
| SR1-threat-6 | Contract issue 6: "Probe flow signature. T-3 fixes the flow module shape ... Its exact signature could not be determined before T-3 lands" (`threat-1`) | T-3 has landed. The flow is `packages/devtools/src/probe-flows/threat-fight.ts` and exports `flow: ProbeFlow = { name: "threat-fight", usage, run }`; `loadFlows` refuses a flow whose `name` is not its file stem. `run({ handle, args, settle })` returns `Json`; `args.pull` arrives as a string. The flow may import `#tools/probe-flows` (`FlowContext`, `Json`, `ProbeFlow`, `others`, `entityType`) as `nearest.ts` does, besides `@peon/core` and `@peon/core/session`. `settle` gives up after 5 s (`SETTLE_MS`, `probe-run.ts:69`), so the wait of up to 180 s for the target or the character to die is the flow's own poll loop with `Bun.sleep`. `--wait` takes seconds (`probe-args.ts:66-69`), so `--wait 200` and `--wait 300` stand. T-3 gives flows no per-flow test, only the loader test `probe-flows.test.ts`; `threat-1` adds `probe-flows/threat-fight.test.ts` (owned through `probe-flows/threat-*.ts`, and skipped by `loadFlows`) for the target choice and the stop conditions over a fake `FlowContext` | accepted by the maintainer (P2-5) |
| SR1-threat-7 | "Leases wanted (contract 2.7): `tools/look.ts` with the `UnitView` block of `contract/views.ts` (D13), `ops/danger.ts`, and `tools/engage-approach.ts`"; the task bodies also edit `look.test.ts`, `danger.test.ts` and `engage-approach.test.ts`, which no lease row names (`threat-3b`, `threat-3c`) | The leases go as the plan "Leases" table queues them. `threat-3b` holds `packages/harness/src/tools/look.ts`, the `UnitView` block of `packages/harness/src/contract/views.ts` (D13) and `packages/harness/src/ops/danger.ts`; `threat-3c` holds `packages/harness/src/tools/engage-approach.ts`. A lease on a legacy file also covers its colocated test file of the same stem (`look.test.ts`, `danger.test.ts`, `engage-approach.test.ts`) and nothing else. When `threat-3b` lands, `tools/look.ts` goes to `objects-7`, `contract/views.ts` to `quests-2` and `ops/danger.ts` to `self-state-11b`; when `threat-3c` lands, `tools/engage-approach.ts` has no next holder | accepted by the maintainer (P2-5) |
| SR1-threat-8 | The live proofs of `threat-3a`, `threat-3b` and `threat-3c` write `mise eval run <id> --round <n>` and rerun `t3-ghostlands-kill` three times in one worktree | The round is 11 (a task's own runs in phase A, contract 3.6 and the plan "Eval loop"). A repeat of one scenario in round 11 in `proto-threat` adds `--replica <k>`: `t3-ghostlands-kill` runs with no `--replica` (the grader's default replica 1, `grader/cli.ts:115`) in `threat-3a`, with `--replica 2` in `threat-3b` and with `--replica 3` in `threat-3c`; `t7-halt-resume` runs with no `--replica` in `threat-3a` and with `--replica 2` in `threat-3c`; `t0-hostiles` runs with no `--replica` in `threat-3b`. A single `t7-halt-resume` failure runs again with the next free replica before it counts. The D17 gates of contract 3.6 apply as each task body states | accepted by the maintainer (P2-5) |
| SR1-threat-9 | Decision: "The design's `threat-3` is split into three parts (contract 0.10), so each lease is held by one short task (D12). A dependency on `threat-3` means `threat-3c`" | Stands. Contract 0.10 allows the split, and each part has its own test cycle | accepted by the maintainer (P2-5) |
| SR1-threat-10 | Found while ruling SR1-threat-6: the T-3 loader test pins the flow list, `expect([...flows.keys()].sort()).toEqual(["login", "nearest", "talk"])` (`packages/devtools/src/probe-flows.test.ts:115-117`), so a new `threat-fight.ts` fails a test that the `threat` unit does not own (`threat-1`) | Before `threat-1` starts, the coordinator changes that one test in a `COORD-<n>` commit so that it no longer pins the full list: it checks that the loaded names contain `login`, `nearest` and `talk` (`expect.arrayContaining`). The loader already refuses a flow whose `name` is not its file stem, so the test keeps its purpose. This covers every unit that adds a flow. Until that commit lands, `threat-1` stops `blocked` on its first edit of `probe-flows/threat-fight.ts` (contract 0.9) and names this file and test | accepted by the maintainer (P2-5) |

## Build rulings

| Id | Issue | Ruling | Status |
|---|---|---|---|
| BR-threat-1-1 | `threat-1` step 10.2: `mise protocol:probe` logs in with no game data. `packages/devtools/src/probe-account.ts` dropped `spell_data_dir`, so `ClientConfig.dbc` was undefined, `loadFactions` rejected (`packages/core/src/wow/runtime-data.ts:41`), `unit-relation` gave `unknown` and `nearby.ts` marked every unit not attackable. The `threat-fight` flow therefore found no hostile creature | The coordinator changes `probe-account.ts` (a T-3 file) in one `COORD` commit: the probe's `ClientConfig` carries `dbc` read from the account config's `spell_data_dir`, as the harness profile does (`packages/harness/src/config/profile.ts:112`). Devtools does not import the harness, so the probe keeps its own copy of the directory reader. Every later probe flow that reads factions or spells depends on this | accepted by the maintainer (P2-5) |
