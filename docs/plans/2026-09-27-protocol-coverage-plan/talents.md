# talents: talent points, talent resets and glyphs (key: talents)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.11 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).

## What the unit delivers

The character reads its own talent state at every login, spends its
talent points (one talent or a whole plan in one request), resets its
talents at a class trainer without paying more than the agent allows,
and puts a glyph in a named slot or takes it out. The agent gets a new
tool `talents` (`do: show | learn | glyph | unglyph`), a new
`interact do:"reset_talents"` step, a "N talent points free" line in
`look`, and `talents/*` rows in the game log.

- Unit `talents`, one code area `talents` (design 5.1). Worktree
  `proto-talents`, branch `proto/area-talents` (contract 0.1):

  ```
  orca-ide worktree create --name proto-talents \
    --base-branch origin/factory/426-protocol-coverage \
    --parent-worktree active --setup run \
    --comment 'owner: coordinator, item 4 talents'
  git branch -m proto/area-talents
  ```

- Phase: wave 1 for `talents-1` (N22 pulls the passive
  `SMSG_TALENTS_INFO` parse forward, because it removes a login stub);
  wave 3 for `talents-2` to `talents-5b` (design 5.1). One task at a
  time; each starts from the current `origin/factory/426-protocol-coverage`
  after the previous one landed. Order: 1, 2, 3a, 3b, 4a, 4b, 5a, 5b.
- Owned opcodes: 7 rows, 5 relevant and 2 dead (design 5.11). The verify
  corrections move no row into or out of this area. They correct one
  fact: `SMSG_TALENTS_INFO` is sent at every login at every level, not
  from level 10 (`Entities/Player/Player.cpp:11786`, no level check in
  `:14840-14849`). Uses (peek): `SMSG_BUY_FAILED`, whose legacy owner
  stays in `gameplay-handlers.ts:355` (talents-4a).
- Shared piece it owns (N28, contract 2.5): `protocol/talent-spec.ts`,
  the per-spec talent and glyph block reader that `inspect` (unit
  `social`) reuses for `SMSG_INSPECT_TALENT`.
- Names (contract D7, with the `time` and `objects` precedent):
  `TALENTS_OPCODES`, `talentsArea`, `TalentsStore`, `TalentsState`,
  `TalentsEvent`, `TalentsActs`, `talentsRuntime`, `talentsHarness`,
  `talentsTool`. Store event types (contract 1.2, `/^[a-z_]+$/`): `info`,
  `points`, `pet_info`, `wipe_offer`, `wipe_refused`, `refused`. Log rows
  use the area domain: `talents/points`, `talents/learned`,
  `talents/refused`, `talents/wipe_offer`, `talents/reset`,
  `talents/glyph` (contract 1.9: the router sets `domain: "talents"`).
- Test packet builders live in `packages/core/test-support/areas/talents.ts`
  as `talents<Opcode>Body(...)` (contract 1.8).
- Scenario ids (design 5.2): `t8-talents-spend`, `t8-talents-reset`,
  `t8-talents-glyph`. The area design's `t8-glyph` does not apply.

Paths without a prefix are under `packages/core/src/wow/`.

### Unit files

| Path | Created by |
|---|---|
| `areas/talents/opcodes.ts`, `areas/talents/area.ts` | `SEED-1` (the unit removes its stub line, fills `uses`, `dead`, `unseen`) |
| `protocol/talent-spec.ts` and test | talents-1 |
| `areas/talents/protocol.ts` and test | talents-1 (grows in 3a, 4a, 5a) |
| `areas/talents/fields.ts` and test | talents-1 |
| `areas/talents/store.ts` and test | talents-1 (grows in 3a, 4a, 5a) |
| `areas/talents/catalog.ts` and test | talents-2 |
| `areas/talents/rules.ts` and test | talents-3a |
| `areas/talents/runtime.ts` and test | talents-3a (grows in 4a, 5a) |
| `packages/core/test-support/areas/talents.ts` | talents-1 (grows in 2, 3a, 4a, 5a) |
| `packages/harness/src/areas/talents/area.ts` and test | `SEED-1`; rules from talents-1, `worldActs` from 3b, 4b, 5b |
| `packages/harness/src/areas/talents/tool.ts`, `tool-learn.ts`, `tool-glyph.ts` and tests | talents-3b, talents-5b |
| `packages/harness/src/tools/interact-talents.ts` and test | talents-4b, under the `interact` lease (the `interact-trainer.ts` precedent, `interact.ts:29-31`) |
| `packages/devtools/src/probe-flows/talents-learn.ts`, `talents-reset.ts`, `talents-glyph.ts` | talents-3a, 4a, 5a |
| `packages/harness/src/grader/scenarios/t8-talents-spend.json`, `t8-talents-reset.json`, `t8-talents-glyph.json` | talents-3b, 4b, 5b |
| `docs/areas/talents.md` | talents-1 (each later task adds its proof rows) |
| `docs/protocol-coverage/talents.md` | regenerated only |

### Leases this unit needs (contract 2.7)

| Legacy file | Task | Edit |
|---|---|---|
| harness `tools/look.ts` | talents-3b | one self line "N talent points free" when N > 0 |
| harness `tools/interact.ts` and the `interactParams` block of `tools/params.ts` | talents-4b | the `reset_talents` entry in `STEPS` (`interact.ts:133` holds `train`), the `do` enum value and `max_cost` |
| `protocol/item.ts` | talents-5a, after objects-4 lands (D12 handover) | `ItemUseRequest.glyphIndex`, written at the u32 after the item guid |
| `combat-types.ts`, `combat-casts.ts` | talents-5a | contract issue 2 below |

No lease on `player-state.ts`: see contract issue 1.

### Contract issues found while planning

These are gaps, not changes. The coordinator rules on each (contract
precedence 3). Until then the plan works as stated.

1. **Self fields without `readSelfField`.** Design 5.11 says
   `readSelfField` gains `CHARACTER_POINTS1`, `GLYPH_SLOTS_1`, `GLYPHS_1`
   and `GLYPHS_ENABLED`. But an area source may not import
   `#wow/player-state` or `#wow/entity-store` as a value (contract 1.12),
   so the whitelist edit would give the area nothing. The store reads the
   four fields from `deps.getEntity(deps.selfGuid())?.rawFields` with the
   offsets of `PLAYER_FIELDS` (`protocol/update-fields.ts:277,323-325`),
   which is on the allow-list. `SessionDeps` carries both functions
   (`session-stores.ts:17-22`). objects-1 reads `rawFields` the same way.
   So this unit needs no `player-state.ts` lease, and the design text
   "`readSelfField` gains them" is not built. If the coordinator rules
   that the design text binds, talents-1 adds the four offsets to the
   `visible` list at `player-state.ts:30-40` under a lease in the same
   commit.
