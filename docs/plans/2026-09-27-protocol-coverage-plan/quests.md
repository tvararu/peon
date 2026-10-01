# Protocol coverage: unit `quests` (key: quests)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design: section 5.5 of
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md).
The design wins over this file, and the contract wins over this file
(contract "Precedence").

## Summary

The unit delivers the code area `quests`: quest-giver marks, quest
objective regions (POI), NPC greeting text, guard directions, quest
sharing in a group, the escort prompt, the completed-quest list, the log
extras and the daily quests done today. It owns 18 opcodes: 17 relevant
and 1 dead. Every row is `missing` today.

- Worktree `proto-quests`, branch `proto/area-quests`, created as
  contract 0.1 says. One task at a time; each task starts from the
  current `origin/factory/426-protocol-coverage`.
- Phases (design 5.1): wave 1 holds quests-1 to quests-6 and quests-9;
  wave 2 holds quests-7a, quests-7b and quests-8; wave 4 holds quests-10.
- Code area `quests` (the harness core domain is `quest`, so `quests` is
  free). Names (contract D7): `questsArea` in `areas/quests/area.ts`,
  `QUESTS_OPCODES` in `areas/quests/opcodes.ts`, `questsHarness` in
  `packages/harness/src/areas/quests/area.ts`. Core paths below without a
  package prefix are under `packages/core/src/wow/`.
- No new tool. The verbs extend `look`, `journal`, `interact` and the
  `group` tool (`areas/raid/tool.ts`, owned by unit `group`), each under a
  lease (contract 2.7).
- Log rows are `quests/<name>` (the router sets `domain: area`, contract
  1.9): `quests/marks`, `quests/gossip_poi`, `quests/offered`,
  `quests/share_result`. Scenario `game_log` selectors use these names.

## Rules for every task of this unit

**One store.** An area has one `store` (contract 1.2). `areas/quests/store.ts`
exports `QuestsStore`, `QuestsState` and `QuestsEvent`. Each task adds one
slice to the state and one member to the event union, and keeps the slice
logic in a sibling (`store-marks.ts`, `store-poi.ts`, `store-text.ts`,
`store-share.ts`, `store-log.ts`), so no file passes 500 lines. The final
state shape:

```ts
type QuestsState = {
  marks: ReadonlyMap<bigint, { status: number; at: number; source: "multiple" | "single" }>;
  pois: ReadonlyMap<number, { status: "pending" | "known" | "none" | "no_reply"; pois: QuestPoi[]; at: number }>;
  texts: ReadonlyMap<number, { status: "pending" | "known" | "no_reply"; options: NpcTextOption[]; at: number }>;
  gossipPoi: (GossipPoi & { at: number; from: bigint | undefined }) | undefined;
  share: QuestShareState;
  completed: { ids: ReadonlySet<number>; at: number } | undefined;
  daily: readonly number[];
};
```

Event `type` values, in the order the tasks add them: `marks`, `poi`,
`npc_text`, `gossip_poi`, `share`, `completed`, `daily`. Every event
carries plain numbers, strings and guids only (contract 1.2). A builder
may name private helpers freely; it never adds a second public name for
one of the above.

**Area runtime.** `areas/quests/runtime.ts` exports `questsRuntime` and
`QuestsActs`. It holds every send, timer and policy. It reads the core
quest state through `core.quests` and subscribes to core events with
`ctx.listen("quest", ...)` and `ctx.listen("entity", ...)`. It never
imports `#wow/quests` or another area as a value (contract 1.12).

**Packets.** Parsers and builders live in `areas/quests/protocol.ts`, split
into `protocol-<group>.ts` siblings when it grows. Test packet builders
live in `packages/core/test-support/areas/quests.ts` and are named
`quests<Opcode>Body`, built as the AzerothCore writer builds the packet.

**Tests.** Every core test uses `areaRig("quests")` (contract 1.8). An
opcode in `uses` gets a no-op owner from the rig, so a `peek` test needs
no legacy register call.

**Docs.** quests-1 creates `docs/areas/quests.md` with the four fixed
headings of contract 3.8. Every task adds its proof rows there and
regenerates `docs/protocol-coverage/quests.md` with
`mise protocol:coverage`. Every citation passes
`mise protocol:cite-check` before review.

