# items: gear, bags, containers, timers, sockets, sets and refunds (key: items)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.3 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).

Unit `items`, one code area `items`. Worktree `proto-items`, branch
`proto/area-items` (contract 0.1, D19). One task at a time.

## What the unit delivers

The character can wear gear, put bags in its bag slots, take gear off,
move and split stacks, open containers, read readable items, load ammo,
socket gems, and keep equipment sets and refunds in core. The agent gets
one new tool, `gear` (contract 1.9), a richer `journal about: bags`, and
`items/<name>` game-log rows. The unit also reads the full item template
and the item update fields that the legacy parser skips, and it owns the
correlation rule for `SMSG_INVENTORY_CHANGE_FAILURE` (N28).

All 35 `items` rows are relevant; none is dead. Each owned opcode is in
exactly one task below.

Phases (design 5.1, N22): items-1 to items-5 and items-8 are phase 1;
items-6, items-7 and items-9 are phase 3; items-10 and items-11 are
phase 4. The unit runs its tasks in this order: items-1, items-2,
items-3a, items-3b, items-4, items-5a, items-5b, items-5c, items-8,
items-6, items-7, items-9, items-10, items-11.

Marks: **[M]** read or run while planning; **[I]** inferred. AzerothCore
paths are relative to `src/server/game/` in
`~/code/azerothcore-wotlk-playerbots` (`9d4e36d81`); wowm paths are
relative to `wow_message_parser/wowm/world/`. Peon paths are at
`71fba0ab`; core paths without a prefix are under `packages/core/src/wow/`.

## Fixed names for this unit

These follow contract D7 and 1.8. A builder adds private helpers but no
second public name.

| Name | File | Created by |
|---|---|---|
| `ITEMS_OPCODES` | `areas/items/opcodes.ts` | `SEED-1` |
| `itemsArea` | `areas/items/area.ts` | `SEED-1`; items-3a fills it |
| `ItemsState`, `ItemsEvent`, `ItemsStore` | `areas/items/store.ts` | items-3a |
| `ItemsActs`, `itemsRuntime` | `areas/items/runtime.ts` | items-3a |
| move builders, `ItemPosition` | `areas/items/protocol.ts` | items-3a |
| move state and settle rules | `areas/items/moves.ts` | items-3a |
| read, text and name-cache parsers and state | `areas/items/protocol-read.ts`, `areas/items/reads.ts` | items-4 |
| timer, cooldown, proficiency parsers and state | `areas/items/protocol-timers.ts`, `areas/items/timers.ts` | items-6 |
| socket and enchant parsers | `areas/items/protocol-sockets.ts` | items-7 |
| equipment-set parsers, builders and state | `areas/items/protocol-sets.ts`, `areas/items/sets.ts` | items-9 |
| refund parsers, builders and state | `areas/items/protocol-refund.ts`, `areas/items/refunds.ts` | items-10 |
| wrap and item-set name builders and parser | `areas/items/protocol-names.ts` | items-11 |
| `ownsInventoryFailure`, `isNoChange`, `InventoryClaim` | `protocol/inventory.ts` (lease) | items-3a |
| test packet builders `items<Opcode>Body(...)` | `packages/core/test-support/areas/items.ts` | items-3a, extended by each task |
| `itemsHarness` | `packages/harness/src/areas/items/area.ts` | `SEED-1`; items-5a fills it |
| `gearTool` | `packages/harness/src/areas/items/tool.ts` | items-5a |
| probe flows | `packages/devtools/src/probe-flows/items-<name>.ts` | per task |
| wire notes and proof table | `docs/areas/items.md` | items-1, extended by each task |

`ItemsStore` is one store with one event union (contract 1.2 has one
store per area). The six stores of design 5.3 (`ItemMoveStore`,
`ItemTimerStore`, `ProficiencyStore`, `ItemReadStore`,
`EquipmentSetStore`, `RefundStore`) become slices in the part files
above, and `store.ts` composes them. `ItemsState` has one key per slice:
`move`, `read`, `timers`, `proficiency`, `sets`, `refund`.

Event `type` values (contract 1.2, `/^[a-z_]+$/`), each added by the task
that first emits it: `move_requested`, `moved`, `move_refused`,
`move_no_change`, `move_unanswered`, `item_received` (items-3a);
`read_requested`, `read_ok`, `read_failed`, `read_unanswered`,
`item_text` (items-4); `item_cooldown`, `item_timer`,
`item_enchant_timer`, `durability_loss_death`, `proficiency_changed`
(items-6); `enchantment_log`, `sockets_updated` (items-7);
`sets_listed`, `set_saved`, `set_used`, `set_deleted` (items-9);
`refund_info`, `refund_result`, `refund_unanswered` (items-10);
`set_name`, `set_name_none` (items-11).

Harness log rows are `items/<name>` (contract 1.9: the router sets
`domain: items`), not the `item/<name>` rows of the area research.

## Leases this unit needs

The plan index holds the lease table (contract 2.7). This unit asks for
these leases, each for one task, handed on when that task lands (D12):

| File | Task | Edit |
|---|---|---|
| `protocol/item.ts` | items-1 | full `ItemTemplate` parse |
| `item-use.ts` | items-1 | only if the wider `ItemTemplate` breaks a consumer [I] |
| `inventory.ts` | items-2 | enchant, timer, charge, creator, flag and ammo fields |
| `protocol/inventory.ts` | items-3a | the correlation helper |
| `gameplay-handlers.ts` | items-3b | the `SMSG_INVENTORY_CHANGE_FAILURE` fan-out (`gameplay-handlers.ts:306-313` [M]) |
| `destroy-store.ts`, `vendor-store.ts`, `quest-store.ts`, `quest-errors.ts`, `rewards-store.ts` | items-3b | one `inventoryClaim()` read each, and the settle guard (see Contract issues 1) |
| harness `tools/journal.ts` and its `JournalAfter` block in `contract/details.ts` (D13) | items-5b | bag positions and marks |

## Contract issues

Defects or gaps found while planning. The contract is not changed; the
plan works around each one as stated, and the coordinator decides.

1. **The four stores are not in `gameplay-handlers.ts`.** N28 and
   contract 2.7 give `items` a lease on `gameplay-handlers.ts` to fix "the
   other four stores". The settle code lives in the stores:
   `destroy-store.ts:76-79`, `vendor-store.ts:207-211`,
   `quest-store.ts:359-364` with `quest-errors.ts:26-39`, and
   `rewards-store.ts:268-285` [M]. `combat-store.ts:260-265` already
   matches on `item1` [M] and does not change. The rule needs to know
   whether another request is pending, so each store gains one read.
   items-3b therefore needs the five store files under lease as well. If
   the coordinator does not grant them, items-3b becomes a `COORD-<n>`
   commit built from its plan body, and items-3a still lands alone.
2. **The area needs two more value imports.** The move settle rule reads
   the inventory (`readInventory`, `inventory.ts:309` [M]) and the
   precondition reads life (`readLife`, `player-state.ts:45` [M]).
   Contract 1.12 allows value imports from `#wow/protocol/*`, `#lib/*`,
   `#wow/areas/contract`, `#wow/geometry`, `#wow/dbc` and `#wow/data/*`
   only. items-3a needs `#wow/inventory` and `#wow/player-state` on the
   allow-list. The coordinator adds them at `SEED-1` or on the first
   `blocked` report.
3. **`SMSG_EQUIPMENT_SET_SAVED` 0x137.** The area research has items-9 add
   the `CORE_OPCODES` entry. Contract 1.11 gives it to S0-2, and no area
   task edits `protocol-tables.ts` or `protocol/opcodes.ts`. items-9 only
   parses it. If S0-2 did not add it, items-9 stops as `blocked`.
4. **The helper name is not in the contract.** Economy (`bank`,
   `buyback`) and guild (`guildbank`) import the correlation helper
   (contract 2.5). This plan fixes `ownsInventoryFailure`, `isNoChange`
   and `InventoryClaim` in `protocol/inventory.ts`. Not in the contract;
   the coordinator confirms or renames before items-3a starts.
5. **Legacy stores cannot see the area's pending move.** A legacy store
   in `gameplay-handlers.ts` cannot import the area store, so when `item1`
   is 0 and both an item move and a legacy request are pending, the
   legacy request settles and the move ends `unanswered`. The area store
   reads the legacy claims through `core` and never settles in that case.
   The cross-talk goes one way and ends in a timeout, not a wrong refusal.
6. **Scenario ids.** Design 5.3 names the slugs `equip-upgrade`,
   `unequip`, `move`, `split`, `open`, `read`, `ammo`, `socket` under
   `t8-items-*` (N26). This plan uses `t8-items-<slug>`, not the area
   research ids such as `t8-move-item`. The plan index must list them
   (contract 3.7).
7. **Container opening needs no rewards lease if `requestOpen` works.**
   `RewardsRuntime.open` accepts only an observed dead creature
   (`rewards.ts:149-163` [M]). The store method `requestOpen(guid)`
   (`rewards-store.ts:135` [M]) has no such check, and `CoreStores`
   carries the rewards store (`session-stores.ts:28` [M]). items-4 calls
   `core.rewards.requestOpen(itemGuid)` before it sends `CMSG_OPEN_ITEM`.
   If that path cannot open the window, items-4 stops as `blocked` and
   asks for a lease on `rewards.ts`.

## Setup for every task

- The unit worktree exists (contract 0.1). Start a task from the current
  `origin/factory/426-protocol-coverage` after the previous task landed.
- Check the seed: `packages/core/src/wow/areas/items/opcodes.ts` lists the
  35 owned opcodes, `SMSG_INVENTORY_CHANGE_FAILURE` is not in `owns`,
  and the `stubs` list holds `SMSG_SET_PROFICIENCY` and
  `SMSG_EQUIPMENT_SET_LIST`.
- Tests use `areaRig("items", ...)` (contract 1.8). Test bodies come from
  the AzerothCore writer or reader cited in the task (contract 0.5); the
  citation goes into the `docs/areas/items.md` proof table, never into the
  test file.
- Every task ends its steps with `mise protocol:coverage`, then
  `mise ci:checks`, and runs `mise protocol:cite-check` on
  `docs/areas/items.md`.
- Live proof uses only accounts the task created
  (`mise factory soap create <preset>`), the probe (T-3), the puppet or
  `mise eval`. `soap gm` only on those accounts (T-5). Delete every
  account with `mise factory soap delete <ACCOUNT>` before the report.
  If the server or SOAP is down, report it and stop.
- Item ids for setups are not chosen from the world database [I]. Each
  task picks an id, confirms its template from the live
  `SMSG_ITEM_QUERY_SINGLE_RESPONSE` (after items-1, the full template),
  and records the id in its report and in `docs/areas/items.md` "Wire
  notes". Known ids: hearthstone 6948 and item 159, which the realm
  service test uses (`packages/factory/src/realm-service.test.ts:73` [M]).

---

## items-1: Read the full item template

Rulings: SR1-items-1, SR1-items-9 (section "Seed rulings (SEED-1)").

**Phase:** 1. **codeArea:** `items`. **Depends on:** item6, R0, S0-5,
SEED-1. **Size:** S.

**Opcodes:** none owned. Extends the handled
`SMSG_ITEM_QUERY_SINGLE_RESPONSE` (legacy owner
`gameplay-handlers.ts:314-316` [M]) under the `protocol/item.ts` lease.

**Files:**
- Edit (lease): `packages/core/src/wow/protocol/item.ts`
- Edit (lease): `packages/core/src/wow/protocol/item.test.ts` (exists
  [M])
- Create: `packages/core/test-support/areas/items.ts` (first builder)
- Create: `docs/areas/items.md` (fixed headings of contract 3.8, empty
  proof table plus the notes below)
