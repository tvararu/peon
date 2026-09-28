# objects: game objects, area triggers and page text (key: objects)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.4 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).

## What the unit delivers

The character can see, reach and use game objects, open chests with an
open-lock spell, read page text, and send area triggers as it walks.
The agent gets objects in `look`, `travel` and `interact`, a new tool
`use` (`do: open | read | fish`) and object objectives in the quest loop.

- Unit `objects`, one code area `objects` (design 5.1). Worktree
  `proto-objects`, branch `proto/area-objects` (contract 0.1):

  ```
  orca-ide worktree create --name proto-objects \
    --base-branch origin/factory/426-protocol-coverage \
    --parent-worktree active --setup run \
    --comment 'owner: coordinator, item 4 objects'
  git branch -m proto/area-objects
  ```

- Phase: wave 1 for `objects-1` to `objects-5`, `objects-7`, `objects-8`,
  `objects-10`, `objects-11`; wave 4 for `objects-6` and `objects-9`
  (design 5.1). One task at a time; each starts from the current
  `origin/factory/426-protocol-coverage` after the previous one landed.
- Owned opcodes: 11 relevant, 0 dead (design 5.4; the verify corrections
  move none into or out of this area). Uses (peek):
  `SMSG_GAMEOBJECT_QUERY_RESPONSE`, whose legacy owner stays in
  `world-handlers-entity.ts`.
- Shared piece it owns (N28, contract 2.5): `protocol/spell-targets.ts`
  (`writeSpellTargets`), used by `spells`, `talents` and `pets`.
