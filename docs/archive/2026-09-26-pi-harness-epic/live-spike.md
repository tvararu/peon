# Live spike: gpt-6-luna playing through an in-process Pi harness

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


Task key `live-spike`. Run 2026-09-26 19:05–19:30 UTC against the real
server (t1:3724) on one throwaway soap character. Throwaway code; not kept.

Confidence marks: **measured** (seen in the run log or a frame),
**read** (code read), **inferred**.

## Setup (what ran)

- Scratch clone of origin/main `5dca819` at
  `/home/deity/.cache/pi-epic-scratch/live-spike` (recipe from the brief).
- Spike copied to `.../live-spike/spike2/` and rewritten:
  `harness.ts`, `wow-extension.ts` (≈420 lines), `map.ts` (imports only),
  `sync-auth.ts`, `run.sh`. The round-2 extension is kept at
  `.../live-spike/meta/wow-extension.round2.ts`.
- Character: `bun src/factory/main.ts soap create eversong10` →
  account `FAC6AB817B5B2`, character `Fgklibhlflc` (level 10 Blood Elf
  priest, Falconwing Square, map 530 ~(8735, −6685)). Deleted at the end
  with `bun src/factory/main.ts soap delete FAC6AB817B5B2` →
  `{"deleted":["FAC6AB817B5B2"]}` (**measured**).
- Environment: `run.sh` sets `XDG_CONFIG_HOME/XDG_RUNTIME_DIR/XDG_STATE_HOME`
  to the account's `.dir` the same way `tmp/tc-FAC6AB817B5B2` does,
  unsets all `WOW_*` vars, and the harness reads the account's
  `config.toml` through `readConfig()` (**read**, `spike2/run.sh`,
  `spike2/harness.ts`). No fixed account was used.
- Credentials: `sync-auth.ts` copies only the openai-codex OAuth access
  token (valid to 2026-09-30T20:20Z) from `~/.omp/agent/agent.db` into
  `.../live-spike/agent/auth.json` (mode 0600, dir 0700), refresh token
  replaced by a dummy (**measured**). No `models.json` was needed: Pi
  0.87.1 ships `openai-codex/gpt-6-luna` in
  `node_modules/@earendil-works/pi-ai/dist/providers/data/openai-codex.json`
  with `thinkingLevelMap` including `high` (**measured**).
- Jev key: `TYPESAFE_API_KEY` present = **true** in the harness process
  (logged boolean `"jevKeyPresent":true`); `JEV_ENDPOINT_URL` /
  `TYPESAFE_ENDPOINT_URL` false (default endpoint used) (**measured**).
- Model: `openai-codex/gpt-6-luna`, `thinkingLevel: "high"`, compaction
  off, builtin tools off (`noTools: "builtin"`), session JSONL persisted via
  `SessionManager.create` (**read**).
- Harness ran in one Orca terminal tab created with
  `orca-ide terminal create --worktree path:/home/deity/code/tuicraft --title live-spike-luna --command "cd /home/deity/.cache/pi-epic-scratch/live-spike && ./spike2/run.sh" --json`
  (a `path:` selector for the scratch clone fails with
  `selector_not_found`, since it is not an Orca workspace — **measured**).
  Prompts went in with `orca-ide terminal send --terminal <h> --text "<prompt>" --enter`;
  75 frames were captured with `orca-ide terminal read --terminal <h> --screen --json`
  every 15 s into `.../live-spike/frames/`. The tab was closed with
  `orca-ide terminal close --terminal <h> --tab`.
- Evidence: per-round extension logs `.../live-spike/meta/round{1..4}-log.jsonl`
  (every tool call with params, ms, ok/err, output; every pushed event;
  every user/assistant message), Pi session JSONL under
  `.../live-spike/run-round{1..4}/sessions/`, frames under `.../frames/`.

### Tools and events built

