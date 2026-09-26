# Event volume: what an in-harness agent would see

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


Task key `event-volume`. Written 2026-09-26 (UTC). Purpose: set the game-log
promotion and summary rules for the Pi harness with numbers.

Marks: **[measured]** = computed by a script over a log or a live run;
**[read]** = read from source or a document; **[inferred]** = my estimate or
reasoning.

## 1. Answer first

- A naive "push everything" design is unusable. [measured] The logged
  traffic alone averages **9,764 tokens/min** over 2,012 session minutes, and
  reaches **~500,000-590,000 tokens/min during a Jev fight**. The unlogged
  entity-update stream adds another **~4,000-11,000 tokens/min** when idle.
- About 97% of the bytes are **state snapshots that every domain event carries**
  (`data.state`) and the Jev `TACTICS:request` observation. The event itself is
  ~40-300 bytes. [measured]
- With the rule set in section 5, the agent sees **~40-130 tokens/min**
  (corpus average **53 tokens/min**), and is **woken ~8 times per hour**
  (40/hour in the busiest fight session). [measured by simulation over the
  corpus]
- Entity **updates** are the largest raw stream (130-340 per minute) and are
  **not in any existing log**: the daemon drops them. One player's wandering
  Imp pet produced 81% of them in town. They must never reach the agent; keep them for
  panels only. [measured, live]
- Chat is small on this server. Playerbot General chatter was **34 lines in
  2,012 minutes**. `[tuicraft] X is not yet implemented` lines were **944 of
  1,861 chat-type lines (51%)**. [measured]

## 2. Sources

| Source | What | Used |
|---|---|---|
| `~/.local/state/tuicraft/session.log` | 78.6 MB, 62,194 lines (62,193 with a timestamp), 2026-07-05 to 2026-09-26, the main Xiara daemon log | Main corpus [measured] |
| `~/wow-data/deity-client/state/tuicraft/session.log` | 180 KB, 2026-07-05/06, legacy record shapes only | Surveyed, not in the tables (old shapes) |
| `tmp/review-2026-09-24/*-session.jsonl` (not kept), `tmp/m4-live/201-*.jsonl` (not kept) | Slices | First line of each is present verbatim in the main log, so they are duplicates. Skipped |
| `tmp/m4-live/132-*.jsonl` (not kept), `200-*.jsonl` | 21-22 MB | Copies of a prefix of the main log (same first record). Skipped |
| `tmp/m4-live/116,131,171,197-*.jsonl` (not kept) | `read --json` output, no timestamps | Skipped for rates |
| `~/.local/state/tuicraft-factory/accounts/` | Empty | Nothing there |
| **Live capture** (this task) | 8.2 min, 3,501 records, throwaway account `eversong10` preset, scratch clone patched to also log `ENTITY_UPDATE` | Entity-update churn [measured] |

Record shapes [read]:
- `SessionLog.append` writes `{...entry, timestamp}` per line
  (`src/lib/session-log.ts:21-26`).
- Chat: `{type, sender, message, channel?}`, `type` from `JSON_TYPE_LABELS`
  (`src/ui/format-chat.ts:72-117`).
- Entity: `ENTITY_APPEAR` / `ENTITY_DISAPPEAR` only. `case "update"` returns
  `undefined` (`src/ui/format.ts:122-123`), and `onEntityEvent` logs only when
  the object exists (`src/daemon/events.ts:101-112`). So no existing log holds
  entity updates.
- Domain events: `{type: TAG, data: jsonSafe(event)}`
  (`src/daemon/events.ts:343-357`), subscribed in
  `src/daemon/server.ts:237-265`. Core events embed a full state snapshot, for
  example `const event: CombatEvent = { type, state: this.snapshot() }`
  (`src/wow/combat.ts:530`).
- The NYI line fires at most once per stub per connection:
  `if (!fired) fired = notify(...)` (`src/wow/protocol/stubs.ts:74`).

Segmentation: a new session starts after a gap of more than 10 minutes. The
first 30 s of a session counts as its login burst. [measured, method choice]