- Names (contract D7): `OBJECTS_OPCODES`, `objectsArea`,
  `ObjectsStore`, `ObjectsState`, `ObjectsEvent`, `ObjectsActs`,
  `objectsRuntime`, `objectsHarness`, `useTool`. Log rows use the area
  domain: `objects/used`, `objects/page`, `objects/trigger`,
  `objects/message`, `objects/fish` (contract 1.9: the router sets
  `domain: "objects"`; the area design's `object/*` names do not apply).
- Test packet builders live in `packages/core/test-support/areas/objects.ts`
  as `objects<Opcode>Body(...)` (contract 1.8).

### Unit files

Paths without a prefix are under `packages/core/src/wow/`.

| Path | Created by |
|---|---|
| `areas/objects/opcodes.ts`, `areas/objects/area.ts` | `SEED-1` (the unit fills `uses`, `unseen`, removes its stub line) |
| `areas/objects/templates.ts` and test | objects-1 |
| `areas/objects/fields.ts` and test | objects-1 |
| `areas/objects/store.ts` and test | objects-1 (grows in 2, 3, 5, 6) |
| `areas/objects/protocol.ts` and test | objects-2 (grows in 3, 5, 6) |
| `areas/objects/runtime.ts` and test | objects-2 (grows in 3, 4, 5) |
| `areas/objects/lock-catalog.ts` and test | objects-4 |
| `areas/objects/open-lock.ts` and test | objects-4 |
| `areas/objects/trigger-catalog.ts` and test | objects-5 |
| `areas/objects/trigger-watch.ts` and test | objects-5 |
| `protocol/spell-targets.ts` and test | objects-4 |
| `packages/core/test-support/areas/objects.ts` | objects-1 |
| `packages/harness/src/areas/objects/area.ts` and test | `SEED-1`; rules from objects-8 |
| `packages/harness/src/areas/objects/tool.ts`, `tool-open.ts`, `tool-read.ts`, `tool-fish.ts` and tests | objects-8, objects-9 |
| `packages/devtools/src/probe-flows/objects-use.ts`, `objects-read.ts`, `objects-open.ts`, `objects-trigger.ts`, `objects-fish.ts` | objects-2, 3, 4, 5, 6 |
| `packages/harness/src/grader/scenarios/t4-objects-quest-elwynn.json`, `t0-objects-read-shrine.json`, `t4-objects-explore-fargodeep.json` | objects-8, objects-10 |
| `docs/areas/objects.md` | objects-1 (each later task adds its proof rows) |
| `docs/protocol-coverage/objects.md` | regenerated only |

### Leases this unit needs (contract 2.7)

| Legacy file | Task | Edit |
|---|---|---|
| `protocol/entity-queries.ts` | objects-1 | full `SMSG_GAMEOBJECT_QUERY_RESPONSE` body |
| `protocol/extract-fields.ts` | objects-1 | `createdBy`, `dynFlags`, `pathProgress` |
| `spell-catalog.ts` | objects-4 | `SpellEffect.miscValue` |
| `protocol/spell.ts` | objects-4 | `buildCastSpell` takes a `SpellTarget` |
| `protocol/item.ts` | objects-4 | `buildUseItem` takes a `SpellTarget` |
| `control.ts`, `control-mover.ts` | objects-5 | one `ControlEventType` member, `pose_sent`, emitted after each movement send |
| harness `tools/look.ts`, `tools/travel*.ts`, `tools/interact*.ts`, `ops/refs.ts`, and the `lookParams`, `travelParams`, `interactParams` blocks of `tools/params.ts` | objects-7 | object rows, `o<n>` refs, object goals |
| harness `loops/quest-objective.ts`, `loops/quest-cycle.ts` | objects-11 | object objectives |

### Contract issues found while planning

These are gaps, not changes. The coordinator rules on each (contract
precedence 3). Until then the plan works as stated.

1. **`control-mover.ts` is not on the control lease list.** Contract 2.7
   names `control-sync.ts`, `control.ts`, `control-motion.ts`,
   `self-store.ts` and `movement-handlers.ts`. The one movement send site
   is `Mover.sendMove`, `control-mover.ts:370-376`, and control emits no
   event per heartbeat (`control.ts:56-66`). objects-5 needs
   `control-mover.ts` in its lease. Without it, objects-5 stops as
   `blocked`.
2. **`tools/params.ts` holds the parameter schemas** of `look`, `travel`
   and `interact` (`tools/params.ts:17`, `:36`, `:99`). A lease on those
   tool modules must include their blocks there, as D13 does for
   `contract/details.ts`.
3. **`loops/quest-cycle.ts`** (`questCycleObjective`, `:46`) is where the
   quest loop runs an objective; the lease list names only
   `loops/quest-objective.ts` for `objects`.
4. **Entity fields.** Design 5.4 adds `createdBy` and split `dynamic`
   fields "on `GameObjectEntity`", but `entity-store.ts` is on no lease
   and `GameObjectFields` (`entity-store.ts:43-49`) has neither. The plan
   reads them from `entity.rawFields` through the leased extractor in an
   area helper (`areas/objects/fields.ts`), which needs no edit to
   `entity-store.ts`. `quest-slots.ts:47` reads `rawFields` the same way.
5. **Proof rows for opcodes not built yet.** Contract 3.8 asks for one
   proof row per owned opcode, but objects-1 creates the doc before any
   owned opcode is built. objects-1 lists the ten unbuilt opcodes under
   "Left out" as "built by objects-<n>", and each later task moves its
   rows into the proof table. If a check requires every row from the
   first commit, the builder reports it.
6. **Quest 3904 needs 3903, which needs 33**
   (`quest_template_addon.sql:2171-2172`). Whether the `elwynn10`
   template has 3903 rewarded could not be determined. objects-8 checks
   it on a fresh `elwynn10` account with `soap truth`; if 3903 is not
   rewarded, `t4-objects-quest-elwynn` cannot start without GM, and the
   task stops as `blocked` for the coordinator to pick another object
   quest or a preset.

---

## objects-1: Object templates and object fields

Rulings: SR1-objects-2, SR1-objects-4, SR1-objects-10, SR1-objects-14.

**Files:**
- Modify (lease): `packages/core/src/wow/protocol/entity-queries.ts` and
  `protocol/entity-queries.test.ts`
- Modify (lease): `packages/core/src/wow/protocol/extract-fields.ts` and
  its test
- Create: `packages/core/src/wow/areas/objects/templates.ts`, `fields.ts`,
  `store.ts` and their tests
- Modify: `areas/objects/area.ts`, `areas/objects/opcodes.ts` (`uses`)
- Create: `packages/core/test-support/areas/objects.ts`
- Create: `docs/areas/objects.md`
- Regenerate: `docs/protocol-coverage/objects.md`

**Depends on:** `S0-5`, `SEED-1` (wave 1 seed), `T-2` (tap), `T-3`
(probe).

**Opcodes:** none owned. Body fix of the legacy-handled
`SMSG_GAMEOBJECT_QUERY_RESPONSE` (area `uses`, read with `peek`), and the
`GAMEOBJECT_CREATED_BY` and `GAMEOBJECT_DYNAMIC` update fields.

**Steps:**

1. **Failing parser test.** In `protocol/entity-queries.test.ts`, add
   "reads the full 3.3.5 template as AzerothCore writes it": the body is
   built by `objectsGameObjectQueryResponseBody` in
   `test-support/areas/objects.ts` from `QueryHandler.cpp:193-213`
   (entry, type, display id, name, three empty names, icon name, cast-bar
   caption, the third string, 24 `u32` data words
   (`SharedDefines.h:1603`), `f32` size, 6 `u32` quest items). Use the row
   of Milly's Harvest: entry 161557, type 3, display 3012, size 1, data0
   43 (lock), data1 10119 (loot) (`gameobject_template.sql:6262`). Expect
   `data` of length 24, `size` 1 and `questItems` of length 6. Add a
   second case for the masked "no such entry" reply, which must keep
   `name: undefined`. Run `mise test
   packages/core/src/wow/protocol/entity-queries.test.ts` and see it fail
   on the missing fields.
2. **Implement.** `GameObjectQueryResult` gains `displayId`, `iconName`,
   `castBarCaption`, `data: number[]`, `size`, `questItems: number[]`.
   The legacy handler (`world-handlers-entity.ts:305-311`) keeps reading
   `entry`, `name` and `gameObjectType` and needs no edit. wowm's 6 data
   words are wrong for this server; AzerothCore wins (design 5.4).
3. **Failing field test.** In `extract-fields.test.ts`: raw fields with
   `CREATED_BY` at offsets 6 and 7 (`update-fields.ts:330`) give
   `createdBy` as one `bigint`; `DYNAMIC` at offset 14 with value
   `0xffff0008` gives `dynFlags` 8 and `pathProgress` -1
   (`GameObject.cpp:2843-2844`: `uint16` flags, then signed `int16`).
   See it fail. Replace `dynamic` with the two fields; `rg -n
   "\.dynamic\b" packages` finds no other reader at `71fba0ab`.
4. **Failing area test.** `areas/objects/store.test.ts` with
   `areaRig("objects")`: inject the Milly's Harvest reply; expect
   `handle.state().templates.get(161557)` with `lockId(t)` 43. In
   `templates.test.ts`: `lockId` per type as
   `GameObjectTemplate::GetLockId` (`GameObjectData.h:428-457`),
   `goober.pageId` at data7 for type 10 (Shrine of Dath'Remar, entry
   180516, data7 2936, `gameobject_template.sql:10128`), `text.pageId` at
   data0 for type 9, and `chest.questId`. The builder checks each data
   index against `GameObjectData.h` before writing the test.
   `fields.test.ts`: `objectFields(entity)` returns `createdBy`,
   `dynFlags` and `pathProgress` from `entity.rawFields`.
5. **Implement.** `ObjectsStore` with state
   `{ templates: ReadonlyMap<number, GameObjectTemplate> }` and a plain
   `new Emitter()`; `register` calls `wire.peek(SMSG_GAMEOBJECT_QUERY_RESPONSE, ...)`;
   `OBJECTS_OPCODES.uses` gains the opcode. `templates.ts` exports
   `GameObjectTemplate`, `lockId`, `pageId`, `questItems`. `fields.ts`
   exports `objectFields(entity)`, which calls `extractGameObjectFields`.
6. **Doc.** Create `docs/areas/objects.md` with the headings of contract
   3.8. Wire notes: the 24 data words (`QueryHandler.cpp:202`, against
   `queries/smsg_gameobject_query_response.wowm:51`), the multi-line
   `SMSG_AREA_TRIGGER_MESSAGE` (`Server/WorldSession.cpp:287-298`), the
   page chain (`QueryHandler.cpp:367`, `:391`) and the dynamic-object
   despawn guid (`Entities/DynamicObject/DynamicObject.cpp:184`). Left
   out: each owned opcode with "built by objects-<n>" (issue 5).
7. `mise protocol:coverage`, `mise ci:checks`.

**Proof:** live. Probe on a new `elwynn10` account:
`mise protocol:probe <ACCOUNT> --send CMSG_GAMEOBJECT_QUERY --body
157702000000000000000000 --expect SMSG_GAMEOBJECT_QUERY_RESPONSE
--bodies` (entry 161557 as `u32` little-endian, then an 8-byte zero
guid; `QueryHandler.cpp` reads entry then guid). The parsed template must
show lock 43 and loot 10119. No GM command. This is a body fix, so no
proof row; the Wire notes cite the capture.

**Commit:**

```
feat: Read full game object templates

The object query reply stopped after the first name, so locks, page ids
and quest items were unknown. The objects area now keeps every template
field as AzerothCore writes them, plus creator and dynamic flags.
```

---

## objects-2: Use and report use

Rulings: SR1-objects-2, SR1-objects-6, SR1-objects-10, SR1-objects-15.

**Files:**
- Create: `areas/objects/protocol.ts`, `areas/objects/runtime.ts` and
  tests
- Modify: `areas/objects/store.ts`, `area.ts`, `opcodes.ts` and tests;
  `packages/core/test-support/areas/objects.ts`
- Create: `packages/devtools/src/probe-flows/objects-use.ts`
- Modify: `docs/areas/objects.md`; regenerate
  `docs/protocol-coverage/objects.md`

**Depends on:** objects-1.

**Opcodes:** `CMSG_GAMEOBJ_USE`, `CMSG_GAMEOBJ_REPORT_USE`.

**Steps:**

1. **Failing builder tests** (`protocol.test.ts`): `buildGameObjUse(guid)`
   and `buildGameObjReportUse(guid)` each write one `u64`, as
   `HandleGameObjectUseOpcode` (`Handlers/SpellHandler.cpp:328-347`) and
   `HandleGameobjectReportUse` (`:349-376`) read them. See them fail.
2. **Failing runtime test** (`runtime.test.ts`, `areaRig`): with a known
   object entity, `handle.act.use(guid)` records exactly
   `[CMSG_GAMEOBJ_USE, CMSG_GAMEOBJ_REPORT_USE]` in `rig.sent`, sets
   `pendingUse { guid, sentAt }` and emits `used { guid, entry, how:
   "use" }`. An unknown guid returns `{ ok: false, reason: "unknown" }`
   and sends nothing. `pendingUse` reads as expired 5 s after `sentAt`
   (computed from `now()`, no timer; the store arms no timer).
3. **Implement** `ObjectsActs.use`. The pair follows AzerothCore's own
   client emulation (`modules/mod-playerbots/src/Ai/Raid/Aq20/Aq20Actions.cpp:41-46`).
   Range, flags and quest state stay harness checks, because the server
   drops a bad use in silence (`SpellHandler.cpp:336-346`).
4. **Probe flow** `objects-use`: `--arg entry=<n>` finds the nearest
   spawned object of that entry in the entity store, calls
   `handle.objects.act.use`, and waits for `--until` opcodes.
5. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:**
- `CMSG_GAMEOBJ_USE`: live. New `fresh` account; drive the character with
  its `tmp/puppet-<ACCOUNT>` wrapper or a harness `travel` to within 5 yd
  of the Shrine of Dath'Remar (map 530, 10405.8, -5946.0, 42.5,
  `gameobject.sql` spawn 21120), log out, then `mise protocol:probe
  <ACCOUNT> --flow objects-use --arg entry=180516 --expect
  SMSG_GAMEOBJECT_PAGETEXT`. The page-text reply (`GameObject.cpp:1618-1634`)
  shows the server accepted the use. The objects-3 handler is not needed
  for the capture: the tap counts the opcode.