2. **The glyph index has no path to the wire.** `buildUseItem` is reached
   only through `item-use.ts:109-126` → `combat.ts:119-121`
   (`CombatRuntime.useItem`) → `combat-casts.ts:82-93` (`sendItem`), which
   builds a fresh `ItemUseRequest` from `CombatItem` (`combat-types.ts:8-13`)
   and drops any extra field. `client.ts:292` (`useItem(bag, slot)`) is
   frozen. talents-5a sends through the existing cast-count owner, the
   store entry point `core.combat.casts.sendItem` (the call that
   `combat.ts:121` makes), and needs one optional field in three files:
   `ItemUseRequest.glyphIndex` (`protocol/item.ts`, on the list for
   talents), `CombatItem.glyphIndex` (`combat-types.ts`, on no lease) and
   the pass-through in `sendItem` (`combat-casts.ts`, the `spells` lease).
   Without a lease on all three, talents-5a stops as `blocked`. No second
   cast-count source is built.
3. **The `refused` event.** Design 5.11 lists five events but also a log
   row "refused (with the local reason)". A refusal is found by the
   runtime, not by a packet, so the store gains a `noteRefused(entries)`
   entry point that the runtime calls and that emits `refused`. The store
   still sends nothing and arms no timer.
4. **Proof rows for opcodes not built yet.** As in objects issue 5:
   talents-1 creates `docs/areas/talents.md` and lists the four unbuilt
   relevant opcodes under "Left out" as "built by talents-<n>"; each later
   task moves its row into the proof table.
5. **The `interact` row of `docs/harness.md`.** talents-4b names
   `reset_talents` in the existing `interact` row. Contract 2.6 allows
   only a new tool row, and the lease on a tool module (D13) does not
   name docs. objects-7 has the same gap. The plan assumes a lease on an
   existing tool module also covers that tool's row in the
   `docs/harness.md` tool table.
6. **D25 amends design 5.11.** The design gives `talents do:"show"` kind
   `read`. Contract D25 makes the whole `talents` tool kind `action`:
   `show` runs sequentially and is refused while the human drives in PLAY
   mode. The free-points line in `look` (a parallel read) covers the
   common case.

---

## talents-1: Parse talent info and read talent fields

Rulings: SR1-talents-1, SR1-talents-2, SR1-talents-3, SR1-talents-4, SR1-talents-5.

**Files:**
- Create: `packages/core/src/wow/protocol/talent-spec.ts` and
  `protocol/talent-spec.test.ts`
- Create: `areas/talents/protocol.ts`, `areas/talents/fields.ts`,
  `areas/talents/store.ts` and their tests
- Modify: `areas/talents/area.ts`, `areas/talents/opcodes.ts` (delete the
  `SMSG_TALENTS_INFO` `stubs` line; `dead` gains
  `CMSG_UNLEARN_TALENTS` and `SMSG_TALENTS_INVOLUNTARILY_RESET`)
- Create: `packages/core/test-support/areas/talents.ts`
- Modify: `packages/harness/src/areas/talents/area.ts` and create its test
  (rules for `points` and `info`)
- Create: `docs/areas/talents.md`
- Regenerate: `docs/protocol-coverage/talents.md`

**Depends on:** item6, `S0-5`, `SEED-1` (wave 1 seed), `T-2` (tap), `T-3`
(probe), `T-4` (cite-check).

**Opcodes:** `SMSG_TALENTS_INFO` (both forms).

**Steps:**

1. **Failing spec-block test** (`protocol/talent-spec.test.ts`).
   `readTalentSpec(r)` reads one spec as `Player.cpp:14734-14766` writes
   it: `u8 n`, n x (`u32 talentId`, `u8 rank`), `u8 glyphCount`,
   glyphCount x `u16 glyphId`, and returns `{ talents: [{ talentId, rank
   }], glyphs: number[] }` with `rank` 0-based. Cases: an empty spec with
   six zero glyphs (AC always writes 6, `MAX_GLYPH_SLOT_INDEX`,
   `src/server/shared/SharedDefines.h:664`); a spec with two talents and
   one glyph. See it fail (module missing). `inspect` calls the same
   function on its own reader, so it takes a `PacketReader` and nothing
   else.
2. **Failing parser test** (`areas/talents/protocol.test.ts`).
   `parseTalentsInfo(r)` reads `u8 type` (`Player.cpp:14840-14849`) and
   returns:
   - `{ kind: "player", freePoints, specCount, activeSpec, specs }` for
     type 0: `u32` free points, `u8` spec count, `u8` active spec, then
     `specCount` blocks through `readTalentSpec`;
   - `{ kind: "pet", freePoints, talents }` for type 1
     (`Player.cpp:14768-14838`); with no pet AC stops after the points,
     so the 6-byte body `01 00000000 00` gives zero talents
     (`:14770-14778`);
   - a thrown `unknown_talents_info_type` for any other type byte.
   Bodies come from `talentsTalentsInfoBody` and
   `talentsTalentsInfoPetBody` in `test-support/areas/talents.ts`, built
   from those writer lines: a level-1 login (0 points, 1 spec, no
   talents, six zero glyphs), a level-12 character with three ranks in
   one tree, a two-spec character with active spec 1, and the empty pet
   form. The wowm layout agrees (`spell/smsg_talents_info.wowm:8-30`);
   wowm types the talent id as the named enum `Talent`
   (`spell/cmsg_learn_talent.wowm:8`), the parser reads a raw `u32`.
   Run `mise test packages/core/src/wow/areas/talents/protocol.test.ts`
   and see it fail.
3. **Failing field test** (`areas/talents/fields.test.ts`).
   `talentFields(deps)` returns `{ freePoints, slotTypes, glyphs,
   enabledMask }` from the self entity's `rawFields` at
   `PLAYER_FIELDS.CHARACTER_POINTS1` (1020), `GLYPH_SLOTS_1` (1312, 6),
   `GLYPHS_1` (1318, 6) and `GLYPHS_ENABLED` (1324)
   (`protocol/update-fields.ts:277,323-325`; AC
   `Entities/Object/Updates/UpdateFields.h:342,388-390` with `UNIT_END`
   148). A missing self entity gives `undefined` fields, never zeros
   (contract issue 1).
4. **Failing store test** (`areas/talents/store.test.ts`, `areaRig("talents")`).
   - Inject a player-form packet: `handle.state().player` holds it; one
     `info` event carries the diff against the previous packet (talents
     gained or lost as `{ talentId, from, to }`, free points before and
     after, active spec, glyph slots changed). The first packet diffs
     against an empty state.
   - Inject the same packet again: one `info` event with an empty diff.
     `info` fires on every player-form packet, so an act's `until` on
     `info` always resolves.
   - Inject a packet with more free points and no rank change (a level-up
     or a GM reset): `info` and then `points { before, after }`.
   - Inject the pet form: `state().pet` holds it; one `pet_info` event;
     no `info` event, and `player` is unchanged.
   - A packet that arrives before the self entity exists is kept: the
     store does not need the entity.
   - `snapshot()` gives per slot `{ index, typeId, unlocked, glyphId }`,
     with `unlocked` from bit i of `GLYPHS_ENABLED` (`Player.cpp:13614-13625`;
     the bits are read, never a level table) and `glyphId` from the
     packet's active spec.
   See them fail.
5. **Implement.** `TalentsStore` with state `{ player, pet, fields }`
   (`fields` read at `snapshot()` time from `talentFields`), a plain
   `new Emitter()`, and events `info`, `points`, `pet_info`.
   `register` calls `wire.on(SMSG_TALENTS_INFO, ...)`. The store sends
   nothing. `area.ts` wires `store` and `register`; `eventTypes` lists the
   three types.