Caveats [inferred]: one character (Xiara, priest, level ~5-13), almost all in
Eversong Woods / Ghostlands, on a server with 500 playerbots. No party play and
almost no player chat in the corpus (2 `SAY`, 2 `WHISPER_TO`, 1 group invite).
Records with legacy types (`DAMAGE`, `MOVE_*`, `HUNT_*`, `MELEE_*`, 1,730
records, July only) are from older code and are counted as domain `legacy`.

## 3. Measurements

### 3.1 Corpus totals [measured]

- 36 sessions, 2,012 session minutes, 1,633 "occupied" steady-state minutes
  (a minute with at least one record, after the login burst).
- Bytes by record kind (whole file): `TACTICS:request` 36.7 MB (47%),
  `REWARDS:*` ~17 MB, `COMBAT:*` ~9.4 MB, `ENTITY_APPEAR` 3.7 MB,
  `CONTROL:*` ~6 MB, `SYSTEM` 0.21 MB.

### 3.2 Per session (sessions of 20 min or more) [measured]

Rates are per minute. "ent a/d" = `ENTITY_APPEAR` / `ENTITY_DISAPPEAR`.
"tok/min" = all JSON bytes / 4 / minutes. "NYI" = share of `SYSTEM` lines
that are "not yet implemented".

| # | start (UTC) | min | ev/min | ent a/d | chat | tactics | combat | control | fights | max/10s | tok/min | NYI | chat by class |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 07-05 18:23 | 41 | 19.3 | 11.0 / 7.0 | 1.4 | 0 | 0 | 0 | 0 | 117 | 744 | 75% | nyi 42, sys 14, self 1 |
| 1 | 07-05 20:02 | 202 | 20.4 | 10.2 / 6.4 | 1.4 | 0 | 0 | 0 | 0 | 303 | 732 | 45% | nyi 120, sys 150, bot 11 |
| 2 | 07-06 12:11 | 46 | 21.5 | 11.5 / 3.4 | 1.9 | 0 | 0 | 0 | 0 | 151 | 733 | 35% | nyi 29, sys 13, debug 40, bot 4 |
| 3 | 07-06 14:50 | 60 | 34.1 | 8.4 / 5.3 | 3.5 | 0 | 0 | 0 | 0 | 145 | 1,035 | 4% | nyi 8, sys 15, debug 186 |
| 5 | 09-20 20:41 | 40 | 13.2 | 8.7 / 3.8 | 0.6 | 0 | 0 | 0 | 0 | 107 | 498 | 84% | nyi 21, sys 4 |
| 6 | 09-20 22:19 | 123 | 10.4 | 7.3 / 2.4 | 0.5 | 0 | 0 | 0.3 | 0 | 113 | 414 | 87% | nyi 53, sys 8 |
| 7 | 09-21 01:17 | 197 | 10.5 | 4.7 / 2.3 | 0.3 | 1.3 | 1.2 | 0.6 | 6 | 141 | 2,290 | 77% | nyi 33, sys 10, bot 7 |
| 10 | 09-21 14:08 | 47 | 30.7 | 6.0 / 3.8 | 0.3 | 15.9 | 3.2 | 1.0 | 6 | 135 | 17,750 | 56% | nyi 9, sys 7 |
| 11 | 09-21 17:03 | 136 | 27.5 | 4.6 / 2.7 | 0.2 | 8.8 | 2.0 | 8.4 | 12 | 199 | 12,793 | 63% | nyi 19, sys 11, bot 3 |
| 12 | 09-21 19:31 | 62 | 45.3 | 14.5 / 7.9 | 0.8 | 0.6 | 1.0 | 18.6 | 6 | 166 | 7,364 | 59% | nyi 30, sys 21 |
| 13 | 09-21 21:50 | 74 | 38.8 | 11.6 / 7.4 | 0.4 | 5.9 | 1.3 | 11.1 | 2 | 144 | 9,065 | 55% | nyi 16, sys 13, bot 2 |
| 14 | 09-22 16:13 | 141 | 32.2 | 6.6 / 6.1 | 0.1 | 1.7 | 0.8 | 16.4 | 6 | 136 | 5,114 | 50% | nyi 7, sys 7, bot 2 |
| 15 | 09-22 23:09 | 37 | 27.1 | 12.5 / 1.6 | 1.3 | 7.1 | 1.8 | 1.9 | 2 | 176 | 10,994 | 41% | nyi 19, sys 27 |
| 16 | 09-23 01:07 | 642 | 28.8 | 13.5 / 2.0 | 0.9 | 5.4 | 1.4 | 4.2 | 36 | 164 | 10,358 | 62% | nyi 349, sys 215, bot 4 |
| 17 | 09-23 12:14 | 28 | 96.4 | 27.3 / 15.4 | 0.9 | 17.7 | 3.4 | 29.6 | 4 | 129 | 32,611 | 64% | nyi 16, sys 9 |
| 22 | 09-25 00:19 | 49 | 140.5 | 49.8 / 12.0 | 2.2 | 50.4 | 8.0 | 14.0 | 19 | 288 | 70,575 | 74% | nyi 79, sys 28 |
| 28 | 09-26 02:24 | 31 | 11.1 | 8.0 / 1.6 | 0.5 | 0 | 0.6 | 0.1 | 0 | 113 | 1,037 | 53% | nyi 8, sys 7 |
| 30 | 09-26 06:30 | 30 | 3.5 | 2.9 / 0.3 | 0.2 | 0 | 0.1 | 0 | 0 | 90 | 362 | 20% | nyi 1, sys 4 |