- `CMSG_GAMEOBJ_REPORT_USE`: `accepted` (contract 0.6). The same run
  sends it; proof is no disconnect and no error packet. Builder test
  against `SpellHandler.cpp:349-376`. The only other effect is a
  `SMSG_CRITERIA_UPDATE` when an achievement tracks the entry; no such
  entry near a start zone could be determined.
- Risk to check once: a SmartAI `GOSSIP_HELLO` script may run on both
  calls (`AI/SmartScripts/SmartScriptMgr.h:163`). The builder notes any
  doubled reply seen in the capture.

**Commit:**

```
feat: Use game objects

The character could not touch any object. The objects area now sends a
use and a report use, as the server expects from a client, and records
the pending use.
```

---

## objects-3: Page text

Rulings: SR1-objects-2, SR1-objects-10.

**Files:**
- Modify: `areas/objects/protocol.ts`, `store.ts`, `runtime.ts`,
  `area.ts`, `opcodes.ts` and tests;
  `packages/core/test-support/areas/objects.ts`
- Create: `packages/devtools/src/probe-flows/objects-read.ts`
- Modify: `docs/areas/objects.md`; regenerate
  `docs/protocol-coverage/objects.md`

**Depends on:** objects-2.

**Opcodes:** `CMSG_PAGE_TEXT_QUERY`, `SMSG_PAGE_TEXT_QUERY_RESPONSE`,
`SMSG_GAMEOBJECT_PAGETEXT`.

**Steps:**

1. **Failing tests** (`protocol.test.ts`): `buildPageTextQuery(pageId,
   guid)` writes `u32` then `u64` (`QueryHandler.cpp:361-366` reads the
   id and skips the guid); `parsePageText` reads `u32 pageId`, CString,
   `u32 nextPageId` from `objectsPageTextQueryResponseBody`
   (`QueryHandler.cpp:371-392`), including the "Item page missing." reply
   with next page 0; `parseGameObjectPageText` reads one guid
   (`GameObject.cpp:1632`).
2. **Failing store and runtime tests** (`areaRig`): inject a two-page
   chain (one query answers the whole chain, one packet per page,
   `QueryHandler.cpp:367`, `:391`); `act.readPage(pageId)` resolves once
   with `page_read { firstPageId, pages }`; a cached chain sends nothing;
   30 pages stop the loop; with no reply, the runtime's `until` times out
   after 5 s and emits `page_unanswered { pageId }` (fake timers inside
   `try`/`finally`). Injecting `SMSG_GAMEOBJECT_PAGETEXT` for a goober
   emits `page_shown { guid, pageId }` with the page id from the template.
3. **Implement.** `pages` cache in the store; `readPage` in the runtime.
   Delete nothing from `STUBS`: neither opcode has a stub.
4. **Probe flow** `objects-read`: `--arg page=<id>` sends the query and
   prints each page.
5. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** live.
- `CMSG_PAGE_TEXT_QUERY` and `SMSG_PAGE_TEXT_QUERY_RESPONSE`: `mise
  protocol:probe <ACCOUNT> --flow objects-read --arg page=2936 --expect
  SMSG_PAGE_TEXT_QUERY_RESPONSE`. The text starts "You have discovered
  the location of the shrine!" (`page_text.sql:1398`). A second run with
  `--arg page=2147483647` returns "Item page missing."
  (`QueryHandler.cpp:374-379`).
- `SMSG_GAMEOBJECT_PAGETEXT`: the shrine use of objects-2, now parsed:
  `--flow objects-use --arg entry=180516` shows `page_shown` with page
  2936.

**Commit:**

```
feat: Read page text from objects

Books, plaques and shrines hold text the character could not read. The
objects area now queries a page chain, caches it and reports when an
object shows a page.
```

---

## objects-4: Object targets and open-lock choice

Rulings: SR1-objects-2, SR1-objects-7, SR1-objects-11, SR1-objects-12, SR1-objects-13, SR1-objects-15.

**Files:**
- Create: `packages/core/src/wow/protocol/spell-targets.ts` and test
- Modify (lease): `protocol/spell.ts` (`buildCastSpell`, `:254-269`),
  `protocol/item.ts` (`buildUseItem`, `:83-94`), `spell-catalog.ts`
  (`SpellEffect`, `:40-49`) and their tests
- Create: `areas/objects/lock-catalog.ts`, `areas/objects/open-lock.ts`
  and tests
- Modify: `areas/objects/runtime.ts`, `area.ts` and tests
- Create: `packages/devtools/src/probe-flows/objects-open.ts`
- Modify: `docs/areas/objects.md`

**Depends on:** objects-1.

**Opcodes:** none owned. Body fixes of the handled `CMSG_CAST_SPELL` and
`CMSG_USE_ITEM`.

**Steps:**

1. **Failing writer test** (`protocol/spell-targets.test.ts`): `type
   SpellTarget = { kind: "none" } | { kind: "unit"; guid: bigint } |
   { kind: "object"; guid: bigint } | { kind: "item"; guid: bigint } |
   { kind: "dest"; x: number; y: number; z: number }`;
   `writeSpellTargets(w, target)` writes the mask, then a packed guid for
   unit and object, a packed guid for item, and a zero packed transport
   guid plus three `f32` for dest, in the order of
   `SpellCastTargets::Read` (`Spells/Spell.cpp:163-200`). One case per
   kind. See it fail.
2. **Failing callers.** `spell.test.ts`: `buildCastSpell` with an object
   target ends with the object mask and the packed guid; a unit target
   keeps today's bytes. `item.test.ts`: `buildUseItem` with an object
   target writes that target after the glyph and cast flags
   (`HandleUseItemOpcode`, `Handlers/SpellHandler.cpp:58-193`, reads
   `targets.Read` at `:193`); no target keeps mask 0. Implement both
   through `writeSpellTargets`. Callers that pass a unit keep working;
   `rg -n "buildCastSpell|buildUseItem" packages` lists them.
3. **Failing catalog tests.** `spell-catalog.test.ts`: `SpellEffect`
   gains `miscValue` (the `EffectMiscValue` column; the builder checks
   the index against AzerothCore `DBCfmt.h`). `lock-catalog.test.ts`:
   `LockCatalog` reads `Lock.dbc` with the AzerothCore format
   `"niiiiiiiiiiiiiiiiiiiiiiiixxxxxxxx"` (`src/server/shared/DataStores/DBCfmt.h:85`)
   into `{ id, type[8], index[8], skill[8] }`, loaded lazily from
   `ctx.dbc` like `loadSpellCatalog` (`spell-catalog.ts:140`).