| Tool | Behaviour |
|---|---|
| `wow_look` | Text snapshot: self level/class/HP/mana/XP, pose + compass facing, target, fight status, party, 10 nearest units (name, level, hostility from `FactionTemplate.dbc` relation, npcFlag roles, dead/alive/lootable, distance, compass bearing + relative side, guid, "TARGETING YOU"). |
| `wow_goto` | `goTo` on a guid (accepts guid or exact name) or x,y[,z]; waits ≤25 s polling `getNavigationState()`; reports arrived / still walking / stopped + moved yards. |
| `wow_target` | `selectTarget`. |
| `wow_fight` | `startTactics(guid, instruction)` not awaited; returns at once; on settle pushes `fight with X ended: <formatFightOutcome>` with `triggerTurn: true, deliverAs: "followUp"`. |
| `wow_say` | `sendSay`. |
| `wow_quests` | `formatQuestState(getQuestState())`. |
| Round ≥2: `wow_loot`, `wow_talk` | Not in the brief. Added after round 1 showed tasks (c) and (d) are impossible without them. |
| Round ≥3: `wow_wait`, "Nearest living hostiles" line in `wow_look`, range checks in loot/talk, fixed loot | Hypotheses from round 2. |
| Round 4: straight-walk fallback in `wow_goto` | `walkToward` ≤20 yd when the pathfinder refuses. |

Events pushed passively (`triggerTurn: false`): all chat, group events,
combat `xp`/`level_up`, "being attacked" (throttled to 1 per 5 s), rewards
`money_notice/item_push/loot_opened/loot_open_failed/loot_error`, quest
`dialog/accepted/progress/completed/rewarded/error`. Wakes
(`triggerTurn: true`): incoming whisper, fight end. Map widget kept.

## Task results

Wall time = user prompt to `agent_end` in the extension log. "Turns" =
assistant messages (one per tool call or reply). Counts are per prompt, from the extension log. Success is judged on server-confirmed state only.

### Round 1 — the six tools from the brief

| Task | Result | Server evidence | Tool calls (fail) | Turns | Wall | Notes |
|---|---|---|---|---|---|---|
| (a) where / hostiles | Partial | n/a | 1 (0) | 2 | 9.1 s | Answered with map id + coordinates only; "No hostiles are listed among the 10 nearest units" — true, but hostiles existed further out. |
| (b) kill nearest hostile | **Fail cold**, pass after 1 nudge | `[combat] +108 XP (kill 0xf130003d2300c240)`, tactics `outcome server_kill_credit` | cold 1 (0); nudged 5 (2) | 2; 7 | 13.1 s cold; 82 s nudged | Cold: "There are no hostile mobs nearby in the current scan, so I can't start a fight." Nudge: "There should be monsters outside town. Go find one and kill it." |
| (c) loot + report | Fail (correct refusal) | none | 1 (0) | 2 | **136 s** | No loot tool. "I don't have a loot/interact action available". 2 min of hidden thinking before that one sentence. |
| (d) quest giver offers | **Fail with a false claim** | no quest dialog packet | 9 (2) | 10 | 67 s | Reached 10.7 yd from Velan Brightoak via coordinates, then called `wow_quests` (the quest *log*) and said: "the quest check shows no available offers." |

### Round 2 — + `wow_loot`, `wow_talk`, goto-by-guid sends the unit's x,y,z

| Task | Result | Server evidence | Tool calls (fail) | Turns | Wall | Notes |
|---|---|---|---|---|---|---|
| (a) | Partial | n/a | 1 (0) | 2 | 5.2 s | Same answer shape as round 1. |
| (b) | **Fail cold** (2/2 runs), pass after the same nudge | `+108 XP (kill 0xf130003d2300d027)`, `server_kill_credit` | cold 1 (0); nudged 15 (7) | 2; 17 | 4.5 s cold; 80 s nudged | 4 goto failures guessing coordinates before one more `wow_look` found a stalker at 57.7 yd. Polled `wow_look` 3× during the fight ("Waiting for fight API"). Looted unprompted. |
| (c) | Not given separately; loot attempted inside (b) | `[rewards] received item 4813 x1` | (loot 3 fail) | — | — | Harness bug: took slot 1 while slot 0 was pending → `Previous loot request remains unanswered`, window never released → `Previous loot window has not closed` on retries. Luna: "Looting is still in progress; I've received item 4813 so far." (no item names). |
| (d) | Fail (honest) | talk sent from 62 yd: `Request: talk unanswered` | 7 (4) + 1 schema error | 9 | 60 s | Called `wow_talk` with **no arguments** once (Pi: `Validation failed for tool "wow_talk": target: must have required properties target`). Final: "I can't confirm what quests he offers." |

### Round 3 — + `wow_wait`, "Nearest living hostiles" line, range checks, fixed loot