- Edit (lease, only if needed): `packages/core/src/wow/item-use.ts`

**Steps:**

1. **Failing test.** In `packages/core/test-support/areas/items.ts` add
   `itemsItemQuerySingleResponseBody(template)`, which writes every field
   in the order of `Handlers/ItemHandler.cpp:413-538` [M]: entry, class,
   subclass, sound override, four names, display id, quality, flags,
   flags2, buy price, sell price, inventory type, allowable class,
   allowable race, item level, required level, required skill and rank,
   required spell, honor rank, city rank, reputation faction and rank,
   max count, stackable, container slots, stats count and pairs, scaling
   distribution and value, two damage entries (`float` min and max,
   `u32` type, `ItemTemplate.h:577-582`), armour, six resistances
   (`int32`), delay, ammo type, ranged mod range (`float`), five spells
   (a missing spell writes `0, 0, 0, -1, 0, -1`, `:497-505`), bonding,
   description, page text, language, page material, start quest, lock
   id, material, sheath, random property, random suffix, block, item set,
   max durability, area, map, bag family, totem category, three socket
   colour and content pairs, socket bonus, gem properties, disenchant
   skill, armour damage modifier (`float`), duration, limit category,
   holiday (`:507-536`). Test titles: "reads the whole AzerothCore item
   template", "reads a stats count of 0 and of 10", "keeps a missing spell
   out", "reads the tail after the spells". Run
   `mise test packages/core/src/wow/protocol/item.test.ts`: it
   fails on the missing template fields.
2. **Implement.** Widen `ItemTemplate` (`protocol/item.ts:19-27` [M])
   with `inventoryType`, `allowableClass`, `allowableRace`, `itemLevel`,
   `requiredLevel`, `requiredSkill`, `requiredSkillRank`,
   `requiredSpell`, `maxCount`, `containerSlots`, `stats` (pairs),
   `damage` (two entries), `armor`, `resistances`, `delay`, `ammoType`,
   `bonding`, `pageText`, `lockId`, `itemSet`, `maxDurability`,
   `bagFamily`, `sockets` (three colour and content pairs),
   `socketBonus`, `gemProperties`, `duration`, `limitCategory`, `flags`.
   Replace the two `skip` constants with reads. `itemSet` feeds items-11.
   Grep the consumers (`rg -n "ItemTemplate\b" packages`: `client.ts`,
   `client-gameplay.ts`, `index.ts`, `item-use.ts`,
   `harness/src/loops/game.ts` [M]); widening is additive, so they
   should compile unchanged [I].
3. `docs/areas/items.md`: "Wire notes" gets the AzerothCore template
   order (the wowm file is `queries/smsg_item_query_single_response.wowm`
   [I: name not checked]). "Proof" stays empty; this task owns no opcode.
4. `mise typecheck core`, `mise typecheck harness`, `mise ci:checks`.

**Proof (live):** a probe `login` run on a `fresh` character, then three
`CMSG_ITEM_QUERY_SINGLE` sends (`--send CMSG_ITEM_QUERY_SINGLE --body
<entry hex>` for a weapon, a bag and a trinket) with `--bodies`. The
report decodes each captured body with the new parser and lists the
fields. No GM.

**Commit:**
- `feat: Read the whole item template`
- Body: `The template parser stopped after the spell block, so Peon could
  not see an item's slot, level, armour or stats. It now reads every field
  AzerothCore writes.`

---

## items-2: Read item enchant, timer, charge and ammo fields

Rulings: SR1-items-1, SR1-items-9, SR1-items-10, SR1-items-11 (section "Seed rulings (SEED-1)").

**Phase:** 1. **codeArea:** `items`. **Depends on:** items-1. **Size:** S.

**Opcodes:** none owned. Update fields only.

**Files:**
- Edit (lease): `packages/core/src/wow/inventory.ts` and
  `packages/core/src/wow/inventory.test.ts`
- Edit: `docs/areas/items.md` ("Wire notes")

**Steps:**

1. **Failing test.** In `inventory.test.ts`, build an item entity with
   `ITEM_FIELD_DURATION` (offset 15), `ITEM_FIELD_SPELL_CHARGES` (16, 5
   words), the enchantment block from `ITEM_FIELD_ENCHANTMENT_1_1`
   (offset 22), `ITEM_FIELD_CREATOR`, `ITEM_FIELD_GIFTCREATOR` (12) and
   `ITEM_FIELD_FLAGS` with bits 0x1, 0x8, 0x200 and 0x1000
   (`Entities/Item/ItemTemplate.h:109-121`), and a player entity with
   `PLAYER_AMMO_ID` (offset 1198) set (`protocol/update-fields.ts:14-52,304`
   [M]). Check the enchantment stride against
   `Entities/Item/Item.h:169-176` and the table: the table lists
   `ENCHANTMENT_1_1` with size 2 [M], which the builder confirms before
   reading 12 slots of id, duration and charges. Titles: "reads timed
   items", "reads the 12 enchantment slots", "names the flag bits",
   "reads the loaded ammo". The test fails on the missing fields.
2. **Implement.** `InventoryItem` (`inventory.ts:12` [M]) gains
   `duration`, `spellCharges`, `enchantments` (slot, id, duration,
   charges; empty slots left out), `creator`, `giftCreator` and `flags`
   (`soulbound`, `wrapped`, `readable`, `refundable`). `InventoryState`
   (`inventory.ts:60` [M]) gains `ammoId`, read from the self entity in
   `readInventory` (`inventory.ts:309` [M]), the field the harness
   already reads at `harness/src/loops/combat-ranged-gear.ts:55` [M]. No
   `player-state.ts` edit.
3. `mise typecheck core`, `mise typecheck harness`, `mise ci:checks`.

**Proof (live):** `soap create eversong10-hunter`; `soap setup <ACCOUNT>
items/add '{"item":<timed item>,"count":1}'` for an item whose template
has `Duration > 0`; a probe `login` run with a flow `items-snapshot`
(`packages/devtools/src/probe-flows/items-snapshot.ts`, prints
`handle.getInventoryState()` as JSON) shows `ammoId` non-zero and the
timed item's `duration`. The report quotes both values.

**Commit:**
- `feat: Read item enchants, timers and ammo`
- Body: `Timed items, temporary enchants, sockets and the loaded ammo live
  in update fields that the inventory read skipped. The gear verbs and the
  journal need them.`
- The probe flow file joins this commit.

---

## items-3a: Equip, unequip, move and split in core

Rulings: SR1-items-1, SR1-items-2, SR1-items-3, SR1-items-5, SR1-items-6, SR1-items-9, SR1-items-10 (section "Seed rulings (SEED-1)").

**Phase:** 1. **codeArea:** `items`. **Depends on:** items-1, items-2,
T-2, T-3, T-4, and Contract issues 2 (allow-list) and 4 (helper name).
**Size:** L.

**Opcodes (6):** `CMSG_AUTOEQUIP_ITEM`, `CMSG_AUTOEQUIP_ITEM_SLOT`,
`CMSG_SWAP_ITEM`, `CMSG_SWAP_INV_ITEM`, `CMSG_AUTOSTORE_BAG_ITEM`,
`CMSG_SPLIT_ITEM`. Uses (peek): `SMSG_INVENTORY_CHANGE_FAILURE`.

**Files:**
- Edit: `packages/core/src/wow/areas/items/opcodes.ts` (`uses` gains
  `SMSG_INVENTORY_CHANGE_FAILURE`)
- Create: `areas/items/protocol.ts`, `protocol.test.ts`, `moves.ts`,
  `moves.test.ts`, `store.ts`, `store.test.ts`, `runtime.ts`,
  `runtime.test.ts`
- Edit: `areas/items/area.ts`
- Edit (lease): `packages/core/src/wow/protocol/inventory.ts` and its test
- Edit: `packages/core/test-support/areas/items.ts`
- Create: `packages/devtools/src/probe-flows/items-move.ts`
- Edit: `docs/areas/items.md`, `docs/protocol-coverage/items.md`
  (regenerated)

**Steps:**

1. **Failing builder tests** (`protocol.test.ts`), each against the
   AzerothCore reader:
   - `buildAutoEquipItem(bag, slot)`: `u8, u8`
     (`Server/Packets/ItemPackets.cpp:49-53` [M]).
   - `buildAutoEquipItemSlot(itemGuid, slot)`: `u64, u8` (`:35-39` [M]).
   - `buildSwapItem(dst, src)`: dst bag, dst slot, src bag, src slot
     (`:41-47` [M]).
   - `buildSwapInvItem(dstSlot, srcSlot)`: title "writes the destination
     first, as SwapInventoryItem::Read reads it" (`:29-33` [M]; wowm
     `item/cmsg_swap_inv_item.wowm` lists the source first).
   - `buildAutostoreBagItem(srcBag, srcSlot, dstBag)` (`:108-113` [M]).
   - `buildSplitItem(src, dst, count)` with a `u32` count (`:20-27` [M]).
2. **Failing helper tests** (`protocol/inventory.test.ts`):
   `ownsInventoryFailure(packet, mine, others)` returns true when `item1`
   equals `mine.itemGuid`; when `item1` is 0 and every entry of `others`
   is `undefined`; false for `kind: "ok"`; false when `item1` is another
   guid. `isNoChange(packet)` is true for result 59 `EQUIP_ERR_NONE`
   (`Entities/Item/Item.h:106`, sent at `Handlers/ItemHandler.cpp:1001-1006`
   [M]). Bodies from `Player::SendEquipError`
   (`Entities/Player/PlayerStorage.cpp:4156-4196` [M]) through a new
   `itemsInventoryChangeFailureBody` builder.
3. **Failing store and runtime tests** (`moves.test.ts`,
   `store.test.ts`, `runtime.test.ts`) with `areaRig("items", { register:
   (d, s) => registerGameplayHandlers(...) })` so the legacy owner of
   `SMSG_INVENTORY_CHANGE_FAILURE` is real (D24):
   - `equip` sends `CMSG_AUTOEQUIP_ITEM` and settles `confirmed` when the
     injected entity update shows the guid in an equipment slot.
   - A failure with `item1` equal to the moving guid settles `refused`
     with the result name; a failure with another guid does not.
   - Result 59 settles `no_change`.
   - No reply in 5 s settles `unanswered` (fake timers in `try`/`finally`).
   - Preconditions throw a plain reason: not in world, dead (except
     `unequip`), a move already pending, the source slot empty or holding
     another guid, `equip` without a known template or with inventory type
     0, `split` count below 1 or not below the stack.
   - `move` sends `CMSG_SWAP_INV_ITEM` when both positions are in bag 255
     and `CMSG_SWAP_ITEM` otherwise; bank positions (bag-0 slots 39-73)
     and buyback slots (74-85) are refused until `economy` reads them.
   - `unequip(slot, toBag?)` sends `CMSG_AUTOSTORE_BAG_ITEM` with source
     (255, slot) and destination bag `NULL_BAG` 0 unless a bag is named
     (`Entities/Item/Item.h:40`, `Entities/Player/PlayerStorage.cpp:605-609` [M]).
   - The runtime emits `item_received` (entry, guid when known, template
     item level and inventory type, the worn item level in that slot) on
     each core `rewards` `item_push` event (`rewards.ts:104`,
     `rewards-store.ts:265` [M]), after the template arrives through
     `core.items`. items-5a reads it for the upgrade wake.
   All fail before the code exists.