**Live proof.** Only accounts the task created with `mise factory soap
create`, deleted before the task reports (contract 0.7). Staging uses the
offline realm-service endpoints `mise factory soap setup <ACCOUNT>
position|level|quest/add|quest/reward` (`docs/factory.md` "Game
accounts"), run while the character is offline. The one `soap gm` use is
in quests-10. Each probe flow is a file
`packages/devtools/src/probe-flows/quests-<name>.ts`, run as `mise
protocol:probe <ACCOUNT> --flow quests-<name>`. Quest, NPC and POI ids
below come from AzerothCore base data; each worker confirms them live
before a test or an eval pins them (design 5.5 "Risks").

**Checks before review:** `mise test <each test file>`, `mise typecheck
core`, `mise typecheck harness` for harness tasks, `mise lint:docs` and
`mise ci:checks`.

## Leases this unit needs

The coordinator assigns each lease in the plan index (contract 2.7, D12).
A task whose lease is not assigned stops as `blocked`.

| Task | Legacy file | Edit |
|---|---|---|
| quests-2 | harness `tools/look.ts` and `tools/look-rank.ts`, with the `look` blocks of `contract/details.ts` and `contract/views.ts` (D13) | mark words, the `questgiver` ranking |
| quests-4 | harness `tools/journal.ts`, with its `After` block (D13) | POI lines under `about: "quests"` |
| quests-6 | harness `tools/interact.ts` and `tools/interact-quest.ts` | greeting line, gossip POI line |
| quests-7b | core `quest-store.ts` (`openDialog` only) | no `stale_dialog` for a shared-quest dialog |
| quests-8 | harness `areas/raid/tool.ts` (unit `group`) | `share_quest`, `accept_quest`, `decline_quest` |
| quests-10 | harness `tools/journal.ts` | `done today` on a daily quest |

Contract gap, reported to the coordinator: the lease table of contract 2.7
lists `tools/look.ts` only. `look-rank.ts` is the ranking half of the same
tool. This plan assumes the quests-2 lease covers `tools/look*.ts`, as
`tools/interact*.ts` does for `interact`.

---

## Task quests-1: Quest-giver marks in core

Rulings: SR1-quests-5, SR1-quests-9, SR1-quests-10, SR1-quests-11, SR1-quests-12.

**Files:**
- Create: `areas/quests/protocol.ts`, `areas/quests/protocol.test.ts`,
  `areas/quests/store.ts`, `areas/quests/store-marks.ts`,
  `areas/quests/store.test.ts`, `areas/quests/runtime.ts`,
  `areas/quests/runtime.test.ts`, `packages/core/test-support/areas/quests.ts`,
  `packages/devtools/src/probe-flows/quests-marks.ts`,
  `docs/areas/quests.md`
- Modify: `areas/quests/area.ts`, `areas/quests/opcodes.ts` (`uses`,
  `dead`), `docs/protocol-coverage/quests.md` (regenerated)

**Depends on:** SEED-1 (seeds the `quests` code area; it follows S0-5),
T-2 (tap), T-3 (probe), T-4 (cite-check).

**Opcodes:** `CMSG_QUESTGIVER_STATUS_QUERY`,
`CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY`, `SMSG_QUESTGIVER_STATUS_MULTIPLE`.
Reads the handled `SMSG_QUESTGIVER_STATUS` through `peek` (listed in
`uses`).

**Steps:**

1. **Failing parser test.** In `protocol.test.ts`, build
   `questsQuestgiverStatusMultipleBody([{ guid, status }, ...])` as
   `Player::SendQuestGiverStatusMultiple` writes it (`u32 count`, then
   `u64 guid`, `u8 status` per giver,
   `Entities/Player/Player.cpp:7906-7952`). Assert that
   `parseQuestgiverStatusMultiple` returns every pair with the full 8-byte
   guid, and that a count of 0 gives `[]`. Assert that
   `buildQuestgiverStatusQuery(guid)` writes 8 bytes (reader
   `Handlers/QuestHandler.cpp:36-77`). Run `mise test
   packages/core/src/wow/areas/quests/protocol.test.ts` and see it fail
   on the missing module.
2. **Implement** `parseQuestgiverStatusMultiple` and
   `buildQuestgiverStatusQuery` in `protocol.ts`. The multiple query has
   no body. Reuse `parseQuestgiverStatus` from `#wow/protocol/questgiver`
   (`protocol/questgiver.ts:175-177`) for the single form.
3. **Failing store test** (`store.test.ts`, through `areaRig("quests")`):
   inject the multiple packet with two givers, then one with only the
   second; the first guid loses its mark, because the packet lists every
   giver in view (`Player.cpp:7915-7946`). Inject `SMSG_QUESTGIVER_STATUS`
   for a third guid; `peek` sets it with `source: "single"`. One `marks`
   event fires per change and none for a packet that changes nothing.
4. **Implement** the `marks` slice in `store-marks.ts`: `receiveMultiple`
   replaces the map, `receiveSingle` sets one entry, `forget(guid)` drops
   one. Export `markOf(status)`: `available` (8), `available_low` (2),
   `available_repeatable` (7, 4), `reward` (10, 9, 6, 3), `incomplete`
   (5), `none` (0, 1), after the AzerothCore enum
   (`Quests/QuestDef.h:110-126`). `register` owns the multiple packet with
   `wire.on` and reads the single one with `wire.peek`.
5. **Failing runtime test** (`runtime.test.ts`, fake timers inside
   `try`/`finally`): an `entity` `appear` event for a unit with
   `UNIT_NPC_FLAGS` bit 0x2, or a game object of type 2, with no mark,
   and a `quest` event `accepted`, `removed`, `completed` or `failed`,
   each lead to one `CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY` in `rig.sent`,
   trailing-debounced by 500 ms and at most once every 2 s. An `entity`
   `disappear` calls `forget`. `act.queryGiverStatus(guid)` sends the
   single query only for a known creature or game object;
   `act.queryGiverStatuses()` sends the multiple query.
6. **Implement** `questsRuntime` with the acts `queryGiverStatus` and
   `queryGiverStatuses`, and wire `store`, `register` and `runtime` in
   `area.ts`. The builder checks whether an `entity` `update` event
   reports a changed `UNIT_NPC_FLAGS`; if it does, a change that adds bit
   0x2 also triggers the query (design 5.5 "Body gaps"). If it does not,
   the builder reports that and does not add a core edit.
7. **Opcodes and docs.** `uses: ["SMSG_QUESTGIVER_STATUS"]`;
   `dead: ["SMSG_QUEST_FORCE_REMOVE"]` if the seed left it out. Create
   `docs/areas/quests.md`: the wire notes of design 5.5 (POI `int32`
   fields, the 13-byte client push result, the result enum 0-10), the
   dead row, and the proof rows of this task.
8. **Probe flow** `quests-marks`: after login, wait for the login
   multiple packet, send `queryGiverStatuses()` and
   `queryGiverStatus(<Magistrix Erona's guid>)`, and print the marks.

**Proof (live):**
- Create an account on preset `fresh`. Run `mise protocol:probe <ACCOUNT>
  --flow quests-marks --expect SMSG_QUESTGIVER_STATUS_MULTIPLE --expect
  SMSG_QUESTGIVER_STATUS`. The login packet arrives unasked
  (`Player.cpp:11920`); the query replies come from
  `QuestHandler.cpp:622` and `Entities/Creature/GossipDef.cpp:378-386`.
- Stage `soap setup <ACCOUNT> quest/add 8325` offline, log in again, and
  see Erona's mark change from 8 to 5 or 10 after the debounced query.
- Proof rows: `CMSG_QUESTGIVER_STATUS_QUERY` `live`,
  `CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY` `live`,
  `SMSG_QUESTGIVER_STATUS_MULTIPLE` `live`, each with the probe flow and
  its exit code; `SMSG_QUEST_FORCE_REMOVE` `dead`.

**Commit:**

```
feat: Track quest giver marks

The server lists every quest giver in view with its mark, and Peon
dropped the packet. The quests area now keeps the marks current with one
debounced status query.
```

---

## Task quests-3: Quest POI in core

Rulings: SR1-quests-7, SR1-quests-9.

**Files:**
- Create: `areas/quests/store-poi.ts`,
  `packages/devtools/src/probe-flows/quests-poi.ts`
- Modify: `areas/quests/protocol.ts` and test, `areas/quests/store.ts`
  and test, `areas/quests/runtime.ts` and test, `areas/quests/area.ts`,
  `packages/core/test-support/areas/quests.ts`, `docs/areas/quests.md`,
  `docs/protocol-coverage/quests.md` (regenerated)

**Depends on:** quests-1.

**Opcodes:** `CMSG_QUEST_POI_QUERY`, `SMSG_QUEST_POI_QUERY_RESPONSE`.

**Steps:**

1. **Failing parser test.** `questsQuestPoiQueryResponseBody` writes the
   reply as `HandleQuestPOIQuery` does (`Handlers/QueryHandler.cpp:427-479`):
   objective index and point `x`, `y` as `int32`
   (`QueryHandler.cpp:452,462-463`). The fixture holds objective index -1
   and a negative y, as quest 8325 does in base data. A second fixture has
   a quest with `poiCount` 0 (a quest not in the log,
   `QueryHandler.cpp:434-438,471-476`). Assert signed values and the
   empty list. `buildQuestPoiQuery(ids)` removes duplicates, refuses more
   than 25 ids (`Quests/QuestDef.h:33`, the server drops a larger count
   with no reply, `QueryHandler.cpp:416-420`) and writes `u32 count`,
   `u32[] ids`. wowm types the fields `u32`; AzerothCore wins.
2. **Implement** `parseQuestPoiResponse` and `buildQuestPoiQuery`.
3. **Failing store and runtime tests.** A `quest` `accepted` or `log`
   event with a new quest id queues it; the runtime sends the queue in
   packets of at most 25 ids. The reply is matched by quest id, never by
   order (the server answers in `unordered_set` order,
   `QueryHandler.cpp:423-425,432`). An id with 0 POIs becomes `none`; an
   id with no reply after `QUEST_REPLY_TIMEOUT_MS` (5000,
   `quests-requests.ts:65`) becomes `no_reply`, and the next log change
   queries it once more. `act.queryPoi(ids)` returns the known entries.
4. **Implement** the `pois` slice, the `poi` event and the act.
5. **Probe flow** `quests-poi`: log in, call `queryPoi([8325])`, print
   the reply.

**Proof (live):** stage `soap setup <ACCOUNT> quest/add 8325` on a
`fresh` account, then `mise protocol:probe <ACCOUNT> --flow quests-poi
--expect SMSG_QUEST_POI_QUERY_RESPONSE`. Check that objective index -1
parses and that its centroid is near the quest ender's live position
(design 5.5 "POI meaning is partly inferred"; record the result). Rows:
both opcodes `live`.

**Commit:**

```
feat: Read quest objective regions

The server returns the map regions where each objective of a logged
quest is done. The quests area queries them when a quest enters the log
and reads the signed fields as AzerothCore writes them.
```

---

## Task quests-5: NPC text and gossip POI in core

Rulings: SR1-quests-6, SR1-quests-7, SR1-quests-9.

**Files:**
- Create: `areas/quests/store-text.ts`,
  `packages/devtools/src/probe-flows/quests-text.ts`,
  `packages/devtools/src/probe-flows/quests-gossip-poi.ts`
- Modify: `areas/quests/protocol.ts` and test, `areas/quests/store.ts`
  and test, `areas/quests/runtime.ts` and test, `areas/quests/area.ts`,
  `packages/core/test-support/areas/quests.ts`, `docs/areas/quests.md`,
  `docs/protocol-coverage/quests.md` (regenerated)

**Depends on:** quests-1.

**Opcodes:** `CMSG_NPC_TEXT_QUERY`, `SMSG_NPC_TEXT_UPDATE`,
`SMSG_GOSSIP_POI`.

**Steps:**

1. **Failing parser tests.** `questsNpcTextUpdateBody` writes `u32 textId`
   and exactly 8 options of `f32 probability`, `CString text0`,
   `CString text1`, `u32 language`, 3 x (`u32 delay`, `u32 emote`)
   (`Handlers/QueryHandler.cpp:286-355`, sizes `Handlers/NPCHandler.h:30,42`).
   A second fixture is the unknown-id reply: 8 options with probability 0
   and the text `Greetings $N` (`QueryHandler.cpp:289-305`).
   `questsGossipPoiBody` writes `u32 flags`, `f32 x`, `f32 y`, `u32 icon`,
   `u32 importance`, `CString name`
   (`Entities/Creature/GossipDef.cpp:247-270`). `buildNpcTextQuery(textId,
   guid)` writes `u32`, `u64` (reader `QueryHandler.cpp:274-282`).
2. **Implement** `parseNpcTextUpdate`, `parseGossipPoi` and
   `buildNpcTextQuery`.
3. **Failing store and runtime tests.** A `quest` `dialog` event whose
   `core.quests` dialog is a gossip dialog with a `titleTextId` not in the
   cache sends one `CMSG_NPC_TEXT_QUERY` with the dialog's guid; a second
   dialog with the same id in flight sends nothing; no reply in 5 s gives
   `no_reply`. The cache lives for the session. `greeting(textId)` returns
   the non-empty text of the highest probability, with `$N`, `$C` and
   `$R` kept. An injected `SMSG_GOSSIP_POI` sets `gossipPoi` with `from`
   equal to `core.quests` `giver` at arrival (the POI arrives while that
   dialog is open, `Entities/Player/PlayerGossip.cpp:305-310`).
4. **Implement** the `texts` and `gossipPoi` slices, the `npc_text` and
   `gossip_poi` events, and `act.queryNpcText(textId, guid)`.
5. **Probe flows.** `quests-text`: talk to Magistrix Erona, print her
   greeting; then query text id 999999 and print the fallback.
   `quests-gossip-poi`: talk to a Stormwind Guard (entry 1423), select the
   "Inn" option (menu 3506, option 3, `ActionPoiID` 1 in base data), and
   print the point.

**Proof (live):**
- `fresh` account: `mise protocol:probe <ACCOUNT> --flow quests-text
  --expect SMSG_NPC_TEXT_UPDATE`.
- `elwynn1` or `elwynn10` account, staged with `soap setup <ACCOUNT>
  position` next to a Stormwind Guard: `mise protocol:probe <ACCOUNT>
  --flow quests-gossip-poi --expect SMSG_GOSSIP_POI`.
- Rows: all three `live`. If the guard or the option is not on the live
  server, the worker tries the Stormwind City Guard (entry 68, menu 435,
  option 1, POI 19 in base data); if neither works, `SMSG_GOSSIP_POI` is
  `mock` from `GossipDef.cpp:247-270`, listed in `unseen`, "not seen
  live".

**Commit:**

```
feat: Read NPC greetings and gossip points

Peon parsed the gossip text id and never used it, and dropped the map
point a guard gives. The quests area now reads the greeting text and the
point of interest.
```

---

## Task quests-9: Quest log extras and completed quests

Rulings: SR1-quests-9, SR1-quests-13.

**Files:**
- Create: `areas/quests/store-log.ts`,
  `packages/devtools/src/probe-flows/quests-extras.ts`
- Modify: `areas/quests/protocol.ts` and test, `areas/quests/store.ts`
  and test, `areas/quests/runtime.ts` and test, `areas/quests/area.ts`,
  `areas/quests/opcodes.ts` (`unseen` only if a row falls back),
  `packages/core/test-support/areas/quests.ts`, `docs/areas/quests.md`,
  `docs/protocol-coverage/quests.md` (regenerated)

**Depends on:** quests-1.

**Opcodes:** `CMSG_QUESTGIVER_HELLO`, `CMSG_QUESTGIVER_QUEST_AUTOLAUNCH`,
`CMSG_QUESTLOG_SWAP_QUEST`, `CMSG_QUERY_QUESTS_COMPLETED`,
`SMSG_QUERY_QUESTS_COMPLETED_RESPONSE`.

**Steps:**

1. **Failing tests.** `questsQueryQuestsCompletedResponseBody` writes
   `u32 count`, `u32[] ids` (`Handlers/QuestHandler.cpp:627-636`);
   `parseQuestsCompleted` returns the ids as a set. Builder tests:
   `buildQuestgiverHello(guid)` writes 8 bytes
   (`QuestHandler.cpp:79-111`); `buildQuestLogSwapQuest(a, b)` writes two
   `u8` and refuses equal slots and slots of 25 or more (the server ignores
   them, `QuestHandler.cpp:386-394`); autolaunch and the completed query
   have empty bodies (`QuestHandler.cpp:525-527,625-637`).
2. **Implement** the parser and builders.
3. **Failing store and runtime tests.** On the `core.self` login event
   (as `timeRuntime` uses, contract 1.10) the runtime sends one
   `CMSG_QUERY_QUESTS_COMPLETED`; the reply sets `completed` and emits
   `completed` with `{ count }`; a `quest` `rewarded` event adds its id.
   `act.queryCompleted()` refuses while one query is in flight. The acts
   `questgiverHello(guid)`, `autoLaunch()` and `swapLogSlots(a, b)` send
   their packets.
4. **Implement** the `completed` slice and the acts.
5. **Probe flow** `quests-extras`: hello to Erona; auto-launch, then a
   ping; swap log slots 0 and 1 and print the quest log from `core.quests`
   before and after; print the completed ids.

**Proof (live):**
- Stage a `fresh` account offline with `soap setup <ACCOUNT> quest/reward
  8325`, then `quest/add` for two quests (8326 and one more from the
  8325 chain, confirmed live).
- `mise protocol:probe <ACCOUNT> --flow quests-extras --expect
  SMSG_QUERY_QUESTS_COMPLETED_RESPONSE --expect SMSG_PONG`.
- Compare the completed ids with `mise factory soap truth <ACCOUNT>`
  `rewardedQuests`: the sets are equal.
- Rows: `CMSG_QUESTGIVER_HELLO` `live` (a gossip or quest dialog follows
  the send in the trace); `CMSG_QUESTGIVER_QUEST_AUTOLAUNCH` `accepted`
  (N24: the session stays up and the next ping gets `SMSG_PONG`);
  `CMSG_QUESTLOG_SWAP_QUEST` `live` (the swapped slots in the quest log);
  both completed opcodes `live`.
- Known limit, recorded under "Left out": the hello reply reaches
  `QuestStore` with no pending intent, so it records `stale_dialog`
  (`quest-store.ts:278-283`). No verb sends hello; `interact do:talk`
  keeps `CMSG_GOSSIP_HELLO`, which reaches the same gossip path
  (`QuestHandler.cpp:104-108`).

**Commit:**

```
feat: Query completed quests and log extras

The completed-quest list lets the agent skip chain steps it has done.
The same task sends the quest-giver hello, auto-launch and log slot swap
that the server accepts.
```

---

## Task quests-2: Quest marks in `look`

Rulings: SR1-quests-1, SR1-quests-2, SR1-quests-3, SR1-quests-4, SR1-quests-8, SR1-quests-10.

**Files:**
- Create: `packages/harness/src/grader/scenarios/t4-quests-find-giver.json`
- Modify: `packages/harness/src/areas/quests/area.ts` and
  `area.test.ts`; `packages/harness/src/tools/look.ts`, `look-rank.ts`,
  `look.test.ts`, and the `look` blocks of `contract/details.ts` and
  `contract/views.ts` (lease); `packages/harness/src/grader/scenarios.ts`
  (append to `ROUND_1`); `docs/capabilities.md`; `docs/evals.md`;
  `docs/areas/quests.md` (proof rows)

**Depends on:** quests-1, item6, the quests-2 lease.

**Opcodes:** none.

**Steps:**

1. **Failing harness tests.** In `look.test.ts`, a mock handle whose
   `quests.state()` holds marks shows `quest available`, `quest to turn
   in`, `quest in progress`, `low-level quest` and `repeatable quest` on
   the right units; `find: "questgiver"` lists units with `available` or
   `reward` first, then by distance; `look-rank.ts` gives such a unit rank
   1 (today it ranks quest NPCs only, `tools/look-rank.ts:50-58`). In
   `area.test.ts`, the `marks` rule writes one `quests/marks` row only
   when the set of givers with `available` or `reward` changes, and
   returns `[]` otherwise (the flood guard).
2. **Implement.** The marks reach `look` through the handle's
   `quests.state()` (and `session.areas.quests` for extensions, N5), never
   through an edit of a frozen file. `questsHarness` gains the `marks`
   rule and `worldActs: ["queryGiverStatuses"]`. The `find` value lives
   where R0 reports the `look` parameters after item 6; if that file is
   outside the lease, stop as `blocked`.
3. **Scenario** `t4-quests-find-giver`: preset `fresh`, `setup` step
   `position` about 50 yd from Magistrix Erona and out of talk range;
   task "Find someone who has a quest for you and take it." Checks:
   `truth` `quests` holds 8325; `game_log` `events: ["quests/marks"]` at
   least once before the first `interact` call. Run `mise test
   packages/harness/src/grader/scenarios.test.ts`.
4. **Docs**, in the same commit as the scenario (D15): the `ROUND_1` line
   at the end; a "Which scenarios to run" row for the quests unit
   (`| Quest marks, objective regions, greetings and sharing (look,
   journal, interact, group) | \`t4-quests-find-giver\` |`); the
   capability row "See which NPCs have a quest or a quest to turn in" if
   the eval passed, or a bullet under "Not shown by any scenario" if not.

**Proof (eval):** `mise eval` runs `t4-quests-find-giver`; the verdict
goes into the report and the `docs/areas/quests.md` "Capabilities row".
Rerun `t1-walk-to-npc` and `t4-quest-first` as regression gates
(contract 3.6).

**Commit:**

```
feat: Show quest marks in look

The agent can now see which NPCs offer a quest or take a turn-in without
walking to each one, and look lists those givers first.
```

---

## Task quests-4: Objective regions in `journal`

Rulings: SR1-quests-3, SR1-quests-4, SR1-quests-8.

**Files:**
- Create: `packages/harness/src/grader/scenarios/t4-quests-poi-walk.json`
- Modify: `packages/harness/src/tools/journal.ts`, `journal.test.ts` and
  its `After` block in `contract/details.ts` (lease);
  `packages/harness/src/areas/quests/area.ts` (`worldActs` gains
  `queryPoi`); `grader/scenarios.ts` (`ROUND_1`); `docs/capabilities.md`;
  `docs/evals.md`; `docs/areas/quests.md`

**Depends on:** quests-3, quests-2 (the unit's first harness task), item6, the quests-4 lease.

**Opcodes:** none.

**Steps:**

1. **Failing test** in `journal.test.ts`: with a POI state on the mock
   handle, `journal about: "quests"` adds to each quest line the nearest
   objective region on the character's map, as the centroid of the POI
   points (`objective 1 around 10385, -6316 (120 yd north)`), the turn-in
   region for objective index -1, and a `nextCall("travel", { to: "x, y"
   })`. A quest whose POI is `none` says `no map region`.
2. **Implement.** `travel` already takes coordinates, so it needs no
   change.
3. **Scenario** `t4-quests-poi-walk`: preset `fresh`, `setup`
   `quest/add` 8326; task "Go to where your quest's objective is, then
   stop." Checks: `truth` `point` within 40 yd of the objective-0
   centroid, taken from a live `SMSG_QUEST_POI_QUERY_RESPONSE` capture,
   not base data; `game_log` `events: ["tool/call"]` shows a `journal`
   call before the walk.
4. **Docs** in the scenario commit (D15): `ROUND_1`, the id added to the
   quests row of "Which scenarios to run", the capability row "Walk to
   where a quest's objective is" or its bullet.

**Proof (eval):** `t4-quests-poi-walk` with `mise eval`; rerun
`t4-quest-first`.

**Commit:**

```
feat: Show quest objective regions in journal

The agent explored blind for quest objectives. The journal now names the
nearest objective region and offers a travel call to it.
```

---

## Task quests-6: Greetings and directions in `interact`

Rulings: SR1-quests-3, SR1-quests-4, SR1-quests-8.

**Files:**
- Create: `grader/scenarios/t1-quests-read-greeting.json`,
  `grader/scenarios/t1-quests-guard-directions.json`
- Modify: `packages/harness/src/tools/interact.ts`,
  `interact-quest.ts` and their tests (lease);
  `packages/harness/src/areas/quests/area.ts` and test (the `gossip_poi`
  rule); `grader/scenarios.ts` (`ROUND_1`, two lines);
  `docs/capabilities.md`; `docs/evals.md`; `docs/areas/quests.md`

**Depends on:** quests-5, quests-2, item6, the quests-6 lease.

**Opcodes:** none.

**Steps:**

1. **Failing tests.** `interact do:"talk"` shows the NPC's greeting from
   `quests.state()` with `$N` replaced by the character name, `$C` by the
   class and `$R` by the race; the fallback text `Greetings $N` is not
   shown. `interact do:"gossip"` on an option that brings a gossip POI
   shows `marked: <name> at x, y (N yd)` and a `nextCall("travel", { to:
   "x, y" })`. The `gossip_poi` rule writes one `quests/gossip_poi` row.
2. **Implement.** If the greeting is still `pending` when the talk result
   renders, the tool waits for the `npc_text` event up to the existing
   reply timeout, then renders without it.
3. **Scenarios**, one commit each (D15):
   - `t1-quests-read-greeting`: preset `fresh` next to Magistrix Erona;
     task "Talk to Magistrix Erona and tell me what she says." Checks: a
     `verifier` check that the answer holds a phrase copied from a live
     `SMSG_NPC_TEXT_UPDATE` capture; `game_log` `tool/call` holds
     `interact` `talk`.
   - `t1-quests-guard-directions`: preset `elwynn1` or `elwynn10`,
     `setup` `position` next to a Stormwind Guard; task "Ask a guard where
     the inn is and go there." Checks: `game_log` `events:
     ["quests/gossip_poi"]`; `truth` `point` within 15 yd of the live POI
     point.

**Proof (eval):** both scenarios with `mise eval`; rerun
`t1-walk-to-npc`.

**Commit** (the code, then one commit per scenario):

```
feat: Show NPC greetings and guard directions

The talk result now carries what the NPC says, and a guard's directions
come back as a map point with a travel call.
```

Scenario commits: `test: Add the read-greeting eval` and `test: Add the
guard-directions eval`, each with the body "The scenario proves the new
interact output live, as rule 9 asks for a new verb."

---

## Task quests-7a: Quest sharing in core

**Files:**
- Create: `areas/quests/store-share.ts`, `areas/quests/runtime-share.ts`
  and test, `packages/devtools/src/probe-flows/quests-share.ts`
- Modify: `areas/quests/protocol.ts` and test, `areas/quests/store.ts`
  and test, `areas/quests/area.ts`, `areas/quests/opcodes.ts` (`uses`),
  `packages/core/test-support/areas/quests.ts`,
  `packages/harness/src/puppet/calls.ts` (sorted keys:
  `quests.shareQuest`, `quests.answerShare`), `docs/areas/quests.md`,
  `docs/protocol-coverage/quests.md` (regenerated)

**Depends on:** quests-1, SEED-2 (wave 2), T-7 (puppet `call`).

**Opcodes:** `CMSG_PUSHQUESTTOPARTY`, `MSG_QUEST_PUSH_RESULT` (both
directions). Reads `SMSG_QUESTGIVER_QUEST_DETAILS` and
`SMSG_QUESTGIVER_REQUEST_ITEMS` through `peek` (in `uses`).

**Steps:**

1. **Failing parser tests.** `questsQuestPushResultBody(guid, result)`
   writes the server form, `u64 guid`, `u8 result`
   (`Server/Packets/QuestPackets.cpp:70-76`, sender
   `Entities/Player/PlayerQuest.cpp:2505-2515`). `buildQuestPushResult(guid,
   questId, result)` writes 13 bytes, `u64`, `u32`, `u8`, as the server
   reads it (`QuestPackets.cpp:98-105`, handler
   `Handlers/QuestHandler.cpp:605-618`); wowm has no quest id, and
   AzerothCore wins. `buildPushQuestToParty(questId)` writes `u32`
   (`QuestPackets.cpp:123-126`). `QuestShareResult` holds AzerothCore's
   values 0-10 with its names (`Quests/QuestDef.h:64-77`).
2. **Implement** the parser, builders and enum.
3. **Failing store and runtime tests.**
   - Sharer: `act.shareQuest(id)` refuses when the quest is not in the
     `core.quests` log, when `ctx.legacy.party()` has no group, or while
     a push is in flight; it sends the push; each `MSG_QUEST_PUSH_RESULT`
     adds `{ guid, result }`; no result in 3 s gives `no_answer`, because
     the server sends nothing for a quest that cannot be shared
     (`PlayerQuest.cpp:1532-1552`, `QuestHandler.cpp:538`). Result 2
     (`ACCEPT_QUEST`) and 3 (`DECLINE_QUEST`) arrive later as `relayed`.
   - Receiver: a peeked details packet with a non-zero divider and no
     pending `core.quests` intent opens a `share` offer (`from` = the
     divider, the sharer; `QuestHandler.cpp:596-598`,
     `Entities/Creature/GossipDef.cpp:405-406`). A peeked request-items
     packet whose guid is a group member with no pending intent emits a
     `share_complete` notice and opens no offer
     (`QuestHandler.cpp:593-594`). `act.answerShare("decline")` sends the
     13-byte push result with result 3 to the divider. An offer with no
     answer for 60 s gets that decline and an `expired` event, because an
     open offer makes the server answer `BUSY` to every later share
     (`QuestHandler.cpp:582-586`). `SMSG_GOSSIP_COMPLETE` does not end
     an offer.
4. **Implement** the `share` slice, the `share` event with `type:
   "offered" | "pushed" | "result" | "relayed" | "answered" | "expired"`,
   and the acts. `answerShare("accept")` is left to quests-7b and throws
   "not built" until then; quests-7a does not ship a working accept.
5. **Partner calls.** Add `quests.shareQuest` and `quests.answerShare` to
   the allow-list in `puppet/calls.ts` in the form T-7 defines for area
   acts. If T-7 has no form for an area act, stop as `blocked` and name the
   file.
6. **Probe flow** `quests-share`: log in, wait for the group, share 8326,
   print each push result.

**Proof (live):**
- Two accounts on preset `fresh`, both staged offline with `soap setup
  quest/add 8326` on the sharer only (8326 is sharable, Flags 0x88, and
  carries no auto-accept flag; design 5.5 "Decisions").
- The partner puppet runs `call invite` and `call acceptInvite` (T-7) to
  form the group. The sharer runs `mise protocol:probe <SHARER> --flow
  quests-share --expect MSG_QUEST_PUSH_RESULT`: result 0 `SHARING_QUEST`
  for the partner (`QuestHandler.cpp:588`).
- The partner's `events --json` shows the `share` offer; the partner runs
  `call quests.answerShare ["decline"]`; the sharer captures result 3
  relayed (`QuestHandler.cpp:605-618`). This proves the client form.
- Rows: `CMSG_PUSHQUESTTOPARTY` `live`, `MSG_QUEST_PUSH_RESULT` `live`.

**Commit:**

```
feat: Share quests with the group in core

A shared quest was dropped and could not be answered. The quests area
now pushes a quest, reads each member's answer and declines an offer in
the form AzerothCore reads.
```

---

## Task quests-7b: Accept a shared quest and the escort prompt

**Files:**
- Create: `packages/core/src/wow/quest-store.test.ts` (under the lease)
- Modify: `packages/core/src/wow/quest-store.ts` (`openDialog` only,
  lease); `areas/quests/protocol.ts` and test,
  `areas/quests/store-share.ts`, `areas/quests/runtime-share.ts` and
  test, `areas/quests/opcodes.ts` (`uses`, and `unseen` if the escort
  falls back), `packages/core/test-support/areas/quests.ts`,
  `packages/devtools/src/probe-flows/quests-share.ts`,
  `docs/areas/quests.md`, `docs/protocol-coverage/quests.md`
  (regenerated)

**Depends on:** quests-7a, the quests-7b lease.

**Opcodes:** `SMSG_QUEST_CONFIRM_ACCEPT`, `CMSG_QUEST_CONFIRM_ACCEPT`.
Sends the handled `CMSG_QUESTGIVER_ACCEPT_QUEST` (in `uses`).

**Steps:**

1. **Failing tests.**
   - `questsQuestConfirmAcceptBody` writes `u32 questId`, `CString
     title`, `u64 guid` (`Server/Packets/QuestPackets.cpp:61-68`, sender
     `Entities/Player/PlayerQuest.cpp:2483-2503`); `parseQuestConfirmAccept`
     reads it. `buildQuestConfirmAccept(questId)` writes `u32`
     (`QuestPackets.cpp:118-121`).
   - The confirm packet opens a `confirm` offer; the `SMSG_GOSSIP_COMPLETE`
     the server sends just before it (`Handlers/QuestHandler.cpp:172-186`)
     does not clear it.
   - `answerShare("accept")` on a `share` offer sends
     `CMSG_QUESTGIVER_ACCEPT_QUEST` with the **divider** guid, built with
     `buildQuestgiverAcceptQuest` from `#wow/protocol/questgiver`
     (`protocol/questgiver.ts:130`). The server rejects the receiver's own
     guid and accepts a player guid that can share the quest
     (`QuestHandler.cpp:125-131`). On a `confirm` offer it sends
     `CMSG_QUEST_CONFIRM_ACCEPT`. The result is `answered`; the quest
     entering the log is the existing `quest` `accepted` event.
   - `quest-store.test.ts`: a details dialog whose `dividerGuid` is not 0,
     with no `giver` and no pending intent, leaves `lastError` unset and
     emits no `error` event; every other stale dialog still records
     `stale_dialog`.
2. **Implement.** In `quest-store.ts` `openDialog` (`:269-293`), return
   without the error for that one case. Change nothing else in the file.
3. **Probe flow.** Extend `quests-share` with an `escort` mode that takes
   8488 from Apprentice Mirveda and prints the partner's confirm.

**Proof (live):**
- Accept path: as quests-7a, but the partner runs `call
  quests.answerShare ["accept"]`; the sharer captures result 2
  `ACCEPT_QUEST` (`QuestHandler.cpp:159`), and `soap truth <PARTNER>`
  `quests` holds 8326.
- Escort: both accounts staged offline with `soap setup level` 9 and
  `soap setup position` next to Apprentice Mirveda (entry 15402, map 530
  near x 8711 in base data); 8488 "Unexpected Results" carries
  `QUEST_FLAGS_PARTY_ACCEPT` (Flags 2). The sharer takes 8488 with the
  `escort` flow; the partner captures `SMSG_QUEST_CONFIRM_ACCEPT`, answers
  it, and `soap truth <PARTNER>` `quests` holds 8488. The server adds the
  quest only when the divider is in the group and within reward distance
  (`QuestHandler.cpp:446-476`).
- Rows: both opcodes `live`. If 8488 or Mirveda is not on the live
  server, `SMSG_QUEST_CONFIRM_ACCEPT` is `mock` from
  `PlayerQuest.cpp:2483-2503` through `areaRig`, in `unseen`, "not seen
  live", and `CMSG_QUEST_CONFIRM_ACCEPT` is `builder` from
  `QuestPackets.cpp:118-121`.
- Risk (design 5.5): accepting with the divider guid is inferred. If the
  server closes the dialog instead, the worker records the packets and
  stops the task as `blocked`; quests-8 then waits.

**Commit:**

```
feat: Accept shared quests and escort prompts

The server sends a shared quest with the sharer as the divider, and it
rejects an accept with the receiver's own guid. Peon now accepts with
the divider and answers the escort prompt.
```

---

## Task quests-8: Share verbs in the `group` tool

**Files:**
- Create: `grader/scenarios/t8-quests-share.json`,
  `grader/scenarios/t8-quests-accept-shared.json`
- Modify: `packages/harness/src/areas/raid/tool.ts` and its test (lease);
  `packages/harness/src/areas/quests/area.ts` and test (`offered` and
  `share_result` rules; `worldActs` gains `shareQuest`, `answerShare`);
  `grader/scenarios.ts` (`ROUND_1`, two lines); `docs/capabilities.md`;
  `docs/evals.md`; `docs/areas/quests.md`

**Depends on:** quests-7b, group-9 (creates the `group` tool), item6, T-7,
the quests-8 lease.

**Opcodes:** none.

**Steps:**

1. **Failing tests.** `group do:"share_quest"` with a `quest` parameter
   (an id, or a title from `journal`) refuses outside a group or when the
   quest is not in the log, calls `quests.act.shareQuest`, and lists each
   member's answer (`sharing`, `busy`, `has it`, `done it`, `log full`,
   `cannot take it`, then `accepted` or `declined`) or `no answer: the
   quest cannot be shared` after 3 s. `do:"accept_quest"` and
   `do:"decline_quest"` answer the open offer and report `accepted` when
   the quest enters the log, `declined`, or `UNCONFIRMED` after 5 s. The
   `offered` rule writes a wake row `quests/offered` naming the sharer,
   the quest and the answer verbs; the `share_result` rule writes
   `quests/share_result`. The tool test calls `expectSendKind` once.
2. **Implement** inside `ctx.rt.mutex.run`, as the tool's other sends do.
   The tool stays kind `action` (D25).
3. **Scenarios**, one commit each (D15):
   - `t8-quests-share`: presets `fresh` for the agent and the partner;
     `setup` `quest/add` 8326 on the agent; the partner accepts the invite
     and the quest through puppet `call`. Task: "Invite <partner> to your
     group and share Unfortunate Measures with them." Check: `game_log`
     `events: ["quests/share_result"]` holds `accepted`. The server sends
     result 2 to the sharer only after the partner accepted
     (`Handlers/QuestHandler.cpp:159`), so no partner-truth check is
     needed.
   - `t8-quests-accept-shared`: the roles swapped; `quest/add` 8326 on the
     partner, who invites and shares through puppet `call`. Task: "<partner>
     will share a quest with you. Take it." Check: `truth` `quests` holds
     8326.
   The escort prompt has no scenario of its own; quests-7b proves it live.
   A scenario id for it comes only from the plan index (contract 3.7).

**Proof (eval):** both scenarios with `mise eval`. Tiers are the plan
index's (D14); the ids above are design 5.5's.

**Commit:**

```
feat: Share and accept quests in the group tool

The agent can now push a quest to its group, see each member's answer,
and take a quest or an escort another member shares.
```

---

## Task quests-10: Daily quests done today

**Files:**
- Create: `areas/quests/store-daily.ts`,
  `packages/devtools/src/probe-flows/quests-daily.ts`
- Modify: `areas/quests/store.ts` and test, `areas/quests/runtime.ts`
  and test, `areas/quests/area.ts`,
  `packages/harness/src/tools/journal.ts` and test (lease),
  `docs/areas/quests.md`

**Depends on:** quests-9, quests-4, item6, T-5 (`soap gm`), the quests-10 lease.

**Opcodes:** none (update field `PLAYER_FIELD_DAILY_QUESTS_1`, 25 x `u32`
at offset 1280, `protocol/update-fields.ts:320`).

**Steps:**

1. **Failing test.** A self `entity` `update` event whose `rawFields`
   hold quest ids at offsets 1280-1304 sets `daily` to those ids (0 means
   empty) and emits `daily`. `journal about: "quests"` shows `done
   today` for a quest in `daily`.
2. **Implement.** The area reads the field from the self entity's
   `rawFields` through `core` with type-only imports, so it needs no
   lease on `player-state.ts` (contract 2.7 gives that file to other
   units). If the self entity does not carry these offsets in
   `rawFields`, stop as `blocked` and ask for a `player-state.ts` lease.

**Proof (live):** stage an account with `soap setup level` 70, then, with
the character online, `mise factory soap gm <ACCOUNT> quest add <id>` and
`quest reward <id>` for one daily quest that the worker picks from the
AzerothCore base data (`quest_template` rows with the daily flag; the id
could not be determined while planning). Read `daily` with a probe flow
`quests-daily`. If no daily is reachable,
the proof is a unit test from an update-object fixture, marked "not seen
live" in the proof table's evidence.

**Commit:**

```
feat: Show daily quests done today

The server lists the daily quests done today in an update field that no
module read. The journal now marks those quests.
```

---

## Dead opcodes

| Opcode | Reason |
|---|---|
| `SMSG_QUEST_FORCE_REMOVE` 0x21E | AzerothCore never sends it: no file in `src/` or `modules/` names it outside the opcode table, which marks it `STATUS_NEVER` (`Server/Protocol/Opcodes.cpp:673`). wowm has a layout (`quest/smsg_quest_force_remove.wowm:1-4`), but no parser is built. quests-1 writes its `dead` row. |

`CMSG_QUESTGIVER_QUEST_AUTOLAUNCH` is not dead. Its handler is empty
(`Handlers/QuestHandler.cpp:525-527`), so quests-9 proves it `accepted`
(N24).

## Seed rulings (SEED-1)

The coordinator rules each open issue, lease request and decision of this
file that a wave-1 task (quests-1, quests-3, quests-5, quests-9,
quests-2, quests-4, quests-6) meets, before `SEED-1` (plan index
"Contract issues awaiting a ruling"). Each ruling stands in for the
contract or design text it names until the coordinator applies that
text. Until then, the builder follows the ruling. Each ruling is **not
yet ruled by the maintainer**. `[M]` marks a fact measured in this worktree at
`f3cb40a9`, before step 0 landed.

Left alone, because only later waves meet them: the quests-7b lease on
`quest-store.ts` (`openDialog`), the quests-8 lease on
`areas/raid/tool.ts` and its group-9 dependency, the quests-10 lease on
`tools/journal.ts` and its `player-state.ts` question, the quests-7a
`puppet/calls.ts` form that T-7 defines, and the design 5.5 decisions
"share tests use quest 8326" and "the share verbs follow the group tool".

### SR1-quests-1: the `look` lease covers `look-rank.ts` and the SEED-1 siblings (quests-2)

Issue: "Contract gap, reported to the coordinator: the lease table of
contract 2.7 lists `tools/look.ts` only. `look-rank.ts` is the ranking
half of the same tool. This plan assumes the quests-2 lease covers
`tools/look*.ts`." Section "Leases this unit needs".

Ruling: the gap is closed. Contract 2.7 "Leases added by the plan
fix-up" has the row "harness `tools/look.ts` and `tools/look-rank.ts`
(one row with `tools/look.ts`)", and the plan index "Leases" table
queues `h: tools/look-rank.ts` as objects-7 → quests-2 [M].

- quests-2 holds `tools/look.ts` and `tools/look-rank.ts` under one
  lease, not all of `tools/look*.ts`.
- If `SEED-1` splits `tools/look.ts` by view, the lease on `look.ts`
  covers the sibling files that `SEED-1` names in the plan index
  "Leases" section (contract 2.7, last paragraph). quests-2 edits only
  the sibling that renders the unit rows and the one that orders the
  `find` results.
- An edit in another `look` sibling stops quests-2 as `blocked`, with
  the file and the member named.

Not yet ruled by the maintainer.

### SR1-quests-2: no `params.ts` lease for `find: "questgiver"` (quests-2)

Issue: "The `find` value lives where R0 reports the `look` parameters
after item 6; if that file is outside the lease, stop as `blocked`."
Task quests-2, step 2.

Ruling: refused as a lease request, because the value exists.
`"questgiver"` is in `LOOK_KINDS` (`tools/params.ts:3-7` [M]), the
`find` validation accepts it (`tools/params.ts:214-218` [M]), and
`LookFilter` and `NearestKind` hold it (`contract/details.ts:19-23`,
`contract/views.ts:83-86` [M]).

- quests-2 does not edit `tools/params.ts`. It changes only the order
  and the words of the `find: "questgiver"` result, in `look.ts` (or its
  `SEED-1` sibling) and `look-rank.ts`.
- The `blocked` branch of step 2 does not apply. If the builder finds
  that it must change the `look` parameter block, it stops as `blocked`
  and names `tools/params.ts` and the member. The plan index queue for
  `tools/params.ts` does not hold quests-2 [M].

Not yet ruled by the maintainer.

### SR1-quests-3: lease queues and the D13 blocks (quests-2, quests-4, quests-6)

Issue: the lease rows for quests-2, quests-4 and quests-6 in section
"Leases this unit needs", and "the `look` blocks of `contract/details.ts`
and `contract/views.ts` (lease)" (task quests-2, **Files:**), "its
`After` block in `contract/details.ts` (lease)" (task quests-4,
**Files:**). Task quests-6 names no `details.ts` edit, and the plan index
queue for `h: contract/details.ts` does not hold quests-6 [M].