| Task | Result | Server evidence | Tool calls (fail) | Turns | Wall | Notes |
|---|---|---|---|---|---|---|
| (b) cold | **Pass** | `+77 XP (kill 0xf130003d2300d0fc)`, `server_kill_credit` | 5 (1) | 7 | 36.2 s | Started near stalkers (position carried over from round 2), so the hostiles line is not proven to be the fix. Used `wow_wait(30)` instead of polling. Replied twice (wait result + the fight-end wake follow-up): "Killed the nearest hostile mob…" then "Confirmed—the Springpaw Stalker is dead." |
| (c) | **Pass** | `received item 4814 x1`, `received item 27668 x1` | 1 (0) | 2 | 4.0 s | "Looted **1 Discolored Fang** and **1 Lynx Meat**." Names came from `getRewardsState()` (`NamedRewardsState`). |
| (d) | Fail (honest) | none | 8 (3) + nudge 11 (6) | 9 + 12 | 52 s + 72 s | Navigation. Every goto to Velan, Magistrix or Marniel refused. Got 0.1 yd onto the vendor Halis, then 13.6 yd from Magistrix and stuck. |

### Round 4 — + straight-walk fallback

| Task | Result | Tool calls (fail) | Turns | Wall | Notes |
|---|---|---|---|---|---|
| (d) + nudge | Fail (honest) | 9 (4) + 5 (4) | 10 + 6 | 42 s + 24 s | Fallback walked 2.6 yd then `obstructed`; after that every plan failed with `start snapped off the requested ground position` from a pose inside town (x=8729.7 y=−6656.4 z=70.6). The character was stuck. |

Totals (**measured**, all rounds): `wow_goto` 12 ok / 27 failed;
`wow_look` 27; `wow_fight` 3 (3 kills with server kill credit); `wow_loot`
1 ok / 3 failed (harness bug); `wow_talk` 1 ok (out of range) / 3 failed
(+1 schema error); `wow_wait` 1; `wow_target` 1; `wow_quests` 1.
Goto failure reasons: `pathfind_find_height failed (UNKNOWN_HEIGHT)` 14,
`start snapped off the requested ground position` 6,
`destination is not on a ground floor` 3, unit not in range for name
lookup 3, `ambiguous ground column at destination` 1.
Model cost per round from Pi's footer: $0.004, $0.006, $0.004, $0.002
(subscription-billed; cache hit 70–97%) (**measured**, frames).

## Friction list (quoted)

1. **Luna does not explore.** Cold "Kill the nearest hostile mob." failed
   2 of 2 times in town: "There are no hostile mobs nearby in the current
   scan, so I can't start a fight." (R1 19:11:19), "There are no hostile
   mobs nearby—the nearest creatures are friendly or neutral. I didn't
   attack anyone." (R2 19:19:03). The 10-row list was the whole world to
   it.
2. **Guessing coordinates.** Without a route or ground knowledge it invents
   points: `{"x":8680,"y":-6730}` → `UNKNOWN_HEIGHT`;
   `{"x":8740,"y":-6750,"z":70.1}` → `destination is not on a ground floor (floors 81.80)`;
   it then copied the floor into z (`"z":81.8`) → `UNKNOWN_HEIGHT` again.
   It does read error text and adapt, but blindly.
3. **Goto on a unit is unreliable on real terrain.** 27/39 gotos failed.
   Quest givers in Falconwing Square (Velan Brightoak, Magistrix Landra
   Dawnstrider, Marniel Amberlight, Ardeyn Riverwind) were never reached.
   Whether this is navmesh data for map 530 or the planner's start/goal
   snapping could not be determined in this spike (**inferred**: the
   `start snapped off` errors say the self pose itself is off-mesh).
4. **Wrong-tool false claim.** R1 (d): after `wow_quests` returned
   `Dialog: none / Quest log: 0 quests`, Luna said "the quest check shows
   no available offers." It confused the quest log with a giver's offer
   list. A tool named for the domain (quests) invited the misuse.
5. **Polling instead of waiting.** R2 (b): `wow_look` ×3 during the fight
   with thinking "Waiting for fight API" / "Checking incoming event". The
   fight-end wake is a follow-up and cannot interrupt its own run.
   R3 with `wow_wait`: one call, no polling.