4. **Failing choice test** (`open-lock.test.ts`, pure function over a
   lock, the spellbook and skill values): lock id 0 opens with any
   open-lock spell (`Spell.cpp:8710-8711`); a `LOCK_KEY_SKILL` lock picks
   the first known spell whose effect 33 `miscValue` equals the lock
   index and whose skill requirement the character meets
   (`Spell.cpp:8707-8760`, `:8737`); a `LOCK_KEY_ITEM` lock returns the
   key item; none gives `{ ok: false, reason: "locked", skill, need }`.
   Skill values come from the self entity's `SKILL_INFO` fields
   (`update-fields.ts:276`); the spellbook from `core.combat.spellbook()`
   (`combat-store.ts:116`).
5. **Implement acts** `open(guid, spellId)` (sends `CMSG_CAST_SPELL` with
   an object target and emits `used { how: "cast", spellId }`),
   `useItemOn(item, target)` and the query `openLockSpell(entry)`.
6. **Probe flow** `objects-open`: `--arg entry=<n>` resolves the spell
   with `openLockSpell`, then sends `use` and `open` as AzerothCore's
   playerbots does (`modules/mod-playerbots/src/Bot/PlayerbotAI.cpp:3738-3748`),
   and waits for `SMSG_LOOT_RESPONSE`.
7. `mise ci:checks`.

**Proof:** live. New `elwynn1` account (Northshire). First run `mise
protocol:probe <ACCOUNT> --flow login` and record which open-lock spell
the character knows (AzerothCore's bots fall back to 6477,
`modules/mod-playerbots/conf/playerbots.conf.dist:1364`; whether a new
character knows it could not be determined). Then `mise factory soap gm
<ACCOUNT> quest add 3904`, walk to a crate (map 0, near -9105, -323,
`gameobject.sql` spawns 26752-26753), run `--flow objects-open --arg
entry=161557 --expect SMSG_LOOT_RESPONSE`, take the loot, and `mise
factory soap truth <ACCOUNT>` shows item 11119 (`item_template.sql:8744`,
loot 10119 at `gameobject_loot_template.sql:14342`).

**Commit:**

```
feat: Target objects and items with spells

Chests open only through an open-lock spell cast at the object, and the
cast and item-use bodies could only name a unit. One target writer now
serves both, and the objects area picks the spell a lock needs.
```

---

## objects-5: Area triggers and trigger messages

Rulings: SR1-objects-1, SR1-objects-2, SR1-objects-3, SR1-objects-10, SR1-objects-15.

**Files:**
- Modify (lease): `packages/core/src/wow/control.ts` (`ControlEventType`
  gains `"pose_sent"`), `control-mover.ts` (`Mover.sendMove`,
  `:370-376`, emits it) and their tests
- Create: `areas/objects/trigger-catalog.ts`, `trigger-watch.ts` and tests
- Modify: `areas/objects/protocol.ts`, `store.ts`, `runtime.ts`,
  `area.ts`, `opcodes.ts` (delete the `SMSG_AREA_TRIGGER_MESSAGE` stub
  line) and tests; `packages/core/test-support/areas/objects.ts`
- Create: `packages/devtools/src/probe-flows/objects-trigger.ts`
- Modify: `docs/areas/objects.md`; regenerate
  `docs/protocol-coverage/objects.md`

**Depends on:** `S0-5`, `SEED-1`, `T-5` (`soap gm`), and the control
lease (after the self-state task that holds it lands; issue 1).

**Opcodes:** `CMSG_AREATRIGGER`, `SMSG_AREA_TRIGGER_MESSAGE`.

**Steps:**

1. **Failing parser tests.** `buildAreaTrigger(id)` writes one `u32`
   (`Handlers/MiscHandler.cpp:691-697`). `parseAreaTriggerMessage` reads
   the `u32` length and then a CString to the NUL, ignoring the length:
   the fixture `objectsAreaTriggerMessageBody` copies AzerothCore's writer
   (`Server/WorldSession.cpp:287-298`), whose first packet of a two-line
   message holds length `line.size() + 1` but the whole remaining string.
   One single-line case, one multi-line case.
2. **Failing catalog test.** `AreaTriggerCatalog` reads `AreaTrigger.dbc`
   rows `{ id, map, x, y, z, radius, length, width, height,
   orientation }` indexed by map (field order as the AzerothCore table,
   `ObjectMgr.cpp:7251`). The 10-field layout is inferred; `dbc.ts`
   throws on a wrong one. The builder compares rows 78, 87, 88 and 562
   with `data/sql/base/db_world/areatrigger.sql:47-50` and reports drift.
3. **Failing watcher tests** (`trigger-watch.test.ts`, pure): sphere when
   `radius > 0`, else an oriented box, as `Player::IsInAreaTriggerRadius`
   (`Entities/Player/Player.cpp:2218-2238`), delta 0. Entering trigger 88
   (map 0, -9843.54, 127.525, 5.37, radius 10) sends once; staying inside
   sends nothing; leaving and entering sends again; a map change clears
   `inside`; after `new_world` or a teleport ack, triggers that hold the
   arrival point are marked inside without a send; no send while the
   character is on a taxi (`MiscHandler.cpp:699-704`; the builder finds
   which `ControlState` field says so, could not determine at `71fba0ab`).
4. **Failing control test.** In `control-drive.test.ts` or a new
   `control-pose.test.ts`: each movement packet sent emits one
   `pose_sent` control event with the sent pose. Harness rules compare
   control types by equality (`events/rules-world.ts:102`, `:142`,
   `:145`), so the new type writes no row; `mise test packages/harness`
   confirms it.
5. **Implement.** The runtime listens to `control` (`pose_sent`,
   `server_correction`) and `core.self` (`new_world`, `teleport_ack`,
   `login_verified`), runs the watcher, and sends through
   `act.enterTrigger(id)`, which emits `trigger_sent { triggerId, map }`.
   The store keeps `triggers { inside, sent }` and `lastMessage`, and
   emits `trigger_message { text }`. The watcher lives in core: the
   server expects it from every client and it chooses nothing (design
   5.4, accepted by the maintainer (P2-5)).
6. **Probe flow** `objects-trigger`: `--arg id=<n>` sends one trigger and
   waits.
7. Proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** live.
- `CMSG_AREATRIGGER` (exploration): new `elwynn10` account; `mise factory
  soap gm <ACCOUNT> tele FargodeepMine` (`game_tele.sql`, about 90 yd from
  the trigger), `soap gm <ACCOUNT> quest add 62`, then walk into trigger
  88 with the puppet or a harness `travel`. `soap truth` shows quest 62
  complete (`areatrigger_involvedrelation.sql:39`).
- `SMSG_AREA_TRIGGER_MESSAGE`: new `elwynn1` account (level 1);
  `soap gm <ACCOUNT> tele TheDeadmines` (12 yd south of trigger 78), walk
  north into trigger 78 (radius 7). The server answers "You must be at
  least level 10 ..." (`Entities/Player/PlayerStorage.cpp:7075`, level 10
  from `dungeon_access_template.sql:45`). Then `soap gm <ACCOUNT> level
  10`, walk out and back in: `soap truth` shows map 36
  (`areatrigger_teleport.sql:44`).

**Commit:**

```
feat: Send area triggers while walking

The server gives exploration credit, inn rest, instance entry and ghost
return only when the client reports an area trigger. Core now sends each
trigger once on entry and keeps the server's trigger messages.
```

---

## objects-7: Objects in look, travel and interact

Rulings: SR1-objects-4, SR1-objects-5, SR1-objects-6, SR1-objects-16.