Ruling: each lease follows the plan index "Leases" queue. A quests task
gets a lease only when the task before it in the row lands and the
coordinator writes the handover line.

- quests-2 holds `tools/look.ts` after objects-7 (queue threat-3b →
  objects-7 → quests-2 → travel-5), `tools/look-rank.ts` after objects-7
  (objects-7 → quests-2, last holder), `contract/details.ts` after
  items-5b (items-5b → quests-2 → quests-4) and `contract/views.ts` after
  threat-3b (threat-3b → quests-2 → self-state-11b). So quests-2 starts
  only after threat-3b, objects-7 and items-5b have all landed. Its
  "Depends on" line does not name them. The rule "a task whose lease is
  not assigned stops as `blocked`" enforces the order. In `details.ts`
  it edits only `LookAfter` and the types that only `LookAfter` uses. In
  `views.ts` it edits only the views that `look` reads (D13).
- quests-4 holds `tools/journal.ts` after items-5b (items-5b → quests-4
  → spells-12a) and `contract/details.ts` after quests-2 (quests-2 →
  quests-4 → spells-12a). In `details.ts` it edits only `JournalAfter`
  (`contract/details.ts:288` [M]). It does not edit `views.ts`.
- quests-6 holds `tools/interact.ts` after objects-7 (objects-7 →
  quests-6 → travel-5) and `tools/interact-quest.ts` after objects-7
  (objects-7 → quests-6, last holder). Under the D13 rider of its
  `interact` lease it may edit the `InteractAfter` block
  (`contract/details.ts:178-194` [M]) and nothing else in `details.ts`.
  It does not edit `views.ts`. It is not added to the `details.ts` file
  queue. The coordinator records the block lease as its own handover
  line (objects-7 → quests-6 → travel-5, as the `interact.ts` row).
  On a rebase conflict in `details.ts`, quests-6 keeps the other
  holders' text and changes only its block.

