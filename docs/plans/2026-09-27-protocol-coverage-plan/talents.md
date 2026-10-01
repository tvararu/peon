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

## Build rulings

| Id | Issue | Ruling |
|---|---|---|
| BR-talents-3a-1 | SR3-talents-5 says to subscribe to the `SMSG_TALENTS_INFO` reply after the send; the wave checklist says to subscribe before sending | Coordinator ruling (P2-17): subscribe before the send (the checklist), and release and consume the waiter when building or sending throws. SR3-talents-5 is amended to match. |
| BR-talents-5a-1 | SR3-talents-22 sets a 5 s `no_reply` for a glyph apply, but the glyph item's own cast takes 5 s (`SMSG_SPELL_START` timer 5000) and the talents reply comes after it | Coordinator ruling (P2-17): the 5 s reply budget starts when the observed cast ends: when the glyph cast's `SMSG_SPELL_START` arrives, the deadline moves to its cast time plus 5 s. SR3-talents-22 is amended to match. |

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

## Seed rulings (SEED-3)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-3 task meets, before `SEED-3`. The wave-3 tasks of this unit are talents-2, talents-3a, talents-3b, talents-4a, talents-4b, talents-5a, talents-5b (phase C). Each ruling is a coordinator ruling (P2-17). `core:` = `packages/core/src/wow/`, `h:` = `packages/harness/src/`, `cts:` = `packages/core/test-support/`, `dev:` = `packages/devtools/src/`. A task's own eval runs use the round number the coordinator hands the builder. The `SR3-talents-<n>` ids supersede nothing earlier; section "Coordinator edits for SEED-3" in the plan index holds the seed edits (the `SEED3-<n>` ids).

