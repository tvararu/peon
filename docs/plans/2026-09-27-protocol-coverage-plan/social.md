# Protocol coverage: social (key: social)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design:
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md)
(section numbers such as "design 5.21" point into it).

The `social` unit builds seven code areas (design 5.1, 5.21):
`achievements` (with titles), `emotes`, `contacts`, `inspect`, `channels`
(with voice), `complaints` and `referral`. It reads the achievement
stream, emotes, channel notices and member lists, inspect replies and
refer-a-friend replies, and sends every social client opcode the server
accepts. The harness gets new `do` values on the existing `social`
tool: `emote`, the channel verbs (`join_channel`,
`leave_channel`, `channel`) and `inspect`. Achievements, titles, channel
admin, contacts, voice, complaints and refer-a-friend get core acts and
no verb (design 5.21 "Decisions").

- Phases: 1 (`social-1`, `social-2`, design N22), 3 (`social-3`,
  `social-14`, emote quests in NS2), 4 (everything else). No social task
  is in phase 2 (design 5.1).
- Worktree: `proto-social`, created with the command of contract 0.1,
  branch renamed to `proto/area-social`. One task at a time.
- Opcodes: 54 rows, 52 relevant and 2 dead (design 5.21). 7 are stubs
  today, 45 are missing, 0 are absent. Every relevant opcode is in exactly
  one task below; the two dead ones are listed at the end.
- Evals: `t2-emotes-partner` (`social-14`), `t2-channels-talk`
  (`social-15`), `t2-inspect-partner` (`social-16`), ids from design 5.2.
- Owned paths (contract 2.5), for each code area `<a>` of the seven:
  `packages/core/src/wow/areas/<a>/*`, `packages/core/test-support/areas/<a>.ts`,
  `packages/harness/src/areas/<a>/area.ts` and its test,
  `packages/devtools/src/probe-flows/<a>-*.ts`,
  `packages/harness/src/grader/scenarios/t2-<a>-*.json`, `docs/areas/<a>.md`,
  `docs/protocol-coverage/<a>.md` (regenerated only). No new tool module:
  the verbs extend the legacy `social` tool under a lease.
- Shared files touched, each in the way contract 2.6 names:
  `packages/harness/src/puppet/calls.ts` (sorted keys, after T-7a),
  `packages/harness/src/grader/scenarios.ts` `ROUND_1` (append),
  `docs/capabilities.md` and `docs/evals.md` (contract 3.4, 3.5).
- Leases wanted (contract 2.7), in build order:

  | Legacy file | Holder | Edit |
  |---|---|---|
  | `world-handlers-social.ts`, `friend-store.ts` | `social-5a` | the list-mask fix, `FriendStore.setNote` |
  | `protocol/chat.ts` (`parseChatMessage`) and `protocol/enums.ts` (`ChatType`, contract issue 3) | `social-5b` | three chat types, the achievement id |
  | harness `tools/social.ts` and siblings `tools/social-*.ts`, the `socialParams` block of `tools/params.ts`, `SocialAction` and `SocialAfter` in `contract/details.ts` (D13), `socialRenderers` in `ui/renderers/line.ts` (contract issue 4) | `social-14`, then `social-15`, then `social-16` (D12) | the new `do` values |

Tasks, in unit order (one at a time, contract 0.1):

| Id | Title | codeArea | Phase | Opcodes | Size | Depends on |
|---|---|---|---|---|---|---|
| `social-1` | Achievement stream | `achievements` | 1 | 6 | M | `S0-5`, `SEED-1`, `T-2`, `T-3`, `T-5` |
| `social-2` | Receive emotes | `emotes` | 1 | 2 | S | `S0-5`, `SEED-1`, `T-2`, `T-3` |
| `social-3` | Send emotes | `emotes` | 3 | 2 | S | `social-2` |
| `social-14` | `emote` verb | `emotes` | 3 | 0 | S | `social-3`, `T-7a`, `T-7b`, item 6, lease |
| `social-4` | Titles | `achievements` | 4 | 2 | S | `social-1`, `T-5`, `T-6` |
| `social-5a` | Contacts, notes and the ignore reply | `contacts` | 4 | 3 | S | `SEED-4`, `T-3`, `T-7a`, leases |
| `social-5b` | Ignored and achievement chat types | `contacts` | 4 | 0 | S | `social-5a`, lease, `COORD` (issue 3) |
| `social-6` | Inspect | `inspect` | 4 | 4 | M | `social-1`, `talents-1`, `SEED-4`, `T-3`, `T-7a` |
| `social-7` | Channel notices and admin, part 1 | `channels` | 4 | 8 | M | `SEED-4`, `T-3`, `T-7a`, `T-7b`, `T-7c` |
| `social-8` | Channel admin, part 2, and join by id | `channels` | 4 | 6 | S | `social-7` |
| `social-9` | Channel list and member count | `channels` | 4 | 5 | S | `social-7` |
| `social-10` | Channel watch and user list | `channels` | 4 | 5 | S | `social-9` |
| `social-11a` | Voice | `channels` | 4 | 3 | S | `social-7` |
| `social-11b` | Complaints | `complaints` | 4 | 2 | S | `SEED-4` |
| `social-12` | Refer-a-friend | `referral` | 4 | 4 | S | `SEED-4`, `T-3`, `T-7a` |
| `social-13a` | Achievement and title rows | `achievements` | 4 | 0 | S | `social-1`, `social-4` |
| `social-13b` | Emote rows | `emotes` | 4 | 0 | S | `social-14` |
| `social-13c` | Channel rows | `channels` | 4 | 0 | S | `social-7` |
| `social-13d` | Level-grant rows | `referral` | 4 | 0 | S | `social-12` |
| `social-15` | Channel verbs | `channels` | 4 | 0 | M | `social-8`, `social-13c`, `T-7a`, item 6, lease |
| `social-16` | `inspect` verb | `inspect` | 4 | 0 | S | `social-6`, `social-15` (lease hand-over), `T-9b`, item 6, lease |

Opcode count: 6 + 2 + 2 + 2 + 3 + 4 + 8 + 6 + 5 + 5 + 3 + 2 + 4 = 52.

The design's `social-5`, `social-11` and `social-13` are split (contract
0.10), so each part has one test cycle and one code area. A dependency
on `social-5` means `social-5b`; on `social-11`, `social-11b`; on
`social-13`, `social-13d`.

## Contract issues

Gaps found while planning. The contract is not changed. Each workaround
is a decision **accepted by the maintainer (P2-5)**.

1. **The achievement data parser is shared by two code areas.**
   `SMSG_ALL_ACHIEVEMENT_DATA` (`achievements`) and
   `SMSG_RESPOND_INSPECT_ACHIEVEMENTS` (`inspect`) share one body,
   `AchievementMgr::BuildAllDataPacket` (`Achievements/AchievementMgr.cpp:2418-2449`),
   and an area never imports another area's directory (contract 1.12).
   Proposal: `social` owns one new shared file,
   `packages/core/src/wow/protocol/achievement-data.ts`
   (`parseAchievementData`), created by `social-1`, and contract 2.5 gains
   that row for `social`. If the coordinator has not ruled when
   `social-1` starts, `social-1` keeps the parser in
   `areas/achievements/protocol.ts`, and `social-6` stops `blocked`
   naming the file until a `COORD` commit moves it.
2. **Name tables.** The DBC directory of the live profile holds
   `FactionTemplate.dbc`, `SkillLineAbility.dbc` and seven `Spell*.dbc`
   files, and none of `EmotesText.dbc`, `Achievement.dbc`,
   `CharTitles.dbc` or `ChatChannels.dbc` [M, `ls`]. The plan avoids them:
   - Text emote names come from AzerothCore's `TextEmotes` enum
     (`src/server/shared/SharedDefines.h:1638-1892`), copied into
     `areas/emotes/names.ts`. The server takes the animation from its own
     `EmotesText.dbc` row (`Handlers/ChatHandler.cpp:754-758`) and passes
     the client's emote number only to the echo and to scripts
     (`:779-790`), so the client needs no DBC to emote.
   - Achievement and title names are left out: events and rows carry ids
     ("achievement 6", "title 143"). A name catalog waits until the
     coordinator stages `Achievement.dbc` and `CharTitles.dbc`; it is not a
     task of this unit.
   - Zone channel ids: only `LookingForGroup` = 26 is confirmed
     (`Entities/Player/PlayerUpdates.cpp:478`). `social-8` records the id
     of `General` from its live "you joined" notice, which carries the id
     (`Chat/Channels/Channel.cpp:971-977`). Every other zone channel id
     could not be determined.
3. **`protocol/enums.ts` has no lease.** `social-5b` adds `IGNORED`
   (0x19), `ACHIEVEMENT` (0x30) and `GUILD_ACHIEVEMENT` (0x31) to
   `ChatType` (`packages/core/src/wow/protocol/enums.ts:51-83`; AzerothCore
   `src/server/shared/SharedDefines.h:3410,3433-3434`). Contract 2.7 lists
   a lease on `protocol/chat.ts` for `social` but not on `enums.ts`.
   Proposal: the lease on `protocol/chat.ts` includes the `ChatType` block
   of `protocol/enums.ts`. Otherwise a `COORD` commit adds the three
   members before `social-5b` starts, and `social-5b` stops `blocked`
   until it lands.
4. **The `social` tool lease is too narrow.** `tools/social.ts` has 399
   non-blank lines [M, `grep -vc`], so five new `do` values push it past
   the 500-line cap. The `do` enum and argument text live in `socialParams`
   (`packages/harness/src/tools/params.ts:158`), the renderers in
   `socialRenderers` (`packages/harness/src/ui/renderers/line.ts:162-180`),
   and `SocialAction` and `SocialAfter` in `contract/details.ts:218-235`
   (D13 covers these two). Proposal: the lease reads "`tools/social*.ts`,
   the `socialParams` block of `tools/params.ts` and `socialRenderers` of
   `ui/renderers/line.ts`", so each verb task puts its code in a new
   sibling `tools/social-<verb>.ts`. Objects and travel filed the same
   `tools/params.ts` gap (their contract issues on `params.ts`). The
   `social` row of the `docs/harness.md` tool table (`docs/harness.md:131`,
   "One chat message or one group action.") needs new wording; the plan
   asks the coordinator to change it at wave integration (D22).
5. **Channel store and `conn.channels`.** `SMSG_CHANNEL_NOTIFY`,
   `CMSG_JOIN_CHANNEL` and `CMSG_LEAVE_CHANNEL` are core rows, not social
   rows, so `channels` never owns them. It lists them in `uses` and reads
   the notice with `peek` (N3). The legacy handler keeps its joined, left
   and error chat lines (`packages/core/src/wow/world-handlers-chat.ts:128-152`)
   and `conn.channels`. Design 5.21 says `ChannelStore` replaces
   `conn.channels`; by D20 that is a `COORD` commit, which `social-7`'s
   report requests. Until it lands both exist, and `getChannel(index)`
   keeps its meaning (`packages/core/src/wow/client-chat.ts:125-127`).
   The design's "`joinChannel` gains a channel id" lands as the area act
   `channels.act.joinChannel(name, { channelId, password })`, because
   `client-social.ts` has no lease; the legacy `joinChannel`
   (`client-social.ts:94`) stays.
6. **Ignored whispers never reach a listener.** The legacy chat path drops
   a whisper from an ignored guid before any emit
   (`packages/core/src/wow/world-handlers-chat.ts:47`). The automatic
   `CMSG_CHAT_IGNORED` of N30 therefore peeks `SMSG_MESSAGECHAT` in the
   `contacts` area, with the legacy parser `parseChatMessage`
   (`#wow/protocol/chat`, an allowed value import, contract 1.12). No
   legacy edit is needed.
7. **The emote witness.** Design 5.21 names the partner as the witness
   for `t2-emotes-partner`. A text emote reaches the partner as an area
   event, which only T-7b's `events --json` shows, while the grader's
   partner reader calls `read --json` only
   (`packages/harness/src/grader/partner.ts:52-66`), and T-9a owns that
   file. Proposal: T-9a also drains `events --json` into
   `partner-events.jsonl`. Until then `social-14` grades on the server's
   own echo in the agent's game log (`emotes/sent`, a server packet, which
   `docs/evals.md` "Grading rules" accepts) and adds the witness check in
   the task that finds the partner events available. Task text never
   names the partner, because `expandArgv` rewrites `<AGENT>` and
   `<PARTNER>` only in `partnerActions.argv` (`grader/partner.ts:42-49`).
8. **Emote state and titles need no entity edit.** `UNIT_FIELDS.NPC_EMOTESTATE`
   (`packages/core/src/wow/protocol/update-fields.ts:114`) and
   `PLAYER_FIELDS.CHOSEN_TITLE`, `KNOWN_TITLES`, `KNOWN_TITLES1`,
   `KNOWN_TITLES2` (`:262,270-272`) are read from
   `deps.getEntity(guid)?.rawFields` inside the areas, as the threat plan
   reads `UNIT_FIELDS.SUMMON`. `entity-store.ts` and `player-state.ts` stay
   untouched.
9. **Probe flow signature.** T-3 fixes the flow module shape
   (design 4.2). The builder copies the shape of
   `packages/devtools/src/probe-flows/nearest.ts` as T-3 lands it; the
   exact signature could not be determined before T-3 lands.

Rules for every task of this unit (from the contract):

- Core area code imports only what contract 1.12 allows: `#lib/*`,
  `#wow/protocol/*` (including `protocol/packed-time.ts` from S0-5, D10,
  and `protocol/talent-spec.ts` from `talents`, N28), `#wow/areas/contract`,
  its own directory, `#wow/geometry`, `#wow/dbc` and `#wow/data/*`.
- Every parser test body is built from the AzerothCore writer cited in the
  task; citations go in the `docs/areas/<a>.md` proof table, never in a
  test (D3). Run `mise protocol:cite-check` before review.
- Guids in events are `bigint`; event `type` values match `/^[a-z_]+$/`.
- Harness rows use the area's own domain: the router sets `domain: <a>`
  and `event: <a>/<name>` (contract 1.9). The area design's `social/...`
  row names become `<a>/<name>`.
- Live proof uses only accounts the task creates with `mise factory soap
  create eversong10`, and deletes them before the report. The partner is a
  second such account driven by `tmp/puppet-<ACCOUNT>`. Own character
  actions run through a probe flow. Both `eversong10` characters log in at
  the preset's start point [I]; a flow that needs range checks the
  distance first and reports the real distance if it is too far.

