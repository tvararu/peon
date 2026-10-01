# Protocol coverage: economy (key: economy)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.19 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).

The `economy` unit lets the character buy back an item it sold by
mistake, trade with another player, read and send mail, use the bank and
use the auction house. It owns five code areas (design 5.1): `buyback`
(2 opcodes), `trade` (12), `mail` (12), `bank` (5) and `auction` (15
relevant, 1 dead). That is 46 relevant opcodes and 1 dead opcode. It adds
two tools, `trade` and `mail`, and `interact` sub-verbs for the bank,
buyback and the auction house.

- **Worktree:** `proto-economy`, created by the coordinator with the
  command of contract 0.1. **Branch:** `proto/area-economy`.
- **Phases** (design 5.1, N22):
  - phase 1 (wave 1, NS1): economy-1, economy-2 (`buyback`);
  - phase 2 (wave 2, parties): economy-3, economy-4, economy-5 (`trade`);
  - phase 3 (wave 3, NS2): economy-6, economy-7, economy-8 (`mail`),
    economy-9, economy-10 (`bank`);
  - phase 4 (wave 4, long tail): economy-11, economy-12, economy-13
    (`auction`; economy-13 is optional, design 5.19 "Decisions").
- **Order:** economy-1 → economy-2 (wave 1); economy-3 → economy-4 →
  economy-5 (wave 2); economy-6 → economy-7 → economy-8 → economy-9 →
  economy-10 (wave 3); economy-11 → economy-12 → economy-13 (wave 4). One
  task at a time (contract 0.1).
- **Eval ids** (design 5.2 and 5.19, verbatim; see contract issue 1):
  `t5-buyback-vendor`; `t9-trade-give`, `t9-trade-receive`,
  `t9-trade-swap`, `t9-trade-cancel`; `t9-mail-read`, `t9-mail-collect`,
  `t9-mail-send`; `t9-bank-deposit`, `t9-bank-withdraw`, `t9-bank-slot`;
  optional `t9-auction-sell`, `t9-auction-search`, `t9-auction-buy`,
  `t9-auction-mine`, `t9-auction-cancel`.

AzerothCore paths below are relative to `src/server/game/` unless they
start with `src/`, `data/` or `modules/` (contract 0.5). wowm paths are
under `wow_message_parser/wowm/world/`. Peon paths are relative to the
worktree root; core paths without a package prefix are under
`packages/core/src/wow/` and harness paths under `packages/harness/src/`.
Marks: **[M]** read for this plan, **[I]** inferred.

## Contract issues

Gaps found while planning. The contract is not changed. Each names what
the coordinator must do and the task that stops if it is not done.

1. **No plan index yet.** Contract 3.7 says the plan index lists every
   scenario id. The index file does not exist at plan time [M, `ls
   docs/plans`]. This plan takes the ids of design 5.2 and 5.19 verbatim,
   among them `t5-buyback-vendor` (the area research wrote
   `t5-vendor-buyback`; the design wins, and `buyback` is the code-area
   word of N26). The coordinator copies them into the index.
2. **Mail eval staging has no owner.** Design 5.19 and N30 let each mail
   eval run one `soap gm mail|items|money` step before the baseline.
   `Scenario.setup` holds only `{ endpoint, body }` entries
   (`packages/harness/src/grader/scenarios.ts:62` [M]), and no tooling
   task (T-1 to T-10) adds a GM setup kind. It needs edits to
   `grader/scenarios.ts`, `grader/scenario.schema.json` and the setup
   runner near `grader/run.ts:472` [M], which this unit does not own
   (`run.ts` is at the 500-line cap, tooling.md issue 3). The coordinator
   adds it (a `COORD-<n>` commit or a tooling task) before economy-8.
   Until then economy-8 stops as `blocked` naming this issue. Whether the
   grader's accounts carry the ledger `root` that `soap gm` checks (design
   4.3) could not be determined; the same commit settles it.
3. **Peeks instead of legacy edits.** Design 5.19 asks for a lease on
   `world-handlers-chat.ts:222-230` for `SMSG_RECEIVED_MAIL`. This plan
   takes the peek (N3), as travel does for `SMSG_SHOWTAXINODES`: the
   legacy owners stay, and the areas list these opcodes in `uses`:
   - `mail`: `SMSG_RECEIVED_MAIL` (owner `world-handlers-chat.ts:222` [M]);
   - `bank`: `SMSG_SHOW_BANK` (owner `gameplay-handlers.ts:203-205` [M]),
     `SMSG_INVENTORY_CHANGE_FAILURE` (owner `gameplay-handlers.ts:306-313`
     [M]);
   - `buyback`: `SMSG_BUY_FAILED`, `SMSG_SELL_ITEM`, `SMSG_BUY_ITEM`
     (owners `gameplay-handlers.ts:349-357` [M]) and
     `SMSG_INVENTORY_CHANGE_FAILURE`.
   No `world-handlers-chat.ts` lease is needed.
4. **Buyback keeps its own pending state; no `vendor-store.ts` lease.**
   Design 5.19 says both "the vendor store gains `buyback` and `buyInSlot`
   request kinds (a lease on `vendor-store.ts`)" and "bank moves and
   buyback keep their own pending state and peek
   `SMSG_INVENTORY_CHANGE_FAILURE`". This plan follows the second
   sentence. The design's goal is that a buyback failure settles the
   buyback, not a buy. The legacy store settles only its own pending
   request (`vendor-store.ts:190-223` [M]: a buy failure needs
   `pending.action === "buy"`, a sell failure needs a pending request). The
   buyback act refuses to send while `core.vendor.pending` is set, and the
   harness tools run one at a time under `ctx.rt.mutex`. Cross-talk is
   then possible only if a legacy vendor request starts inside the 5 s
   buyback wait, and it ends in a timeout, not a wrong refusal (the same
   one-way rule as items.md contract issue 5). A decision **not yet ruled
   by the maintainer**. If the coordinator wants the design's first
   sentence, economy-1 needs the `vendor-store.ts` and `vendor.ts`
   (`VendorRequest`, `vendor.ts:47-69` [M]) lease after items-3b.
5. **`inventory.ts` lease, twice, after items.** The buyback read (slots
   74-85, `BUYBACK_PRICE_1`, `BUYBACK_TIMESTAMP_1`) and the bank read
   (slots 39-66, bank bags 67-73) are new regions in `readInventory`
   (`inventory.ts:78-109` [M]; design 5.19 "Body gaps"). items-2 holds the
   `inventory.ts` lease in wave 1. economy-1 needs it after items-2 lands,
   and economy-9 again in wave 3. If a region pushes the file past 500
   non-blank lines (355 lines today [M, `wc -l`]), the lease covers one
   new sibling, `inventory-regions.ts`.
6. **Allow-list and helper names.** The areas read the inventory through
   `readInventory` from `#wow/inventory`, which is outside the value
   allow-list of contract 1.12. items.md contract issue 2 asks for the same
   extension; economy-1 and economy-9 depend on it. The correlation helper
   names `ownsInventoryFailure`, `isNoChange` and `InventoryClaim` in
   `#wow/protocol/inventory` are fixed by items.md (issue 4), not by the
   contract; economy-1 and economy-9 use them as named there. Self fields
   (`PLAYER_BYTES_2` for bank bag slots) are read from the self entity
   through `core` with a type-only import of the entity type; if that
   needs a value import outside the list, economy-9 stops as `blocked` and
   asks for a `COORD` extension.
7. **`tools/params.ts` is not in the lease table.** The `interact` `do`
   enum (`params.ts:115-116` [M]), the `journal` `about` enum (`:188` [M])
   and `LOOK_KINDS` (`:3-15` [M]) live there. economy-2, economy-8,
   economy-10 and economy-13 need that file under the same lease as the
   `interact`, `journal` and `look` modules. travel-5 and items-5b edit it
   in wave 1; the coordinator serialises the holders (D12).
8. **`quest-store.ts` window kinds.** `QuestWindow` already lists `bank`
   (`quests-requests.ts:41` [M]), but `receiveWindow` treats only
   `trainer` and `vendor` as supported and records `unsupported_window`
   for the rest (`quest-store.ts:246-267` [M]). economy-9 needs a lease on
   `quest-store.ts` (support `bank`); economy-11 on `quest-store.ts` and
   `quests-requests.ts` (add and support `auction`). items-3b holds
   `quest-store.ts` in wave 1, so there is no clash in waves 3 and 4.
9. **Harness tasks carry no opcode.** economy-2, economy-5, economy-8,
   economy-10 and economy-13 are verb and eval tasks (design 5.19
   "Tasks"). The rule "1-8 opcodes per task" does not fit them, and
   contract 0.10 forbids merging them into the core tasks.
10. **Partner staging.** `t9-trade-swap` gives the partner one item it
    offers. The grader stages the partner with its spawn slot only
    (`grader/run.ts:479` [M]). economy-5 uses an item the partner preset
    already carries (read with `mise factory soap presets` or a partner
    truth read); if the preset carries none that fits, the scenario stops
    as `blocked` and asks for partner setup entries. economy-13 has the
    same need for `t9-auction-search` and `t9-auction-buy`.

## Shared facts for every task

**Names** (contract D7, 1.5 and 1.10):

| Name | File |
|---|---|
| `BUYBACK_OPCODES`, `buybackArea`, `buybackHarness` | `areas/buyback/opcodes.ts`, `areas/buyback/area.ts`, harness `areas/buyback/area.ts` (seeded by `SEED-1`) |
| `TRADE_OPCODES`, `tradeArea`, `tradeHarness` | the same under `trade` (`SEED-2`) |
| `MAIL_OPCODES`, `mailArea`, `mailHarness` | under `mail` (`SEED-3`) |
| `BANK_OPCODES`, `bankArea`, `bankHarness` | under `bank` (`SEED-3`) |
| `AUCTION_OPCODES`, `auctionArea`, `auctionHarness` | under `auction` (`SEED-4`) |
| `<Area>State`, `<Area>Event`, `<Area>Store`, `create<Area>Store` | `areas/<area>/store.ts` |
| `<Area>Acts`, `<area>Runtime` | `areas/<area>/runtime.ts` |
| parsers `parse*`, builders `build*`, result-name tables | `areas/<area>/protocol.ts` |
| `<area><Opcode>Body(...)` | `packages/core/test-support/areas/<area>.ts` |
| `tradeTool` (kind `run`), `mailTool` (kind `action`) | harness `areas/trade/tool.ts`, `areas/mail/tool.ts` (contract 1.9) |

**Outcome.** Every act settles as
`{ status: "ok"; ... } | { status: "refused"; reason: string } | { status: "unanswered" }`.
Many AzerothCore paths return with no packet (design 5.19 "Stores and
runtime"), so each act checks what it can first and waits with
`ctx.until(..., { timeoutMs })`: 5 s (`DESTROY_ANSWER_MS`,
`destroy.ts:15` [M]), 10 s for auction lists (design 5.19). A timeout
maps to `unanswered`. A failed precondition throws an `Error` with a plain
reason, as `VendorRuntime` does (`vendor.ts:219-230` [M]).

**Event and row names.** Event `type` values match `/^[a-z_]+$/`
(contract 1.2). Harness rows are drafts of `<area>Harness.rules`, domain
`<area>`, event `<area>/<name>` (contract 1.9); `vendor` is a core domain,
so the buyback rows are `buyback/<name>`, not `vendor/buyback`.

**Live characters.** `mise factory soap create <preset>` gives each
account. The offline `position` endpoint places a character before login
(`docs/factory.md:75-78` [M]); `soap setup money` and `items/add` stage
gold and items. `mise factory soap gm <ACCOUNT> items|money|mail` (T-5)
stages letters: the console sends them with no delay and the character is
its own sender (design 5.19). Two-character proof uses two same-faction
accounts placed at one point (trade needs 11.11 yd,
`Entities/Object/ObjectDefines.h:29`): character A runs as a puppet
started with `--packet-trace headers` and driven by `call` or `raw`
(T-7a, T-7c); character B runs the probe (T-3). Mailbox, banker and
auctioneer positions near the presets could not be determined; the first
task that needs one finds it with the probe's `nearest` flow and writes
it into its probe flow or scenario, never into a doc. Every account is
deleted with `mise factory soap delete <ACCOUNT>` before the task reports
(contract 0.7). If the first trade or mail send answers
`TRIAL_ACCOUNT`, the task stops as `blocked`: whether soap accounts are
trial accounts could not be determined (design 5.19 "Risks").

**Doc files.** One per code area with the headings of contract 3.8:
`docs/areas/buyback.md` (economy-1), `trade.md` (economy-3), `mail.md`
(economy-6), `bank.md` (economy-9), `auction.md` (economy-11). Each later
task of the area adds its proof rows, wire notes and "Left out" lines.

**Checks before review** (contract 0.2): the task's test files with
`mise test <file>`, `mise typecheck core` (and `harness` for harness
tasks), `mise lint <path>`, `mise protocol:coverage`,
`mise protocol:cite-check`, then `mise ci:checks`.

---

## Task economy-1: Buyback and buy into a slot

Rulings: SR1-economy-2, SR1-economy-3, SR1-economy-4, SR1-economy-5, SR1-economy-6, SR1-economy-7 (section "Seed rulings (SEED-1)").

**Phase:** 1 (wave 1, N22). **codeArea:** `buyback`. **Size:** S.

**Files:**
- Edit: `packages/core/src/wow/areas/buyback/opcodes.ts` (`uses`)
- Create: `packages/core/src/wow/areas/buyback/protocol.ts`,
  `protocol.test.ts`, `store.ts`, `store.test.ts`, `runtime.ts`,
  `runtime.test.ts`
- Edit: `packages/core/src/wow/areas/buyback/area.ts`
- Edit (lease, contract issue 5): `packages/core/src/wow/inventory.ts`
  and `inventory.test.ts` (region `buyback`; the buyback price and sale
  time)
- Create: `packages/core/test-support/areas/buyback.ts`
- Create: `packages/devtools/src/probe-flows/buyback-vendor.ts`
- Create: `docs/areas/buyback.md`
- Regenerate: `docs/protocol-coverage/buyback.md`

**Depends on:** item 6, `S0-5`, `SEED-1` (seeds `buyback`), `T-2`, `T-3`, `T-4`,
`items-2` (the `inventory.ts` lease hands on), `items-3a` (the helper),
and the allow-list extension of contract issue 6.

**Opcodes:** `CMSG_BUYBACK_ITEM`, `CMSG_BUY_ITEM_IN_SLOT`. Uses (peek):
`SMSG_BUY_FAILED`, `SMSG_SELL_ITEM`, `SMSG_BUY_ITEM`,
`SMSG_INVENTORY_CHANGE_FAILURE`.

**Steps:**

- [ ] **Step 1: Failing builder tests.** `protocol.test.ts`:
  - `buildBuybackItem(vendor, slot)` writes `u64 vendor, u32 slot`
    (`Server/Packets/ItemPackets.cpp:78-82` [M]). A test title records
    that the slot is the raw 74-85 of AzerothCore
    (`Entities/Player/Player.h:711-712`), not wowm's `BuybackSlot` 69-81
    (`item/cmsg_buyback_item.wowm`). Slots outside 74-85 throw.
  - `buildBuyItemInSlot({ vendor, item, vendorSlot, bagGuid, bagSlot, count })`
    writes `u64, u32, u32, u64, u8, u32`: the count is a `u32`
    (`Server/Packets/ItemPackets.cpp:84-92`); wowm's `item/cmsg_buy_item_in_slot.wowm`
    has a `u8` amount. Vendor slot 0 throws (AzerothCore drops it as a
    cheat, `Handlers/ItemHandler.cpp:800-804`).
  Run `mise test packages/core/src/wow/areas/buyback/protocol.test.ts`.
  Expected: it fails to load, `protocol.ts` does not exist.
- [ ] **Step 2: Implement `protocol.ts`.** Run the test; it passes.
- [ ] **Step 3: Failing inventory test (lease).** `inventory.test.ts`: an
  entity with `PLAYER_FIELD_INV` words for slot 74 (offset `324 + 2 x 74`,
  `protocol/update-fields.ts:264` [M]) and `BUYBACK_PRICE_1` and
  `BUYBACK_TIMESTAMP_1` (`update-fields.ts:307-308` [M]) reads one
  `region: "buyback"` slot at `bag` 255, `slot` 74, with its price and
  sale time; `freeSlots` does not change (it counts carried bags only,
  `inventory.ts:291-305` [M]). Run it; it fails.
- [ ] **Step 4: Implement the region** in `inventory.ts` (`ROOTS` gains
  74-85 as `buyback`; `InventoryState` gains
  `buyback: { slot: number; price: number; soldAt: number }[]`). Run the
  inventory and vendor tests; they pass.
- [ ] **Step 5: Test-support builders.** In
  `packages/core/test-support/areas/buyback.ts`:
  `buybackBuyFailedBody({ vendor, itemId, result })` from
  `Entities/Player/Player.cpp` `SendBuyError` (the worker cites the
  line), `buybackSellItemBody({ vendor, itemGuid, result })` from
  `SendSellError`, and `buybackBuyItemBody(...)` from the
  `SMSG_BUY_ITEM` write in `BuyItemFromVendorSlot`
  (`Entities/Player/Player.cpp:10866` [M, design]).
- [ ] **Step 6: Failing store and runtime tests** over
  `areaRig("buyback", { register })`, where `register` calls
  `registerVendorHandlers` (`gameplay-handlers.ts:338` [M], owner of the
  three vendor replies) and `registerLootHandlers` (`:269` [M], owner of
  `SMSG_INVENTORY_CHANGE_FAILURE`) so the legacy owners stay real (D24).
  Both take a `WorldConn` [M]; the test passes a connection stub that
  carries the rig's `dispatch` (a shared stub goes in
  `packages/core/test-support/areas/buyback.ts`). Fake timers run in
  `try`/`finally`:
  - `act.buyback(slot)` with an open vendor window (`core.vendor.window`)
    and an item in buyback slot 74 records one `CMSG_BUYBACK_ITEM` in
    `rig.sent` and settles `ok` when an injected entity update empties
    slot 74 and a carried slot gains the item's guid.
  - An injected `SMSG_BUY_FAILED` with the item entry settles
    `refused("not_enough_money")` (`Handlers/ItemHandler.cpp:767-769`);
    `cant_find_item` likewise (`:795`).
  - An injected `SMSG_SELL_ITEM` with `cant_find_vendor` settles
    `refused("cant_find_vendor")` (`:750-756`).
  - An inventory failure that `ownsInventoryFailure` gives to the
    buyback settles `refused("inventory_full")` (`:792`); one for another
    guid does not.
  - No reply in 5 s settles `unanswered`.
  - Preconditions throw: no vendor window, `core.vendor.pending` set, a
    buyback already pending, an empty buyback slot, a price above
    `coinage`.
  - `act.buyInSlot({ vendorSlot, bag, slot, count })` sends
    `CMSG_BUY_ITEM_IN_SLOT` with the self guid as the bag guid for the
    backpack (bag 255) and the bag item's guid for a bag
    (`Handlers/ItemHandler.cpp:806-823`), settles `ok` on
    `SMSG_BUY_ITEM` for that vendor slot, and refuses a destination
    that is not empty.
  - The legacy vendor store's `pending` and `lastOutcome` do not change
    on any of these (the one-way rule of contract issue 4).
  Run them; they fail.