Not yet ruled by the maintainer.

### SR1-quests-4: the test files beside a leased file (quests-2, quests-4, quests-6)

Issue: the **Files:** lists name `look.test.ts` (quests-2),
`journal.test.ts` (quests-4) and "their tests" of `interact.ts` and
`interact-quest.ts` (quests-6). Contract 2.7 names the leased source
files only, and the contract names a test file where it grants one
(GR-2, GR-3, the `world-handlers-group.test.ts` and
`gameplay-handlers-stores.test.ts` fix-up rows).

Ruling: granted. Each lease below also covers the one test file beside
the leased file, with the same holder and the same queue:

- quests-2: `tools/look.test.ts` with `tools/look.ts` (and the test file
  of each `SEED-1` sibling that SR1-quests-1 gives it, if `SEED-1`
  creates one).
- quests-4: `tools/journal.test.ts` with `tools/journal.ts`.
- quests-6: `tools/interact.test.ts` with `tools/interact.ts`, and
  `tools/interact-quest.test.ts` with `tools/interact-quest.ts`.

This stands in for one sentence in contract 2.7: "A lease on a legacy
file also covers its sibling `.test.ts` file."

Not yet ruled by the maintainer.

### SR1-quests-5: `SMSG_QUESTGIVER_STATUS` through `peek`, no `gameplay-handlers.ts` lease (quests-1)