---

## Task social-1: Achievement stream

Rulings: SR1-social-1, SR1-social-2, SR1-social-4, SR1-social-5, SR1-social-6 (section "Seed rulings (SEED-1)").

**codeArea:** `achievements`. **Phase:** 1. **Size:** M. **Proof:** live
(4 opcodes), mock for `SMSG_SERVER_FIRST_ACHIEVEMENT` and, until
`social-4`, for the two deleted opcodes.

**Files:**

- Create: `packages/core/src/wow/areas/achievements/protocol.ts` and
  `protocol.test.ts`, `store.ts` and `store.test.ts`, `area.test.ts`
- Create: `packages/core/src/wow/protocol/achievement-data.ts` and
  `achievement-data.test.ts` (contract issue 1; if unruled, the parser
  goes in `areas/achievements/protocol.ts`)
- Create: `packages/core/test-support/areas/achievements.ts`
- Create: `packages/devtools/src/probe-flows/achievements-level.ts`
- Create: `docs/areas/achievements.md`
- Modify: `packages/core/src/wow/areas/achievements/area.ts` and
  `opcodes.ts` (seeded by `SEED-1`; delete the four `stubs` lines, fill
  `unseen`)
- Regenerate: `docs/protocol-coverage/achievements.md`

**Depends on:** `S0-5` (area mechanism, `areaRig`, `readPackedTime`),
`SEED-1` (the `achievements` seed), `T-2` (tap), `T-3` (probe), `T-5`
(`soap gm level`; the fallback below needs no GM).

**Opcodes:** `SMSG_ALL_ACHIEVEMENT_DATA` (0x47d), `SMSG_CRITERIA_UPDATE`
(0x46a), `SMSG_ACHIEVEMENT_EARNED` (0x468), `SMSG_SERVER_FIRST_ACHIEVEMENT`
(0x498), `SMSG_CRITERIA_DELETED` (0x49e), `SMSG_ACHIEVEMENT_DELETED`
(0x49f).

**Wire** (AzerothCore; paths under `src/server/game/`):

- 0x47d: the all-data body of `BuildAllDataPacket`
  (`Achievements/AchievementMgr.cpp:2418-2449`): per completed achievement
  `u32` id and packed time, ended by `int32 -1`; then per criterion `u32`
  id, a packed counter (`appendPackGUID`, read as `bigint`), the packed
  player guid, `u32` flags, packed time, two `u32` elapsed values, ended
  by `int32 -1`. Hidden achievements are skipped (`:2421-2425`). Sent at
  login (`Entities/Player/Player.cpp:11799`).
- 0x46a: `u32` criteria id (wowm calls it `achievement`; AzerothCore
  wins), packed counter, packed guid, `u32` flags, packed time, `u32`,
  `u32` (`AchievementMgr.cpp:773-794`).
- 0x468: packed guid, `u32` id, packed time, `u32 0`
  (`AchievementMgr.cpp:765-770`). Sent to the set in range, so the guid
  may be another player (`:770`); never while loading or for a hidden
  achievement (`:709-714`).
- 0x498: CString name, `u64` guid, `u32` id, **`u32`** link type
  (`AchievementMgr.cpp:736-752`); wowm has a `u8` link, AzerothCore wins.
  Link 0 is the guild form (`:740`), 1 the player form (`:749`).
- 0x49e and 0x49f: one `u32` id (`AchievementMgr.cpp:497-508,2190-2198`).

**Steps:**

- [ ] **Step 1: Packet builders.** In
  `packages/core/test-support/areas/achievements.ts`:
  `achievementsAllAchievementDataBody({ done, criteria })`,
  `achievementsCriteriaUpdateBody({...})`,
  `achievementsAchievementEarnedBody({ guid, id, packedTime })`,
  `achievementsServerFirstAchievementBody({ name, guid, id, link })`,
  `achievementsCriteriaDeletedBody(id)`,
  `achievementsAchievementDeletedBody(id)`, each a `PacketWriter` writing
  the fields in the writer order above (`packedGuidBig` for packed guids
  and the packed counter).
- [ ] **Step 2: Failing parser tests.** In `achievement-data.test.ts`:
  two done entries and one criterion round-trip; an empty body (two `-1`
  markers only) gives empty lists; a counter above 2^32 stays exact as a
  `bigint`. In `protocol.test.ts`: `parseCriteriaUpdate`,
  `parseAchievementEarned` (a player guid and a creature-free guid),
  `parseServerFirst` in the guild form (link 0) and the player form
  (link 1), `parseCriteriaDeleted`, `parseAchievementDeleted`. Packed
  times decode through `readPackedTime` (`protocol/packed-time.ts`).
  Run `mise test packages/core/src/wow/areas/achievements/protocol.test.ts`
  and see it fail on the missing module.
- [ ] **Step 3: Parsers.** `parseAchievementData(reader)` returns
  `{ done: { id, at: PackedTime }[]; criteria: { id, counter: bigint, at: PackedTime }[] }`;
  the other five parsers live in `areas/achievements/protocol.ts`. Never
  sort keys in literals that read packets.
- [ ] **Step 4: Failing store tests** (`store.test.ts`, over
  `new AchievementStore(deps, core)` with test deps):
  - 0x47d replaces both maps; a later 0x46a sets one counter.
  - 0x468 for the own guid (`deps.selfGuid()`) adds the id and emits
    `achievement_earned` with `self: true`; for another guid it emits
    `achievement_earned` with `self: false` and does not change the set.
  - 0x49f removes the id and emits `achievement_removed`; 0x49e removes
    the criterion and emits `criteria_removed`.
  - 0x498 emits `server_first` and changes nothing.
  - 0x46a emits no event (design 5.21: it arrives on every kill).
  - The snapshot is `{ count, recent }`, `recent` the last five earned ids
    with their times, plus `criteria` as a count.
- [ ] **Step 5: Store.** `store.ts` exports `AchievementsState`,
  `AchievementsEvent` (`achievement_earned` { guid, self, id },
  `achievement_removed` { id }, `criteria_removed` { id }, `server_first`
  { name, guid, id }) and `AchievementStore` (an `AreaStore` with `replace`,
  `setCriteria`, `earned`, `removeAchievement`, `removeCriteria`,
  `serverFirst`). `social-4` adds `title_changed`.
- [ ] **Step 6: Registration.** `area.ts` registers `on` for the six
  opcodes, sets `eventTypes`, and `store: (deps, core) => new
  AchievementStore(deps, core)`. No runtime: the area sends nothing yet.
  Delete the four `stubs` lines of the owned stubs.
- [ ] **Step 7: Area test.** `area.test.ts` over `areaRig("achievements",
  { selfGuid })`: inject each body from step 1, check
  `rig.handle.state()` and the events on `rig.handle.onEvent`. These are
  also the R22 mock proofs of 0x498, 0x49e and 0x49f.
- [ ] **Step 8: Probe flow.** `probe-flows/achievements-level.ts`, in the
  shape T-3 gives `nearest.ts`: it attacks the nearest living hostile
  creature within 35 yd and waits until it dies, the character dies or
  120 s pass, then waits 5 s for late packets.
- [ ] **Step 9: Live proof.**
  1. `mise factory soap create eversong10` (note the account).
  2. `mise protocol:probe <ACCOUNT> --expect SMSG_ALL_ACHIEVEMENT_DATA
     --wait 10`. Exit 0 proves 0x47d at login.
  3. `mise protocol:probe <ACCOUNT> --flow achievements-level --expect
     SMSG_CRITERIA_UPDATE --wait 150`. Exit 0 proves 0x46a.
  4. `mise factory soap gm <ACCOUNT> level 9`. Then start
     `mise protocol:probe <ACCOUNT> --expect SMSG_ACHIEVEMENT_EARNED
     --wait 30`, and while it waits run `mise factory soap gm <ACCOUNT>
     level 10` in a second shell. `.character level` calls `GiveLevel`
     (`src/server/scripts/Commands/cs_character.cpp:256`), which grants
     achievement 6 ("Level 10"). Exit 0 proves 0x468. Fallback if T-5
     has not landed: stop the character, run `mise factory soap setup
     <ACCOUNT> level` to 9 and `xp` to a few points short of level 10,
     then run step 3's flow with `--expect SMSG_ACHIEVEMENT_EARNED`; the
     kill levels the character.
  5. `mise factory soap delete <ACCOUNT>`.
  `SMSG_SERVER_FIRST_ACHIEVEMENT` stays mock: a realm first broadcasts to
  every player and sets a realm record (`AchievementMgr.cpp:737,750-753`).
  `SMSG_CRITERIA_DELETED` and `SMSG_ACHIEVEMENT_DELETED` are mock here,
  because their live trigger `soap gm reset-achievements` is T-6, which
  lands before wave 4; `social-4` proves them live and moves their rows.
  Add all three to `unseen`.
- [ ] **Step 10: `docs/areas/achievements.md`**, with the headings of
  contract 3.8:
  - Wire notes: the `u32` link of 0x498 against wowm's `u8`
    (`AchievementMgr.cpp:736,749`); the first field of 0x46a is a
    criteria id (`:776`); the counter is packed like a guid (`:779`).
  - Left out: achievement names (contract issue 2).
  - Capabilities row: "No verb".
  - Proof: six rows; 0x47d, 0x46a, 0x468 `live` (probe, exit codes);
    0x498, 0x49e, 0x49f `mock` (`area.test.ts` titles, writer lines
    above).
  Run `mise protocol:cite-check` and `mise lint:docs`.
- [ ] **Step 11: Checks.** `mise protocol:coverage`, `mise typecheck
  core`, `mise typecheck devtools`, `mise lint
  packages/core/src/wow/areas/achievements`, `mise ci:checks`.
- [ ] **Step 12: Commit.** `git add` the paths above, then
  `mise exec -- git commit`:

  ```
  feat: Track achievements and criteria

  The server sends the achievement set at login and a criteria update on
  every kill, and Peon logged them as unhandled stubs. The store keeps
  the set and emits each new achievement for the character and for
  nearby players.
  ```

---

## Task social-2: Receive emotes

Rulings: SR1-social-3, SR1-social-4, SR1-social-6 (section "Seed rulings (SEED-1)").

**codeArea:** `emotes`. **Phase:** 1. **Size:** S. **Proof:** live.

**Files:**

- Create: `packages/core/src/wow/areas/emotes/protocol.ts` and test,
  `store.ts` and test, `runtime.ts` and test, `area.test.ts`
- Create: `packages/core/test-support/areas/emotes.ts`
- Create: `packages/devtools/src/probe-flows/emotes-fight.ts`
- Create: `docs/areas/emotes.md`
- Modify: `packages/core/src/wow/areas/emotes/area.ts`, `opcodes.ts`
  (seeded by `SEED-1`; delete two `stubs` lines)
- Regenerate: `docs/protocol-coverage/emotes.md`

**Depends on:** `S0-5`, `SEED-1`, `T-2`, `T-3`.

**Opcodes:** `SMSG_EMOTE` (0x103), `SMSG_TEXT_EMOTE` (0x105).

**Wire:**

- 0x103: `u32` emote, `u64` guid (`Server/Packets/ChatPackets.cpp:20-26`,
  sent by `Entities/Unit/Unit.cpp:2193-2199`). Crits and parries send it
  for the victim's animation on a critical hit or a shield block
  (`Unit.cpp:2031,2033`).
- 0x105: `u64` sender guid, `u32` text emote, `u32` emote number, `u32`
  name length **without** the null, then the name with its null; for a
  length of 0 or 1 a single `0x00` byte (`Handlers/ChatHandler.cpp:693-707`).
  wowm reads a sized string whose size counts the null. AzerothCore wins:
  read the `u32`, ignore it, read a CString. A one-letter target name
  reaches the client empty.

**Steps:**

- [ ] **Step 1: Builders.** `emotesEmoteBody({ emote, guid })`,
  `emotesTextEmoteBody({ guid, textEmote, emoteNum, name })`, the latter
  written exactly as `ChatHandler.cpp:699-706` (the single `0x00` when
  the name has 0 or 1 characters).
- [ ] **Step 2: Failing parser tests.** `parseEmote`; `parseTextEmote`
  with no target (empty name), a normal target ("Tom") and a one-letter
  target ("A", which comes back empty). Run the test and see it fail.
- [ ] **Step 3: Parsers** in `areas/emotes/protocol.ts`.
- [ ] **Step 4: Failing store and runtime tests.**
  - 0x103 emits `emote` { guid, emote }; 0x105 emits `text_emote`
    { guid, self, textEmote, emoteNum, target } with `self` from
    `deps.selfGuid()`.
  - The snapshot holds `emoteStates`: guid to `NPC_EMOTESTATE` for units
    whose value is not 0. The runtime listens to `entity` events
    (`ctx.listen("entity", ...)`) and, on `appear` or `update`, reads
    `UNIT_FIELDS.NPC_EMOTESTATE` from the entity's `rawFields` (contract
    issue 8) and calls `store.setEmoteState(guid, value)`; `disappear`
    forgets the guid. `setEmoteState` emits no event.
- [ ] **Step 5: Store, runtime, registration.** `EmotesState`,
  `EmotesEvent`, `EmoteStore`, `emotesRuntime(ctx, store)` returning
  `{ act: {}, dispose }` (`social-3` adds the acts). `area.ts` registers
  `on` for both opcodes.
- [ ] **Step 6: Area test** over `areaRig("emotes")`, both opcodes and an
  entity update with a dance state (10, `EMOTE_STATE_DANCE`,
  `Handlers/ChatHandler.cpp:767-769`).
- [ ] **Step 7: Probe flow** `probe-flows/emotes-fight.ts`: attack the
  nearest living hostile creature and wait for its death or 120 s, so
  crits and parries send 0x103.