6. **Duplicate reports.** R3 (b): `wow_wait` returned the fight-end line
   *and* the same line was delivered as a waking follow-up, so Luna
   answered twice.
7. **Stale numbers in answers.** R2: final "You're at 148/217 health"
   came from the fight-end message after a later `wow_look` said
   `HP 217/217`.
8. **Silent schema miss.** R2: `wow_talk` called with `{}`; Pi's
   validation error is visible to the model but my extension log never saw
   it (validation happens before `execute`). An eval grader that counts
   only `execute` calls undercounts errors.
9. **Out-of-range actions look like server silence.** R2 `wow_talk` from
   62.6 yd returned `Request: talk unanswered` after 3 s. R3's explicit
   "is 13.6 yards away; talk range is 5. Use wow_goto first." was read and
   followed.
10. **No names for loot.** R2 rewards events say `item 4813 x1`; Luna
    repeated "item 4813". R3 used `NamedRewardsState` names and answered
    in plain English.
11. **Deliberation stalls when a capability is missing.** R1 (c): 136 s
    between the only tool call and "I don't have a loot/interact action
    available" at high thinking. Every other turn took 1–15 s.
12. **"Where am I" has no place name.** Both runs answered
    "map 530 at 8735.0, −6685.0, 70.5". No zone/subzone is available from
    the tools. The map legend shows signposts (`Fairbreeze Village 66y`,
    `Ghostlands 66y`) as if they were entities.
