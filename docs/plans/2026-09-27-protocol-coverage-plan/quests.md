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

## COMPLETE