6. **Harness rules** (`packages/harness/src/areas/talents/area.test.ts`,
   then `area.ts`). `points` gives one `log` row `talents/points`
   ("3 talent points free (level 12)."; level from the self view);
   `info` with gained ranks gives one row `talents/learned` per talent
   (`data: { talentId, rank, freePoints }`, rank shown 1-based); `info`
   with an empty diff gives `[]` (the flood guard, G17); `pet_info`
   gives `[]` (the `pets` unit reads the store). `glyph: "system"` until
   a talent glyph exists.
7. **Doc.** Create `docs/areas/talents.md` with the headings of contract
   3.8. Wire notes: ranks are 0-based on the wire
   (`Player.cpp:14368`, `MAX_TALENT_RANK 5` at
   `src/server/shared/DataStores/DBCStructure.h:1954`); the pet form
   shares the opcode and is 6 bytes with no pet; `CMSG_REMOVE_GLYPH`
   carries a slot index, not a glyph id
   (`Handlers/CharacterHandler.cpp:1606-1612` against wowm's field name
   `glyph` in `spell/cmsg_remove_glyph.wowm:1-5`). Left out: the four
   unbuilt relevant opcodes with "built by talents-<n>"; the two dead
   rows. Capabilities row: "Added by talents-3b." Proof: rows for
   `SMSG_TALENTS_INFO` and the two dead opcodes.
8. `mise protocol:coverage`, `mise protocol:cite-check`,
   `mise ci:checks`.

**Proof:** live. On a new `fresh` account:
`mise protocol:probe <ACCOUNT> --flow login --expect SMSG_TALENTS_INFO
--bodies --wait 5`. The capture holds both forms: the player form from
`Player.cpp:11786` and the pet form from `Handlers/CharacterHandler.cpp:1270`.
A second trigger with the character online:
`mise factory soap gm <ACCOUNT> level 12` (`character level` is
`Console::Yes`, `src/server/scripts/Commands/cs_character.cpp:74`; the
level change sends the packet at `Player.cpp:2610`). The capture must
show free points 3 and a `talents/points` row in the harness log of the
same run. The worker also records, from the first login of an
`eversong10-warrior` account, whether the template has points spent
(design 5.11 risk; area design question 8). Delete the account.
Proof rows: `SMSG_TALENTS_INFO` `live` (probe `login`, exit code; source
`Entities/Player/Player.cpp:14840-14849`); `CMSG_UNLEARN_TALENTS` `dead`
(`Server/Protocol/Opcodes.cpp:662`, `STATUS_NEVER`, `Handle_NULL`);
`SMSG_TALENTS_INVOLUNTARILY_RESET` `dead` (no writer in `src/`;
registration only at `Server/Protocol/Opcodes.cpp:1405`; wowm
`spell/smsg_talents_involuntarily_reset.wowm:1`).

**Commit:**

```
feat: Read talent points and talents at login

The talent info packet was a stub, so the character never knew its free
points or its talents. The talents area now parses both forms of the
packet and logs new points and new ranks.
```

---

## talents-2: Talent catalog from DBCs

**Files:**
- Create: `areas/talents/catalog.ts` and `areas/talents/catalog.test.ts`
- Modify: `packages/core/test-support/areas/talents.ts` (packed DBC
  fixtures)
- Modify: `docs/areas/talents.md` (Wire notes: the four DBC formats)

**Depends on:** talents-1.

**Opcodes:** none.

**Steps:**

1. **Failing catalog test.** Build the four files with `packDbc` from
   `packages/core/test-support/dbc.ts` and serve them with `dbcFiles`.
   Specs from AC `src/server/shared/DataStores/DBCfmt.h:58,59,121,122`
   and `DBCStructure.h:1059-1072,1958-1986`:

   | File | Fields / record bytes | Fields read |
   |---|---|---|
   | `Talent.dbc` | 23 / 92 | 0 id, 1 tab, 2 row, 3 column, 4-8 rank spell ids, 13 prerequisite talent, 16 prerequisite rank |
   | `TalentTab.dbc` | 24 / 96 | 0 id, 20 class mask, 21 pet mask, 22 tab page |
   | `GlyphProperties.dbc` | 4 / 16 | 0 id, 1 spell id, 2 type flags |
   | `GlyphSlot.dbc` | 3 / 12 | 0 id, 1 type flags, 2 order |

   The builder checks each index against `DBCfmt.h` before writing the
   test. Cases: `talent(id)` gives `{ id, tab, row, column, ranks: number[]
   (spell ids, zeros dropped), requires?: { talentId, rank } }`;
   `tab(id)` gives `{ classMask, petMask, page }`; `talentsForClass(classId)`
   filters by `classMask & (1 << (classId - 1))`; `glyph(id)` gives
   `{ spellId, typeFlags }`; `slotType(typeId)` gives `{ typeFlags, order }`;
   `slotForIndex(i)` returns the row whose `order` is i + 1
   (`Entities/Player/Player.cpp:13607-13610`). A source that rejects any
   file makes `loadTalentCatalog` reject with `missing_spell_data`.
   Run `mise test packages/core/src/wow/areas/talents/catalog.test.ts`
   and see it fail.