4. **Implement.**
   - `protocol.ts`: the six builders and `ItemPosition = { bag: number;
     slot: number }`.
   - `protocol/inventory.ts`: `InventoryClaim = { readonly itemGuid:
     bigint | undefined }`, `ownsInventoryFailure`, `isNoChange`.
   - `moves.ts`: the pending move (kind `equip`, `equip_slot`, `unequip`,
     `swap`, `split`; later tasks add `ammo`, `socket`, `wrap`,
     `cancel_enchant`), its expected end state, and the settle rules of
     design 5.3 "Shared failure packet".
   - `store.ts`: `ItemsStore` with a plain `new Emitter()`, `snapshot`,
     `onEvent`, `dispose`, `receiveInventoryFailure`, `observeInventory`.
     The store reads the legacy claims through `core` (destroy request,
     vendor buy, quest accept or reward, loot take) for the `others` list.
   - `runtime.ts`: `ItemsActs` gains `equip`, `equipTo`, `unequip`,
     `move`, `split`, each returning `Promise<ItemsState["move"]>`;
     `listen("entity", ...)` feeds `observeInventory`; the 5 s deadline
     is one `until` per act (`DESTROY_ANSWER_MS`, `destroy.ts:15` [M]).
   - `area.ts`: `register` peeks `SMSG_INVENTORY_CHANGE_FAILURE` with
     `parseInventoryChangeFailure`; `eventTypes` lists this task's events.
5. **Probe flow** `items-move.ts`: args `do=equip|equip_to|unequip|move|split`,
   `bag`, `slot`, `to`, `count`; calls the act and prints the settled
   state. Its test checks argument parsing and that each `do` calls the
   matching act on a `MockHandle` (`jest.spyOn(handle.items.act, ...)`).
6. `docs/areas/items.md`: wire note for `CMSG_SWAP_INV_ITEM` (AzerothCore
   reads the destination first); six proof rows.
7. `mise protocol:coverage`, `mise ci:checks`,
   `mise protocol:cite-check`.

**Proof (live, all six):** `soap create fresh`; offline `soap setup
<ACCOUNT> items/add` of one wearable weapon usable at level 1, one bag
(candidate 4496, a 6-slot bag [I]) and 20 of item 159; `soap truth
<ACCOUNT>` before. Then probe runs with `--flow items-move`: equip the
weapon (`CMSG_AUTOEQUIP_ITEM`), equip the bag (goes to bag slot 19-22,
`Handlers/ItemHandler.cpp:168` [M]), equip a second item into a named
slot (`CMSG_AUTOEQUIP_ITEM_SLOT`), unequip it (`CMSG_AUTOSTORE_BAG_ITEM`),
swap two backpack slots (`CMSG_SWAP_INV_ITEM`), move the hearthstone into
the bag (`CMSG_SWAP_ITEM`), split 5 water off (`CMSG_SPLIT_ITEM`). `soap
truth` after shows each position; the trace shows each send. One refusal:
`items/add` an item above level 1 and equip it; the trace shows
`SMSG_INVENTORY_CHANGE_FAILURE` result 1 and the act settles `refused`.
The first truth dump also records how the realm service numbers rows
inside bags (design 5.3 "Risks"), which items-5c needs. Proof rows:
`live`, evidence "probe flow items-move, exit 0, truth before and after".

**Commit:**
- `feat: Equip, unequip, move and split items`
- Body: `The character kept its level-1 gear and its backpack for all 80
  levels, because Peon sent none of the inventory move opcodes. Core now
  sends them and settles each move from the inventory or the failure
  packet.`

---

## items-3b: Correlate inventory failures in the legacy stores

Rulings: SR1-items-1, SR1-items-3, SR1-items-4, SR1-items-5, SR1-items-6, SR1-items-9 (section "Seed rulings (SEED-1)").

**Phase:** 1. **codeArea:** `items`. **Depends on:** items-3a and the
leases of Contract issues 1. **Size:** M.

**Opcodes:** none owned. Changes how the handled
`SMSG_INVENTORY_CHANGE_FAILURE` reaches the legacy stores (N28).

**Files (all under lease):**
- Edit: `packages/core/src/wow/gameplay-handlers.ts` and
  `gameplay-handlers-stores.test.ts`
- Edit: `destroy-store.ts`, `vendor-store.ts`, `quest-store.ts`,
  `quest-errors.ts`, `rewards-store.ts`

**Steps:**

1. **Failing tests** in `gameplay-handlers-stores.test.ts`: with a
   pending destroy of guid A and a pending vendor buy, a failure with
   `item1` = A settles the destroy and leaves the buy pending; a failure
   with `item1` = 0 settles neither while both are pending; with only the
   buy pending, a failure with `item1` = 0 settles the buy; result 59
   settles nothing in any legacy store. The rewards store still records
   `lastInventoryError` for every error packet (the bag-full read the
   loot path uses), but clears its `take` request only when it owns the
   failure. Bodies from `itemsInventoryChangeFailureBody`. They fail on
   today's fan-out (`gameplay-handlers.ts:306-313` [M]).
2. **Implement.** Each store gains `inventoryClaim(): InventoryClaim |
   undefined` (its pending request's item guid, or `{ itemGuid:
   undefined }` for a buy, quest or loot take, or `undefined` when idle).
   The handler builds the claim list, calls each settle only when
   `ownsInventoryFailure` holds for it, and skips `isNoChange` packets.
   `combat.applyInventoryFailure` is unchanged (it matches `item1`,
   `combat-store.ts:260-265` [M]).
3. `mise ci:checks`.

**Proof:** unit tests plus reruns of `t5-vendor-buy-goldshire` and
`t4-quest-first` (the legacy stores this touches) with no failure cause
the R0 baseline did not show (contract 3.6). The report records both
verdicts. No proof row: the task owns no opcode.

**Commit:**
- `fix: Match inventory failures to their request`
- Body: `The failure packet carries no request id, so every pending store
  settled on any refusal, and a no-change notice counted as one. Each
  store now settles only a failure that names its item, or one with no
  item while nothing else waits.`

---

## items-4: Open containers and read items

Rulings: SR1-items-2, SR1-items-3, SR1-items-7, SR1-items-9, SR1-items-10 (section "Seed rulings (SEED-1)").

**Phase:** 1. **codeArea:** `items`. **Depends on:** items-3a. **Size:** M.

**Opcodes (6):** `CMSG_OPEN_ITEM`, `CMSG_READ_ITEM`, `SMSG_READ_ITEM_OK`,
`SMSG_READ_ITEM_FAILED`, `CMSG_ITEM_TEXT_QUERY`,
`SMSG_ITEM_TEXT_QUERY_RESPONSE`.

**Files:**
- Create: `areas/items/protocol-read.ts` and test, `areas/items/reads.ts`
  and test
- Edit: `areas/items/store.ts`, `runtime.ts`, `area.ts`, `opcodes.ts`
  (`unseen` if `SMSG_READ_ITEM_FAILED` stays mock), their tests
- Edit: `packages/core/test-support/areas/items.ts`
- Create: `packages/devtools/src/probe-flows/items-open.ts` and test
- Edit: `docs/areas/items.md`, `docs/protocol-coverage/items.md`

**Steps:**

1. **Failing tests.**
   - `buildOpenItem(bag, slot)`: `u8, u8`
     (`Handlers/SpellHandler.cpp:216` [M, design]).
   - `buildReadItem(bag, slot)`: `u8, u8`
     (`Server/Packets/ItemPackets.cpp:65` [M]).
   - `buildItemTextQuery(guid)`: `u64` (`Handlers/ItemHandler.cpp:1461-1465` [M]).
   - `parseReadItemResult` for both opcodes: `u64 guid`
     (`ItemHandler.cpp:562,567` [M]; AzerothCore writes only the guid).
   - `parseItemTextResponse`: `u8 0`, `u64 guid`, cstring text, or `u8 1`
     alone (`ItemHandler.cpp:1468-1482` [M]).
   - Rig tests: `read` sends `CMSG_READ_ITEM` and settles `read_ok` on
     `SMSG_READ_ITEM_OK` for that guid, `read_failed` on
     `SMSG_READ_ITEM_FAILED` or on a failure packet the correlation rule
     gives it (an item with no page text gets `ITEM_NOT_FOUND`,
     `ItemHandler.cpp:574-575` [M]), `read_unanswered` after 5 s.
     `queryText(guid)` dedupes by guid like `ItemTemplates`
     (`item-use.ts:39-55` [M]) and caches the text. `open(bag, slot)`
     calls `core.rewards.requestOpen(itemGuid)` (Contract issues 7),
     sends `CMSG_OPEN_ITEM`, and resolves when the core `rewards` event
     `loot_opened` names the item guid, or rejects on a failure packet or
     after 5 s.
2. **Implement** the parsers, the `read` slice (one pending read, the
   text cache), the acts `open`, `read`, `queryText`, and the `register`
   lines for the three server opcodes.
3. Probe flow `items-open.ts`: `do=open|read|text`, `bag`, `slot`.
4. Proof rows; `mise protocol:coverage`; `mise ci:checks`.

**Proof:**
- `CMSG_OPEN_ITEM`: live. `soap create eversong10`; `items/add` one
  container whose template has `ITEM_FLAG_HAS_LOOT` (checked at
  `Handlers/SpellHandler.cpp:244-248` [M, design]; the builder picks the
  id); probe `--flow items-open --arg do=open ... --expect
  SMSG_LOOT_RESPONSE`.
- `CMSG_READ_ITEM`, `SMSG_READ_ITEM_OK`: live. `items/add` an item with a
  page text; probe `do=read --expect SMSG_READ_ITEM_OK`.
- `CMSG_ITEM_TEXT_QUERY`, `SMSG_ITEM_TEXT_QUERY_RESPONSE`: live. Query
  any carried item; AzerothCore answers `u8 0`, the guid and the item's
  text for every item it finds (`ItemHandler.cpp:1470-1474` [M]).
- `SMSG_READ_ITEM_FAILED`: live only if the builder finds a readable item
  that `CanUseItem` refuses; else `mock` from `ItemHandler.cpp:565-571`
  [M], an `areaRig` test, the opcode in `unseen`, "not seen live".

**Commit:**
- `feat: Open containers and read items`
- Body: `Reward containers and quest letters sat unopened in the bags.
  Core now opens a container into the loot window and reads an item's
  page and text.`

---

## items-5a: The gear tool and the items log rows

Rulings: SR1-items-1, SR1-items-9 (section "Seed rulings (SEED-1)").

**Phase:** 1. **codeArea:** `items`. **Depends on:** items-3a, items-4,
S0-3, S0-4. **Size:** L.

**Opcodes:** none owned. Harness only.

**Files:**
- Create: `packages/harness/src/areas/items/tool.ts` and `tool.test.ts`
  (`gearTool`, kind `action`, D25)
- Edit: `packages/harness/src/areas/items/area.ts` and test
  (`itemsHarness`: `worldActs: ["equip", "equipTo", "unequip", "move",
  "split", "open", "read"]`, the `event` rules, glyph)
- Shared: `packages/harness/src/contract/result.ts` (append `"gear"` to
  `ToolName`), `packages/harness/src/tools/registry.ts` (append
  `gearTool` to `GAME_TOOLS` and its import), `docs/harness.md` (append
  one row to the tool table)

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

1. **Failing tool tests** (`tool.test.ts`, on the mock game with
   `jest.spyOn(handle.items.act, ...)`):
   - `do: equip item:"Gnarled Staff"` resolves the item by name, `item
     <id>` or `bag B slot S` and calls `equip`; with `slot` it calls
     `equipTo`. A `confirmed` move renders `DONE: Wearing <name> (<slot>).
     Old: <name>, now in bag B slot S.`; `refused` renders `REFUSED:
     <result name>` with the required level when the detail has one.
   - `unequip`, `move` (`to: bags|backpack|bag N|bag B slot S`), `split`
     (into the first empty slot the inventory read shows), `open` (then
     takes every offered item through the existing loot act and renders
     the items and money), `read` (the page-text act of `objects` when it
     exists; until then the item text and `read_ok`).
   - An unknown item, an ambiguous name and a missing `slot` name are
     refused before any send.
   - `expectSendKind(gearTool)` once (contract 1.9).
2. **Failing rule tests** (`area.test.ts`): `moved` writes a `log` row
   `items/equipped`, `items/unequipped`, `items/moved` or `items/split`;
   `move_refused` and `move_unanswered` write `wake` rows
   `items/refused` and `items/unanswered`; `item_received` whose item
   level is above the worn item's writes one `wake` row `items/upgrade`
   (the harness never equips by itself: equipping binds a bind-on-equip
   item); `read_ok` and `item_text` write `items/read`.
3. **Implement** the tool module (its own `After` type and renderers in
   the module, contract 1.9; every send inside `ctx.rt.mutex.run`) and
   the rules.
4. The shared edits: `ToolName`, `GAME_TOOLS`, the `docs/harness.md` row
   `| \`gear\` | Wears, takes off, moves, splits, opens and reads items. |`.
   `prompt/harness-doc.test.ts` must pass.