Chat lines per minute by channel, whole corpus (2,012 min): `SYSTEM` 1,819 (0.90/min; NYI 944, `[debug]` 226, other 649), `CHANNEL` 34, all `General - <zone>` (0.017/min), `NOTIFICATION` 3, `SAY` 2, `WHISPER_TO` 2, `TYPE_14` 1; `PARTY`, `GUILD`, `WHISPER_FROM`, `YELL` 0. [measured]

Chat sender classes: "self" = sender Xiara/Deity or `WHISPER_TO`; "bot" =
`CHANNEL` lines from other characters (all read as playerbot canned lines,
for example "Turned in [Wanted: Thaelis the Hungerer]! Time to collect my
rewards."). The client cannot see the account, so a **reliable playerbot flag
could not be determined** client-side. No `PARTY`, `GUILD`,
`WHISPER_FROM` or other-player `SAY` lines exist in the corpus.

### 3.3 Minute distributions, steady state (after the login burst) [measured]

| Minute set | n | events/min p50 / p90 / max | tokens/min p50 / p90 / max | tokens/min without `TACTICS:request` p50 / p90 |
|---|---|---|---|---|
| All occupied minutes | 1,633 | 8 / 112 / 627 | 429 / 12,573 / 680,252 | 429 / 12,451 |
| Minutes with tactics or cycle | 105 | 169 / 361 / 627 | 123,550 / 261,828 / 680,252 | 33,514 / 111,285 |
| Idle minutes (no tactics, combat, control) | 948 | 3 / 12 / 328 | 135 / 493 / 40,935 | same |

Per domain inside tactics/cycle minutes (events/min p50 / p90): tactics
109 / 256, combat 15 / 35, control 10 / 31, entity 15 / 96, rewards 0 / 12,
chat 0 / 6.

Largest record kinds by mean size (bytes): `REWARDS:*` ~23,600 (a 179-slot
inventory snapshot in every event), `TACTICS:stopped` 10,293,
`TACTICS:request` 9,670 (5,349 of it the observation, of which 3,767 is the
`unavailable` list), `COMBAT:cast_started` 7,084 (5,456 of it `cooldowns`),
`CYCLE:target_done` 6,311, `CONTROL:*` ~590, `ENTITY_APPEAR` 155,
`ENTITY_DISAPPEAR` 108, `SYSTEM` 117.

The same events with `data.state` and `data.observation` removed: `COMBAT:*`
40-80 bytes, `REWARDS:*` 65-77, `CYCLE:*` 61-65, `QUEST:*` 59-78,
`TACTICS:request` 1,171, `TACTICS:result` 298, `TACTICS:applied` 138.
So **~97% of the bytes are snapshots**. Note that without the snapshot a
combat event says only its type (for example `{"type":"cast_succeeded"}`);
the spell, hit and target live in `state.lastOutcome`. A harness line must be
rendered from core state, not from the event alone (R15). [measured / read]

### 3.4 Login burst (first 30 s of each session) [measured]

36 bursts: records p50 117, p90 236, max 344; bytes p50 41 KB (~10k tokens),
max 965 KB; entity appears p50 103; `SYSTEM` p50 7; NYI lines p50 1, max 9 in
the first 30 s (the rest trickle in as each unimplemented opcode first
arrives). Of 1,819 `SYSTEM` lines, 274 fall in login windows.

### 3.5 Fights [measured]

A fight = `TACTICS:started` to `TACTICS:stopped` with the same `runId`.
116 fights, 1,241 s in total.

| per fight | p50 | p90 | max |
|---|---|---|---|
| duration (s) | 11 | 17 | 118 |
| records | 151 | 236 | 550 |
| `COMBAT:*` records | 16 | 29 | 57 |
| `TACTICS:request` (Jev decisions) | 40 | 64 | 161 |
| `CONTROL:*` records | 4 | 9 | 13 |
| bytes, full JSON | 496 KB (~124k tokens) | 824 KB | 1.88 MB |
| bytes, snapshots stripped, no requests | 24 KB (~6k tokens) | 37 KB | 89 KB |
| max records in any 10 s | 126 | 164 | 217 |

In-fight rates: 707 records/min, 78 combat events/min, 183 Jev requests/min
(three decisions per second, each followed by `result` and `applied`),
**589,276 tokens/min full JSON**, 30,126 tokens/min stripped. 40 cycles:
duration p50 13.4 s, max 49 s.

The live run reproduced this: 4 fights in 1.5 min gave 165 requests/min and
499,015 tokens/min JSON. [measured, live]

### 3.6 Bursts, max records in any 10 s window, steady state [measured]

All 303 (an entity burst after a teleport or zone change); entity 288;
tactics 146; control 62; combat 33; chat 18.

### 3.7 Entity update churn (live) [measured]

Setup: scratch clone of main `5dca819` at
`~/.cache/pi-epic-scratch/event-volume/clone`, with one scratch-only edit to
`src/ui/format.ts` so `case "update"` returns
`{changed, guid, name, objectType, type: "ENTITY_UPDATE"}`. Commands:

```
bun src/factory/main.ts soap create eversong10 --owner event-volume
tmp/tc-FAC6AB8180D25 start           # 19:07:55Z, Fairbreeze Village (8735,-6685)
# idle in town until 19:13:10Z
tmp/tc-FAC6AB8180D25 fight <Springpaw Stalker guid>   # x4, 19:13:22Z-19:14:48Z
# idle in the field 19:14:50Z-19:16:05Z
tmp/tc-FAC6AB8180D25 stop
bun src/factory/main.ts soap delete FAC6AB8180D25     # {"deleted":["FAC6AB8180D25"]}
```

| Phase | min | records/min | updates/min | distinct GUIDs updating | max updates / 10 s | tokens/min JSON (all records) |
|---|---|---|---|---|---|---|
| Login burst | 0.6 | 288 | 206 | 51 | 93 | 11,342 |
| Idle in town | 4.7 | 346 | 340 | 9 | 171 | 11,795 |
| 4 fights | 1.5 | 932 | 299 | 23 | 127 | 499,015 |
| Idle in the field | 1.3 | 137 | 131 | 11 | 32 | 5,785 |

- Mean update record 123-190 bytes (~31-48 tokens).
- In town, 81% of updates were **one player's Imp pet** (1,277 of 1,585; 1,514 of 2,457 over the whole run, 62%),
  position only. Other sources: patrolling guards (173), wandering mobs,
  the character itself (78, power regeneration: `npcFlags+dynamicFlags+power`),
  and other players.
- Position-only updates were 99% of updates in town; health changes were 1.4% of all 2,457 updates
  (mostly in fights); `name` fills and `gameObjectType` updates came in the
  login burst.
- Appear/disappear in the live idle town phase: 2.6 / 2.1 per minute,
  consistent with the corpus idle p50.

## 4. Naive "push everything" cost [measured + inferred]

At 4 characters per token:

| Situation | Logged JSON tokens/min | + entity updates (inferred at ~35 tokens each) | Total |
|---|---|---|---|
| Corpus average (all 2,012 min) | 9,764 | ~4,500-12,000 | ~15,000-22,000 |
| Idle minute p50 | 135 | ~4,500 (field) to ~12,000 (town) | ~4,600-12,000 |
| Fight (in-fight average) | 589,276 | ~10,000 | ~600,000 |
| Busiest session (#22, 49 min, 19 fights) | 70,575 | ~10,000 | ~80,000 |
| Login burst | ~10,000 per login (p50) | ~4,000 | ~14,000 per login |

Even with snapshots removed and Jev requests dropped, a fight still costs
~30,000 tokens/min (mostly `TACTICS:result`/`applied` at 3 per second). A
Luna-class agent at high thinking cannot act on 3 decisions per second, so
these records have no value in its context.

## 5. Proposed rules

Principle (matches the design doc's "Game logs", `docs/plans/2026-09-25-pi-harness-design.md:275-289`):
everything goes to the typed game log (R20); the agent reads it with tools;
promotion is the exception. The harness renders each promoted line from
typed core data (R15), never from the daemon's `{type,data}` JSON.

### 5.1 Wake (triggerTurn: true; while busy deliver as `followUp`)

| Event | Guard |
|---|---|
| `WHISPER_FROM`, `PARTY`, `PARTY_LEADER`, `RAID*`, `GUILD`, `OFFICER` from another character | sender is not self (spike loop, design doc :149-150); coalesce several lines from one sender within 2 s into one wake |
| `SAY` / `YELL` from a player that names the character | name match; else passive |
| Group invite, group kicked/destroyed, duel request, guild invite, trade request, mail | none |
| Fight end (`TACTICS:stopped`) when not inside a cycle; cycle end (`CYCLE:stopped`) | one wake per fight or cycle, carrying the fight summary (5.4) |
| Death and resurrection (`RECOVERY:life_observed` with a change to `dead`/`ghost`/`alive`) | only on a change of `state.life` |
| Being attacked while no fight runs (`COMBAT:attacked` with no active tactics) | once per attacker per 30 s |
| Disconnect, packet error, relog | none |
| A tool the agent started finishing in the background (goto arrival or refusal, cycle queue done) | none |

Global loop guard: at most one wake per 5 s; later wakes in that window join
the pending one. [inferred]

### 5.2 Passive (triggerTurn: false; buffer and flush at `agent_end`, per the spike)

- `SAY`, `YELL`, `EMOTE`, `MONSTER_SAY/YELL/WHISPER` in range, `NOTIFICATION`,
  `SERVER_BROADCAST`.
- `SYSTEM` lines that answer an agent action or change state (for example
  `You are outdoors`, `.gps` output, errors), excluding the cases in 5.3.
- Progress lines: XP gain and level up, item received, money received, quest
  progress / completed / dialog, `CYCLE:target_done`, `CYCLE:loot_done`,
  fight started, `CONTROL:control_error`, `CONTROL:server_correction`,
  group roster change.
- Cap each flush at 20 lines, then one line `+N more in the game log`.

### 5.3 Log only (panels still show them)

- `TACTICS:request/result/applied/activated/transport/discarded/outcome`,
  all `COMBAT:*` inside a fight, `CONTROL:movement_*`, `facing_changed`,
  `control_changed`, `target_*`, `REWARDS:*_requested/_observed`,
  `RECOVERY:*` steps other than life changes, `QUEST:log`, `QUEST:intent`.
- All `ENTITY_UPDATE` (never promoted; feed the panels and the entity store).
- `SYSTEM` "[tuicraft] X is not yet implemented" (944 of 1,861 chat-type lines, 51%),
  `[debug]` lines, and login banners (`This server runs with mod-playerbots`,
  `Playerbots: ...`, `Individual Progression`, `Loot aoe`, `Joined channel`).
- `CHANNEL` (General, LocalDefense, WorldDefense) from other characters: log
  only by default. The only such lines seen are playerbot canned chatter.
- Self echoes (`WHISPER_TO`, own `SAY`).

### 5.4 Summaries

**Fight summary**, one line at fight end, replacing ~151 records and ~124k
tokens (p50) with ~65 tokens, for example:
`fight Springpaw Stalker (7) 11s: killed, +108 XP; 6 casts (Smite 4, SW:P 2), 1 miss; HP 217->164; 0 adds`.
Inside a cycle, per-target lines are passive and the cycle summary wakes.

**Entity digest**, rendered from the entity store, not from the event stream:
- Content: only a change in the *notable* set: hostile units within 30 yd,
  players within 40 yd, named or quest NPCs, anything targeting the character.
  Skip game objects, pets, critters, own updates, and position-only changes.
- Timing: attach one digest to the start of each agent turn (it is context,
  not news), plus a passive digest at most every 30 s while the agent is idle
  and only when the notable set changed.
- Example: `nearby: +Springpaw Stalker(7) 18yd hostile, -Crazed Dragonhawk; 3 hostile, 2 players in 40yd` (~40 tokens).

### 5.5 Expected cost of the rule set [measured by simulation]

Simulation: `bun ~/.cache/pi-epic-scratch/event-volume/sim.ts <log> <digest ms> [session]`
over the main log. Line sizes: chat = 24 + sender + message characters;
other passive lines 90 characters; wake lines 120, fight/cycle summaries 260;
entity digest 60 + 22 per changed name (max 8) once per window with any
appear/disappear. (The live-only update stream does not enter the digest,
because the digest ignores position-only changes.)

| Scope | Wakes | Passive lines | Entity digests | Total tokens/min |
|---|---|---|---|---|
| Whole corpus, 30 s digest | 279 (8.3/hour), 6.9 tok/min | 0.37/min, 7.9 tok/min | 1.23/min, 38.1 tok/min | **52.9** |
| Whole corpus, 60 s digest | same | same | 0.80/min, 26.6 tok/min | **41.4** |
| Whole corpus, no pushed digest (agent pulls `nearby` or a digest tool on demand; per-turn snapshot not counted) | same | same | 0 | **~15** |
| Session 1 (idle, 202 min) | 0 | 11.7 tok/min | 47.3 tok/min | 59.0 |
| Session 16 (642 min, 36 fights) | 7.8/hour | 9.4 tok/min | 26.0 tok/min | 42.3 |
| Session 17 (28 min, heavy movement) | 15.2/hour | 10.6 tok/min | 76.7 tok/min | 100.0 |
| Session 22 (49 min, 19 fights) | 40.5/hour | 35.4 tok/min | 51.9 tok/min | 126.8 |

Against the naive design this is a reduction of ~200x on average and ~5,000x
in fights. The entity digest is the largest remaining item, so the
notable-set filter matters more than the window length. [inferred]

Wake composition in the corpus: 116 fight ends, 40 cycle ends, 120 life
changes, 1 group invite, 1 group destroyed, 1 packet error. With the
"fight end inside a cycle is passive" rule the fight wakes drop by the fights
that ran inside cycles. [measured; the cycle refinement is inferred]

## 6. Things the harness should fix at the source [inferred]

1. Do not put `state` snapshots in game-log events. Log the delta (spell,
   target, result, amounts) and let tools read state on demand. This alone
   cuts the log ~30x.
2. Log `TACTICS:request` observations to a separate Jev trace file, not the
   game log. They are 47% of all log bytes.
3. Keep entity updates out of the game log, or sample them (last state per
   GUID per 5 s). One pet makes ~300 records/min.
4. Keep the NYI stubs out of chat. They are bounded (once per stub per
   connection, `stubs.ts:74`) but they are half of all chat-type lines.

## 7. Could not determine

- Chat volume with real players or a party: the corpus has none. Rates for
  whisper/party wakes are therefore unmeasured.
- A client-side playerbot flag: not found in the record shapes.
- Entity-update rates in other zones (cities, Outland, crowded quest hubs):
  the live capture was 8 minutes in one village and one field.
- Exact token counts: all numbers use 4 characters per token, not a tokenizer.