13. **Transcript noise.** Every login pushes ~10 `[system] [tuicraft] …
    is not yet implemented` lines; fights add more ("Power update is not
    yet implemented", "Spell damage is not yet implemented"). They go into
    Luna's context as `[WoW]` chat.
14. **Map widget scale.** At 3 yd/row the 13-row grid covers ±20 yd, so
    most frames show an empty grid with `@` and one glyph; the legend
    carried the information. A bogus gameobject appeared as
    `Doodad_AncDrae_elevatorPiece_netherstorm01 10917y`.
15. **Other soap characters share the spawn.** `Fgklibiancf L10 player …
    0.0yd` stood on the spawn point (another workflow's soap character).
    Not touched. Evals on the same preset will see each other.

## What Luna used and needed most

- **`wow_look` was the hub**: 27 calls, always the first move and the
  recovery move after an error. Every answer quoted it. Its one-line-per-
  unit text with hostility, role tags and guid worked: Luna picked
  hostiles by the `hostile` word and quest givers by `[questgiver]`
  without extra help.
- **`wow_fight` just worked** (3/3 kills, server kill credit, 12–23 s
  fights; one Jev `transport` blip recovered on its own). The
  start-then-push shape is right. Luna chose short instructions itself
  ("Kill it; heal if low.").
- **Events that mattered**: fight end (drove the answer), `+XP (kill …)`,
  loot `received item`. "Being attacked" was noticed once. A +55 XP
  exploration award (`[combat] +55 XP (other)`) made it stop and
  investigate ("Checking unexpected XP gain").
- **Asked for and not given**: a loot action (R1 c); a way to open a
  quest giver's offers (R1 d); a way to wait (R2 b, by behaviour);
  hostiles beyond the nearest 10 (R1/R2 b, by behaviour); a route to a
  unit it could not path to (R2–R4 d).

## Failure modes, ranked

1. **Navigation refusals** (blocking; 27/39 gotos; all (d) runs).
2. **No exploration when the snapshot is empty of targets** (blocking
   cold (b) 2/2).
3. **Capability gaps answered by a nearby tool** → confident false claim
   (R1 d).
4. **Harness-level bugs a smart model would route around** (loot
   concurrency) — Luna could not.
5. **Async results vs turn boundaries**: polling without `wow_wait`,
   duplicate answers with it, stale numbers.

## Recommendations for the harness design

1. **Make movement a first-class, honest tool.** One `wow_goto` that
   takes a unit or point, tries the planner, falls back to a bounded
   straight walk, and says *which* happened and *why* in one sentence,
   with the next step ("stuck: start is off the navmesh; try a small
   step north"). Put a navigation live gate in the eval set: "walk to
   each quest giver in Falconwing Square". The core fault (UNKNOWN_HEIGHT
   and start snapping in Falconwing Square) needs its own core
   investigation; the harness cannot fix it.
2. **Never let the snapshot imply "nothing exists".** `wow_look` should
   always end with the nearest living hostile (and nearest quest giver /
   vendor / corpse) at any distance seen, plus an explicit "none seen
   within ~100 yd; walk somewhere new". Add a `wow_explore`/"find
   nearest <kind>" verb that walks until one is seen, so Luna does not
   invent coordinates.
3. **One tool per player intention, named for the outcome.** `wow_loot`
   (whole corpse, names, money, auto-release), `wow_talk` →
   `wow_quest_offers`/`wow_accept_quest`, `wow_quest_log`. Do not reuse
   a "quests" tool for both log and offers; that caused the false claim.
4. **Range and precondition checks in the harness**, returning
   "X is 13.6 yards away; range is 5. Use wow_goto first." instead of
   waiting on silence. This is the #233 action-results work in miniature;
   the harness should not wait for #233 to give these messages.
5. **Async contract**: runs return at once; give a `wow_wait(seconds)`
   that returns at the first relevant event, and **dedupe** so the same
   outcome is not both a tool result and a waking follow-up (mark events
   consumed by `wow_wait`, or wake only when no `wow_wait` is pending).
6. **Names everywhere.** Items, quests, zones and subzones by name
   (`NamedRewardsState`, `NamedInventoryState` exist; zone names need an
   AreaTable lookup). Answering "where am I" needs a place name.
7. **Filter the transcript feed.** Drop `[tuicraft] … is not yet
   implemented` and server MOTD lines from agent context (keep them in the
   game log and the UI). Rule-based promotion (design milestone 5) should
   start with this deny list.
8. **Log tool validation failures** (`tool_result` hook, not only
   `execute`) so eval graders count schema misses.
9. **Keep thinking high but cap stalls.** The 136 s refusal suggests a
   per-turn watchdog in evals and a system-prompt line such as "If no tool
   can do it, say so at once and name the tool you need."
10. **Map panel**: auto-zoom to the nearest 10 units instead of a fixed
    3 yd/row; filter gameobjects that are signposts or off-map; show the
    fight target and path line. The legend was the useful part.
11. **Evals must isolate spawns or expect company**: soap characters from
    parallel runs share `eversong10`; graders must key on the eval's own
    guid.

## Unknowns

- Whether the "Nearest living hostiles" line alone fixes cold (b):
  round 3 started next to stalkers, so it was not a clean test.
- Root cause of the navigation refusals (navmesh data vs planner vs pose
  source) — could not determine.
- Whether `wow_talk` in range returns a usable quest list: never reached
  talk range of a quest giver.
- Luna at `medium` or `low` thinking was not tried.

## Three screen frames (verbatim, `orca-ide terminal read --screen`)

### Frame 19:13:34 — round 1, (b) after the nudge: fight end pushed and woke the agent

```
 wow_fight
 Fight started against Springpaw Stalker 0xf130003d2300c240 (level 7). You will get a message when it ends.
 Waiting for event
 I found a level 7 Springpaw Stalker nearby and started fighting it.
 [system] [tuicraft] Power update is not yet implemented
 [system] [tuicraft] Spell damage is not yet implemented
 [WoW event] [combat] you are being attacked
 [system] [tuicraft] Damage dealt is not yet implemented
 [WoW event] [combat] +108 XP (kill 0xf130003d2300c240)
 [WoW event] fight with Springpaw Stalker ended: completed: server_kill_credit, XP 108. Target now HP 0/137; you HP
 175/217.
● Fgklibhlflc L10 │ HP 190/217 │ map 530 (8813.5, -6691.6, 48.4) │ tgt Springpaw Stalker │ fight idle │ r2151
·····························································  a Fgklibiancf L10 100% 22y
·····························································  b Springpaw Stalker L7 0% 23y
·····························································  c Ghostlands 50y
·····························································  d Fairbreeze Village 50y
·····························································  e Sunsail Anchorage 51y
·····························································  f Saltheril's Haven 51y
······························@→·····························  g Velan Brightoak L30 100% 58y
·····························································  h Silvermoon Guardian L24 100% 77y
············································b················  i Springpaw Stalker L7 100% 78y
·····························································  j Springpaw Stalker L7 0% 79y
·····························································  k Silvermoon Guardian L23 100% 79y
·····························································  l Halis Dawnstrider L15 100% 89y
·····························································  m Mailbox 97y
── ⠇ Working ───────────────────────────────────────────────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
~/.cache/pi-epic-scratch/live-spike/workspace (detached)
↑9.8k ↓839 R10k CH83.1% $0.001 (sub) 1.2%/272k                                                         gpt-6-luna • high
```

### Frame 19:17:21 — round 1, (d): the false "no available offers" claim

```
 stop: pathfind_find_height failed (UNKNOWN_HEIGHT)
 Selecting questgiver target
 wow_target
 Target set: Velan Brightoak 0xf130003c390005eb
 wow_quests
 Dialog: none
 Quest log: 0 quests
 Quest dialog remains unopened
 I walked to Velan Brightoak, the nearest quest giver, and targeted him. I couldn’t get a quest dialog to open; the
 quest check shows no available offers.
● Fgklibhlflc L10 │ HP 217/217 │ map 530 (8765.0, -6685.0, 70.1) │ tgt Velan Brightoak │ fight idle │ r5348
·····························································  a Velan Brightoak L30 100% 11y
·····························································  b Halis Dawnstrider L15 100% 44y
·····························································  c Mailbox 49y
·····························································  d Magistrix Landra Dawnstrider L12 100% 55y
·····························································  e Silvermoon Guardian L22 100% 64y
·····························································  f Fairbreeze Village 66y
······························@↓·····························  g Ghostlands 66y
·····························································  h Sunsail Anchorage 67y
·····························································  i Saltheril's Haven 67y
·································a···························  j Silvermoon Guardian L22 100% 68y
·····························································  k Red Dragonhawk Hatchling L1 100% 68y
·····························································  l Dragonhawk Egg 74y
·····························································  m Dragonhawk Egg 75y
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
~/.cache/pi-epic-scratch/live-spike/workspace (detached)
↑24k ↓1.8k R56k CH96.7% $0.004 (sub) 2.2%/272k                                                         gpt-6-luna • high
```

### Frame 19:25:09 — round 3, (c): loot with names, then (d) starts

```
 Loot it if you can, then tell me what you got.
 wow_loot
 Looted: Discolored Fang x1, Lynx Meat x1.
 [WoW event] [rewards] loot opened: 0 copper, slot 0 item 4814 x1, slot 1 item 27668 x1
 [WoW event] [rewards] received item 4814 x1 (now 1)
 [WoW event] [rewards] received item 27668 x1 (now 1)
 Looted 1 Discolored Fang and 1 Lynx Meat.
 Walk to the nearest quest giver and tell me what quests it offers.
● Fgklibhlflc L10 │ HP 217/217 │ map 530 (8815.7, -6786.5, 45.1) │ tgt Springpaw Stalker │ fight idle │ r760
·····························································  a Springpaw Stalker L7 0% 4y
·····························································  b Springpaw Stalker L7 100% 43y
·····························································  c Springpaw Stalker L6 100% 48y
·····························································  d Eversong Tender L6 100% 55y
·····························································  e Feral Dragonhawk Hatchling L6 100% 59y
·····························································  f Springpaw Stalker L7 100% 64y
···························a··@←·····························  g Feral Dragonhawk Hatchling L5 100% 73y
·····························································  h Copper Vein 76y
·····························································  i Crazed Dragonhawk L8 100% 80y
·····························································  j Feral Dragonhawk Hatchling L5 100% 83y
·····························································  k Springpaw Stalker L7 0% 100y
·····························································  l Eversong Tender L7 100% 101y
·····························································  m Doodad_AncDrae_elevatorPiece_netherstorm01 10917y
── ⠸ Working ───────────────────────────────────────────────────────────────────────────────────────────────────────────
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
~/.cache/pi-epic-scratch/live-spike/workspace (detached)
↑9.8k ↓272 R3.1k CH82.1% $0.001 (sub) 0.7%/272k                                                        gpt-6-luna • high
```

## Cleanup (measured)

- Harness quit with `/quit` each round; no `bun … harness` process left
  (`pgrep -a -x bun | rg harness` empty).
- Orca tab closed (`orca-ide terminal close --terminal term_39214eed-… --tab` → ok).
- Account deleted: `{"deleted":["FAC6AB817B5B2"]}`; the account's
  `tmp/factory-account-*` dir is gone.
- No tracked file in `/home/deity/code/tuicraft` was changed.