- [ ] **Step 8: Live proof.**
  1. `mise factory soap create eversong10`.
  2. `mise protocol:probe <ACCOUNT> --flow emotes-fight --expect
     SMSG_EMOTE --wait 150`. Exit 0 proves 0x103. If a fight shows none,
     run it once more; if it still shows none, the proof row is `mock`
     from `Unit.cpp:2193-2199`, and 0x103 goes into `unseen`.
  3. `mise protocol:probe <ACCOUNT> --send CMSG_TEXT_EMOTE --body
     22000000ffffffff0000000000000000 --expect SMSG_TEXT_EMOTE --wait 5`
     (text emote 34, `/dance`, emote number `0xffffffff`, no target, from
     the wowm test bytes of `chat/cmsg_text_emote.wowm:12-22`). The
     sender is inside the listen range, so it receives its own 0x105
     (`ChatHandler.cpp:781-783`) [I until this step runs]. Exit 0 proves
     0x105. Exit 3 means no self echo: record it, keep the mock row from
     `ChatHandler.cpp:693-707`, and `social-3` retries with a partner.
  4. `mise factory soap delete <ACCOUNT>`.
- [ ] **Step 9: `docs/areas/emotes.md`**: wire note on the 0x105 name
  length; Left out: none; Capabilities row: "No verb" (`social-14`
  replaces it); Proof: two rows.
- [ ] **Step 10: Checks** as in `social-1`, over `areas/emotes`.
- [ ] **Step 11: Commit.**

  ```
  feat: Read emotes from other units

  NPC animations and player text emotes arrived as unhandled stubs in
  most fights. The emote store names who emoted at whom and which units
  hold a dance or other emote state.
  ```

---

## Task social-3: Send emotes

**codeArea:** `emotes`. **Phase:** 3. **Size:** S. **Proof:** live.

**Files:**

- Create: `packages/core/src/wow/areas/emotes/names.ts` and test
- Modify: `packages/core/src/wow/areas/emotes/protocol.ts`, `runtime.ts`,
  `area.ts` and their tests; `packages/core/test-support/areas/emotes.ts`
- Create: `packages/devtools/src/probe-flows/emotes-send.ts`
- Modify: `docs/areas/emotes.md`
- Regenerate: `docs/protocol-coverage/emotes.md`

**Depends on:** `social-2`.

**Opcodes:** `CMSG_EMOTE` (0x102), `CMSG_TEXT_EMOTE` (0x104).

**Wire:**

- 0x102: `u32` emote. AzerothCore accepts only 0 and 3 (wave) and drops
  the rest (`Handlers/ChatHandler.cpp:675-676`), and drops it while dead
  (`:678-679`). The server answers with `SMSG_EMOTE` to the set.
- 0x104: `u32` text emote, `u32` emote number, `u64` target guid
  (`ChatHandler.cpp:717-752`). Dropped while dead (`:731`) or muted
  (`:736-741`); it counts against the chat flood timer (`:734`). Text
  emote 126 (`/ready`) goes to a redirect path while a redirect timer
  runs (`:722-729`). The server looks the id up in its own
  `EmotesText.dbc` (`:754-756`).

**Steps:**

- [ ] **Step 1: Name table.** `names.ts` exports `TEXT_EMOTES`, a
  `ReadonlyMap<string, number>` from lower-case name to id, copied from
  AzerothCore `TextEmotes` (`src/server/shared/SharedDefines.h:1638-1892`)
  with the `TEXT_EMOTE_` prefix removed, and `closestEmotes(name, n)`.
  Failing test first: `dance` is 34, `salute` 78, `wave` 101, `ready`
  126 (`SharedDefines.h:1673,1717,1740,1765`); `closestEmotes("dnace", 5)`
  starts with `dance`.
- [ ] **Step 2: Failing builder tests.** `buildEmote(3)` is one `u32`;
  `buildTextEmote(34, 0xffffffff, 0n)` equals the body bytes of the wowm
  test (`chat/cmsg_text_emote.wowm:12-22`, AzerothCore reader
  `ChatHandler.cpp:720,746-747`).
- [ ] **Step 3: Failing runtime tests** over `areaRig("emotes", { now })`
  with a fake clock:
  - `emote(3)` sends 0x102; `emote(5)` returns `{ ok: false, reason:
    "only_wave" }` and sends nothing.
  - `textEmote("dance", guid)` sends 0x104 with 34 and the guid;
    `textEmote("dnace")` returns `{ ok: false, reason: "unknown_emote",
    closest }` with five names; `textEmote("ready")` returns
    `{ ok: false, reason: "ready_check" }` (design 5.21 "Verbs").
  - A second `textEmote` within 1000 ms of the last send waits until the
    second has passed, then sends (the spam guard; design 5.21).
  - While the self entity has health 0 both acts return
    `{ ok: false, reason: "dead" }`.
- [ ] **Step 4: Implement** `buildEmote`, `buildTextEmote` in
  `protocol.ts` and the acts `emote(id)` and `textEmote(nameOrId,
  targetGuid?)` in `emotesRuntime`, typed as `EmotesActs`. The act
  resolves the name, so the harness never imports the table (contract
  0.3).
- [ ] **Step 5: Probe flow** `probe-flows/emotes-send.ts`: sends
  `handle.emotes.act.emote(3)`, then `textEmote("dance", <nearest NPC
  guid>)`, and waits 5 s.
- [ ] **Step 6: Live proof.**
  1. `mise factory soap create eversong10`.
  2. `mise protocol:probe <ACCOUNT> --flow emotes-send --expect
     SMSG_EMOTE --expect SMSG_TEXT_EMOTE --wait 10`. Exit 0 proves both
     client opcodes: the server answered wave with its own `SMSG_EMOTE`
     and the dance with `SMSG_TEXT_EMOTE` naming the NPC. If `social-2`
     left 0x105 in `unseen`, this run also moves it to `live`.
  3. If exit 3 on `SMSG_TEXT_EMOTE`: create a partner account, start its
     puppet with `--packet-trace headers` (T-7c), repeat the flow aimed at
     the partner, and read the partner's `packets.jsonl` for an `in`
     `SMSG_TEXT_EMOTE` row.
  4. Delete every account.
- [ ] **Step 7: Docs and checks.** Proof rows for 0x102 and 0x104
  (`live`, flow `emotes-send`), the 0x104 flood note in Wire notes; then
  the checks of `social-1`.
- [ ] **Step 8: Commit.**

  ```
  feat: Send emotes and text emotes

  Some quests reward a salute, a dance or a wave at an NPC. The emote
  acts resolve names from the server's emote list and refuse what the
  server would silently drop.
  ```

---

## Task social-14: `emote` verb

**codeArea:** `emotes`. **Phase:** 3. **Size:** S. **Proof:** eval.

**Files:**

- Create: `packages/harness/src/tools/social-emote.ts` and test (lease,
  contract issue 4)
- Modify (lease): `packages/harness/src/tools/social.ts` and
  `social.test.ts` (dispatch the new `do` value to the sibling),
  the `socialParams` block of `packages/harness/src/tools/params.ts`,
  `SocialAction` and `SocialAfter` in
  `packages/harness/src/contract/details.ts`, `socialRenderers` in
  `packages/harness/src/ui/renderers/line.ts`
- Modify: `packages/harness/src/areas/emotes/area.ts` and test (the
  `sent` row)
- Create: `packages/harness/src/grader/scenarios/t2-emotes-partner.json`
- Modify: `packages/harness/src/grader/scenarios.ts` (`ROUND_1` append),
  `docs/capabilities.md`, `docs/evals.md`