Issue: contract 2.7 lists quests as a candidate for
`gameplay-handlers.ts` ("`SMSG_QUESTGIVER_STATUS` feeds marks"), and
task quests-1 step 4 says "`register` ... reads the single one with
`wire.peek`".

Ruling: the lease request is refused. The plan index queue for
`core: gameplay-handlers.ts` is items-3b → travel-4 and does not hold
quests [M]. quests-1 reads `SMSG_QUESTGIVER_STATUS` with `wire.peek`,
lists it in `uses`, and leaves the legacy handler
(`gameplay-handlers.ts:222-224`, design 5.5) as it is. The body gap of
design 5.5 ("keeps only the last packet") stays in the legacy store. The
area keeps its own `marks` slice.

Not yet ruled by the maintainer.

### SR1-quests-6: `titleTextId` and `giver` through `core.quests`, no `quest-store.ts` lease (quests-5)

Issue: contract 2.7 lists quests as a candidate for `quest-store.ts` and
`protocol/gossip.ts` ("share, dialog, `titleTextId`"), and task quests-5
step 3 reads "a gossip dialog with a `titleTextId`" and "`from` equal to
`core.quests` `giver` at arrival".

Ruling: the lease request is refused for wave 1. The data is already
readable through the existing entry points (contract 1.2: `core` is
"read and called through its existing entry points"):
`GossipMessage.titleTextId` is parsed (`protocol/gossip.ts:19,72-75`
[M]), the `gossip` kind of `QuestDialog` carries a `GossipMessage`
(`quests-requests.ts:23-24` [M]), and `QuestStore.state()` returns
`dialog` and `giver` (`quest-store.ts:104-107` [M]).