5. `mise typecheck harness`, `mise ci:checks`.

**Proof:** unit tests here; the eval runs are items-5c. The report
states that no gameplay claim is made yet.

**Commit:**
- `feat: Add the gear tool`
- Body: `The agent had no way to act on its items. The gear tool wears,
  takes off, moves, splits, opens and reads them, and the game log wakes
  the agent when a better item arrives.`

---

## items-5b: Positions and marks in journal bags

Rulings: SR1-items-1, SR1-items-9 (section "Seed rulings (SEED-1)").

**Phase:** 1. **codeArea:** `items`. **Depends on:** items-5a and the
`tools/journal.ts` lease. **Size:** M.

**Opcodes:** none owned.

**Files (lease):** `packages/harness/src/tools/journal.ts`,
`journal.test.ts`, and the `JournalAfter` bags block in
`packages/harness/src/contract/details.ts` (D13).

**Steps:**

1. **Failing tests** in `journal.test.ts`: each bag row carries `bag B
   slot S` and the item id; a wearable row carries `can wear` (class mask,
   required level; proficiency from the store when items-6 has landed,
   otherwise not shown) and `upgrade` when its item level is above the
   worn item's in that slot; durability below 25%, a timed item's time
   left, and the loaded ammo appear (`journal.ts:162-235` [M] is today's
   view).
2. **Implement** in `bagsView` and `bagsResult`.
3. `mise ci:checks`; `t0-self-state` must still pass (it reads bags).

**Proof:** rerun `t0-self-state`; record the verdict.

**Commit:**
- `feat: Show item positions and upgrades in bags`
- Body: `The bags journal listed names only, so the agent could not name
  a position or tell an upgrade from junk. Each row now has its position,
  its id and whether the character can wear it.`

---

## items-5c: Six gear scenarios

Rulings: SR1-items-8 (section "Seed rulings (SEED-1)").

**Phase:** 1. **codeArea:** `items`. **Depends on:** items-5b. **Size:** L
(eval runs).

**Opcodes:** none owned. Adds `t8-items-equip-upgrade`,
`t8-items-unequip`, `t8-items-move`, `t8-items-split`, `t8-items-open`,
`t8-items-read`.

**Files (one commit per scenario, contract 3.2):**
`packages/harness/src/grader/scenarios/t8-items-<slug>.json`; shared:
`grader/scenarios.ts` `ROUND_1` (append), `docs/capabilities.md` (row or
bullet), `docs/evals.md` (the unit's row).

**Steps, per scenario:**

1. Write the JSON on the model of `t5-vendor-buy-goldshire.json` [M]:
   `preset`, `setup` (offline realm-service calls), `task`, `checks`
   against truth (`bag`, `slot`, `item`, `count` rows) and game-log rows.
2. `mise test packages/harness/src/grader/scenarios.test.ts` first
   (a bad file breaks the loader, contract 3.1); it fails until the
   `ROUND_1` line exists, then passes.
3. `mise eval run t8-items-<slug> --round <n>` (babysat as R10 says); record the
   verdict.
4. Add the `docs/capabilities.md` row if it passed, or the bullet under
   "Not shown by any scenario" with the gap if not (D16). The first
   scenario adds the `docs/evals.md` row `| Items and gear (\`gear\`,
   \`journal\` bags) | \`t8-items-equip-upgrade\` |`; later ones append
   their ids to it.

| Scenario | Preset and setup | Task | Checks |
|---|---|---|---|
| `t8-items-equip-upgrade` | `fresh`; `items/add` a level-1 weapon above the start weapon's item level and a bag | "You got new gear. Wear anything better, and put the bag on." | truth: the weapon at bag 255 slot 15-17 by type, the bag at bag 255 slots 19-22, the old weapon in a bag row; game log `items/equipped` twice |
| `t8-items-unequip` | `eversong10` | "Take off your chest armour and keep it in your bags." | truth: no row at bag 255 slot 4; the same item id in a bag row |
| `t8-items-move` | `eversong10` | "Move your hearthstone into your first bag." | truth: item 6948 inside the first bag, by the numbering items-3a recorded |
| `t8-items-split` | `eversong10`; `items/add` 20 of item 159 | "Split 5 water off into a separate stack." | truth: two rows of item 159, one of count 5 |
| `t8-items-open` | `eversong10`; `items/add` a `HAS_LOOT` container | "Open the container in your bags and keep what is inside." | truth: the container count falls by 1 and another item appears; game log `loot/open` for the item guid |
| `t8-items-read` | `eversong10`; `items/add` a page-text item | "Read the letter in your bags and tell me what it says." | game log `items/read`; the answer matches the text row. `blocked` until `objects` lands the page-text query; listed under "Not shown by any scenario" until then |

**Proof:** `eval`, one verdict per scenario in the report and in the
capabilities page. `t1-walk-to-npc` must still pass (contract 3.6).

**Commits** (six, one per scenario; `test:` because each adds an eval
and its doc rows only):
- `test: Add the gear equip-upgrade scenario` — body: `Proves the agent
  wears a better weapon and puts a bag on, checked against server truth.`
- `test: Add the gear unequip scenario` — body: `Proves the agent takes
  gear off into its bags, checked against server truth.`
- `test: Add the gear move scenario` — body: `Proves the agent moves an
  item into a bag, checked against server truth.`
- `test: Add the gear split scenario` — body: `Proves the agent splits a
  stack, checked against server truth.`
- `test: Add the gear open scenario` — body: `Proves the agent opens a
  container and keeps what is inside.`
- `test: Add the gear read scenario` — body: `Records the letter-reading
  check, which waits for the page-text query from objects.`

---

## items-8: Load ammo

Rulings: SR1-items-1, SR1-items-2, SR1-items-8, SR1-items-9, SR1-items-12 (section "Seed rulings (SEED-1)").

**Phase:** 1 (N22). **codeArea:** `items`. **Depends on:** items-2,
items-5c. **Size:** S.

**Opcodes (1):** `CMSG_SET_AMMO`. Adds `t8-items-ammo`.

**Files:**
- Edit: `areas/items/protocol.ts`, `moves.ts`, `runtime.ts`, `area.ts`
  and their tests (the `ammo` move kind, act `setAmmo`)
- Edit: `packages/harness/src/areas/items/tool.ts` and test (`do: ammo`),
  `packages/harness/src/areas/items/area.ts` (`worldActs` gains
  `setAmmo`)
- Edit: `packages/core/test-support/areas/items.ts`
- Create: `packages/harness/src/grader/scenarios/t8-items-ammo.json`;
  shared `ROUND_1`, `docs/capabilities.md`, `docs/evals.md`
- Edit: `docs/areas/items.md`, `docs/protocol-coverage/items.md`

**Steps:**

1. **Failing tests.** `buildSetAmmo(entry)`: `u32`
   (`Handlers/ItemHandler.cpp:1014-1039` [M, design]). Rig test: `setAmmo`
   settles `confirmed` when `ammoId` (items-2) equals the entry, `refused`
   on a failure packet (`ItemHandler.cpp:1018,1031` [M, design]), and
   `unanswered` after 5 s; entry 0 removes the ammo (`:1038`). Tool test:
   `do: ammo item:"Rough Arrow"` renders `DONE: Rough Arrow loaded.`
2. **Implement.**
3. Scenario `t8-items-ammo`: `eversong10-hunter`; `items/add` 200 of an
   arrow the hunter's bow takes (the builder picks the id, candidate 2512
   [I]); task "Load the new arrows."; check the game log row
   `items/equipped` or the `ammo` result with the entry (truth has no
   ammo field, design 5.3).
4. Commit the code first, then the scenario commit.

**Proof (live):** eval `t8-items-ammo`; the trace shows `CMSG_SET_AMMO`
and `PLAYER_AMMO_ID` changes. Proof row `live`, evidence the eval id and
verdict.

**Commits:**
- `feat: Load hunter ammunition`
- Body: `A hunter that ran out of arrows or bought another kind could
  never shoot again, because only CMSG_SET_AMMO sets the ammo id. The gear
  tool now loads ammo.`
- `test: Add the gear ammo scenario` — body: `Proves a hunter loads new
  arrows, checked through the game log.`

---

## items-6: Timers, cooldowns, death durability and proficiency

**Phase:** 3. **codeArea:** `items`. **Depends on:** items-3a, T-5.
**Size:** M.

**Opcodes (5):** `SMSG_ITEM_COOLDOWN`, `SMSG_ITEM_TIME_UPDATE`,
`SMSG_ITEM_ENCHANT_TIME_UPDATE`, `SMSG_DURABILITY_DAMAGE_DEATH`,
`SMSG_SET_PROFICIENCY`.

**Files:**
- Create: `areas/items/protocol-timers.ts` and test, `areas/items/timers.ts`
  and test
- Edit: `areas/items/store.ts`, `area.ts`, `opcodes.ts` (delete the
  `SMSG_SET_PROFICIENCY` `stubs` line; `unseen` gains
  `SMSG_ITEM_ENCHANT_TIME_UPDATE` unless seen live) and tests
- Edit: `packages/core/test-support/areas/items.ts`
- Edit: `packages/harness/src/areas/items/area.ts` and test
- Edit: `docs/areas/items.md`, `docs/protocol-coverage/items.md`

**Steps:**

1. **Failing parser tests.**
   - `parseItemCooldown`: `u64 guid, u32 spell`
     (`Entities/Player/Player.cpp:12058-12061` [M]).
   - `parseItemTimeUpdate`: `u64 guid, u32 seconds`
     (`Entities/Item/Item.cpp:1088-1091` [M]).
   - `parseItemEnchantTimeUpdate`: `u64 item, u32 slot, u32 seconds, u64
     player` (`Server/Packets/ItemPackets.cpp:125-133` [M]).
   - `SMSG_DURABILITY_DAMAGE_DEATH`: empty body
     (`Server/Packets/MiscPackets.h:183-186` [M]).
   - `parseSetProficiency`: `u8 class, u32 mask`
     (`Entities/Player/Player.cpp:10282-10285` [M]).
2. **Failing store tests:** timers store absolute expiry from the local
   clock at receipt; cooldowns keep item guid, spell and time seen;
   proficiency holds a weapon mask and an armour mask, each `unknown`
   until the first packet; each emits its event.
3. **Failing rule tests:** `items/cooldown`, `items/expiring` (`passive`;
   `wake` under 60 s left [I]), `items/durability_loss`,
   `items/proficiency` rows.
4. **Implement**; delete the stub line.

**Proof:**
- `SMSG_DURABILITY_DAMAGE_DEATH`: live. It was seen in the death session
  of the research logs [M, design 5.3]. Run `mise eval run
  t6-die-and-recover --round <n>` (the grader passes `--packet-trace headers`, N18);
  the trace shows 0x2bd. Evidence: the eval id and the trace row.