**Depends on:** `social-3`, `T-7a`, `T-7b`, item 6 (the tool shape after
#429), the `tools/social.ts` lease.

**Opcodes:** none new.

**Steps:**

- [ ] **Step 1: Failing tool tests** (`social-emote.test.ts`, over the
  mock game of `packages/harness/test-support/mock-game.ts`, with
  `jest.spyOn(handle.emotes.act, "textEmote")`):
  - `social do:"emote" what:"wave" to:"u3"` resolves the ref to a guid,
    calls `textEmote("wave", guid)`, and settles `DONE` when
    `handle.emotes.onEvent` gives a `text_emote` with `self: true` within
    2 s (triggered with `triggerAreaEvent`); without it, `UNCONFIRMED`.
  - `to` absent: no target guid.
  - The act's `unknown_emote` becomes `REFUSED unknown_emote` naming the
    five closest names; `ready_check` becomes `REFUSED` with a `next`
    pointing to group play; `dead` becomes `REFUSED dead`.
  - `expectSendKind(socialTool)` passes (the tool is kind `action`).
- [ ] **Step 2: Failing rule test** (`packages/harness/src/areas/emotes/area.test.ts`):
  a `text_emote` with `self: true` writes one `log` row `emotes/sent`
  with `data` { textEmote, target }; any other emote event returns `[]`
  (the flood guard, G17: `SMSG_EMOTE` arrives in most fights).
- [ ] **Step 3: Implement** the sibling module, the `do` value `emote` in
  `socialParams` with a `what` argument, the dispatch line in `social.ts`,
  the `After` fields, the renderer line, and the rule. Tool label text
  (at most 60 words): "Talk and act with other players: say, whisper,
  party and guild chat, channels, emotes, inspect a player, and group
  invites." Guideline: "Use social do:emote when a quest asks you to
  salute, dance or wave at someone."
- [ ] **Step 4: Scenario** `t2-emotes-partner.json`, copied from
  `t2-whisper-reply.json` (same `spawn` `fairbreeze-east`, preset
  `eversong10`, `partner: "partner"`), tier 2, budget 5 minutes, 15
  tools, 8 turns. Task: "Wave at the player standing next to you, then
  dance with them." (no partner name, contract issue 7). Checks:
  - `emoted` (`game_log`, evidence `emotes/sent`): two rows, text emotes
    101 and 34, each with the partner's name as target, written by the
    server echo.
  - If partner events are captured (contract issue 7) when this task
    starts: `witness`, the partner's rows show two `emotes` `text_emote`
    events from the agent with the partner as target.
  - `no-public-reply` as in `t2-whisper-reply`.
  Run `mise test packages/harness/src/grader/scenarios.test.ts`.
- [ ] **Step 5: Eval.** `mise eval run t2-emotes-partner --round <n>`, then
  the gates of contract 3.6 (`t1-walk-to-npc`, `t7-halt-resume`,
  `t2-whisper-reply` as the closest regression). Record the verdicts.
- [ ] **Step 6: Docs**, in the scenario's commit (D15):
  `docs/capabilities.md` row `| Emote at a player or NPC |
  \`t2-emotes-partner\` | Only emotes the server lists; none while dead;
  no ready check. |` (or the bullet of D16 if the eval did not pass);
  `docs/evals.md` "Which scenarios to run" new row
  `| Social verbs (\`social\` emote, channels, inspect) | \`t2-emotes-partner\` |`;
  `docs/areas/emotes.md` "Capabilities row" updated.
- [ ] **Step 7: Checks.** `mise typecheck harness`, `mise lint
  packages/harness/src/tools packages/harness/src/areas/emotes`,
  `mise lint:docs`, `mise ci:checks`.
- [ ] **Step 8: Commit.**

  ```
  feat: Add the social emote verb

  Emote quests ask the character to salute, dance or wave at someone,
  and no tool could. The verb resolves the emote and the target and
  settles on the server's own echo.
  ```

---

## Task social-4: Titles

**codeArea:** `achievements`. **Phase:** 4. **Size:** S. **Proof:** live.

**Files:**

- Create: `packages/core/src/wow/areas/achievements/titles.ts` and test,
  `runtime.ts` and test
- Modify: `packages/core/src/wow/areas/achievements/protocol.ts`,
  `store.ts`, `area.ts` and their tests, `opcodes.ts` (`unseen`: remove
  0x49e and 0x49f when the live run shows them)
- Modify: `packages/core/test-support/areas/achievements.ts`
- Create: `packages/devtools/src/probe-flows/achievements-title.ts`
- Modify: `docs/areas/achievements.md`
- Regenerate: `docs/protocol-coverage/achievements.md`

**Depends on:** `social-1`, `T-5` (`soap gm achievement`), `T-6`
(`soap gm reset-achievements`).

**Opcodes:** `SMSG_TITLE_EARNED` (0x373), `CMSG_SET_TITLE` (0x374).

**Wire:**

- 0x373: `u32` bit index, `u32` 1 earned or 0 lost
  (`Entities/Player/Player.cpp:13680-13683`).
- 0x374: `int32`; a value above 0 and below `MAX_TITLE_INDEX` that the
  player owns sets `PLAYER_CHOSEN_TITLE`, anything else clears it
  (`Handlers/MiscHandler.cpp:1236-1251`). No reply.

**Steps:**

- [ ] **Step 1: Failing tests.** `parseTitleEarned` both values;
  `buildSetTitle(143)` and `buildSetTitle(undefined)` (writes `-1`);
  `titles.ts` `readTitles(rawFields)` decodes the three `u64` known-title
  fields (six `u32` words from `PLAYER_FIELDS.KNOWN_TITLES` at 626) into
  bit indexes and reads `CHOSEN_TITLE` (321) (contract issue 8); the
  store emits `title_changed` { bit, earned } on 0x373; the snapshot
  gains `titles: { known, chosen }`, which the runtime refreshes on a
  self `entity` update.
- [ ] **Step 2: Implement** the parser, builder, `readTitles`, the
  runtime with the act `setTitle(bit | undefined)` (typed
  `AchievementsActs`), and the `on` line for 0x373. `setTitle` refuses a
  bit the character does not know.
- [ ] **Step 3: Probe flow** `probe-flows/achievements-title.ts`: log in,
  wait for 0x373, call `setTitle(143)`, wait for a self update whose
  chosen title is 143, call `setTitle(undefined)`, wait for 0.
- [ ] **Step 4: Live proof.**
  1. `mise factory soap create eversong10`.
  2. Achievement 2188 rewards title 143 (`data/sql/base/db_world/achievement_reward.sql:106`).
     A realm-first achievement would broadcast to every player
     (`Achievements/AchievementMgr.cpp:725-752`). If `Achievement.dbc` is
     available, confirm 2188 has neither realm-first flag
     (`src/server/shared/DataStores/DBCEnums.h:79-80`); if it is not
     available, the worker records that 2188 is not a "Realm First!"
     achievement from its title reward row and proceeds [I].
  3. Start `mise protocol:probe <ACCOUNT> --flow achievements-title
     --expect SMSG_TITLE_EARNED --wait 60`, and while it waits run
     `mise factory soap gm <ACCOUNT> achievement 2188`. Exit 0 proves
     0x373 live and 0x374 live (the chosen title changed, then cleared,
     in the self update fields).
  4. Run the probe again with `--expect SMSG_ACHIEVEMENT_DELETED --expect
     SMSG_CRITERIA_DELETED --wait 30` while
     `mise factory soap gm <ACCOUNT> reset-achievements` runs
     (`src/server/scripts/Commands/cs_reset.cpp:51,66-78` →
     `AchievementMgr.cpp:495-508`). Exit 0 moves both rows from `mock` to
     `live` and removes them from `unseen`. A reset also removes title
     143 and sends 0x373 with 0.
  5. `mise factory soap delete <ACCOUNT>`.
- [ ] **Step 5: Docs and checks.** Proof rows for 0x373, 0x374 and the two
  deleted opcodes; Left out: a title verb (design 5.21 "Decisions").
- [ ] **Step 6: Commit.**

  ```
  feat: Read titles and set the chosen title

  Titles lived in update fields that core never read. The achievement
  area now tracks known and chosen titles and can choose or clear one.
  ```

---

## Task social-5a: Contacts, notes and the ignore reply

**codeArea:** `contacts`. **Phase:** 4. **Size:** S. **Proof:** live.

**Files:**

- Create: `packages/core/src/wow/areas/contacts/protocol.ts` and test,
  `store.ts` and test, `runtime.ts` and test, `area.test.ts`
- Create: `packages/core/test-support/areas/contacts.ts`
- Create: `packages/devtools/src/probe-flows/contacts-notes.ts`
- Create: `docs/areas/contacts.md`
- Modify: `packages/core/src/wow/areas/contacts/area.ts`, `opcodes.ts`
  (`uses`: `SMSG_CONTACT_LIST`, `SMSG_MESSAGECHAT`; `dead`: the two rows
  at the end of this file if the seed did not write them)
- Modify (lease): `packages/core/src/wow/world-handlers-social.ts` and
  test, `packages/core/src/wow/friend-store.ts` and test
- Modify: `packages/harness/src/puppet/calls.ts` (sorted keys
  `addFriend`, `addIgnore`, `sendWhisper`)
- Regenerate: `docs/protocol-coverage/contacts.md`

**Depends on:** `SEED-4`, `T-3`, `T-7a`, the lease.

**Opcodes:** `CMSG_CONTACT_LIST` (0x066), `CMSG_SET_CONTACT_NOTES`
(0x06b), `CMSG_CHAT_IGNORED` (0x225).

**Wire:**

- 0x066: `u32` flags; the reply `SMSG_CONTACT_LIST` holds only the lists
  whose bit is set (`Handlers/Socialhandler.cpp:30-36`,
  `Entities/Player/SocialMgr.cpp:125-165`). The login list uses all flags
  (`Entities/Player/Player.cpp:11770`).
- 0x06b: `u64` guid, CString note (`Socialhandler.cpp:148-154`). No reply.
- 0x225: `u64` guid, `u8` (`Handlers/ChatHandler.cpp:792-807`). The server
  sends a `CHAT_MSG_IGNORED` chat packet to the ignored player
  (`:804-806`); it does not filter whispers itself.

**Steps:**

- [ ] **Step 1: Failing legacy tests (lease).**
  - `world-handlers-social.test.ts`: an `SMSG_CONTACT_LIST` with
    `listMask` 1 (friends) replaces the friend store and leaves the ignore
    store unchanged; mask 2 the reverse; mask 7 both
    (`SocialMgr.cpp:139-144`). Today it replaces both
    (`world-handlers-social.ts:24-28`).
  - `friend-store.test.ts`: `setNote(guid, note)` changes the entry's
    note and emits the store's existing update event.
- [ ] **Step 2: Fix them.** `handleContactList` sets a store only when its
  bit is in `listMask`; `FriendStore.setNote`.
- [ ] **Step 3: Failing area tests.**
  - Builders: `buildContactListRequest(1)`, `buildSetContactNote(guid,
    "tank")`, `buildChatIgnored(guid)` (guid, `u8 0`), against the readers
    above.
  - Runtime over `areaRig("contacts", { register })`, where `register`
    passes the legacy social handlers so `SMSG_CONTACT_LIST` has its real
    owner (D24): `requestContacts(1)` sends 0x066 and resolves on the next
    `SMSG_CONTACT_LIST` or rejects after 3 s; `setFriendNote("Tom",
    "tank")` sends 0x06b with Tom's guid from `ctx.legacy.friends()` and
    calls `core` friend store `setNote`; an unknown friend returns
    `{ ok: false, reason: "not_friend" }`.
  - Ignore policy (N30, contract issue 6): a peeked `SMSG_MESSAGECHAT`
    whisper from a guid in `ctx.legacy.ignored()` makes the store emit
    `ignored_whisper` { guid }, and the runtime sends one 0x225 for that
    guid; a second whisper from the same guid in the session sends none;
    a whisper from a guid not ignored sends none.
- [ ] **Step 4: Implement** the builders, `ContactsState` (the set of
  guids already told), `ContactsEvent`, `ContactStore`, `contactsRuntime`
  with the acts `requestContacts`, `setFriendNote`, `reportIgnored`
  (`ContactsActs`), and `area.ts` with the `peek` on `SMSG_MESSAGECHAT`.
- [ ] **Step 5: Partner calls.** Add `addFriend`, `addIgnore` and
  `sendWhisper` to `PUPPET_CALLS` (sorted keys; each exists on
  `WorldHandle`, `packages/core/src/wow/client.ts:170,207,211`) with a
  test that each key names a mock-game function.
- [ ] **Step 6: Probe flow** `probe-flows/contacts-notes.ts` with
  `--arg friend=<NAME>`: `addFriend(name)`, wait for the friend entry,
  `setFriendNote(name, "peon")`, `requestContacts(1)`, then print the
  friend's note and the ignore count before and after; then
  `addIgnore(name)` and wait 60 s for whispers.
- [ ] **Step 7: Live proof.**
  1. Create Own and Partner (`eversong10`); start Partner's puppet.
  2. `mise protocol:probe <OWN> --flow contacts-notes --arg
     friend=<PARTNER> --expect SMSG_CONTACT_LIST --wait 90`, and during the
     60 s window `tmp/puppet-<PARTNER> send -w <OWN> "hello"`. Evidence:
     the printed note is `peon` after the flags-1 reply (0x066 and 0x06b
     live); the ignore count is unchanged by that reply (the mask fix);
     Own's trace has an `out` row for `CMSG_CHAT_IGNORED`; Partner's
     `read --json` shows a chat event of type 0x19 (0x225 live).
  3. Stop the puppet and delete both accounts.
- [ ] **Step 8: `docs/areas/contacts.md`**: Wire notes on the list mask;
  Left out: a contacts verb (design 5.21); Capabilities row "No verb";
  Proof: three `live` rows and two `dead` rows.
- [ ] **Step 9: Checks** as in `social-1`, plus `mise typecheck harness`.
- [ ] **Step 10: Commit.** Two commits, the legacy fix first:

  ```
  fix: Keep the ignore list on a friends-only reply

  The server filters a contact list by the flags the client asked for,
  and Peon replaced both lists on every reply. A friends-only reply now
  leaves the ignore list alone.
  ```

  ```
  feat: Request contacts and set friend notes

  The character can now ask for its contact lists, keep a note on a
  friend, and tell an ignored whisperer once that it ignores them, as the
  game client does.
  ```

---

## Task social-5b: Ignored and achievement chat types

**codeArea:** `contacts`. **Phase:** 4. **Size:** S. **Proof:** live.

**Files:**

- Modify (lease): `packages/core/src/wow/protocol/chat.ts` and its test;
  `packages/core/src/wow/protocol/enums.ts` `ChatType` (contract issue 3)

**Depends on:** `social-5a`, the lease on `protocol/chat.ts` (or the
`COORD` commit of contract issue 3).

**Opcodes:** none owned (the fix is in `SMSG_MESSAGECHAT`, a core row).

**Wire:** `CHAT_MSG_ACHIEVEMENT` (0x30) and `CHAT_MSG_GUILD_ACHIEVEMENT`
(0x31) write the receiver guid (`Chat/Chat.cpp:320-323`), the message,
the tag, then a `u32` achievement id (`:347-348`). `CHAT_MSG_IGNORED` is
0x19 (`src/server/shared/SharedDefines.h:3410`).

**Steps:**

- [ ] **Step 1: Failing tests** in `protocol/chat.test.ts`: a body built
  as `Chat.cpp:278-348` with type 0x30 and id 6 parses with
  `achievementId: 6`; type 0x31 the same; type 0x19 parses with
  `type: ChatType.IGNORED`; an ordinary say has no `achievementId`.
- [ ] **Step 2: Implement.** `ChatType` gains `IGNORED`, `ACHIEVEMENT`,
  `GUILD_ACHIEVEMENT`; `ChatMessage` gains `achievementId?: number`;
  `parseChatMessage` reads the id after the tag for the two types
  (`protocol/chat.ts:78-96`).
- [ ] **Step 3: Live proof.** Run `social-1`'s level-10 step once more
  with a partner puppet standing beside Own: the partner's `read --json`
  shows a chat event of type 0x30 with `achievementId` 6 (the say-range
  broadcast of `Achievements/AchievementMgr.cpp:757-763`). Delete both
  accounts.
- [ ] **Step 4: Checks.** `mise test packages/core/src/wow/protocol`,
  `mise typecheck core`, `mise ci:checks`.
- [ ] **Step 5: Commit.**

  ```
  fix: Read ignored and achievement chat types

  Achievement announcements carry the achievement id after the chat tag,
  and Peon dropped it. Three chat types the server sends now have names.
  ```

---

## Task social-6: Inspect

**codeArea:** `inspect`. **Phase:** 4. **Size:** M. **Proof:** live, and
mock for the short talent form.

**Files:**

- Create: `packages/core/src/wow/areas/inspect/protocol.ts` and test,
  `store.ts` and test, `runtime.ts` and test, `area.test.ts`
- Create: `packages/core/test-support/areas/inspect.ts`
- Create: `packages/devtools/src/probe-flows/inspect-partner.ts`
- Create: `docs/areas/inspect.md`
- Modify: `packages/core/src/wow/areas/inspect/area.ts` (the short
  talent form is a form, not an opcode, so `opcodes.ts` gets no `unseen`
  entry for it)
- Regenerate: `docs/protocol-coverage/inspect.md`

**Depends on:** `social-1` (`parseAchievementData`, contract issue 1),
`talents-1` (`protocol/talent-spec.ts`, N28), `SEED-4`, `T-3`, `T-7a`.

**Opcodes:** `CMSG_INSPECT` (0x114), `SMSG_INSPECT_TALENT` (0x3f4),
`CMSG_QUERY_INSPECT_ACHIEVEMENTS` (0x46b),
`SMSG_RESPOND_INSPECT_ACHIEVEMENTS` (0x46c).

**Wire:**

- 0x114: `u64` guid. The server answers only within `INSPECT_DISTANCE`
  (28 yd) and for a target that is not attackable; otherwise it is silent
  (`Handlers/MiscHandler.cpp:977-997`).
- 0x3f4: packed guid, then either the talent block of
  `Player::BuildPlayerTalentsInfoData` (`Entities/Player/Player.cpp:14734-14765`:
  free points, spec count, active spec, per spec the talents and a glyph
  count with `u16` glyphs **inside** the spec) or, with
  `TalentsInspecting` off, `u32 0, u8 0, u8 0` (`MiscHandler.cpp:1003-1013`);
  then the gear block of `BuildEnchantmentsInfoData` (`Player.cpp:14851-14890`:
  `u32` slot mask, per set bit entry `u32`, enchant mask `u16`, a `u16`
  per set enchant bit, random property `int16`, packed creator guid,
  suffix factor `u32`). wowm puts one glyph list after all specs;
  AzerothCore wins.
- 0x46b: packed guid, with the same range and attack checks
  (`MiscHandler.cpp:1590-1612`).
- 0x46c: packed guid, then the all-data body
  (`Achievements/AchievementMgr.cpp:2407-2413`).

**Steps:**

- [ ] **Step 1: Builders** `inspectInspectTalentBody({ guid, talents,
  gear })` with a `short: true` form, and
  `inspectRespondInspectAchievementsBody({ guid, done, criteria })`.
- [ ] **Step 2: Failing parser tests.** `parseInspectTalent` with one
  spec, two specs (glyphs inside each spec), and the short form; gear
  with an empty slot mask, and with main hand (slot 15) holding one
  enchant; `parseRespondInspectAchievements` reuses
  `parseAchievementData`; `buildInspect(guid)` (a `u64`) and
  `buildQueryInspectAchievements(guid)` (packed).
- [ ] **Step 3: Parsers.** The talent block uses the spec reader of
  `protocol/talent-spec.ts` (N28; the builder reads its landed export
  name).
- [ ] **Step 4: Failing runtime tests** over `areaRig("inspect")`:
  `inspect(guid)` sends 0x114 and resolves with the parsed reply whose
  guid matches; a reply for another guid does not resolve it; no reply
  in 3 s resolves `undefined`. `inspectAchievements(guid)` the same for
  0x46b and 0x46c. The store keeps no state (`emptyStore()` shape plus the
  `reply` events the waits need).
- [ ] **Step 5: Implement** `InspectResult`, `InspectEvent` (`talents`,
  `achievements`), `InspectStore`, `inspectRuntime` with the acts
  `inspect` and `inspectAchievements` (`InspectActs`), and `area.ts`.
- [ ] **Step 6: Probe flow** `probe-flows/inspect-partner.ts` with
  `--arg name=<NAME>`: find the named player in nearby entities, print its
  distance, call both acts, print gear entries, spent points per spec and
  the achievement count; then, if `--arg far=1`, walk 40 yd away and call
  `inspect` again, which must resolve `undefined`.
- [ ] **Step 7: Live proof.**
  1. Create Own and Partner; start Partner's puppet.
  2. `mise protocol:probe <OWN> --flow inspect-partner --arg
     name=<PARTNER> --expect SMSG_INSPECT_TALENT --expect
     SMSG_RESPOND_INSPECT_ACHIEVEMENTS --wait 30`. Exit 0 proves all four.
     Compare the printed gear entries with `mise factory soap truth
     <PARTNER>` equipment.
  3. The short form stays mock: its trigger is a server config value
     (`TalentsInspecting`, default 1, `World/WorldConfig.cpp:406`) that no
     worker may change. The proof row notes the form in Wire notes.
  4. Delete both accounts.
- [ ] **Step 8: `docs/areas/inspect.md`**, four proof rows, Wire notes on
  the per-spec glyphs, Capabilities row "No verb" (`social-16` replaces
  it). Checks as in `social-1`.
- [ ] **Step 9: Commit.**

  ```
  feat: Inspect another player

  A party member's gear and talents came only from their update fields.
  The inspect area asks the server and returns talents, glyphs, gear
  with enchants and achievements.
  ```

---

## Task social-7: Channel notices and admin, part 1

**codeArea:** `channels`. **Phase:** 4. **Size:** M. **Proof:** live.

**Files:**

- Create: `packages/core/src/wow/areas/channels/protocol.ts` and test,
  `notice.ts` and test (the notice table), `store.ts` and test,
  `runtime.ts` and test, `area.test.ts`
- Create: `packages/core/test-support/areas/channels.ts`
- Create: `packages/devtools/src/probe-flows/channels-admin.ts`
- Create: `docs/areas/channels.md`
- Modify: `packages/core/src/wow/areas/channels/area.ts`, `opcodes.ts`
  (`uses`: `SMSG_CHANNEL_NOTIFY`, `CMSG_JOIN_CHANNEL`,
  `CMSG_LEAVE_CHANNEL`)
- Modify: `packages/harness/src/puppet/calls.ts` (sorted keys
  `joinChannel`, `leaveChannel`, `sendChannel`)
- Regenerate: `docs/protocol-coverage/channels.md`

**Depends on:** `SEED-4`, `T-3`, `T-7a` (partner calls), `T-7b`
(partner events), `T-7c` (partner raw send).

**Opcodes:** `CMSG_CHANNEL_PASSWORD` (0x09c), `CMSG_CHANNEL_SET_OWNER`
(0x09d), `CMSG_CHANNEL_OWNER` (0x09e), `CMSG_CHANNEL_MODERATOR` (0x09f),
`CMSG_CHANNEL_UNMODERATOR` (0x0a0), `CMSG_CHANNEL_MUTE` (0x0a1),
`CMSG_CHANNEL_UNMUTE` (0x0a2), `CMSG_CHANNEL_INVITE` (0x0a3).

**Wire:**

- Every admin send is a CString channel name, or the name and a CString
  player name (`Handlers/ChannelHandler.cpp:105-220`). The server acts
  only when the sender is on the channel and answers with
  `SMSG_CHANNEL_NOTIFY`, never its own opcode. Passwords longer than 31
  are dropped (`ChannelHandler.cpp:112`, `Chat/Channels/ChannelMgr.h:26`).
- `SMSG_CHANNEL_NOTIFY`: `u8` notice, CString name
  (`Chat/Channels/Channel.cpp:952-957`), then the per-type trailer of the
  36 notices (`Chat/Channels/Channel.h:30-70`, `Channel.cpp:959-1160,1265-1275`).
  The legacy parser reads 2 types fully and drops the flags and id of
  "you joined" (`packages/core/src/wow/protocol/chat.ts:166-189`).
  wowm's single optional pair does not describe the trailers; AzerothCore
  wins.
- A custom channel with no owner makes the first joiner its owner
  (`Channel.cpp:238-243`).

**Steps:**

- [ ] **Step 1: Builders.** `channelsChannelNotifyBody(notice)` for every
  one of the 36 types, writing the trailer of its `Make*` function
  (`Channel.cpp:959-1160,1265-1275`).
- [ ] **Step 2: Failing notice tests** (`notice.test.ts`): one case per
  type, each round-tripping to a typed union member
  (`{ type: "you_joined"; channel; flags; channelId }`,
  `{ type: "mode_change"; channel; guid; oldFlags; newFlags }`,
  `{ type: "player_kicked"; channel; target; actor }`,
  `{ type: "invite"; channel; inviter }`, ...). Names are the AzerothCore
  names in snake case without `_notice`.
- [ ] **Step 3: `parseChannelNotice`** in `notice.ts`.
- [ ] **Step 4: Failing builder tests** for the eight admin sends against
  the readers of `ChannelHandler.cpp:105-220`.
- [ ] **Step 5: Failing store tests.** `ChannelStore` keyed by the
  notice's channel name: `you_joined` adds `{ name, channelId, flags,
  selfFlags: 0, joinedAt }`; `you_left` deletes it; `mode_change` for the
  own guid updates `selfFlags`; `owner_changed` and `channel_owner`
  update `ownerName` or `owner`; every notice emits `channel_notice`
  { notice }; `invite` sets `pendingInvite` { channel, inviter, at },
  and the snapshot hides it 60 s after `at` (`deps.now()`; the store arms
  no timer). The snapshot keeps join order, so a later COORD commit can
  serve `getChannel(index)` from it (contract issue 5).
- [ ] **Step 6: Failing runtime tests** over `areaRig("channels")`:
  `channelAdmin(name, "password", "abc")` sends 0x09c and resolves with
  the first `channel_notice` for that channel within 2 s, else
  `undefined` (`UNCONFIRMED` in the harness); a password of 32 characters
  and a channel the store does not hold return `{ ok: false, reason }`
  (`too_long`, `not_member`) and send nothing. One case per admin action:
  `password`, `set_owner`, `owner`, `moderator`, `unmoderator`, `mute`,
  `unmute`, `invite`.
- [ ] **Step 7: Implement** `notice.ts`, the builders, `ChannelStore`,
  `channelsRuntime` with `channelAdmin` (`ChannelsActs`), and `area.ts`
  with `peek` on `SMSG_CHANNEL_NOTIFY` (the legacy handler stays its
  owner).
- [ ] **Step 8: Partner calls.** `joinChannel`, `leaveChannel`,
  `sendChannel` in `PUPPET_CALLS` (`client.ts:180,194,195`), sorted, with
  the mock-game test.
- [ ] **Step 9: Probe flow** `probe-flows/channels-admin.ts` with
  `--arg channel=<name> --arg partner=<NAME>`: join the channel through
  the legacy `joinChannel`, wait until the partner is on it (the flow
  polls `channelAdmin(..., "owner")` and the notices), then run the eight
  actions in order: owner, moderator, unmoderator, mute, unmute,
  password, set_owner (to the partner), and last invite after the
  partner leaves. It prints each notice.
- [ ] **Step 10: Live proof.**
  1. Create Own and Partner; start Partner's puppet. Pick a fresh name
     `peon<6 hex>` (design 5.21).
  2. Start `mise protocol:probe <OWN> --flow channels-admin --arg
     channel=<NAME> --arg partner=<PARTNER> --expect SMSG_CHANNEL_NOTIFY
     --wait 120`; then `tmp/puppet-<PARTNER> call joinChannel
     '["<NAME>"]'`; when the flow prints "invite next",
     `tmp/puppet-<PARTNER> call leaveChannel '["<NAME>"]'`. Evidence: a
     notice per action (`channel_owner`, `mode_change` ×4,
     `password_changed`, `owner_changed`, `player_invited`); Partner's
     `events --json` (T-7b) shows the `invite` notice.
  3. The reverse direction: Partner joins a second fresh channel and is
     owner; `tmp/puppet-<PARTNER> raw CMSG_CHANNEL_INVITE <hex of name +
     Own's name>` (T-7c); Own's probe (`--wait 30`) prints `invite` and
     the store's `pendingInvite`.
  4. Stop the puppet and delete both accounts. The custom channels close
     when empty; with `PreserveCustomChannels` on, a row expires after its
     configured days (design 5.21 "Needs the maintainer" lists no rule;
     the live value could not be determined).