2. **Implement.** `loadTalentCatalog(source: DbcSource)` opens the four
   files with `openDbc` and wraps each in a `DbcTable`, like
   `loadSpellCatalog` (`spell-catalog.ts:140-150`) and
   `loadFactionTemplates` (`faction-template.ts:1`). The runtime of
   talents-3a loads it lazily from `ctx.dbc` (contract D4) and caches the
   promise, as `runtime-data.ts:19-45` does; `ctx.dbc` undefined rejects
   with `missing_spell_data`. Names come from the spell catalog (the
   rank-1 spell's name), not from `TalentTab.dbc`'s locale strings.
3. `mise ci:checks`.

**Proof:** unit (no opcode). The configured `spell_data_dir` holds only
`Spell*.dbc`, `FactionTemplate.dbc` and `SkillLineAbility.dbc` (design
5.11); where the four files come from is design open question 7.2.5.
Until the maintainer rules, the catalog is absent at run time, and
talents-3a runs in the degraded mode of design 5.11. If the files are in
`spell_data_dir` when this task runs, the worker also loads them once
through `loadTalentCatalog` and records the talent count for its class
in the report. No DBC file is committed.

**Commit:**

```
feat: Load the talent and glyph catalog

Local refusal reasons and talent names need Talent, TalentTab,
GlyphProperties and GlyphSlot rows. The catalog loads them lazily from
the client data directory and fails like the spell catalog when absent.
```

---

## talents-3a: Learn talents in core

**Files:**
- Create: `areas/talents/rules.ts`, `areas/talents/runtime.ts` and their
  tests
- Modify: `areas/talents/protocol.ts`, `store.ts`, `area.ts` and tests;
  `packages/core/test-support/areas/talents.ts`
- Create: `packages/devtools/src/probe-flows/talents-learn.ts`
- Modify: `docs/areas/talents.md`; regenerate
  `docs/protocol-coverage/talents.md`

**Depends on:** talents-1, talents-2.

**Opcodes:** `CMSG_LEARN_TALENT`, `CMSG_LEARN_PREVIEW_TALENTS`.

**Steps:**

1. **Failing builder tests** (`protocol.test.ts`).
   `buildLearnTalent({ talentId, rank })` writes `u32`, `u32` as
   `HandleLearnTalentOpcode` reads them (`Handlers/SkillHandler.cpp:25-32`;
   wowm `spell/cmsg_learn_talent.wowm:1-6`). `buildLearnPreviewTalents(entries)`
   writes `u32` count, then `u32` pairs (`SkillHandler.cpp:34-56`; wowm
   `spell/cmsg_learn_preview_talents.wowm:1-13`), and throws
   `too_many_talents` above 150, because AC reads at most 150 and drops
   the rest (`:44-47`, `:55`). See them fail.
2. **Failing rule tests** (`rules.test.ts`, pure functions over a
   snapshot and a catalog). One case per rule of `Player::LearnTalent`,
   each test title naming the line it mirrors (`Player.cpp:14268-14400`):
   `unknown_talent`; `wrong_class` (`:14298`); `bad_rank` (rank above 4 or
   a rank with no spell id); `rank_held`; `no_points`; `not_enough_points`
   (a jump of several ranks costs `rank - held + 1`, `:14316`);
   `tier_locked` (points in the tab below `row * 5`, `:14363`);
   `needs_prerequisite` (`:14327`). `orderPlan(plan, snapshot, catalog)`
   sorts by row, then by prerequisite, and applies each step to a copy so
   later entries see earlier ones; an entry that is still illegal after
   ordering is refused, never sent.
3. **Failing runtime tests** (`runtime.test.ts`, `areaRig` with a
   `dbc` built from the talents-2 fixtures).
   - One legal entry: `handle.act.learnTalents([{ talentId, rank }])`
     sends one `CMSG_LEARN_TALENT`; inject the next player-form
     `SMSG_TALENTS_INFO` with the rank: the result is `[{ talentId, rank,
     outcome: "learned" }]`.
   - Two legal entries: one `CMSG_LEARN_PREVIEW_TALENTS` with both.
   - An injected pet-form packet does not resolve the wait (the `until`
     matches `info` only, and pet packets emit `pet_info`).
   - A reply without the rank: `refused_by_server` (a script hook can veto
     with no reason, `Player.cpp:14290`).
   - No reply in 5 s: `no_reply` (fake timers inside `try`/`finally`).
   - A local refusal sends nothing and calls `store.noteRefused`, which
     emits `refused { entries }` (contract issue 3).
   - A second call while one is in flight throws `talent_request_busy`.
   - **Degraded mode** (design 5.11 decision): with `dbc` undefined the
     catalog load rejects; the act skips local rules, sends the plan in
     the given order and reports every unmet entry as
     `refused_by_server`. The result carries `catalog: false`.
   See them fail.
4. **Implement** `TalentsActs.learnTalents(plan)` in `talentsRuntime`: one
   request in flight, the catalog loaded once from `ctx.dbc`, the class
   from byte 1 of the self entity's `UNIT_FIELDS.BYTES_0`
   (`protocol/update-fields.ts:69`), read from `rawFields` like
   `talentFields`, the send through `ctx.send`, the wait
   through `ctx.until((e) => e.type === "info", { timeoutMs: 5000 })`.
   `area.ts` gains `runtime`; `eventTypes` gains `refused`.
5. **Probe flow** `talents-learn`: `--arg plan=<talentId>:<rank>[,...]`
   (0-based ranks) calls `handle.talents.act.learnTalents` and prints
   the result and the reply.
6. Proof rows, `mise protocol:coverage`, `mise protocol:cite-check`,
   `mise ci:checks`.

**Proof:** live. New `eversong10-warrior` account;
`mise factory soap setup <ACCOUNT> level '{"level":12}'` while offline
(body shape from `packages/factory/src/realm-service.test.ts:114`), which
gives 3 points (`level - 9`, `Player.cpp:13938-13960`) if the template
spent none (talents-1 records this).
- `CMSG_LEARN_TALENT`: `mise protocol:probe <ACCOUNT> --flow talents-learn
  --arg plan=124:0 --expect SMSG_TALENTS_INFO --expect SMSG_LEARNED_SPELL
  --bodies`. Talent 124 is Improved Heroic Strike in the wowm `Talent`
  enum (`spell/cmsg_learn_talent.wowm:55`); the builder confirms its row
  from `Talent.dbc` field 2 when the file exists, or from the reply. The
  reply must hold talent 124 rank 0 and free points 2.
- `CMSG_LEARN_PREVIEW_TALENTS`: the same flow with `--arg
  plan=124:1,130:0` (130 is Deflection, `spell/cmsg_learn_talent.wowm:61`;
  row confirmed the same way). One `SMSG_TALENTS_INFO` follows the batch
  (`SkillHandler.cpp:53`) with free points 0.
- If a talent of the preset's class other than 124 and 130 is needed
  (another class, or a row that proves wrong), the builder picks two row-0
  talents of that class from `Talent.dbc` or the wowm enum and records
  the ids in the proof row.
Delete the account. No GM command.

**Commit:**

```
feat: Learn talents with local checks

The character had points it could not spend. The talents area now
checks a plan against the server's own rules, sends one learn or one
preview batch, and reports each rank as learned or refused.
```

---

## talents-3b: The talents tool: show and learn

**Files:**
- Create: `packages/harness/src/areas/talents/tool.ts`,
  `packages/harness/src/areas/talents/tool-learn.ts` and their tests
- Modify: `packages/harness/src/areas/talents/area.ts` and test
  (`worldActs: ["learnTalents"]`, the `refused` rule)
- Modify (lease): `packages/harness/src/tools/look.ts` and its test
- Append: `packages/harness/src/contract/result.ts` (`ToolName` gains
  `"talents"` at the end of the union)
- Append: `packages/harness/src/tools/registry.ts` (`GAME_TOOLS` gains
  `talentsTool` at the end, with its import)
- Append: `docs/harness.md` (one row in the tool table)
- Create: `packages/harness/src/grader/scenarios/t8-talents-spend.json`
- Append: `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
  `docs/capabilities.md`, `docs/evals.md` (the talents row)
- Modify: `docs/areas/talents.md` ("Capabilities row")

**Depends on:** talents-3a, `S0-3`, `S0-4`, lease on `tools/look.ts`.

**Opcodes:** none (harness).

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

1. **Failing tool tests** (`tool.test.ts`, the harness `tool-harness`
   helpers, a mock game).
   - `{ "do": "show" }` lists free points, spec count and active spec,
     each learned talent as "Name r/max (Tab)" when the catalog is
     loaded, or "talent <id> rank <r>" in degraded mode, and the glyph
     slots. It sends nothing.
   - `{ "do": "learn", "plan": [{ "talent": "Improved Heroic Strike",
     "rank": 1 }] }` resolves the name through the catalog, converts rank
     1-5 to 0-4, calls `handle.talents.act.learnTalents` inside
     `ctx.rt.mutex.run`, and returns one line per entry: "Learned Improved
     Heroic Strike 1/3 (Arms). 2 points left." or "Mortal Strike not
     learned: tier locked (Arms has 5 of 20 points)." A raw id is
     accepted in both modes; a name in degraded mode fails with
     `names_need_talent_data`.
   - The tool is kind `action` (contract 1.9, D25); `show` is refused in
     PLAY mode like any action. `expectSendKind(talentsTool)` passes.
   - Minimal call: `{ "do": "show" }`.
   Spell names for talents come from the spell catalog the harness
   already reads; the builder finds the entry point with
   `rg -n "spellName|catalog" packages/harness/src/tools` (could not
   determine it here).
2. **Failing rule test** (`area.test.ts`): `refused` gives one `log` row
   `talents/refused` per entry with the reason.
3. **Failing look test** (`look.test.ts`): with free points 3 in
   `handle.talents.state()`, the self section holds "3 talent points
   free"; with 0 it holds nothing.
4. **Implement** the tool module (`talentsTool`, split into `tool.ts` and
   `tool-learn.ts`, both under 500 lines), the look line, the
   `ToolName` member, the `GAME_TOOLS` entry and the `docs/harness.md` row
   `| \`talents\` | Shows talents and glyphs and spends talent points. |`.
   `prompt/harness-doc.test.ts` then requires the tool name in that doc.
5. **Scenario** `t8-talents-spend.json`:
   - `preset: "eversong10-warrior"`, `setup: [{ "endpoint": "level",
     "body": { "level": 12 } }]`, `tier: 8`, `partner: null`,
     `navBound: false`, `task: "Spend all your talent points."`;
   - check `spent` (`source: "game_log"`, `evidence.events:
     ["talents/learned", "talents/points"]`): the rows add 3 ranks and the
     last `talents/learned` row has `freePoints` 0. These rows come from
     the server's `SMSG_TALENTS_INFO`, so they meet the grading rule
     "a server packet in the harness game log" (`docs/evals.md:12-16`).
   Append the id to `ROUND_1`; run
   `mise test packages/harness/src/grader/scenarios.test.ts`.
6. **Run the eval:** `mise eval run t8-talents-spend --round <n>`
   (babysat as omp with Muse, R10). Record the verdict.
7. **Docs in the same commit (D15):** on `pass`, append
   `| Spend talent points | \`t8-talents-spend\` | Learns only for the
   active spec. A server refusal has no reason on the wire; the reason
   shown comes from local rules. |` to "Proven by a scenario" in
   `docs/capabilities.md`; on `fail` or `blocked`, the bullet
   `- Spend talent points (\`t8-talents-spend\`, <the gap>).` under "Not
   shown by any scenario" (D16). Add the row
   `| Talents (\`talents\`, \`interact reset_talents\`) | \`t8-talents-spend\` |`
   to "Which scenarios to run" in `docs/evals.md`. `docs/areas/talents.md`
   "Capabilities row" gets the same row.
8. `mise ci:checks`, then `mise lint:docs`.

**Proof:** eval `t8-talents-spend`. Also the gates of contract 3.6:
`t1-walk-to-npc` passes and `t7-halt-resume` shows no new failure cause
against the R0 baseline, because `look.ts` changed.

**Commit:**

```
feat: Add the talents tool

The agent could not see or spend its talent points. The talents tool
shows talents and glyphs and spends points from a plan, and look says
when points are free.
```

---

## talents-4a: Reset talents in core

**Files:**
- Modify: `areas/talents/protocol.ts`, `store.ts`, `runtime.ts`,
  `area.ts`, `opcodes.ts` (`uses` gains `SMSG_BUY_FAILED`) and tests;
  `packages/core/test-support/areas/talents.ts`
- Create: `packages/devtools/src/probe-flows/talents-reset.ts`
- Modify: `docs/areas/talents.md`; regenerate
  `docs/protocol-coverage/talents.md`

**Depends on:** talents-3a.

**Opcodes:** `MSG_TALENT_WIPE_CONFIRM` (both directions).

**Steps:**

1. **Failing parser and builder tests** (`protocol.test.ts`).
   `parseTalentWipeOffer(r)` reads `u64 npcGuid`, `u32 cost` as
   `Player::SendTalentWipeConfirm` writes them (`Player.cpp:9125-9132`;
   wowm `spell/msg_talent_wipe_confirm_server.wowm:5-8`); the "no talents"
   reply has guid 0 and cost 0 (`Handlers/SkillHandler.cpp:78-84`).
   `buildTalentWipeConfirm(npcGuid)` writes one `u64` as
   `HandleTalentWipeConfirmOpcode` reads it (`SkillHandler.cpp:58-63`;
   wowm `spell/msg_talent_wipe_confirm_client.wowm:3-5`). See them fail.
2. **Failing store tests** (`areaRig`). An offer with a guid sets
   `pendingOffer { npcGuid, cost, at }` and emits `wipe_offer`; a guid-0
   reply clears it and emits `wipe_refused`; the next player-form
   `SMSG_TALENTS_INFO` clears it; `pendingOffer` reads as expired 30 s
   after `at` (computed from `now()`, no timer). `register` adds
   `wire.peek(SMSG_BUY_FAILED, ...)` with `parseBuyFailed` from
   `#wow/protocol/*` and records the failure in the store for the reset
   in flight.
3. **Failing runtime tests.**
   `handle.act.resetTalents({ optionIndex, maxCost })`:
   - reads `core.quests.dialog`; no gossip dialog throws `gossip_not_open`
     and an absent option throws `option_not_offered` (the names of
     `quests-requests.ts:108-111`);
   - sends `CMSG_GOSSIP_SELECT_OPTION` built with `buildGossipSelectOption`
     (`protocol/gossip.ts:37`) from the dialog's guid and menu id;
   - awaits `wipe_offer` or `wipe_refused` (5 s); guid 0 returns
     `nothing_to_reset`;
   - `cost > maxCost` returns `too_expensive { cost }` and sends nothing
     more; core never confirms a cost the caller did not allow;
   - otherwise sends `buildTalentWipeConfirm(npcGuid)` and awaits an
     `info` (`reset { cost, freePoints }`), a `wipe_refused`, or a
     timeout (`no_reply`);
   - **AC reset bug** (design 5.11 decision): inject `SMSG_BUY_FAILED`
     then the guid-0 reply after the confirm. The result is
     `not_enough_money`, never `nothing_to_reset`, because
     `resetTalents` zeroes the counter before the money check
     (`Player.cpp:3890-3901`) and the handler then also sends the guid-0
     reply (`SkillHandler.cpp:78-84`).
   See them fail.
4. **Implement** `TalentsActs.resetTalents`, serialised with
   `learnTalents` (one talent request in flight). `eventTypes` gains
   `wipe_offer` and `wipe_refused`.
5. **Probe flow** `talents-reset`: `--arg npc=<entry> --arg
   max=<copper>` sends a gossip hello to the nearest creature of that
   entry (the T-3 `talk` flow), finds the option whose text starts
   "I wish to unlearn my talents" (case-insensitive; 438 rows in
   `data/sql/base/db_world/gossip_menu_option.sql`, for example `:71`,
   option type 16), calls `resetTalents` and prints the result.
6. Proof rows, `mise protocol:coverage`, `mise protocol:cite-check`,
   `mise ci:checks`.

**Proof:** live, both directions. New `eversong10-warrior` account at
level 12 (as talents-3a), `mise factory soap setup <ACCOUNT> money
'{"copper":20000}'` (`packages/factory/src/soap-service-cli.test.ts:44`),
and `soap setup <ACCOUNT> position` next to a class trainer of the
preset's race and class (body `{ map, o, x, y, z, zone }`,
`packages/harness/src/grader/spawn-slots.ts:141`). The trainer entry and
its spawn could not be determined here; the builder picks them from the
AC world data read-only (`data/sql/base/db_world/creature.sql` and the
trainer tables) and records the entry in the proof row. The option shows
only at level 10 or more at a trainer valid for the player
(`Entities/Player/PlayerGossip.cpp:96-98`, `Entities/Creature/Creature.cpp:1301-1308`).
- Spend points with the `talents-learn` flow, then
  `mise protocol:probe <ACCOUNT> --flow talents-reset --arg npc=<entry>
  --arg max=20000 --expect MSG_TALENT_WIPE_CONFIRM --expect
  SMSG_TALENTS_INFO --bodies`: the offer (server to client) carries
  cost 10000 on a first reset (`Player.cpp:3845-3847`), or 0 if the live
  `NoResetTalentsCost` is on (could not determine; `worldserver.conf.dist:2266`
  defaults it to 0, meaning off); the confirm (client to server) is
  accepted, and the reply shows free points 3.