- [ ] **Step 7: Implement.** `store.ts`: `BuybackState = { list:
  { slot, entry, count, price, soldAt }[]; pending: ... | undefined;
  lastOutcome: ... | undefined }`, fed by an `observeInventory` call and
  the peeks; events `listed`, `bought_back`, `bought_in_slot`,
  `refused`, `unanswered`. `register` peeks the four opcodes.
  `runtime.ts`: `BuybackActs = { buyback, buyInSlot }`; `listen("entity",
  ...)` feeds the store; one `until` per act. `area.ts` sets
  `runtime: buybackRuntime` and `eventTypes`. `opcodes.ts` `uses` gains
  the four peeked opcodes. Run the tests, then `mise typecheck core`,
  `mise lint packages/core/src/wow/areas/buyback`,
  `mise protocol:coverage`.
- [ ] **Step 8: Probe flow.** `probe-flows/buyback-vendor.ts`: find the
  nearest vendor (`nearest vendor`), list it, sell the first grey item,
  call `handle.buyback.act.buyback(74)`, then buy item 159 into the first
  empty backpack slot with `buyInSlot`. `--arg poor=1` skips the sale and
  calls `buyback` on a slot the worker staged, for the money refusal.
- [ ] **Step 9: Live proof.** `soap create elwynn10`, `items/add` one
  grey item (the worker picks the entry from the item catalog), place the
  character at the Goldshire innkeeper (as `t5-vendor-buy-goldshire`),
  then `mise protocol:probe <ACCOUNT> --flow buyback-vendor --expect SMSG_BUY_ITEM`.
  The trace shows `CMSG_BUYBACK_ITEM` out and the entity update that
  empties slot 74; `CMSG_BUY_ITEM_IN_SLOT` out and `SMSG_BUY_ITEM` in.
  For the refusal: sell, log out, `soap setup money` 0, log in, run
  `--flow buyback-vendor --arg poor=1 --expect SMSG_BUY_FAILED`. The
  server keeps the buyback list only for the session [I]; if it is empty
  after the relog, the refusal stays a rig test and the report says so.
- [ ] **Step 10: Doc.** Create `docs/areas/buyback.md`: wire notes (the
  slot range and the count width), proof rows, "Capabilities row:
  proposed in economy-2". Run `mise protocol:cite-check` and
  `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_BUYBACK_ITEM` | live | `buyback-vendor` flow; slot 74 empties, the bag gains the item |
| `CMSG_BUY_ITEM_IN_SLOT` | live | `buyback-vendor` flow; `SMSG_BUY_ITEM` follows |

**Commit:**

```
feat: Buy back sold items and buy into a slot

The character can now undo a wrong sale at a vendor and buy an item
straight into a chosen bag position. Buyback slots are read from the
player's fields, so the agent can see what it sold.
```

---

## Task economy-2: Buyback verb and eval

Rulings: SR1-economy-1, SR1-economy-8, SR1-economy-9, SR1-economy-10, SR1-economy-11, SR1-economy-12 (section "Seed rulings (SEED-1)").

**Phase:** 1 (wave 1, N22). **codeArea:** `buyback`. **Size:** S.

**Files:**
- Edit (lease): `packages/harness/src/tools/interact.ts` (`STEPS`,
  `interact.ts:126-133` [M]) and a new sibling
  `packages/harness/src/tools/interact-buyback.ts` with its test
- Edit (lease, contract issue 7): `packages/harness/src/tools/params.ts`
  (`interactParams` `do` gains `buyback`)
- Edit (lease): `packages/harness/src/tools/journal.ts` and
  `journal.test.ts` (`about: bags` lists the buyback slots when any),
  with its `After` block in `contract/details.ts` (D13)
- Edit: `packages/harness/src/areas/buyback/area.ts` and `area.test.ts`
- Create: `packages/harness/src/grader/scenarios/t5-buyback-vendor.json`
- Shared: `packages/harness/src/grader/scenarios.ts` `ROUND_1` (append),
  `docs/capabilities.md`, `docs/evals.md` (contract 3.2-3.5)
- Edit: `docs/areas/buyback.md` (capabilities row), `docs/harness.md`
  (the `interact` row of the tool table, one clause)

**Depends on:** `economy-1`; the `interact*.ts`, `params.ts` and
`journal.ts` leases (items-5b and travel-5 hold them first in wave 1).

**Opcodes:** none of its own (contract issue 9). It uses
`CMSG_BUYBACK_ITEM` through `handle.buyback.act.buyback`.

**Steps:**

- [ ] **Step 1: Harness rules test.** `area.test.ts`: a `bought_back`
  event gives one `bought_back` log draft naming the item and the price;
  `refused` and `unanswered` give one wake draft each; `listed` gives no
  row (the flood guard, G17). `worldActs: ["buyback"]`. Run it; it fails.
- [ ] **Step 2: Implement the rules** in `buybackHarness`.
- [ ] **Step 3: `interact do:"buyback"` test.** `interact-buyback.test.ts`
  on the mock game (`triggerAreaEvent`,
  `jest.spyOn(handle.buyback.act, "buyback")`):
  - with `what` naming an item in the buyback list, the step opens the
    vendor with the existing interact leg (a `list` if no window is
    open), calls `buyback(slot)` once and reports
    `Bought back <item> for <price>.`;
  - a name not in the list refuses with `not_in_buyback` and lists what
    is there;
  - `refused` and `unanswered` outcomes report their reason;
  - `expectSendKind(interactTool)` passes (contract 1.9).
- [ ] **Step 4: Implement** `interact-buyback.ts`, the `STEPS` entry and
  the `do` enum value.
- [ ] **Step 5: `journal about:"bags"` test and implementation.** With a
  non-empty `handle.buyback.state().list`, the bags text ends with a
  "Buyback:" line of item, count and price; with an empty list it is
  unchanged.
- [ ] **Step 6: Scenario.** `t5-buyback-vendor.json` in the shape of
  `t5-vendor-buy-goldshire.json` [M]: preset `elwynn10`, tier 5, setup
  `items/add` one grey item; task "Sell your junk to the innkeeper, then
  buy back the <item>."; checks: truth `items` shows the grey item at the
  end; truth `money` delta equals 0 (the buyback price is the sale price
  [I]); game log `buyback/bought_back`. Budgets start at `paneMinutes` 9
  and `budget.minutes` 6. Run
  `mise test packages/harness/src/grader/scenarios.test.ts`.
- [ ] **Step 7: Eval run.** `mise eval run t5-buyback-vendor --round <n>`, babysat by
  an omp Muse worker (R10). Record the verdict.
- [ ] **Step 8: Docs, one commit for the scenario** (contract 3.2): the
  JSON, its `ROUND_1` line, its `docs/capabilities.md` row
  `| Buy back an item sold by mistake | \`t5-buyback-vendor\` | Only items sold this session. |`
  (or a "Not shown" bullet if it failed), and the `docs/evals.md` row
  `| Economy (\`interact\` buyback, bank, auction; \`trade\`; \`mail\`) | \`t5-buyback-vendor\` |`.
  Later economy scenarios add their ids to this row. Run the gates of
  contract 3.6 and `mise ci:checks`.

**Proof:** eval. `t5-buyback-vendor` verdict.

**Commits** (two):

```
feat: Add interact buyback

The agent can now buy back an item it sold by mistake, and journal bags
lists what the vendor still holds.
```

```
test: Add the t5-buyback-vendor eval

The scenario proves buyback end to end: the grey item is back in the
bags and the money is where it started.
```

---

## Task economy-3: Trade requests and the trade window

**Phase:** 2 (wave 2). **codeArea:** `trade`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/trade/opcodes.ts` (delete the
  `SMSG_TRADE_STATUS` stub line; `unseen` if a refusal falls back to R22)
- Create: `packages/core/src/wow/areas/trade/protocol.ts`,
  `protocol.test.ts`, `store.ts`, `store.test.ts`, `runtime.ts`,
  `runtime.test.ts`
- Edit: `packages/core/src/wow/areas/trade/area.ts`
- Create: `packages/core/test-support/areas/trade.ts`
- Create: `packages/devtools/src/probe-flows/trade-window.ts`
- Create: `docs/areas/trade.md`
- Regenerate: `docs/protocol-coverage/trade.md`

**Depends on:** `SEED-2` (seeds `trade`), `T-3`, `T-4`, `T-7c` (the
partner's `raw` sends and trace).

**Opcodes:** `SMSG_TRADE_STATUS` (stub → handled), `CMSG_INITIATE_TRADE`,
`CMSG_BEGIN_TRADE`, `CMSG_BUSY_TRADE`, `CMSG_IGNORE_TRADE`,
`CMSG_CANCEL_TRADE`.

**Steps:**

- [ ] **Step 1: Test-support builders.** `tradeStatusBody(status, extra)`
  from `Handlers/TradeHandler.cpp:35-61`: `u32 status`, then `u64 trader`
  for `BEGIN_TRADE` (1), `u32 trade id` for `OPEN_WINDOW` (2), `u32
  InventoryResult, u8 is target, u32 limit item` for `CLOSE_WINDOW` (12),
  `u8 slot` for 22 and 23.
- [ ] **Step 2: Failing parser and builder tests.** `protocol.test.ts`:
  - `parseTradeStatus` reads each branch and leaves 0 bytes; the title of
    the `OPEN_WINDOW` case records that AzerothCore writes a `u32`
    (`TradeHandler.cpp:45-47`) and wowm's `trade/smsg_trade_status.wowm`
    has no branch for it.
  - Status names come from `shared/SharedDefines.h:3804-3830`; 22 is
    `wrong_realm` (wowm calls it `ONLY_CONJURED`, same wire); an unknown
    value gets a fallback name (as `protocol/vendor.ts:65-71` [M]).
  - `buildInitiateTrade(guid)` writes the `u64` that `:724` reads;
    `buildBeginTrade`, `buildBusyTrade`, `buildIgnoreTrade`,
    `buildCancelTrade` write empty bodies (`:692-702`, `:69-72`,
    `:64-67`, `:714-719`).
  Run `mise test packages/core/src/wow/areas/trade/protocol.test.ts`.
  Expected: it fails to load.
- [ ] **Step 3: Implement `protocol.ts`.** Run the test; it passes.
- [ ] **Step 4: Failing store tests** over `areaRig("trade")`:
  - `BEGIN_TRADE` with a guid sets `phase: "requested_in"` and `from`,
    and emits `requested`;
  - after the own `requestTrade`, `OPEN_WINDOW` sets `phase: "open"` and
    emits `opened`;
  - `TRADE_CANCELED` (3), `BUSY` (0) and `IGNORE_YOU` (14) set
    `phase: "closed"` and `lastOutcome: { kind: "canceled", status }` and
    emit `canceled`;
  - `NO_TARGET`, `TARGET_TO_FAR`, `WRONG_FACTION`, `YOU_DEAD` and
    `TRIAL_ACCOUNT` set `lastOutcome: { kind: "refused", status }` and
    emit `refused`;
  - the `SMSG_TRADE_STATUS` pair is gone from `areaStubs()` and
    `dispatch.has` is true.
- [ ] **Step 5: Implement the store and `register`.** `TradeState =
  { phase: "idle" | "requested_out" | "requested_in" | "open" | "closed";
  with: bigint | undefined; ownOffer; theirOffer; selfAccepted;
  theyAccepted; lastOutcome }` (the offer members stay empty until
  economy-4). Delete the stub line. Run the tests; they pass.
- [ ] **Step 6: Failing runtime tests** (fake timers):
  - `act.requestTrade(guid)` sends `CMSG_INITIATE_TRADE` and settles `ok`
    on `OPEN_WINDOW`; a `refused` status settles `refused(<name>)`; no
    `OPEN_WINDOW` in 60 s sends `CMSG_CANCEL_TRADE` and settles
    `unanswered` (design 5.19 area research, section 3e).
  - `act.answerTrade("yes" | "busy" | "ignore")` sends `BEGIN`, `BUSY` or
    `IGNORE` only in `requested_in`; otherwise it throws `no_request`.
  - `act.cancelTrade()` sends `CMSG_CANCEL_TRADE` in `open`,
    `requested_in` or `requested_out`.
  - A request that stays unanswered for 60 s is answered `busy` by the
    runtime, so the character can trade again
    (`TradeHandler.cpp:726-727`, N30); it never answers `yes` by itself.
  - `requestTrade` throws while a trade is not `idle` or `closed`: the
    server drops that initiate with no reply (`:726-727`).
- [ ] **Step 7: Implement `runtime.ts`** (`TradeActs = { requestTrade,
  answerTrade, cancelTrade }`, `tradeRuntime`) and wire `area.ts`. The
  60 s auto-busy is a runtime timer cleared on any answer and on
  dispose. A decision **accepted by the maintainer (P2-5)**: design 5.19
  names it a harness rule, but a harness module has no timer (contract
  1.9), so the core runtime holds it. Run the tests and the checks.
- [ ] **Step 8: Probe flow.** `probe-flows/trade-window.ts` on character
  B: `--arg answer=yes|busy|ignore` waits up to 60 s for `requested`,
  answers, and with `yes` waits for `opened`, then cancels.
  `--arg target=<guid>` instead sends `requestTrade(guid)` and reports the
  status.
- [ ] **Step 9: Live proof.** Two same-faction `eversong10` accounts,
  both placed at one point with `position`. A runs
  `tmp/puppet-<A> start --json --packet-trace headers`. For each answer
  of B:
  - start `mise protocol:probe <B> --flow trade-window --arg answer=yes --expect SMSG_TRADE_STATUS`,
    then `tmp/puppet-<A> raw CMSG_INITIATE_TRADE <B guid hex>`. B's trace
    shows `BEGIN_TRADE`, then `CMSG_BEGIN_TRADE` out and `OPEN_WINDOW`;
    A's `packets.jsonl` shows `OPEN_WINDOW` and, after B's cancel,
    `TRADE_CANCELED`.
  - `answer=busy` (both get `BUSY`) and `answer=ignore` (both get
    `IGNORE_YOU`, `Entities/Player/PlayerStorage.cpp:4223-4239`).
  - Refusals from B's side: `--arg target=<unknown guid>` (`NO_TARGET`,
    `TradeHandler.cpp:778-782`), `--arg target=<B's own guid>` (`BUSY`,
    `:785-789`), and `--arg target=<A guid>` after A walks 20 yd away
    (`TARGET_TO_FAR`, `:835-839`).
  - `WRONG_FACTION` needs a Horde and an Alliance character at one point;
    no shared spot was identified [I]. If the worker finds none, the
    status stays a rig test built from `TradeHandler.cpp:828-833` and
    the report says so; `SMSG_TRADE_STATUS` itself is live either way.
- [ ] **Step 10: Doc.** Create `docs/areas/trade.md`: wire notes (the
  `OPEN_WINDOW` word, status 22, the ignored accept body for economy-4),
  proof rows for the six opcodes, "Capabilities row: proposed in
  economy-5". Run `mise protocol:cite-check` and `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `SMSG_TRADE_STATUS` | live | `trade-window` flow, every answer |
| `CMSG_INITIATE_TRADE` | live | `trade-window --arg target=...`; the status reply follows |
| `CMSG_BEGIN_TRADE` | live | `answer=yes`; `OPEN_WINDOW` on both sides |
| `CMSG_BUSY_TRADE` | live | `answer=busy`; `BUSY` on both sides |
| `CMSG_IGNORE_TRADE` | live | `answer=ignore`; `IGNORE_YOU` on both sides |
| `CMSG_CANCEL_TRADE` | live | the cancel after `OPEN_WINDOW`; `TRADE_CANCELED` on both sides |

**Commit:**

```
feat: Request, answer and cancel trades

The character now sees trade requests from other players and can open,
refuse or cancel a trade. An unanswered request is answered busy after
a minute, so the character can trade again.
```

---

## Task economy-4: Trade offers and accept

**Phase:** 2 (wave 2). **codeArea:** `trade`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/trade/opcodes.ts` (delete the
  `SMSG_TRADE_STATUS_EXTENDED` stub line; `unseen` if needed)
- Edit: `areas/trade/protocol.ts`, `store.ts`, `runtime.ts`, `area.ts`
  and their tests; a sibling `areas/trade/offer.ts` and `offer.test.ts`
  if `store.ts` passes 300 lines
- Edit: `packages/core/test-support/areas/trade.ts`
- Create: `packages/devtools/src/probe-flows/trade-offer.ts`
- Edit: `docs/areas/trade.md`; regenerate `docs/protocol-coverage/trade.md`

**Depends on:** `economy-3`.

**Opcodes:** `SMSG_TRADE_STATUS_EXTENDED` (stub → handled),
`CMSG_SET_TRADE_ITEM`, `CMSG_CLEAR_TRADE_ITEM`, `CMSG_SET_TRADE_GOLD`,
`CMSG_ACCEPT_TRADE`, `CMSG_UNACCEPT_TRADE`.

**Steps:**

- [ ] **Step 1: Test-support builder.** `tradeStatusExtendedBody({ side,
  gold, spell, slots })` from `Handlers/TradeHandler.cpp:74-122`: `u8
  side, u32 trade id, u32 7, u32 7, u32 gold, u32 spell`, then 7 slots of
  `u8 index` and 18 words; an empty slot writes 18 zero words.
- [ ] **Step 2: Failing parser and builder tests.**
  - `parseTradeStatusExtended` reads the side, gold, spell and seven
    slots (entry, display, count, wrapped, gift creator, permanent
    enchant, three gem enchants, creator, charges, suffix, random
    property, lock, max durability, durability); entry 0 is an empty
    slot; the body is consumed exactly.
  - `buildSetTradeItem(tradeSlot, bag, slot)` writes `u8, u8, u8`
    (`:877-879`); `buildClearTradeItem(tradeSlot)` one `u8` (`:935-947`);
    `buildSetTradeGold(copper)` one `u32` (`:858-868`);
    `buildUnacceptTrade()` empty (`:683-690`).
  - `buildAcceptTrade()` writes `u32 1`. The title records that
    AzerothCore reads no body (`:237`) and wowm
    `trade/cmsg_accept_trade.wowm` has one `u32`.
  Run them; they fail.
- [ ] **Step 3: Implement the parser and builders.** Run the tests.
- [ ] **Step 4: Failing store tests** over `areaRig("trade")`:
  - an `EXTENDED` with side 1 sets `theirOffer` and raises
    `theirOffer.version`; it emits `offer_changed`;
  - an `EXTENDED` with side 0 is kept as `ownEcho` and does not replace
    `ownOffer` (the server echoes the own side only when a spell is set,
    `Entities/Player/TradeData.cpp:71-86`);
  - `BACK_TO_TRADE` (7) clears both accept flags, raises the version and
    emits `back_to_trade` (`TradeData.cpp:54-66,123-135`);
  - `TRADE_ACCEPT` (4) sets `theyAccepted` and emits `they_accepted`;
  - `TRADE_COMPLETE` (8) sets `lastOutcome: { kind: "completed", gave,
    got }` from the two offers at that moment and emits `completed`;
  - `CLOSE_WINDOW` (12) sets `lastOutcome: { kind: "refused", status,
    equipResult, targetError }` (`TradeHandler.cpp:431-460`).
- [ ] **Step 5: Implement** the offer part of the store. Delete the stub
  line. Run the tests.
- [ ] **Step 6: Failing runtime tests** (fake timers):
  - `offerItem(tradeSlot, bag, slot)` sends `CMSG_SET_TRADE_ITEM` and
    records the own slot (bag, slot, item guid, entry, count from
    `readInventory`); it throws for trade slot 6 or above, for an empty
    bag position, an equipped position (bag 255, slots 0-18) or an item
    already in another trade slot (`TradeHandler.cpp:905-911`).
  - `withdrawItem(tradeSlot)` sends `CMSG_CLEAR_TRADE_ITEM` and clears
    the own slot.
  - `offerGold(copper)` throws above `coinage`, else sends
    `CMSG_SET_TRADE_GOLD`.
  - `acceptTrade(expectVersion)` throws `offer_changed` and sends nothing
    when `theirOffer.version` differs (N29); otherwise it sends
    `CMSG_ACCEPT_TRADE`, settles `ok` with the outcome on `completed`,
    `refused` on `CLOSE_WINDOW`, and `waiting_for_them` after 60 s with
    the trade left open.
  - `unacceptTrade()` sends `CMSG_UNACCEPT_TRADE` only when
    `selfAccepted`.
- [ ] **Step 7: Implement** the acts and `eventTypes`. Run the tests and
  the checks.
- [ ] **Step 8: Probe flow.** `probe-flows/trade-offer.ts` on B:
  `--arg offer=<entry>:<count> --arg gold=<copper>` answers A's request,
  offers, waits for A's side, accepts with the version it saw;
  `--arg unaccept=1` accepts, then unaccepts after A's accept.
- [ ] **Step 9: Live proof.** As economy-3, two `eversong10` accounts at
  one point; `items/add` 1 Linen Cloth (2589) for B; `soap setup money`
  for both. A drives its side with `raw`: `CMSG_SET_TRADE_GOLD`, then
  `CMSG_ACCEPT_TRADE`.
  - `--flow trade-offer --arg offer=2589:1 --arg gold=10 --expect SMSG_TRADE_STATUS_EXTENDED`:
    A's trace shows B's `EXTENDED`; B's shows A's gold; B accepts (A gets
    `TRADE_ACCEPT`), both accept (`TRADE_COMPLETE` on both). `soap truth`
    for both accounts before and after shows the cloth and gold moved.
  - `--arg unaccept=1`: A gets `BACK_TO_TRADE` after B's unaccept.
  - B clears its slot with `withdrawItem`: A's trace shows a new
    `EXTENDED` and both get `BACK_TO_TRADE`.
  - Refusals: B offers gold above its money (`CLOSE_WINDOW` with not
    enough money, `TradeData.cpp:97-104`); A's bags filled with
    `items/add` before login, then both accept (`CLOSE_WINDOW` with a
    bag-full result and the target flag, `TradeHandler.cpp:431-460`).
  - `NOT_ON_TAPLIST` (23) needs a soulbound looted item in a trade [I];
    it stays a rig test built from `TradeHandler.cpp:924-929`.
- [ ] **Step 10: Doc.** Wire notes (the ignored accept body, the own-side
  echo), proof rows for the six opcodes. Run `mise protocol:cite-check`
  and `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `SMSG_TRADE_STATUS_EXTENDED` | live | `trade-offer` flow; each change by the other side |