- `SMSG_ITEM_TIME_UPDATE`: live. `items/add` an item with `Duration > 0`
  offline, then probe `--flow login --expect SMSG_ITEM_TIME_UPDATE`
  (sent at login, `Player.cpp:11919`, `PlayerStorage.cpp:4872-4877` [M,
  design]).
- `SMSG_ITEM_COOLDOWN`: live. `soap create max80`; `items/add` a use
  trinket whose spell cooldown is over 3 s (`Player.cpp:12044` [M,
  design]); probe `--flow items-move --arg do=equip ... --expect
  SMSG_ITEM_COOLDOWN`.
- `SMSG_SET_PROFICIENCY`: first check the login trace of any probe run
  (the login comment at `Player.cpp:11781` [M] names it, and
  `Spell::EffectProficiency` sends it for a new mask,
  `Spells/SpellEffects.cpp:2436-2459` [M]). If it is not there: keep a
  probe session online with `--wait 30`, and run `mise factory soap gm
  <ACCOUNT> learn <proficiency spell>` for a weapon skill the class lacks
  (the builder picks the spell id [I]); `--expect SMSG_SET_PROFICIENCY`.
- `SMSG_ITEM_ENCHANT_TIME_UPDATE`: `mock` unless `objects` has landed
  item-target `CMSG_USE_ITEM`; then live with a weapon oil. Writer
  `Server/Packets/ItemPackets.cpp:125-133`, senders
  `Entities/Player/PlayerStorage.cpp:4428,4860` [M]. `unseen`, "not seen
  live".

**Commit:**
- `feat: Track item timers, cooldowns and skills`
- Body: `Item cooldowns, expiring items and temporary enchants, the death
  durability notice and new weapon or armour skills were silent. Core now
  keeps them and the game log reports them.`

---

## items-7: Sockets, the enchant log and cancel temporary enchant

**Phase:** 3. **codeArea:** `items`. **Depends on:** items-5c, items-6,
T-5. **Size:** M.

**Opcodes (4):** `CMSG_SOCKET_GEMS`, `SMSG_SOCKET_GEMS_RESULT`,
`SMSG_ENCHANTMENTLOG`, `CMSG_CANCEL_TEMP_ENCHANTMENT`. Adds
`t8-items-socket`.

**Files:**
- Create: `areas/items/protocol-sockets.ts` and test
- Edit: `areas/items/moves.ts`, `store.ts`, `runtime.ts`, `area.ts` and
  tests (move kinds `socket` and `cancel_enchant`, acts `socket` and
  `cancelTempEnchant`)
- Edit: `packages/core/test-support/areas/items.ts`
- Edit: `packages/harness/src/areas/items/tool.ts` and test (`do:
  socket`, `gems`), `packages/harness/src/areas/items/area.ts` and test
  (`worldActs` gains `socket`; rows `items/socketed`, `items/enchanted`)
- Create: `packages/harness/src/grader/scenarios/t8-items-socket.json`;
  shared `ROUND_1`, `docs/capabilities.md`, `docs/evals.md`
- Edit: `docs/areas/items.md`, `docs/protocol-coverage/items.md`

**Steps:**

1. **Failing tests.**
   - `buildSocketGems(item, gems)`: `u64` item then three `u64` gem guids
     (`Server/Packets/ItemPackets.cpp:143-148` [M]).
   - `parseSocketGemsResult`: `u64 item` then **four** `u32` enchant ids,
     slots 2-5 (`Entities/Item/Item.cpp:1071-1076` [M]; wowm
     `item/smsg_socket_gems_result.wowm` has three). Title names the
     fourth value, the socket bonus.
   - `parseEnchantmentLog`: packed target, packed caster, `u32` entry,
     `u32` enchant id, **no** trailing bool
     (`Server/Packets/ItemPackets.cpp:115-123`, `ItemPackets.h:189-200`
     [M]; wowm adds a bool). The event marks `own` when the target is
     the character (the log goes to the visible set,
     `Handlers/ItemHandler.cpp:1048` [M]).
   - `buildCancelTempEnchantment(slot)`: `u32`
     (`Server/Packets/ItemPackets.cpp:150-153` [M]).
   - Rig: `socket` refuses duplicate gem guids before sending (the
     AzerothCore check returns silently,
     `Handlers/ItemHandler.cpp:1220-1223` [M, design]), settles
     `confirmed` on `SMSG_SOCKET_GEMS_RESULT` for the item, `unanswered`
     after 5 s.
2. **Implement**, then the tool `do: socket item:X gems:A,B`.
3. Scenario `t8-items-socket`: `max80`; `items/add` an item with a socket
   and a matching gem (the builder picks the ids); task "Put the gem into
   the item."; checks: game log `items/socketed` with the gem's enchant id;
   truth: the gem count falls by 1.

**Proof:**
- `CMSG_SOCKET_GEMS`, `SMSG_SOCKET_GEMS_RESULT`, `SMSG_ENCHANTMENTLOG`:
  live, eval `t8-items-socket` (socketing sends one enchant log per
  socket, `Handlers/ItemHandler.cpp:1378` [M, design], then the result,
  `:1401`).
- `CMSG_CANCEL_TEMP_ENCHANTMENT`: `accepted`. A probe `--send
  CMSG_CANCEL_TEMP_ENCHANTMENT --body <slot 15 hex>` on a character with
  no temporary enchant; the handler returns with no reply
  (`Handlers/ItemHandler.cpp:1404-1422` [M, design]); proof is no
  disconnect and no error packet. Full proof waits for item-target use
  from `objects`.

**Commits:**
- `feat: Socket gems into items`
- Body: `Gems matter at level 80 and Peon could not socket one. Core now
  sends the socket request, reads the result with its socket bonus, and
  reads the enchant log.`
- `test: Add the gear socket scenario` — body: `Proves a level 80
  character sockets a gem, checked through the game log and truth.`

---

## items-9: Equipment sets

**Phase:** 3. **codeArea:** `items`. **Depends on:** items-3a, S0-2
(0x137 in `CORE_OPCODES`, Contract issues 3), T-3. **Size:** M.

**Opcodes (6):** `SMSG_EQUIPMENT_SET_LIST`, `CMSG_EQUIPMENT_SET_SAVE`,
`SMSG_EQUIPMENT_SET_SAVED`, `CMSG_DELETEEQUIPMENT_SET`,
`CMSG_EQUIPMENT_SET_USE`, `SMSG_EQUIPMENT_SET_USE_RESULT`.

**Files:**
- Create: `areas/items/protocol-sets.ts` and test, `areas/items/sets.ts`
  and test
- Edit: `areas/items/store.ts`, `runtime.ts`, `area.ts`, `opcodes.ts`
  (delete the `SMSG_EQUIPMENT_SET_LIST` `stubs` line) and tests
- Edit: `packages/core/test-support/areas/items.ts`
- Edit: `packages/harness/src/areas/items/area.ts` (rows
  `items/set_saved`, `items/set_used`; no world act, no verb)
- Create: `packages/devtools/src/probe-flows/items-sets.ts` and test
- Edit: `docs/areas/items.md`, `docs/protocol-coverage/items.md`

**Steps:**

1. **Failing tests.**
   - `parseEquipmentSetList`: `u32 count`, then per set packed set guid,
     `u32` index, cstring name, cstring icon, 19 packed item guids where a
     raw `1` means an ignored slot (`Entities/Player/Player.cpp:14897-14922`
     [M]; wowm has plain guids and no index).
   - `parseEquipmentSetSaved`: `u32 index`, packed set guid
     (`Player.cpp:14956-14958` [M]; no wowm definition, 0x137 is another
     message there).
   - `buildEquipmentSetSave`: packed set guid, `u32` index (below
     `MAX_EQUIPMENT_SET_INDEX` 10, `Entities/Player/Player.h:747` [M]),
     name (at most 16), icon (at most 100), 19 packed item guids
     (`Handlers/CharacterHandler.cpp:1778-1847` [M, design]).
   - `buildEquipmentSetUse`: 19 times packed item guid, `u8` source bag,
     `u8` source slot (`CharacterHandler.cpp:1859-1950` [M, design]).
   - `buildEquipmentSetDelete`: packed set guid (`CharacterHandler.cpp:1849-1857`
     [M, design]).
   - `parseEquipmentSetUseResult`: `u8` (0 ok, 4 bags full)
     (`CharacterHandler.cpp:1946-1948` [M]).
   - Rig: `saveSet` of a new set settles on `SMSG_EQUIPMENT_SET_SAVED`; an
     update (non-zero set guid) gets no reply and settles when the
     timeout passes as `saved_unconfirmed` [I]; `useSet` always gets a
     result (`:1946`), so a timeout means a lost packet; `deleteSet`
     settles immediately and the next list confirms it.
2. **Implement** the `sets` slice and the acts `saveSet`, `useSet`,
   `deleteSet`; delete the stub line.
3. Probe flow `items-sets.ts`: `do=save|use|delete`, `index`, `name`.

**Proof (live, all six):** `soap create eversong10`. Probe `--flow login
--expect SMSG_EQUIPMENT_SET_LIST` (sent every login,
`Player.cpp:11801` [M, design]). `do=save --arg index=0 --arg name=Peon
--expect SMSG_EQUIPMENT_SET_SAVED`. Change one item with `items-move`,
then `do=use --arg index=0 --expect SMSG_EQUIPMENT_SET_USE_RESULT`.
`do=delete`, then a second `login` run whose list no longer holds the set
(`CMSG_DELETEEQUIPMENT_SET`: effect in a later packet, contract 0.6).

**Commit:**
- `feat: Save, use and delete equipment sets`
- Body: `Equipment sets swap a whole outfit in one request, and the login
  list was a stub. Core now reads the list and saves, uses and deletes
  sets; the agent has no verb for them yet.`

---

## items-10: Refunds

**Phase:** 4. **codeArea:** `items`. **Depends on:** items-3a, T-3, T-5.
**Size:** M.

**Opcodes (4):** `CMSG_ITEM_REFUND_INFO`, `SMSG_ITEM_REFUND_INFO_RESPONSE`,
`CMSG_ITEM_REFUND`, `SMSG_ITEM_REFUND_RESULT`.

**Files:**
- Create: `areas/items/protocol-refund.ts` and test, `areas/items/refunds.ts`
  and test
- Edit: `areas/items/store.ts`, `runtime.ts`, `area.ts`, `opcodes.ts`
  (`unseen` for the server opcodes not seen live) and tests
- Edit: `packages/core/test-support/areas/items.ts`
- Create: `packages/devtools/src/probe-flows/items-refund.ts` and test
- Edit: `docs/areas/items.md`, `docs/protocol-coverage/items.md`

**Steps:**

1. **Failing tests.**
   - `buildItemRefundInfo(guid)`, `buildItemRefund(guid)`: `u64`
     (`Server/Packets/ItemPackets.cpp:155-163` [M]).
   - `parseRefundInfo`: `u64 item, u32 money, u32 honor, u32 arena`, five
     (`u32 item, u32 count`), `u32 0`, `u32` played-time delta
     (`Entities/Player/Player.cpp:15989-16001` [M]).
   - `parseRefundResult`: `u64 item, u32 result` (wowm has `u8`); on 0 the
     cost block follows (`Player.cpp:16046-16049,16087-16090,16094-16104`
     [M]); 10 is the error.
   - Rig: `refundInfo` caches by item guid; `refund` settles on the
     result or `refund_unanswered` after 5 s. Both handlers are silent when
     the item is missing (`Handlers/ItemHandler.cpp:1428-1433,1442-1447`
     [M]).