**Files (all harness, under leases):** `packages/harness/src/tools/look.ts`,
`tools/look-rank.ts`, `tools/travel.ts`, `tools/interact.ts`,
`tools/interact-quest.ts`, `ops/refs.ts`, the `lookParams`,
`travelParams` and `interactParams` blocks of `tools/params.ts`, and their
tests; `docs/harness.md` (the `look`, `travel` and `interact` lines only).

**Depends on:** objects-1, `S0-4`, and the leases of this task.

**Opcodes:** none (harness).

**Steps:**

1. **Failing tests.** `ops/refs.test.ts`: refs accept `o<n>` beside
   `u<n>` (`ops/refs.ts:4` matches `^u\d+$` today). `look.test.ts` with
   the mock game and a game object entity plus its template from
   `session.areas.objects`: `look find: "object"` lists the object with
   `o1`, its kind, distance and flags `quest` (`GO_DYNFLAG_LO_ACTIVATE`
   in `dynFlags`, `src/server/shared/SharedDefines.h:1622`), `locked`
   (`GO_FLAG_LOCKED`, `:1608`) and `busy` (`GO_FLAG_IN_USE`, `:1607`).
   `travel.test.ts`: `travel to: "o1"` stops inside interaction distance
   minus 1 yd (`GameObject::GetInteractionDistance`,
   `GameObject.cpp:2898-2934`). `interact.test.ts`: `interact npc: "o1"`
   on a type-2 quest giver (`GameObject.cpp:1510-1519`) sends the quest
   hello to the object guid and opens the same quest window. Each tool
   test calls `expectSendKind` once.
2. **Implement.** Read templates and fields through the world service
   views (`session.areas.objects.state()`) and `objectFields`, which the
   harness reaches only through `@peon/core` exports; if `objectFields`
   is not exported, the task asks the coordinator for the barrel line
   (contract 0.9). Check that core's quest code accepts an object guid as
   the quest giver; if it does not, stop as `blocked` and name the file.
3. `mise ci:checks`.

**Proof:** live. Harness run on a new `elwynn1` account: `look find:
object` lists 161557 near the vineyards; `travel to: o<n>` stops within
range; `soap truth` position is within 5 yd of the crate.

**Commit:**

```
feat: Show and reach objects in look and travel

The agent could name and walk to units only. look now lists objects with
their kind and quest flag, travel walks to them, and interact talks to
quest-giver objects.
```

---

## objects-8: The use tool: open and read

Rulings: SR1-objects-4, SR1-objects-7, SR1-objects-8, SR1-objects-11, SR1-objects-13, SR1-objects-15.

Three commits: the tool, then one commit per scenario (contract 3.2).

**Files:**
- Create: `packages/harness/src/areas/objects/tool.ts`, `tool-open.ts`,
  `tool-read.ts` and tests
- Modify: `packages/harness/src/areas/objects/area.ts` and test (rules,
  `worldActs: ["use", "open", "readPage"]`, glyph)
- Append (shared, contract 2.6): `contract/result.ts` `ToolName` (`"use"`),
  `tools/registry.ts` `GAME_TOOLS` (`useTool`), `docs/harness.md` tool
  table row
- Create: `packages/harness/src/grader/scenarios/t4-objects-quest-elwynn.json`,
  `t0-objects-read-shrine.json`
- Append: `grader/scenarios.ts` `ROUND_1`, `docs/capabilities.md`,
  `docs/evals.md` ("Which scenarios to run", the `objects` row)

**Depends on:** objects-2, objects-3, objects-4, objects-7, `S0-3`,
`S0-4`.

**Opcodes:** none (harness).

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

1. **Failing tool tests** (`tool.test.ts`, mock game, `expectSendKind`):
   `use object: "o1"` refuses `not_found`, `too_far` (with `next: travel
   to: o1`) and `not_usable`; a chest with lock 43 and a known open-lock
   spell calls `claim.areas.objects.use` then `open`, and settles `DONE`
   on `SMSG_LOOT_RESPONSE` for that guid ("opened Milly's Harvest: 1 x
   Milly's Harvest"), `PARTLY` when bags are full, `FAILED` on a cast
   failure, `UNCONFIRMED` after 5 s; a lock with no spell gives `locked`
   with the skill needed. `do: read` on a goober waits for `page_shown`,
   then `readPage`, and cuts the text to 12 lines with `next: journal
   about: log find: "page"`; on a type-9 text object it reads the
   template's page id at once (no `Use` branch for type 9,
   `GameObject.cpp:1496-1534`).
2. **Failing rule tests** (`area.test.ts`): `used` gives one `log` row
   `objects/used`; `page_read` gives `objects/page`; `custom_anim` and
   `despawn_anim` give no row (return `[]`).
3. **Implement.** Kind `action`; sends inside `ctx.rt.mutex.run`; loot
   through `lootCorpse(run, guid)` (`loops/loot-run.ts:47`) for the
   object guid. If that function needs a corpse, stop as `blocked` and
   name `loops/loot-run.ts`.
4. Commit 1 after `mise ci:checks`.
5. **Scenario `t4-objects-quest-elwynn`.** First check issue 6 with
   `soap truth` on a new `elwynn10` account. Preset `elwynn10`, no GM.
   Task: "Get Milly's Harvest from Milly Osworth and bring her the
   crates." Checks: truth quest 3904 complete or rewarded; truth item
   11119 count rises; game log `objects/used` for entry 161557. Run `mise
   test packages/harness/src/grader/scenarios.test.ts`, then `mise eval`.
   One commit with the JSON, `ROUND_1`, the capabilities row "Open chests
   and use quest objects" and the evals row.
6. **Scenario `t0-objects-read-shrine`.** Preset `fresh`. Task: "Read the
   Shrine of Dath'Remar and tell me its first sentence." Checks: game log
   `objects/page` with page 2936; the answer holds the fixed phrase "You
   have discovered the location of the shrine" (truth holds no reads).
   Same commit rule.

**Proof:** eval. Both scenarios run with `mise eval`; each verdict goes
into the proof table and the report. A scenario that does not pass goes
under "Not shown by any scenario" (contract 3.4).

**Commits:**

```
feat: Add the use tool to open and read objects

The agent had no way to open a chest or read a shrine. use opens an
object with the right open-lock spell and loots it, or reads its pages.
```

```
test: Prove opening quest crates in Elwynn

Milly's Harvest needs eight crates opened with an open-lock spell, so a
pass shows use, the lock choice and object loot on the live server.
```

```
test: Prove reading the Dath'Remar shrine

The shrine answers a use with a page, so a pass shows use, page text and
the page chain on the live server.
```

---

## objects-10: Trigger rows and the exploration eval

**Files:**
- Modify: `packages/harness/src/areas/objects/area.ts` and test
- Create: `packages/harness/src/grader/scenarios/t4-objects-explore-fargodeep.json`
- Append: `grader/scenarios.ts` `ROUND_1`, `docs/capabilities.md`,
  `docs/evals.md` (the `objects` row)

**Depends on:** objects-5, objects-8.

**Opcodes:** none (harness).

**Steps:**

1. **Failing rule tests:** `trigger_sent` gives one `log` row
   `objects/trigger` ("Entered area trigger 88."); `trigger_message` gives
   `objects/message` as `wake` when no run is active and `passive`
   otherwise; neither sets `progress`.
2. Implement; commit 1 after `mise ci:checks`.
3. **Scenario** `t4-objects-explore-fargodeep`: preset `elwynn10`; task
   "Take The Fargodeep Mine quest from Marshal Dughan and complete it."
   (quest 62, starter 240, `creature_queststarter.sql:72`); checks: truth
   quest 62 complete or rewarded, game log `objects/trigger` with 88.
   `mise eval`, then the one-commit rule.