- quests-5 imports these as types only (contract 1.12) and reads them
  from `core.quests`.
- `QuestStore.openDialog` shows a gossip dialog only when a talk intent
  waits for that giver. Otherwise it records `stale_dialog`
  (`quest-store.ts:269-285` [M]). So the `quests-text` probe flow and
  the store tests open the dialog through the legacy talk path
  (`handle.talk`, or the `quest` handlers passed as `init.register` to
  `areaRig`), not through a bare injected `SMSG_GOSSIP_MESSAGE`.
- The `quest-store.ts` lease stays with items-3b and then quests-7b
  (wave 2), as the plan index queue says.

Not yet ruled by the maintainer.

### SR1-quests-7: the reply timeout is a local constant (quests-3, quests-5)

Issue: "an id with no reply after `QUEST_REPLY_TIMEOUT_MS` (5000,
`quests-requests.ts:65`) becomes `no_reply`" (task quests-3, step 3) and
"no reply in 5 s gives `no_reply`" (task quests-5, step 3). An area's
non-test source imports values only from the allow-list of contract
1.12, and `#wow/quests-requests` is not on it [M].

Ruling: the allow-list extension is refused. The area defines one
exported constant `REPLY_TIMEOUT_MS = 5000` in
`areas/quests/runtime.ts`. Only the runtime reads it: the runtime arms
the timer and calls the slice that sets `no_reply`. No store file
imports `runtime.ts`, so the store and the runtime have no import cycle.
The area does not import `QUEST_REPLY_TIMEOUT_MS`. `quests-requests.ts:65`
holds the same value today [M]. A test in `runtime.test.ts` may assert
that the two are equal, because test files are not held to the value
allow-list.

Not yet ruled by the maintainer.

### SR1-quests-8: harness tests set the area state with a spy (quests-2, quests-4, quests-6)

Issue: "a mock handle whose `quests.state()` holds marks" (task quests-2,
step 1), "with a POI state on the mock handle" (task quests-4, step 1),
and the greeting and gossip POI state that task quests-6 step 1 needs.
Contract 1.8 gives the mock handle only `sent` and `triggerAreaEvent`,
says "No area task edits the mock", and contract 0.9 puts the shared
fakes under coordinator edits.

Ruling: the builder follows the harness `area.test.ts` of S0-5's `time`
area. If that test sets area state only through `triggerAreaEvent`, the
quests tests replace the state with a spy from `bun:test` on
`handle.quests.state` (or on `session.areas.quests.state`, whichever the
tool reads) that returns a fixture `QuestsState`. No task edits
`packages/core/test-support/mock-handle.ts` or harness
`test-support/mock-game.ts`. If neither path reaches the state the tool
reads, the task stops as `blocked` and names that file and the missing
member. This ruling is not checked against landed code, because step 0
has not landed [M].

Not yet ruled by the maintainer.

### SR1-quests-9: one `QuestsStore`, not the six stores of design 5.5 (quests-1, quests-3, quests-5, quests-9)

Issue: design 5.5 "Store, events, acts" names `QuestMarkStore`,
`QuestPoiStore`, `NpcTextStore`, `GossipPoiStore`, `QuestShareStore` and
`CompletedQuestStore`. This file's rule "One store" builds one
`QuestsStore` with one slice per concern.

Ruling: the unit rule stands, and it keeps the design. Contract 1.2
gives an area module one `store: (deps, core) => St`, so a code area has
one store. The six design names are the names of its slices:
`marks`, `pois`, `texts`, `gossipPoi`, `share`, `completed`. The events
are the design's six plus `daily`. No design text changes.

Not yet ruled by the maintainer.

### SR1-quests-10: the design 5.5 decisions that wave 1 meets (quests-1, quests-2)

Issue: design 5.5 "Decisions (not yet ruled)": "one debounced multiple
query, not one query per giver" and "marks log only when the set of
givers with `available` or `reward` changes".

Ruling: both stand as the design states. quests-1 sends one
`CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY`, trailing-debounced by 500 ms and
at most once every 2 s. `queryGiverStatus` sends the single query only
when an act asks for it. The quests-2 `marks` rule writes a
`quests/marks` row only when the set of givers with `available` or
`reward` changes, and returns `[]` otherwise.

Not yet ruled by the maintainer.

### SR1-quests-11: the quest-giver flag check on an entity update (quests-1)

Issue: "The builder checks whether an `entity` `update` event reports a
changed `UNIT_NPC_FLAGS`; if it does, a change that adds bit 0x2 also
triggers the query. If it does not, the builder reports that and does
not add a core edit." Task quests-1, step 6.

Ruling: `EntityStore.update` emits `update` with `changed` set to the
keys of the fields it wrote, plus `"rawFields"` (`entity-store.ts:189-216`
[M]). The runtime triggers the query when `changed` includes
`"npcFlags"`, the unit now has bit 0x2 in `npcFlags`, and the store has
no mark for that guid. That the update path writes the `npcFlags` key
for `UNIT_NPC_FLAGS` is not measured. If the builder finds that it does
not, the rest of step 6 stands: report it, and add no core edit.

Not yet ruled by the maintainer.

### SR1-quests-12: the `SMSG_QUEST_FORCE_REMOVE` dead row comes from `SEED-1` (quests-1)

Issue: "`dead: ["SMSG_QUEST_FORCE_REMOVE"]` if the seed left it out."
Task quests-1, step 7.

Ruling: contract 2.4 gives the `SEED-<n>` commits "the dead rows of
N13", and the plan index "Dead opcodes" table lists `quests` (1)
`SMSG_QUEST_FORCE_REMOVE` [M]. So `SEED-1` writes
`dead: ["SMSG_QUEST_FORCE_REMOVE"]` in `areas/quests/opcodes.ts`.
quests-1 checks the line and writes it only if `SEED-1` did not. quests-1
still writes the dead row of the proof table in `docs/areas/quests.md`.

Not yet ruled by the maintainer.

### SR1-quests-13: the hello reply records `stale_dialog` (quests-9)

Issue: "Known limit, recorded under "Left out": the hello reply reaches
`QuestStore` with no pending intent, so it records `stale_dialog`
(`quest-store.ts:278-283`). No verb sends hello." Task quests-9, proof.

Ruling: the limit stands as the task states. quests-9 gets no
`quest-store.ts` lease. It records the limit in `docs/areas/quests.md`
"Left out", and the `quests-extras` probe flow expects the
`stale_dialog` error after the hello. No harness verb sends
`CMSG_QUESTGIVER_HELLO` in wave 1.

Not yet ruled by the maintainer.

## Seed rulings (SEED-2)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-2 task meets, before `SEED-2`. The wave-2 tasks of this unit are quests-7a, quests-7b and quests-8 (phase B). Each ruling is a coordinator ruling (P2-17). Rows marked "for the maintainer's review" answer a design question with the recommended answer of the draft.