2. **Implement**; probe flow `items-refund.ts` (`do=info|refund`,
   `item`).

**Proof:**
- `CMSG_ITEM_REFUND_INFO`, `CMSG_ITEM_REFUND`: the effect-not-seen row of
  contract 0.6 at least (`builder`, `unseen`, "sent live, effect not seen"). A
  probe send for a carried, non-refundable item; `RefundItem` returns
  with no reply (`Player.cpp:16035-16041` [M]); proof is no disconnect
  and no error packet.
- Live refund path, tried first: `soap create max80`; `soap gm <ACCOUNT>
  items <emblem id>:<n>`; buy one extended-cost item from an emblem
  vendor through the probe (the vendor and ids are not checked [I]); the
  purchase itself sends `SMSG_ITEM_REFUND_INFO_RESPONSE`
  (`Entities/Player/PlayerStorage.cpp:3859` [M, design]); then
  `do=refund --expect SMSG_ITEM_REFUND_RESULT`. If the purchase cannot be
  made within the task, both client rows stay on that row.
- `SMSG_ITEM_REFUND_INFO_RESPONSE`, `SMSG_ITEM_REFUND_RESULT`: `mock` when
  not seen, from `Player.cpp:15989-16001` and `Player.cpp:16094-16104`
  (success) and `:16046-16049` (error) [M]; `unseen`, "not seen live".

**Commit:**
- `feat: Read and request item refunds`
- Body: `Items bought with emblems or honor can be refunded for a while
  after purchase. Core now reads the refund offer and sends the refund;
  the agent has no verb for it yet.`

---

## items-11: Gift wrap and item-set names

**Phase:** 4. **codeArea:** `items`. **Depends on:** items-3a, items-1.
**Size:** S.

**Opcodes (3):** `CMSG_WRAP_ITEM`, `CMSG_ITEM_NAME_QUERY`,
`SMSG_ITEM_NAME_QUERY_RESPONSE`.

**Files:**
- Create: `areas/items/protocol-names.ts` and test
- Edit: `areas/items/moves.ts` (move kind `wrap`), `reads.ts` (the
  item-set name cache), `store.ts`, `runtime.ts`, `area.ts`, `opcodes.ts`
  and tests
- Edit: `packages/core/test-support/areas/items.ts`
- Create: `packages/devtools/src/probe-flows/items-wrap.ts` and test
- Edit: `docs/areas/items.md`, `docs/protocol-coverage/items.md`

**Steps:**

1. **Failing tests.**
   - `buildWrapItem(gift, item)`: gift bag, gift slot, item bag, item slot
     (`Server/Packets/ItemPackets.cpp:135-141` [M]).
   - `buildItemNameQuery(entry, guid)`: `u32 entry, u64 guid`
     (`Handlers/ItemHandler.cpp:1061-1065` [M, design]).
   - `parseItemNameResponse`: `u32 entry`, cstring name, **`u32`**
     inventory type (`ItemHandler.cpp:1077-1081` [M]; wowm has `u8`).
   - Rig: `wrap` settles `confirmed` when the item's `wrapped` flag
     (items-2) appears, `refused` on a failure packet; `querySetName`
     dedupes by entry and settles `set_name_none` after 5 s, because
     AzerothCore stays silent for an entry with no set name
     (`ItemHandler.cpp:1069-1082` [M, design]).
2. **Implement**; probe flow `items-wrap.ts` (`do=wrap|name`).

**Proof:**
- `CMSG_WRAP_ITEM`: live. `items/add` a wrapping paper (template flag
  `ITEM_FLAG_IS_WRAPPER`, checked at `Handlers/ItemHandler.cpp:1098` [M,
  design]) and a plain item; probe `do=wrap`; the item's flags show
  wrapped. The success lines of the handler were not read [I]; if the
  wrap does not happen, the row is `builder` with "sent live, effect not
  seen" and the opcode is `unseen` (contract 0.6).