- The guid-0 reply: run the flow again with no points spent; the reply
  has guid 0 and the result is `nothing_to_reset`.
- `mise factory soap gm <ACCOUNT> reset-talents` restores the character
  between runs if a run is interrupted.
Delete the account.

**Commit:**

```
feat: Reset talents at a class trainer

Respecs needed a trainer's wipe offer and a confirm the character could
not send. Core now takes the offer, refuses a cost above the caller's
limit, and reports a failed payment as not enough money.
```

---

## talents-4b: interact reset_talents

**Files:**
- Create (lease, the `tools/interact*.ts` glob):
  `packages/harness/src/tools/interact-talents.ts` and test
- Modify (lease): `packages/harness/src/tools/interact.ts` (one `STEPS`
  entry) and its test; the `interactParams` block of
  `packages/harness/src/tools/params.ts` (`do` gains `"reset_talents"`,
  a new optional `max_cost`)
- Modify: `packages/harness/src/areas/talents/area.ts` and test
  (`worldActs` gains `"resetTalents"`; rules for `wipe_offer`,
  `wipe_refused` and the reset `info`)
- Create: `packages/harness/src/grader/scenarios/t8-talents-reset.json`
- Append: `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
  `docs/capabilities.md`, `docs/evals.md` (the talents row)
- Modify: `docs/harness.md` (the `interact` row names `reset_talents`)

**Depends on:** talents-4a, talents-3b, lease on `tools/interact.ts` and
`tools/params.ts`.

**Opcodes:** none (harness).

**Steps:**

1. **Failing step tests** (`interact-talents.test.ts`, mock game). The step
   walks to the NPC and opens gossip like `train`
   (`tools/interact.ts:133`), picks the option whose text starts "I wish
   to unlearn my talents" (case-insensitive), then calls
   `handle.talents.act.resetTalents({ optionIndex, maxCost })`. With
   `max_cost` absent (0) and an offer of 10000 copper it returns
   "Talent reset costs 1g. Call again with max_cost 10000 to pay." and
   pays nothing; with `max_cost: 10000` it returns
   "Talents reset. 3 points free. Paid 1g."; `option_not_offered` says
   the trainer does not offer it (level below 10 or another class's
   trainer, `PlayerGossip.cpp:96-98`); `not_enough_money` and
   `nothing_to_reset` each have one line. The act sends
   `CMSG_GOSSIP_SELECT_OPTION` itself, so the quest runtime's request
   tracking (`quests.ts:135`) never sees it; the builder confirms in the
   live run that the legacy quest store still closes the gossip dialog
   after the reset, and reports it if it does not.
2. **Failing rule tests** (`area.test.ts`): `wipe_offer` gives
   `talents/wipe_offer` ("Talent reset offered for 1g by <npc>.",
   `data: { cost }`); a reset `info` (all ranks lost, points up) gives
   `talents/reset` (`data: { freePoints }`) and no `talents/points` row
   for the same packet; `wipe_refused` gives `[]` (the step reports it).
3. **Implement** the step, the `STEPS` entry, the params, and the
   `interact` row text in `docs/harness.md`.
4. **Scenario** `t8-talents-reset.json`: `preset: "eversong10-warrior"`,
   `setup: [{ "endpoint": "level", "body": { "level": 12 } }, {
   "endpoint": "money", "body": { "copper": 20000 } }]`, `navBound: true`,
   `task: "Spend your talent points, then have your class trainer reset
   them."`, and checks:
   - `money` (`source: "truth"`, `evidence: { "delta": ["money"],
     "truth": ["money"] }`): T delta money equals minus the cost in the GL
     `talents/wipe_offer` row (10000 on a first reset, or 0 if the live
     `NoResetTalentsCost` is on);
   - `reset` (`source: "game_log"`, `evidence.events:
     ["talents/wipe_offer", "talents/reset"]`): an offer, then a reset
     row with `freePoints` 3 (`level - 9`).
   The realm service has no talent endpoint (`packages/factory/src/realm-service.ts:8-27`),
   so the task spends first. If no class trainer is reachable on foot
   from the preset's spawn, the run is `blocked` and the task stops as
   `blocked` for the coordinator (spawn points are coordinator files,
   contract 3.3).