- [ ] **Step 11: `docs/areas/channels.md`**: Wire notes (notice
  trailers, "you joined" flags and id, the leading byte of the list for
  `social-9`), Left out (none yet), Capabilities row "No verb", eight
  `live` proof rows. The report requests the `conn.channels` COORD commit
  (D20). Checks as in `social-1`, plus `mise typecheck harness`.
- [ ] **Step 12: Commit.**

  ```
  feat: Read channel notices and moderate

  Peon read two of the 36 channel notices and could not run a channel it
  owned. It now tracks its channels and flags and sends the owner and
  moderator actions, each settling on the server's notice.
  ```

---

## Task social-8: Channel admin, part 2, and join by id

**codeArea:** `channels`. **Phase:** 4. **Size:** S. **Proof:** live, and
accepted for the decline.

**Files:**

- Create: `packages/core/src/wow/areas/channels/zone.ts` and test
- Modify: `packages/core/src/wow/areas/channels/protocol.ts`,
  `runtime.ts` and their tests; `packages/core/test-support/areas/channels.ts`
- Modify: `packages/devtools/src/probe-flows/channels-admin.ts`
- Modify: `docs/areas/channels.md`
- Regenerate: `docs/protocol-coverage/channels.md`

**Depends on:** `social-7`.

**Opcodes:** `CMSG_CHANNEL_KICK` (0x0a4), `CMSG_CHANNEL_BAN` (0x0a5),
`CMSG_CHANNEL_UNBAN` (0x0a6), `CMSG_CHANNEL_ANNOUNCEMENTS` (0x0a7),
`CMSG_CHANNEL_MODERATE` (0x0a8), `CMSG_DECLINE_CHANNEL_INVITE` (0x410).

**Wire:**

- Kick, ban, unban: name and player (`Handlers/ChannelHandler.cpp:222-265`);
  announcements and moderate: name (`:267-290`).
- 0x410: AzerothCore reads nothing and only logs
  (`Handlers/ChatHandler.cpp:809-815`); wowm has no definition. The body
  the game client sends could not be determined; the builder writes the
  channel name as a CString [I], which the server ignores either way.
- `CMSG_JOIN_CHANNEL`: `u32` channel id, two `u8`, name, password
  (`ChannelHandler.cpp:25-31`). With id 0 the server takes the name as
  given and creates a custom channel when none exists
  (`Chat/Channels/ChannelMgr.cpp:121-136`), which can capture a zone
  channel's name. With an id it checks the zone (`ChannelHandler.cpp:34-42`).

**Steps:**