- `CMSG_ITEM_NAME_QUERY`, `SMSG_ITEM_NAME_QUERY_RESPONSE`: live if the
  builder finds an entry with an item-set name (items-1 reads `itemSet`
  from the template, so a set item's entry is the candidate [I]); else the
  client row is `accepted` and the server row is `mock` from
  `ItemHandler.cpp:1077-1081` [M], `unseen`, "not seen live".

**Commit:**
- `feat: Wrap gifts and read item-set names`
- Body: `Two long-tail item requests had no builder. Core now wraps an
  item in gift paper and reads the name of an item's set.`

---

## Opcode index

| Opcode | Task | Proof planned |
|---|---|---|
| `CMSG_AUTOEQUIP_ITEM` | items-3a | live |
| `CMSG_AUTOEQUIP_ITEM_SLOT` | items-3a | live |
| `CMSG_SWAP_ITEM` | items-3a | live |
| `CMSG_SWAP_INV_ITEM` | items-3a | live |
| `CMSG_AUTOSTORE_BAG_ITEM` | items-3a | live |
| `CMSG_SPLIT_ITEM` | items-3a | live |
| `CMSG_OPEN_ITEM` | items-4 | live |
| `CMSG_READ_ITEM` | items-4 | live |
| `SMSG_READ_ITEM_OK` | items-4 | live |
| `SMSG_READ_ITEM_FAILED` | items-4 | mock unless found |
| `CMSG_ITEM_TEXT_QUERY` | items-4 | live |
| `SMSG_ITEM_TEXT_QUERY_RESPONSE` | items-4 | live |
| `CMSG_SET_AMMO` | items-8 | live (eval) |
| `SMSG_ITEM_COOLDOWN` | items-6 | live |
| `SMSG_ITEM_TIME_UPDATE` | items-6 | live |
| `SMSG_ITEM_ENCHANT_TIME_UPDATE` | items-6 | mock until `objects` |
| `SMSG_DURABILITY_DAMAGE_DEATH` | items-6 | live (eval trace) |
| `SMSG_SET_PROFICIENCY` | items-6 | live |
| `CMSG_SOCKET_GEMS` | items-7 | live (eval) |
| `SMSG_SOCKET_GEMS_RESULT` | items-7 | live (eval) |
| `SMSG_ENCHANTMENTLOG` | items-7 | live (eval) |
| `CMSG_CANCEL_TEMP_ENCHANTMENT` | items-7 | accepted |
| `SMSG_EQUIPMENT_SET_LIST` | items-9 | live |
| `CMSG_EQUIPMENT_SET_SAVE` | items-9 | live |
| `SMSG_EQUIPMENT_SET_SAVED` | items-9 | live |
| `CMSG_DELETEEQUIPMENT_SET` | items-9 | live |
| `CMSG_EQUIPMENT_SET_USE` | items-9 | live |
| `SMSG_EQUIPMENT_SET_USE_RESULT` | items-9 | live |
| `CMSG_ITEM_REFUND_INFO` | items-10 | live if a purchase works, else builder (sent live, effect not seen) |
| `SMSG_ITEM_REFUND_INFO_RESPONSE` | items-10 | mock unless a purchase works |
| `CMSG_ITEM_REFUND` | items-10 | live if a purchase works, else builder (sent live, effect not seen) |
| `SMSG_ITEM_REFUND_RESULT` | items-10 | mock unless a purchase works |
| `CMSG_WRAP_ITEM` | items-11 | live, else builder (sent live, effect not seen) |
| `CMSG_ITEM_NAME_QUERY` | items-11 | live, else accepted |
| `SMSG_ITEM_NAME_QUERY_RESPONSE` | items-11 | live, else mock |

35 opcodes: 6 + 6 + 1 + 5 + 4 + 6 + 4 + 3.

## Dead opcodes

None. All 35 `items` rows are relevant: every client row has a
logged-in handler in AzerothCore and every server row has a send site
[design 5.3]. No correction in the verification reports moves an
opcode into or out of `items` or marks one dead. One verification note
lists `CMSG_SWAP_INV_ITEM` as having no reachable send site in a
restricted-licence client; that is a fact about that client, not the
server, which accepts the opcode (`Handlers/ItemHandler.cpp:62-98` [M,
design]), so it stays relevant.

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules here every open issue, lease request and decision
of this file that a wave-1 task (items-1 to items-5c, items-8) meets.
Precedence: the design, then the plan index with the contract and the
Gate R rulings, then this file. Contract issue 3 (`SMSG_EQUIPMENT_SET_SAVED`)
is met only by items-9 (phase 3), so it is left for the `SEED-3` pass.
Each ruling is **accepted by the maintainer (P2-5)**.

### SR1-items-1: the wave-1 leases

**Issue.** "Leases this unit needs" asks for seven lease rows, and
Contract issues 1 says: "items-3b therefore needs the five store files
under lease as well. If the coordinator does not grant them, items-3b
becomes a `COORD-<n>` commit built from its plan body".

**Ruling.** Granted. Contract 2.7 ("Leases added by the plan fix-up")
already names every file, and the plan index "Leases" table queues items
first in each row. The coordinator assigns these leases at `SEED-1`; each
holder hands its lease on when its task lands (D12), with one
`COORD-<n>` line in the plan index "Lease handovers":

| File | Holder | Next holder |
|---|---|---|
| core `protocol/item.ts` and `protocol/item.test.ts` | items-1 | objects-4 (A), then talents-5a (C) |
| core `item-use.ts` | items-1 (edit only if the wider `ItemTemplate` breaks it) | none |
| core `inventory.ts` and `inventory.test.ts` | items-2 | economy-1 (A), then economy-9 (C) |
| core `protocol/inventory.ts` and its test | items-3a | none; `economy` and `guild` import the helper, which needs no lease |
| core `gameplay-handlers.ts` | items-3b | travel-4 (C) |
| core `gameplay-handlers-stores.test.ts` | items-3b | none |
| core `destroy-store.ts`, `quest-errors.ts`, `rewards-store.ts` | items-3b | none |
| core `vendor-store.ts` | items-3b | none in the table (economy issue 4 decides whether economy-1 takes it) |
| core `quest-store.ts` | items-3b | quests-7b (B), then economy-9 (C), then economy-11 (D) |
| harness `tools/journal.ts` and its test, with the `JournalAfter` block of `contract/details.ts` (D13) | items-5b | quests-4 (A) |

The plan index row `core: gameplay-handlers-stores.ts` means the test
file `gameplay-handlers-stores.test.ts`; no source file of that name
exists [M, `ls packages/core/src/wow`]. items-5b holds only the
`JournalAfter` block of `contract/details.ts` (contract 2.7: a lease
names one file or one named block; D13). It edits no other block and no
`contract/views.ts` member. items-5a, items-5b and items-8 edit no line of
`tools/params.ts`: the `gear` parameters live in `areas/items/tool.ts`
(contract 1.9), and the `journal` `about` enum does not change.

### SR1-items-2: the area import allow-list

**Issue.** Contract issues 2: "items-3a needs `#wow/inventory` and
`#wow/player-state` on the allow-list. The coordinator adds them at
`SEED-1` or on the first `blocked` report."

**Ruling.** Granted, at `SEED-1`. `readInventory` (`inventory.ts:309` [M])
and `readLife` (`player-state.ts:45` [M]) are pure reads over an
`EntityLookup`, and the area store gets `deps.getEntity` through
`SessionDeps` (`session-stores.ts:17-22` [M]). They send nothing and
hold no state, like the `#wow/protocol/*` modules. The coordinator adds
both specifiers to the value allow-list in
`packages/core/src/wow/areas/registry.test.ts` and to the list in
contract 1.12, in one `COORD-<n>` commit before items-3a starts. economy
issue 6 asks for the same `#wow/inventory` entry, so one edit serves
both units. items-3a, items-4 and items-8 read the inventory and
`ammoId` only through `readInventory`, and life only through `readLife`.

### SR1-items-3: the correlation helper names

**Issue.** Contract issues 4: "This plan fixes `ownsInventoryFailure`,
`isNoChange` and `InventoryClaim` in `protocol/inventory.ts`. Not in the
contract; the coordinator confirms or renames before items-3a starts."

**Ruling.** Confirmed as named; this ruling stands in for a line in
contract 2.5 (row `items`). The exports of `protocol/inventory.ts` are:

- `type InventoryClaim = { readonly itemGuid: bigint | undefined }`;
- `ownsInventoryFailure(packet: InventoryChangeFailure, mine:
  InventoryClaim, others: readonly (InventoryClaim | undefined)[]):
  boolean`, the rule of design 5.3 "Shared failure packet";
- `isNoChange(packet: InventoryChangeFailure): boolean`, true for result
  59.

items-3a may add `NONE: 59` to `InventoryResult` under the same lease.
`economy.md` (issue 6, economy-1, economy-9) and `guild.md` (guild-6)
already use these names, so no other unit file changes.

### SR1-items-4: the legacy fan-out in items-3b

**Issue.** items-3b step 2 says the handler "calls each settle only when
`ownsInventoryFailure` holds for it, and skips `isNoChange` packets",
while step 1 says "The rewards store still records `lastInventoryError`
for every error packet". The two sentences disagree for the rewards store.

**Ruling.** In the `SMSG_INVENTORY_CHANGE_FAILURE` handler:

- A result-59 packet (`isNoChange`) reaches no legacy store except
  `combat`. The rewards store does not record it as `lastInventoryError`.
- Every other packet reaches `rewards.receiveInventoryFailure` as today.
  The handler passes the ownership result as a second argument, and the
  store clears its `take` request only when it owns the failure. The
  `ok` packet (result 0) clears `lastInventoryError` as today.
- `destroy`, `vendor` and `quests` get the packet only when
  `ownsInventoryFailure` holds for their claim.
- `combat.applyInventoryFailure` gets every packet, as today
  (`combat-store.ts:260-265` [M] matches on `item1`).

### SR1-items-5: the legacy claims before and after items-3b

**Issue.** items-3a step 4 says "The store reads the legacy claims
through `core` (destroy request, vendor buy, quest accept or reward, loot
take) for the `others` list", but the `inventoryClaim()` reads arrive
only in items-3b, after items-3a.

**Ruling.** items-3a builds the `others` list from the existing public
reads of the `CoreStores` members (`destroy`, `vendor`, `quests`
`pending`, `rewards` `pending`), through their existing entry points
(contract 1.2). items-3b adds `packages/core/src/wow/areas/items/store.ts`
and its test to its file list, and switches the `others` list to the
new `inventoryClaim()` reads, so the area and the legacy handler use one
claim rule. That file is unit-owned (contract 2.5), so no lease applies.

### SR1-items-6: one-way cross-talk

**Issue.** Contract issues 5: "The cross-talk goes one way and ends in a
timeout, not a wrong refusal."

**Ruling.** Accepted as stated. A legacy store cannot import the area
store (contract 1.12), so a failure with `item1` 0 while an item move
and a legacy request are both pending settles the legacy request, and
the move ends `move_unanswered`. items-3a has a rig test that pins this
outcome.

### SR1-items-7: opening a container through the rewards store

**Issue.** Contract issues 7: "items-4 calls
`core.rewards.requestOpen(itemGuid)` before it sends `CMSG_OPEN_ITEM`. If
that path cannot open the window, items-4 stops as `blocked` and asks for
a lease on `rewards.ts`."

**Ruling.** The plan's path stands: the runtime calls the existing
`requestOpen` entry point of `core.rewards` (contract 1.2 lets an area
call `core` through its existing entry points). A pre-emptive lease on
`rewards.ts` is refused: no task meets it yet, and no row of contract 2.7
names it. If the live proof shows that the loot window does not open,
items-4 stops `blocked` with the evidence, and the coordinator rules
then.

### SR1-items-8: scenario ids

**Issue.** Contract issues 6: "This plan uses `t8-items-<slug>` ... The
plan index must list them (contract 3.7)."

**Ruling.** The ids stand. The plan index "Scenarios" table lists
`t8-items-equip-upgrade`, `t8-items-unequip`, `t8-items-move`,
`t8-items-split`, `t8-items-open`, `t8-items-read` (items-5c) and
`t8-items-ammo` (items-8) at tier t8 [M]. No action.

### SR1-items-9: the design 5.3 decisions

**Issue.** Design 5.3 "Decisions (not yet ruled)": "who fixes the failure
correlation in the other four stores (proposal: the `items` worker, under
a lease on `gameplay-handlers.ts`); "better" is item level only; never
auto-equip; the worker picks and records item ids; ammo moves to NS1."

**Ruling.** Each stands as the design proposes: items-3b fixes the four
stores under the SR1-items-1 leases; the `items/upgrade` wake (items-5a)
and the journal `upgrade` mark (items-5b) compare item level only; the
harness never equips on its own; each live task picks its item ids and
records them in its report and in `docs/areas/items.md` "Wire notes";
items-8 is phase 1.

### SR1-items-10: new probe flow files and the loader test

**Issue.** Not in the list above; found while ruling. The loader test
asserts the exact flow set: `expect([...flows.keys()].sort()).toEqual(["login",
"nearest", "talk"])` (`packages/devtools/src/probe-flows.test.ts:116`
[M]). items-2 (`items-snapshot.ts`), items-3a (`items-move.ts`) and
items-4 (`items-open.ts`) each add a flow file, so `mise ci:checks` fails
on a file that T-3 owns and no items task may edit (contract 0.9).

**Ruling.** The coordinator changes that assertion in one `COORD-<n>`
commit before the first area flow lands (threat-1's `threat-fight.ts`
meets it first): it checks that `login`, `nearest` and `talk` are
present (`expect.arrayContaining`), not the exact set. The per-file name
check in `loadFlows` (`probe-flows.ts:67-70` [M]) stays. Until that
commit lands, items-2 stops `blocked` on that file.

### SR1-items-11: the items-2 probe flow

**Issue.** items-2 "Files" does not list
`packages/devtools/src/probe-flows/items-snapshot.ts`; the proof and the
commit name it, and the plan index lists it.

**Ruling.** items-2 creates it; it is unit-owned (contract 2.5). It takes
no arguments and prints `handle.getInventoryState()` as JSON
(`client.ts:285` [M]). It needs no test file, like the landed flows
`login`, `nearest` and `talk`, which have none [M].

### SR1-items-12: the ammo log row

**Issue.** items-8 step 3 checks "the game log row `items/equipped` or
the `ammo` result with the entry", which gives the scenario two possible
checks.

**Ruling.** items-8 adds one row: a `moved` event of kind `ammo` writes
the `log` row `items/ammo` with the entry, and `t8-items-ammo` checks
that row (selector `items/ammo`, contract 3.1). `items/equipped` stays
for the equip kinds of items-5a.

## Seed rulings (SEED-3)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-3 task meets, before `SEED-3`. The wave-3 tasks of this unit are items-6, items-7, items-9 (phase C). Each ruling is a coordinator ruling (P2-17). `core:` = `packages/core/src/wow/`, `h:` = `packages/harness/src/`, `cts:` = `packages/core/test-support/`, `dev:` = `packages/devtools/src/`. A task's own eval runs use the round number the coordinator hands the builder. The `SR3-items-<n>` ids supersede nothing earlier; section "Coordinator edits for SEED-3" in the plan index holds the seed edits (the `SEED3-<n>` ids).

| Id | Issue and task | Ruling | Status |
|---|---|---|---|
| SR3-items-1 | `items.md:154-157` seed check; `items.md:121-124` (contract issue 3: "If S0-2 did not add 0x137, items-9 stops blocked"). Tasks items-6, items-9. | No seed edit for `items`. `ITEMS_OPCODES.stubs` already holds exactly `SMSG_EQUIPMENT_SET_LIST` ("Equipment sets") and `SMSG_SET_PROFICIENCY` ("Proficiency"), `unseen` is empty (`areas/items/opcodes.ts:41-47` [M]). `SMSG_EQUIPMENT_SET_SAVED: 0x137` is in `protocol/opcodes.ts:230` and `CMSG_DELETEEQUIPMENT_SET` at `:237` [M]: contract issue 3 is closed; S0-2 and T-3 are landed. items-6 deletes the `SMSG_SET_PROFICIENCY` line and adds `SMSG_ITEM_ENCHANT_TIME_UPDATE` to `unseen` (plan text); items-9 deletes the `SMSG_EQUIPMENT_SET_LIST` line. | coordinator ruling (P2-17) |
| SR3-items-2 | Where wave-3 code goes; growth of `runtime.ts` (334), `store.ts` (255), `runtime.test.ts` (304), `store.test.ts` (185) [M]. Tasks items-6, -7, -9. | Follow the landed precedent: acts live in a runtime sibling that returns an acts object which `itemsRuntime` spreads (`areas/items/runtime.ts:27` imports `runtime-reads`, `:37-48` `ItemsActs = {...} & ReadActs`, `:351` `...readActs(env)`). items-7 creates `areas/items/runtime-sockets.ts` (+ `runtime-sockets.test.ts`) with `SocketActs` (`socket`, `cancelTempEnchant`); items-9 creates `areas/items/runtime-sets.ts` (+ `runtime-sets.test.ts`) with `SetActs` (`saveSet`, `useSet`, `deleteSet`); both extend `ItemsActs` with `& SocketActs & SetActs` and add one spread line. State slices go in `timers.ts` (items-6, holds `timers`, `cooldowns`, `proficiency`) and `sets.ts` (items-9); `store.ts` only composes them: a new `ItemsState` key (`store.ts:30` is `{ move, read }`; `snapshot()` at `:89-98`), the `receive*` methods and the event union. The new `runtime-*.ts` files and their tests are unit-owned (contract 2.5: `areas/items/*`); add them to the owner lists (section D). `runtime.test.ts` and `store.test.ts` get composition tests only. | coordinator ruling (P2-17) |
| SR3-items-3 | items-6 proof for `SMSG_SET_PROFICIENCY` (`items.md:823-829`: "first check the login trace of any probe run (the login comment at Player.cpp:11781 names it)"). | DESIGN answered: D4 accepted: `SMSG_SET_PROFICIENCY` may end as mock plus `unseen` after the two live tries (BR-wave3-6). Correction [M]: `Player.cpp:11781` is only a comment in the login sequence. The only sender is `Player::SendProficiency` (`Entities/Player/Player.cpp:10280-10285`), called from `Spell::EffectProficiency` (`Spells/SpellEffects.cpp:2436-2459`) when a proficiency mask bit is newly added by the `SPELL_EFFECT_PROFICIENCY` effect. Whether a login run or `soap gm learn` of a passive proficiency spell fires that effect is not known [INFERENCE: passive spells are cast on learn and on login; the mask starts empty each login]. Plan: one login trace check, then `mise factory soap gm <ACCOUNT> learn <spell>` (online only, `docs/factory.md` verb table) for a weapon or armor proficiency spell the class lacks, with the probe kept online by `--wait 30`. The builder picks the spell id from `Spell.dbc` in the live DBC directory (missing DBC: P2-8, ids only). Two live tries (rules.md 5); then a rig test from `Player.cpp:10282-10285`, the opcode stays in `unseen`, "not seen live" in `docs/areas/items.md`. Never `blocked`. | coordinator ruling (P2-17) |
| SR3-items-4 | items-6 proof for `SMSG_ITEM_COOLDOWN` (`items.md:819-822`: "use trinket whose spell cooldown is over 3 s; probe `items-move --arg do=equip`"). | Confirmed and narrowed [M]: the packet is sent only when equipping an item that has a spell (`Entities/Player/Player.cpp:12040-12061`): the item spell and its category cooldown must exceed 3000 ms (`:12044`), no longer cooldown may already run (`:12050`), and the spell must not carry `SPELL_ATTR0_NOT_IN_COMBAT_ONLY_PEACEFUL` (`:12054`). The cooldown is always 30 s. The body is `u64 item guid, u32 spell`. It is not sent on use. The builder picks a trinket or weapon with such a spell that the preset's class can equip (`soap presets` shows the class of `max80`), adds it with `items/add` (backpack, `t1-service-readme.md:183`), and confirms the template from the live `SMSG_ITEM_QUERY_SINGLE_RESPONSE` first. | coordinator ruling (P2-17) |
| SR3-items-5 | items-6 proofs for `SMSG_ITEM_TIME_UPDATE` (login), `SMSG_DURABILITY_DAMAGE_DEATH` (eval trace) and `SMSG_ITEM_ENCHANT_TIME_UPDATE` (`items.md:811-834`). | DESIGN answered: D4 accepted: `SMSG_ITEM_ENCHANT_TIME_UPDATE` may end as mock plus `unseen` after the two live tries (BR-wave3-6). (a) `SMSG_ITEM_TIME_UPDATE` (`u64 guid, u32 seconds`, `Entities/Item/Item.cpp:1082-1091`) is sent at login for each item in the duration list (`Entities/Player/Player.cpp:11919`, `Entities/Player/PlayerStorage.cpp:4872-4877`): stage an item whose template has `Duration > 0` with `items/add` while offline, then `--flow login --expect SMSG_ITEM_TIME_UPDATE`. (b) `SMSG_DURABILITY_DAMAGE_DEATH` (empty body, `Server/Packets/MiscPackets.h:183-186`) is sent on a death caused by a creature outside a battleground (`Entities/Unit/Unit.cpp:13738-13744`) and on a fall death (`Entities/Player/Player.cpp:858-863`). `t6-die-and-recover` ends with a creature kill ("fight the first big cat", preset `fresh`), so its run directory has the packet: proof is `tmp/evals/<round>/t6-die-and-recover-1/packets.jsonl` with opcode `0x2bd` (`docs/evals.md:88-90`: the grader starts the harness with `--packet-trace headers`). Use the round the coordinator gives; if the death was not a creature kill the try does not count, and after two runs the row is `mock` and `unseen`. (c) `SMSG_ITEM_ENCHANT_TIME_UPDATE` (`Server/Packets/ItemPackets.h:205`, senders `PlayerStorage.cpp:4428` and `:4860`, login path `Player.cpp:11918`): no realm-service endpoint can stage a timed temporary enchant (`items/add` takes item and count only, `t1-service-readme.md:183-184`), so it is `mock` from `ItemPackets.cpp:125-133` and in `unseen` without a live try. | coordinator ruling (P2-17) |
| SR3-items-6 | items-7 wire and proof (`items.md:866-904`): "socketing sends one enchant log per socket, `ItemHandler.cpp:1378`, then the result, `:1401`"; acts, silent failures. | superseded by the coordinator decision (DBCs staged): `GemProperties.dbc` and `SpellItemEnchantment.dbc` are staged, so the builder may read gem colours and enchant names through `ctx.dbc` for the wire notes and fixtures; the `socket` request still makes no client-side check of gem colour or socket count (the server decides, and the plan asks for none). Each task that reads a staged file through `ctx.dbc` adds its row to the `docs/harness.md` "DBC files" table. Draft text, kept as the no-file branch (P2-8 degraded ids): The handler is `HandleSocketOpcode` at `Handlers/ItemHandler.cpp:1213-1402` [M]; the plan's `:1378`/`:1401` are stale. The enchant log is not sent by the handler: `Item::SetEnchantment` sends it (`Entities/Item/Item.cpp:921-936`) for every changed slot below `MAX_INSPECTED_ENCHANTMENT_SLOT` (7, `Entities/Item/Item.h:176`), first the old id with an empty caster, then the new id with the caster, to the whole visible set including the owner (`Handlers/ItemHandler.cpp:1041-1048`). So a socket produces 0 to 2 logs per changed socket before the final `SMSG_SOCKET_GEMS_RESULT` (`Item.cpp:1069-1078`), and logs of other players arrive too: the `own` flag (target equals self) is required, and only `own` logs write `items/enchanted`. Failure paths: no item, duplicate gem guids, a gem in a slot with no socket and most checks return with no packet (`ItemHandler.cpp:1215-1255`); unique-gem failures send `SendEquipError` (`:1349-1360`), which is `SMSG_INVENTORY_CHANGE_FAILURE` and already peeked by the area. The `socket` request therefore settles `confirmed` on `SMSG_SOCKET_GEMS_RESULT` for the item, `refused` on an owned inventory failure (`ownsInventoryFailure` with the item guid, as the move requests do), `unanswered` after 5 s. No client-side check of gem colour or socket count (no `GemProperties.dbc` data, P2-8): the server decides. | coordinator ruling (P2-17) |
| SR3-items-7 | items-7 file and test growth: `h: areas/items/tool.ts` 426, `tool.test.ts` 491 [M]; plan edits both (`do: socket`, `gems`). | `tool.test.ts` is at 491: it is not edited, except to fix an existing assertion that enumerates the `do` values. The socket verb lives in new `h: areas/items/tool-socket.ts` and `tool-socket.test.ts` (unit-owned, same pattern as `tool-move.ts`/`tool-read.ts`/`tool-loot.ts`). `tool.ts` gets the `socket` value in the `do` enum (`tool.ts:39-40`), the `gems` parameter and one dispatch line (+10 lines at most). `worldActs` of `itemsHarness` gains `socket` (`areas/items/area.ts`, the list after `:115`); `cancelTempEnchant` has no verb and no world act. | coordinator ruling (P2-17) |
| SR3-items-8 | items-7 scenario `t8-items-socket` (`items.md:889-892`). | Preset `max80` (not in `SPAWN_OF`, `grader/spawn-slots.ts:161-167`, so no spawn and no slot); no partner; `setup` uses `items/add` twice (the socketed item and the gem; `items/add` places into the backpack and normal bags, `t1-service-readme.md:183`). The builder picks both ids, confirms both templates from live item queries, and records them in `docs/areas/items.md` "Wire notes". The gem must fit an open socket of the item so the socket bonus question does not matter. Checks: `game_log` with `evidence.events ["items/socketed"]` (selector in contract 3.1) and a `truth` check with `evidence.items [<gem entry>]` and `truth ["inventory"]` whose expect states the gem count falls by 1. Append the id to `ROUND_1` (`grader/scenarios.ts:133-184`) at the end; rebase keeps both lines when other tasks append. | coordinator ruling (P2-17) |
| SR3-items-9 | items-7 `CMSG_CANCEL_TEMP_ENCHANTMENT` proof (`items.md:899-904`) and act. | Confirmed [M]: the handler (`Handlers/ItemHandler.cpp:1404-1421`) drops anything that is not an equipment position (`IsEquipmentPos`), an empty slot or a slot with no temporary enchant, and never replies. The body is one `u32` slot (`Server/Packets/ItemPackets.cpp:150-153`). Proof is the plan's: `mise protocol:probe <ACCOUNT> --send CMSG_CANCEL_TEMP_ENCHANTMENT --body 0f000000` (slot 15, little-endian) on a character with no temporary enchant, exit 0 and no error packet, proof kind `accepted`. The act `cancelTempEnchant(slot)` refuses slots above 18 locally, sends, and settles `ok` at once (no reply exists); it needs no move-request machinery. | coordinator ruling (P2-17) |
| SR3-items-10 | items-9 wire corrections (`items.md:938-960`). | AzerothCore facts [M] the builder must encode. List: per set a packed set guid, `u32` index, name, icon, then 19 packed item guids; raw packed value `1` marks an ignored slot and `0` an empty slot (`Entities/Player/Player.cpp:14897-14922`); the list is sent only at login (`:11801`), so the delete proof needs a second login (plan). Save: a set guid of 0 (one packed byte `0x00`) creates a set and is answered with `SMSG_EQUIPMENT_SET_SAVED` = `u32 index`, packed guid (`Player.cpp:14956-14959`); a non-zero guid updates in place with no reply, and a guid or index that does not match is dropped with an error log (`:14927-14946`). The server refuses an index of 10 or more (`Player.h:747`), a name over 16 bytes and an icon over 100 bytes, all silently (`Handlers/CharacterHandler.cpp:1778-1803`): the act refuses these locally. Use: the body is 19 entries of (packed guid, `u8` bag, `u8` slot); the bag and slot are read and ignored (`:1866-1868`); guid `1` skips the slot, guid `0` unequips into the bags, and in combat only the weapon slots are processed (`:1875-1877`). `SMSG_EQUIPMENT_SET_USE_RESULT` is sent exactly once at the end, `0` ok or `4` bags full with the swaps rolled back (`:1946-1948`); single-slot failures are `SMSG_INVENTORY_CHANGE_FAILURE` packets sent before it. Result `0` therefore means "the handler finished", not "every slot changed": `useSet` settles `ok` on result 0 and returns `failures` from the owned failure packets seen in between. Delete: `DeleteEquipmentSet` sends nothing (`:1849-1857`); the slice drops the set on send and the next login list confirms it. | coordinator ruling (P2-17) |
| SR3-items-11 | items-9 proof staging (`items.md:965-971`): `eversong10`, `items-move` to change one item. | `eversong10` is a level-10 priest; the probe must read `getInventoryState()` for the worn item guids before it builds the save body, because the server clears any slot whose item guid does not equal the equipped one (`CharacterHandler.cpp:1811-1821`). The probe flow `items-sets.ts` (+ `items-sets.test.ts`, the flow loader test allows new flows: `dev: probe-flows.test.ts:115-123` [M]) takes `--arg do=save|use|delete --arg index=<0-9> --arg name=<at most 16 bytes>` and prints the list it saw. Order of the live proof: login flow (list), `do=save index=0 name=Peon`, `items-move` to swap one worn item, `do=use index=0`, `do=delete`, second login list without the set. | coordinator ruling (P2-17) |
| SR3-items-12 | Unit-wide: round numbers, docs, shared test support. | Every `--round` and `mise eval run t6-die-and-recover --round <n>` uses the coordinator's round. `cts: areas/items.ts` (227 lines) gets the new body builders (`itemsItemCooldownBody`, `itemsSocketGemsResultBody`, `itemsEquipmentSetListBody`, and so on) and is unit-owned; `cts: areas/items-world.ts` is imported by `areas/buyback` and the bank test support, so items tasks never change an existing export of it. Coverage files regenerate with `mise protocol:coverage`. | coordinator ruling (P2-17) |

### Findings behind the SEED-3 rulings

1. 1. **Only `mail` and `bank` need a seed.** `items` (35 owns, `stubs` = `SMSG_EQUIPMENT_SET_LIST` and `SMSG_SET_PROFICIENCY`, `uses` = `SMSG_INVENTORY_CHANGE_FAILURE`, `areas/items/opcodes.ts:4-47` [M]) and `emotes` (`owns` all four rows, other lists empty, `areas/emotes/opcodes.ts:4-9` [M]) were seeded in SEED-1. The `SEED-3` dependency of items-6, items-9, social-3 is a scheduling dependency only. Affects: items-6, items-9, economy-6, economy-9, social-3.

2. 7. **Scenario `setup` runs before the start-slot step**, so a slot position overrides a `position` setup step (`grader/run.ts:443-450` [M]). A scenario that needs its own start point must either carry a preset that is not in `SPAWN_OF` (`elwynn10`, `max80`, `fresh`) plus a `position` setup step, or a named spawn. Affects: economy-8, economy-10, items-7.