A task's own eval runs use the round number the coordinator gives in its build prompt (SEED2-1). Wave-2 scenarios run replica 1 only and no spawn grid is added (SEED2-2). `origin/factory/426-protocol-coverage` in this file means `origin/factory/431-wave2` for part 2 (SEED2-6). Paths without a prefix are under `packages/core/src/wow/` (core), `packages/harness/src/` (h:) or `packages/devtools/src/` (dev:); AzerothCore paths are relative to `src/server/game/` in `/home/deity/code/azerothcore-wotlk-playerbots` unless they start with `src/`, `data/` or `modules/`. Facts marked [M] were measured in this worktree or in AzerothCore; [INFERENCE] marks what was not observed.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR2-quests-1 | `quests.md:605-606` and `:652-655`: puppet keys `quests.shareQuest`, `quests.answerShare` "in the form T-7 defines for area acts. If T-7 has no form for an area act, stop as `blocked`". Proof lines `call quests.answerShare ["decline"]`. | T-7 landed the form: a plain key equal to the act name (`setLootMethod`, `setPassOnLoot`; `calls.test.ts:11-24` accepts any key that is an act of any area). A dotted key would fail that test. Ruling: keys `shareQuest` (`["number"]`, the quest id) and `answerShare` (`[["accept","decline"]]`); every proof line and scenario argv reads `call shareQuest [8326]` and `call answerShare ["decline"]` / `["accept"]`. Sorted insertion (`answerShare` after `acceptInvite`, `shareQuest` after `setRaidMark`) - verified against the default JS sort over the full key list. quests-7a is not `blocked`. | coordinator ruling (P2-17) |
| SR2-quests-2 | `quests.md:609` ("Depends on: quests-1, SEED-2, T-7"), `quests.md:775-776` (quests-8: "group-9 (creates the `group` tool), item6, T-7"); `index.json` deps `["quests-1","SEED-2","T-7"]` and `["quests-7b","group-9","T-7","item6"]`. | `T-7` and `group-9` are not task ids after the splits (`T-7a/b/c`, `group-9a/9b`). The plan index has `quests-7a: quests-1, SEED-2, T-7c` and `quests-8: quests-7b, group-9b, T-7c, item6` (`plan.md:318,320`). What the tasks use: quests-7a uses `call` (T-7a) and `events --json` (T-7b) and the puppet run; quests-8 uses `call` (T-7a). Corrected deps: quests-7a `quests-1, SEED-2, T-7a, T-7b`; quests-8 `quests-7b, group-10c (tool lease), T-7a, item6` (SR2-group-14). `quests` is seeded already (SEED-1 `ae999799`); `SEED-2` holds no `quests` row, so the dependency on it is the phase rule only. | coordinator ruling (P2-17) |
| SR2-quests-3 | `quests.md:107-108` (lease rows for quests-7b `quest-store.ts` `openDialog` and quests-8 `areas/raid/tool.ts`), plan "Leases" row `core: quest-store.ts \| items-3b (A) → quests-7b (B) → economy-9 (C) → economy-11 (D)`. | Assigned. items-3b landed in wave 1, so quests-7b is the next holder of `quest-store.ts` now (393 non-blank lines; `openDialog` at `quest-store.ts:271-300` [M]). It also creates `quest-store.test.ts` under the colocated-test clause (the file does not exist today [M]). quests-8 takes the `areas/raid/tool.ts` lease last in the queue of SR2-group-14. | coordinator ruling (P2-17) |
| SR2-quests-4 | `quests.md:612-613` (quests-7a `uses`: `SMSG_QUESTGIVER_QUEST_DETAILS`, `SMSG_QUESTGIVER_REQUEST_ITEMS`), `quests.md:700` (quests-7b "Sends the handled `CMSG_QUESTGIVER_ACCEPT_QUEST` (in `uses`)"). | Both `uses` are legal: their legacy owners are `gameplay-handlers.ts:192-199` (the `dialog(...)` registrations) [M]; a client opcode in `uses` needs no owner (the registry test checks `peek ⊆ uses` and that every named `GameOpcode.X` sits in `owns` or `uses`, and pets-2 N1 accepted the same for `CMSG_PET_ACTION`, P2-5). The area reuses the legacy parsers (`parseQuestgiverQuestDetails` already returns `dividerGuid`, `protocol/questgiver.ts:57,266-275`) and `buildQuestgiverAcceptQuest` (`protocol/questgiver.ts:130`); both are `#wow/protocol/questgiver` value imports, on the allow-list. Until quests-7b lands, the legacy `QuestStore.openDialog` records `stale_dialog` for a shared quest (`quest-store.ts:289`); the only consumer is the probe flow (`probe-flows/quests-extras.ts:38`), so the interim is harmless and goes under "Left out" in `docs/areas/quests.md`. | coordinator ruling (P2-17) |
| SR2-quests-5 | `quests.md:636-647` (receiver: "a peeked details packet with a non-zero divider and no pending `core.quests` intent opens a `share` offer"; "an offer with no answer for 60 s gets that decline"). (auto-accept share) | AzerothCore adds an auto-accept quest to the receiver before it sends the details (`Handlers/QuestHandler.cpp:591-592`, `IsAutoAccept()`), and still sets the divider and sends details in the same call (`:596-598`). So a details packet for a quest that already sits in the `core.quests` log is not an offer. Ruling: the store opens no `share` offer then; it emits `share` `{ type: "answered", answer: "auto_accepted" }`; the 60 s expiry never sends a decline for a quest in the log (a decline would tell the sharer the receiver refused a quest it holds). The lingering divider is cleared by the server on the next accept attempt (`QuestHandler.cpp:148-152`, `CanTakeQuest` false → `SetDivider()`); wave 2 does not send one. Recommended answer: as ruled; it is AzerothCore-faithful and avoids a false decline. Not seen live (quest 8326 has no auto-accept flag): the case is a rig test built from `QuestHandler.cpp:591-598`. | coordinator ruling (P2-17), for the maintainer's review |
| SR2-quests-6 | `quests.md:628-635` (sharer): "no result in 3 s gives `no_answer`"; `quests.md:636-641`. | Confirmed against the handler: nothing is sent for a quest the sharer cannot share (`Player::CanShareQuest`, `Entities/Player/PlayerQuest.cpp:1532-1552`, and `QuestHandler.cpp:531-532`), and only group members on the same map are considered, with no distance check (`QuestHandler.cpp:543`, `IsInMap`). The relay of a member's decline or accept exists only when the receiver's divider equals the sharer (`QuestHandler.cpp:605-618`). Local refusals in `shareQuest`: not in a group (`ctx.legacy.party().inGroup`), quest not in the log, a push in flight. | coordinator ruling (P2-17) |
| SR2-quests-7 | `quests.md:713-720` (quests-7b: `answerShare("accept")` "sends `CMSG_QUESTGIVER_ACCEPT_QUEST` with the divider guid"), design 5.5 risk "accepting with the divider guid is inferred". | Verified in AzerothCore: the accept handler takes a player guid as the giver when `CanShareQuest` holds on that player, refuses the receiver's own guid (`QuestHandler.cpp:121-131`), requires both players alive (`Player::CanInteractWithQuestGiver`, `Entities/Player/Player.cpp:2097-2106`), then relays `ACCEPT_QUEST` to the divider and clears it (`QuestHandler.cpp:156-161`). The risk is no longer an inference; keep the live proof. A dead receiver gets no reply at all: the tool refuses dead locally (as it does for any dialog verb) and the act's answer settles `unanswered` after 5 s. | coordinator ruling (P2-17) |
| SR2-quests-8 | `quests.md:715-724` (quests-7b `quest-store.test.ts`: "a details dialog whose `dividerGuid` is not 0, with no `giver` and no pending intent, leaves `lastError` unset"). | Confirmed: `openDialog` compares `dialog.data.guid !== this.giver` (`quest-store.ts:280`); a shared-quest details packet carries the receiver's own guid as the giver guid (`QuestHandler.cpp:598`, `SendQuestGiverQuestDetails(quest, player->GetGUID(), true)`) and the sharer as the divider. The one-case guard keys on `dividerGuid !== 0n` and an unset giver, as written; the `requestItems` share form (`QuestHandler.cpp:593-594`, no divider set) does not use `openDialog`'s details branch and keeps recording `stale_dialog`, which is listed under "Left out". | coordinator ruling (P2-17) |
| SR2-quests-9 | `quests.md:730-750` (quests-7b proof, escort: both accounts `soap setup level` 9, position next to Apprentice Mirveda (entry 15402, map 530), quest 8488 `QUEST_FLAGS_PARTY_ACCEPT`). | Keep, with the server rule made explicit: `SMSG_QUEST_CONFIRM_ACCEPT` goes to a member only if the group shares a member in reward distance and `CanTakeQuest` holds for that member (`QuestHandler.cpp:171-186`); the confirm answer adds the quest only when the divider is in the group and within reward distance (`QuestHandler.cpp:446-476`). The worker confirms 8488, Mirveda and her coordinates live first (design 5.5 risk); if absent, the plan's mock/`unseen` fallback stands. | coordinator ruling (P2-17) |
| SR2-quests-10 | `quests.md:790-806` (quests-8 scenarios): `t8-quests-accept-shared` puts quest 8326 on the partner: "`quest/add` 8326 on the partner, who invites and shares through puppet `call`". | Impossible with the landed grader: scenario `setup` applies to the agent only and `placePartners` applies just the start-slot step to partners (`grader/run-partners.ts:63-70`); a partner action is a puppet argv, never a `soap setup`; no preset carries the quest (`soap presets` notes [M]). A coordinator tooling commit before quests-8 ("Coordinator edits for SEED-2", `partnerSetup`) adds an optional scenario field `partnerSetup: [{ actor?, endpoint, body }]` (files `grader/scenarios.ts` type and `partnerErrors`, `grader/scenario.schema.json`, `grader/run-partners.ts` `placePartners`, their tests, the schema paragraph of `docs/evals.md`); `applySetup` already exists (`grader/accounts.ts:122-145`) and the partner is offline until `startPartners`. `t8-quests-accept-shared` keeps its plan form with `quest/add` 8326 in `partnerSetup`. `t8-quests-share` is not affected (setup on the agent). | coordinator ruling (P2-17), for the maintainer's review |
| SR2-quests-11 | `quests.md:796-803` (`t8-quests-share`: presets `fresh` for agent and partner; partner "accepts the invite and the quest through puppet `call`"). | `fresh` has no `SPAWN_OF` entry, so `startSlots` returns `undefined` and both characters start at the preset point `(map 530, 10349.6, -6357.29, 33.4)` (`grader/spawn-slots.ts:153-158,169-176`; `soap presets` shows the same position) [M]: no slot capacity issue. Partner actions (elapsed offsets, `<AGENT>` for the invite): `call acceptInvite` after the agent's invite, then `call answerShare ["accept"]` after the share. The agent must send the invite (task text) and the share; it accepts nothing. | coordinator ruling (P2-17) |
| SR2-quests-12 | `quests.md:792` ("The tool test calls `expectSendKind` once") and `quests.md:782-789` (verbs). | The `group` tool takes new parameter `quest` (id or title) only in quests-8; the verbs `share_quest`, `accept_quest`, `decline_quest` live in the new sibling `areas/raid/tool-share.ts` with `tool-share.test.ts` (SR2-group-14); `tool.ts` gets the `do` values, the `quest` parameter and one dispatch line. `tool.test.ts` and `areas/quests/area.test.ts` take only wiring/rule tests. `journal` already lists quest titles (`tools/journal.ts`) for the title lookup. | coordinator ruling (P2-17) |
| SR2-quests-13 | `quests.md:771-772` ("`worldActs` gains `shareQuest`, `answerShare`") and current `worldActs: ["queryGiverStatuses", "queryPoi"]` (`harness areas/quests/area.test.ts:17`). | Allowed: quests-8 edits `areas/quests/area.ts` and `area.test.ts` (in its owner list); the union type `W extends keyof AreaActsOf<"quests">` requires the acts to exist on `QuestsActs` (quests-7a lands them). The expected list in `area.test.ts:17` becomes `["answerShare", "queryGiverStatuses", "queryPoi", "shareQuest"]` (sorted, harness literals are sorted). | coordinator ruling (P2-17) |
| SR2-quests-14 | Files near the cap: `areas/quests/store.test.ts` 403 non-blank lines, `areas/quests/runtime.test.ts` 495, `areas/quests/protocol.test.ts` 227 [M]. quests-7a lists `store.test.ts`; `runtime-share.test.ts` is already a new file. | quests-7a must not add share tests to `runtime.test.ts` (495: no room) and puts the store tests in a new `areas/quests/store-share.test.ts` instead of `store.test.ts` (403 + a slice would pass 470); `protocol.test.ts` may take the parser tests (227). quests-7b adds to `store-share.test.ts` and `runtime-share.test.ts`. | coordinator ruling (P2-17) |

## COMPLETE

## Build rulings

| Id | Issue | Ruling | Status |
|---|---|---|---|
| BR-quests-1-1 | quests-1 needs `packages/harness/src/world/hub.test.ts` (a step 0 file) to send a typed entity event, because the quests runtime reads the entity of every appear event | The coordinator lands the edit as its own commit ("test: Send a typed entity event in the hub test"), and quests-1 drops it | ruled by the maintainer (P2-4) |
| BR-quests-7a-1 | Four review rounds of quests-7a moved between two defects: blocking later shares on an unanswered push, and attributing a late relayed answer (GUID and result only, AzerothCore `Handlers/QuestHandler.cpp`) to a newer push | Coordinator ruling (P2-17): one push is open at a time. If no result arrives within 3 s, the push closes with `no_answer`; the server sends none for a quest it refuses. After a result 0 (`SHARING_QUEST`), the push stays open until every such member has a final answer, 60 s pass, or the group changes. While a push is open, `shareQuest` refuses `busy`. A relay that arrives after its push closed is dropped and never given to a newer push. The sharer never sees the recipient's `SMSG_QUESTGIVER_REQUEST_ITEMS`, so no sharer-side path relies on it. Two fix rounds implement this rule (the second restores the 3 s `no_answer`), then a full re-review. | coordinator ruling (P2-17) |
| BR-quests-7a-2 | Round-6 review of quests-7a: offline members never answer a push (AzerothCore skips members with no `Player*`), and a shared zero-method quest can reach the recipient as `SMSG_QUESTGIVER_OFFER_REWARD` | Coordinator ruling (P2-17): a sixth and last fix round. It tracks only online members and also treats the reward-offer packet as a shared completion. If the next review still asks for fixes, the task is parked. | coordinator ruling (P2-17) |
| BR-quests-7a-3 | Round-7 review of quests-7a: a share refused for an unspawned pooled quest (a result-8 reply to the sharer alone, `PlayerQuest.cpp:1532-1552`) keeps the push open for 60 s | Coordinator ruling (P2-17): quests-7a lands without another round. The gap is rare and bounded (60 s of `busy`), and seven review rounds have settled the share model. `docs/areas/quests.md` "Left out" records the gap, and a follow-up issue tracks it. | coordinator ruling (P2-17) |