- [ ] **Step 1: Failing tests.**
  - Builders for the six sends; `buildJoinChannel(name, { channelId,
    password })` writes the id (the legacy builder always writes 0,
    `packages/core/src/wow/protocol/chat.ts:191-199`).
  - `channelAdmin` gains `kick`, `ban`, `unban`, `announcements`,
    `moderate`; `declineChannelInvite()` sends 0x410 with the pending
    invite's channel and clears it, or returns `{ ok: false, reason:
    "no_invite" }`.
  - `zone.ts`: `zoneChannel(name)` is true for a name that starts with
    `General`, `Trade`, `LocalDefense`, `WorldDefense`,
    `GuildRecruitment` or `LookingForGroup` (`Chat/Channels/Channel.h:82-97`),
    ignoring case; `ZONE_CHANNEL_IDS` holds `LookingForGroup: 26`
    (`Entities/Player/PlayerUpdates.cpp:478`) and the ids the live step
    confirms.
  - `joinChannel(name, options)` sends `CMSG_JOIN_CHANNEL` and resolves
    on the first notice for that name or, when an id was sent, on the
    `you_joined` notice with that id (the name may differ,
    `ChannelHandler.cpp:44-59`); 2 s, else `undefined`. A zone channel
    name with no id returns `{ ok: false, reason: "zone_channel" }` and
    sends nothing (N30). `leaveChannel(name)` the same for "you left".
- [ ] **Step 2: Implement** them in `protocol.ts`, `zone.ts` and
  `runtime.ts`.
- [ ] **Step 3: Flow.** `channels-admin.ts` gains a second phase
  (`--arg phase=2`): announcements, moderate, kick, ban (the partner's
  rejoin gets `banned`), unban; then decline a pending invite; then
  `joinChannel("General - Eversong Woods", { channelId: 1 })` [I: id 1]
  and print the `you_joined` id.
- [ ] **Step 4: Live proof.** The setup of `social-7` step 10, with
  `--arg phase=2`, and `tmp/puppet-<PARTNER> call joinChannel` for each
  rejoin. Evidence: `announcements_on`/`_off`, `moderation_on`/`_off`,
  `player_kicked`, `player_banned`, the partner's `banned` notice in its
  `events --json`, `player_unbanned`. The decline: an `out` row for
  0x410 in Own's trace, and the session stays up (proof `accepted`,
  N24). The join: the `you_joined` notice for General carries the id
  sent; record it in `ZONE_CHANNEL_IDS` only if it matches. Delete both
  accounts.
- [ ] **Step 5: Docs and checks.** Six proof rows (five `live`, 0x410
  `accepted`), the zone-channel note in Wire notes.
- [ ] **Step 6: Commit.**

  ```
  feat: Kick, ban and join channels by id

  A join with id 0 can create a custom channel with a zone channel's
  name. Joins now send the channel id, zone names without one are
  refused, and the remaining owner actions are wired.
  ```

---

## Task social-9: Channel list and member count

**codeArea:** `channels`. **Phase:** 4. **Size:** S. **Proof:** live.

**Files:**

- Modify: `packages/core/src/wow/areas/channels/protocol.ts`, `store.ts`,
  `runtime.ts`, `area.ts` and their tests, `opcodes.ts` (delete the
  `SMSG_CHANNEL_LIST` stub line)
- Modify: `packages/core/test-support/areas/channels.ts`
- Create: `packages/devtools/src/probe-flows/channels-list.ts`
- Modify: `docs/areas/channels.md`
- Regenerate: `docs/protocol-coverage/channels.md`

**Depends on:** `social-7`.

**Opcodes:** `CMSG_CHANNEL_LIST` (0x09a), `SMSG_CHANNEL_LIST` (0x09b),
`CMSG_CHANNEL_DISPLAY_LIST` (0x3d2), `CMSG_GET_CHANNEL_MEMBER_COUNT`
(0x3d4), `SMSG_CHANNEL_MEMBER_COUNT` (0x3d5).

**Wire:**

- 0x09a and 0x3d2: CString name (`Handlers/ChannelHandler.cpp:92-103,292-296`).
- 0x09b: `u8 1`, CString name, `u8` flags, `u32` count, then `u64` guid
  and `u8` member flags each (`Chat/Channels/Channel.cpp:701-727`). wowm
  has no leading byte; AzerothCore wins. An empty list for a channel whose
  rights forbid speaking (`:713`).
- 0x3d4: CString name; 0x3d5: CString name, `u8` flags, `u32` count
  (`ChannelHandler.cpp:298-319`).

**Steps:**

- [ ] **Step 1: Failing tests.** `parseChannelList` with the leading
  byte and two members, and empty; `parseChannelMemberCount`; the three
  builders; `listChannel(name)` resolves on `SMSG_CHANNEL_LIST` for that
  name or on a `not_member` notice (3 s); `listChannel(name, { display:
  true })` sends 0x3d2; `channelMemberCount(name)` resolves the count or
  `undefined`; both store updates emit `channel_members`.
- [ ] **Step 2: Implement**, register `on` for 0x09b and 0x3d5, delete
  the stub line.
- [ ] **Step 3: Probe flow** `channels-list.ts`: join a fresh channel,
  wait for the partner, list it, list it with display, ask the count,
  list a channel it is not on.
- [ ] **Step 4: Live proof.** Own and Partner as in `social-7`;
  `mise protocol:probe <OWN> --flow channels-list --arg channel=<NAME>
  --expect SMSG_CHANNEL_LIST --expect SMSG_CHANNEL_MEMBER_COUNT --wait 60`.
  Evidence: both guids with flags, count 2, `not_member` for the other
  name. Delete both accounts.
- [ ] **Step 5: Docs and checks.** Five `live` rows.
- [ ] **Step 6: Commit.**

  ```
  feat: List channel members and counts

  The channel member list arrived as an unhandled stub. The channel area
  now asks for the list and the count and keeps both per channel.
  ```

---

## Task social-10: Channel watch and user list

**codeArea:** `channels`. **Phase:** 4. **Size:** S. **Proof:** live.

**Files:**

- Modify: `packages/core/src/wow/areas/channels/protocol.ts`, `store.ts`,
  `runtime.ts`, `area.ts` and their tests
- Modify: `packages/core/test-support/areas/channels.ts`
- Create: `packages/devtools/src/probe-flows/channels-watch.ts`
- Modify: `docs/areas/channels.md`
- Regenerate: `docs/protocol-coverage/channels.md`

**Depends on:** `social-9`.

**Opcodes:** `CMSG_SET_CHANNEL_WATCH` (0x3ef), `CMSG_CLEAR_CHANNEL_WATCH`
(0x3f3), `SMSG_USERLIST_ADD` (0x3f0), `SMSG_USERLIST_REMOVE` (0x3f1),
`SMSG_USERLIST_UPDATE` (0x3f2).

**Wire:**

- 0x3ef and 0x3f3: CString name (`Handlers/ChannelHandler.cpp:321-347`).
  A watch first clears every other watch (`:326`); only a member can
  watch (`Chat/Channels/Channel.cpp:1213-1224`). No reply.
- 0x3f0: `u64` guid, `u8` member flags, `u8` channel flags, `u32` count,
  CString name (`Channel.cpp:1163-1176`); 0x3f1: guid, channel flags,
  count, name (`:1180-1192`); 0x3f2: as 0x3f0 (`:1196-1209`). Sent only
  to watchers.

**Steps:**

- [ ] **Step 1: Failing tests.** The three parsers and two builders;
  `watchChannel(name)` sets `watched` on that channel and clears it on
  every other (mirroring `:326`); `unwatchChannel(name)`; each user-list
  packet updates the channel's `members` map and `memberCount` and emits
  `channel_members` { channel, change }.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Probe flow** `channels-watch.ts`: join, watch, wait for
  the partner's join, make it moderator, wait for its leave, unwatch,
  wait 20 s more.
- [ ] **Step 4: Live proof.** Own and Partner; the partner joins, leaves
  and rejoins through `call`. `--expect SMSG_USERLIST_ADD --expect
  SMSG_USERLIST_UPDATE --expect SMSG_USERLIST_REMOVE`. Evidence: the three
  opcodes arrive while watched, and the rejoin after the unwatch brings no
  `SMSG_USERLIST_ADD` (the trace count stays the same). Delete both
  accounts.
- [ ] **Step 5: Docs and checks.** Five `live` rows.
- [ ] **Step 6: Commit.**

  ```
  feat: Watch channel member lists

  A watched channel pushes every join, leave and flag change. The
  channel area keeps the member list current while it watches.
  ```

---

## Task social-11a: Voice

**codeArea:** `channels`. **Phase:** 4. **Size:** S. **Proof:** accepted
(N24).

**Files:**

- Modify: `packages/core/src/wow/areas/channels/protocol.ts`,
  `runtime.ts` and their tests
- Modify: `docs/areas/channels.md`
- Regenerate: `docs/protocol-coverage/channels.md`

**Depends on:** `social-7`.

**Opcodes:** `CMSG_VOICE_SESSION_ENABLE` (0x3af),
`CMSG_SET_ACTIVE_VOICE_CHANNEL` (0x3d3), `CMSG_CHANNEL_VOICE_ON` (0x3d6).

**Wire:** 0x3af: two `u8` (voice, microphone), skipped
(`Handlers/VoiceChatHandler.cpp:23-29`); 0x3d3: `u32`, CString, skipped
(`:37-42`); 0x3d6: empty body, nothing done (`:31-35`).

**Steps:**

- [ ] **Step 1: Failing builder tests** against those readers, and act
  tests: `setVoice(voice, mic)`, `setActiveVoiceChannel(id, name)`,
  `channelVoiceOn()` each send one packet.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Live proof.** `mise factory soap create eversong10`;
  `mise protocol:probe <ACCOUNT> --send CMSG_VOICE_SESSION_ENABLE --body
  0000 --send CMSG_SET_ACTIVE_VOICE_CHANNEL --body 000000007800 --send
  CMSG_CHANNEL_VOICE_ON --wait 10`. Evidence: three `out` rows, no packet
  error, no disconnect (exit 0). Proof `accepted`. Delete the account.
- [ ] **Step 4: Docs and checks.** Three `accepted` rows.
- [ ] **Step 5: Commit.**

  ```
  feat: Send the voice chat opcodes

  The server accepts the three voice opcodes and does nothing with them.
  Core can send them, so every client opcode of the channel area exists.
  ```

---

## Task social-11b: Complaints

**codeArea:** `complaints`. **Phase:** 4. **Size:** S. **Proof:** mock and
builder (N25).

**Files:**

- Create: `packages/core/src/wow/areas/complaints/protocol.ts` and test,
  `store.ts` and test, `runtime.ts` and test, `area.test.ts`
- Create: `packages/core/test-support/areas/complaints.ts`
- Create: `docs/areas/complaints.md`
- Modify: `packages/core/src/wow/areas/complaints/area.ts`, `opcodes.ts`
  (`unseen`: both opcodes)
- Regenerate: `docs/protocol-coverage/complaints.md`

**Depends on:** `SEED-4`.

**Opcodes:** `CMSG_COMPLAIN` (0x3c7), `SMSG_COMPLAIN_RESULT` (0x3c8).

**Wire:**

- 0x3c7: `u8` type (0 mail, 1 chat), `u64` guid; mail: three `u32`;
  chat: four `u32` and a CString (`Server/Packets/MiscPackets.cpp:144-163`).
  The handler always answers 0x3c8 and, with `LogSpamReports` on, writes a
  `spam_reports` row (`Handlers/MiscHandler.cpp:1141-1165`). By N25 no
  worker sends it live.
- 0x3c8: one `u8` (`MiscPackets.cpp:165-170`); wowm has two. AzerothCore
  wins; the parser reads one byte and tolerates a second.

**Steps:**

- [ ] **Step 1: Failing tests.** `buildComplainChat(guid, language,
  chatType, channelId, secondsAgo, text)` and `buildComplainMail(guid,
  mailId)` against the reader; `parseComplainResult` with one and with two
  bytes; `complain(guid, detail)` sends 0x3c7 and resolves `true` on
  0x3c8 within 3 s, else `false`; the store emits `complaint_received`
  { code }.
- [ ] **Step 2: Implement**, register `on` for 0x3c8.
- [ ] **Step 3: Proof.** The area test injects 0x3c8 built from
  `MiscPackets.cpp:165-170` (mock, "not seen live"); 0x3c7 is `builder`
  with the reader `MiscPackets.cpp:144-163`. Both go in `unseen`. No
  live send (N25; design 5.21 "Needs the maintainer").
- [ ] **Step 4: `docs/areas/complaints.md`**; Left out: the live send
  (N25); Capabilities row "No verb"; checks as in `social-1`.
- [ ] **Step 5: Commit.**

  ```
  feat: Add the complaint send and reply

  Core can now build both complaint forms and read the server's one-byte
  reply. The send stays unproven live, because it writes a moderation
  row that outlives the accounts.
  ```

---

## Task social-12: Refer-a-friend

**codeArea:** `referral`. **Phase:** 4. **Size:** S. **Proof:** live
(grant, failure), accepted (accept), mock (propose).

**Files:**

- Create: `packages/core/src/wow/areas/referral/protocol.ts` and test,
  `store.ts` and test, `runtime.ts` and test, `area.test.ts`
- Create: `packages/core/test-support/areas/referral.ts`
- Create: `packages/devtools/src/probe-flows/referral-grant.ts`
- Create: `docs/areas/referral.md`
- Modify: `packages/core/src/wow/areas/referral/area.ts`, `opcodes.ts`
  (`unseen`: `SMSG_PROPOSE_LEVEL_GRANT`)
- Regenerate: `docs/protocol-coverage/referral.md`

**Depends on:** `SEED-4`, `T-3`, `T-7a`.

**Opcodes:** `CMSG_GRANT_LEVEL` (0x40d), `SMSG_REFER_A_FRIEND_FAILURE`
(0x421), `SMSG_PROPOSE_LEVEL_GRANT` (0x41f), `CMSG_ACCEPT_LEVEL_GRANT`
(0x420).

**Wire:**

- 0x40d and 0x420: packed guid (`Handlers/ReferAFriendHandler.cpp:23-28,66-71`).
- 0x421: `u32` error, and the target's CString name only for error 9
  (`NOT_IN_GROUP`) (`ReferAFriendHandler.cpp:49-57`; error values
  `Entities/Player/Player.h:960-973`). A fresh account has no grantable
  levels, so a grant at a visible target gives error 3 (`:36-37`); no
  target gives 8.
- 0x41f: packed guid (`ReferAFriendHandler.cpp:60-62`); it needs a
  recruiter link in the auth database, which no worker may set.
- 0x420 returns at once without a recruiter link (`:77-78`).

**Steps:**

- [ ] **Step 1: Failing tests.** Both builders; `parseReferAFriendFailure`
  for error 3 and for error 9 with a name; `parseProposeLevelGrant`;
  `grantLevel(guid)` resolves `{ error }` on 0x421 within 2 s, else
  `"sent"`; `acceptLevelGrant()` sends 0x420 with the pending proposer
  and clears it, or returns `{ ok: false, reason: "no_offer" }`; 0x41f
  sets `pendingGrant` { proposer, at } (hidden after 60 s) and emits
  `level_grant`; 0x421 emits `level_grant` with the error.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Probe flow** `referral-grant.ts` with `--arg
  name=<NAME>`: grant at the named player, print the reply, then send
  `CMSG_ACCEPT_LEVEL_GRANT` with that guid through the probe's raw sender.
- [ ] **Step 4: Live proof.** Own and Partner; `mise protocol:probe <OWN>
  --flow referral-grant --arg name=<PARTNER> --expect
  SMSG_REFER_A_FRIEND_FAILURE --wait 20`. Evidence: error 3 (0x40d and
  0x421 live); the 0x420 `out` row with no disconnect (`accepted`).
  0x41f is mock from `ReferAFriendHandler.cpp:60-62`. Delete both
  accounts.
- [ ] **Step 5: `docs/areas/referral.md`**, four rows; checks.
- [ ] **Step 6: Commit.**

  ```
  feat: Handle refer-a-friend level grants

  Core can offer and accept a granted level and reads the server's
  failure codes. Fresh accounts have no recruiter link, so the offer
  itself is proven only from the server code.
  ```

---

## Task social-13a: Achievement and title rows

**codeArea:** `achievements`. **Phase:** 4. **Size:** S. **Proof:** unit.

**Files:**

- Modify: `packages/harness/src/areas/achievements/area.ts` and test

**Depends on:** `social-1`, `social-4`.

**Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing rule tests.** `achievement_earned` with `self:
  true` writes a `passive` row `achievements/earned` ("You earned
  achievement 6."); with `self: false` a `log` row `achievements/near`
  naming the player through `RuleInput` name lookups; `server_first`
  a `log` row `achievements/server_first`; `title_changed` a `passive`
  row `achievements/title`; `achievement_removed` and `criteria_removed`
  return `[]`. An `attach` rule returns `[]` (no row on attach).
- [ ] **Step 2: Implement** the `rules` factory. Ids, not names
  (contract issue 2).
- [ ] **Step 3: Proof.** Unit tests; the live runs of `social-1` and
  `social-4` produced the events. `mise test
  packages/harness/src/areas/achievements`, `mise typecheck harness`,
  `mise ci:checks`.
- [ ] **Step 4: Commit.**

  ```
  feat: Log achievements and titles

  The agent now sees its own achievements and titles as passive rows,
  and nearby players' achievements and realm firsts in the log.
  ```

---

## Task social-13b: Emote rows

**codeArea:** `emotes`. **Phase:** 4. **Size:** S. **Proof:** unit.

**Files:**

- Modify: `packages/harness/src/areas/emotes/area.ts` and test
- Modify: `packages/core/src/wow/areas/emotes/store.ts` and test (the
  `name` field of `text_emote`)

**Depends on:** `social-14` (which owns the `emotes/sent` rule).

**Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing rule tests.** A `text_emote` from another player
  whose target is the character's name writes a `wake` row
  `emotes/at_you` ("Tom waves at you."); one with another or no target a
  `log` row `emotes/near`; `emote` events still return `[]`.
- [ ] **Step 2: Implement.** Player names come from `RuleInput`
  lookups. The emote word comes from the event: this task first adds
  `name` to the core `text_emote` event (`areas/emotes/store.ts`, owned by
  this unit), looked up in `TEXT_EMOTES`, with a failing core test first,
  because the harness cannot import the table (contract 0.3).
- [ ] **Step 3: Checks.** Tests of both packages, `mise ci:checks`.
- [ ] **Step 4: Commit.**

  ```
  feat: Wake on emotes aimed at the character

  A player waving or bowing at the character is a social cue the agent
  should answer. Emotes aimed at it wake the agent; others go to the log.
  ```

---

## Task social-13c: Channel rows

**codeArea:** `channels`. **Phase:** 4. **Size:** S. **Proof:** unit.

**Files:**

- Modify: `packages/harness/src/areas/channels/area.ts` and test

**Depends on:** `social-7`.

**Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing rule tests.**
  - `channel_notice` `invite`: a `wake` row `channels/invite` ("Tom
    invites you to channel "raidfinders". Join with social
    do:join_channel.").
  - `you_joined`, `you_left`: `log` rows `channels/joined`,
    `channels/left` (the server's own notice; `social-15`'s eval selects
    them).
  - Notices about the character (`player_kicked` or `player_banned` with
    the own guid as target, `owner_changed` to the own guid, a
    `mode_change` of the own guid): `passive` rows `channels/self`.
  - Every other notice and `channel_members`: `[]`.
- [ ] **Step 2: Implement** the rule factory.
- [ ] **Step 3: Checks.** `mise test packages/harness/src/areas/channels`,
  `mise typecheck harness`, `mise ci:checks`.
- [ ] **Step 4: Commit.**

  ```
  feat: Log channel invites and own notices

  Channel invites wake the agent, and its own joins, kicks and flag
  changes reach the log, so channel verbs have server evidence.
  ```

---

## Task social-13d: Level-grant rows

**codeArea:** `referral`. **Phase:** 4. **Size:** S. **Proof:** unit.

**Files:**

- Modify: `packages/harness/src/areas/referral/area.ts` and test

**Depends on:** `social-12`.

**Opcodes:** none.

**Steps:**

- [ ] **Step 1: Failing rule tests.** `level_grant` with a proposer
  writes a `passive` row `referral/offer` ("Tom offers you a free
  level."); with an error it returns `[]` (the act's caller sees it).
- [ ] **Step 2: Implement** the rule factory.
- [ ] **Step 3: Checks.** `mise test packages/harness/src/areas/referral`,
  `mise typecheck harness`, `mise ci:checks`.
- [ ] **Step 4: Commit.**

  ```
  feat: Log refer-a-friend level offers

  A level offer from a recruiter is rare but actionable, so it reaches
  the agent as a passive row.
  ```

---

## Task social-15: Channel verbs

**codeArea:** `channels`. **Phase:** 4. **Size:** M. **Proof:** eval.

**Files:**

- Create: `packages/harness/src/tools/social-channel.ts` and test (lease)
- Modify (lease): `packages/harness/src/tools/social.ts` and test,
  `socialParams` in `tools/params.ts`, `SocialAction` and `SocialAfter` in
  `contract/details.ts`, `socialRenderers` in `ui/renderers/line.ts`
- Create: `packages/harness/src/grader/scenarios/t2-channels-talk.json`
- Modify: `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
  `docs/capabilities.md`, `docs/evals.md`, `docs/areas/channels.md`