**Proof:** eval (`t4-objects-explore-fargodeep`).

**Commits:**

```
feat: Log area triggers and trigger messages
```

```
test: Prove an exploration quest in Elwynn
```

Bodies: "The agent could not see that it entered a trigger or why a
portal refused it. Trigger rows and server trigger messages now reach
the game log." and "The Fargodeep Mine completes only when the client
reports trigger 88, so a pass shows the core watcher on the live
server."

---

## objects-11: Object objectives in the quest loop

Rulings: SR1-objects-4, SR1-objects-9, SR1-objects-11.

**Files (harness, under leases):** `packages/harness/src/loops/quest-objective.ts`,
`loops/quest-cycle.ts` and their tests.

**Depends on:** objects-7, objects-8.

**Opcodes:** none (harness).

**Steps:**

1. **Failing tests.** `quest-objective.test.ts`: a query target with a
   negative `npcOrGoId` (`loops/quest-objective.ts:60-63` stops with
   `objective_gameobject_unsupported` today) now gives an object
   objective `{ entry, index, required }`. An item objective whose source
   is a chest resolves the chest entry from the template's `questItems`
   (`QueryHandler.cpp:205-211`). `encounter-cycle-objective.test.ts` or a
   new `quest-cycle-object.test.ts`: the cycle walks to the nearest
   object of the entry with `LO_ACTIVATE`, uses it through the `use`
   steps, and counts progress from quest events.
2. Implement, `mise ci:checks`.

**Proof:** live. An `engage` quest run on a new `elwynn10` account with
quest 3904 (if issue 6 holds, on an `elwynn1` account after `soap gm
quest add 3904`) completes the quest without a manual `use`; `soap truth`
shows 3904 complete.

**Commit:**

```
feat: Complete object objectives in quests

The quest loop stopped at any quest that needs an object. It now walks
to the object and uses it, and counts crates that come from chests.
```

---

## objects-6: Object animations and fishing state (wave 4)

**Files:**
- Modify: `areas/objects/protocol.ts`, `store.ts`, `area.ts`,
  `opcodes.ts` (`unseen` if a proof falls back to R22) and tests;
  `packages/core/test-support/areas/objects.ts`
- Create: `packages/devtools/src/probe-flows/objects-fish.ts`
- Modify: `docs/areas/objects.md`; regenerate
  `docs/protocol-coverage/objects.md`

**Depends on:** objects-1, objects-2, and `economy-8` (the `mail` tool,
to take the staged pole).

**Opcodes:** `SMSG_GAMEOBJECT_CUSTOM_ANIM`, `SMSG_GAMEOBJECT_DESPAWN_ANIM`,
`SMSG_FISH_NOT_HOOKED`, `SMSG_FISH_ESCAPED`.

**Steps:**

1. **Failing parser tests:** `parseCustomAnim` reads guid and `u32` anim
   (`GameObject.cpp:2148-2154`); `parseDespawnAnim` reads one guid
   (`Entities/Object/Object.cpp:2189-2194`); the two fish opcodes have an
   empty body (`GameObject.cpp:634`, `:1801`).
2. **Failing store tests** (`areaRig`): `custom_anim` sets `anims`;
   `despawn_anim` adds to `despawning`, and a core `destroy` event clears
   it; a despawn guid for a dynamic object is accepted
   (`DynamicObject.cpp:184`). Fishing: a cast of the fishing spell sets
   `fishing { bobber: undefined, phase: "cast" }`; the own bobber
   (`objectFields(entity).createdBy` is the self guid) appears as
   `waiting`; its custom animation emits `fish_hooked` (`GameObject.cpp:498-521`);
   `SMSG_FISH_NOT_HOOKED` and `SMSG_FISH_ESCAPED` emit their events. The
   store never uses the bobber itself.
3. Implement, proof rows, `mise protocol:coverage`, `mise ci:checks`.

**Proof:** live, with GM staging on the task's own character (R12).
- New `elwynn10` account: `soap gm <ACCOUNT> learn 7620` (online;
  Fishing, `modules/mod-playerbots/src/Ai/Base/Actions/FishingAction.cpp:22`),
  `soap gm <ACCOUNT> items 6256:1` (the pole, `:23`; it arrives by mail,
  so take it at a mailbox with the `mail` tool and equip it). Stand at
  fishable water near Goldshire (the builder picks a point and records
  it). `--flow objects-fish`: cast 7620; the splash gives
  `SMSG_GAMEOBJECT_CUSTOM_ANIM`; a use before the splash gives
  `SMSG_FISH_NOT_HOOKED` (`GameObject.cpp:1796-1803`); no use after the
  splash gives `SMSG_FISH_ESCAPED` (`GameObject.cpp:626-640`).
- `SMSG_GAMEOBJECT_DESPAWN_ANIM`: loot a Milly's Harvest crate (objects-4
  flow) and watch the tap; it was seen live once in a fight before.
- Any opcode not captured falls back to R22: a rig test from the writer
  above, `unseen` in `opcodes.ts`, Proof `mock`.

**Commit:**

```
feat: Track object animations and fishing
```

Body: "Fishing and despawning objects were invisible. The objects area
now records object animations and moves a fishing phase from the
server's fish opcodes, so the harness can act on a hooked fish."

---

## objects-9: use do: fish (wave 4)

**Files:**
- Create: `packages/harness/src/areas/objects/tool-fish.ts` and test
- Modify: `packages/harness/src/areas/objects/tool.ts`, `area.ts` and
  tests (`objects/fish` passive rows)
- Append: `docs/capabilities.md` ("Not shown by any scenario": fishing,
  no preset has Fishing or a pole)

**Depends on:** objects-6, objects-8.

**Opcodes:** none (harness).

**Steps:**

1. **Failing tests:** `use do: fish` refuses `no_fishing` and `no_pole`;
   it casts the fishing spell found by name in the spell catalog, waits
   up to 30 s for `fish_hooked`, then uses the bobber at once (the bobber
   is ready only in its last 5 s, `Entities/GameObject/GameObject.h:117`,
   `GameObject.cpp:501`), loots and releases; `fish_not_hooked` and
   `fish_escaped` end the step `FAILED`. Rules: `fish_escaped` and
   `fish_not_hooked` give one `passive` row `objects/fish`.
2. Implement, `mise ci:checks`.

**Proof:** live. A harness run on the objects-6 staging character catches
one fish; `soap truth` shows the fish in bags. No eval: a fishing preset
needs the maintainer (design 5.4, "Needs the maintainer").

**Commit:**

```
feat: Fish with the use tool
```

Body: "A hooked fish is lost unless the bobber is used within five
seconds, which the model cannot do. use do:fish now casts, waits for the
bite and takes the catch by itself."

---

## Dead opcodes

None. All 11 `objects` rows are relevant (design 5.4). The verify
corrections move no row into this area and mark none dead; C5 and C11
only change the reasons `CMSG_AREATRIGGER` matters (ghost return to an
instance, `MiscHandler.cpp:786-794`; quest exploration, not zone
exploration XP). Out of scope and not an `objects` row:
`SMSG_GAMEOBJECT_RESET_STATE` has no send site in AzerothCore `src/` or
`modules/`, and `CMSG_SPELLCLICK` stays in `vehicles` (design 5.16).

## Seed rulings (SEED-1)

The coordinator rules each open issue, lease request and decision that a
wave-1 task of this unit (objects-1 to objects-5, objects-7, objects-8,
objects-10, objects-11) meets. Each ruling is **not yet ruled by the
maintainer**. A ruling marked "amends" changes the named contract, plan
or design text; the coordinator applies that text in one `COORD-<n>`
commit before the first affected task starts, and until then the builder
follows the ruling. Facts marked [M] were read in this worktree at
`f3cb40a9` or in the AzerothCore checkout.