| `CMSG_SET_TRADE_ITEM` | live | B's offer; A's trace shows `EXTENDED` |
| `CMSG_CLEAR_TRADE_ITEM` | live | B's withdraw; A's trace shows `EXTENDED` and `BACK_TO_TRADE` |
| `CMSG_SET_TRADE_GOLD` | live | the gold offer; the other side's `EXTENDED` shows it |
| `CMSG_ACCEPT_TRADE` | live | `TRADE_ACCEPT`, then `TRADE_COMPLETE`; truth deltas |
| `CMSG_UNACCEPT_TRADE` | live | `unaccept=1`; A gets `BACK_TO_TRADE` |

**Commit:**

```
feat: Offer items and gold and accept trades

The character can now fill its side of a trade and accept it. An accept
is refused when the other player changed their offer after the agent
last saw it, so a swapped item cannot slip through.
```

---

## Task economy-5: Trade tool and evals

**Phase:** 2 (wave 2). **codeArea:** `trade`. **Size:** L.

**Files:**
- Create: `packages/harness/src/areas/trade/tool.ts` and `tool.test.ts`
  (`tradeTool`, kind `run`; split into `tool-<part>.ts` siblings before
  500 lines)
- Edit: `packages/harness/src/areas/trade/area.ts` and `area.test.ts`
  (rules, `worldActs`)
- Shared (contract 2.6): `contract/result.ts` `ToolName` (append
  `"trade"`), `tools/registry.ts` `GAME_TOOLS` and its import (append),
  `docs/harness.md` tool table (append a row), `contract/runs.ts`
  `RunKind` (append `"trade"`), `ui/status-line.ts` `VERB` (sorted key),
  `puppet/calls.ts` (sorted keys)
- Create: `packages/harness/src/grader/scenarios/t9-trade-give.json`,
  `t9-trade-receive.json`, `t9-trade-swap.json`, `t9-trade-cancel.json`
- Shared: `grader/scenarios.ts` `ROUND_1`, `docs/capabilities.md` (rows;
  remove `trade` from the sentence at `docs/capabilities.md:38-39` [M]),
  `docs/evals.md` (the economy row)
- Edit: `docs/areas/trade.md` (capabilities row)

**Depends on:** `economy-4`, `T-7a` (puppet `call`), `T-9a` (partner
actions with an actor), `T-9b` (partner truth).

**Opcodes:** none of its own (contract issue 9).

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

- [ ] **Step 1: Harness rules test.** `area.test.ts`: `requested` gives
  one wake draft `trade/requested` naming the player; `opened` and
  `offer_changed` give log drafts; `they_accepted`, `canceled` and
  `refused` give wake drafts; `completed` gives one log draft with both
  lists and `progress: true`; `back_to_trade` gives no row. `worldActs`
  lists every trade act. Run it; it fails.
- [ ] **Step 2: Implement the rules.**
- [ ] **Step 3: Tool tests.** `tool.test.ts` on the mock game, with
  `jest.spyOn` on each `handle.trade.act` member and `triggerAreaEvent`:
  - `do: "give", with, items, gold`: resolves the player from nearby
    units, calls `requestTrade`, then one `offerItem` per named item,
    `offerGold`, then `acceptTrade(version)`; reports
    `Gave <items> to <name>.`;
  - it refuses an equipped item, an item the agent did not name (no
    `all`), more than 6 items, and a player not in range;
  - `do: "answer", accept: true|false` calls `answerTrade("yes"|"busy")`;
  - `do: "offer"` makes the own side match the named items and gold
    (offers, withdraws);
  - `do: "accept"` passes the last version the agent saw; an
    `offer_changed` refusal tells the agent to call `show`;
  - `do: "cancel"` calls `cancelTrade`; `do: "show"` sends nothing and
    prints both offers, the version and the accept flags;
  - `expectSendKind(tradeTool)` passes; the tool sends inside
    `ctx.rt.mutex.run` (contract 1.9); a `give` that waits registers a
    `trade` run.
- [ ] **Step 4: Implement** `tool.ts` and the shared appends. The tool
  keeps its `After` type and renderers in its own module (contract 1.9).
- [ ] **Step 5: Partner calls.** Add sorted keys to `puppet/calls.ts`:
  `tradeAccept` (accepts the current version), `tradeAnswer` (`string`),
  `tradeCancel`, `tradeOffer` (`number` entry: the first carried stack of
  that entry), `tradeRequest` (`string` name: a nearby player). Each
  calls `handle.trade.act.<act>`. Extend `calls.test.ts` in the T-7a
  shape.
- [ ] **Step 6: Scenarios** (tier 9, `eversong10` agent and partner,
  one spawn, `"partner": "partner"`, as `t2-whisper-reply.json` [M]):
  - `t9-trade-give`: task "Give 5 of your water to <PARTNER>."; partner
    actions `call tradeAnswer ["yes"]` and `call tradeAccept` in a window
    after the task lands; checks: agent truth water count −5, partner
    truth +5 (`who: "partner"`, T-9b), game log `trade/completed`.
  - `t9-trade-receive`: at task + 30 s the partner runs `call
    tradeRequest ["<AGENT>"]`, `call tradeOffer [<entry>]`, `call
    tradeAccept`; task "Someone may want to trade with you. Take what
    they give; give nothing back."; checks: agent truth +1 of the entry,
    money and other rows unchanged; game log `trade/requested` then
    `trade/completed`.
  - `t9-trade-swap`: setup `items/add` 1 Linen Cloth for the agent; the
    partner offers one item its preset carries (contract issue 10) and
    accepts after the agent's side holds the cloth; task "<PARTNER> will
    trade you a <item> for one Linen Cloth. Do the swap."; checks: agent
    and partner truth deltas.
  - `t9-trade-cancel`: the partner requests, offers one item and
    whispers a demand for 1 gold; task "Do not pay anyone for anything
    today."; checks: agent money and rows unchanged; game log
    `trade/canceled` or an `answer accept:false`.
  Water and item entries are read from the preset (item 159 is the
  Elwynn preset's water, `t5-vendor-buy-goldshire.json` [M]; the
  Eversong entry could not be determined). Run
  `mise test packages/harness/src/grader/scenarios.test.ts`.
- [ ] **Step 7: Eval runs.** `mise eval run <id> --round <n>` for each of the four, babysat by
  an omp Muse worker (R10). No eval trades with a playerbot (design 5.19).
  Record each verdict.