5. Run `mise eval run t8-talents-reset --round <n>`; commit with the D15
   docs as in talents-3b: capability `Reset talents at a class trainer`,
   limit "Pays only up to the cost the agent allows."; add the id to the
   talents row of `docs/evals.md`.
6. `mise ci:checks`, `mise lint:docs`.

**Proof:** eval `t8-talents-reset`, plus the contract 3.6 gates
(`interact.ts` changed): `t1-walk-to-npc` passes; `t4-quest-first` and
`t5-vendor-buy-goldshire`, which use `interact`, show no new failure
cause against the R0 baseline.

**Commit:**

```
feat: Reset talents with interact

The agent had no way to respec. interact reset_talents asks the class
trainer, shows the cost, and pays only when the agent allows that cost.
```

---

## talents-5a: Glyphs in core

**Files:**
- Modify (lease, after objects-4): `packages/core/src/wow/protocol/item.ts`
  (`ItemUseRequest.glyphIndex`) and `protocol/item.test.ts`
- Modify (lease, contract issue 2): `combat-types.ts` (`CombatItem`
  gains `glyphIndex?: number`), `combat-casts.ts` (`sendItem` passes it)
  and `combat-casts.test.ts`
- Modify: `areas/talents/protocol.ts`, `store.ts`, `runtime.ts`,
  `area.ts` and tests; `packages/core/test-support/areas/talents.ts`
- Create: `packages/devtools/src/probe-flows/talents-glyph.ts`
- Modify: `docs/areas/talents.md`; regenerate
  `docs/protocol-coverage/talents.md`

**Depends on:** talents-4a, objects-4 (it changes `buildUseItem` first),
leases on `protocol/item.ts`, `combat-types.ts` and `combat-casts.ts`.

**Opcodes:** `CMSG_REMOVE_GLYPH`. Body fix of the handled `CMSG_USE_ITEM`
(the glyph index).

**Steps:**