## Seed rulings (SEED-4)

Wave 4 slice (BR-wave4-1): quests-10. The coordinator's SEED-4 agents drafted these rows against `factory/431-wave4` at `851d14fc` and AzerothCore; each is a coordinator ruling (P2-17) and the maintainer may reverse any at PR review. Marks: `[M]` read or measured, `[INFERENCE]` not observed. Paths without a prefix are under `packages/core/src/wow/`; `h:` is `packages/harness/src/`, `dev:` `packages/devtools/src/`, `cts:` `packages/core/test-support/`. "Finding <n>" names a finding of the same draft below.

SEED4-1 (the quests journal block moves to `h: areas/quests/journal.ts`) is a coordinator commit that lands with SEED-4, so quests-10 waits for no journal lease.

| Id | Plan text or question | Ruling | Status |
|---|---|---|---|
| SR4-quests-1 | quests-10 owner `h: tools/journal.ts` (lease row `plan.md:704`: economy-8 (C) then economy-10 (C) then quests-10 (D)); the question whether quests-10 can avoid waiting. | **Yes: quests-10 does not edit `tools/journal.ts` and holds no `lease:tools/journal.ts`.** The disjoint file is the NEW `h: areas/quests/journal.ts` (exports `questsResult(ctx)`), created by the coordinator pre-split SEED4-1 (no behaviour change, the SEED3-13 pattern; the spells and reputation journals live beside their areas the same way). `tools/journal-mail.ts` / `tools/journal-bank.ts` are not usable: they do not exist (finding 10) and are the mail and bank blocks of economy-8 and economy-10. After SEED4-1 the lease row reads economy-2 (landed) then economy-8 then economy-10 and ends; quests-10 leaves the row. quests-10 does not need economy-7/9 or economy-8/10 to land. If the coordinator declines SEED4-1, the fallback is quests-10 waits for economy-10 (`leaseDeps: ["lease:tools/journal.ts"]`) and edits `tools/journal.ts` at the lease; SEED4-1 is cheaper and also takes 110 lines off a file that economy-8/10 grow. | coordinator ruling (P2-17) |
| SR4-quests-3 | quests-10 step 2 and files (`quests.md:848-854`): the journal shows `done today`; `tools/journal.ts` and test. | The change goes into `h: areas/quests/journal.ts` after SEED4-1. Behaviour: for each id in `handle.quests.state().daily` (a quest rewarded today is not in the quest log) `questsResult` adds a body line `#<id> <title>: done today.`; title from `questTitle(ctx, id)` (`ops/quest-memory.ts:32-38`; falls back to `quest <id>` when the quest was never seen in this session). Lines go after the quest-log lines and after the daily-reset line, so the order is reset line, log quests, done-today. No `after` change: `QuestLine` and `JournalAfter` (`contract/details.ts:288-296,368`) are not edited (economy-8 holds the `JournalAfter` block of `contract/details.ts`, `plan.md:673`); `detail` text unchanged. A quest id that is in the log AND in `daily` shows the log line only. Tests: new `h: areas/quests/journal.test.ts` (and the existing quests assertions in `tools/journal.test.ts` stay as they are, they test through `journalTool`). | coordinator ruling (P2-17) |
| SR4-quests-4 | quests-10 proof (quests.md:856-864): "`soap setup level` 70 ... `quest add <id>` and `quest reward <id>` for one daily quest the worker picks". | Stage (finding 15): `soap create` any preset (level is not needed: `CanAddQuest` checks neither level nor race); character online; `soap gm <ACCOUNT> quest add 14179`, `quest complete 14179`, `quest reward 14179`; probe `quests-daily` (prints `daily` and the journal-derived line) after each step and once after `quest reward`: `daily` contains 14179, a `daily` event with `count 1` was emitted. Then the proof of the empty case: before the reward the set is empty. The daily reset (6 AM server time, `World.cpp:1759`) is not reachable and not needed; the unit test covers the all-zero update. If 14179 is refused, take 11545 (finding 15) and say so in the proof table. Fallback if no daily can be rewarded after two tries: the plan's unit-test evidence marked "not seen live" (BR-wave3-6). `quests-daily.ts` follows `quests-extras.ts` (85 lines). | coordinator ruling (P2-17) |
| SR4-quests-5 | quests-10 "Depends on: quests-9, quests-4, item6, T-5, the quests-10 lease" (quests.md:840). | quests-9, quests-4, T-5 are landed; `item6` is the harness item set of the plan and is landed; the lease is dropped (SR4-quests-1). Dependencies in the index are empty. No file of quests-10 is shared with another task of the slice. | coordinator ruling (P2-17) |
| SR4-quests-2 | quests-10 step 1 (quests.md:845-847): "A self `entity` `update` event whose `rawFields` hold quest ids at offsets 1280-1304 sets `daily` ... and emits `daily`." | Corrections [M]: (a) the self entity also arrives as `appear` (the private field is in the create block), so `questsRuntime`'s `ctx.listen("entity", ...)` handles `appear` and `update` for `event.entity.guid === ctx.selfGuid()`; (b) the offsets are 1280 to 1304 inclusive (25 values), read with `entity.rawFields.get(offset) ?? 0`; (c) the store keeps `daily?: ReadonlySet<number>` (OPTIONAL, finding 9) in `QuestsState`, set in `store-daily.ts` by `receiveDaily(fields: ReadonlyMap<number, number>)`; (d) it emits `{ type: "daily", count: number }` only when the set differs from the previous one (the first all-zero read emits nothing); (e) `eventTypes` in `areas/quests/area.ts:25` gains `"daily"`; the harness rule for `quests` has a fallback (`areas/quests/area.ts:179` `quiet(e)`, scalars only), so a `daily` event logs one `quests daily` row with `count`, no harness area edit (the `completed` event does the same, `area.test.ts:124-130`). (f) A reset to all zeros at the daily reset emits `daily` with `count: 0`. (g) New tests: `areas/quests/store-daily.test.ts` and `areas/quests/runtime-daily.test.ts` (store.test.ts is 403 and runtime.test.ts is 495, SR2-quests-14 style); the entity fixture builder, if it needs one, is added to `cts: areas/quests.ts` (208). | coordinator ruling (P2-17) |

### Findings behind the SEED-4 rulings

From the `items-quests-world` draft:

- **Finding 9.** **`QuestsState` literals in five harness tests.** `journal-quests-regions.test.ts:82,125`, `interact-quest-accept.test.ts:40`, `look-quests.test.ts:26`, `interact-quest.test.ts:358,389,419,468,498` build the full `QuestsState` including `gossipPoi: undefined` [M]. A required new field `daily` breaks their typecheck, and none of those files is in quests-10's owner list. `share?` (store.ts:69) is the precedent for an optional field. Affects: quests-10.
- **Finding 10.** **The quests journal block is separable; the economy tasks only add dispatch lines.** `tools/journal.ts` is 439 non-blank [M] (SEED3-13 moved the spells block: `areas/spells/journal.ts` exists). The quests code is `KnownQuest`/`LoggedSlot`/`STOP`/`QUEST_STATUS` (`:39-40,44-49`) and `knownQuest`..`questsResult` (`:94-209`, 110 non-blank) with no other user in the file (`grep` of each symbol [M]). `tools/journal-mail.ts` and `tools/journal-bank.ts` do not exist at the tip [M, `git ls-files`]; the plan makes economy-8 and economy-10 create them (plan index :848, SR3-economy-12, -20). So a "disjoint sibling" for quests-10 must be a NEW file, which a coordinator pre-split creates (SEED4-1). Affects: quests-10, economy-8, economy-10 (they get a shorter file).
- **Finding 15.** **Daily quests: where the set lives and how to stage.** `Player::SetDailyQuestStatus` (`Player.cpp:12337-12363` [M]) puts the quest id into the first empty slot of the field; `ResetDailyQuestStatus` (`:12401-12409`) zeroes all 25 at the daily reset; dungeon-finder dailies (`IsDFQuest`) go to `m_DFQuests`, not into this field. The field is PRIVATE (only the owner gets it). A daily quest is rewarded into the field on `RewardQuest` (`PlayerQuest.cpp:832-834`). `soap gm quest reward` requires `QUEST_STATUS_COMPLETE` (`src/server/scripts/Commands/cs_quest.cpp:487-512` [M]); plan text says `quest add` then `quest reward`, but a quest with objectives needs `quest complete` in between (`soap-gm.ts:28` allows add, complete, reward, remove [M]). `quest add` checks only `CanAddQuest` (log space and start item, `PlayerQuest.cpp:266-290`), not level or race, and refuses a quest started by an item (`cs_quest.cpp:65-72`). Base data [M]: 466 quests carry `Flags & 0x1000` (`QUEST_FLAGS_DAILY`, `Quests/QuestDef.h:144`); of these, 14179 "Call to Arms: Eye of the Storm" (MinLevel 61, all races/classes, no kill/item objectives, no previous quest, no skill/rep gate; `quest_template.sql`, `quest_template_addon.sql`) is a clean pick; backup 11545 "A Charitable Donation" (level 70, no objectives in the table, but it needs money in game [INFERENCE]). Affects: quests-10.
- **Finding 16.** **File sizes that matter** [M, non-blank]: core items `runtime.ts` 337 (parked 342), `area.ts` 83 (parked 107), `moves.ts` 125, `reads.ts` 100, `opcodes.ts` 44, `store.test.ts` 298, `runtime.test.ts` 304; `cts: areas/items.ts` 286 (parked +39); harness items `area.ts` 353, `area.test.ts` 463; core quests `store.ts` 314, `runtime.ts` 288, `store.test.ts` 403, `runtime.test.ts` 495; harness `tools/journal.ts` 439, `journal.test.ts` 444; reputation `store.ts` 331, `store.test.ts` 343, `runtime.ts` 42, `area.ts` 38, harness `areas/reputation/area.ts` 115, `area.test.ts` 285; `docs/areas/items.md` 244, `quests.md` 295, `reputation.md` 142, `docs/harness.md` 452 (none of the four tasks edits it). Affects: all four.