| Id | Issue and task | Ruling | Status |
|---|---|---|---|
| SR3-talents-1 | talents-2 Proof and design question 7.2.5: "where the four files come from"; P2-8 says degraded mode (ids) where talent and glyph DBCs are missing. | superseded by the coordinator decision (DBCs staged): `Talent.dbc`, `TalentTab.dbc`, `GlyphProperties.dbc` and `GlyphSlot.dbc` are staged, so talents-2 to talents-5b use the real catalog and prove it live (E1 is superseded); talents-2 loads the files once and records the talent count. Each task that reads a staged file through `ctx.dbc` adds its row to the `docs/harness.md` "DBC files" table. Draft text, kept as the no-file branch (P2-8 degraded ids): Ruled by F1: `Talent.dbc`, `TalentTab.dbc`, `GlyphProperties.dbc`, `GlyphSlot.dbc` are not in `spell_data_dir` and cannot be placed there by a worker. Every wave-3 talents task runs degraded in live and eval runs. `loadTalentCatalog` rejects with `missing_spell_data` when the source rejects any file (plan step 1, unchanged). talents-2 skips the plan's "load the files once and record the talent count" step and says "catalog absent" in its report. The DBC-present paths (rules, names, slot types) are proven by packed-DBC unit tests only and the docs say "not exercised live". **DESIGN** E1 asks the maintainer whether to supply the four files. | coordinator ruling (P2-17) |
| SR3-talents-2 | talents-2 layout. The plan lists `TalentTab` fields read as "0 id, 20 class mask, 21 pet mask, 22 tab page" and says names come from the spell catalog; the tool needs a tab name ("Learned Improved Heroic Strike 1/3 (Arms)", talents-3b). | Layouts confirmed against the AzerothCore SQL column lists: `Talent` 23 fields (ID, TabID, TierID, ColumnIndex, `SpellRank_1..9` at 4-12, `PrereqTalent_1..3` at 13-15, `PrereqRank_1..3` at 16-18, Flags, RequiredSpellID, `CategoryMask_1..2`), `TalentTab` 24 fields (ID, 17 name fields at 1-17, SpellIconID 18, RaceMask 19, ClassMask 20, PetTalentMask 21, OrderIndex 22, BackgroundFile 23), `GlyphProperties` 4 (ID, SpellID, GlyphSlotFlags, SpellIconID), `GlyphSlot` 3 (ID, Type, third column = `Order` in AzerothCore's struct `[INFERENCE]`). `tab(id)` also returns `name` = `localeString(file, row, 1)` (enUS, `dbc.ts:103`). Talent names still come from the rank-1 spell's name in `Spell.dbc` (present). The builder still checks the indexes against `DBCfmt.h` as the plan says. | coordinator ruling (P2-17) |
| SR3-talents-3 | talents-2 and `REQUIRED_DBC_FILES`. Reputation's `Faction.dbc` was added to `core: dbc-files.ts:8-19`, which drives the start-up warning (`h: runtime/dbc-check.ts`). | superseded by the coordinator decision (DBCs staged): the catalog is proven live, but the four talent files still do not join `REQUIRED_DBC_FILES` (no owner list holds `dbc-files.ts`); `TALENT_LAYOUTS` stays exported. Draft text, kept as the no-file branch (P2-8 degraded ids): Not added: the four talent files do not go into `REQUIRED_DBC_FILES`. The file is in no owner list, and by F1 four warnings would print at every start while the degraded mode is the designed path. The catalog exports `TALENT_LAYOUTS` (four `{ file, fields, recordSize }`) for a later maintainer decision (E1). | coordinator ruling (P2-17) |
| SR3-talents-4 | talents-3b needs a catalog reader (name to id, slot type), but `ctx.dbc` exists only inside the core runtime (plan talents-3a step 4). | talents-3a adds `TalentsActs.catalog(): Promise<TalentCatalog \| undefined>` (cached promise, as `areas/reputation/runtime.ts:33-38` loads its catalog; resolves `undefined` when `ctx.dbc` is undefined or the load rejects). It is a pure read and is not listed in the harness `worldActs` (that list names the sends gated in PLAY; the registry test checks each listed name is a function on the mock handle, `h: areas/registry.test.ts:31-34`; the read may still be listed, and it avoids the mutex). The tools call it inside no mutex. Export `TalentCatalog` types from `areas/talents/catalog.ts` through the area handle type (no `index.ts` edit: the harness reads `AreaActsOf<"talents">`). | coordinator ruling (P2-17) |
| SR3-talents-5 | talents-3a: `SMSG_TALENTS_INFO` arrives before the router attaches at login and on level change twice (talents-1 report lines 29, 56). `until((e) => e.type === "info")` matches the first of two equal packets after a level change. | The `learnTalents` act starts `until` AFTER the send, so a stale earlier packet cannot match. `no_reply` after 5 s. A reply that changes nothing (server silently refused, `Player.cpp:14272-14365`) resolves as `refused_by_server` per entry, not as an error. The duplicate-equal-info case (level change) is documented in the store, not handled. | coordinator ruling (P2-17) |
| SR3-talents-6 | talents-3a Proof numbers. By F2 the template holds talent 124 rank 1 at level 10. The plan's `plan=124:0` is a no-op and "3 points at level 12" is wrong. Talent 130 (Deflection) is row 0 of the same tab `[INFERENCE: wowm enum only, confirm from the reply]`. | New account `eversong10-warrior`, `soap setup <ACCOUNT> level '{"level":13}'` offline: 13 - 9 - 1 = 3 free. (1) `CMSG_LEARN_TALENT`: `--arg plan=124:1` (rank 2, wire rank 1; cost 1; needs no row check since row 0); the reply must hold talent 124 wire rank 1 and free 2. (2) `CMSG_LEARN_PREVIEW_TALENTS`: `--arg plan=124:2,130:0` (cost 2); one `SMSG_TALENTS_INFO` follows (`Handlers/SkillHandler.cpp:53`) with free 0 and talents 124 (wire rank 2) and 130 (wire rank 0). If 130 is not row 0 of the tab, the builder takes another row-0 talent of the warrior Arms tab from the wowm enum (`spell/cmsg_learn_talent.wowm:53-62`: 123, 125, 126, 127, 128, 129 are the neighbours) and records the ids. `SMSG_LEARNED_SPELL` also appears per rank (`Player.cpp:14349-14351`). Delete the account; `soap gm ... reset-talents` (verb exists, `soap-gm.ts:234`) restores a character if a run breaks. | coordinator ruling (P2-17) |
| SR3-talents-7 | talents-3a rules module in degraded mode and `orderPlan`. Plan: degraded runs skip local rules, send the plan in the given order and the result carries `catalog: false`. | Applies to the no-file branch only; with the staged files talents-3a uses the catalog rules and proves them live. Stands. Additionally in degraded mode the act still refuses without sending when it can be decided from the self state alone: no free points (`fields.freePoints` and `state.player.freePoints` both 0, `Player.cpp:14273-14276`) gives `no_points` for every entry, and a rank above 4 gives `bad_rank` (`:14283`). Everything else is left to the server. `buildLearnPreviewTalents` throws `too_many_talents` above 150 (`SkillHandler.cpp:44-47`). | coordinator ruling (P2-17) |
| SR3-talents-8 | talents-3a/4a/5a/3b: who may use the catalog act and the state in the tool? `areas/talents/store.ts` has no `noteRefused` (contract issue 3). | talents-3a adds `store.noteRefused(entries)` and the `refused` event (plan), with `eventTypes` gaining `refused` (`areas/talents/area.ts:11`). talents-4a adds `wipe_offer`, `wipe_refused`; the `uses` line `SMSG_BUY_FAILED` (owned by `buyback`'s `uses` and the legacy handler `gameplay-handlers.ts:379`, so the peek has an owner). The harness `area.ts` rules for each new event are added by the tool task that introduces them (`refused`: talents-3b; `wipe_offer`, `reset`: talents-4b; `glyph`: talents-5b), as the plan lists. | coordinator ruling (P2-17) |
| SR3-talents-9 | talents-3b Files: `tools/look.ts` and `tools/look.test.ts`; step 3 "self section holds 3 talent points free". F4. | talents-3b edits: `h: tools/look-self.ts` (`selfLine` appends `N talent points free.` after `poseText` when N > 0; the `Pick<LookAfter, ...>` type gains `talentPoints`; a new `talentView(ctx): Pick<LookAfter, "talentPoints">`), `h: tools/look.ts` (two lines: spread `...talentView(ctx)` beside `...castViews(ctx, snapshot.target)` at `:171` and `:203`), the `LookAfter` block of `h: contract/details.ts:40-58` (`talentPoints?: number`, rider of the look lease), and tests in `tools/look-self.test.ts` (37) plus a new `tools/look-talents.test.ts`; `look.test.ts` is not edited. `talentPoints` = `state.player?.freePoints ?? state.fields.freePoints` from `handle.talents.state()` (`areas/talents/store.ts` `snapshot`). The plan's "one self line" is therefore this sentence in the self line, not a second line. Gate: `t1-walk-to-npc` passes and `t7-halt-resume` shows no new cause (look.ts changed). | coordinator ruling (P2-17) |
| SR3-talents-10 | talents-3b Step 1, degraded mode: "`show` lists each learned talent as 'talent <id> rank <r>'" but the agent cannot know any id to learn; "a name in degraded mode fails with `names_need_talent_data`". | Applies to the no-file branch only; with the staged files `show` lists names from the catalog and the eval may use them. Stands, and is enough for the eval because the preset already holds talent 124 (F2): `show` prints `talent 124 rank 1`, the agent calls `learn` with `{ "talent": 124, "rank": 2 }` and then `3` (Improved Heroic Strike has 3 ranks `[INFERENCE, plan says 1/3]`). `show` in degraded mode adds one line: "Talent names need talent data; use ids." and the learn refusal `names_need_talent_data` names the ids `show` listed. The tool accepts `talent` as a number or digits string in both modes and ranks 1-5 for the wire 0-4. A rank above the talent's real maximum comes back `refused_by_server` (`Player.cpp:14336-14340`, zero spell id), which the tool prints as "The server did not accept rank N." | coordinator ruling (P2-17) |
| SR3-talents-11 | talents-3b scenario `t8-talents-spend`: `level 12`, "the rows add 3 ranks and the last `talents/learned` row has `freePoints` 0". | Correct numbers (F2): level 12 gives 2 free points. Check `spent` (`source: "game_log"`, events `talents/learned`, `talents/points`): at least two `talents/learned` rows and the last has `freePoints` 0. Rows come from the server's `SMSG_TALENTS_INFO` (the existing rule `areas/talents/area.ts:18-33`: `data.freePoints = event.pointsAfter`). The `talents/points` event is emitted only when points rise, so a level-up row may precede. Preset `eversong10-warrior` (already in `PRESETS`, `scenarios.test.ts:15`), `partner: null`, `navBound: false`, no `field`, `setup: [level 12]`, budget start 8 minutes, 15 tools, 8 turns. The `EVERSONG` grid takes it (F8). The limit cell in `docs/capabilities.md` says "Names need talent data; the agent spends by id." | coordinator ruling (P2-17) |
| SR3-talents-12 | talents-3b shared appends (`contract/result.ts` `ToolName`, `tools/registry.ts` `GAME_TOOLS`, `docs/harness.md`, `docs/capabilities.md`, `docs/evals.md`, `grader/scenarios.ts` `ROUND_1`). | Append-only contract 2.6 edits, no lease: `"talents"` at the end of the `ToolName` union and `talentsTool` at the end of `GAME_TOOLS` in one commit (otherwise `ALL_TOOLS_LISTED` fails to typecheck), as SR2-pets-13 ruled. On a rebase conflict each side keeps the other wave-3 tools' lines. `area.ts` `glyph: "system"` stays (no new glyph). | coordinator ruling (P2-17) |
| SR3-talents-13 | `docs/harness.md` is 437 non-blank lines (cap 500) and talents-3b, talents-4b add a row and a clause; other wave-3 tools add their rows. | talents-3b adds the one row the plan gives; talents-4b adds only a clause in the existing `interact` row. The coordinator counts the wave's `docs/harness.md` additions before the tool tasks run and splits the doc when the total would pass 480 (recommend a `docs/harness-tools.md` sibling for the tool table; not needed for these two rows alone). | coordinator ruling (P2-17) |
| SR3-talents-14 | talents-4a opcodes: `uses` gains `SMSG_BUY_FAILED`; parser `parseBuyFailed`. | Confirmed: `parseBuyFailed` exists (`core: protocol/vendor.ts:161-166`, `result` byte code 2 = `not_enough_money`, `:56`); the import is `#wow/protocol/vendor` (matches the allow-list regex `#wow\/protocol\/[\w-]+`). The peek records the failure only while a reset is in flight (store flag set by the act before the confirm). AzerothCore sends the buy error with guid 0 and item 0 on a failed payment (`Entities/Player/Player.cpp:3890-3901`), then the guid-0 wipe reply (`SkillHandler.cpp:78-84`): the act reports `not_enough_money` when the peek fired before the reply, never `nothing_to_reset`. | coordinator ruling (P2-17) |
| SR3-talents-15 | talents-4a Proof: class trainer and money. "The trainer entry and its spawn could not be determined here". By F9 Orgrimmar has no navigation data. `CanResetTalents` needs level >= 10 and a trainer valid for the player's class (`Entities/Creature/Creature.cpp:1301-1308`); the gossip option needs the same (`Entities/Player/PlayerGossip.cpp:96-98`). | Trainer: an Undercity warrior trainer, entries 4593 Christoph Walker, 4594 Angela Curthas, 4595 Baltus Fowler (`data/sql/base/db_world/creature_template.sql`, subname "Warrior Trainer", faction 68), spawned on map 0 at (1780.46, 422.93, -57.11), (1775.77, 409.61, -57.11) and (1767.26, 418.45, -57.11) (`creature.sql` rows 31897, 41841, 38128). Stage with `soap setup <ACCOUNT> position '{"map":0,"zone":1497,"o":0,"x":1775.77,"y":404.6,"z":-57.11}'` (about 5 yd south of 4594; z `[INFERENCE]`, the builder corrects it from the first login and records the final point in the proof row, because `talents-4b` needs it, SR3-talents-19) plus `money '{"copper":20000}'` and `level '{"level":12}'`, all offline. Proof per the plan with F2 corrections: the template already counts as a spent point, so the first reset needs no prior learn; first reset cost is 1 gold (`Player.cpp:3843-3850`, `m_resetTalentsCost` 0 `[INFERENCE]` for a fresh template), or 0 if the live `NoResetTalentsCost` is on (unknown); the reply shows free points 3 (`level 12 - 9`); the second run (nothing spent) gives the guid-0 reply. Undercity is a friendly Horde city; bots may be present (P2-9: never target, whisper or trade with RNDBOT characters; the flow targets only the trainer by guid). `soap gm <ACCOUNT> reset-talents` restores between runs. | coordinator ruling (P2-17) |
| SR3-talents-16 | talents-4a step 3: `resetTalents` reads `core.quests.dialog` and sends `CMSG_GOSSIP_SELECT_OPTION` itself; the plan lists no lease on the quest runtime and flags that `quests.ts:135` never sees the request. | Stands as written: `core.quests.dialog` is readable (`quest-store.ts:98`), `buildGossipSelectOption` is in `#wow/protocol/gossip` (`:37`, allow-list regex). No edit of `quest-store.ts` (its `openDialog` is leased to quests-7b → economy-9). The builder reports whether the dialog still closes after the reset (the plan's live confirmation); if it does not, that is a report note, not a blocker. | coordinator ruling (P2-17) |
| SR3-talents-17 | talents-4a `opcodes.ts` is in the owner list; talents-3a and -5a are not. | `opcodes.ts` is a unit file (contract 2.5): 4a adds `SMSG_BUY_FAILED` to `uses`. talents-3a and -5a need no `opcodes.ts` edit (`CMSG_LEARN_TALENT`, `CMSG_LEARN_PREVIEW_TALENTS`, `CMSG_REMOVE_GLYPH` are owned and go live). If a live try fails the opcode goes into `unseen` in that task's own commit. `MSG_TALENT_WIPE_CONFIRM` lists both directions in one row. | coordinator ruling (P2-17) |
| SR3-talents-18 | talents-4b Files: lease on `tools/interact.ts` and the `interactParams` block of `tools/params.ts` (F3); step 3 "the `STEPS` entry". The `InteractAction` type lives in `contract/details.ts:152`. | Remapped lease (queue row `tools/interact.ts`: `… travel-6 → economy-10 → talents-4b → pets-11 → economy-13 → guild-16`): `h: tools/interact.ts` (the `STEPS` map at `:141-152`, one entry `["reset_talents", resetTalentsStep]`, and the tool `text.description` at `:242-244` naming the verb), `h: tools/params-interact.ts` (`do` enum at `:12-24`, plus `max_cost: Type.Optional(Type.Integer({ minimum: 0 }))`), the `InteractAction` block of `h: contract/details.ts:152` (`| "reset_talents"`; `InteractAfter` keeps its shape, the reset text goes in `body`/`detail`), `h: tools/interact-talents.ts` (new, unit file) and tests in `interact-talents.test.ts`. `tools/interact.test.ts` (398) is not edited; `tools/interact-quest.ts` (471) is not edited (the step imports `gossipOf`, `baseAfter`, `send` and the other helpers from it, as `interact-trainer.ts` does). `tools/params.test.ts` (106) gains the enum line if it pins the list. Gates: `t1-walk-to-npc` passes; `t4-quest-first` and `t5-vendor-buy-goldshire` show no new cause. | coordinator ruling (P2-17) |
| SR3-talents-19 | talents-4b scenario needs a class trainer reachable from the spawn; plan: "If no class trainer is reachable on foot ... the run is `blocked`". F8, F9: the Eversong grid has no warrior trainer, a scenario `position` step is overwritten by the slot, and Kalimdor has no navigation. | DESIGN answered: E2 accepted under BR-wave3-3: talents-4b adds the `undercity-warrior` spawn from the position talents-4a verified live; the coordinator commit (SEED3-14) is not made. Named spawn `undercity-warrior` (scenario field `"spawn": "undercity-warrior"`, schema pattern `grader/scenario.schema.json` `spawn`), added by the coordinator to `NAMED` in `h: grader/spawn-slots.ts:237-246` AFTER talents-4a lands and BEFORE talents-4b starts (SEED3-14), using the position talents-4a verified live (SR3-talents-15). Map 0, zone 1497, `o` 0. `navBound: true` (Azeroth tile exists, F9). The scenario `setup` keeps `level 12` and `money 20000`; the grid position is appended by the grader. If the first eval shows an agent standing in geometry, talents-4b stops `blocked` naming the slot and the coordinator adjusts (spawn points are coordinator files, contract 3.3). talents-4b has no other file in `grader/`. | coordinator ruling (P2-17) |
| SR3-talents-20 | talents-4b scenario checks: `money` delta equals the `talents/wipe_offer` cost; `reset` row with `freePoints` 3. | Correct as planned with F2: a character at level 12 gets 3 points back (`level - 9`); the template's spent point means "Spend your talent points" is not needed first, so the task text is "Have your class trainer reset your talents." (one sentence; nothing to spend-check, P2-7 forbids new truth fields, the packet evidence is the `talents/wipe_offer` and `talents/reset` rows). The `money` check is `source: "truth"`, `evidence: { "delta": ["money"], "truth": ["money"] }` (`t8-items-open.json` shape): delta = minus the cost in the offer row (10000 on a first reset). Budget start 10 minutes, 18 tools, 8 turns. The limit cell "Pays only up to the cost the agent allows." stands. | coordinator ruling (P2-17) |
| SR3-talents-21 | talents-5a: leases on `protocol/item.ts`, `combat-types.ts`, `combat-casts.ts`; "after objects-4 lands". | Both earlier holders landed in wave 1: `ItemUseRequest` already has `target?` (`core: protocol/item.ts:103-110`, objects-4) and `CombatCasts.shiftCooldown` exists (`combat-casts.ts:98`, spells-5). The leases pass to talents-5a at the start of the task. Edits, nothing else: `ItemUseRequest.glyphIndex?: number` written at the `u32` after the item guid (`buildUseItem`, `item.ts:267-278`, default 0, so the bytes of every existing caller incl. `objects/open-acts.ts:205` are unchanged); `CombatItem.glyphIndex?: number` (`combat-types.ts:8-13`); `sendItem` passes `glyphIndex: item.glyphIndex` (`combat-casts.ts:147-159`, the only `buildUseItem` call in `combat-casts.ts`). Tests in `item.test.ts` (304) and `combat-casts.test.ts` (170). `CombatItem` is also the `item` of `CombatOutcome` (`combat-types.ts:23,37`): the extra optional field is harmless there. The server rejects `glyphIndex >= 6` with an equip error (`Handlers/SpellHandler.cpp:75-79`). | coordinator ruling (P2-17) |
| SR3-talents-22 | talents-5a results for `applyGlyph`: the plan lists `slot_locked`, `not_a_glyph`, `wrong_slot_type`, `glyph_socket_locked`, `invalid_glyph`. AzerothCore has a third cast failure and the `sendItem` throws. | With the staged catalog `wrong_slot_type` and `not_a_glyph` run and are proven live; the catalog-free branch is the draft text. Add `unique_glyph` (`SPELL_FAILED_UNIQUE_GLYPH`, 176, `protocol/spell-cast-result.ts:178`; `Spells/Spell.cpp:6370-6374`: the caster already has this glyph's aura) and map `sendItem`'s thrown errors `channelling` and `cast_in_progress` (`combat-casts.ts:148-149`) to results `busy`. The act awaits `info` with the glyph in the slot (`applied`) or a `combat` event of type `cast_failed` (`ctx.listen("combat", ...)`, `CoreEvents.combat`, `world-events.ts:30`; `CombatEventType` has `cast_failed`, `combat-types.ts:92`), else `no_reply` at 5 s. Local slot-lock rule (catalog-free, so it also runs in degraded mode): bit `index` of `fields.enabledMask`; AzerothCore sets bits 0-1 at level 15, bit 3 at 30, bit 2 at 50, bit 4 at 70, bit 5 at 80 (`Player.cpp:13616-13625`), and checks the same levels per index on the cast (`Spells/SpellEffects.cpp:4544-4567`). `wrong_slot_type` and `not_a_glyph` need the catalog and run only when it loads (F1); otherwise the server answers (`invalid_glyph`, `SpellEffects.cpp:4574-4580`). `removeGlyph(slot)`: `slot_empty` when the slot is 0 or outside 0-5 and nothing is sent (AzerothCore is silent: `Handlers/CharacterHandler.cpp:1604-1633`); a filled slot sends `CMSG_REMOVE_GLYPH` and resolves `removed` when the next `info` shows 0 (`:1637-1639`). The test rig can give a self entity and emit combat events (F10). | coordinator ruling (P2-17) |
| SR3-talents-23 | talents-5a Proof: `level 15`, item 43395 Glyph of Battle, "`--arg slot=<the unlocked slot of its type>`", "Slot types come from `show` or `GLYPH_SLOTS_1`". Slot types need `GlyphSlot.dbc` (absent, F1); the glyph's own type needs `GlyphProperties.dbc` (absent). | superseded by the coordinator decision (DBCs staged): `GlyphSlot.dbc` and `GlyphProperties.dbc` are staged: the probe reads the slot types and the glyph's type from the catalog and applies the glyph to the unlocked slot of its type; the retry on the other slot is the no-file branch. Each task that reads a staged file through `ctx.dbc` adds its row to the `docs/harness.md` "DBC files" table. Draft text, kept as the no-file branch (P2-8 degraded ids): Item 43395 is class 16 subclass 1 (warrior) with required level 15 (`data/sql/base/db_world/item_template.sql:38782`) — confirmed from the row. Its type (major or minor) is `[INFERENCE]` minor. At level 15 only slot indexes 0 and 1 are unlocked (`Player.cpp:13616-13617`). The probe applies `--arg item=43395 --arg slot=1`, and on `invalid_glyph` retries `--arg slot=0` (the server answers a wrong type with `SPELL_FAILED_INVALID_GLYPH`); the two tries count as one live try. The removal proof needs the slot index that accepted. Staging offline: `level '{"level":15}'` and `items/add '{"item":43395,"count":1}'` (never `soap gm items`, which mails, SR2-spells-9; the glyph is a GM-free setup). The item is consumed on use (spell charges -1 in the same row `[INFERENCE]`). | coordinator ruling (P2-17) |
| SR3-talents-24 | talents-5b tool: "slot 1-6 or a kind shown by show"; `show` lists "kind, lock state and glyph". Without `GlyphSlot.dbc` the kind is unknown. | superseded by the coordinator decision (DBCs staged): `GlyphSlot.dbc` is staged: `show` maps each slot type id to "major" or "minor" and accepts a kind word. Each task that reads a staged file through `ctx.dbc` adds its row to the `docs/harness.md` "DBC files" table. Draft text, kept as the no-file branch (P2-8 degraded ids): In degraded mode `show` prints each slot as `slot N (open\|locked), type <id>, glyph <id\|empty>` where `type` is the `GLYPH_SLOTS_1` value (`TalentsState.slots[].typeId`, `areas/talents/store.ts` `snapshot`); with the catalog it maps the id to "major"/"minor". The `glyph` call takes a 1-6 slot only in degraded mode; a kind word is accepted only with the catalog. A refused `invalid_glyph` carries `next` = the same call with the other open slot. `unglyph` with an empty slot is `REFUSED` `slot_empty`. Glyph row: `talents/glyph` `data: { slot, glyphId }` exactly as the plan (the existing `learnedRows` rule at `areas/talents/area.ts:18-33` is left alone; the glyph rows come from `event.glyphs`). | coordinator ruling (P2-17) |
| SR3-talents-25 | talents-5b scenario steer: "Now take it out again." once the first glyph row exists; "whether a trigger can match a game-log event could not be determined". | DESIGN answered: E5 accepted: one two-part glyph task, no new steer trigger. Determined: the trigger list is fixed (`grader/scenario.schema.json:226-237`, `grader/watch.ts:33-44`) and has no talents trigger; adding one is a COORD edit of four files. Ruling: no steer. The task text is "Put your glyph in a glyph slot, then take it out again." and the two `talents/glyph` rows (filled, then cleared) are the check. Budget start 8 minutes, 18 tools, 10 turns (a wrong-type slot costs one extra call). Preset `eversong10-warrior`, `level 15`, `items/add` 43395, `partner: null`, no `field`, the `EVERSONG` grid (F8). Check `used`: `source: "truth"`, `evidence: { "items": [43395], "truth": ["inventory"] }`, delta -1 (the builder confirms consumption from the row's charges). Limit cell: "Active spec only. The slot type is found by trying." | coordinator ruling (P2-17) |
| SR3-talents-26 | Serial order and shared files inside the unit (F11): the core tasks share `protocol.ts`, `store.ts`, `runtime.ts`, `area.ts`, `cts: areas/talents.ts`, `docs/areas/talents.md` (60), `docs/protocol-coverage/talents.md`; the harness tasks share `h: areas/talents/area.ts` (42), `tool.ts`. | Core order: talents-2 → talents-3a → talents-4a → talents-5a. Harness order: talents-3b → (talents-4b, talents-5b, one at a time since both edit `area.ts`). Pairs that may run together: (talents-3b, talents-4a) and (talents-4b, talents-5a). talents-3b must not start before talents-3a lands (it calls `act.learnTalents` and `act.catalog`). All touched files stay well under 500 (largest: `store.ts` 157, `store.test.ts` 265). New tests that would push `store.test.ts` past 400 go in `store-reset.test.ts` / `store-glyph.test.ts`. | coordinator ruling (P2-17) |
| SR3-talents-27 | SR1-talents-2: each task moves its "Left out" line into the proof table. `docs/areas/talents.md` is 60 lines. | The "not exercised live" sentence for the catalog path is dropped: the catalog path is proven live. Stands. Wire notes added by the wave: the `CMSG_USE_ITEM` glyph-index body fix (talents-5a), the four DBC layouts (talents-2), the AC reset bug (talents-4a). Every line cites AzerothCore (`mise protocol:cite-check`). The "not exercised live" sentence for the catalog path (SR3-talents-1) appears in the doc once. | coordinator ruling (P2-17) |

### Findings behind the SEED-3 rulings

1. Superseded by the coordinator decision (DBCs staged): the talent, glyph and skill files are staged; workers still never write into `spell_data_dir`. Draft text, kept as the no-file branch (P2-8 degraded ids): **F1. The DBC data source (P2-8).** The configured `spell_data_dir` is `/home/deity/code/peon/tmp/gameplay-data/raw` (`~/.config/peon/config.toml:10`). It holds `AreaTrigger`, `FactionTemplate`, `Lock`, `SkillLineAbility`, `Spell`, `SpellCastTimes`, `SpellCategory`, `SpellDifficulty`, `SpellDuration`, `SpellRadius`, `SpellRange` and nothing else. `Talent.dbc`, `TalentTab.dbc`, `GlyphProperties.dbc`, `GlyphSlot.dbc` and `SkillLine.dbc` are all absent. No copy exists elsewhere on the machine (a `find` for the four talent and glyph names across the filesystem finds none); the only source is the maintainer's client archives, which rules.md item 6 forbids workers to extract into `spell_data_dir`. AzerothCore's `data/sql/base/db_world/{talent,talenttab,glyphproperties,glyphslot,skillline}_dbc.sql` are empty override tables (no `INSERT`), useful only as column-layout evidence. Consequence: at run time and in every eval the talent catalog is absent and the talents tools run in degraded (ids) mode; the catalog path is proven only by packed-DBC unit tests. Affects: SR3-talents-1 to -5, -10, -21; SR3-spells-2.

2. **F2. The preset warrior already spent a talent point.** The `eversong10-warrior` template holds talent 124 at wire rank 0 (rank 1) at level 10 and 0 free points (`talents-1.md` report lines 26, 57; `talents-1.md` "Decisions"). A non-DK character has `level - 9` points in all (`Player.cpp:13940-13958`); a level-12 character with nothing spent has 3 free (`level - 9`, talents-1 live row "3 talent points free"), so the preset warrior at level 12 has 2 free. The plan's proof and scenario numbers (3 free at level 12, "plan=124:0") are wrong: talent 124 is already held, so `124:0` is a no-op (`Player.cpp:14311-14313`, `currentTalentRank >= talentRank + 1`). Affects SR3-talents-6, -11, -15, -19, -20.

3. **F3. `tools/params.ts` is a 17-line re-export facade.** `interactParams` lives in `h: tools/params-interact.ts` and `journalParams` in `tools/params-journal.ts`; `params.ts` is "coordinator only" (plan Leases row). The owner lists of `talents-4b` and `spells-14` name `tools/params.ts`; they are remapped (SR3-talents-18, SR3-spells-11).

4. **F4. The look self line lives in `tools/look-self.ts` (112), not `tools/look.ts`.** `tools/look.test.ts` is 230 now (the wave-2 fallback split landed in `look-*.test.ts`). `talents-3b` edits `look-self.ts`, two lines of `look.ts`, the `LookAfter` block of `contract/details.ts` and a test in `look-self.test.ts` (SR3-talents-9).

5. **F8. Spawn grids.** `spawnOf` maps a preset to one fixed grid (`grader/spawn-slots.ts:161-167,248-256`); `run.ts:443-448` appends the slot `position` step after the scenario's own `setup`, so a scenario `position` step is overwritten. The `EVERSONG` grid has 49 points for 12 scenarios now (measured with a throwaway script over `ROUND_1`: 24 slots at replica 1 and 2). This pair of units adds three Eversong scenarios (`t4-spells-unlearn-profession`, `t8-talents-spend`, `t8-talents-glyph`): 15 of 24. Other wave-3 units add more; the coordinator totals them. `t8-talents-reset` needs a class trainer that the Eversong grid cannot reach (SR3-talents-19).

6. **F9. No Kalimdor navigation data.** `navigation_data_dir = /home/deity/wow-data/nav` holds `Nav/Azeroth`, `Nav/Expansion01` and `Nav/DeadminesInstance` only. Orgrimmar's warrior trainer (3353, map 1) cannot be reached by `interact`. Undercity (map 0) has tiles (`28_31.nav`, `31_28.nav` present for the Undercity trainer position). So the trainer for `talents-4a`/`4b` is an Undercity warrior trainer (SR3-talents-19).

7. **F10. Test rig facts that make plan text moot.** `areaRig` takes `getEntity` (`area-rig.ts:36`), `dbc` (`:35`), `legacy` (`:37`) and fills a no-op owner for every opcode in `uses` (`:70-72`). talents-1's limitation D2 (no self entity in `areaRig`) is gone. `ctx.listen("combat" | "entity", ...)` is supported through `events` of the rig.

8. **F11. Order inside the units.** `spells`: spells-7 → spells-9 → spells-14 (all three edit `areas/spells/{protocol,store,runtime,area,opcodes}.ts` or the harness `area.ts`; `parallel.spells` stays empty; spells-14 also needs spells-9 for the runes journal line). `talents`: talents-2 → talents-3a → talents-4a → talents-5a on the core side (all four edit `areas/talents/{protocol,store,runtime,area}.ts` and `cts: areas/talents.ts`), and talents-3b → talents-4b / talents-5b on the harness side. Safe pairs: (talents-3b, talents-4a) and (talents-4b, talents-5a); never two tasks of the same side together.

9. **F12. `docs/harness.md` is 437 lines** (cap 500); talents-3b adds one row and other wave-3 tools add theirs. The coordinator counts the wave total before the tool rows land (row SR3-talents-13).


## Staging for wave 3

| Task | Preset | Partners | Zone and spawn | GM / setup staging |
|---|---|---|---|---|
| talents-2 | none (unit test) | 0 | none | none; the catalog files are staged, so talents-2 loads them once and records the talent count |
| talents-3a (live) | `eversong10-warrior` | 0 | Fairbreeze spawn | offline `level 13`; flows `talents-learn --arg plan=124:1` then `124:2,130:0`; delete the account |
| talents-3b (eval `t8-talents-spend`) | `eversong10-warrior` | 0 | `EVERSONG` grid | scenario setup `level 12` only |
| talents-4a (live) | `eversong10-warrior` | 0 | Undercity, at an Undercity warrior trainer (4593/4594/4595) | offline `level 12`, `money 20000`, `position` (map 0, zone 1497); `gm reset-talents` between runs; delete the account |
| talents-4b (eval `t8-talents-reset`) | `eversong10-warrior` | 0 | `undercity-warrior` named spawn (added by talents-4b from talents-4a's verified position, SEED3-14) | scenario setup `level 12`, `money 20000` |
| talents-5a (live) | `eversong10-warrior` | 0 | Fairbreeze spawn | offline `level 15`, `items/add` 43395; flow `talents-glyph`; delete the account |
| talents-5b (eval `t8-talents-glyph`) | `eversong10-warrior` | 0 | `EVERSONG` grid | scenario setup `level 15`, `items/add` 43395 |