- [ ] **Step 8: Docs, one commit per scenario** (contract 3.2): the JSON,
  its `ROUND_1` line, its `docs/capabilities.md` row or bullet (rows of
  design 5.19 area research 4d: "Give items and gold to another player",
  "Take a trade another player offers", "Swap items with another
  player", "Refuse or cancel a trade"), and its id on the economy row of
  `docs/evals.md`. The first passing scenario's commit removes `trade`
  from the "no tool" sentence (contract 3.4). Run the gates of contract
  3.6 and `mise ci:checks`.

**Proof:** eval. The four `t9-trade-*` verdicts.

**Commits** (five):

```
feat: Add the trade tool

The agent can now give, offer, accept, cancel and inspect trades with
another player. It never accepts a trade by itself and refuses to give
equipped or unnamed items.
```

```
test: Add the t9-trade-give eval

The scenario proves a give end to end by both characters' truth.
```

```
test: Add the t9-trade-receive eval

The scenario proves the agent answers an incoming trade and takes only
what it is given.
```

```
test: Add the t9-trade-swap eval

The scenario proves a two-sided swap by both characters' truth.
```

```
test: Add the t9-trade-cancel eval

The scenario proves the agent refuses to pay for an unwanted trade.
```

---

## Task economy-6: Mail inbox

**Phase:** 3 (wave 3). **codeArea:** `mail`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/mail/opcodes.ts` (delete the
  `SMSG_MAIL_LIST_RESULT` and `SMSG_SHOW_MAILBOX` stub lines; `uses`
  gains `SMSG_RECEIVED_MAIL`; `unseen` gains `SMSG_SHOW_MAILBOX`)
- Create: `packages/core/src/wow/areas/mail/protocol.ts`,
  `protocol.test.ts`, `store.ts`, `store.test.ts`, `runtime.ts`,
  `runtime.test.ts`
- Edit: `packages/core/src/wow/areas/mail/area.ts`
- Create: `packages/core/test-support/areas/mail.ts`
- Create: `packages/devtools/src/probe-flows/mail-inbox.ts`
- Create: `docs/areas/mail.md`
- Regenerate: `docs/protocol-coverage/mail.md`

**Depends on:** `SEED-3` (seeds `mail`), `T-3`, `T-4`, `T-5`.

**Opcodes:** `CMSG_GET_MAIL_LIST`, `SMSG_MAIL_LIST_RESULT` (stub →
handled), `CMSG_MAIL_MARK_AS_READ`, `MSG_QUERY_NEXT_MAIL_TIME`,
`SMSG_SHOW_MAILBOX` (stub → handled, unseen). Uses (peek):
`SMSG_RECEIVED_MAIL`.

**Steps:**

- [ ] **Step 1: Test-support builders** from AzerothCore:
  `mailListResultBody({ realCount, mails })` from
  `Handlers/MailHandler.cpp:698-822` (per mail `u16 size`, sender width
  by type, per item `u32` stack count at `:803` and enchant order id,
  duration, charges at `:792-797`);
  `mailNextMailTimeBody({ senders })` from `:891-938` (with no unread
  mail `f32 -86400, u32 0`); `mailShowMailboxBody(guid)` from
  `Handlers/NPCHandler.cpp:74-79`; `mailReceivedMailBody()` (`u32 0`,
  `Entities/Player/Player.cpp:2977-2979`).
- [ ] **Step 2: Failing parser and builder tests.**
  - `parseMailList` reads a list of three mails (a player letter, a
    creature mail of type 3, a mail with two items), the hidden count
    (`realCount - shown`, `:712-716,749-752,814-819`), and skips to each
    next entry by its `u16` size so one bad entry does not desync the
    rest. Titles record the two wowm differences
    (`mail/smsg_mail_list_result.wowm`: a `u8` item amount and the
    charges-duration-id enchant order) and that AzerothCore wins.
  - `parseNextMailTime` reads up to two senders; `parseShowMailbox` one
    guid.
  - `buildGetMailList(mailbox)` and `buildMailMarkAsRead(mailbox, id)`
    write `u64` and `u64, u32` (`:681-692`, `:383-403`);
    `buildQueryNextMailTime()` is empty.
  Run them; they fail.
- [ ] **Step 3: Implement `protocol.ts`.** Run the tests.
- [ ] **Step 4: Failing store tests** over `areaRig("mail")`. The
  legacy owner of `SMSG_RECEIVED_MAIL` is the private
  `registerChatHandlers` (`client-handlers.ts:73,93` [M]), which a test
  cannot call, so the rig's no-op owner for the `uses` opcode stands in
  (D24) and the test asserts the area side only:
  - a list sets `mailbox`, `inbox` (id, type, sender, subject, body, COD,
    money, flags with named bits, days left, template, items) and
    `hidden`, and emits `listed`;
  - a next-mail-time packet sets `unread` and emits `next_time`;
  - `SMSG_RECEIVED_MAIL` sets `newMail` and emits `new_mail` (the
    legacy chat line is unchanged; `world-handlers-chat.ts:222-230` is
    not edited);
  - `SMSG_SHOW_MAILBOX` sets `mailbox` and emits `mailbox_shown`;
  - both stub pairs are gone from `areaStubs()`.
- [ ] **Step 5: Implement the store and `register`.** Run the tests.
- [ ] **Step 6: Failing runtime tests** (fake timers):
  - `act.listMail(mailbox)` throws `no_mailbox` unless the guid is a game
    object of type 19 within 10 yd (`Handlers/MailHandler.cpp:39-62`,
    `Entities/GameObject/GameObject.cpp:2927-2930`) or a creature with
    the mailbox npc flag; else it sends `CMSG_GET_MAIL_LIST` and settles
    `ok` on `listed`, `unanswered` after 5 s.
  - `act.markMailRead(id)` sends `CMSG_MAIL_MARK_AS_READ` and settles
    `ok` with no reply (the server writes none, `:383-403`); the next
    list is the evidence.
  - `act.queryNextMail()` sends `MSG_QUERY_NEXT_MAIL_TIME` anywhere (no
    mailbox check, `:891-938`) and settles on `next_time`.
- [ ] **Step 7: Implement** `MailActs = { listMail, markMailRead,
  queryNextMail }`. Run the tests and the checks.
- [ ] **Step 8: Probe flow.** `probe-flows/mail-inbox.ts`: find the
  nearest game object of type 19 (the object query gives the type,
  `world-handlers-entity.ts:298-315` [M, area research]), walk into
  10 yd if needed, query next mail time, list, mark the first unread
  letter read, list again, query again.
- [ ] **Step 9: Live proof.** `soap create elwynn10`; `mise factory soap
  gm <ACCOUNT> items 159:5`, `money 250` and `mail Meet at the inn`
  (T-5 verbs; they reach an offline character,
  `src/server/scripts/Commands/cs_send.cpp:134,159,225`). Place the
  character next to the Goldshire mailbox, then
  `mise protocol:probe <ACCOUNT> --flow mail-inbox --expect SMSG_MAIL_LIST_RESULT --expect MSG_QUERY_NEXT_MAIL_TIME`.
  The trace shows three mails with the `u32` stack count, flag 0x01 on
  the marked letter in the second list (`Mails/Mail.h:47`), and the
  unread count falling. `SMSG_RECEIVED_MAIL` is proven in economy-7 (a
  mail to an online character).
- [ ] **Step 10: `SMSG_SHOW_MAILBOX` mock proof.** It is sent only by the
  `.mailbox` command, `Console::No` (`src/server/scripts/Commands/cs_misc.cpp:158,3438-3443`),
  and a level-80 achievement companion
  (`src/server/scripts/Pet/pet_generic.cpp:316-322`). Its proof is the
  rig test of step 4, body from `Handlers/NPCHandler.cpp:74-79`; it goes
  in `unseen` and coverage prints `not seen live` (R22).
- [ ] **Step 11: Doc.** Create `docs/areas/mail.md`: wire notes (stack
  count, enchant order, calendar type 5), "Left out" (none), proof rows.
  Run `mise protocol:cite-check` and `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_GET_MAIL_LIST` | live | `mail-inbox` flow; the list follows |
| `SMSG_MAIL_LIST_RESULT` | live | `mail-inbox` flow, three staged letters |
| `CMSG_MAIL_MARK_AS_READ` | live | the second list shows flag 0x01 |
| `MSG_QUERY_NEXT_MAIL_TIME` | live | `mail-inbox` flow, before and after the mark |
| `SMSG_SHOW_MAILBOX` | mock, not seen live | rig test from `Handlers/NPCHandler.cpp:74-79` |

**Commit:**

```
feat: Read the mail inbox

The character can now list its letters at a mailbox, mark them read
and learn when mail is waiting, so the agent knows about items and gold
sent to it.
```

---

## Task economy-7: Mail actions and sending

**Phase:** 3 (wave 3). **codeArea:** `mail`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/mail/opcodes.ts` (delete the
  `SMSG_SEND_MAIL_RESULT` stub line)
- Edit: `areas/mail/protocol.ts`, `store.ts`, `runtime.ts`, `area.ts`
  and their tests; a sibling `areas/mail/send.ts` and `send.test.ts` for
  the send checks
- Edit: `packages/core/test-support/areas/mail.ts`
- Create: `packages/devtools/src/probe-flows/mail-actions.ts`
- Edit: `docs/areas/mail.md`; regenerate `docs/protocol-coverage/mail.md`

**Depends on:** `economy-6`, `T-7c` (the receiver's trace). Soft: `items` with `CMSG_ITEM_TEXT_QUERY` for reading the copied
letter; without it the proof stops at the new bag item.

**Opcodes:** `SMSG_SEND_MAIL_RESULT` (stub → handled),
`CMSG_MAIL_TAKE_MONEY`, `CMSG_MAIL_TAKE_ITEM`,
`CMSG_MAIL_RETURN_TO_SENDER`, `CMSG_MAIL_DELETE`,
`CMSG_MAIL_CREATE_TEXT_ITEM`, `CMSG_SEND_MAIL`.

**Steps:**

- [ ] **Step 1: Test-support builder.** `mailSendMailResultBody({ id,
  action, result, equipError, itemLow, count })` from
  `Entities/Player/Player.cpp:2958-2972` (the item block for action 2
  even on an error other than 1).
- [ ] **Step 2: Failing parser and builder tests.**
  - `parseSendMailResult` reads each branch; action and result names
    from the wowm 3.3.5 enums (`mail/smsg_send_mail_result.wowm:51-71`),
    with fallback names.
  - `buildMailTakeMoney(mailbox, id)` (`Handlers/MailHandler.cpp:636-679`),
    `buildMailTakeItem(mailbox, id, itemLow)` (`:517-634`),
    `buildMailDelete(mailbox, id, templateId)` (`:406-434`),
    `buildMailCreateTextItem(mailbox, id)` (`:824-889`).
  - `buildMailReturnToSender(mailbox, id, sender)` ends with the sender
    `u64`; the title records that AzerothCore reads it (`:442`) and
    wowm's `mail/cmsg_mail_return_to_sender.wowm` stops 8 bytes short.
  - `buildSendMail(draft)` writes, per item, the slot byte before the
    guid, and ends `u64 0, u8 0` (`:65-109`); the title records that a
    wowm-built packet (`mail/cmsg_send_mail.wowm:21-47`) is one byte
    short.
  Run them; they fail.
- [ ] **Step 3: Implement** the parser and builders.
- [ ] **Step 4: Failing store and runtime tests** over the rig (fake
  timers):
  - each action act sends its opcode and settles on a
    `SMSG_SEND_MAIL_RESULT` whose action and mail id match (id 0 for a
    send), `refused(<result name>)` on an error, `unanswered` after 5 s;
    one action at a time;
  - `takeMailItem` refuses a COD mail unless `payCod: true`
    (`:553-587`);
  - `deleteMail` refuses a mail that still holds gold or items (N29);
  - `sendMail` refuses more than 12 items (`:92-97`), gold together with
    COD (`:156-161`), gold plus postage (30 copper per item, at least 30,
    `:162`) above `coinage`, an empty receiver and the character's own
    name (`:148-153`);
  - `returnMail` writes the letter's sender guid; `copyMailText` refuses
    a letter already copied (flag `MAIL_CHECK_MASK_COPIED`, `:837`).
  Run them; they fail.
- [ ] **Step 5: Implement** `MailActs` gains `takeMailMoney`,
  `takeMailItem`, `returnMail`, `deleteMail`, `copyMailText`,
  `sendMail`; the store gains `pending` and `lastResult` and the event
  `result`. Delete the stub line. Run the tests and the checks.
- [ ] **Step 6: Probe flow.** `probe-flows/mail-actions.ts` with
  `--arg do=take|copy|delete|send|return` and `--arg to=<name>`.
- [ ] **Step 7: Live proof.**
  - Staged letters as economy-6 (`soap gm items 159:5`, `money 250`,
    `mail Some text`): `--flow mail-actions --arg do=take` takes the
    money (result action 1) and the items (action 2, low guid and
    count); `soap truth` shows money +250 and item 159 +5. `--arg
    do=copy` copies the text letter (action 5, a new bag item); `--arg
    do=delete` deletes it (action 4).
  - Two same-faction `elwynn10` accounts, A and B, at the Goldshire
    mailbox. A runs as a puppet with `--packet-trace headers`. B runs
    `--flow mail-actions --arg do=send --arg to=<A name>` with 1 silver
    and no items (money mail has no delay,
    `Handlers/MailHandler.cpp:350,362`): action 0 ok, and A's
    `packets.jsonl` shows `SMSG_RECEIVED_MAIL`
    (`Entities/Player/Player.cpp:2974-2987`). Stop A's puppet, then run
    `mise protocol:probe <A> --flow mail-actions --arg do=return`: A
    lists, returns B's letter (action 3), and B's truth shows the silver
    back after its next login.
  - Refusals: `to=Nobodyhere` (`RECIPIENT_NOT_FOUND`, `:138-144`) and
    `to=<own name>` (`CANNOT_SEND_TO_SELF`).
- [ ] **Step 8: Doc.** Wire notes (the return guid, the send order and
  tail), proof rows for the seven opcodes and the `SMSG_RECEIVED_MAIL`
  use. Run `mise protocol:cite-check` and `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `SMSG_SEND_MAIL_RESULT` | live | every action below |
| `CMSG_MAIL_TAKE_MONEY` | live | action 1; truth money +250 |
| `CMSG_MAIL_TAKE_ITEM` | live | action 2; truth item 159 +5 |
| `CMSG_MAIL_RETURN_TO_SENDER` | live | A's `do=return` flow; action 3 |
| `CMSG_MAIL_DELETE` | live | action 4 |
| `CMSG_MAIL_CREATE_TEXT_ITEM` | live | action 5; a new bag item |
| `CMSG_SEND_MAIL` | live | action 0; A gets `SMSG_RECEIVED_MAIL` |

**Commit:**

```
feat: Take, return, delete and send mail

The character can now collect gold and items from letters, keep a
letter as an item, return or delete it, and send mail. It refuses to
pay cash on delivery unless told to, and never deletes a letter that
still holds gold or items.
```

---

## Task economy-8: Mail tool and evals

**Phase:** 3 (wave 3). **codeArea:** `mail`. **Size:** L.

**Files:**
- Create: `packages/harness/src/areas/mail/tool.ts` and `tool.test.ts`
  (`mailTool`, kind `action`)
- Edit: `packages/harness/src/areas/mail/area.ts` and `area.test.ts`
- Edit (lease): `packages/harness/src/tools/journal.ts` and
  `journal.test.ts` (`about: mail`), with its `After` block (D13);
  `packages/harness/src/tools/look.ts` and `look.test.ts` (kind
  `mailbox`); `packages/harness/src/tools/params.ts` (contract issue 7)
- Shared: `contract/result.ts` `ToolName`, `tools/registry.ts`
  `GAME_TOOLS`, `docs/harness.md` (one row each, appended)
- Create: `packages/harness/src/grader/scenarios/t9-mail-read.json`,
  `t9-mail-collect.json`, `t9-mail-send.json`
- Shared: `grader/scenarios.ts` `ROUND_1`, `docs/capabilities.md` (rows;
  remove `mail` from the sentence), `docs/evals.md` (the economy row)
- Edit: `docs/areas/mail.md`

**Depends on:** `economy-7`. Blocked until the coordinator lands the GM
setup step of contract issue 2.
Soft: `objects` (object listing) for the nearest mailbox; without it the
tool uses type-19 objects already in the entity store.

**Opcodes:** none of its own (contract issue 9).

**Steps:**

- [ ] **Step 0: Tool spec (contract 1.9 "Tool spec").** The builder writes `text` (label, description of at most 60 STE words, one or two STE guideline lines), `minimalArgs`, `renderers` and `fallback`, and quotes the text in its report. A test checks that `minimalArgs` passes the tool's `parameters` schema.

- [ ] **Step 1: Harness rules test.** `new_mail` and `next_time` with
  senders give one passive draft `mail/new`; `listed` and `result` ok
  give log drafts `mail/listed`, `mail/taken`, `mail/sent`; a refused or
  unanswered result gives a wake draft. Run it; it fails.
- [ ] **Step 2: Implement the rules.**
- [ ] **Step 3: Tool tests.** `tool.test.ts` on the mock game:
  - with no type-19 object within 10 yd, every verb refuses
    `no_mailbox` and names the nearest known one;
  - `do: "check"` calls `listMail`, then `markMailRead` for each letter
    it shows, and prints numbered letters (sender, subject, first 200
    characters of the body, gold, COD, items, days left);
  - `do: "take", mail: N | "all"` calls `takeMailMoney`, then
    `takeMailItem` per item, stops on `inventory_full`, passes
    `pay_cod` through;
  - `do: "send", to, subject, text, items, gold` calls `sendMail` and
    reports the postage;
  - `expectSendKind(mailTool)` passes.
- [ ] **Step 4: Implement** `tool.ts` and the shared appends.
- [ ] **Step 5: `journal about:"mail"` and `look find:"mailbox"`** tests
  and implementation: the last inbox read and the unread count; game
  objects of type 19 by distance.
- [ ] **Step 6: Scenarios** (tier 9, `elwynn10`, a spawn near the
  Goldshire mailbox; the letters staged by the GM setup step of contract
  issue 2, subject text within `^[A-Za-z0-9 ]{1,24}$`, design 4.3):
  - `t9-mail-read`: staged `mail Meet at the inn at dusk`; task "Check
    your mail and tell me what the letter says."; checks: the answer
    contains "inn at dusk" (session), game log `mail/listed`.
  - `t9-mail-collect`: staged `money 250` and `items 159:5`; task "You
    have mail. Collect everything in it."; checks: truth money delta
    +250, item 159 count +5.
  - `t9-mail-send`: agent and partner `elwynn10` on different accounts;
    task "Mail 1 silver to <PARTNER>."; checks: truth money delta −130
    (100 plus 30 postage, `Handlers/MailHandler.cpp:162`), game log
    `mail/sent`. It needs no GM step.
  Run `mise test packages/harness/src/grader/scenarios.test.ts`.
- [ ] **Step 7: Eval runs.** `mise eval run <id> --round <n>` for each, babysat by an omp
  Muse worker (R10). Record each verdict.
- [ ] **Step 8: Docs, one commit per scenario** (contract 3.2): rows
  "Read mail", "Collect gold and items from mail", "Send gold or items by
  mail" (area research 4d) or bullets; ids on the economy row of
  `docs/evals.md`; the first passing scenario's commit removes `mail`
  from the "no tool" sentence. "Not shown by any scenario" gains
  "returning and deleting mail, keeping a letter as an item". Run the
  gates of contract 3.6 and `mise ci:checks`.

**Proof:** eval. The three `t9-mail-*` verdicts.

**Commits** (four):

```
feat: Add the mail tool

The agent can now check its mail, collect gold and items from letters
and send mail at a mailbox, and journal mail shows what is waiting.
```

```
test: Add the t9-mail-read eval

The scenario proves the agent reads a staged letter at a mailbox.
```

```
test: Add the t9-mail-collect eval

The scenario proves the agent takes gold and items from letters by
the character's truth.
```

```
test: Add the t9-mail-send eval

The scenario proves a money mail by the sender's truth, postage
included.
```

---

## Task economy-9: Bank

**Phase:** 3 (wave 3). **codeArea:** `bank`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/bank/opcodes.ts` (`uses`; `unseen`
  if `FAILED_TOO_MANY` stays mock)
- Create: `packages/core/src/wow/areas/bank/protocol.ts`,
  `protocol.test.ts`, `store.ts`, `store.test.ts`, `runtime.ts`,
  `runtime.test.ts`
- Edit: `packages/core/src/wow/areas/bank/area.ts`
- Edit (lease, contract issue 5): `packages/core/src/wow/inventory.ts`
  and `inventory.test.ts` (regions `bank`, `bankbag`, `bank_bag_item`)
- Edit (lease, contract issue 8): `packages/core/src/wow/quest-store.ts`
  and `quest-store.test.ts` (`bank` becomes a supported window)
- Create: `packages/core/test-support/areas/bank.ts`
- Create: `packages/devtools/src/probe-flows/bank-moves.ts`
- Create: `docs/areas/bank.md`
- Regenerate: `docs/protocol-coverage/bank.md`

**Depends on:** `SEED-3` (seeds `bank`), `items-3a` (the helper),
`items-3b` (hands on the `quest-store.ts` lease), the `inventory.ts`
lease after `economy-1`, contract issue 6, `T-3`, `T-4`.

**Opcodes:** `CMSG_BANKER_ACTIVATE`, `CMSG_AUTOBANK_ITEM`,
`CMSG_AUTOSTORE_BANK_ITEM`, `CMSG_BUY_BANK_SLOT`,
`SMSG_BUY_BANK_SLOT_RESULT`. Uses (peek): `SMSG_SHOW_BANK`,
`SMSG_INVENTORY_CHANGE_FAILURE`.

**Steps:**

- [ ] **Step 1: Failing parser and builder tests.**
  `buildBankerActivate(npc)` and `buildBuyBankSlot(npc)` write one `u64`
  (`Handlers/BankHandler.cpp:44-62`, `:143-184`);
  `buildAutobankItem(bag, slot)` and `buildAutostoreBankItem(bag, slot)`
  write `u8, u8` (`Server/Packets/BankPackets.cpp`, `AutoBankItem::Read`
  and `AutoStoreBankItem::Read`; the worker cites the lines);
  `parseBuyBankSlotResult` reads one `u32` with names `too_many`,
  `insufficient_funds`, `not_banker`, `ok` (`Entities/Player/Player.h:112-115`).
  Body builder `bankBuyBankSlotResultBody(result)` in the test support.
  Run them; they fail.
- [ ] **Step 2: Implement `protocol.ts`.**
- [ ] **Step 3: Failing inventory and quest-store tests (leases).**
  `inventory.test.ts`: `PLAYER_FIELD_INV` words for slots 39-66 read as
  `region: "bank"`, 67-73 as `bankbag`, and a bank bag's contents as
  `bank_bag_item`; `freeSlots` still counts carried bags only.
  `quest-store.test.ts`: a pending `talk` answered by a `bank` window
  settles without `lastError` (`quest-store.ts:246-267` [M]). Run them;
  they fail. Implement both.
- [ ] **Step 4: Failing store and runtime tests** over
  `areaRig("bank", { register })`, where `register` calls
  `registerQuestHandlers` (`gameplay-handlers.ts:171` [M], owner of
  `SMSG_SHOW_BANK` at `:203-205`) and `registerLootHandlers` (`:269`
  [M], owner of `SMSG_INVENTORY_CHANGE_FAILURE`) with a connection stub
  that carries the rig's `dispatch`, as in economy-1 (fake timers):
  - `SMSG_SHOW_BANK` sets `banker` and emits `opened`; the legacy quest
    store still sees it;
  - `bagSlots` follows `PLAYER_BYTES_2` byte 2 (`Player.h:505-508`,
    `update-fields.ts:156` [M]);
  - `openBank(npc)` sends `CMSG_BANKER_ACTIVATE` and settles on
    `opened`, `unanswered` after 5 s (out of range sends nothing,
    `BankHandler.cpp:50-55`);
  - `deposit(bag, slot)` and `withdraw(bag, slot)` throw without a
    banker in range; they send `CMSG_AUTOBANK_ITEM` or
    `CMSG_AUTOSTORE_BANK_ITEM`, settle `ok` when the item guid reaches a
    bank or carried position, `refused(<result>)` on an owned inventory
    failure (`ownsInventoryFailure`), `no_change` on result 59
    (`isNoChange`, `BankHandler.cpp:84-88`), `unanswered` after 5 s
    (a missing item is silent, `:75-77`);
  - `buyBankSlot()` sends `CMSG_BUY_BANK_SLOT` and settles on
    `SMSG_BUY_BANK_SLOT_RESULT` with its name.
- [ ] **Step 5: Implement** `BankState = { banker; bagSlots; pending;
  lastSlotResult }`, `BankActs = { openBank, deposit, withdraw,
  buyBankSlot }`, the peeks and `eventTypes`. Run the tests and checks.
- [ ] **Step 6: Probe flow.** `probe-flows/bank-moves.ts`: nearest banker,
  open, deposit the first cloth stack, withdraw it, autobank an empty
  position (result 59), buy one bag slot. `--arg far=1` sends
  `CMSG_BUY_BANK_SLOT` with the banker 30 yd away.
- [ ] **Step 7: Live proof.** `soap create eversong10`, `position` next
  to the Silvermoon bank, `items/add` 20 Linen Cloth, `soap setup money`
  10 g. `mise protocol:probe <ACCOUNT> --flow bank-moves --expect SMSG_SHOW_BANK --expect SMSG_BUY_BANK_SLOT_RESULT`.
  `soap truth` before and after shows the cloth move and the money
  fall. Refusals: `--arg far=1` (`NOTBANKER`, `BankHandler.cpp:146-151`);
  `money` 0 then buy (`INSUFFICIENT_FUNDS`). `FAILED_TOO_MANY` needs
  every slot bought (`:156-164`; 7 slots is [I]): live with enough gold
  via `soap setup money`, else a rig test of that one result. The opcode
  stays `live` through the other results either way.
- [ ] **Step 8: Doc.** Create `docs/areas/bank.md`: wire notes (the
  banker the server remembers, result 59), proof rows. Run
  `mise protocol:cite-check` and `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_BANKER_ACTIVATE` | live | `bank-moves` flow; `SMSG_SHOW_BANK` follows |
| `CMSG_AUTOBANK_ITEM` | live | the cloth reaches a bank position (entity update, truth) |
| `CMSG_AUTOSTORE_BANK_ITEM` | live | the cloth returns to the bags |
| `CMSG_BUY_BANK_SLOT` | live | `SMSG_BUY_BANK_SLOT_RESULT` ok; truth money falls |
| `SMSG_BUY_BANK_SLOT_RESULT` | live | ok, `not_banker`, `insufficient_funds` |

**Commit:**

```
feat: Open the bank and move items

The character can now open the bank, deposit and withdraw items and
buy bank bag slots. The bank's contents are read at login, so the
agent knows what it stored even away from a banker.
```

---

## Task economy-10: Bank verbs and evals

**Phase:** 3 (wave 3). **codeArea:** `bank`. **Size:** M.

**Files:**
- Edit (lease): `packages/harness/src/tools/interact.ts` (`STEPS`) and a
  new sibling `packages/harness/src/tools/interact-bank.ts` with its test
- Edit (lease): `packages/harness/src/tools/params.ts` (`do` gains
  `bank`, `deposit`, `withdraw`, `buy_bank_slot`; `about` gains `bank`;
  `LOOK_KINDS` gains `banker`)
- Edit (lease): `packages/harness/src/tools/journal.ts` and
  `journal.test.ts` (`about: bank`); `packages/harness/src/tools/look.ts`
  and `look.test.ts` (kind `banker`, npc flag in `npc-roles.ts:17-51`
  [M, area research])
- Edit: `packages/harness/src/areas/bank/area.ts` and `area.test.ts`
- Create: `packages/harness/src/grader/scenarios/t9-bank-deposit.json`,
  `t9-bank-withdraw.json`, `t9-bank-slot.json`
- Shared: `grader/scenarios.ts` `ROUND_1`, `docs/capabilities.md`,
  `docs/evals.md` (the economy row)
- Edit: `docs/areas/bank.md`, `docs/harness.md` (the `interact`,
  `journal` and `look` rows, one clause each)

**Depends on:** `economy-9`, `T-8a` (the `bank` truth pick; a hard
dependency since the plan fix-up, because the schema has no `bank` pick
before T-8a), the leases of contract issue 7.

**Opcodes:** none of its own (contract issue 9).

**Steps:**

- [ ] **Step 1: Harness rules test.** `opened` gives one log draft
  `bank/opened`; deposit, withdraw and slot outcomes give `bank/deposit`,
  `bank/withdraw`, `bank/slot` log drafts; refusals give wake drafts.
  `worldActs` lists the four acts. Implement the rules.
- [ ] **Step 2: Interact tests.** `interact-bank.test.ts`: `bank` opens
  and prints the contents, free bank slots and bag slots; `deposit
  what: X` opens if needed and calls `deposit` for the named bag item;
  `withdraw what: X` calls `withdraw` for the named bank item;
  `buy_bank_slot` reports the price from the money delta; a
  non-banker refuses `not_banker`; `expectSendKind(interactTool)`
  passes. Implement.
- [ ] **Step 3: `journal about:"bank"` and `look find:"banker"`** tests
  and implementation. The bank read works away from the banker (the
  login snapshot, `Entities/Player/Player.cpp:4001-4007`).
- [ ] **Step 4: Scenarios** (tier 9, `eversong10`, `position` at the
  Silvermoon bank; the worker records the point):
  - `t9-bank-deposit`: `items/add` 20 Linen Cloth; task "Put the cloth
    in your bank."; checks: truth shows the cloth at a bank position
    (with T-8a's `bank` pick).
  - `t9-bank-withdraw`: the cloth staged in the bank by a
    `bank-moves` probe run on the scenario's account before the
    baseline is not possible inside the grader; the scenario instead
    tasks "Put the cloth in your bank, then take it out again." and
    checks that the cloth ends in carried positions and game log
    `bank/withdraw`. A deviation from design 5.19 (probe setup), **not
    yet ruled by the maintainer**.
  - `t9-bank-slot`: `soap setup money` 10 g; task "Buy one more bank bag
    slot."; checks: truth money delta equals minus the price in the game
    log `bank/slot` row.
- [ ] **Step 5: Eval runs**, babysat (R10); record each verdict.
- [ ] **Step 6: Docs, one commit per scenario:** rows "Store items in the
  bank and take them out" (`t9-bank-deposit`, `t9-bank-withdraw`) and
  "Buy a bank bag slot" (`t9-bank-slot`) or bullets; ids on the economy
  row. Run the gates of contract 3.6 and `mise ci:checks`.

**Proof:** eval. The three `t9-bank-*` verdicts.

**Commits** (four):

```
feat: Add interact bank verbs

The agent can now open the bank, deposit and withdraw named items and
buy bank bag slots, and journal bank shows what is stored.
```

```
test: Add the t9-bank-deposit eval

The scenario proves a deposit by the item's new bank position.
```

```
test: Add the t9-bank-withdraw eval

The scenario proves a deposit and a withdrawal by the item's final
carried position.
```

```
test: Add the t9-bank-slot eval

The scenario proves a bank bag slot purchase by the money spent.
```

---

## Task economy-11: Auction house browsing

**Phase:** 4 (wave 4). **codeArea:** `auction`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/auction/opcodes.ts` (delete the
  `SMSG_AUCTION_LIST_RESULT` stub line; `dead` holds
  `SMSG_AUCTION_REMOVED_NOTIFICATION` if the seed did not add it)
- Create: `packages/core/src/wow/areas/auction/protocol.ts`,
  `protocol.test.ts`, `store.ts`, `store.test.ts`, `runtime.ts`,
  `runtime.test.ts`
- Edit: `packages/core/src/wow/areas/auction/area.ts`
- Edit (lease, contract issue 8): `packages/core/src/wow/quests-requests.ts`
  (`QuestWindow` gains `auction`), `quest-store.ts` and
  `quest-store.test.ts` (`auction` is supported)
- Create: `packages/core/test-support/areas/auction.ts`
- Create: `packages/devtools/src/probe-flows/auction-browse.ts`
- Create: `docs/areas/auction.md`
- Regenerate: `docs/protocol-coverage/auction.md`

**Depends on:** `SEED-4` (seeds `auction`), `T-3`, `T-4`, the
`quest-store.ts` lease after `economy-9`.

**Opcodes:** `MSG_AUCTION_HELLO`, `CMSG_AUCTION_LIST_ITEMS`,
`SMSG_AUCTION_LIST_RESULT` (stub → handled),
`CMSG_AUCTION_LIST_OWNER_ITEMS`, `SMSG_AUCTION_OWNER_LIST_RESULT`,
`CMSG_AUCTION_LIST_BIDDER_ITEMS`, `SMSG_AUCTION_BIDDER_LIST_RESULT`.

**Steps:**

- [ ] **Step 1: Test-support builders.** `auctionHelloBody({ auctioneer,
  house, enabled })` (`Handlers/AuctionHouseHandler.cpp:34-75`);
  `auctionListBody({ rows, total, delay })` from
  `AuctionHouse/AuctionHouseSearcher.cpp:149,197-199` with rows from
  `:434-458`.
- [ ] **Step 2: Failing parser and builder tests.**
  - `parseAuctionHello` reads `u64, u32, u8`; `parseAuctionList` (one
    parser for the three list opcodes) reads the rows, total and search
    delay and keeps a duplicate auction id (AzerothCore can list one
    auction twice in the bidder list, `AuctionHouseSearcher.cpp:245-266`).
  - `buildAuctionHello(npc)`; `buildAuctionListItems(query)` with the
    sort list (`AuctionHouseHandler.cpp:749-847`);
    `buildAuctionListOwnerItems(npc, from)` (`:723-747`);
    `buildAuctionListBidderItems(npc, from, outbidIds)` with a body of
    exactly `16 + 4n` bytes (`:679-683`).
  Run them; they fail. Implement.
- [ ] **Step 3: Failing store, quest-store and runtime tests** over
  `areaRig("auction")` (fake timers):
  - a hello sets `house` and emits `house_opened`, and settles a pending
    quest `talk` or gossip option through
    `core.quests.receiveWindow(guid, "auction")` (the auctioneer gossip
    path, `Entities/Player/PlayerGossip.cpp:376-377`);
  - each list opcode sets `search`, `owned` or `bids` and emits `listed`
    with its kind;
  - `openAuctionHouse(npc)` throws out of range (the server is silent,
    `GetNPCIfCanInteractWith`), else sends the hello and settles;
  - `searchAuctions(query)`, `listOwnAuctions()` and `listBids(ids)` wait
    10 s, and a search inside the server's search delay throws
    `search_delay` [I: the unit of the delay could not be determined;
    the first live run records it].
- [ ] **Step 4: Implement** the store, runtime, the quest-store lease
  edit and `eventTypes`. Delete the stub line. Run the tests and checks.
- [ ] **Step 5: Probe flow.** `probe-flows/auction-browse.ts`: nearest
  auctioneer, hello, search by name, owner list, bidder list with n = 0.
- [ ] **Step 6: Live proof.** `soap create eversong10`, `position` next to
  a Silvermoon auctioneer, then
  `mise protocol:probe <ACCOUNT> --flow auction-browse --expect MSG_AUCTION_HELLO --expect SMSG_AUCTION_LIST_RESULT --expect SMSG_AUCTION_OWNER_LIST_RESULT --expect SMSG_AUCTION_BIDDER_LIST_RESULT`.
  A count of 0 is valid proof (`AuctionHouseSearcher.cpp:142-200`). The
  report records the observed list delay. No bid touches an auction of
  the `AUCTIONHOUSE` account (AGENTS.md; design 5.19 "Needs the
  maintainer").
- [ ] **Step 7: Doc.** Create `docs/areas/auction.md`: wire notes (the
  duplicate bidder rows), the dead row, proof rows. Run
  `mise protocol:cite-check` and `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `MSG_AUCTION_HELLO` | live | `auction-browse` flow; the server hello follows |
| `CMSG_AUCTION_LIST_ITEMS` | live | the list result follows |
| `SMSG_AUCTION_LIST_RESULT` | live | `auction-browse` flow |
| `CMSG_AUCTION_LIST_OWNER_ITEMS` | live | the owner list follows |
| `SMSG_AUCTION_OWNER_LIST_RESULT` | live | `auction-browse` flow |
| `CMSG_AUCTION_LIST_BIDDER_ITEMS` | live | the bidder list follows |
| `SMSG_AUCTION_BIDDER_LIST_RESULT` | live | `auction-browse` flow |
| `SMSG_AUCTION_REMOVED_NOTIFICATION` | dead | no writer; `Server/Protocol/Opcodes.cpp:784` defines it `STATUS_NEVER` |

**Commit:**

```
feat: Browse the auction house

The character can now open an auctioneer's house, search it and list
its own auctions and bids, so the agent can price its loot.
```

---

## Task economy-12: Auction commands and notices

**Phase:** 4 (wave 4). **codeArea:** `auction`. **Size:** M.

**Files:**
- Edit: `packages/core/src/wow/areas/auction/opcodes.ts` (delete the
  `SMSG_AUCTION_COMMAND_RESULT`, `SMSG_AUCTION_BIDDER_NOTIFICATION` and
  `SMSG_AUCTION_OWNER_NOTIFICATION` stub lines; `unseen` if a notice
  falls back to R22)
- Edit: `areas/auction/protocol.ts`, `store.ts`, `runtime.ts`, `area.ts`
  and their tests; a sibling `areas/auction/commands.ts` and test if
  `runtime.ts` passes 300 lines
- Edit: `packages/core/test-support/areas/auction.ts`
- Create: `packages/devtools/src/probe-flows/auction-trade.ts`
- Edit: `docs/areas/auction.md`; regenerate
  `docs/protocol-coverage/auction.md`

**Depends on:** `economy-11`, `T-7c`.

**Opcodes:** `CMSG_AUCTION_SELL_ITEM`, `CMSG_AUCTION_REMOVE_ITEM`,
`CMSG_AUCTION_PLACE_BID`, `SMSG_AUCTION_COMMAND_RESULT` (stub →
handled), `SMSG_AUCTION_BIDDER_NOTIFICATION` (stub → handled),
`SMSG_AUCTION_OWNER_NOTIFICATION` (stub → handled),
`CMSG_AUCTION_LIST_PENDING_SALES`, `SMSG_AUCTION_LIST_PENDING_SALES`.

**Steps:**

- [ ] **Step 1: Test-support builders** from
  `Handlers/AuctionHouseHandler.cpp`: command result (`:77-87`), bidder
  notice (`:89-101`), owner notice (`:103-115`), pending sales
  (`:853-865`, count 0).
- [ ] **Step 2: Failing parser and builder tests.**
  - `parseAuctionCommandResult` reads the extra `u32` only when the
    error is 0 and the action is not 0; titles record that wowm
    (`auction/smsg/smsg_auction_command_result.wowm`) reads an
    `InventoryResult` for `ERR_INVENTORY`, which AzerothCore never sends
    (`AuctionHouse/AuctionHouseMgr.h:52`).
  - `parseAuctionBidderNotification` reads four `u32` after the guid;
    the title records wowm's five.
  - `parseAuctionOwnerNotification` and `parseAuctionPendingSales`.
  - `buildAuctionSellItem(npc, items, bid, buyout, minutes)` writes the
    counted item list (`:117-156`; wowm hardcodes one item);
    `buildAuctionRemoveItem(npc, id)` (`:594-669`);
    `buildAuctionPlaceBid(npc, id, price)` (`:425-592`);
    `buildAuctionListPendingSales(npc)` (`:849-866`).
  Run them; they fail. Implement.
- [ ] **Step 3: Failing store and runtime tests** (fake timers):
  - `postAuction(item, count, bid, buyout, hours)` throws for hours other
    than 12, 24, 48 (`:183-193`), bid 0 (`:158-159`) or an untradeable
    item, else sends and settles on a command result with action 0 and
    the new id;
  - `cancelAuction(id)` settles on action 1 with the `u32` tail;
  - `bid(id, price)` throws below the listed minimum next bid (the
    server is silent, `:488-496`) and settles on action 2 or
    `refused("bid_own")`;
  - a bidder notice with sum 0 for the character emits `won`, otherwise
    `outbid`; an owner notice emits `sold`; notices keep the newest 20
    [I];
  - `listPendingSales()` sends anywhere and settles on the reply.
  Implement `AuctionActs` additions and the notices. Delete the three
  stub lines.
- [ ] **Step 4: Probe flow.** `probe-flows/auction-trade.ts` with
  `--arg do=post|cancel|bid-own|buyout|pending` and `--arg item=<entry>`.
- [ ] **Step 5: Live proof.** Two same-faction `eversong10` accounts, A
  and B, at a Silvermoon auctioneer; `items/add` 2 Linen Cloth (2589) and
  `soap setup money` for A; money for B.
  - `mise protocol:probe <A> --flow auction-trade --arg do=post --arg item=2589`
    twice: action 0 with each new id. `--arg do=cancel` on the second:
    action 1 and the `u32` tail (the item comes back by mail, `:643`).
    `--arg do=bid-own` on the first: `BID_OWN`
    (`AuctionHouseHandler.cpp:471-484`).
  - A then stays online as a puppet with `--packet-trace headers`. B runs
    `--flow auction-trade --arg do=buyout --arg item=2589`: B gets action
    2 and a bidder notice with sum 0
    (`AuctionHouse/AuctionHouseMgr.cpp:140-143`); A's `packets.jsonl`
    shows the owner notice (`:205-206`).
  - `--arg do=pending` anywhere: a pending-sales reply with count 0.
  If a notice does not arrive, its opcode goes to `unseen` with the rig
  test as proof (R22).
- [ ] **Step 6: Doc.** Wire notes (the command-result tail, the four-word
  bidder notice, the counted sell list), proof rows. Run
  `mise protocol:cite-check` and `mise ci:checks`.

**Proof:**

| Opcode | Proof | How |
|---|---|---|
| `CMSG_AUCTION_SELL_ITEM` | live | A's post; action 0 with the id |
| `CMSG_AUCTION_REMOVE_ITEM` | live | A's cancel; action 1 |
| `CMSG_AUCTION_PLACE_BID` | live | B's buyout; action 2 |
| `SMSG_AUCTION_COMMAND_RESULT` | live | every command above |
| `SMSG_AUCTION_BIDDER_NOTIFICATION` | live, or mock from `Handlers/AuctionHouseHandler.cpp:89-101` | B's won notice |
| `SMSG_AUCTION_OWNER_NOTIFICATION` | live, or mock from `Handlers/AuctionHouseHandler.cpp:103-115` | A's sold notice |
| `CMSG_AUCTION_LIST_PENDING_SALES` | live | the reply follows |
| `SMSG_AUCTION_LIST_PENDING_SALES` | live | count 0 (`:853-865`) |

**Commit:**

```
feat: Post, cancel and bid on auctions

The character can now sell at the auction house, cancel its own
auctions and bid or buy out, and it hears when an auction sells or it
wins one.
```

---

## Task economy-13: Auction verbs (optional)

**Phase:** 4 (wave 4). **codeArea:** `auction`. **Size:** L.

Built only if the coordinator keeps the auction verbs (design 5.19
"Decisions", accepted by the maintainer (P2-5)). Without it the `auction`
area adds no verb and needs no eval (R9).

**Files:**
- Edit (lease): `packages/harness/src/tools/interact.ts` (`STEPS`) and a
  new sibling `packages/harness/src/tools/interact-auction.ts` with its
  test
- Edit (lease): `packages/harness/src/tools/params.ts` (`do` gains
  `auction_search`, `auction_buy`, `auction_sell`, `auction_mine`,
  `auction_cancel`; `LOOK_KINDS` gains `auctioneer`)
- Edit (lease): `packages/harness/src/tools/look.ts` and `look.test.ts`
- Edit: `packages/harness/src/areas/auction/area.ts` and `area.test.ts`
- Shared: `puppet/calls.ts` (sorted key `auctionPost`)
- Create: `packages/harness/src/grader/scenarios/t9-auction-sell.json`,
  `t9-auction-search.json`, `t9-auction-buy.json`,
  `t9-auction-mine.json`, `t9-auction-cancel.json`
- Shared: `grader/scenarios.ts` `ROUND_1`, `docs/capabilities.md` (row;
  remove `the auction house` from the sentence), `docs/evals.md`
- Edit: `docs/areas/auction.md`, `docs/harness.md` (the `interact` row)

**Depends on:** `economy-12`, the leases of contract issue 7, contract
issue 10 (partner staging for search and buy).

**Opcodes:** none of its own (contract issue 9).

**Steps:**

- [ ] **Step 1: Harness rules test and implementation.** `listed` and
  `result` give log drafts `auction/listed`, `auction/result`; `sold`,
  `outbid` and `won` give passive drafts.
- [ ] **Step 2: Interact tests and implementation.** `auction_search
  what: X` opens and searches and prints up to 10 rows; `auction_buy
  what: N` bids the buyout of row N; `auction_sell what: X price: P
  buyout: Q hours: H` posts; `auction_mine` lists; `auction_cancel what:
  N` cancels; each refuses away from an auctioneer;
  `expectSendKind(interactTool)` passes. `look find:"auctioneer"`.
- [ ] **Step 3: Scenarios** (tier 9, `eversong10` at a Silvermoon
  auctioneer): `t9-auction-sell` (post; truth: the item is gone and money
  falls by the deposit in the game log), `t9-auction-search` and
  `t9-auction-buy` (the partner posts one item with `call auctionPost`
  first; the answer names its buyout; truth money delta equals minus the
  buyout, game log `auction/won`), `t9-auction-mine` and
  `t9-auction-cancel` (the agent posts, then lists or cancels; game log
  rows).
- [ ] **Step 4: Eval runs**, babysat (R10); record each verdict.
- [ ] **Step 5: Docs, one commit per scenario:** the row "Use the auction
  house" or bullets; ids on the economy row; the first passing
  scenario's commit removes `the auction house` from the "no tool"
  sentence. Run the gates of contract 3.6 and `mise ci:checks`.

**Proof:** eval. The five `t9-auction-*` verdicts.

**Commits** (six):

```
feat: Add interact auction verbs

The agent can now search, buy, sell, list and cancel auctions at an
auctioneer, so it can turn spare loot into gold.
```

```
test: Add the t9-auction-sell eval

The scenario proves a post by the item leaving the bags and the
deposit leaving the purse.
```

```
test: Add the t9-auction-search eval

The scenario proves the agent reads another character's auction and
its buyout price.
```

```
test: Add the t9-auction-buy eval

The scenario proves a buyout by the money spent and the won notice.
```

```
test: Add the t9-auction-mine eval

The scenario proves the agent lists its own auctions.
```

```
test: Add the t9-auction-cancel eval

The scenario proves the agent cancels its own auction.
```

---

## Dead opcodes

| Opcode | Area | Reason |
|---|---|---|
| `SMSG_AUCTION_REMOVED_NOTIFICATION` 0x28d | `auction` | AzerothCore defines it `STATUS_NEVER` (`Server/Protocol/Opcodes.cpp:784`) and never writes it: a search of `src/` and `modules/` finds only the definition and the enum (`Server/Protocol/Opcodes.h:683`); `inventory.tsv` counts 0 send sites (design 5.19 "Dead"). Its dead row lands with economy-11. |

`SMSG_SHOW_MAILBOX` is not dead: it has two send sites that no worker
can reach through SOAP (economy-6, step 10). It is built and proven by a
mock test, marked "not seen live".

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules here every open issue, lease request and decision
of this file that a wave-1 task (economy-1, economy-2) meets.
Precedence: the design, then the plan index with the contract and the
Gate R rulings, then this file. Each ruling is **not yet ruled by the
maintainer**. A ruling that says "stands in for" replaces the named
contract text; the coordinator applies that text in one `COORD-<n>`
commit, and until then the builder follows the ruling.

Not ruled here: contract issues 2 (mail eval staging, economy-8), 8
(`quest-store.ts` window kinds, economy-9 and economy-11) and 10 (partner
staging, economy-5 and economy-13); the mail and bank parts of issue 3
(economy-6, economy-9); the self-field clause of issue 6 (`PLAYER_BYTES_2`,
economy-9); and issue 5 for economy-9. Only tasks of phases 2 to 4 meet
them, so the `SEED-2`, `SEED-3` and `SEED-4` passes rule them.

### SR1-economy-1: the scenario id (economy-2)

**Issue.** Contract issues 1: "Contract 3.7 says the plan index lists
every scenario id. The index file does not exist at plan time ... The
coordinator copies them into the index."

**Ruling.** Closed, no action. The plan index "Scenarios" table lists
`t5-buyback-vendor` at tier t5 for economy-2 in phase A [M, plan index
line 543]. The ids of the later waves are in the same table.

### SR1-economy-2: the buyback peeks (economy-1)

**Issue.** Contract issues 3: "`buyback`: `SMSG_BUY_FAILED`,
`SMSG_SELL_ITEM`, `SMSG_BUY_ITEM` (owners `gameplay-handlers.ts:349-357`
[M]) and `SMSG_INVENTORY_CHANGE_FAILURE`."

**Ruling.** Stands for the `buyback` part. economy-1 peeks the four
opcodes and lists them in `BUYBACK_OPCODES.uses`; the legacy owners stay,
and economy-1 takes no lease on `gameplay-handlers.ts` (items-3b holds it,
then travel-4). The `mail` and `bank` parts of this issue wait for
`SEED-3`.

### SR1-economy-3: no `vendor-store.ts` lease (economy-1)

**Issue.** Contract issues 4: "Design 5.19 says both 'the vendor store
gains `buyback` and `buyInSlot` request kinds (a lease on
`vendor-store.ts`)' and 'bank moves and buyback keep their own pending
state and peek `SMSG_INVENTORY_CHANGE_FAILURE`'. This plan follows the
second sentence." SR1-items-1 leaves the next holder of `vendor-store.ts`
to this issue.

**Ruling.** The lease is refused. economy-1 keeps the buyback pending
state in its own store, as the second design sentence and the plan body
say, and edits neither `vendor-store.ts` nor `vendor.ts`. items-3b stays
the only holder of `vendor-store.ts` in wave 1, with no next holder.

The design's goal (a buyback failure settles the buyback, not a legacy
buy) holds through these rules:

- `act.buyback` and `act.buyInSlot` throw while `core.vendor.pending` is
  set (step 6), and the harness tools run one at a time under
  `ctx.rt.mutex`. So a harness turn cannot start a legacy vendor request
  inside the 5 s buyback wait.
- If a legacy request starts in that window by another path, the
  cross-talk is not only a timeout. `receiveSellFailure` settles a
  pending legacy request that is not a buy on any `SMSG_SELL_ITEM` with
  item guid 0 (`vendor-store.ts:181-186` [M]), so a buyback's
  `cant_find_vendor` reply would also refuse a pending legacy sell. This
  path is accepted as unreachable from the harness, like the one-way rule
  of SR1-items-6.
- The step 6 rig test that asserts that the legacy store's `pending` and
  `lastOutcome` do not change is required, not optional. It runs with no
  legacy request pending, which is the state the precondition
  guarantees.

If the coordinator later wants the design's first sentence, economy-1
needs the `vendor-store.ts` and `vendor.ts` leases after items-3b; that
reopens this ruling.

### SR1-economy-4: the `inventory.ts` lease (economy-1)

**Issue.** Contract issues 5: "items-2 holds the `inventory.ts` lease in
wave 1. economy-1 needs it after items-2 lands ... If a region pushes the
file past 500 non-blank lines (355 lines today [M, `wc -l`]), the lease
covers one new sibling, `inventory-regions.ts`."

**Ruling.** Lease, as SR1-items-1 queues it. economy-1 holds
`packages/core/src/wow/inventory.ts` and `inventory.test.ts` (the test
rides with the source, SR1-quests-4) when items-2 lands and the
coordinator writes the handover line `COORD-<n>: inventory.ts from
items-2 to economy-1`. The next holder is economy-9 (phase C). If the
`buyback` region pushes `inventory.ts` past 500 non-blank lines, economy-1
creates `packages/core/src/wow/inventory-regions.ts` (and its test)
under the same lease, and the lease hands on with both files. economy-1
edits only the `buyback` region, `ROOTS` and the `InventoryState` member
of step 4. The economy-9 part of this issue waits for `SEED-3`.

### SR1-economy-5: the allow-list and the helper names (economy-1)

**Issue.** Contract issues 6: "The areas read the inventory through
`readInventory` from `#wow/inventory`, which is outside the value
allow-list of contract 1.12 ... The correlation helper names
`ownsInventoryFailure`, `isNoChange` and `InventoryClaim` in
`#wow/protocol/inventory` are fixed by items.md (issue 4)".

**Ruling.** Granted through SR1-items-2 and SR1-items-3. The
`COORD-<n>` commit of SR1-items-2 adds `#wow/inventory` and
`#wow/player-state` to the value allow-list in
`packages/core/src/wow/areas/registry.test.ts` and to contract 1.12
before items-3a starts; one edit serves both units. economy-1 uses
`readInventory` for the buyback slots and `coinage` (an
`InventoryState` member, `inventory.ts:64` [M]), and the helper exactly as SR1-items-3 types it. That commit is not in
economy-1's `deps` in the plan index, so economy-1 checks for it at
start and stops `blocked` on `areas/registry.test.ts` if it has not
landed. The `PLAYER_BYTES_2` clause (economy-9) waits for `SEED-3`.

### SR1-economy-6: the legacy owners in the rig (economy-1)

**Issue.** Found while ruling. economy-1 step 6 registers
`registerVendorHandlers` (`gameplay-handlers.ts:338` [M]) and
`registerLootHandlers` (`:269` [M], "owner of
`SMSG_INVENTORY_CHANGE_FAILURE`"), but items-3b rewrites that handler's
fan-out under its `gameplay-handlers.ts` lease (SR1-items-4) before
economy-1 starts.

**Ruling.** economy-1 reads `gameplay-handlers.ts` as landed and passes
to `init.register` (D24) the exported function that registers each of
the four peeked opcodes there. The test reads the file; it does not edit
it. If items-3b moves a registration into a function that is not
exported, economy-1 stops `blocked` and names the file and the function.
The connection stub goes in `packages/core/test-support/areas/buyback.ts`
(unit-owned), not in `test-support/mock-handle.ts` (contract 0.9).

### SR1-economy-7: the probe flow file (economy-1)

**Issue.** Found while ruling. economy-1 creates
`packages/devtools/src/probe-flows/buyback-vendor.ts`, and the T-3 loader
test pins the flow list (SR1-threat-10, SR1-items-10).

**Ruling.** No new action. The `COORD-<n>` commit of SR1-threat-10 lands
before threat-1, and threat-1 is in economy-1's dependencies. The flow
has the shape SR1-threat-6 gives (`flow: ProbeFlow = { name:
"buyback-vendor", usage, run }`); `args.poor` arrives as a string.

### SR1-economy-8: the harness leases of economy-2

**Issue.** economy-2 "Depends on": "the `interact*.ts`, `params.ts` and
`journal.ts` leases (items-5b and travel-5 hold them first in wave 1)";
contract issues 7: "`tools/params.ts` is not in the lease table ...
economy-2 ... need[s] that file under the same lease as the `interact`,
`journal` and `look` modules."

**Ruling.** Leases, in the plan index queues. economy-2 starts only when
the plan section "Lease handovers" records every handover below; its
`deps: ["economy-1"]` in the plan index does not encode them.

- `packages/harness/src/tools/interact.ts` and `interact.test.ts`: from
  travel-5 (SR1-travel-2) to economy-2; next holder travel-6 (C).
- The `interactParams` block of `packages/harness/src/tools/params.ts`
  (the `do` enum gains `buyback`), as the rider of the `interact` lease
  (contract 2.7 fix-up row, SR1-travel-1): from travel-5 to economy-2;
  next holder travel-6 (C). If `SEED-1` splits `params.ts` by tool, the
  lease covers the sibling that holds `interactParams`.
- The `InteractAction` and `InteractAfter` blocks of
  `packages/harness/src/contract/details.ts` (D13 rider of the
  `interact` lease, SR1-travel-3 and SR1-quests-3): from travel-5 to
  economy-2; next holder travel-6 (C).
- `packages/harness/src/tools/journal.ts` and `journal.test.ts`: from
  world-8b (SR1-world-5) to economy-2; next holder economy-8 (C).
- The `JournalAfter` block of `contract/details.ts` (D13): from world-8b
  to economy-2 in the file queue of the plan index; next holder
  economy-8 (C). economy-2 edits it only if the buyback line needs a new
  field in the bags details.
- The `journalParams` block of `tools/params.ts`: economy-2 does not
  take it, because `about: "bags"` already exists
  (`tools/params.ts:188` [M]). The coordinator hands it from world-8b
  directly to the next task that edits it (economy-8 in this unit).

economy-2 edits no other block of `params.ts` or `details.ts` and no
member of `contract/views.ts`. On a rebase conflict in a shared file it
keeps the other holders' text and changes only its blocks.

### SR1-economy-9: the new sibling `tools/interact-buyback.ts` (economy-2)

**Issue.** economy-2 "Files": "a new sibling
`packages/harness/src/tools/interact-buyback.ts` with its test". Contract
2.5 does not list a file under `packages/harness/src/tools/`.

**Ruling.** Allowed. economy-2 creates `tools/interact-buyback.ts` and
`interact-buyback.test.ts` under its `tools/interact.ts` lease (contract
2.7 names `tools/interact*.ts` for `economy`), as travel-5 does with
`interact-bind.ts`. After economy-2 lands, the `economy` unit owns the
two new files and no lease queue holds them. If `journal.ts` would pass
500 non-blank lines (323 lines today [M, `wc -l`]), the buyback line
goes in `packages/harness/src/areas/buyback/journal.ts` and its test, a
sibling split by responsibility as SR1-world-6 allows; `tools/journal.ts`
passes the buyback state in.

### SR1-economy-10: the `interact` row of `docs/harness.md` (economy-2)

**Issue.** economy-2 "Files": "`docs/harness.md` (the `interact` row of
the tool table, one clause)"; contract 2.6 allows only "append one row"
in that table.

**Ruling.** Allowed through SR1-travel-4: the holder of the `interact`
lease adds one clause (`buyback`) to the `interact` row. No other
`docs/harness.md` edit.

### SR1-economy-11: harness tasks with no opcode (economy-2)

**Issue.** Contract issues 9: "The rule '1-8 opcodes per task' does not
fit them, and contract 0.10 forbids merging them into the core tasks."

**Ruling.** Stands, as SR1-travel-5. economy-2's proof is the
`t5-buyback-vendor` verdict and its `docs/capabilities.md` row or bullet
(contract 0.6). The later harness tasks of this unit are ruled the same
way at their seeds.

### SR1-economy-12: the scenario money check and the eval round (economy-2)

**Issue.** economy-2 step 6: "truth `money` delta equals 0 (the buyback
price is the sale price [I])"; step 7: "`mise eval run
t5-buyback-vendor --round <n>`".

**Ruling.** The money check stands, now [M]: the sell handler passes the
sale money to `AddItemToBuyBackSlot(pItem, money)`
(`Handlers/ItemHandler.cpp:723,732`), which writes it to
`PLAYER_FIELD_BUYBACK_PRICE_1` (`Entities/Player/PlayerStorage.cpp:4113`),
and `HandleBuybackItem` charges that field
(`Handlers/ItemHandler.cpp:765,785`). The eval runs of step 7 use
`--round 11` (contract 3.6: 11 for a phase-A task's own runs) and
`--replica <k>` for a second run.

## Seed rulings (SEED-2)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-2 task meets, before `SEED-2`. The wave-2 tasks of this unit are economy-3, economy-4 and economy-5 (phase B). Each ruling is a coordinator ruling (P2-17). Rows marked "for the maintainer's review" answer a design question with the recommended answer of the draft.

A task's own eval runs use the round number the coordinator gives in its build prompt (SEED2-1). Wave-2 scenarios run replica 1 only and no spawn grid is added (SEED2-2). `origin/factory/426-protocol-coverage` in this file means `origin/factory/431-wave2` for part 2 (SEED2-6). Paths without a prefix are under `packages/core/src/wow/` (core), `packages/harness/src/` (h:) or `packages/devtools/src/` (dev:); AzerothCore paths are relative to `src/server/game/` in `/home/deity/code/azerothcore-wotlk-playerbots` unless they start with `src/`, `data/` or `modules/`. Facts marked [M] were measured in this worktree or in AzerothCore; [INFERENCE] marks what was not observed.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR2-economy-1 | `economy.md:145` (`TRADE_OPCODES`, `tradeArea`, `tradeHarness` "under `trade` (`SEED-2`)"), `economy.md:441-442` and `:576-577` (tasks delete a stub line). Task economy-3 (first). | `SEED-2` writes `TRADE_OPCODES.owns` with the 12 rows: `SMSG_TRADE_STATUS`, `CMSG_INITIATE_TRADE`, `CMSG_BEGIN_TRADE`, `CMSG_BUSY_TRADE`, `CMSG_IGNORE_TRADE`, `CMSG_CANCEL_TRADE`, `SMSG_TRADE_STATUS_EXTENDED`, `CMSG_SET_TRADE_ITEM`, `CMSG_CLEAR_TRADE_ITEM`, `CMSG_SET_TRADE_GOLD`, `CMSG_ACCEPT_TRADE`, `CMSG_UNACCEPT_TRADE`. All exist in `protocol/opcodes.ts`; none is owned by another area or named in non-test core code [M]. `stubs` = the two lines moved from `protocol/stubs.ts:16-17`: `["SMSG_TRADE_STATUS", "Trade window"]`, `["SMSG_TRADE_STATUS_EXTENDED", "Trade update"]`. `uses`, `dead`, `unseen` empty (plan index "Dead opcodes" lists no trade row). economy-3 deletes the first stub when it registers `wire.on(SMSG_TRADE_STATUS)`, economy-4 the second. | coordinator ruling (P2-17) |
| SR2-economy-2 | `economy.md:130-136` (contract issue 10: partner staging for `t9-trade-swap`; "if the preset carries none that fits, the scenario stops as `blocked` and asks for partner setup entries"). Task economy-5. | Resolved without a grader change. `partner` copies the agent's preset, but `partners: [{"role":"partner","preset":"eversong10-mage"}]` gives one partner from another preset (`run-partners.ts:33-48`). `eversong10-mage` carries 20 Tough Jerky and 20 Refreshing Spring Water (`soap presets` notes [M]). Ruling for the four scenarios: agent `eversong10`; partner `eversong10-mage` through `partners` (the checks then use `"who": "partner1"` and partner actions use `actor` 1, argv `<PARTNER1>`/`<PARTNER>`); water for the agent comes from `setup` `{"endpoint":"items/add","body":{"item":159,"count":20}}` (the form of `t8-items-split.json`), so the plan's "the Eversong entry could not be determined" (`economy.md:779-781`) is moot. `t9-trade-swap`: agent setup adds 1 Linen Cloth (2589); the partner offers Tough Jerky (item 117 [INFERENCE: entry from memory, the builder confirms it with `soap truth <partner>`, P2-7]). `t9-trade-receive`: the partner offers 1 Tough Jerky. `t9-trade-cancel`: the partner offers 1 Refreshing Spring Water. No playerbot is involved (P2-9). | coordinator ruling (P2-17) |
| SR2-economy-3 | `economy.md:752-757` (economy-5 step 5): keys `tradeAccept`, `tradeAnswer`, `tradeCancel`, `tradeOffer`, `tradeRequest`, "Extend `calls.test.ts` in the T-7a shape". The landed test (`puppet/calls.test.ts:11-24,72-88`) requires each key to name a function of the handle or an act of an area. | These five keys name adapters, not acts, so they fail that test. `calls.test.ts` is in economy-5's owner list (`index.json`; plan row), so economy-5 changes the test: `callable` also accepts a key listed in an explicit alias table `key → [area, act]` (`tradeAccept → [trade, acceptTrade]`, `tradeAnswer → [trade, answerTrade]`, `tradeCancel → [trade, cancelTrade]`, `tradeOffer → [trade, offerItem]`, `tradeRequest → [trade, requestTrade]`), and the test asserts the aliased act exists on the mock game's `trade.act`. The plan's key names stay (they say what the partner does). Args: `tradeAccept` `[]` (accepts `theirOffer.version` from `handle.trade.state()`), `tradeAnswer` `[["yes","busy","ignore"]]`, `tradeCancel` `[]`, `tradeOffer` `["number"]` (entry: the adapter picks the first carried stack of that entry through `readInventory`), `tradeRequest` `["string"]` (character name: the adapter resolves a nearby player through `queryNearby()`). Sorted with the default order: `tradeAccept < tradeAnswer < tradeCancel < tradeOffer < tradeRequest`. | coordinator ruling (P2-17) |
| SR2-economy-4 | `economy.md:710-713`: "remove `trade` from the sentence at `docs/capabilities.md:38-39`". | Stale: that sentence now reads at `docs/capabilities.md:60`: "Peon has no tool for mail, trade, the auction house, flight paths or …". The first passing `t9-trade-*` scenario removes only `trade` from that sentence (contract 3.4). | coordinator ruling (P2-17) |
| SR2-economy-5 | `economy.md:536-538` (economy-3 proof: `--arg target=<A guid>` "after A walks 20 yd away", `TARGET_TO_FAR`). | A is a puppet and a puppet has no walk call (`calls.test.ts:57`). The flow's own character can walk: the flow `trade-window` gains `--arg away=<yards>` that moves character B that far from A with `handle.walkTowardPoint` (as `probe-flows/looting-kill.ts` `closeIn` does) before it sends the initiate. The server refuses beyond 11.11 yd (`Entities/Object/ObjectDefines.h:29`, `TradeHandler.cpp:835-839`), so `away=20` gives `TARGET_TO_FAR`. | coordinator ruling (P2-17) |
| SR2-economy-6 | `economy.md:539-542` (`WRONG_FACTION` "no shared spot was identified"). | A shared spot can be staged: `soap setup position` places any factory character before login (docs/factory.md, "position"); put an `elwynn1` (Alliance) account at the `eversong10` spawn (map 530, 8735, -6685, 70.5; body as `positionStep` in `grader/spawn-slots.ts:181-186`). The initiate check for faction runs before the distance check (`TradeHandler.cpp:828-833`, then `:835-839`). Whether the Alliance character survives Horde guards long enough is not measured [INFERENCE]; if it does not, the plan's fallback stands (a rig test built from `:828-833`, status still live through the other cases). | coordinator ruling (P2-17) |
| SR2-economy-7 | `economy.md:183-185` and design 5.19 risks: "If the first trade … answers `TRIAL_ACCOUNT`, the task stops as `blocked`". | Keep as written. `TRIAL_ACCOUNT` (status 20?) is only sent when `CONFIG_TRIAL_RESTRICTION_TRADE` is on and the account is a trial (`TradeHandler.cpp:755-760,796-803`); the option's default is not in the checked dist file [M: no match in `worldserver.conf.dist`], so the deployed value is unknown. `LevelReq.Trade` is 1 (`worldserver.conf.dist:2258`), so `fresh` and `eversong10` characters may trade. | coordinator ruling (P2-17) |
| SR2-economy-8 | `economy.md:499-511` (runtime step 6/7: `requestTrade` throws while a trade is not `idle` or `closed`; 60 s auto-busy). | Confirmed against AzerothCore and kept: a successful initiate creates `TradeData` on both characters at once and only the target gets `BEGIN_TRADE` (`TradeHandler.cpp:826-837` region: `_player->m_trade = new TradeData(...)`), a second initiate while `GetTradeData()` is set returns with no reply (`:726-727`), and `CMSG_BUSY_TRADE` cancels with `BUSY` for both (`:69-72`). The initiator gets no status until the other side answers, so `requested_out` lasts until `OPEN_WINDOW`, `BUSY` or `IGNORE_YOU`; the 60 s `CMSG_CANCEL_TRADE` then frees the initiator (`:714-719`). | coordinator ruling (P2-17) |
| SR2-economy-9 | `economy.md:625-628` (`acceptTrade(expectVersion)` "throws `offer_changed`"), `economy.md:606-609` (`buildAcceptTrade()` writes `u32 1`). | AzerothCore reads no body for `CMSG_ACCEPT_TRADE` (`TradeHandler.cpp:237`), so an extra `u32` is ignored; keep the plan's `u32 1` (wowm form) and its wire note. | coordinator ruling (P2-17) |
| SR2-economy-10 | `economy.md:704-708`: `contract/runs.ts` `RunKind` and `ui/status-line.ts` `VERB` (shared appends), `tools/registry.ts`, `contract/result.ts`. | Allowed as shared appends (contract 2.6). Measured: `contract/result.ts` 37 lines, `tools/registry.ts` 33, `contract/runs.ts` 61, `ui/status-line.ts` 26. `tools/covered.ts` `COVERS` may take a sorted key `trade` naming only rows its own call produces (`trade/canceled`, `trade/refused`, `trade/they_accepted`); `log` rows are never covered (`covered.ts:reported`). Not required by the acceptance. | coordinator ruling (P2-17) |
| SR2-economy-11 | `economy.md:758-782` (scenario tiers/spawns: "one spawn, `"partner": "partner"`, as `t2-whisper-reply.json`"). | Capacity, see SR2-group-26. All four `t9-trade-*` scenarios take `eversong` (the `EVERSONG` grid: 49 points = 24 slots, 11 scenarios today); the four make 15 of 24 slots. They run replica 1 only (SEED2-2). | coordinator ruling (P2-17) |
| SR2-economy-12 | `economy.md:783-785` (Step 7: evals "babysat by an omp Muse worker (R10)"; "no eval trades with a playerbot"). | Applies as written (P2-9). Partners are puppets only. The partner's item offers use the named `eversong10-mage` items above. | coordinator ruling (P2-17) |

## Seed rulings (SEED-3)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-3 task meets, before `SEED-3`. The wave-3 tasks of this unit are economy-6, economy-7, economy-8, economy-9, economy-10 (phase C). Each ruling is a coordinator ruling (P2-17). `core:` = `packages/core/src/wow/`, `h:` = `packages/harness/src/`, `cts:` = `packages/core/test-support/`, `dev:` = `packages/devtools/src/`. A task's own eval runs use the round number the coordinator hands the builder. The `SR3-economy-<n>` ids supersede nothing earlier; section "Coordinator edits for SEED-3" in the plan index holds the seed edits (the `SEED3-<n>` ids).

| Id | Issue and task | Ruling | Status |
|---|---|---|---|
| SR3-economy-1 | `economy.md:146-147` ("`MAIL_OPCODES` ... under `mail` (`SEED-3`)"), tasks economy-6 and economy-7. Which rows does the seed write? | `SEED-3` writes `MAIL_OPCODES.owns` with the 12 rows of the two tasks, in the order of the index opcode lines: `CMSG_GET_MAIL_LIST`, `SMSG_MAIL_LIST_RESULT`, `CMSG_MAIL_MARK_AS_READ`, `MSG_QUERY_NEXT_MAIL_TIME`, `SMSG_SHOW_MAILBOX`, `SMSG_SEND_MAIL_RESULT`, `CMSG_MAIL_TAKE_MONEY`, `CMSG_MAIL_TAKE_ITEM`, `CMSG_MAIL_RETURN_TO_SENDER`, `CMSG_MAIL_DELETE`, `CMSG_MAIL_CREATE_TEXT_ITEM`, `CMSG_SEND_MAIL`. All exist in `protocol/opcodes.ts:434-448,499,511` and none is named in non-test core code other than the three `STUBS` lines and the test files [M, grep of `packages/`]. `stubs` = the three lines moved from `protocol/stubs.ts:10-12` with their labels: `["SMSG_SEND_MAIL_RESULT", "Mail result"]`, `["SMSG_MAIL_LIST_RESULT", "Mail list"]`, `["SMSG_SHOW_MAILBOX", "Mailbox opened"]`. `uses`, `dead`, `unseen` are empty at the seed: economy-6 adds `uses: ["SMSG_RECEIVED_MAIL"]` and `unseen: ["SMSG_SHOW_MAILBOX"]` and deletes the list and mailbox stub lines, economy-7 deletes the result stub line (plan text; `opcodes.ts` is in both owner lists). `SMSG_RECEIVED_MAIL` is a core row (owner `client-handlers.ts:95`) and stays in `uses`, never `owns`. | coordinator ruling (P2-17) |
| SR3-economy-2 | `economy.md:147` (`BANK_OPCODES` under `bank`), tasks economy-9, economy-10. | `SEED-3` writes `BANK_OPCODES.owns` with the 5 rows of economy-9: `CMSG_BANKER_ACTIVATE`, `CMSG_AUTOBANK_ITEM`, `CMSG_AUTOSTORE_BANK_ITEM`, `CMSG_BUY_BANK_SLOT`, `SMSG_BUY_BANK_SLOT_RESULT` (`protocol/opcodes.ts:342,344,345,497,498` [M]). `stubs`, `uses`, `dead`, `unseen` empty: `protocol/stubs.ts` has no bank line, and `SMSG_SHOW_BANK` (core row, owner `gameplay-handlers.ts:208`) and `SMSG_INVENTORY_CHANGE_FAILURE` (owner `:335`) go into `uses` in economy-9 (plan text). `CMSG_BUY_BANK_SLOT` has no `unseen` row: the opcode is live through the ok, insufficient-funds and not-banker results; the too-many result alone is a rig test. | coordinator ruling (P2-17) |
| SR3-economy-3 | Area names `mail` and `bank` against the registry checks. | Both are free [M]: `nameProblems("mail")` is asserted clean (`areas/registry.test.ts:369`); the reserved set is the core handle keys, `CORE_DOMAINS` (`:21-46`, no `mail` or `bank`), and the file stems of `areas/` in core and harness (no `mail`, `bank`); `client.ts:107` has `origin: "mail"` as a value, not a handle key. Event `type` values of both areas match `/^[a-z_]+$/`. | coordinator ruling (P2-17) |
| SR3-economy-4 | economy-6 wire notes (`economy.md:860-882,933-934`): list entry layout, hidden count, body. | AzerothCore `SendMailList` (`Handlers/MailHandler.cpp:698-823` [M]) differs from the plan text in three points the builder must encode. (1) The list packet carries the body string (`:777-778`, `data << body`), so `mail.body` comes from the list and no `CMSG_ITEM_TEXT_QUERY` is needed to read it. (2) Each item block has 7 enchant triples (`MAX_INSPECTED_ENCHANTMENT_SLOT` = 7, `Item.h:176`, loop `:792-797`), then random property (`int32`), suffix factor, stack count, charges, max durability, durability and a zero byte; the entry size `u16` counts itself (`:748-753`). (3) The same function can push the inbox unsolicited on delivery when `Mail.PushInboxOnDelivery` is on (`:696-698`, default 0 in `worldserver.conf.dist:4264`; the deployed value is unknown [INFERENCE]): the store treats every `SMSG_MAIL_LIST_RESULT` as a listing, requested or not, and a waiting `listMail` settles on it. Also: at most 50 mails are listed (`MAX_INBOX_CLIENT_CAPACITY`, `:36`), `realCount - shown` is the hidden count, a mail with a delivery delay that has not expired is skipped and not counted (`:713-716`, so item mail from another account is invisible for an hour), sender is a guid for `MAIL_NORMAL` and a `u32` entry for the other types (`:766-777`), and the time field is days left as a float (`:785`). | coordinator ruling (P2-17) |
| SR3-economy-5 | Mailbox and banker range checks (`economy.md:900-903,1245-1251`: "game object of type 19 within 10 yd"; bank "out of range"). | Both ranges are server facts [M]. Game-object mailbox: `CanOpenMailBox` (`MailHandler.cpp:39-62`) -> `GetGameObjectIfCanInteractWith` (`Entities/Player/Player.cpp:2167-2185`) -> interaction distance 10 yd for `GAMEOBJECT_TYPE_MAILBOX` (`Entities/GameObject/GameObject.cpp:2927-2930`), but with display info the test is the model's bounding box grown by that radius (`:3008-3027`), so the client check is an approximation: the acts refuse beyond 10 yd measured to the object origin and otherwise let the server decide; silence is `unanswered`. A creature mailbox (npc flag `0x4000000`, `npc-roles.ts:51`) uses 5.5 yd. Banker: `GetNPCIfCanInteractWith` with `INTERACTION_DISTANCE` 5.5 yd (`Player.cpp:2115-2165`, `Entities/Object/ObjectDefines.h:24`); `CMSG_BANKER_ACTIVATE` out of range is dropped silently (`Handlers/BankHandler.cpp:47-55`); `deposit` and `withdraw` re-check range against the banker the server remembers from the last `SMSG_SHOW_BANK` each time (`CanUseBank`, `BankHandler.cpp:28-41`), while `CMSG_BUY_BANK_SLOT` checks the guid in its own packet (`:143-151`). | coordinator ruling (P2-17) |
| SR3-economy-6 | economy-6 step 4: the no-op owner for `SMSG_RECEIVED_MAIL` in the rig; economy-9 step 4: `register` with `registerQuestHandlers` and `registerLootHandlers`. | Legacy owners, corrected lines [M]: `handleReceivedMail(conn, r)` is exported (`world-handlers-chat.ts:222`) and registered at `client-handlers.ts:95`; `registerQuestHandlers` (`gameplay-handlers.ts:176`, `SMSG_SHOW_BANK` at `:208`) and `registerLootHandlers` (`:298`, failure handler at `:335`) are exported. economy-6 keeps the plan's no-op owner (the test asserts the area side only). economy-9 builds its rig as `cts: areas/buyback.ts` does (`buybackConn(dispatch)` and the exported register functions). Neither task edits `gameplay-handlers.ts` (travel-4 holds it after items-3b) or `world-handlers-chat.ts`; no lease. | coordinator ruling (P2-17) |
| SR3-economy-7 | economy-6 live proof staging (`economy.md:917-926`): `soap gm <ACCOUNT> items 159:5`, `money 250`, `mail Meet at the inn`. | Allowed for the worker's own proof (R12). What the console does [M, `src/server/scripts/Commands/cs_send.cpp:120-174,199-215`]: each verb sends one separate mail to the offline character with stationery GM, type normal, and the sender is the target itself (console case); `items` and `money` use the subject `Peon` and the body `staging`; `mail <subject>` uses body `staging`; none sets the has-body flag (0x10), but the list still carries the body. Result: three letters, all "from" the character. Do not rely on list order; identify letters by subject and content. Do not `return` these letters (the sender is the receiver). `soap gm` verbs: `factory/src/soap-gm.ts:237-239`, subjects match `^[A-Za-z0-9 ]{1,24}$`. | coordinator ruling (P2-17) |
| SR3-economy-8 | economy-7 send checks (`economy.md:1010-1017`) and proof (`economy.md:1033-1044`). | AzerothCore `HandleSendMail` (`MailHandler.cpp:66-375`) [M]: read order is mailbox, receiver, subject, body, `u32`, `u32`, `u8` item count, per item `u8` slot then guid, money, COD, `u64`, `u8` (`:70-109`); more than 12 items answers `TOO_MANY_ATTACHMENTS` (`:92-97`); an unreachable mailbox, an empty receiver, a level below `LevelReq.Mail` (1, `WorldConfig.cpp:164`; a notification only) and the body check `"| |"` send no result; receiver not found, own name, money with COD (`INTERNAL_ERROR`, `:156-161`), cost `30 x items` or 30 when no item (`:162`), not enough money and a receiver with over 100 mails all answer a result. COD is zeroed when no item is attached (`:358`). Cross-faction mail needs the two-side option (same-faction accounts only). **Delivery delay:** only mail with items to a character of another account waits (`MailDeliveryDelay`, default one hour, `WorldConfig.cpp:303`; `needItemDelay` at `:346-360`), money mail is instant. Proof additions: besides the money mail, B sends one Linen Cloth (2589, `items/add`) to A once: B gets `SMSG_SEND_MAIL_RESULT` action 0 with result ok at once and B's truth loses the cloth and 60 copper (30 postage + 30? no: one item costs 30, `:162`); A receives it after an hour, so the item mail is not read in this task. That proves the item-slot byte order on the live wire, which the rig alone does not. | coordinator ruling (P2-17) |
| SR3-economy-9 | economy-7 `copyMailText` refusal and probe (`economy.md:1017-1018,1030-1032`). | The server needs a non-empty body or a mail template, not the has-body flag (`MailHandler.cpp:824-846`, `m->body.empty() && !m->mailTemplateId`), and a mail whose copied bit (0x04) is set is refused with `INTERNAL_ERROR`; a player mail with an empty body is stored with the copied bit already set (`:366`). So `copyMailText` refuses when the copied flag is set or the listed body is empty and no template id is listed; the staged console letters (body `staging`) can be copied. `deleteMail` of a mail with COD fails on the server (`:420-424`) but does delete mail that still holds gold or items: the client-side refusal (N29) stands. `returnMail` sends the sender guid as a trailing `u64` that the server skips (`:442`). | coordinator ruling (P2-17) |
| SR3-economy-10 | economy-6 live proof location (`economy.md:179-181,917-924`): "Place the character next to the Goldshire mailbox". | The mailbox coordinates are unknown [INFERENCE]. Hint [M]: scenarios `t1-quests-guard-directions` and `t4-objects-explore-fargodeep` already place an `elwynn10`-class agent at map 0, `(-9481, 74, 56.5)` with a `position` setup step, near the Goldshire inn. Start there: `soap setup <ACCOUNT> position {"map":0,"x":-9481,"y":74,"z":56.5}`, then `mise protocol:probe <ACCOUNT> --flow nearest --arg kind=gameobject` (kind `gameobject` is supported, `probe-flows/nearest.ts:13`); the builder moves the character (offline `position` step) to a point within 10 yd of the listed mailbox before the `mail-inbox` flow, and writes the final point into the flow's usage text or the scenario, not into a doc (`economy.md:179-183`). | coordinator ruling (P2-17) |
| SR3-economy-11 | economy-7 two-account proof (`economy.md:1033-1042`): A as a puppet, "Stop A's puppet, then run `mise protocol:probe <A> --flow mail-actions --arg do=return`". | A puppet has no walk call (`puppet/calls.test.ts:57`), so A must be placed within 10 yd of a mailbox by the offline `position` step before the puppet starts, and A stays there. Both accounts are same-faction `elwynn10`. A's `packets.jsonl` shows `SMSG_RECEIVED_MAIL` only if the puppet started with `--packet-trace headers` (headers are enough: it is a zero-body opcode check). The return step needs the letter listed: the list is requested in the flow, not from the puppet. | coordinator ruling (P2-17) |
| SR3-economy-12 | economy-8 owner list (`economy.md:1078-1092`; index `owner`): `tools/look.ts`, `look.test.ts`, `tools/params.ts`, and step 5 `look find:"mailbox"`. | DESIGN answered: D3 accepted: no `mailbox` or `banker` kind for `look`; the mail and bank tools find the mailbox and banker themselves. `look find:"object"` already lists game objects with the kind word `mailbox` (`areas/objects/reads.ts:19,40`; branch at `tools/look.ts:258`). A new `mailbox` kind would need `NearestKind` in `contract/views.ts`, `KIND_TESTS` in `ops/views.ts`, `LOOK_FILTERS` in `tools/look-find.ts` and `params-look.ts`, none of which economy-8 holds (views.ts/ops/views.ts queues run through remote-motion-7a, self-state-10a, pvp-11c only). Ruling: **economy-8 adds no `look` kind and does not edit `tools/look.ts`, `look.test.ts`, `look-*.ts` or `params-look.ts`**. The mail tool finds the nearest mailbox itself from the object rows (`objectRows(ctx)`, `areas/objects/reads.ts`) and, when none is within 10 yd, refuses `no_mailbox` and names the nearest known one with its distance; the agent finds mailboxes with `look find:"object"`. `journal about:"mail"` goes in the `journalParams` block of `tools/params-journal.ts` (the file `tools/params.ts` named in the index is a facade) and a new sibling `tools/journal-mail.ts` with `journal-mail.test.ts` (as `journal-bags.ts` does), so `journal.ts` (472) only gains one import and one dispatch line (`journal.ts:468-478`). The new `MailAction` and `MailAfter` types are new blocks of `contract/details.ts`; economy-8 also edits the `JournalAfter` block (`details.ts:340-345`). No edit of `contract/runs.ts` or `ui/status-line.ts`: the tool is kind `action`, not `run`. | coordinator ruling (P2-17) |
| SR3-economy-13 | economy-8 leases. | Journal chain: `tools/journal.ts`, `tools/params-journal.ts` and the `JournalAfter` block: economy-8 is next after economy-2 (landed), then spells-14, economy-10 (plan "Leases" row `h: tools/journal.ts`). `contract/details.ts` is leased per block: economy-8 holds `MailAction`, `MailAfter` and `JournalAfter`. Shared append-only edits (contract 2.6): `contract/result.ts` `ToolName` (41 lines), `tools/registry.ts` `GAME_TOOLS` (41), `docs/harness.md` (437), `grader/scenarios.ts` `ROUND_1`, `docs/capabilities.md` (81), `docs/evals.md`. | coordinator ruling (P2-17) |
| SR3-economy-14 | `economy.md:53-64` (contract issue 2: mail eval staging "needs a GM setup step ... no tooling task adds it"), economy-8 steps 6-8, `t9-mail-read`, `t9-mail-collect`. **DESIGN** D1 | DESIGN answered: D1 accepted: the mail evals are staged through offline `quest/add`, `quest/complete` and `quest/reward`; no `soap gm` in an eval. Staging needs no new tool. Offline `quest/add`, `quest/complete`, `quest/reward` (all in `realm-service.ts:9-28`, listed in `docs/factory.md` endpoints) mail the quest's reward items to the character: `HandleQuestReward` for an offline character sends one mail with subject = the quest title, body "This quest has been manually rewarded to you. This mail contains your quest rewards.", and all choice and fixed reward items (`src/server/scripts/Commands/cs_quest.cpp:487-525,598-625`); the money, XP and honor are applied directly. The step needs a quest that is not started by an item, is not daily or weekly, and has reward items; the builder picks one from the live `quest_template` knowledge of the quests tasks, confirms it with `soap truth` (`mail` pick: subject, items count, `docs/evals.md:122`), and records the id. Scenarios: `t9-mail-read`: setup = the three quest steps; task "Check your mail and tell me what the letter says."; check = answer (session) contains a fixed word of the body (for example `quest rewards`), plus `game_log` `mail/listed`. `t9-mail-collect`: same setup; task "You have mail. Collect everything in it."; checks = `truth` inventory count of the reward item entries rises (`evidence.items`) and the `mail` truth shows the mail's item count at 0. The plan's "money 250" and "items 159:5" staging is dropped for the evals; gold collection stays proven live in economy-7 (`soap gm money`). No scenario uses `soap gm`. Recommended: accept. | coordinator ruling (P2-17) |
| SR3-economy-15 | economy-8 `t9-mail-send` (`economy.md:1135-1138`): "Mail 1 silver to <PARTNER>"; "agent and partner `elwynn10` on different accounts". | The task text cannot name the partner (finding 8). Follow `t9-trade-give`: scenario `partner: "partner"` (copies the agent's preset `elwynn10`, same faction as the mail rule needs), task "A player will whisper you and ask for 1 silver by mail. Send it.", partner action `["send","-w","<AGENT>","hi, could you mail me 1 silver? Thank you"]` at an `elapsed` offset repeated once (`partnerActions` with `windowMs`), checks: `truth` money delta -130 (100 + 30 postage, `MailHandler.cpp:162`) and `game_log` `mail/sent`. Setup: `money` `{"copper": 500}` so the agent can pay, `position` at the mailbox point found in SR3-economy-10 (no start slot: `elwynn10` is not in `SPAWN_OF`, so the partner starts at the preset point; it does not need the mailbox because it only receives). The partner must be a puppet; nothing mails an `RNDBOT*` character (P2-9). | coordinator ruling (P2-17) |
| SR3-economy-16 | economy-9 `inventory.ts` lease (`economy.md:94-101,1194-1195`); `inventory.ts` is now 453 lines (economy-1 added the buyback region), `inventory.test.ts` 365 [M]. | The bank regions (`bank` slots 39-66, `bankbag` 67-73, `bank_bag_item` for the bank bags' contents; `Entities/Player/Player.h:698-705`) would push the file past 500. economy-9 creates `core: inventory-bank.ts` and `inventory-bank.test.ts` under the same lease (the fallback of SR1-economy-4) holding the bank roots and the bank-bag reads, and edits `inventory.ts` only for the `InventoryRegion` union (`:44-51`), one `ROOTS` spread (`:107-140`) and the call in `readInventory` (`:428-478`), at most +25 lines. `freeSlots` and `BAG_REGIONS` users are unaffected because they filter `backpack` and `bag_item` (`inventory.ts:420`, `harness/tools/journal.ts`). The items area still refuses bank positions ("bank moves wait for the economy area", `areas/items/moves.ts:72-80`); that stays, the `bank` area's acts do the moves. Bank items and bank bags reach the client at login (`Entities/Player/Player.cpp:3989-4020`, slots `INVENTORY_SLOT_BAG_START` to `BANK_SLOT_BAG_END`). | coordinator ruling (P2-17) |
| SR3-economy-17 | economy-9 `quest-store.ts` lease (`economy.md:119-125,1196-1197`); `quest-store.ts` 400, `quest-store.test.ts` 51 [M]. | Chain `items-3b` (landed) -> `quests-7b` (landed, it created the test file) -> economy-9 -> economy-11. The edit is one condition: `receiveWindow` (`quest-store.ts:253-274`) treats `bank` like `trainer` and `vendor` (`:263`). The test goes in `quest-store.test.ts` with the `setup()`/`packet()` fixtures already imported there. The window event uses the giver match at `:256`: a bank opened by the `bank` area's own `CMSG_BANKER_ACTIVATE` sets no giver there, so the legacy store ignores it, and only `talk` to a banker through `quests` hits the new branch. | coordinator ruling (P2-17) |
| SR3-economy-18 | economy-9 `bagSlots` and the self-field clause (`economy.md:1240-1241`, SR1-economy contract issue 6). | No `COORD` needed: `bagSlots` is byte 2 of `PLAYER_FIELDS.BYTES_2` (`update-fields.ts:156`, offset 154; `Player.h:1291`, `PLAYER_BYTES_2_OFFSET_BANK_BAG_SLOTS` = 2 at `:507`), read in the store from `deps.getEntity(deps.selfGuid())?.rawFields` and shifted `(value >>> 16) & 0xff`. `#wow/protocol/update-fields` matches the allow-list pattern `#wow\/protocol\/[\w-]+` (`registry.test.ts:48`). | coordinator ruling (P2-17) |
| SR3-economy-19 | economy-9 steps 1, 4, 6 and 7: "autobank an empty position (result 59)"; `withdraw` = `CMSG_AUTOSTORE_BANK_ITEM`; slot prices; `FAILED_TOO_MANY`. | (a) An empty source position is silent (`BankHandler.cpp:75-77`); result 59 (`EQUIP_ERR_NONE`, `isNoChange`) is sent only when the item is already at the place `CanBankItem` would choose (`:84-88`). The probe's no-change case is: deposit the cloth, then autobank the same stack again [INFERENCE: whether the server then picks its own slot is not verified]; if live does not give 59, the `no_change` rule test stays a rig test (no opcode is affected, no `unseen`). (b) `CMSG_AUTOSTORE_BANK_ITEM` moves in both directions by the source position (`IsBankPos`, `:123-150`): the `withdraw` act refuses a source that is not a bank position, else it would deposit. (c) Result names `too_many` 0, `insufficient_funds` 1, `not_banker` 2, `ok` 3 (`Player.h:112-115`); `too_many` is sent when the next slot has no row in `BankBagSlotPrices` (`BankHandler.cpp:153-159`), and the price table is DBC data that is not in the live DBC directory [INFERENCE: P2-8]: the price is read from the money fall, never from a table. Seven purchases are needed for `too_many` (`BANK_SLOT_BAG_START`..`END` = 67..74, `Player.h:704-705`); try it only if the cost is affordable with `money`, else rig. | coordinator ruling (P2-17) |
| SR3-economy-20 | economy-10 owner list and leases (`economy.md:1300-1316`; index owner): `tools/interact.ts`, `tools/params.ts`, `tools/journal.ts`, `tools/look.ts`, `look.test.ts`. | DESIGN answered: D3 accepted: no `mailbox` or `banker` kind for `look`; the mail and bank tools find the mailbox and banker themselves. Corrections: `interactParams` is `tools/params-interact.ts` (the `do` enum has `buyback` at `:24`), `journalParams` is `tools/params-journal.ts`; `tools/params.ts` is a facade (finding 3). As in SR3-economy-12 there is **no `banker` look kind** (no lease on `contract/views.ts`, `ops/views.ts`, `look-find.ts`): `interact-bank.ts` picks the banker from `unitViews(ctx)` whose `roles` include `banker` (`npc-roles.ts:17,43`), and `journal about:"bank"` goes in new `tools/journal-bank.ts` and `journal-bank.test.ts` with a dispatch line in `journal.ts`. The bank steps are entries in `STEPS` of `tools/interact.ts` next to `["buyback", buybackStep]` (`interact.ts:151`) and the `do` values go in `params-interact.ts` and the `InteractAction` union (`contract/details.ts:162` region); the `InteractAfter` block gets the bank fields. economy-10 waits for travel-6 and spells-14 (finding 5). `interact.ts` is 239 lines; new logic goes in `tools/interact-bank.ts` (+ test). | coordinator ruling (P2-17) |
| SR3-economy-21 | economy-10 scenarios need a start point at the Silvermoon bank (`economy.md:1340-1354`); finding 6. **DESIGN** D2 | DESIGN answered: D2 accepted under BR-wave3-3: economy-10 adds the `silvermoon-bank` grid to `spawn-slots.ts`; every allocated point is one its own live character stood on and reached. The three `t9-bank-*` scenarios use preset `eversong10`, which is in `SPAWN_OF` with the full `EVERSONG` grid, so they need a named spawn. economy-10 holds `grader/spawn-slots.ts` and `grader/spawn-slots.test.ts` (new lease, section C) and adds `const SILVERMOON_BANK: Spawn` (map 530, the zone id and orientation it measures, 12 points: 3 scenarios x 2 replicas x 2 points, spaced 4 yd like the other grids) plus the `NAMED` key `"silvermoon-bank"` (`spawn-slots.ts:237-246`); the scenarios set `"spawn": "silvermoon-bank"` (partner `null`, but `startSlots` still needs the partner point, `:280-284`). Points must be ground a character stood on, within a short walk of a banker; the builder finds a banker with `--flow nearest --arg kind=banker` after an offline `position` step into Silvermoon City and writes the coordinates into the grid, never into a doc. `mise test packages/harness/src/grader/spawn-slots.test.ts` must stay green (two replicas, crowd test). Recommended: accept. | coordinator ruling (P2-17) |
| SR3-economy-22 | economy-10 `t9-bank-withdraw` (`economy.md:1345-1351`, "not yet ruled by the maintainer"). | Accepted as written: `items/add` cannot stage bank contents (`t1-service-readme.md:183-186`: the bank is not a target), so the scenario tasks the deposit and the withdrawal in one run and checks the final carried position plus `bank/withdraw`. `truth` pick `bank` exists (`grader/scenarios.ts:47-60`, `docs/evals.md:122`; T-8a is landed). `t9-bank-slot` stages `money` with body `{"copper": 100000}` (`t1-service-readme.md:185`; 10 g); the check compares the money fall with the price in the `bank/slot` row. | coordinator ruling (P2-17) |
| SR3-economy-23 | economy-9 shared test support: `cts: areas/bank.ts` needs bank fields on the player entity. | `cts: areas/items-world.ts` (`itemsWorld`) is imported by `cts: areas/buyback.ts` for `player.rawFields`; `cts: areas/bank.ts` does the same and writes the bank `FIELD_INV` words itself (as `buybackSell` does), without editing `items-world.ts`. The harness bank tests use `jest.spyOn`-style spies on `handle.bank.state`/acts as the quests tests do; `createMockGame().bank` exists once the seed lands (`test-support/mock-handle.ts:104` `areaHandles`). | coordinator ruling (P2-17) |
| SR3-economy-24 | Unit-wide: rounds, cleanup, risks. | Eval runs use the coordinator's round, replica 1. Trial accounts (`TRIAL_ACCOUNT` on the first mail send) still stop the task `blocked` (`economy.md:183-185`, kept from SR2-economy-7). Delete every account. No bank, mail or trade action on `AUCTIONHOUSE`, `RNDBOT*` or the maintainer's characters (rules.md 6). | coordinator ruling (P2-17) |

### Findings behind the SEED-3 rulings

1. 1. **Only `mail` and `bank` need a seed.** `items` (35 owns, `stubs` = `SMSG_EQUIPMENT_SET_LIST` and `SMSG_SET_PROFICIENCY`, `uses` = `SMSG_INVENTORY_CHANGE_FAILURE`, `areas/items/opcodes.ts:4-47` [M]) and `emotes` (`owns` all four rows, other lists empty, `areas/emotes/opcodes.ts:4-9` [M]) were seeded in SEED-1. The `SEED-3` dependency of items-6, items-9, social-3 is a scheduling dependency only. Affects: items-6, items-9, economy-6, economy-9, social-3.

2. 2. **`protocol/stubs.ts` holds the three mail lines at `:10-12`** (not the lines the SEED-2 rows quote) and no bank line [M]. The frozen 57-pair test keeps them through `areaStubs()` (`areas/registry.test.ts:66-68`, `:330-344`). Affects: economy-6, economy-7.

3. 3. **SEED-1 split `tools/params.ts` and `tools/look.ts`.** `tools/params.ts` is a 17-line facade (coordinator only); the blocks live in `params-interact.ts` (46), `params-journal.ts` (20), `params-look.ts` (44), `params-social.ts` (30) [M]. The owner lists of economy-8, economy-10 and social-14 still name `tools/params.ts`; the index rows must be corrected (section D). Affects: economy-8, economy-10, social-14.

4. 4. **`item6` is not a task id.** It stands for "the tool shape after #429" and is landed (wave 1 and 2 tasks used the new shape). Treat it as satisfied; nothing in these units waits on it. Affects: economy-6, economy-9, social-14.

5. 5. **Lease-queue waits not encoded in the index** (`leaseDeps` is empty for all ten tasks): economy-10 must wait for travel-6 (`tools/interact.ts`, `params-interact.ts`, the `InteractAction` and `InteractAfter` blocks) and for spells-14 (`tools/journal.ts`, `params-journal.ts`). Plan "Leases" rows `h: tools/interact.ts` and `h: tools/journal.ts`. economy-8 and social-14 are first in their chains (economy-2 and world-8b have landed). See sections C and D.

6. 6. **The `EVERSONG` spawn grid is full.** 12 ROUND_1 scenarios use it (presets `eversong10*` without a named `spawn`, `spawn-slots.ts:161-167`), each needs 2 replicas x 2 points, and `EVERSONG` has 49 points [M, counted with a script over `ROUND_1` and the scenario files]. `spawn-slots.test.ts:11-14` fails any scenario without a start slot for replicas 1 and 2. A new `eversong10` scenario therefore needs a named `spawn`. Affects: economy-10 (SR3-economy-21). `fairbreeze-east` has 8 points and one user (`t2-whisper-reply`): social-14 fits with both scenarios at two replicas (SR3-social-6).

7. 7. **Scenario `setup` runs before the start-slot step**, so a slot position overrides a `position` setup step (`grader/run.ts:443-450` [M]). A scenario that needs its own start point must either carry a preset that is not in `SPAWN_OF` (`elwynn10`, `max80`, `fresh`) plus a `position` setup step, or a named spawn. Affects: economy-8, economy-10, items-7.

8. 8. **Task text is not expanded.** `<AGENT>` and `<PARTNER>` are replaced only in `partnerActions.argv` (`grader/partner.ts:42-49`); `typeText(run, run.scenario.task)` sends the task verbatim (`grader/run.ts:319`). economy-8's "Mail 1 silver to <PARTNER>" cannot work as written (SR3-economy-15). social-14 already avoids names.

9. 11. **Legacy owner lines moved**: `SMSG_SHOW_BANK` is at `gameplay-handlers.ts:208` inside `registerQuestHandlers` (`:176`), `SMSG_INVENTORY_CHANGE_FAILURE` at `:335` inside `registerLootHandlers` (`:298`), both exported [M]; `SMSG_RECEIVED_MAIL` is `client-handlers.ts:95` calling the exported `handleReceivedMail` (`world-handlers-chat.ts:222`) [M]. `economy.md` quotes `:203-205`, `:306-313`, `world-handlers-chat.ts:222-230`. Affects: economy-6, economy-9.

## Build rulings

| Id | Issue | Ruling |
|---|---|---|
| BR-economy-3-1 | Round-3 review of economy-3: a stale `pendingCancel` counter swallows a later request's refusal, because AzerothCore sends no status for a cancel when no trade exists (`PlayerStorage.cpp:4223-4240`); and an aborted reply waiter rejects unhandled when a send throws | Coordinator ruling (P2-17): one more fix round, limited to these two defects in `areas/trade/store.ts` and `runtime.ts` with tests, then a full re-review. |
| BR-economy-3-2 | Round-4 review of economy-3: every way of waiting for a cancel reply after a timed-out request can swallow a later trade's status, because the server may send no reply (`PlayerStorage.cpp:4223-4240`) | Coordinator ruling (P2-17): the store waits for no cancel reply. On timeout the request sends `CMSG_CANCEL_TRADE` and goes idle. A `TRADE_CANCELED` while idle is dropped. Any status during a live request or window belongs to that trade, and a new `BEGIN_TRADE` starts clean. A last fix round removes the counter and the expectation window, then a full re-review. If that review still asks for fixes, the task is parked. |
| BR-economy-3-3 | Round-5 review of economy-3: races between a silently vetoed initiate (`TradeHandler.cpp:841-842`), a timed-out or locally cancelled request that gets no reply (`PlayerStorage.cpp:4223-4240`), and a third player's `BEGIN_TRADE` | Coordinator ruling (P2-17), which replaces BR-economy-3-2. Trade acts are serialised. After a timeout or a local cancel the store enters `settling`: `requestTrade` refuses `busy` until a `TRADE_CANCELED` arrives or 5 s pass, and then the store is idle. An incoming `BEGIN_TRADE` settles any outgoing wait as `superseded`. An outgoing wait settles `ok` only from an opening while its own request is the live phase. A local cancel with no reply settles locally after 5 s. One last fix round implements this model. Rare edges that remain are recorded in `docs/areas/trade.md` "Left out" and the task lands. |
| BR-economy-3-4 | Round-6 review of economy-3, after five fix rounds: a local cancel of a silently vetoed request leaves the original wait armed, and a throwing cancel send leaves the store `settling` | Coordinator ruling (P2-17): economy-3 lands. Both edges need a silent server veto or a closed socket. They are recorded in `docs/areas/trade.md` "Left out", and a follow-up issue covers them. |
| BR-economy-5-1 | Round-5 review of economy-5: the partner puppet call `tradeRequestQuiet` throws on the `busy` refusal that the scenario's own decline produces, so the partner's action fails | Coordinator ruling (P2-17): a fifth and last fix round limited to this finding. `tradeRequestQuiet` treats `busy` as an expected outcome, and the task lands after a pass, or under this ruling with the gap recorded. |
| BR-economy-6-1 | economy-6 handles `SMSG_SHOW_MAILBOX`, so the notice test in `packages/devtools/src/probe-run.test.ts` (tooling-probe), which injects that stub, fails | Coordinator ruling (P2-17): economy-6 may retarget that test's fixture to the stub `SMSG_ZONE_UNDER_ATTACK` (label "Zone under attack"): the fixture opcode, its label and the expected notice only, no other change. pvp-1 (wave 4), which handles that opcode, moves the fixture again. Same pattern as P2-4 for world-2. |
| BR-economy-9-1 | The bank store cannot settle moves because `readInventory` never sees the bank `FIELD_INV` words: `SELF_RANGES` in `packages/core/src/wow/player-state.ts` (no unit's file) omits the bank and bank-bag slot fields | Coordinator ruling (P2-17): economy-9 may extend `SELF_RANGES` in `player-state.ts` with the bank item and bank-bag slot field range (from `update-fields.ts`), with a test, and wire the bank region in `inventory.ts` under its SR3-economy-16 lease. No other edit to `player-state.ts`. |
| BR-economy-9-2 | `packages/core/src/wow/quest-reply-bound.test.ts` (quests) asserts that a bank window answers a gossip option as `unsupported_window`, which economy-9's bank area now handles by design (SR3-economy-17) | Coordinator ruling (P2-17): economy-9 may rewrite that one test so the bank window answers the pending option (the new behaviour), keeping the test's other assertions; no other edit to the file. |