**Depends on:** `social-8`, `social-13c`, `T-7a`, item 6, the lease
(handed on from `social-14`, D12).

**Opcodes:** none new.

**Steps:**

- [ ] **Step 1: Failing tool tests.**
  - `join_channel to:"peontalk"` calls `channels.act.joinChannel` and is
    `DONE` on its `you_joined`; `wrong_password`, `banned`, `not_in_lfg`
    notices are `FAILED` with that name; `zone_channel` is `REFUSED` with
    a `next` naming the missing id; no notice is `UNCONFIRMED`; `what` is
    the password.
  - `leave_channel` settles on `you_left`; a channel the store does not
    hold is `REFUSED not_member`.
  - `channel to:"peontalk" text:"hello"` refuses a non-member, calls the
    legacy `sendChannel`, and is `DONE` on the echo: a `message` of type
    `CHANNEL` with the same channel, text and own name within 2 s
    (`Chat/Channels/Channel.cpp:770-808`, `SendToAll` at `:913-918`);
    `ECHO_TYPES` gains `channel`. The account-name refusal of the other
    chat `do` values applies (`docs/harness.md:113`).
  - `expectSendKind(socialTool)` passes.
- [ ] **Step 2: Implement** the sibling module and the dispatch.
- [ ] **Step 3: Scenario** `t2-channels-talk.json`, same frame as
  `t2-whisper-reply`. `partnerActions`: at 20 s, `["call",
  "joinChannel", "[\"peontalk\"]"]`. Task: "Join the chat channel
  peontalk, say hello there, then leave it." Checks:
  - `said` (`witness`): the partner's `read --json` rows in
    `partner-read.jsonl` show a `CHANNEL` message from the agent in
    `peontalk` containing "hello".
  - `joined-left` (`game_log`, evidence `channels/joined`,
    `channels/left`): both server notices for `peontalk`, in that order.
  - `no-public-reply` as in `t2-whisper-reply`.
  The fixed name `peontalk` is safe: the checks key on the agent's name.
- [ ] **Step 4: Eval** `mise eval run t2-channels-talk --round <n>`, then
  the gates of contract 3.6. Record the verdicts.
- [ ] **Step 5: Docs** (D15): `docs/capabilities.md` row `| Join, leave
  and talk in a chat channel | \`t2-channels-talk\` | Zone channels need
  their channel id; only LookingForGroup and the ids social-8 confirmed
  are known. |` (or the D16 bullet); append the id to the "Social verbs"
  row of `docs/evals.md`; `docs/areas/channels.md` Capabilities row.
- [ ] **Step 6: Checks** as in `social-14`.
- [ ] **Step 7: Commit.**

  ```
  feat: Join, leave and talk in chat channels

  Human players find groups in chat channels, and the agent could not
  join one. The social tool now joins, leaves and speaks in a channel,
  each settling on the server's notice or echo.
  ```

---

## Task social-16: `inspect` verb

**codeArea:** `inspect`. **Phase:** 4. **Size:** S. **Proof:** eval.

**Files:**

- Create: `packages/harness/src/tools/social-inspect.ts` and test (lease)
- Modify (lease): `packages/harness/src/tools/social.ts` and test,
  `socialParams`, `SocialAction` and `SocialAfter`, `socialRenderers`
- Modify: `packages/harness/src/areas/inspect/area.ts` and test (the
  `reply` row)
- Create: `packages/harness/src/grader/scenarios/t2-inspect-partner.json`
- Modify: `packages/harness/src/grader/scenarios.ts` (`ROUND_1`),
  `docs/capabilities.md`, `docs/evals.md`, `docs/areas/inspect.md`

**Depends on:** `social-6`, `social-15` (the lease hand-over), `T-9b`
(partner truth), item 6.

**Opcodes:** none new.

**Steps:**

- [ ] **Step 1: Failing tool tests.** `inspect to:"u4"` resolves a nearby
  player; beyond 28 yd it is `REFUSED too_far` with a `next` to travel
  closer, and for an attackable player `REFUSED hostile`
  (`Handlers/MiscHandler.cpp:989-997`); it calls `inspect` and
  `inspectAchievements` in parallel and is `DONE` with the gear list (slot
  and item name through `itemLabel`, enchanted yes or no), spent points
  per spec, the active spec, the glyph count and the achievement count;
  no reply is `FAILED no_reply`. `expectSendKind(socialTool)` passes.
- [ ] **Step 2: Failing rule test.** The inspect store's `talents` event
  writes one `log` row `inspect/reply` with the target guid and the gear
  entries (a server packet the grader can select).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Scenario** `t2-inspect-partner.json`, same frame. Task:
  "Inspect the player standing next to you and tell me which weapon they
  carry." Checks:
  - `weapon` (`session` with partner truth, T-9b): the final answer names
    the item in the partner's main-hand slot.
  - `replied` (`game_log`, evidence `inspect/reply`): one row for the
    partner's guid.
- [ ] **Step 5: Eval** and gates, as in `social-14`.
- [ ] **Step 6: Docs** (D15): `| Inspect another player's gear and
  talents | \`t2-inspect-partner\` | Within 28 yd and not attackable; no
  reply otherwise. |`; append the id to the "Social verbs" row.
- [ ] **Step 7: Checks** and commit.

  ```
  feat: Add the social inspect verb

  Checking a party member's gear needed a verb. The social tool now
  inspects a nearby player and reports gear, talents and achievements.
  ```

---

## Dead opcodes

Both are stubs today and keep their stub lines (design 5.21 "Dead").
They sit in `CONTACTS_OPCODES.dead` (the chat-error rows); the seed
writes them, and `social-5a` adds any the seed missed.

| Opcode | Why dead |
|---|---|
| `SMSG_CHAT_NOT_IN_PARTY` (0x299) | AzerothCore declares it `STATUS_NEVER` (`Server/Protocol/Opcodes.cpp:796`) and has no send site; wowm has no definition. |
| `SMSG_CHAT_PLAYER_AMBIGUOUS` (0x32d) | Its only writer is `WorldSession::SendPlayerAmbiguousNotice` (`Handlers/ChatHandler.cpp:824-829`), which nothing calls; wowm notes it is never sent (`chat/smsg_chat_player_ambiguous.wowm:1`). |

## Build rulings

| Id | Issue | Ruling |
|---|---|---|
| BR-social-14-1 | `t2-emotes-partner` on the `fairbreeze-east` grid (SR3-social-6) puts an emoting agent 4-16 yd from `t2-whisper-reply`, which fails the 60 yd crowd test, and the emote can target the whisper character | Coordinator ruling (P2-17): SR3-social-6's grid sharing is superseded. social-14 adds its own named grid `fairbreeze-emotes` under BR-wave3-3, at least 60 yd from every other ROUND_1 start, with live-stood points; `spawn-slots.test.ts` stays unchanged. |
| BR-social-14-2 | social-14's fourth review, after three fix rounds, still finds that a queued text emote's caller cannot cancel while it waits for its turn, and one negative test emits the other-player echo before the act resolves | Coordinator ruling (P2-17): social-14 is a leaf task, so BR-wave3-1 gives it no rescue round; it is parked (branch `factory/431-wave3-parked-social-14`) with these two findings listed in the wave PR. |

## COMPLETE

## Seed rulings (SEED-1)

The coordinator rules every contract issue, lease request and decision of
this unit that a wave-1 task (`social-1`, `social-2`) meets, before
`SEED-1`. No wave-1 task of this unit holds or waits for a lease: every
lease row of this unit belongs to `social-5a`, `social-5b`, `social-14`,
`social-15` or `social-16` (phases C and D in the plan "Leases" table), so
no line goes into the plan "Lease handovers" for this unit now. One ruling
(SR1-social-1) amends contract 2.5 in a `COORD-<n>` commit; until that
commit lands, the builder follows the ruling. Contract issues 3, 4, 5, 6
and 7, the emote-name and zone-channel bullets of contract issue 2, and
the split of `social-5`, `social-11` and `social-13` meet only tasks of
phases C and D, so they wait for the `SEED-3` and `SEED-4` rulings. Each
ruling is **accepted by the maintainer (P2-5)**.

| Id | Issue | Ruling | Status |
|---|---|---|---|
| SR1-social-1 | Contract issue 1: "`SMSG_ALL_ACHIEVEMENT_DATA` (`achievements`) and `SMSG_RESPOND_INSPECT_ACHIEVEMENTS` (`inspect`) share one body ... Proposal: `social` owns one new shared file, `packages/core/src/wow/protocol/achievement-data.ts` (`parseAchievementData`), created by `social-1`, and contract 2.5 gains that row for `social`" (`social-1`) | Accepted. `social-1` creates `packages/core/src/wow/protocol/achievement-data.ts` and `achievement-data.test.ts`, and the `social` unit owns both. `parseAchievementData(reader)` reads from the reader's current position, so `inspect` calls it after it reads the packed guid that comes first in its own packet. Both areas import it through `#wow/protocol/achievement-data`, which contract 1.12 allows. This follows the shared parsers of `talents`, `pets` and `instances` (contract 2.5, N28). Amends contract 2.5, table "Code areas and shared parsers per unit", row `social`, third column: "`protocol/achievement-data.ts` (`parseAchievementData`; `inspect` reuses it)". The fallback of the issue (the parser in `areas/achievements/protocol.ts`) is not used | accepted by the maintainer (P2-5) |
| SR1-social-2 | Contract issue 2, achievement bullet: "Achievement and title names are left out: events and rows carry ids ... A name catalog waits until the coordinator stages `Achievement.dbc` and `CharTitles.dbc`" (`social-1`) | Stands. `social-1` events and the snapshot carry achievement ids only, and `docs/areas/achievements.md` "Left out" names the missing names with a reference to this issue. The coordinator stages no DBC file for wave 1. The emote-name bullet (`areas/emotes/names.ts`, `social-3` and `social-14`) and the zone-channel bullet (`social-8`) wait for later seeds | accepted by the maintainer (P2-5) |
| SR1-social-3 | Contract issue 8: "`UNIT_FIELDS.NPC_EMOTESTATE` ... [is] read from `deps.getEntity(guid)?.rawFields` inside the areas ... `entity-store.ts` and `player-state.ts` stay untouched" (`social-2`) | Stands, with no lease and no entity edit. The emote state lives in the `emotes` snapshot (`emoteStates`), not on the entity; this is how the area meets design 5.21 "the entity gains `emoteState`". The runtime subscribes with `ctx.listen("entity", ...)`: `entity` is a `CoreEvents` key (`world-events.ts:22` [M]), and an `EntityEvent` is `appear` or `update` with the `entity`, or `disappear` with the `guid` (`entity-store.ts:86-97` [M]). It reads `entity.rawFields.get(UNIT_FIELDS.NPC_EMOTESTATE.offset)` (`rawFields: Map<number, number>`, `entity-store.ts:18`; offset 83, `protocol/update-fields.ts:114` [M]). `UNIT_FIELDS` is a value import from `#wow/protocol/update-fields` (contract 1.12); `EntityEvent` is a type import. A missing field or 0 removes the guid from `emoteStates` | accepted by the maintainer (P2-5) |
| SR1-social-4 | Contract issue 9: "T-3 fixes the flow module shape ... the exact signature could not be determined before T-3 lands" (`social-1` step 8, `social-2` step 7) | T-3 has landed; the shape of SR1-threat-6 applies. `probe-flows/achievements-level.ts` and `probe-flows/emotes-fight.ts` each export `flow: ProbeFlow = { name, run, usage }` with `name` equal to the file stem (`loadFlows` refuses any other), and `run({ handle, args, settle })` returns `Json`. They import `#tools/probe-flows` as `nearest.ts` does, besides `@peon/core` and `@peon/core/session`, and never another unit's flow file. `settle` gives up after 5 s, so the wait of up to 120 s for the target or the character to die is the flow's own poll loop with `Bun.sleep`, and `--wait` takes seconds. Each flow may have a test `probe-flows/<area>-<name>.test.ts` (owned through `probe-flows/<area>-*.ts`) over a fake `FlowContext`. The `COORD-<n>` commit of SR1-threat-10 (the loader test no longer pins the full flow list) must land first; both tasks depend on `threat-1`, which waits for it | accepted by the maintainer (P2-5) |
| SR1-social-5 | Found while ruling: `social-1` step 9.4 raises the character from level 9 to 10 to earn achievement 6 ("Level 10"), with a fallback "if T-5 has not landed". But `eversong10` is a level-10 character (`packages/factory/src/prompts/worker.md:152` [M]) copied from a template, and a player dump copies `character_achievement` (`src/server/game/Tools/PlayerDump.cpp:92` [M]), so the character may already hold achievement 6 [I], and a completed achievement sends no `SMSG_ACHIEVEMENT_EARNED` | T-5 has landed (`soap-gm.ts` has the `level` verb [M]), so the fallback is not used. Step 9.4 becomes: start `mise protocol:probe <ACCOUNT> --expect SMSG_ACHIEVEMENT_EARNED --wait 30`, and while it waits run `mise factory soap gm <ACCOUNT> level 20` in a second shell. `.character level` calls `GiveLevel` (`src/server/scripts/Commands/cs_character.cpp:256`), which updates the reach-level criteria (`Entities/Player/Player.cpp:2570`), so a level-10 character earns the level-20 achievement (id 7 [I]). The `--expect` names no id. Exit 0 proves 0x468; exit 3 is reported with the probe's `packets.jsonl`, and the row stays `live` only on exit 0 | accepted by the maintainer (P2-5) |
| SR1-social-6 | Proof decisions of the task bodies: `social-1` keeps `SMSG_CRITERIA_DELETED` and `SMSG_ACHIEVEMENT_DELETED` `mock` and in `unseen` until `social-4` proves them live with `soap gm reset-achievements` (T-6); `social-2` keeps a `mock` row and `unseen` for 0x103 after two fights with none, and for 0x105 on exit 3 (no self echo), and `social-3` retries 0x105 with a partner (`social-1`, `social-2`) | Stand. `social-1` takes no dependency on T-6 and does not run `reset-achievements`; `social-4` moves both rows to `live` and removes them from `unseen`. For 0x105, the server sends the emote to the players within `CONFIG_LISTEN_RANGE_TEXTEMOTE` of the sender (`PlayerDistWorker`, `Handlers/ChatHandler.cpp:782-783` [M]), and that the sender is one of them stays [I] until step 8.3 runs; the fallback is used only on a measured exit 3, which the report states | accepted by the maintainer (P2-5) |