1. **Failing builder tests.** `item.test.ts`: `buildUseItem` with
   `glyphIndex: 3` writes 3 in the `u32` after the item guid, which
   `HandleUseItemOpcode` reads as `glyphIndex`
   (`Handlers/SpellHandler.cpp:73`, rejects 6 or more at `:75-79`); no
   `glyphIndex` keeps 0, so today's bytes do not change.
   `combat-casts.test.ts`: `sendItem` with a `glyphIndex` sends it.
   `protocol.test.ts`: `buildRemoveGlyph(slot)` writes one `u32` slot
   index 0-5 (`Handlers/CharacterHandler.cpp:1604-1612`; AC wins over
   wowm's field name `glyph`) and throws `bad_glyph_slot` outside 0-5.
   See them fail.
2. **Failing runtime tests** (`areaRig`, catalog fixtures).
   - `removeGlyph(slot)`: an empty or out-of-range slot returns
     `slot_empty` and sends nothing, because AC is silent then
     (`CharacterHandler.cpp:1606-1633`); a filled slot sends
     `CMSG_REMOVE_GLYPH`, awaits `info`, and returns `removed` when the
     slot is 0 in the reply (`:1637-1639`).
   - `applyGlyph({ bag, slot, glyphSlot })`: refuses `slot_locked` (bit
     clear in `GLYPHS_ENABLED`), `not_a_glyph` (no GlyphProperties row
     for the item's spell), `wrong_slot_type` (GlyphProperties
     `typeFlags` against GlyphSlot `typeFlags`, the rule of
     `Spells/SpellEffects.cpp:4574-4580`), each sending nothing. A legal
     call reads the item from `core.rewards.snapshot().inventory` and its
     template from `core.items`, sends through
     `core.combat.casts.sendItem(ctx.send, spellId, { entry, bag, slot,
     guid, glyphIndex })` (the entry point `combat.ts:121` uses), and
     awaits `info` with the glyph in the slot (`applied`) or a combat
     cast failure through `ctx.listen("combat", ...)`:
     `SPELL_FAILED_GLYPH_SOCKET_LOCKED` gives `glyph_socket_locked`,
     `SPELL_FAILED_INVALID_GLYPH` gives `invalid_glyph`
     (`SpellEffects.cpp:4563-4567`, `:4576-4580`).
   - In degraded mode (no catalog) the local checks are skipped and the
     server's answer decides.
   See them fail.
3. **Implement** both acts, serialised with the other talent acts.
4. **Probe flow** `talents-glyph`: `--arg item=<entry> --arg slot=<0-5>`
   applies the glyph from the bags, then `--arg remove=<0-5>` removes a
   slot.
5. Proof rows, `mise protocol:coverage`, `mise protocol:cite-check`,
   `mise ci:checks`.

**Proof:** live. New `eversong10-warrior` account;
`soap setup <ACCOUNT> level '{"level":15}'` and `soap setup <ACCOUNT>
items/add '{"item":43395,"count":1}'` while offline (body shape
`packages/factory/src/realm-service.test.ts:73`). Item 43395 is Glyph of
Battle, class 16, required level 15 (`data/sql/base/db_world/item_template.sql:38782`);
the builder confirms it is a warrior glyph from the same row and picks
another class-16 row if the preset is not a warrior. Then
`mise protocol:probe <ACCOUNT> --flow talents-glyph --arg item=43395
--arg slot=<the unlocked slot of its type> --expect SMSG_TALENTS_INFO
--bodies` shows the glyph id in the slot (`SpellEffects.cpp:4611`), and
the same flow with `--arg remove=<slot>` shows `CMSG_REMOVE_GLYPH`
accepted: `SMSG_REMOVED_SPELL` and a reply with the slot 0
(`CharacterHandler.cpp:1637-1639`). Slot types come from `show` or the
`GLYPH_SLOTS_1` field. Delete the account. No GM command.
Proof rows: `CMSG_REMOVE_GLYPH` `live`; the `CMSG_USE_ITEM` body fix is
recorded in the Wire notes (it is not an owned opcode).

**Commit:**

```
feat: Apply and remove glyphs in core

Glyphs went only into slot 0 and could not come out. Core now sends the
glyph slot with the item use, checks slot locks and types first, and
removes a glyph by slot index as the server reads it.
```

---

## talents-5b: talents glyph and unglyph

**Files:**
- Create: `packages/harness/src/areas/talents/tool-glyph.ts` and test
- Modify: `packages/harness/src/areas/talents/tool.ts`, `area.ts` and
  tests (`worldActs` gains `"applyGlyph"` and `"removeGlyph"`; the
  `talents/glyph` rule)
- Create: `packages/harness/src/grader/scenarios/t8-talents-glyph.json`
- Append: `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
  `docs/capabilities.md`, `docs/evals.md` (the talents row)

**Depends on:** talents-5a, talents-3b.

**Opcodes:** none (harness).

**Steps:**

1. **Failing tool tests.** `{ "do": "glyph", "item": <bag ref>, "slot":
   <1-6 or a kind shown by show> }` calls `applyGlyph` inside
   `ctx.rt.mutex.run` and returns "Glyph of Battle in minor slot 2." or
   the refusal; `{ "do": "unglyph", "slot": 2 }` calls `removeGlyph`.
   Slots are 1-based in the tool and 0-based in core. `show` lists each
   slot with its kind, lock state and glyph.
2. **Failing rule test**: an `info` whose diff changes a glyph slot gives
   one `talents/glyph` row (`data: { slot, glyphId }`, `glyphId` 0 when
   cleared): "Glyph of Battle in minor slot 2." / "Glyph slot 2
   cleared."
3. **Implement.**
4. **Scenario** `t8-talents-glyph.json`: `preset:
   "eversong10-warrior"`, `setup: [{ "endpoint": "level", "body": {
   "level": 15 } }, { "endpoint": "items/add", "body": { "item": 43395,
   "count": 1 } }]`, `task: "Put your glyph in a glyph slot."`, one steer
   "Now take it out again." once the first glyph row exists (the steer
   shape of `t6-die-and-recover.json`; whether a trigger can match a
   game-log event could not be determined here, so the builder uses a
   trigger if the schema allows one and a delay otherwise), and checks:
   - `used` (`source: "truth"`, `evidence.items: [43395]`): delta -1
     (the glyph is consumed on use; the builder confirms from the item's
     spell charges in the same `item_template.sql` row);
   - `slots` (`source: "game_log"`, `evidence.events: ["talents/glyph"]`):
     a row with the glyph in a slot, then a row with that slot cleared.
5. Run `mise eval run t8-talents-glyph --round <n>`; commit with the D15
   docs: capability `Apply and remove glyphs`, limit "Active spec only.";
   add the id to the talents row of `docs/evals.md`.
6. `mise ci:checks`, `mise lint:docs`.

**Proof:** eval `t8-talents-glyph`.

**Commit:**

```
feat: Put glyphs in slots with the talents tool

The agent could not choose a glyph slot or clear one. talents glyph and
unglyph now do both, and the log shows each slot change.
```

---

## Dead opcodes

| Opcode | Reason |
|---|---|
| `CMSG_UNLEARN_TALENTS` 0x213 | Registered `STATUS_NEVER` with `Handle_NULL` (`Server/Protocol/Opcodes.cpp:662`). The server ignores it; resets go through `MSG_TALENT_WIPE_CONFIRM`. |
| `SMSG_TALENTS_INVOLUNTARILY_RESET` 0x4fa | No writer in AC `src/`: only its registration (`Server/Protocol/Opcodes.cpp:1405`). wowm says it "only exists as comment" (`spell/smsg_talents_involuntarily_reset.wowm:1`). |

talents-1 puts both in `TALENTS_OPCODES.dead` with `dead` proof rows.
Rows elsewhere that share this unit's code but are not its rows:
`SMSG_INSPECT_TALENT` (`social`, code area `inspect`, reuses
`protocol/talent-spec.ts`), `CMSG_PET_LEARN_TALENT` and
`CMSG_LEARN_PREVIEW_TALENTS_PET` (`pets`, which read the pet form through
`talents` state; design 5.12 runs pets-7 after `talents`). Dual spec (learn at a
trainer gossip option, switch with an effect-162 spell,
`Spells/SpellEffects.cpp:6477-6489`) stays with `spells` in the long
tail; this unit only reads `specCount` and `activeSpec`.

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules every contract issue, lease request and decision of
this unit that a wave-1 task meets, before `SEED-1`. The only wave-1 task
of this unit is `talents-1`. Contract issues 2, 3, 5 and 6 and every row
of "Leases this unit needs" are met only by wave-3 tasks (`talents-3a` to
`talents-5b`), so they wait for the `SEED-3` ruling pass and are not
ruled here. No ruling amends the contract or the design text before
`talents-1` starts, so no `COORD-<n>` commit and no lease line comes
before it. Each ruling is **accepted by the maintainer (P2-5)**.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR1-talents-1 | Contract issue 1: "Design 5.11 says `readSelfField` gains `CHARACTER_POINTS1`, `GLYPH_SLOTS_1`, `GLYPHS_1` and `GLYPHS_ENABLED`. But an area source may not import `#wow/player-state` or `#wow/entity-store` as a value (contract 1.12), so the whitelist edit would give the area nothing." (`talents-1`) | The workaround stands, and the alternative (a `player-state.ts` lease in the same commit) is refused. `areas/talents/fields.ts` reads the four fields from `deps.getEntity(deps.selfGuid())?.rawFields` at the offsets of `PLAYER_FIELDS` from `#wow/protocol/update-fields` (a value import on the contract 1.12 allow-list); `SessionDeps` carries `selfGuid` and `getEntity` and is the first argument of `store` (contract 1.2; `session-stores.ts:17-22`). `EntityLookup` is imported as a type only. A missing self entity gives `undefined` fields, never zeros. This ruling stands in for the design 5.11 words "`readSelfField` gains them": the area reads the fields itself, and `readSelfField` does not change. The plan "Leases" table has no `player-state.ts` row, so no task of this unit holds that file | accepted by the maintainer (P2-5) |
| SR1-talents-2 | Contract issue 4: "talents-1 creates `docs/areas/talents.md` and lists the four unbuilt relevant opcodes under 'Left out' as 'built by talents-<n>'; each later task moves its row into the proof table." Contract 3.8 says "Every opcode in the area's `owns` has exactly one row." (`talents-1`) | Stands, as for objects issue 5. Contract 3.8 "exactly one row" holds when the unit's last task lands; until then an owned opcode that is not built has exactly one line under "Left out" and no row in "Proof". `talents-1` writes the proof rows for `SMSG_TALENTS_INFO`, `CMSG_UNLEARN_TALENTS` and `SMSG_TALENTS_INVOLUNTARILY_RESET`, and one "Left out" line each for `CMSG_LEARN_TALENT` and `CMSG_LEARN_PREVIEW_TALENTS` (talents-3a), `MSG_TALENT_WIPE_CONFIRM` (talents-4a) and `CMSG_REMOVE_GLYPH` (talents-5a). No placeholder proof value is written. The landed `mise protocol:cite-check` checks citations, not row counts [M, `packages/devtools/src/cite-check.ts`]. If `mise lint:docs` refuses the words "built by talents-<n>", the line reads "Not built." with the reason; if any check requires a row for every owned opcode, the builder stops `blocked` and names the check | accepted by the maintainer (P2-5) |
| SR1-talents-3 | "Unit files": `areas/talents/opcodes.ts` and `areas/talents/area.ts` are created by `SEED-1`, and "the unit removes its stub line, fills `uses`, `dead`, `unseen`"; talents-1 "Modify: `areas/talents/opcodes.ts` (delete the `SMSG_TALENTS_INFO` `stubs` line; `dead` gains `CMSG_UNLEARN_TALENTS` and `SMSG_TALENTS_INVOLUNTARILY_RESET`)" (`talents-1`) | Stands. `SEED-1` moves the line `[GameOpcode.SMSG_TALENTS_INFO, "Talents"]` out of `STUBS` (`protocol/stubs.ts:52` [M]) into `TALENTS_OPCODES.stubs` and writes the seed shape of contract 1.5 with the seven owned opcodes of design 5.11 and `dead: []` (the two talents dead rows are not among the six senders of N13). `talents-1` edits only the unit files: it deletes that `stubs` entry, puts the two opcodes in `dead`, leaves `uses` and `unseen` empty, and never edits `protocol/stubs.ts`. If `SEED-1` has already put the two opcodes in `dead`, `talents-1` keeps them and adds only the proof rows. The harness `areas/talents/area.ts` from `SEED-1` gets its rules from `talents-1` | accepted by the maintainer (P2-5) |
| SR1-talents-4 | "Leases this unit needs (contract 2.7)" and "No lease on `player-state.ts`" (`talents-1` edits no legacy file) | `talents-1` holds no lease: its files are all unit files (contract 2.5) or files `SEED-1` creates for the unit. The four lease rows of this unit (`tools/look.ts` for talents-3b; `tools/interact.ts` and the `interactParams` block of `tools/params.ts` for talents-4b; `protocol/item.ts`, `combat-types.ts` and `combat-casts.ts` for talents-5a) are wave-3 requests and are ruled at `SEED-3`. If `SEED-1` splits `tools/params.ts` or `tools/look.ts` (plan "Phase A"), the talents rows move with the sibling file of the same tool or view (contract 2.7) | accepted by the maintainer (P2-5) |
| SR1-talents-5 | The `talents-1` proof plan: a GM level change on the online character (`mise factory soap gm <ACCOUNT> level 12`), and "The worker also records, from the first login of an `eversong10-warrior` account, whether the template has points spent (design 5.11 risk; area design question 8). Delete the account." (`talents-1`) | Stands. The GM command is allowed: it is a probe proof, not an eval, it runs through `mise factory soap gm` on the task's own character (contract 0.7), and the `level` verb exists (`packages/factory/src/soap-gm.ts:141` [M]). The worker creates two accounts, the `fresh` one for the probe and an `eversong10-warrior` one for the template record, logs the second in once with `mise protocol:probe <ACCOUNT> --flow login --expect SMSG_TALENTS_INFO --bodies`, records its free points and talent count in the report, and deletes both accounts before it reports done. If the capture of the `fresh` login holds no pet form, the worker records that in the report and in the Wire notes and does not claim the pet form as `live`; the store test from the `Player.cpp:14770-14778` writer covers it | accepted by the maintainer (P2-5) |