Left for a later seed, not ruled here: objects-6 and objects-9 (wave 4:
the fishing staging, `economy-8`, the `unseen` fallback and the
`objects/fish` rows). No wave-1 task meets them. objects-10 meets no open
issue.

| Id | Issue (source) | Ruling | Status |
|---|---|---|---|
| SR1-objects-1 | Contract issue 1: "`control-mover.ts` is not on the control lease list ... objects-5 needs `control-mover.ts` in its lease"; objects-5 "Depends on": "the control lease (after the self-state task that holds it lands; issue 1)"; step 4: "In `control-drive.test.ts` or a new `control-pose.test.ts`" | Closed by the plan fix-up: contract 2.7 "control files, extended" names `control-mover.ts` for objects. The plan "Leases" queue wins over the unit text: objects-5 holds `control.ts` and `control-mover.ts` first, from `SEED-1`, so the `lease:control` wait is met at the seed, and objects-5 does not wait for a self-state task. When objects-5 lands, `control.ts` goes to self-state-1 and `control-mover.ts` to vehicles-4. objects-5 edits no other control file: `Mover` already holds `emit` (`control-mover.ts:44`, `:65-69`) and `sendMove` is at `:370-376` [M]. objects-5 creates the new `control-pose.test.ts` and does not edit `control-drive.test.ts`; `control-pose.test.ts` then rides the `control.ts` lease | accepted by the maintainer (P2-5) |
| SR1-objects-2 | Unit setup: "One task at a time"; "Unit files" says objects-1 creates `store.ts`, `test-support/areas/objects.ts` and `docs/areas/objects.md`, and objects-2 creates `protocol.ts` and `runtime.ts`; the plan index makes objects-1 and objects-5 ready together | The unit runs objects-5 first, because five self-state tasks queue behind its `control.ts` lease; then objects-1, 2, 3, 4, 7, 8, 10, 11 in dependency order. The first task that needs a unit file creates it, and every later "Create" line of a unit file reads "create or extend". The first task that creates `docs/areas/objects.md` writes all contract 3.8 headings | accepted by the maintainer (P2-5) |
| SR1-objects-3 | objects-5 step 3: "no send while the character is on a taxi ... the builder finds which `ControlState` field says so, could not determine at `71fba0ab`" | No `ControlState` field says so (`control.ts:42-54` [M]). The server's `IsInFlight` is the unit state `UNIT_STATE_IN_FLIGHT` (`Entities/Unit/Unit.h:1712`), which the client never receives. The client sees `UNIT_FLAG_TAXI_FLIGHT`, which the flight path sets and clears (`Movement/MovementGenerators/WaypointMovementGenerator.cpp:704`, `:672`) [M]. The watcher reads that bit (`UnitFlag.TAXI_FLIGHT`, `entity-fields.ts:91`, as `nearby.ts:105` does [M]) from the self entity, through the `getEntity` of the `SessionDeps` that the store receives. objects-5 edits neither `self-store.ts` nor `control-sync.ts` | accepted by the maintainer (P2-5) |
| SR1-objects-4 | Contract issue 4: "The plan reads them from `entity.rawFields` through the leased extractor in an area helper"; objects-7 step 2: "if `objectFields` is not exported, the task asks the coordinator for the barrel line (contract 0.9)" | Issue 4 stands: no edit to `entity-store.ts`. The barrel line for `objectFields` is refused: contract 1.6 gives `index.ts` "No per-area line, ever", and the harness imports no area module (contract 0.3). Instead: (a) objects-1 stores the derived values as data in each `GameObjectTemplate` of `ObjectsState` (`lockId`, `pageId`, `questId`, `questItems`), computed with the `templates.ts` functions when the reply arrives, so objects-7, 8 and 11 read them from `session.areas.objects.state()`; (b) the coordinator adds one legacy export line to `packages/core/src/wow/index.ts` before objects-7 starts, `export { extractGameObjectFields, type GameObjectFieldsResult } from "#wow/protocol/extract-fields";`, and the harness reads `dynFlags` with `extractGameObjectFields(entity.rawFields)`; `locked` and `busy` come from `entity.flags` (`entity-store.ts:43-49` [M]). `fields.ts` stays for core use (objects-6) | accepted by the maintainer (P2-5) |
| SR1-objects-5 | Contract issue 2: "A lease on those tool modules must include their blocks there [`tools/params.ts`]"; plan "Phase A": "`SEED-1` ... splits `tools/params.ts` by tool and `tools/look.ts` by view"; objects-7 files | Closed by the plan fix-up (contract 2.7, `tools/params.ts` rider). objects-7 holds the `lookParams`, `travelParams` and `interactParams` blocks, or the sibling files that `SEED-1` splits them into (contract 2.7: a lease on the old file covers the sibling of the same tool or view). Queues: `tools/look.ts` goes threat-3b, then objects-7, then quests-2; if the `SEED-1` split puts the object list and threat-3b's `UnitView` block in different siblings, each sibling is its own lease, `SEED-1` names them in "Leases", and objects-7 does not wait for threat-3b. Otherwise objects-7 starts after threat-3b lands. objects-7 uses no D13 rider: it edits neither `contract/details.ts` nor `contract/views.ts`, and stops `blocked` if it needs either | accepted by the maintainer (P2-5) |
| SR1-objects-6 | objects-7 step 1: "`interact npc: \"o1\"` on a type-2 quest giver ... sends the quest hello to the object guid"; step 2: "Check that core's quest code accepts an object guid as the quest giver; if it does not, stop as `blocked`" | Refused as written: both hello handlers accept a creature only (`Handlers/NPCHandler.cpp:144`, `Handlers/QuestHandler.cpp:86`), and a type-2 object opens its menu only on `CMSG_GAMEOBJ_USE` (`Entities/GameObject/GameObject.cpp:1509-1518`) [M]. The later quest handlers accept a game object guid (`QuestHandler.cpp:122`, `:265`, `:363`, `:487`) [M]. core's quest store drops a dialog whose guid is not the recorded giver (`quest-store.ts:269-285` [M]). So objects-2's `use(guid)` calls `core.quests.requestIntent({ action: "talk", guid })` (`quest-store.ts:135` [M]) before it sends, when the object's template type is 2, with one runtime test. objects-7 sends through `claim.areas.objects.use` for a type-2 object, adds `"use"` to `worldActs` in harness `areas/objects/area.ts` (objects-8 extends the list), and gains the dependency objects-2 | accepted by the maintainer (P2-5) |
| SR1-objects-7 | objects-4 step 5: "`open(guid, spellId)` (sends `CMSG_CAST_SPELL` with an object target ...)"; objects-8 step 1: "settles `DONE` on `SMSG_LOOT_RESPONSE` for that guid" | The open-lock effect sends the loot window by itself, but core's rewards store drops a loot reply unless its window is `opening` (`rewards-store.ts:190-218` [M]), and `Rewards.open` refuses a non-unit (`rewards.ts:149-162` [M]). So `open` returns `{ ok: false, reason: "loot_open" }` when `core.rewards.snapshot().loot.phase` is not `closed`, and otherwise calls `core.rewards.requestOpen(guid)` (`rewards-store.ts:135` [M]) before it sends the cast. objects-8 calls `rewards.abandonOpen()` when the step ends `FAILED` or `UNCONFIRMED` | accepted by the maintainer (P2-5) |
| SR1-objects-8 | objects-8 step 3: "loot through `lootCorpse(run, guid)` (`loops/loot-run.ts:47`) for the object guid. If that function needs a corpse, stop as `blocked` and name `loops/loot-run.ts`" | It needs a corpse: `awaitCorpse` and `tryOpen` wait for a dead unit and call `rewards.open` (`loot-run.ts:156-186` [M]). objects-8 gets a new lease on harness `loops/loot-run.ts` (no other holder): it exports one function `lootObject(run, guid)` that waits for `loot_opened` for that guid and then runs the take, money and close steps that `lootOpened` runs today, and it leaves `lootCorpse` unchanged. Amends the plan "Leases" table (one row) and the contract 2.7 "Leases added by the plan fix-up" table (one row) | accepted by the maintainer (P2-5) |
| SR1-objects-9 | Contract issue 3: "`loops/quest-cycle.ts` ... the lease list names only `loops/quest-objective.ts` for `objects`"; objects-11 step 1: "`encounter-cycle-objective.test.ts` or a new `quest-cycle-object.test.ts`" | Closed by the plan fix-up (contract 2.7, `loops/quest-cycle.ts` for objects). objects-11 holds both loop files; no later task is queued for them. objects-11 creates the new `quest-cycle-object.test.ts` and does not edit `encounter-cycle-objective.test.ts` | accepted by the maintainer (P2-5) |
| SR1-objects-10 | Contract issue 5: "Contract 3.8 asks for one proof row per owned opcode, but objects-1 creates the doc before any owned opcode is built ... If a check requires every row from the first commit, the builder reports it" | Stands. No check compares proof rows with `owns` today (`mise protocol:cite-check` reads citations only) [M, `rg`]. An owned opcode that no landed task has built stands under "Left out" as "built by objects-<n>"; the task that builds it moves it into the proof table. The four objects-6 opcodes stay under "Left out" through Gate A. Amends contract 3.8: "Every opcode in the area's `owns` has exactly one row" holds at the gate of the phase whose task builds the opcode | accepted by the maintainer (P2-5) |
| SR1-objects-11 | Contract issue 6: "Quest 3904 needs 3903, which needs 33 ... if 3903 is not rewarded, `t4-objects-quest-elwynn` cannot start without GM, and the task stops as `blocked`" | The chain holds (`quest_template_addon.sql:2171-2172`) [M]. `soap gm quest add` runs `Player::CanAddQuest`, which checks the quest log and the source item only, not the previous quest (`Commands/cs_quest.cpp:86-88`, `Entities/Player/PlayerQuest.cpp:266-288`) [M], so the GM staging of objects-4 and objects-11 works on any new account. objects-8 keeps its `soap truth` check first. If 3903 is not rewarded on `elwynn10`, objects-8 does not stop: it lands the tool commit and `t0-objects-read-shrine`, leaves `t4-objects-quest-elwynn` out (no JSON, no `ROUND_1` line, no doc rows), counts as landed, and names the gap in its report; the coordinator then adds a task for another object quest or preset. objects-10 and objects-11 do not need that scenario | accepted by the maintainer (P2-5) |
| SR1-objects-12 | objects-4 step 2: "`buildCastSpell` with an object target ...; `buildUseItem` with an object target ... Callers that pass a unit keep working"; plan "Leases": `protocol/item.ts` "items-1 (A) → objects-4 (A) → talents-5a (C)" | Both builders stay compatible with their one caller, `combat-casts.ts:69`, `:90` [M], which is under the spells lease: `buildCastSpell` takes `bigint \| SpellTarget` as its third argument (a bigint writes today's bytes), and `ItemUseRequest` gains an optional `target?: SpellTarget` (omitted writes mask 0). objects-4 edits no caller. objects-4 starts after items-1 lands; the plan index lists only objects-1 as its dependency, so the coordinator adds that wait | accepted by the maintainer (P2-5) |
| SR1-objects-13 | objects-4 step 4: "a `LOCK_KEY_SKILL` lock picks the first known spell ... a `LOCK_KEY_ITEM` lock returns the key item"; proof: "whether a new character knows it could not be determined" | The choice also covers `LOCK_KEY_SPELL`: it returns the lock's own spell even when the character does not know it, because the server allows that cast (`Handlers/SpellHandler.cpp:448-461`, `Entities/GameObject/GameObject.cpp:3061-3067`) [M]. For `LOCK_KEY_SKILL`, the spell pick follows `GameObject::GetSpellForLock` (`GameObject.cpp:3035-3092`), and the builder checks the skill test against `Spell.cpp:8707-8760`. The type of lock 43 could not be determined here (no `Lock.dbc` on disk); the `lock-catalog` test records it. If the new `elwynn1` character knows no spell that opens lock 43, the live proof runs `mise factory soap gm <ACCOUNT> learn <spell>` on that character first (R12), and objects-8 reports `t4-objects-quest-elwynn` as at risk, because an eval allows no GM command | accepted by the maintainer (P2-5) |
| SR1-objects-14 | Leases of objects-1: `protocol/entity-queries.ts` ("full `SMSG_GAMEOBJECT_QUERY_RESPONSE` body") and `protocol/extract-fields.ts` ("`createdBy`, `dynFlags`, `pathProgress`") | objects-1 holds both from `SEED-1`, with their tests; no later task is queued (vehicles reads only). The legacy handler in `world-handlers-entity.ts` (remote-motion-1's lease) needs no edit, as step 2 states; if the new result type breaks it, objects-1 stops `blocked` | accepted by the maintainer (P2-5) |
| SR1-objects-15 | Design 5.4 "Decisions (not yet ruled)": "`objects` owns the target writer; the watcher lives in core ...; report use follows every use; arrival triggers are not sent; reads are graded by a fixed phrase; the worker checks which open-lock spell a new character knows" | Each stands as the design states (objects-2, 4, 5, 8). The watcher in core is an exception to "behaviour in the harness", because the server expects the trigger from every client and the watcher chooses nothing | accepted by the maintainer (P2-5) |
| SR1-objects-16 | objects-7 files: "`docs/harness.md` (the `look`, `travel` and `interact` lines only)" | Contract 2.6 lets a task only append a row for a new tool to `docs/harness.md`, and the plan "Leases" table has no row for that file, so an edit to an existing tool's line is outside ownership (contract 0.9). A lease on an existing tool module also covers that tool's lines in `docs/harness.md`, as D13 does for `contract/details.ts`. objects-7 edits only the `look`, `travel` and `interact` lines. Amends contract 2.7 (the D13 sentence) and D13 | accepted by the maintainer (P2-5) |

## COMPLETE

## Build rulings

| Id | Issue | Ruling | Status |
|---|---|---|---|
| BR-objects-1-1 | Two legacy fixtures, `world-handlers-entity-lifecycle.test.ts:342-347` and `world-handlers-entity-queries.test.ts:259-264`, build an `SMSG_GAMEOBJECT_QUERY_RESPONSE` body AzerothCore never writes, and pin opcodes objects-1 now owns | objects-1 may update both fixtures to bodies built from the AzerothCore writer | ruled by the maintainer (P2-4) |
| BR-objects-1-2 | Review finding: a partial `CREATED_BY` update drops the unchanged GUID half, because `world-handlers-entity.ts` calls `extractGameObjectFields` without the entity's `rawFields` fallback; that file is outside objects-1's plan body | objects-1 may pass `entity.rawFields` through for game objects in `world-handlers-entity.ts`, as the unit path already does | coordinator ruling (P2-17) |
| BR-objects-4-1 | objects-4 adds two `miscValue` members to the shared `packages/core/test-support/spell-fixtures.ts` | Allowed: append-only fixture members | coordinator ruling (P2-17) |