## Seed rulings (SEED-3)

The coordinator rules every contract issue, lease request and decision of this unit that a wave-3 task meets, before `SEED-3`. The wave-3 tasks of this unit are social-3, social-14 (phase C). Each ruling is a coordinator ruling (P2-17). `core:` = `packages/core/src/wow/`, `h:` = `packages/harness/src/`, `cts:` = `packages/core/test-support/`, `dev:` = `packages/devtools/src/`. A task's own eval runs use the round number the coordinator hands the builder. The `SR3-social-<n>` ids supersede nothing earlier; section "Coordinator edits for SEED-3" in the plan index holds the seed edits (the `SEED3-<n>` ids).

| Id | Issue and task | Ruling | Status |
|---|---|---|---|
| SR3-social-1 | `social.md:467-472` (social-3 files) versus the current `emotes` area. | `EMOTES_OPCODES.owns` already holds all four rows, including `CMSG_EMOTE` and `CMSG_TEXT_EMOTE`; no stubs, `uses`, `dead` or `unseen` (`areas/emotes/opcodes.ts:4-9` [M]). Client opcodes are sent, not registered, so `area.ts` (20 lines) gets no `on` line in social-3; the coverage rows `0x102`/`0x104` flip from `missing` to `handled` by regeneration when the acts send them. No seed edit. | coordinator ruling (P2-17) |
| SR3-social-2 | social-3 step 3 dead check: "While the self entity has health 0 both acts return `dead`" (`social.md:513-514`). | Health 0 misses ghosts (a ghost has health 1 and the ghost flag; `AzerothCore` refuses emotes for anyone not alive: `Handlers/ChatHandler.cpp:678-679` and `:731`). Use `readLife(selfGuid, getEntity).life` from `#wow/player-state` (`player-state.ts:45-56`; allowed import, `registry.test.ts:41-42`): `dead` for any life other than `alive`. `AreaRuntimeCtx` has no `getEntity` (`areas/contract.ts:52-65`), so `EmoteStore` (`areas/emotes/store.ts:19-27`, constructor takes `deps`) gets `life()` like `ItemsStore.life()` (`areas/items/store.ts:104-106`), and the runtime calls `store.life()`. `areas/emotes/store.ts` and `store.test.ts` are therefore part of social-3; add both to its owner list (section D). | coordinator ruling (P2-17) |
| SR3-social-3 | social-3 `names.ts` (`social.md:492-498`): `TEXT_EMOTES` from `TextEmotes`, `SharedDefines.h:1638-1892`. | Confirmed [M]: the enum starts at `src/server/shared/SharedDefines.h:1638` and has 252 entries to `:1892`; `DANCE` 34 (`:1673`), `SALUTE` 78 (`:1717`), `WAVE` 101 (`:1740`), `READY` 126 (`:1765`). One entry per line keeps `names.ts` near 260 non-blank lines, under the cap; the formatter must not join entries. Names are lower-case with the `TEXT_EMOTE_` prefix removed (`yw`, `sweat`, ...). `closestEmotes(name, n)` ranks by edit distance then name order so `dnace` starts with `dance`. The act resolves the name, the harness never imports the table (contract 0.3). | coordinator ruling (P2-17) |
| SR3-social-4 | social-3 server behaviour (`social.md:480-488`). | Confirmed and complete [M, `Handlers/ChatHandler.cpp:667-790`]: `CMSG_EMOTE` accepts only ids 0 and 3 (`:676`), is dropped for a spectator and for a dead player, and answers with the `SMSG_EMOTE` of `HandleEmoteCommand`; `CMSG_TEXT_EMOTE` with id 126 goes to the redirect path only while the redirect timer runs (`:722-729`); a dead player and a muted player send nothing (a mute gives a notification only, `:736-741`); the echo `SMSG_TEXT_EMOTE` goes to every player within the listen range of the sender, the sender included (`:781-783`, proven live by social-2: `docs/areas/emotes.md` proof rows), with the target name from the guid in the request (`:773`). A text emote with an unknown id is dropped after the script hooks (`:759-761`). `/dance` sets `UNIT_NPC_EMOTESTATE` 10 (`:767-769`) and the character keeps dancing until it moves: the probe flow `emotes-send` ends by sending `emote(0)`? No: it only waits 5 s and logs out; no cleanup is needed. The 1000 ms spam guard of step 3 is Peon's own rule, implemented with `ctx.now()` and fake timers, not a server rule. | coordinator ruling (P2-17) |
| SR3-social-5 | social-3 live proof (`social.md:523-534`): flow `emotes-send`; `SMSG_TEXT_EMOTE` naming the NPC; step 6.3 partner retry. | Step 6.3 (retry with a partner if no self echo) is moot: social-2 proved the self echo (`docs/areas/emotes.md`, `SMSG_TEXT_EMOTE` row: a `/dance` with no target, exit 0). The flow sends `emote(3)` then `textEmote("dance", <guid>)` where the guid is the nearest NPC from `handle` entities (as the `nearest` flow does) and expects `SMSG_EMOTE` and `SMSG_TEXT_EMOTE` with a non-empty target name; a target name of one letter arrives empty (`ChatHandler.cpp:693-707`). Wave (101) is used for the NPC case because dance sets a lasting state. Only `eversong10`; one account. | coordinator ruling (P2-17) |
| SR3-social-6 | social-14 scenario `t2-emotes-partner`, spawn `fairbreeze-east` (`social.md:600-615`); spawn capacity. | `FAIRBREEZE_EAST` has 8 points and one user today (`t2-whisper-reply`); both scenarios at two replicas need 2 x 2 x 2 = 8 points (`spawn-slots.ts:113-127`, slot formula in `startSlots`, `:267-284` [M]). It fits exactly: no grid edit. Appending the new id to `ROUND_1` after `t2-whisper-reply` keeps `spawn-slots.test.ts:11-14` green; run that test. The scenario copies `t2-whisper-reply.json` (preset `eversong10`, `partner: "partner"`, `botRisk: "high"`, 5 minutes, 15 tools, 8 turns). | coordinator ruling (P2-17) |
| SR3-social-7 | social-14 witness (`social.md:160-171`, contract issue 7; `social.md:606-610`). | Decided [M]: the grader's partner read is `read --json` only (`grader/partner.ts:82-98` writes `partner<N>-read.jsonl` from `read --json`, no `events --json`), so no witness check on the partner's emote events is possible. The scenario grades on the agent's game log only: check `emoted` = `game_log` `evidence.events ["emotes/sent"]`, two rows with `data.textEmote` 101 and 34, each naming the partner as target (written from the server echo), plus `no-public-reply` as in `t2-whisper-reply`. The partner needs no `partnerActions`; `partner: "partner"` only supplies the target. The task text names no player (finding 8): "Wave at the player standing next to you, then dance with them." | coordinator ruling (P2-17) |
| SR3-social-8 | social-14 owner list and leases (`social.md:556-568`; index owner): `tools/params.ts`, `tools/social-emote.ts`, `social.ts`, `details.ts`, `line.ts`. | Map to the landed layout: the `do` enum and the `what` parameter go in `tools/params-social.ts` (`socialParams`, 30 lines, `do` enum at `:5-17`), the dispatch in `tools/social.ts` (399 lines: one `SOCIAL_ACTIONS` value, one dispatch line, `social.ts:386-404`), the logic in new `tools/social-emote.ts` (+ test), `SocialAction` (add `"emote"`) and `SocialAfter` in `contract/details.ts:236-252`, `socialRenderers` in `ui/renderers/line.ts:218-221`, the rule in `h: areas/emotes/area.ts` (6 lines, no rules yet) and a new `area.test.ts` (none exists). The lease chain is social-14 -> social-15 -> social-16 for `tools/social.ts`, `params-social.ts`, `ui/renderers/line.ts` and the `SocialAction`/`SocialAfter` blocks; social-14 is first and waits for nothing (details.ts is leased per block). `social.ts` is at 399 lines and stays under the cap because the emote logic lives in the sibling. `to` takes a player name for whisper and invite today (`params-social.ts:26-31`): for `emote` it also accepts a look ref (`u3`); the description text of `to` is updated in the same block. | coordinator ruling (P2-17) |
| SR3-social-9 | social-14 test spelling (`social.md:577-579`: "`jest.spyOn(handle.emotes.act, \"textEmote\")`"). | The harness tests use `spyOn` from `bun:test`. `handle.emotes.onEvent` and `triggerAreaEvent("emotes", ...)` come from `createMockGame()`; the `emotes` mock handle exists (area seeded in SEED-1). The tool settles `DONE` on a `text_emote` event with `self: true` inside 2 s, `UNCONFIRMED` otherwise, and `REFUSED` for the act's `unknown_emote`, `ready_check`, `dead` reasons (`social.md:580-588`). | coordinator ruling (P2-17) |

### Findings behind the SEED-3 rulings

1. 1. **Only `mail` and `bank` need a seed.** `items` (35 owns, `stubs` = `SMSG_EQUIPMENT_SET_LIST` and `SMSG_SET_PROFICIENCY`, `uses` = `SMSG_INVENTORY_CHANGE_FAILURE`, `areas/items/opcodes.ts:4-47` [M]) and `emotes` (`owns` all four rows, other lists empty, `areas/emotes/opcodes.ts:4-9` [M]) were seeded in SEED-1. The `SEED-3` dependency of items-6, items-9, social-3 is a scheduling dependency only. Affects: items-6, items-9, economy-6, economy-9, social-3.

2. 3. **SEED-1 split `tools/params.ts` and `tools/look.ts`.** `tools/params.ts` is a 17-line facade (coordinator only); the blocks live in `params-interact.ts` (46), `params-journal.ts` (20), `params-look.ts` (44), `params-social.ts` (30) [M]. The owner lists of economy-8, economy-10 and social-14 still name `tools/params.ts`; the index rows must be corrected (section D). Affects: economy-8, economy-10, social-14.

3. 4. **`item6` is not a task id.** It stands for "the tool shape after #429" and is landed (wave 1 and 2 tasks used the new shape). Treat it as satisfied; nothing in these units waits on it. Affects: economy-6, economy-9, social-14.

4. 5. **Lease-queue waits not encoded in the index** (`leaseDeps` is empty for all ten tasks): economy-10 must wait for travel-6 (`tools/interact.ts`, `params-interact.ts`, the `InteractAction` and `InteractAfter` blocks) and for spells-14 (`tools/journal.ts`, `params-journal.ts`). Plan "Leases" rows `h: tools/interact.ts` and `h: tools/journal.ts`. economy-8 and social-14 are first in their chains (economy-2 and world-8b have landed). See sections C and D.

5. 6. **The `EVERSONG` spawn grid is full.** 12 ROUND_1 scenarios use it (presets `eversong10*` without a named `spawn`, `spawn-slots.ts:161-167`), each needs 2 replicas x 2 points, and `EVERSONG` has 49 points [M, counted with a script over `ROUND_1` and the scenario files]. `spawn-slots.test.ts:11-14` fails any scenario without a start slot for replicas 1 and 2. A new `eversong10` scenario therefore needs a named `spawn`. Affects: economy-10 (SR3-economy-21). `fairbreeze-east` has 8 points and one user (`t2-whisper-reply`): social-14 fits with both scenarios at two replicas (SR3-social-6).

6. 8. **Task text is not expanded.** `<AGENT>` and `<PARTNER>` are replaced only in `partnerActions.argv` (`grader/partner.ts:42-49`); `typeText(run, run.scenario.task)` sends the task verbatim (`grader/run.ts:319`). economy-8's "Mail 1 silver to <PARTNER>" cannot work as written (SR3-economy-15). social-14 already avoids names.
