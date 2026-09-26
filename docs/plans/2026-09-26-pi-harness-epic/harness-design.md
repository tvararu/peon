# Pi harness design (key: harness-design)

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


Written 2026-09-26 by the design-panel judge. It scores the three panel
designs and synthesises one design for `packages/harness`. Sections A–K
can be approved one at a time. Read-only work: no tracked file changed.

Marks: **measured** (a command ran and its output was seen, here or in
the cited report), **read** (read in the cited file), **inferred** (design
reasoning). Abbreviations:

| Short | File (copies sit in this directory; "not kept" = scratch that was not committed) |
|---|---|
| OF, SS, SMF | `harness-design-{observation-first,situation-stream,small-model-first}.md` (not kept) |
| REPORT §2.n | [pain-points-report.md](pain-points-report.md) ranked pain point n (ids are stable; rank is the revised one) |
| C2 | `pain-points/critic-2.md` (not kept; summarised in the epic spec) |
| LS | [live-spike.md](live-spike.md) |
| LR | [luna-runtime.md](luna-runtime.md) |
| EV | [event-volume.md](event-volume.md) |
| HA | `harness-architecture.md` (not kept; this design supersedes it) |
| ES | [eval-suite.md](eval-suite.md) |
| ND | [nav-diagnosis.md](nav-diagnosis.md) |
| UG | [ui-gallery.md](ui-gallery.md) |
| GR | [glyphs.md](glyphs.md) |
| HS #n | row n of `inventory/handle-surface.md` §1 (not kept) |
| R<n> | ruling n in the Decisions section of [the epic spec](../2026-09-26-pi-harness-epic-design.md#2-decisions) |

Core paths are post-migration (`packages/core/src/wow/...`, epic branch
`epic/pi-harness`, commit `0282fe4`; the harness package exists with an
empty `src/index.ts`, measured with `ls`).

**Top 8 pain points by the revised ranking** (REPORT §2 table, reproduced
by C2 §2, measured there): 1 = 2.3 intent not outcome; 2 = 2.6 long
actions polled; 3 = 2.9 history by draining read; 4 = 2.10 parse tax;
5 = 2.4 movement refusals; 6 = 2.2 hostility and roles not fields;
7 = 2.7b readiness guessed with sleeps; 8 = 2.11 no-change loops.

---

## 0. Judgement

### 0.1 A fact none of the three designs had

All three designs say `nav-diagnosis.md` does not exist (OF §7,
SS §0, SMF §7). It exists now (measured, `ls`). It changes the movement
part of every design (ND Summary and §5, measured there):

- The spike's straight-walk fallback **produced** the stuck
  `start snapped off` pose (ND §3c). SS's travel strategy 2 (a bounded
  straight walk after a destination refusal) is therefore contradicted by
  measured evidence. It is not grafted.
- SMF's "retry once with the listed floor as `z`" is ND fix F5, the
  harness form of core fix F3. It is kept.
- F3 (guid `goto` picks the floor from the unit's observed Z) and F4
  (`nextStepFor` text for `start snapped` and `ground corridor changes
  surface`) are small pure-core fixes that R21 allows. They go to G.
- F1+F2 (install a patched namigator with `adt-edges` as a default patch)
  raise guid gotos from the spawn from 1/9 to 7/9 (ND Pass P, measured
  live). They needed a maintainer ruling on #151; K4 asked for it, and
  R27 approved the navigation track that delivers them.
- A ~5 yd move clears a snapped start (ND R3b, measured live). The design
  gives the model one call for it (`travel(to: "unstick")`), not an
  automatic detour.

### 0.2 Scores (1–5, 5 best)

| Criterion | observation-first | situation-stream | small-model-first |
|---|---|---|---|
| **Coverage of top 8** | **4.** 2.3 settle + `after` + danger line; 2.6 bounded block + `wow_wait`; 2.9 `wow_log`; 2.10 typed text; 2.4 typed refusal + repeat guard; 2.2 `wow_scan` relation/role; 2.11 unchanged marker + stuck line. 2.7b: no `world_ready` gate is named (OF §1.1 rule 8 covers offline only). | **4.** Same coverage as OF for 2.3, 2.6, 2.9, 2.10, 2.2, 2.11 (`No progress:` line). 2.4 carries floors as options, but its straight-walk step conflicts with ND §3c. 2.7b: no `world_ready` gate. | **5.** Every top-8 id has an answer. Only design with an explicit `world_ready` gate (SMF §1.12 "Identity") for 2.7b. 2.4 floor retry matches ND F5. 2.9 is folded into `journal`, which is enough. |
| **Usability by a cheap model** | **3.** 23 tools (17 in round 1). Four overlapping read tools (`look`/`scan`/`inspect`/`find`) repeat the shape that caused LS friction 4 (a near-miss tool gave a false claim, measured). Runs return after 20 s and need `wow_wait`, the pattern that gave LS friction 5 and 6 (poll, then duplicate). Good refusal text with `next`. | **3.** 20 tools. `[now]` per call removes most reads, which is the best idea for a small model. `#tail` refs (4 hex) are harder to copy than `u7`. Same 20 s + `wow_wait` pattern as OF. | **5.** 10 intent tools; one call per player intention (`engage` finds, walks, fights, loots). `u<n>` refs. One status word first, one `Next: tool(args)` line last. Blocks to the end, so no poll and no duplicate (LS friction 5, 6). Closest to what LS showed Luna follows (error text read and followed, LS friction 9). |
| **Token budget per minute** | **4.** Pushed ≈ 15 tok/min (EV §5.5 "no pushed digest", measured by simulation) + a 41-token header per agent run. Pull-heavy: `wow_look` ≈ 225 tokens, and LS shows 27 looks in one session. | **4.** Stored ≈ 15 tok/min. `[now]` per LLM call is not stored: ≈ 600 tok/min while active, 0 idle (SS §2.5 arithmetic, inferred). Cheap in money, but it is paid on every call. | **5.** ≈ 15 tok/min pushed + a 56-token `[now]` per agent run (< 8 tok/min at 8 runs/h). Blocking tools remove poll reads. Fewest result tokens per task. |
| **UI value for the human (round 1)** | **5.** Full renderer families (picture/table/card/line/live run), 4-row footer with attackers, ticker, tab-title danger, working message. | **5.** Same round-1 set, plus `/now` (the human sees exactly what the model saw) and a place row in the footer. | **4.** Same round-1 set with rich `engage`/`travel`/`recover` renderers; fewer tools means fewer distinct cards. |
| **Feasibility on confirmed Pi 0.87.1 primitives** | **4.** `before_agent_start`, `input`, `onUpdate`, `setFooter`, `registerMessageRenderer` are all read (pi-ui.md, LR §4). Early return on human input is read only. | **3.** Its core mechanism, the `context` hook per LLM call, is unverified: SS's own V1 (Responses API accepts a user message after a tool result) and V2 (not stored) are open. A fallback exists. | **4.** Same read primitives as OF. The yield ordering was traced to line numbers (`agent-session.js:1230` handler vs `:1251` queue, `agent-loop.js:186`, read) but not run. |
| **Core change size and legacy impact** | **4.** C1–C8, mostly S. Area names from `wow_messages` `area.wowm` (2308 entries, measured) need no DBC. Harness does loot and recovery itself (no core run). | **3.** C0–C9 incl. `lootAll`, `recoverCorpse`, `probeGround` (M each). C5 needs `AreaTable.dbc`, which is **not** in the configured data dir (measured by SS). | **3.** C1–C11, many small, plus two core runs (C7) and an optional `goToRun`. Legacy impact small (additive JSON fields, mock members). |
| **Eval support (P5, P6, run dir)** | **5.** P5 table item by item; `human/input` and `agent/message` in the game log; `status.json` makes the P6 watcher thin; `tool/invalid`. | **5.** P5 table; `char` on every row; `delivered`/`consumedBy`; `situation.jsonl` tells a grader what the model saw (splits "header wrong" from "model misread"). | **4.** P5 table; `char` on every row; status words in `tools.json`; repeat-guard hits counted. No per-call record of what the model saw beyond `digest/now`. |
| **Buildability by parallel agents in a few hours** | **4.** 23 thin tools: one file each, easy to fan out, but more surface to test. | **3.** 20 tools + a `situation/` module + a risky hook that gates the design. | **3.** 10 composite tools share building blocks (travel inside `interact` and `engage`). Parallel only if builders split on an ops layer first (inferred). |
| **Total (of 40)** | **33** | **30** | **33** |

**Choice.** OF and SMF tie. The tie goes to **small-model-first as the
base**, because R16 says "making it work on a dumb model is a far greater
achievement", and SMF wins the two criteria that decide that
(usability 5 vs 3, budget 5 vs 4).

### 0.3 Grafts and conflicts

| Topic | OF | SS | SMF | Synthesis |
|---|---|---|---|---|
| Tool set | 23 wow_* | 20 wow_* | 10 intent tools | **SMF's 10**, unchanged names (Pi's built-in tools are off, `noTools: "builtin"`, so bare names do not collide; LR §3, measured) |
| Unit refs | `#tail` 6 hex | `#tail` 4 hex | `u<n>` | **`u<n>`** plus exact name or unique prefix |
| Long actions | block ≤ 20 s, then `wow_wait` | block ≤ 20 s, then `wow_wait` | block to the end; yield on human input or 120 s | **SMF.** LS friction 5 and 6 (measured) come from the fast-return shape |
| Run conflict | replace moves, refuse moves during a fight | replace | refuse | **Refuse**, with `Next: stop(run: "r4")` (K3) |
| Status words | `done/refused/unconfirmed/failed/running/cancelled` | `confirmed/refused/unconfirmed` | `DONE/PARTLY/RUNNING/REFUSED/FAILED` | **SMF + `UNCONFIRMED`** (REPORT §6 principle 1 names "unanswered"; C2 §4 gap A) |
| Danger | danger line on every result | `Attackers:` in `[now]` | "No unit is attacking you" in `look` | **OF's danger line on every result** + attackers in `[now]` |
| Situation | status header per agent run | `[now]` per LLM call via `context` | `[now]` per agent run via `before_agent_start` | **Per-run `[now]`** with SS's content rules (nearest of each kind, `No progress:`). Per-call injection only behind `--now-per-call` after smoke tests V1/V2 (section H) |
| Out-of-view units | sightings memory 30 min | nearest at any distance seen | nearest at any distance seen | **OF's sightings memory** folded into `look`'s "Nearest" line |
| Movement after refusal | options only | straight walk for destination refusals | floor retry once | **SMF floor retry** (ND F5) + model-invoked `travel(to: "unstick")` (ND R3b). No straight walk (ND §3c) |
| Zone names | `area.wowm` table (2308, measured) | `AreaTable.dbc` (absent, measured) | `AreaTable.dbc` | **OF's generated table** |
| Loot, corpse run | harness sequence | core `lootAll`, `recoverCorpse` | core `lootCorpse`, `recoverCorpse` | **Core runs** (reuse the cycle's tested `loot-run.ts`, `corpse-run.ts`; REPORT Q6, prior-ux decision); harness sequence is the fallback if G7 slips |
| Stop reflex words | `stop/halt/freeze` message-initial | `stop/halt/freeze/hold`, ≤ 5 words | adds `wait` | **SS's rule.** `wait` misfires on "wait, what level are you?" (SMF risk 5) |
| Esc | aborts the turn only | aborts the turn | aborts the turn and halts all runs | **Halt** (ES step 11 uses Esc as `HARNESS_ABORT`, read) |
| Event steer | death and disconnect steer | three cases steer | `followUp` only | **`followUp` only**: runs already stop on death, so no tool batch needs cutting |
| What the model saw | header in session | `situation.jsonl` | `digest/now` rows | **`agent/now` row per `[now]` in the game log** (one file for graders) |
| `/now` for the human | — | yes | — | **Kept** |
| Log tool | `wow_log` | `wow_log` | `journal(about: "log")` | **`journal`** (keeps 10 tools) |
| P6 helper | `status.json` | — | — | **Kept** |
| `rest` | — | — | `rest` over item kind | **Kept**, over item class from the item template (G11) |

---

## A. Principles and the model-facing contract

**Summary.** The model is a cheap model (Luna, R16). Ten intent tools do
whole jobs in code. Every result is short text that starts with a status
word and ends with one concrete `Next:` step; the typed data goes to the
human, the log and graders only.

### A.1 Principles

1. **One call per player intention.** A tool does the whole job and
   returns the outcome. The model never runs a fixed-count loop (REPORT
   §6 principle 11).
2. **Outcome, not intent.** Every action settles against the server
   event that answers it, inside a bounded window, and returns the state
   after. Typed action results in core (#233) are out of scope (HANDOVER Q1
   answer). **Harness-side settlement is the answer to rank 1 (2.3) in
   this epic, not a deferral** (C2 §4 gap A). Each tool subscribes to the
   matching `on*` hook before it sends and unsubscribes after. A later
   core ledger can replace the waiters without a tool change.
3. **Refusals are terminal, typed and actionable.** Reason code, one
   sentence, `Next:` with a concrete call, untried options. The same call
   from the same place is refused in code (REPORT §6 principles 2, 3).
4. **Short content, full details.** `content` ≤ 12 lines and about 700
   bytes, plain words, no glyphs, no JSON. `details` holds the typed
   object; it never reaches the model and renderers draw only from it
   (LR §4, read; renderers replay on resume).
5. **Every spatial fact has an origin, a source and an age.** One pose
   object with `predicted|server` and age (REPORT §2.5).
6. **Decode everything.** Relation, attackable, attacking-me, roles,
   creature type, item and spell names, enum words for numeric codes
   (REPORT §6 principle 6).
7. **Wake rarely.** About 15 tokens a minute of pushed events (EV §5.5,
   measured by simulation). Everything goes to the game log first.
8. **History is a query**, never a draining cursor (REPORT §2.9).
9. **Reflexes in code, goals in the model.** Runs stop on death,
   `rooted` or a new attacker. A human "stop" halts in code before the
   model reads it.
10. **Identity is bound at start; tools wait for `world_ready`** (self
    pose known and first object burst seen). No default profile
    (R19, REPORT §2.7b).
11. **Guidance lives in tool descriptions**, not a long prompt (REPORT
    §4.4). The prompt never teaches a hand method (relog, corpse legs,
    heading sweeps, bit decoding).
12. **The human sees what the model sees** (footer = `[now]`), plus more
    (REPORT §6 principle 14).

### A.2 Result contract (all ten tools)

Line 1 starts with one status word. A small model keys on it (SMF §1.1).

| Word | Meaning |
|---|---|
| `DONE` | The job finished and a server event confirmed it (kill credit, item push, arrival pose, quest accepted). |
| `PARTLY` | Part of the job finished (2 of 3 kills; 17 yd short). |
| `RUNNING` | The call yielded early; run `r<n>` continues and wakes the agent when it ends. |
| `UNCONFIRMED` | The packet went out; no server answer came in the settle window. Never "OK". |
| `REFUSED` | The harness did not act: a precondition failed or the call repeats a failure. |
| `FAILED` | The harness acted and the server or core refused, or the run ended badly. |

- Last line on every non-`DONE` result: `Next: <tool>(<args>)` or
  `Next: ask the human: "<question>"`. A `DONE` result may also end
  with `Next:` when an obvious step follows. The one-run-at-a-time refusal
  uses the code `busy`.
- When any unit attacks the character, the result ends with one danger
  line (OF §1.1 rule 5): `Danger: Springpaw Stalker u9 is attacking you
  (hit you 3 s ago). You are at 41% HP.`
- Unit refs: `RefTable` gives each guid a ref `u<n>` the first time a
  tool shows it and never reuses one in a process. Every unit parameter
  accepts a ref, an exact name (nearest living match) or a
  case-insensitive part of a name ("dragonhawk", "stalker"; the nearest
  living match when every match has the same name). Matches with
  different names refuse with the candidates, nearest first, each as a
  ready call (`Next: engage(target: "u14")`). A name the client has not
  seen refuses `not_seen` with `Next: travel(to: "explore")` (luna-usability V-L4).
- A run the human stopped (stop reflex, `/stop`, Esc) returns `FAILED
  cancelled: the human stopped you. Start nothing new.` and
  `Next: end your turn and wait for the human.` Its danger line, if any,
  is still shown; the stop outranks it (F.1).
- Core throws (`World socket is not connected`, `self_not_alive`,
  `missing_jev_key`, `<refusal>: <raw>`) map to `REFUSED`/`FAILED` with
  a `Next:` line. No stack reaches the model.
- Offline: `REFUSED offline: the game connection is down. Next: ask the
  human to run /connect.`
- Before `world_ready`: `REFUSED not_ready: the world is still loading.
  Next: call look again in a few seconds.` (the tool also waits up to
  10 s for readiness before it refuses; inferred bound).
- `details.result` for renderers and graders:

```ts
type ToolResult<A> = {
  status: "DONE" | "PARTLY" | "RUNNING" | "UNCONFIRMED" | "REFUSED" | "FAILED";
  reason?: string;            // code, e.g. "too_far", "no_ground", "start_off_mesh"
  detail: string;             // the model's line 1
  next?: string;              // the model's last line
  options?: unknown;          // floors, candidates, alternatives
  after: A;                   // typed observation after the action
  runId?: string;
  evidence?: { seq: number; domain: string; event: string }[]; // game-log rows that settled it
};
```

### A.3 Execution and runs

- `look` and `journal` are `parallel`; the other eight are `sequential`
  (one sequential tool makes the batch sequential, HA §9, read). One
  async world mutex wraps only the synchronous send of each action.
- `travel`, `engage`, `rest`, `recover` start a tracked run `r<n>` (HA
  §8.2 registry). The tool **blocks until the run ends**, streams
  `onUpdate` partials every ≤ 500 ms, and yields early only when (a) the
  human types (section C.4), or (b) 120 s pass. A yield returns
  `RUNNING r3: engage 1 of 3 kills, fighting Springpaw Stalker u9 (41%).
  You: HP 164/217, mana 61%, at 8813, -6691.` (self vitals and pose
  always, because `[now]` is from the start of the agent run and the
  human's question may be "how much health do you have", ES
  `t7-question-while-acting`) and `Next: end your turn; a [game] message
  comes when r3 ends. Or stop(run: "r3").`
- One run at a time. A second `travel`/`engage`/`rest`/`recover` while a
  run is active refuses with `Next: stop(run: "r4")` (K3). `look`,
  `journal`, `social`, `stop` always work.
- Esc aborts the Pi turn, and the harness then calls `halt()` and
  cancels every run (ES step 11 `HARNESS_ABORT`, read).
- A run's end goes into the awaiting tool result. It becomes a wake only
  when no call awaits it (dedupe, LS friction 6).

### A.4 Code guards

| Guard | Rule | Pain |
|---|---|---|
| Exact repeat | Same tool, same args, same refusal code, pose moved < 2 yd **and the C.6 progress digest unchanged** (so `engage` refused `low_health`, then `rest`, then `engage` again is not blocked; a `DONE` of any other action also clears the entry): refuse without acting; name what is untried. Time-based codes are exempt (`not_ready`, `offline`, `turn_budget`, `busy`), so a `Next:` that says "try again later" still works. `look` is never blocked. | 2.11 |
| Range and preconditions | Range, life, combat and window checks before any packet. The tool walks into range itself when it can (`interact`, `loot`, `engage`). | LS friction 9 |
| Danger before a pull | `engage` refuses under 50 % HP or 30 % mana (mana only for a class whose power is mana; a warrior's rage starts at 0) (`Next: rest(), then engage(<same args>)`), or with another attacker on the character (engage that one first). | 2.1 |
| One run at a time | above | HA Q4 |
| Human message pending | From the moment the `input` handler sees human text (C.4) until the next LLM request starts, every action tool (`travel`, `engage`, `loot`, `interact`, `rest`, `recover`, `social`) returns `REFUSED human_waiting: the human wrote a message. Read it before you act.` without acting. `look`, `journal`, `stop` still work. Time-based, so exempt from the repeat guard. Reason: Pi reads queued steers only after the whole tool batch (`agent-loop.js:186`, read in pi-agent-core 0.87.1), so without it the later tools of a batch would act on a stale plan after a yield | C.4 |
| Identity and readiness | profile bound at start; tools wait for `world_ready` | 2.7a, 2.7b |
| Turn budget | 40 tool calls in one agent run, then every tool returns `REFUSED turn_budget: report to the human now.` | LS friction 11 |
| Secrets | `social` refuses text that contains the account name or password | ES principle 10 |
| Invalid schema | after 2 schema errors on one tool in a row, the `tool_result` hook appends the tool's minimal valid call to the error text (OF §2.8, inferred; only if the hook sees validation errors, smoke test V4) | LS friction 8 |

---

## B. Tool surface

**Summary.** Ten tools, named for the player's intent: `look`, `travel`,
`engage`, `loot`, `interact`, `rest`, `recover`, `social`, `journal`,
`stop`. Every other `WorldHandle` member (129, HS §1, measured count)
stays behind them. Builders build a shared ops layer first (section H.6),
then each tool is a thin composition.

### B.1 The list

| # | Tool | Kind | Does | Top-8 pain it answers | Other pain | Scenarios (ES; `t3-mana-downtime` is not in round 1) |
|---:|---|---|---|---|---|---|
| 1 | `look` | read | self, place, target, run, danger, 6 filtered rows, nearest of each kind at any distance (incl. out of view) | 2.2, 2.10, 2.11, 2.7b | 2.1, 2.5, LS failure 2 | t0-hostiles, t0-who-is-near, t0-self-state |
| 2 | `travel` | run | go to a unit, corpse, point; `explore`; `unstick` | 2.4, 2.6, 2.11 | 2.8, ND F5 | t1-walk-to-npc |
| 3 | `engage` | run | choose target (or explore for one), approach, Jev fight or cycle, loot, report | 2.3, 2.6, 2.2 | 2.1, 2.12, 2.13, R5 | t3-kill-one, t4-quest-first, t7-* |
| 4 | `loot` | action | whole corpse, one slot at a time, names, money, release | 2.3 | 2.12, LS round 2 | t3-kill-one, t4-quest-first |
| 5 | `interact` | action | walk into range, talk, accept, turn in, buy, sell junk, train, repair, gossip | 2.3, 2.2 | 2.12, LS friction 4, 9 | t5-vendor-buy, t4-quest-first |
| 6 | `rest` | run | eat and drink to a threshold, confirmed by aura | 2.3, 2.6 | 2.1 | t3-mana-downtime |
| 7 | `recover` | run | release, corpse run, reclaim; or spirit healer; or accept a resurrection | 2.6, 2.11 | 2.8, 2.1 | t6-die-and-recover |
| 8 | `social` | action | say, whisper, party, guild, invite, accept/decline invite, leave | 2.3 | 2.7a | t2-whisper-reply |
| 9 | `journal` | read | quest log, bags, spells, game-log history (tail, search, since) | 2.9, 2.10 | 2.12, 2.13 | t4-quest-first |
| 10 | `stop` | control | cancel one run or halt everything | 2.6 | tier 7 | t7-halt-resume |

TypeBox: `Type` and `StringEnum` come from `@earendil-works/pi-ai`
(read, SMF §1.1). `StringEnum` for every enum, because the Codex path may
not accept `anyOf` of literals (could not determine; safe default). Every
parameter has a one-line `description`. Few required fields: Pi rejects
a schema miss before `execute` and Luna pays a turn for it (LS friction 8,
measured).

### B.2 `look`

```ts
Type.Object({
  find: Type.Optional(StringEnum(
    ["any", "hostile", "attackable", "questgiver", "vendor", "trainer", "repair",
     "lootable", "player", "corpse", "spirit_healer"],
    { description: "What kind of unit to list. Default: any." })),
  name: Type.Optional(Type.String({ description: 'Part of a unit name, for example "Stalker".' })),
  within: Type.Optional(Type.Integer({ minimum: 5, maximum: 100,
    description: "List every unit within this many yards (up to 20 rows). Default: the 6 nearest within 60 yd." })),
})
```

Reads self, place, target, run, party, recovery and nearby rows; filters;
sorts nearest first; keeps 6 rows (up to 20 when `within` is set, so
"who is within 30 yards" is one call, ES `t0-who-is-near`). Rows are
creatures and players only: game objects (signposts, mailboxes, eggs,
veins, `Doodad_*`) never appear as rows, because the spike's list showed
signposts as if they were units (LS friction 12, 14). It **always** adds a
"Nearest" line per kind at any distance the client has seen, including
units that left view (the **sightings memory**: last position, relation,
roles, level and time per guid and per creature entry, kept 30 min,
harness-only, OF §1.3). When the filter matches nothing it says so and
gives an explore step (LS failure 2, measured: "the 10-row list was the
whole world").

Model gets:

```
DONE Fgklibhlflc L10 Priest, HP 217/217, mana 100%, alive, not in combat. Eversong Woods, Fairbreeze Village (area 4 min old). 8735, -6685, facing N. Pose predicted, server fix 12 s ago.
Target: none. Running: nothing.
4 of 4 units within 60 yd, nearest first:
- u6 Fgklibiancf L10 player, friendly, 0 yd
- u3 Velan Brightoak L30 friendly, questgiver, 11 yd E
- u4 Marniel Amberlight L15 friendly, vendor repair, 38 yd W
- u5 Silvermoon Guardian L22 friendly, 58 yd S
Nearest hostile: u9 Springpaw Stalker L7 alive, 78 yd N (seen now). Nearest lootable: none. Nearest trainer: none seen.
No unit is attacking you.
```

With `find: "hostile"` and none seen at any distance, the read ran, so
the status is `DONE`. The explore hint is conditional and is not a
`Next:` line: a `Next:` on a question task ("is anything hostile near
you?") makes the model walk instead of answer (ES `t0-hostiles`,
`t0-where-am-i` probe over-acting; luna-usability V-L2):

```
DONE 0 hostile units seen at any distance in the last 30 min. The client sees about 100 yd around you.
If your task needs one: travel(to: "explore north"), or another direction.
```

Human sees (`renderResult`; glyph names in angle brackets stand for the
set chosen by `--glyphs`, GR):

```
 look <target> hostile
 <self> Fgklibhlflc L10 Priest  <health> ██████████ 217/217  <mana> ██████████ 100%   Eversong Woods · Fairbreeze Village
   1 <hostile> Springpaw Stalker    L7  ██████████ 100%  78y <compassN>   u9
   2 <hostile> Springpaw Stalker    L7  ████▌····· 45%   79y <compassN>   u12  <target> on Fgklibiancf
   3 <neutral> Crazed Dragonhawk    L8  ██████████ 100%  80y <compassNE>  u14
 3 of 31 seen · origin predicted 0.4s · server fix 12s · nearest first     (ctrl+o: mini-map)
```

Collapsed: 3 lines. Expanded: the mini-map at ≥ 112 inner columns (UG §1,
measured there). Relation words are `hostile | neutral | friendly |
unknown`; `unknown` never becomes `neutral` (the faction catalog is
optional, REPORT §2.2). Loop guard: three unchanged looks in 60 s with no
run append `Nothing changed in 3 looks. Act, or end your turn to wait for
events.`; while a run is active, line 2 shows its progress and `It is still
running. End your turn to wait.`

Handle: `getControlState` HS #54, `queryNearby` #63, `getNearbyEntities`
#32, `getCombatState` #65, `getRecoveryState` #78, `getPartyState` #29,
`getExperienceState` #98, `getTacticsState` #72, `getCycleState` #114,
`onEntityEvent` #30 (sightings). New core: G2–G6.

### B.3 `travel`

```ts
Type.Object({
  to: Type.String({ description:
    'A unit id (u4), a unit name, "corpse", "explore" or "explore north" (any of north, south, east, west, northeast, northwest, southeast, southwest), "unstick", or coordinates "8764, -6683" or "8764, -6683, 72.7".' }),
  within: Type.Optional(Type.Number({ minimum: 1, maximum: 40,
    description: "Stop this many yards from the goal. Default 3 for a unit, 1 for coordinates." })),
})
```

A tracked run of kind `travel`:

1. Resolve `to`. A unit becomes its guid (core `goTo({kind:"guid"})`).
   Coordinates without z take no guessed z; core resolves the floor.
2. Plan with `goTo` (HS #73). It throws `<refusal>: <raw>` at once;
   otherwise the end comes from `onControlEvent` (#61) plus
   `getNavigationState().active === false`, with a 2 Hz poll as backstop
   (HA §8.3, read).
3. Refusal handling, bounded, reported, no heading sweep:
   - `ambiguous ground column at destination` / `not on a ground floor`
     on a **unit** goal: if exactly one listed floor is within 0.25 yd of
     the unit's observed z, retry once with that floor (ND F5; core G8
     makes this core behaviour, after which the harness step is a no-op).
   - Same refusal on a **coordinate** goal: `REFUSED ambiguous_floor`
     with the floors as options and `Next: travel(to: "x, y, <floor>")`.
     Never a guessed z (LS friction 2).
   - `start snapped off the requested ground position`: `FAILED
     start_off_mesh` with `Next: travel(to: "unstick")`.
   - Anything else: `FAILED <code>` with core's `nextStepFor` text in
     plain words and what was not tried.
4. `"unstick"`: one `walkToward` of at most 5 yd toward the last pose
   from which a plan succeeded, or away from the nearest object when none
   is known. It never follows a refused goal (ND R3b, measured: a ~5 yd
   move cleared a snapped start). It is model-invoked, not automatic
   (K2). Its result names the goal that was refused, so the model does
   not have to remember it: `DONE moved 4.8 yd. Next: travel(to: "u4")`.
   The repeat guard lets that retry through, because unstick moved the
   pose and changed the progress digest (A.4).
5. `"explore"`: with a direction ("explore north"), walk up to 40 yd
   that way; without one, pick the nearest direction not visited this
   session (a 20 yd grid of visited cells). Tasks say "north of town" and
   "head north out of the village" (ES `t3-kill-one`, `t6-die-and-recover`,
   `t7-*`), and the prompt forbids invented coordinates, so a direction
   is the only honest way to follow them (luna-usability V-L3). Walk up to 40 yd with bounded legs, stop
   when a new unit of interest appears, on danger, or after 3 obstructed
   legs; then return a `look`-style summary of what came into view. Each
   leg is a planned `goTo({kind: "point", x, y})` with no `z` (core picks
   the floor or refuses), never a `walkToward` straight walk: ND §3c
   measured that the straight-walk fallback produced the snapped start,
   and ND's recommendation bounds straight walks to open ground. A leg
   refusal counts as one obstructed leg. `walkToward` is used only by
   `unstick` (step 4).
6. `"corpse"` as a ghost hands over to `recover`'s corpse path (SKILL.md
   forbids `goto` from a ghost, REPORT §2.8).
7. The run stops itself on a new attacker, `rooted` or death, with
   `FAILED interrupted` and the cause (principle 9).

Model gets:

```
DONE arrived at Marniel Amberlight (u4): 2.1 yd away after 36 yd in 6.2 s.
```
```
FAILED no_ground: the path finder found no ground on the way (UNKNOWN_HEIGHT). Walked 0 yd. Tried: planner once.
Next: ask the human: "I cannot reach Marniel Amberlight from here. Is there another way?"
```
```
FAILED start_off_mesh: your own position is not on ground the planner knows (start snapped off). Walked 0 yd.
Next: travel(to: "unstick")
```
```
DONE explored 40 yd north. New in view: 4 hostile (nearest u9 Springpaw Stalker L7 22 yd N), 1 questgiver (u17 Ranger Degolien 35 yd NE).
```

Human sees (partial, then final):

```
 travel <mapPin> Marniel Amberlight u4
 <runRunning> walking  ██████████████▏·········  16.6 / 36.8y · 7.0 y/s · ETA 2.9s   r2
   ━━━━━━━━━━━━━━━●━━━<self>───────────<waypoint>──────<mapPin>  wp 2/4 · pose predicted
```
```
 travel <mapPin> Marniel Amberlight u4
 <runFailed> no_ground  UNKNOWN_HEIGHT · walked 0y · planner 1/1   r2
   next: ask the human
```

Handle: `goTo` #73, `getNavigationState` #74, `observeNavigation` #75,
`onControlEvent` #61, `walkToward` #58, `getControlState` #54, `halt` #60
(cancel; `goTo` has no dedicated stop).

### B.4 `engage`

```ts
Type.Object({
  target: Type.Optional(Type.String({ description:
    'Unit id (u9) or name ("Springpaw Stalker"). Default: the nearest hostile you can attack.' })),
  count: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, description: "How many kills of this kind of creature. Default 1; with quest, the kills the quest still needs." })),
  quest: Type.Optional(Type.String({ description: 'Quest id like "8325" or the quest title from journal: fight the creatures its objectives need.' })),
  how: Type.Optional(Type.String({ maxLength: 120,
    description: 'Short instruction for the fight helper, for example "only Smite".' })),
  loot: Type.Optional(Type.Boolean({ description: "Loot each kill. Default true." })),
})
```

A tracked run of kind `engage`, the Jev split-second layer under the
steering agent (R5 refined):

1. **Choose.** `target` given: resolve it. Else the nearest living unit
   with relation `hostile` (`neutral` only when named), not tapped by
   another player, level at most 3 above the character (K5). None seen:
   explore up to 3 times (`travel` explore legs) before it refuses. A
   **named** target that the client has not seen explores the same way
   before `not_seen` (luna-usability V-L4: "Go kill one of the Springpaw
   Stalkers north of town" is then one call after one `explore north`,
   not look, explore, look, engage). With `count > 1` the target names
   the kind: the run fights living units with that unit's name. When the
   only candidates are over the level cap: `REFUSED too_strong: Springpaw
   Stalker u9 is L7, 6 levels above you. If the human asked for this
   fight: engage(target: "u9").` and no `Next:` line (conditional text,
   as in B.2, so rule 7 does not undo the K5 guard; ES
   `t6-die-and-recover` starts at level 1 and must fight a Stalker, and
   its task asks for that fight). `quest` accepts the id or the title; an
   unknown title refuses with the quest log's titles and ids.
2. **Guard.** Refuse with `Next:` when dead (`recover()`); when another
   unit attacks the character (`engage(target: "<that unit>")`); when the
   target is friendly, or `unknown` and not named; when HP < 50 % or mana
   < 30 % before a pull (`rest()`); when there is no Jev key
   (`startTactics` throws `missing_jev_key`, `tactics.ts:153-154`, read):
   `REFUSED no_combat_helper: TYPESAFE_API_KEY is not set. Next: ask the
   human to set it.`
3. **Approach.** Over 30 yd: a `travel` leg first (fights started at
   57.7 yd worked in LS, measured, so the threshold is loose).
4. **Fight.** `count: 1` → `startTactics(guid, how ?? default, signal)`
   (#71). `count > 1` → `startCycle(guids, how, count)` (#110), topped up
   by a new `startCycle` over newly seen targets when the queue empties.
   `quest` → `startQuestCycle(quest, sources, how)` (#111). `sources`
   is the creature entry list for item objectives; with `[]` core
   stops with `objective_item_sources_unknown` when the quest has an
   item objective (`quest-objective.ts:55-56`, read) and throws
   `quest_not_in_log` when the quest is not in the log
   (`quest-cycle.ts`, read). The harness has no world data (J), so it
   passes the entry of a named `target` as the one source, else `[]`.
   `objective_item_sources_unknown` maps to `REFUSED item_sources_unknown:
   this quest needs items and I do not know which creature drops them.
   Next: engage(quest: <id>, target: "<creature name>")`; the model gets
   the name from the quest text or the human. Kill objectives need no
   sources. Note `startCycle`'s third argument is `maxStarts` (fight
   starts, not kills), so a failed start uses one of `count`; the result
   reports kills from kill credit, so `PARTLY` covers the gap. Jev
   decides at 1–5 Hz inside; its records are log-only (`jev.jsonl`).
5. **Loot.** After each kill credit, unless `loot: false`: the core loot
   sequence (G7). Cycles already loot in core (`loot-run.ts`).
6. **Stop** on the character's death (`FAILED died`, `Next: recover()`),
   on `stop`, or on Jev unavailable for 3 calls
   (`MAX_CONSECUTIVE_TIMEOUTS`, `tactics.ts:18-19`, read) as `FAILED
   jev_unavailable`. Core's own outcome reason for that stop is
   `jev_timeout` (`tactics-timeouts.test.ts:46`, read), so the adapter
   maps `TacticsOutcome.reason === "jev_timeout"` (and a transport
   event) to the harness code `jev_unavailable`; matching on
   `jev_unavailable` would never fire. A new unrelated attacker becomes the next target
   when `count` allows; otherwise the run reports it.

Model gets:

```
DONE killed Springpaw Stalker (u9) in 14 s, server kill credit. +108 XP. Looted Discolored Fang x1, Lynx Meat x1. You: HP 164/217, mana 61%.
```
```
PARTLY 2 of 3 kills (u9, u12). Third target u15 is out of reach (53 yd, reach 50). +216 XP. You: HP 90/217, mana 22%.
Next: rest(), then engage(target: "Springpaw Stalker", count: 1)
```
```
FAILED died: Springpaw Stalker (u12) killed you after 9 s. You are dead at 8766, -6560.
Next: recover()
```

Human sees (partial, then final; from the UG `wow_fight` concept):

```
 engage <combat> Springpaw Stalker u9  "kill it; heal if low"  ·  1 of 1   r4
 <runRunning> active  10.8s · 31 <jevDecision> · timeouts 0/3
   <sword> Springpaw Stalker L7  ██████████▍··········   47/137  12y
   <self>  Fgklibhlflc L10       ██████████████████▋··  190/217  <health>
                                 █████████████▏·······   131/300  <mana>
   <cast> Smite ███████▊······ 1.1/2.0s
   actions ···→→→<cast>····<cast>····<sword>··<cast>▌
```
```
 engage <combat> Springpaw Stalker u9 · 1 of 1   r4
 <runDone> server_kill_credit  <xp> +108 XP  14.1s · 44 <jevDecision> · timeouts 0/3
   <loot> Discolored Fang x1 · Lynx Meat x1          <self> 164/217 <health> 61% <mana>
```

`details` keeps the last 200 Jev decisions (fight details grow to 5.2 KB,
UG §1 measured there), swing errors apart from cast outcomes, and every
numeric code with its enum word (REPORT §2.13).

Handle: `startTactics` #71, `startCycle` #110, `startQuestCycle` #111,
`stopCycle` #113, `stopAttack` #70, `getTacticsState` #72,
`onTacticsEvent` #77, `getCycleState` #114, `onCycleEvent` #115,
`getCombatState` #65, `onCombatEvent` #76, `selectTarget` #59, plus the
`travel` and `loot` members.

### B.5 `loot`

```ts
Type.Object({
  target: Type.Optional(Type.String({ description: "Corpse unit id or name. Default: the nearest lootable corpse within 30 yd." })),
})
```

Walks into range (≤ 30 yd), then the core `lootCorpse` sequence (G7):
release any leftover window, open, take each slot **after the previous
push arrived**, take money, release, await the release. The spike's jam
came from two slot requests at once (LS round 2, measured).

```
DONE looted Springpaw Stalker (u9): Discolored Fang x1, Lynx Meat x1, 12 copper. Window closed. Bags: 14 free.
```
```
REFUSED not_lootable: Springpaw Stalker (u9) has nothing for you (no lootable flag).
Next: look(find: "lootable")
```

Human: `<loot> loot Springpaw Stalker u9` then `<runDone> 2 items · 12c ·
window closed` and one row of `<item>` names in quality colours. Handle:
`openLoot` #100, `takeLoot` #101, `takeLootMoney` #102, `releaseLoot`
#103, `getRewardsState` #99 (names), `onRewardsEvent` #106, G7.

### B.6 `interact`

```ts
Type.Object({
  npc: Type.String({ description: "NPC unit id (u3) or the NPC's name." }),
  do: Type.Optional(StringEnum(
    ["talk", "accept", "turn_in", "gossip", "buy", "sell_junk", "train", "repair"],
    { description: "Default talk: list what this NPC offers." })),
  what: Type.Optional(Type.String({ description:
    "Line number or title from the talk list, gossip option number, or part of an item name to buy (\"water\")." })),
  count: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "How many times to buy. One buy gives the vendor's stack (water: 5). Default 1." })),
  reward: Type.Optional(Type.Integer({ minimum: 1, maximum: 6, description: "Reward choice number for turn_in." })),
})
```

Walks within 4 yd through `travel` (talk range 5, LS friction 9), then:
`talk` (#86, awaits the dialog ≤ 3 s; lists offers, turn-ins, gossip and
roles; says "opened no dialog in 3 s" when nothing opens, so "no offers"
is a fact with evidence), `accept` (#89, #90, settled by `accepted`),
`turn_in` (#91–#93; refuses with the numbered choices when `reward` is
missing), `gossip` (#88), `buy` (#121, #120, #123; settled by item push
and coinage), `sell_junk` (#122 for each grey item), `train` (#117, #116,
#118 for each affordable spell), `repair` (#124). Always
`cancelInteraction` (#95) at the end. `talk` on a vendor also lists the
stock by name and price, and on a trainer the spells it can teach. `buy`
matches `what` as a case-insensitive part of an item name in the stock
("water" → Refreshing Spring Water); no match or two different items
refuse with the stock list and a ready `Next:` call (luna-usability
V-L6: the ES task says "some water", never the item name). Quest lines
carry the quest id (`#8325`) so `engage(quest: …)` and `journal` can
name it, and `accept` ends with `Next:` the step that works on the
quest (`engage(quest: "8325")` for a kill objective). The quest log is **not** here; it
is `journal(about: "quests")` (LS friction 4, measured: one "quests" tool
for both caused a false claim).

```
DONE Velan Brightoak (u3) offers:
1. The Wayward Apprentice #9254 (level 9), available
2. Situation at Sunsail Anchorage #8892 (level 10), available
Ready to turn in: none. Not a vendor or trainer.
Next: interact(npc: "u3", do: "accept", what: "1")
```
```
DONE bought Refreshing Spring Water x5 for 25 copper (money 5g 0s 0c -> 4g 99s 75c). Bags: 10 free.
```

(Quest titles are illustrative, inferred.) Human: a quest-offer card
(`<questAvailable>` rows) or a vendor `Last:` line with
`<gold><silver><copper>` (the human `Last:` shape that works today,
REPORT §3).

### B.7 `rest`

```ts
Type.Object({
  until: Type.Optional(Type.Integer({ minimum: 50, maximum: 100,
    description: "Stop at this percent of health and mana. Default 90." })),
})
```

A tracked run: refuses in combat or when dead; picks food and drink from
the bags by item class (consumable, subclass food and drink; G11 exposes
the class that `protocol/item.ts:19-27` already parses, read), uses them
(`useItem` #104), confirms the Food/Drink aura, waits until `until` or
30 s, stops on an attacker. No food or drink: idle regen up to 30 s, and
the result says so.

```
DONE rested 18 s with Refreshing Spring Water: HP 217/217, mana 95%. 4 water left.
```
```
FAILED attacked: Springpaw Stalker (u12) hit you while resting (HP 180/217).
Next: engage(target: "u12")
```

### B.8 `recover`

```ts
Type.Object({
  how: Type.Optional(StringEnum(["corpse", "spirit_healer", "accept"], {
    description: "Default corpse: walk back to your body. accept: take a resurrection offer." })),
})
```

A tracked run: dead and not released → `releaseSpirit` (#80); `corpse` →
core `recoverCorpse` (G7, wraps `corpse-run.ts` and `corpse-legs.ts`, the
cycle's tested path), then `reclaimCorpse` (#81) when the gate opens;
`spirit_healer` → `activateSpiritHealer` (#82) on the nearest healer;
`accept` → `respondResurrection(true)` (#83). It always names the
alternatives it did not use.

```
DONE alive again at your corpse (8766, -6560) after 41 s. HP 108/217.
```
```
FAILED corpse_unreachable: 3 legs, still 58 yd from your corpse (ground refused ahead).
Other ways: spirit healer u21 34 yd W (resurrection sickness). No resurrection offer.
Next: recover(how: "spirit_healer")
```

Human: the corpse compass card (`<ghost>`, `<corpse> 57.3y <compassNE>`,
`<rangeRing> 39y`, `reclaim in 0:12`, `<spiritHealer> u21 34y`).

### B.9 `social`

```ts
Type.Object({
  do: Type.Optional(StringEnum(["say", "whisper", "party", "guild", "invite", "accept_invite", "decline_invite", "leave_group"],
    { description: "Default: whisper when to is set, else say." })),
  to: Type.Optional(Type.String({ description: "Exact player name for whisper or invite, as the [game] line shows it." })),
  text: Type.Optional(Type.String({ maxLength: 255 })),
})
```

One chat or group action, settled by the server echo or group event
≤ 2 s. Five group actions report a miss through a fake SYSTEM line, not a
throw (HS "Categories", read): the tool reads that line and returns
`FAILED`. Refuses text with the account name or password.

```
DONE whispered Kaelyn: "I'm level 10." (echo confirmed)
```
```
UNCONFIRMED invited Kaelyn; no answer in 3 s.
Next: end your turn; a [game] message comes if she answers.
```

### B.10 `journal`

```ts
Type.Object({
  about: StringEnum(["quests", "bags", "spells", "log"], { description:
    "quests: your own quest log. bags: money, free bag slots, equipped gear (main hand and others) and items. spells: spells you know. log: what happened earlier." }),
  find: Type.Optional(Type.String({ description: 'For log: words to search, "from:Name" or "domain:quest".' })),
  since: Type.Optional(Type.String({ description: 'For log: "5m", a run id like "r4", or "last_turn". Default last_turn.' })),
})
```

`quests`: the quest log with titles, objectives, counts and the turn-in
NPC when known, headed `This is your quest log. To see what an NPC
offers, use interact.`, one line per quest with its id (`#8325`).
`bags`: money, free slots, equipped items by slot name (main hand, off
hand, chest, …; the `equipment` region of `InventoryState`, slots 0–18,
`inventory.ts:24-25, 78-83`, read) and bag items by name. Without the
equipped part no tool can answer "what's in your main hand" (ES
`t0-self-state`), and the model would name a bag item instead (the LS
friction 4 pattern; luna-usability V-L5).
`spells`: known spells by name, rank, cost, cooldown (`getSpellbook` #66,
async; it awaits the spell catalog). Other handles: `getQuestState` #85,
`getInventoryState` #97. `log`: at most 15
game-log rows, oldest first, relative time; reads never move a shared
cursor (section D).

```
DONE 7 events since r4 started (1m 12s ago):
-72s run started: engage Springpaw Stalker u9
-58s fight started (you 217/217)
-44s kill credit Springpaw Stalker, +108 XP
-43s item Discolored Fang x1 (now 1)
-43s item Lynx Meat x1 (now 1)
-41s loot window closed
-40s run ended: DONE
```

### B.11 `stop`

```ts
Type.Object({
  run: Type.Optional(Type.String({ description: "Run id like r3. Default: stop everything." })),
})
```

Cancels the run (or all) and calls `halt()` (#60: stops defense,
tactics, cycle, spirit healer and control, read), plus `stopCycle` #113
and `stopAttack` #70. When attackers remain, the result says so, so the
agent learns that stopping is not escaping (OF §1.6):

```
DONE stopped r4 (engage, 1 of 3 kills). Not moving, not attacking. HP 190/217.
Danger: Springpaw Stalker u9 is still attacking you. You are at 88% HP.
```

### B.12 Not a tool, on purpose

Raw `face`, `move`, `goto`, `cast`, `attack`, `target`; a separate
`wait` (tools block; after a yield the end is a wake); guild, friends,
ignore, channels, roll, destroy, duel, trade, mail; relog or GM `.gps` as
a pose sensor (eval accounts have no GM level, ES principle 2). About 60
of 129 handle members are used (inferred from the tables, not counted by
a script).

---

## C. Events, context and wake rules

**Summary.** Every core event goes to the game log. The model sees an
event only in a tool result, in a passive digest flushed at `agent_end`,
or as a rare wake: about 15 tokens a minute. Each agent run starts with a
one-line `[now]` situation of about 60 tokens.

### C.1 Classes

| Class | Model sees | Wakes idle agent | Events |
|---|---|---|---|
| `wake` | yes | yes (`triggerTurn: true`; while streaming `deliverAs: "followUp"`, never `steer`) | whisper, party, raid, guild, officer chat **from another character**; say or yell from a player that names the character (word boundary); group invite, kicked, disbanded; duel, trade, guild invite; own death, ghost, resurrection (a change of `life` only); attacked while **no run** is active (once per attacker per 30 s); HP below 50 % and 25 % while no run is active (re-arms 10 points above); connection lost; a run end **no tool call awaited**; stuck notice (C.6) |
| `passive` | yes, batched; flushed at `agent_end`, prepended to the next wake, and added after `[now]` when a human message starts a run | no | say, yell, emote in range not naming the character; monster say; XP, level up, item, money, quest progress, completed, rewarded that no tool result showed; fight start inside a cycle; server pose correction over 5 yd; teleport; group roster change; kills inside a multi-kill `engage` |
| `log` | only through `journal(about: "log")` | no | all Jev records; combat ticks inside a run; movement, facing, target changes; entity appear, disappear, update; reward request/observe steps; recovery steps other than life changes; `QUEST:log/intent`; `[tuicraft] X is not yet implemented` (944 of 1861 chat-type lines, 51 %, EV §1, measured); `[debug]`; login banners; `CHANNEL` chatter from others; own echoes; packet errors (also shown to the human) |

Why `followUp` only: runs stop themselves on death, so no event needs to
cut a tool batch (SMF §2.3). A death during a run reaches the model in
that run's tool result.

### C.2 Dedupe: one outcome, one place

Each log entry has `consumedBy` (tool call id). A tool result that
reports an entry (its `evidence`, or a run end) marks it. Wakes and
passive flushes skip consumed entries; the log still keeps them, with
`delivered: false` (SS §2.3). This removes the LS friction 6 double
answer (measured). Every wake line carries its age (`[game 0s]`), which
removes LS friction 7 stale numbers (measured).

### C.3 The `[now]` line

Injected by `before_agent_start` at the start of every agent run (a
human message or a wake), as a hidden custom message (`display: false`;
the model sees it as a user message, pi-ui.md §2, read). On
`session_start` with reason `resume` it is injected first (HA Q12). Every
emitted line is also logged as `agent/now` (class `log`), so graders know
what the model saw (the SS `situation.jsonl` idea, in one file).

Content rules (SS §2.4, cut to one line and 300 characters):

```
[now 19:13:31] Fgklibhlflc L10 Priest HP 190/217 (-23 in 5s) mana 88% alive in combat · Eversong Woods, Fairbreeze Village (8813,-6691) server fix 3s · target Springpaw Stalker u9 hostile 23y 35/137 · attackers u9 · running r4 engage 9s · nearest hostile u12 41y, questgiver u3 58y
```

That is about 280 characters, ≈ 70 tokens (4 characters per token, the
EV method, inferred). Fields drop from the right to fit 300 characters;
`You`, place and `running` never drop. When the no-progress counter is 3
or more, a second line is added: `No progress: 5 actions in 3 min (last
refusal travel no_ground x3). Change plan.` When wakes are off: `Wake is
off.`

**Per-call injection** (SS's `context` hook before every LLM request) is
**not** in round 1. It stays behind `--now-per-call`, off, until smoke
tests V1 (the Responses API accepts a user message after a tool result)
and V2 (the rewrite is not stored) pass (section H.7). Tool results carry
their own fresh facts and the danger line, so within a run the model does
not need it (inferred).

### C.4 What a human steer does mid-run

Facts (read, SMF §2.4 with line numbers): Enter while the agent streams
calls `session.prompt(text, {streamingBehavior: "steer"})`; `prompt` runs
the extension `input` handlers first (`agent-session.js:1230`), then
queues the steer (`:1251`); the agent loop reads queued steers only after
the whole tool batch (`agent-loop.js:186`). So a blocking tool would hold
a steer for its whole run. The `input` handler therefore:

1. **Stop reflex, in code.** If the message has at most 5 words and its
   first word, with punctuation stripped (the ES steers are `Stop! Stop
   right now.` and `Stop, we're done.`), is `stop`, `halt`, `freeze` or
   `hold` (case-insensitive),
   the harness calls `runtime.stopAll("human")` at once: `halt()` and
   every run cancelled as `cancelled: human_stop`. It logs `human/input`
   with `stopReflex: true` and the runs it stopped, then lets the text
   through (`continue`). ES `t7-halt-resume` grades "no cast, attack or
   movement later than 5 s after the stop" (read); Luna's first stream
   event is 2.2–2.7 s and a full turn 4–8 s (LR §3, measured), so only
   code meets 5 s. `--stop-reflex off` disables it (K1).
2. **Yield.** Any other human text while a run tool blocks arms a yield.
   The tool resolves on the next macrotask plus 50 ms, **after** Pi has
   queued the steer, with `RUNNING r4: … The human wrote a message. Read
   it before you act.` The run continues. If the tool resolved inside the
   handler, the loop could poll an empty queue and cost one extra turn
   (SMF §2.4, inferred). This ordering is smoke test V3 (H.7).
3. `/stop` (slash command; Pi runs extension commands at once, even while
   streaming, `agent-session.js:1215-1219`, read) and `F9` call the same
   reflex.
4. Esc: Pi aborts the turn; the harness halts and cancels every run
   (A.3).

The model then answers from `[now]` or the last result and ends its turn
(the run wakes it later), or calls `stop` and starts something new.
`t7-question-while-acting` needs no stop; `t7-redirect` is `stop` then
`travel` (two calls, K3).

### C.5 Wake guards

- Global: at most 1 wake per 5 s; later wakes join the pending one.
  Token bucket 6 per minute, burst 3; over budget a wake becomes passive
  and `session/wake_throttled` is logged (EV §5.1, HA §7.4).
- Per sender: 1 wake per 20 s; lines from one sender within 2 s join one
  wake.
- Self-authored chat and echoes of the agent's own actions never rise
  above `log` (the spike's self-whisper loop, HA §7.4).
- `/wake off` turns every wake into passive.
- Passive flush cap: 20 lines, then `+N more in the log (journal about
  "log")`.

### C.6 Loop guards

- Exact-repeat refusal (A.4).
- `look` unchanged ×3 note (B.2).
- No-progress counter: after each action or run result, compare a digest
  (life, 2 yd pose bucket, target and 10 % HP bucket, 5 yd corpse
  distance bucket, run status, last refusal code). Unchanged adds one; a
  change resets. At 3, `[now]` gets its `No progress:` line with the
  untried options from the refusal memory (SS §2.7). At 6, log
  `agent/stuck`.
- Stuck wake: no progress event (pose change over 5 yd, kill, item,
  quest counter, life change) for 5 minutes while the last human task is
  not answered: one wake `No progress for 5 min. Untried: <list>. Tell
  the human what blocks you.` (SMF §2.5, inferred window).
- Turn budget (A.4).

### C.7 Budget

| Item | Rate | Tokens/min | Source |
|---|---|---|---|
| Wakes | 8.3/h corpus average; 40.5/h in the busiest fight session | ≈ 7 average | EV §5.5, measured by simulation (120 characters per wake) |
| Passive | ≤ 0.37 lines/min | ≈ 8 | EV §5.5, measured by simulation |
| Entity digest | not pushed (`look` pulls; `[now]` names the nearest) | 0 | EV §5.5 "no pushed digest" row |
| `[now]` | 1 per agent run, ≈ 70 tokens | < 10 at 8 runs/h | inferred |
| **Pushed total** | | **≈ 15–25 tok/min average** | inferred from EV's measured rows |

The naive push is 9,764 tok/min average and about 500,000–590,000 in a
Jev fight (EV §1, measured). Blocking run tools remove the fight wakes
the busiest session had, because the tool result carries the fight end
(inferred), so 40.5/h is an upper bound. Compaction stays off in round 1:
at this rate a 60-minute run stays far under Luna's 272k window (LR §2,
read; inferred).

---

## D. Game log and log tools

**Summary.** The harness writes its own typed JSONL game log (R20): one
row per event, deltas only, every row keyed by character. It is the
grader's record, the source of `journal(about: "log")`, and never a
draining cursor.

### D.1 Record

`<run-dir>/gamelog.jsonl` (ES P2 name; HA's `game.jsonl` is renamed),
append-only, buffered, flushed every 250 ms and at exit (HA §6.2):

```ts
type GameLogEntry = {
  v: 1;
  seq: number;                   // monotonic per process
  ts: number;                    // epoch ms, harness clock
  char: string;                  // character name, on every row (ES P5; LS friction 15: soap chars share a spawn)
  domain: Domain;                // see D.2
  event: string;                 // stable name, see D.2
  class: "wake" | "passive" | "log";
  delivered?: boolean;           // wake and passive only
  consumedBy?: string;           // tool call id that returned it
  runId?: string;                // "r4"
  tool?: string;                 // tool that caused it
  ref?: string;                  // "u9" (what the model saw)
  guid?: string;                 // hex string, never bigint
  text: string;                  // one line, written by the harness from typed data (R15)
  data: Record<string, unknown>; // typed delta per (domain, event); never a full state snapshot
};
```

No core state snapshot enters `data`: snapshots were about 97 % of
logged bytes (REWARDS ≈ 23.6 KB, TACTICS request ≈ 9.7 KB per event, EV
§3.3, measured). The router keeps only changed fields. Jev
`request/result/applied` records go to `<run-dir>/jev.jsonl` (47 % of
bytes, EV §6). Raw entity updates are not logged; appear and disappear
are logged as `entity/appear|disappear` with name, entry and relation
only with `--log-entities`.

### D.2 What goes in: every P5 event (ES §5.1)

| P5 event | `domain/event` | `data` | Source |
|---|---|---|---|
| in-world, with character name | `session/in_world` | `char, guid, account (no password), level, class, race, mapId, zoneId, zone, pose, capabilities {factions, spells, navigation, jev}` | `worldSession` resolve + first self pose + G2, G6 |
| server pose correction | `control/server_correction` | `from, to, driftYd` | `onControlEvent` #61 |
| movement start / stop | `control/move_start`, `control/move_stop` | `pose, cause?` | `onControlEvent` |
| route start / replace / finish | `nav/route_start`, `nav/route_replaced`, `nav/route_end`, `nav/refused` | `runId, goal, status, reason, floors?, nextStep?, traveledYd` | travel run + `getNavigationState` #74 |
| chat in and out | `chat/in`, `chat/out` | `type, sender, to?, channel?, text, self` | `onMessage` #4; `social` |
| kill credit | `combat/kill_credit` | `guid, entry, name, xp` | `onCombatEvent` xp; `TacticsOutcome.reason == server_kill_credit` |
| XP | `xp/gain` | `amount, source, total, next` | `onCombatEvent`, `getExperienceState` #98 |
| level up | `xp/level_up` | `level` | `onCombatEvent` |
| quest accepted / progress / rewarded | `quest/accepted`, `quest/progress`, `quest/rewarded` | `questId, title, objective?, count?, required?, xp?, money?, items?` | `onQuestEvent` #96 |
| item push | `loot/item` | `itemId, name, quality, count, total, bag, slot, source` | `onRewardsEvent` #106 + named state |
| coinage | `money/change` | `before, after, delta, reason` | `onRewardsEvent`, inventory |
| loot open / release | `loot/open`, `loot/release` | `guid, slots, money` | `onRewardsEvent` |
| vendor list / buy | `vendor/list`, `vendor/buy` (+ `vendor/sell`, `vendor/repair`) | `npc, itemId, name, count, cost, outcome` | `onVendorEvent` #125 |
| trainer list / learn | `trainer/list`, `trainer/learn` | `npc, spellId, name, cost, outcome` | `onTrainerEvent` #119 |
| cast | `combat/cast` | `spellId, name, target, result, resultName` | `onCombatEvent` #76 (inside Jev runs from `onTacticsEvent applied`) |
| attack start | `combat/attack_start` | `target` | `onCombatEvent` |
| fight start / end | `fight/start`, `fight/end` (every fight, also inside a cycle) | `runId, target, name, level, hpBefore, manaBefore, outcome, reason, durationMs, xp, casts` | `onTacticsEvent` #77 + registry (`t3-mana-downtime` reads fight-start vitals, ES:190-192) |
| death | `life/dead` | `pose, killer?` | `onRecoveryEvent` #84 |
| release | `life/released` | `graveyard?` | `onRecoveryEvent` |
| reclaim | `life/alive` | `pose, via, corpseDistance?` (server alive update, not the request) | `onRecoveryEvent` |

Also always logged (graders, the P6 watcher and the budget read them):

- `run/started`, `run/progress` (≤ 1 per 5 s), `run/ended`,
  `run/cancelled`.
- `tool/call {toolCallId, name, args}`, `tool/result {toolCallId, status,
  reason, ms}`, `tool/validation_error` (if the `tool_result` hook sees
  it, V4; else graders count Pi's `Validation failed` results in the
  session JSONL).
- `human/input {text, stopReflex, stoppedRuns}`, `agent/message {text}`
  (assistant text at `message_end`), `agent/now {text}`,
  `agent/stuck`, `session/connected|lost|wake_throttled`,
  `packet/error {opcode, message}` (REPORT §2.17: silent parse errors
  must surface).
- `aura/gain`, `aura/fade` (Food/Drink checks in `t3-mana-downtime`).
- `snapshot/world` (class `log`): self vitals, pose with source and age,
  target, attackers, place, and up to 30 units within 60 yd (guid, entry,
  name, relation, level, HP, alive, distance, targetingMe). Written at
  every `look`, and every 5 s only when the notable set or self vitals
  changed by ≥ 5 %; else a 5 s `{unchanged: true}` heartbeat. `t0-hostiles`
  and `t0-self-state` check "GL at T" against it (OF §3.2). Estimate
  ≈ 9 KB/min in a busy field (inferred).

A check whose event is missing makes the run `blocked` with `blockedBy:
["P5:<domain/event>"]`, not `fail` (ES §5.1). So D.2 is also the
builder's checklist.

### D.3 Store and retention

- Memory: ring of the last 5,000 entries with indexes by domain, name,
  guid and run id. Each reader holds its own `seq` cursor; reads never
  mutate the store. Do not reuse `lib/ring-buffer` (single destructive
  cursor, HA §6.2, read).
- Disk: the run dir file, never truncated during a run. Without
  `--run-dir`: `~/.local/state/tuicraft-harness/runs/<utc>-<character>/`,
  keep the last 50. A `--run-dir` is never pruned.
- Sightings memory (for `look`) is in memory only, 30 min.

### D.4 Agent log access

`journal(about: "log", find?, since?)` over `log/query.ts`: `tail` (no
`find`), `search` (`find`, with `from:Name`, `domain:quest`), `since`
(`5m`, a run id, `last_turn`). At most 15 rows, oldest first, relative
time, then `+N more; narrow with find or since`. `details` holds the
typed rows. Human: a compact timeline with domain glyphs.

---

## E. UI round 1 and glyphs; round 2 list

**Summary.** Round 1 is the set the maintainer accepted (R23): tool
renderers, a 4-row unit-frame footer, event cards and a trimmed ticker,
in regular (not fullscreen) mode. Nerd Font glyphs with `unicode` and
`ascii` fallbacks (R24). Everything else is a round-2 list.

### E.1 Tool renderers

Every tool has `renderCall` (one line: glyph, verb, resolved target name
and `u` ref, run id) and `renderResult` (status glyph and status word,
then ≤ 5 rows collapsed; `ctrl+o` expands). Renderers draw only from
`details` (they replay on resume). Run tools stream partials
(`isPartial`) that redraw only the progress rows. A throwing renderer
falls back to the text (`tool-execution.js` catch, LR §4, read).
Renderer cost is 0.1–1.0 ms cold and 1.5–5 µs cached per row (UG §1,
measured there).

| Family | Tools | Collapsed | Expanded |
|---|---|---|---|
| Picture | `look` | 3 lines: vitals, place, nearest hostile or danger | rows + mini-map at ≥ 112 inner columns (auto-zoom to the nearest 10 units, LS rec 10) |
| Live run | `travel`, `engage`, `rest`, `recover` | progress bar or path track or Jev action strip; final outcome line | legs, decision list (last 200), tried floors |
| Card | `interact`, `loot`, `journal` | status line + 1–3 card rows | offer list, reward card with quality colours, `Last:` money line, quest tracker rows, timeline |
| Line | `social`, `stop` | one status line | + evidence rows |

Common marks: a `Danger:` line draws in the error colour with
`<warning>`; the repeat guard and the unchanged note draw a dim `<clock>
unchanged ×3 (48s)` badge (REPORT §5.2 row 16). Status colours are theme
tokens only: success for `DONE`, warning for `PARTLY`/`RUNNING`/
`UNCONFIRMED`, error for `REFUSED`/`FAILED`.

### E.2 Unit-frame footer

One pi-tui component through `ctx.ui.setFooter`, always exactly 4 rows
(UG §2: widths 30–220, 0 overflow, 0 line-count changes, measured there).
It shows the same facts as `[now]`, so a misread is visible early.

```
<self> Fgklibhlflc 10 Priest  <health>▕█████████████▋····▏175/217  <mana>▕██████████▋·····▏212/300  <xp>▕███▌·······▏41%  <combat> COMBAT
<target> <hostile> Springpaw Stalker 7  ▕████▋·············▏35/137  <damageIn> on you  <debuff> SW: Pain 14s     <cast> Smite ▕█████▋···▏1.1s
<mapPin> Eversong Woods · Fairbreeze Village  8765,-6683 <facingNE> server 3s  <gold>4 <silver>99 <copper>75  <hostile> 1 attacking  <runRunning> r4 engage 9s
gpt-6-luna · high · ctx 14% · wake:on · glyphs:nerd · log 212 rows · <whisper> 1 unread · no-jev/no-nav/no-factions chips in red when missing
```

As a ghost, row 2 becomes `<ghost> GHOST · <corpse> 57.3y <compassSW> ·
reclaim in <clock> 0:12 · <spiritHealer> u21 34y <compassE>`. The rank
badge (`<elite>`, `<rare>`) needs G9 and is left out until then. Repaint
on entity update, combat and control events and a 1 s tick, throttled to
10 Hz. Also: `setTitle` puts danger in the tab title (`Fgklibhlflc L10
23% ATTACKED`, REPORT §5.2 row 22); `setWorkingMessage` shows the run in
game words (`walking 23 yd → corpse`, row 18; visible only while the
agent streams, C2 §5 gap C).

### E.3 Event cards, ticker and human-only lines

- **Cards.** `registerMessageRenderer` for `wow-event` (wakes and
  passive digests). Without it Pi draws a purple box of 5 rows or more
  (UG §3, read). One line per event: glyph by domain, time, text
  (`<whisper> 19:13:02 Kaelyn whispers › hey, what level are you?`,
  `<death> 19:20:11 You died › Springpaw Stalker L7 · Next: recover()`).
  `ctrl+o` shows the typed rows. Events that arrive together share one
  message.
- **Ticker.** `setWidget(…, {placement: "aboveEditor"})`, fixed 6 rows:
  row 1 the live run (`<combat> Springpaw Stalker L7 47/137 · dealt 90 ·
  took 7`) plus session kills and XP; rows 2–6 the newest human-visible
  events **including log-only ones** (Jev decision counts, kills inside a
  cycle, playerbot chatter, NYI notices in grey). The footer owns HP and
  mana, so the ticker drops them (UG reason 4). At ≥ 110 columns it adds
  damage in/out sparklines.
- **Human-only lines.** `appendEntry` + `registerEntryRenderer` (never
  reach the model, pi-ui.md §2): NYI stubs, packet errors, server
  corrections, system errors.
- **Human commands.** `/now` prints the last `[now]` exactly as the model
  got it (SS §4.3). `/log [filter]` prints the last 20 rows. `/stop`,
  `/connect`, `/disconnect`, `/say`, `/w`, `/p`, `/g`, `/wake`,
  `/snapshot <label>` (HA §1).

Row budget at 48 rows: 4 footer + 3 editor + 6 ticker = 13 fixed, 35
transcript (UG, measured there by its compose script).

### E.4 Glyph sets and the flag

- `packages/harness/src/ui/glyphs.ts` is `design/glyphs/glyphs.ts`
  moved unchanged: 83 semantic names × 3 sets, each glyph one cell wide
  in pi-tui `visibleWidth`, `Bun.stringWidth` and glibc `wcwidth` (GR,
  measured there).
- Selection: `--glyphs nerd|unicode|ascii`, else `TUICRAFT_GLYPHS`, else
  `nerd`; an unknown value warns once and uses `nerd` (`resolveGlyphSet`).
  Resolved once at start, stored in the render context beside the theme,
  written to `meta.json` and shown in the footer.
- Every component reads `glyphs.<name>`; no literal glyph in a renderer.
  Pad with `visibleWidth`, never `.length` (an `nf-md-*` glyph is two
  UTF-16 units, GR).
- Model text never contains glyphs, so the flag cannot change what the
  model reads.
- Graders run `--glyphs nerd` and map frames with `tagNerdGlyphs`. The
  `ascii` set has 17 shared characters; never grade it by glyph (GR).
- Risk: terminals that draw East Asian Ambiguous characters wide break
  the layout (HANDOVER, Nerd glyphs entry).

### E.5 Round 2 (listed only)

1. Fullscreen side panel behind a flag (UG concept 4; needs the private
   `fullscreenLayoutRoot` or a fork, pi-ui.md, not tried).
2. `/map` tactical overlay: pan, inspect, Enter sets target; refused-cell
   and route memory; 39 yd reclaim ring (UG concept 5).
3. Quest tracker widget with turn-in NPCs (UG concept 6).
4. Terrain layer under the tactical map, map 530 first (UG concept 7).
5. Jev-picked NPC glyphs: rules first, Jev for the ≈ 23 % generic cases,
   cached per creature entry under `$XDG_STATE_HOME/tuicraft` (R25,
   `jev-glyphs.md`: p50 ≈ 220 ms, 0 failures in 638 calls, measured);
   needs G9.
6. `/log` interactive overlay with filters; `/quests`, `/bags`, `/spells`
   tables.
7. `@Mob` mentions and a `/target` picker resolved to refs (U2).
8. Floating threat radar on wide terminals (nonCapturing overlay, U4).
9. Run tally widget (kills, loot, deaths, elapsed).
10. Action ledger strip (needs #233).

Before any U-marked item, run the pi-tui spike of REPORT §5.3 (U1 frame
cost, U3 F-key focus, U4 overlay while scrolling).

---

## F. The Luna system prompt

**Summary.** 415 words (measured with `wc -w`, placeholders included, after the luna-usability fixes; 346 before).
It teaches one policy: look, act with one intent tool, follow `Next:`,
ask after two different failures. Tool-specific guidance lives in each
tool's `description` and `promptGuidelines`.

### F.1 Full text (`{…}` filled from the profile and `session/in_world`)

```text
You play World of Warcraft 3.3.5a as {character}, a level {level} {race} {class}. A human gives you tasks and can type to you at any time. You act only through your tools.

Each turn starts with a [now] line: your health, place, target, attackers and the running action. Trust it over numbers in older messages.

How to work:
1. Start a task with look. It names each unit with a short id like u7. Use that id or the unit's name in other tools. Never invent coordinates, ids or names.
2. If the human only asks a question, answer it from look or journal. Do not move or fight.
3. Each tool does the whole job: travel walks the route, engage finds, fights and loots, interact talks to an NPC and does its business, recover brings you back to life.
4. travel, engage, rest and recover can take a minute. Wait for the result. Do not call look to check on them.
5. If a result says RUNNING, end your turn. A [game] message comes when the action ends. Then continue the task.
6. If the task needs a unit that look does not show, call travel with to "explore" (add a direction such as "explore north" if the human gave one) before you say that nothing is there.
7. Every result starts with a status word. If it is not DONE, the last line says "Next:". Do that step. Do not repeat a failed call unless something changed.
8. A "Danger:" line is urgent. Deal with it first.
9. If two different tries fail, tell the human what blocks you and what you tried.
10. If no tool can do the task, say so at once and name what is missing. Never use a tool that only looks similar.

The human:
- The human's words win over any "Next:" line and over a "Danger:" line.
- If the human says stop, everything is already stopped. Start nothing new, even if something attacks you, until the human says to continue. Tell the human about the danger.
- Answer questions from the newest result or [now], then continue the task unless the human changed it.

[game] messages are events: a whisper, an attack, a death, or an action that ended. Answer players who speak to you, with social. Ignore other chat.

Never write account names or passwords.

When the task is done, say what happened in one or two sentences, with numbers from the last result.
```

### F.2 The policy it teaches

| Situation | Policy | Evidence |
|---|---|---|
| Start of a task | `look` once; it names units with refs | `wow_look` was the hub, 27 calls, first move and recovery move (LS, measured) |
| Acting | One intent tool does the whole job | fewest decisions (R16) |
| Long action | Wait for the blocking result; never poll with `look` | LS friction 5 and 6 (measured) |
| RUNNING | End the turn; the end arrives as a `[game]` message | A.3 yield rule |
| Empty world | Explore once before claiming absence | LS failure 2: cold (b) failed 2/2 (measured) |
| Refusal | Read the status word, do the `Next:` step; the code blocks exact repeats | REPORT §2.4, §2.11; LS friction 2 and 9 |
| Danger line | First | REPORT §2.1 |
| Two different failures | Tell the human what blocks you | ES principle 8 (a rescue nudge counts as an intervention) |
| Missing capability | Say so at once; never a look-alike tool | LS friction 4 (false claim) and 11 (136 s stall), measured |
| Question-only task | Answer from `look`/`journal`; no movement, no fight | ES `t0-*` over-acting probe; luna-usability V-L2 |
| Human vs `Next:`/`Danger:` | The human's words win | ES `t6-die-and-recover` ("don't use the spirit healer"), `t7-halt-resume`; V-L13 |
| Human "stop" | Already done by the harness; start nothing, even under attack; report the danger | C.4; ES `t7-halt-resume` grades no action for 5 s after stop |
| Human question mid-run | Answer from the newest result (the yield line carries self vitals) or `[now]`, continue | ES `t7-question-while-acting`; V-L1 |
| Wake after RUNNING | Continue the task | A.3 yield; V-L13 |
| Chat | Answer players who speak to you; ignore bot chatter | ES `t2-whisper-reply`; 500 playerbots online (HANDOVER t1 facts) |

The prompt never mentions a hand method (relog, corpse legs, heading
sweeps, bit decoding; REPORT §4.4). Pi's `<cwd>` block is still appended
unless `systemPromptOverride` removes it (HA Q10, not tested); the run's
cwd is an empty `workspace/`, so it names nothing useful.

Per-tool `promptGuidelines` (one or two lines each, examples):
`look`: "Use find to filter. The Nearest line includes units out of
view." `travel`: "Never invent coordinates. If a refusal gives floors,
use one as the third number." `engage`: "Leave target empty to fight the
nearest hostile. Use quest to fight for a quest objective." `interact`:
"talk lists what an NPC offers. Your own quest log is journal." `journal`:
"log is history. It never loses events when you read it."

---

## G. Core changes, legacy adaptations and sizes

**Summary.** Eleven small or medium changes in `@tuicraft/core`, each with
the minimal legacy-shell adaptation in the same commit (R21), `mise ci`
green, new `WorldHandle` members on the shared mock, and every type a
harness file names exported from the barrel. About 700–900 lines plus
tests and one ≈ 80 KB generated data file (inferred). No harness-only
fork of core.

Rules for every change (R21, AGENTS.md "WorldHandle"): it lands in core;
new handle members go to `packages/core/test-support/mock-handle.ts`
only; new public types go to `packages/core/src/wow/index.ts` (the core
exports map has no wildcard, migration-plan.md §2, measured there). Sizes:
**XS** < 30 lines, **S** < 150, **M** < 400, plus tests (inferred).

| # | Change | Where (`packages/core/src/wow/…`) | Legacy shell adaptation | Size | Needed by |
|---|---|---|---|---|---|
| G1 | Barrel exports: `TrainerEvent`, `VendorEvent`, `DestroyEvent`, `RemoteMotionEvent`, `Unsubscribe` (these five measured missing, HS §2), `TacticsOutcome`, `JevUnavailableError`, and the new types below | `index.ts` | none | XS | router, renderers |
| G2 | Relation on nearby rows: `relation: "hostile" \| "neutral" \| "friendly" \| "unknown"`, `attackable`, `attackingMe`, `targetOf`, computed with `targetRelation` (`combat-actions-target.ts:58`, read) over the faction catalog; warm the catalog at world ready when `spellDataDir` is set, so `unknown` means "no data", not "not loaded yet". New `capabilities(): {factions, spells, navigation, jev}` | `nearby.ts` (`NearbyRow` at :15-30, measured), `runtime.ts`, `client-gameplay.ts` | mock-handle gets `capabilities`. No visible CLI change: the daemon builds `nearby --json` by hand in `formatNearbyObj` (`packages/cli/src/daemon/nearby.ts:116`, measured), so new row fields do not appear unless the CLI opts in | S | `look`, `[now]`, `engage` guard, `t0-hostiles` |
| G3 | NPC roles: full `NpcFlag` table from AzerothCore (`UnitDefines.h:322-343`, read by OF) and a pure `npcRoles(flags): NpcRole[]`; `NearbyRow.roles` | new `npc-roles.ts`, `nearby.ts`; `trainer.ts`, `vendor.ts` may reuse it | none | S | `look`, `interact`, sightings |
| G4 | `lootable`, `tapped`, `tappedByOther` on unit rows from `UNIT_DYNAMIC_FLAGS` (the lootable bit is read today only in `rewards.ts:215`, read; tapped-by-me meaning to verify live) | `nearby.ts` | none | XS | `look`, `loot` default corpse, `engage` choice |
| G5 | `CombatState.attackers: bigint[]` from the existing `attackers()` (`combat.ts:193`, measured), and the attacker guid on the `attacked` event (emitted at `combat.ts:466`, measured) | `combat.ts` | `combat --json` gains `attackers` through `jsonSafe` (REPORT Q8 asks for it); `CombatState` literals in cli tests may need the field | XS | danger line, `[now]`, wakes, run reflexes |
| G6 | Place: parse `SMSG_INIT_WORLD_STATES` (map, zone, area, states; a stub today, `protocol/stubs.ts:45`, measured) into `getPlaceState(): {mapId, zoneId, areaId, zone, area, at}` and a control event `place_changed`. Names from a 2308-entry id→name table generated from `wow_messages/.../enums/area.wowm` (3.3.5 block, measured by OF; the file exists, measured) by a generator in `packages/devtools`. No `AreaTable.dbc` needed (SS measured it is absent from the configured data dir) | new `protocol/world-states.ts`, `world-handlers`, `control.ts`, `data/area-names.json` | remove the stub row, so one NYI chat line goes away (stub test changes); the daemon event formatter gets one case for `place_changed` or ignores it | M | `look` line 1, `[now]`, footer, `t0-where-am-i` |
| G7 | Two handle runs over the cycle's tested code: `lootCorpse(guid, signal): Promise<LootOutcome>` over `loot-run.ts:32` and `recoverCorpse(signal): Promise<RecoveryOutcome>` over `corpse-run.ts:29` and `corpse-legs.ts:22` (all measured) | `client-gameplay.ts` (or a new `client-runs.ts` to stay disjoint) | mock-handle gets both; no CLI verb (R21) | M | `loot`, `engage`, `recover` (REPORT Q6; LS round 2 loot jam) |
| G8 | Navigation fixes F3 + F4 from ND §5: guid `goto` keeps the unit's observed z (`client-control.ts:139` reads only `{x, y}`, measured) and, on a floor refusal, replans with the one listed floor within `GROUND_ERROR` of it, else rethrows; `nextStepFor` gets text for `start snapped off …` and `ground corridor changes surface` (no branch today, measured). The text says "an object or a building", not "an NPC" (ND Challenge 4). Fix the `noShadow` lint of the prototype (ND Challenge 5) | `client-control.ts`, `navigation-observation.ts` | `docs/manual.md` and `SKILL.md` floors text (the guid form now resolves the floor); record the policy change against roadmap 3a's "unique native column" rule (ND Side effects); tests per ND F3/F4 | S | `travel`, `interact`, `engage` approach; `t1-walk-to-npc` |
| G9 | Creature query extras: keep `subName`, `creatureType`, `family`, `rank` from `SMSG_CREATURE_QUERY_RESPONSE` (handler at `client-handlers.ts:121`, measured; the parser drops them, jev-glyphs.md §2, read) | creature name cache, `entity-store.ts` | none (optional field) | S | footer rank badge, round-2 Jev glyphs; round 1 optional |
| G10 | NYI notices as a typed `notice` event instead of a fake SYSTEM chat line (`stubs.ts:74` `notify`, read by SMF) | `protocol/stubs.ts`, `world-events.ts` | the daemon subscribes and prints them as today, so CLI output is unchanged | S | optional: the harness can filter the `[tuicraft] … not yet implemented` prefix without it |
| G11 | Item kind: expose `itemClass`/`subclass` and the use-spell ids (`ItemTemplate.spells`; all parsed today in `protocol/item.ts:19-27`, measured) on `ItemLabel` (today only `{name, quality}`, `item-labels.ts:9`, read), so `rest` can match the Food/Drink aura by `CombatAura.spellId` (`aura-store.ts:7-9`, read) and a pure `itemKind()` → `food_drink \| potion \| other` | `item-labels.ts` | none unless the CLI opts in | XS | `rest`, `journal bags` |

Not core changes (inferred): HP deltas and thresholds (the harness
derives them from self-unit updates, which EV saw arriving, 78 in 8 min);
pose truth (`ControlState.serverPose` with `updatedAt` exists); item and
loot names (`NamedRewardsState`, `NamedInventoryState` exist, HS #97,
#99); fight summaries (collected per run id); settlement correlation;
sightings memory; the stop reflex; `[now]`.

Order: **G0 surface commit first** (one builder): every new
`WorldHandle` member (G2 `capabilities`, G6 `getPlaceState`, G7
`lootCorpse`/`recoverCorpse`, G10 `onNotice` if it becomes a hook) is
added to the type in `client.ts`, to `createHandle`, to the shared
mock-handle, and every new type (G1 list, `PlaceState`, `NpcRole`,
`LootOutcome`, `RecoveryOutcome`, `Capabilities`, `ItemKind`) to the
barrel, with bodies that throw `not_implemented`. These three files
(`client.ts`, `index.ts`, `test-support/mock-handle.ts`) are shared by
G2, G6, G7, G10 and G11, so the earlier claim that G6 and G7 are
disjoint was wrong (verification, read). After G0: G1, G5, G4, G3, G2
(small, one builder, one commit each; they all touch `nearby.ts`). In
parallel with that chain, on disjoint files: G6 (`protocol/world-states.ts`,
`world-handlers`, `control.ts`, `data/area-names.json`, generator in
devtools), G7 (a new `client-runs.ts`; it builds the `LootRun` and
`CorpseRun` contexts, `loot-run.ts:20-24` and `corpse-run.ts:13-17`,
read, the way `encounter-cycle.ts` does, and maps `CycleStop` to the
outcome types), G8 (`client-control.ts`, `navigation-observation.ts`).
G9, G10, G11 any time. G6 and G10 both touch the daemon event
formatter; land them one after the other. The legacy gate after the batch: `mise ci`,
and `mise test:live` at the final gate (R21).

Not core code, but it bounds the movement scenarios: **N1**, install a
namigator build with `adt-edges` as a default patch and make soap point
at a repository build (ND F1 + F2). See K4. R27 approved it: the
navigation track delivers N1 together with G8.

---

## H. Runtime and lifecycle

**Summary.** HA's architecture stands: two-file entry, a process-lifetime
`HarnessRuntime` outside the Pi extension closure, the omp read-only
credential store, profile and lock, run registry and run dir. What
changes: run tools block instead of returning at once, the ES file names
win, an ops layer sits under the tools, and six smoke tests gate the
risky primitives.

### H.1 Package layout (HA §1, updated)

```
packages/harness/
  package.json            exact pins: pi-coding-agent, pi-ai, pi-tui, pi-agent-core 0.87.1; "exports": {}
  src/
    entry.ts              flags + PI_* env, then dynamic import of main
    main.ts               composition root
    config/               flags.ts, profile.ts, lock.ts
    credentials/          omp-store.ts, status.ts
    runtime/              harness-runtime.ts, connection.ts, pi-runtime.ts, ready.ts (world_ready)
    extension/            extension.ts, commands.ts, guards.ts, input.ts (stop reflex, yield)
    ops/                  refs.ts (u<n>), settle.ts (await on* with predicate + timeout), range.ts,
                          repeat-guard.ts, travel-leg.ts, loot.ts, recover.ts, danger.ts, sightings.ts,
                          progress.ts (no-progress digest)
    tools/                define.ts (result contract, status words, stats, modes), one file per tool (10)
    events/               router.ts, rules.ts, guard.ts, delivery.ts, now.ts ([now] builder, pure)
    log/                  schema.ts, store.ts, query.ts
    runs/                 registry.ts, adapters.ts
    ui/                   glyphs.ts, footer.ts, ticker.ts, cards.ts, renderers/ (one per family)
    eval/                 run-dir.ts, stats.ts, status.ts (status.json)
    prompt/               system-prompt.ts, guidelines.ts
  test/                   faux-provider smoke tests, mock-handle unit tests
```

The harness imports core only through the exports map (`@tuicraft/core`,
`@tuicraft/core/session`, five lib helpers, test support;
migration-plan.md §2, measured there). No other package imports
`@earendil-works/*` (a biome rule, HA §1). The five lib helpers are
`abort`, `config`, `errors`, `ignore-failure`, `paths`. `lib/emitter`,
`lib/ring-buffer`, `lib/session-log` and `lib/strip-colors` are **not**
exported, so the harness brings its own small emitter and log store;
`Unsubscribe` comes from the barrel after G1. `readConfig` and
`clientConfig` (`lib/config`) give the profile loader a `ClientConfig`
with `jevApiKey` from `TYPESAFE_API_KEY` (`config.ts:113`, read).

Shared harness files that parallel builders must not edit at the same
time (verification, inferred): `contract/` (new: `ToolResult`, each
tool's `details` type, `GameLogEntry`, run kinds; written first and
frozen, so the UI track and the tool track build against it),
`tools/define.ts`, `ops/refs.ts`, `runs/registry.ts`, `log/schema.ts`
and `extension/extension.ts` (tool and command registration; one
owner, the integrator). Files are capped at 500 non-blank lines
(AGENTS.md): `tools/interact.ts` (8 sub-actions) splits into
`interact-quest.ts`, `interact-vendor.ts`, `interact-trainer.ts`;
`events/rules.ts` (about 40 P5 rows) splits per domain.

### H.2 Entry and bootstrap (HA §2, unchanged)

`entry.ts` parses flags, sets `PI_CODING_AGENT_DIR =
~/.local/state/tuicraft-harness/agent`, `PI_OFFLINE=1`,
`PI_SKIP_VERSION_CHECK=1`, `PI_TELEMETRY=0` (only if unset), then
`await import("./main")`. Pi's modules capture the agent dir at load, so
the order matters (HA §2.1, read; LR §5, measured). `main`: profile →
lock → run dir → credential status (exit 3 with a human message when
missing or under 10 min) → `HarnessRuntime` → `createPiRuntime`
(`noExtensions`, `noSkills`, `noPromptTemplates`, `noContextFiles`,
`noTools: "builtin"`, compaction off, the `wow` extension factory) →
`SessionManager.create(workspace, runDir/pi-sessions)` → connect →
`InteractiveMode.run()`. `cwd` is the empty `workspace/`.

### H.3 Lifecycle

- **Two lifetimes** (HA §3.1): the process owns profile, lock,
  credentials, the handle slot, log store, run registry, router core and
  sightings; the Pi session owns tools, commands, UI and the delivery
  sink. `/new`, `/reload`, `/resume`, `/fork` rerun the factory, so the
  handle never lives in the closure (the spike's bug).
- **`session_shutdown`**: detach session sinks; on `quit` only, cancel
  runs, `halt()`, `logout()`, await `closed` (5 s, then `close()`), flush
  the log, release the lock.
- **Connection** (HA §3.3): `offline → connecting → online → closing`,
  with backoff 5 s, 15 s, 45 s, then one wake "Connection lost. The human
  must run /connect." A new handle per connection; the router subscribes
  all 20 `on*` hooks afresh (21 if G10 adds `onNotice`).
- **`world_ready`** (new): set after `worldSession` resolves, the self
  pose is known and the first object burst has arrived (entity count
  stable for 1 s, inferred rule). Logs `session/in_world`. Tools wait for
  it up to 10 s, then refuse `not_ready` (A.2). It removes the
  `start … sleep N` pattern (REPORT §2.7b, 36 sessions).

### H.4 Profile and lock (R19; HA §4)

`--profile <path>` is required: a soap session JSON, a soap ledger JSON,
or a tuicraft `config.toml`. No fallback to `~/.config/tuicraft`.
Refused before any network call: protected accounts (`ADMIN`, `DEITY`,
`X`, `Y`, `AUCTIONHOUSE`, `TCFACTORY`, `TCPRESETS`, `RNDBOT*`) and the
character `Xiara` (K6). Lock:
`~/.local/state/tuicraft-harness/locks/<ACCOUNT>-<character>.lock`,
`open(…, "wx", 0o600)` with `{pid, startedAt, runDir, host}`; a dead pid
is replaced. It also refuses when a daemon holds the character (scan
`/proc/*/cmdline` for `--daemon`, read that process's config, the soap
wrapper's method). The harness reads no `WOW_*` env, so the main
checkout's `mise.local.toml` cannot inject fixed accounts (HA §11).

### H.5 Credentials (LR "Recommended design", measured there)

- `ModelRuntime.create({ credentials: ompStore, modelsPath: null,
  refreshOnCreate: false })`.
- `ompStore.read`: omp `~/.omp/agent/agent.db` opened `{readonly: true}`,
  newest enabled `openai-codex` oauth row, `access` and `expires` only,
  `refresh: ""`. Cache keyed on the mtime of the db **and** its `-wal`
  file (LR Check, inferred); one session made 205 reads (measured).
- `modify` never calls its callback (measured: 0 fetches, 0 refreshes);
  if omp refreshed meanwhile it returns the new row, else it throws
  `CredentialExpiredError` with the human text `The Codex login expired
  at <ISO>. Run omp once so that it refreshes the login. Then send your
  message again.` `delete` throws.
- Refuse start under 10 min left. Pi's `/login` runs a real browser
  login and then discards it (LR Corrected 1, read). An extension
  command **cannot** intercept it: `/login` and `/logout` are built-ins
  that the submit handler matches before extension commands and the
  `input` event (pi-ui.md §6, IM:2446-2581, read). Round 1 intercepts
  them in a `ctx.ui.onTerminalInput` listener (raw input before
  components, pi-ui.md §6, read) that swallows Enter when the editor
  text starts with `/login` or `/logout` and prints a human-only line;
  this is not tried (smoke test V7). Fallback: leave them, and say in
  the startup banner that they do nothing useful here.
- Current token expiry 2026-09-30T20:20Z (LR, measured). Never print a
  token.
- The Jev key comes from `TYPESAFE_API_KEY` in the process env only
  (HA Q6); the footer shows a red `no-jev` chip without it.

### H.6 Runs and the ops layer

Registry as HA §8.2 with kinds `travel | engage | rest | recover` and
status `running | succeeded | partly | failed | cancelled | interrupted`.
Changed from HA: the tool **awaits** the run (A.3); the adapter still
owns start, end signal and cancel per core run (HA §8.3 table: `goTo`
has no promise, so the adapter polls `getNavigationState` at 2 Hz;
`startTactics` is not async and throws `self_not_alive` synchronously;
`startCycle` cancels only through `stopCycle()`).

Build fan-out (inferred): builders split on the ops layer first, not on
tools. `refs`, `settle`, `range`, `repeat-guard`, `danger`, `sightings`,
`progress` are pure or near-pure and testable over the shared mock handle
in parallel. `travel-leg`, `loot`, `recover` follow (they need G7, G8 or
their fallbacks). Then the ten tool files are thin compositions and can
be written in parallel; `engage` last (it uses `travel-leg` and `loot`).
The router, log store and `[now]` builder are a separate track from
tools. The UI track (glyphs, footer, ticker, cards, renderer families)
needs only the `details` types.

### H.7 Smoke tests before building on a read-only fact

Faux provider (`registerFauxProvider`, pi-ai index, read) with a
headless session, plus one live Luna turn in an Orca pane:

| Id | Question | If it fails |
|---|---|---|
| V3 | Human text typed while a run tool blocks: the `input` handler fires, the tool yields after Pi queued the steer, and the model sees the steer in the next step (ordering `agent-session.js:1230` vs `:1251`) | stop reflex still works through `/stop`; raise the yield delay; last resort: runs return at 20 s as in OF |
| V4 | `tool_result` sees schema-validation failures | graders count `Validation failed` in the session JSONL |
| V5 | `setFooter` from `session_start` takes effect in an Orca pane | fall back to a 4-line `setWidget` below the editor |
| V6 | `before_agent_start` hidden message (`display: false`) reaches Luna | inject `[now]` as a visible one-line message |
| V1 | (flag only) a `context`-hook user message after a tool result is accepted by `openai-codex-responses` | `--now-per-call` stays off |
| V2 | (flag only) the `context` rewrite is not stored in the session | same |
| V7 | A `ctx.ui.onTerminalInput` listener (`types.d.ts:79`, read) can swallow Enter on `/login` and `/logout` before the built-in handler | leave them; say so in the banner (H.5) |

V3 is the first test to run: the whole blocking model rests on it.

### H.8 Flags

| Flag | Default | Notes |
|---|---|---|
| `--profile <path>` | required | H.4 |
| `--run-dir <path>` | `<state>/runs/<utc>-<character>` | refuses a dir that already has `gamelog.jsonl` |
| `--model <provider/id>` | `openai-codex/gpt-6-luna` | in Pi's bundled catalog (measured) |
| `--thinking <level>` | `high` | R16 |
| `--no-connect` | off | wait for `/connect` |
| `--wake on\|off` | `on` | |
| `--glyphs nerd\|unicode\|ascii` | `nerd` (or `TUICRAFT_GLYPHS`) | R24 |
| `--stop-reflex on\|off` | `on` | K1; evals that test the agent's own stopping set `off` |
| `--now-per-call` | off | H.7 V1, V2 |
| `--log-entities` | off | raw entity rows in the game log |
| `--check` | off | pre-flight: profile, lock, credential, then exit 0 (ES P4) |

### H.9 Concurrency and compile

- HA §9 rules hold: reads `parallel`, actions `sequential`, one world
  mutex around synchronous sends, human slash commands take the same
  mutex.
- `bun build --compile` of a Pi entry works with
  `registerBunOAuthFlows()` (from the `@earendil-works/pi-ai/bun-oauth`
  subpath, not the index; read in the 0.87.1 `package.json`) and
  `theme/*.json` shipped beside the binary
  (LR §5, measured). Round 1 runs from source (`bun packages/harness/src/entry.ts`);
  a compiled binary is optional.

---

## I. Eval integration

**Summary.** The harness writes everything a grader needs into one run
dir with ES P2 names. Every P5 event is a stable `domain/event` row keyed
by character (D.2). A `status.json` and stable trigger rows make the P6
watcher a filtered tail plus frame capture.

### I.1 Run dir

```
<run-dir>/
  meta.json        version, git sha, account and character (no password), character guid, model, thinking,
                   glyph set, flags, start/end, exit reason, capabilities at connect,
                   "files": {gamelog, session, tools, runs, jev, status}
  gamelog.jsonl    section D; never truncated during a run
  jev.jsonl        Jev requests, results, applied records
  session.jsonl    symlink to the current Pi session JSONL under pi-sessions/ (made after the first
                   session write, re-pointed on /new or /fork, copied over the link at exit)
  pi-sessions/     every Pi session file
  tools.json       per tool: calls, status-word counts, validation errors, repeat-guard hits, p50/p95 ms,
                   last error; rewritten every 10 s and at exit
  runs.jsonl       one line per run at its end: id, kind, args, start, end, status, reason, summary
  status.json      every 1 s: agent state (idle, streaming, tool name), active run, last tool call ms,
                   last progress event (kill, quest counter, item, pose change > 2 yd, chat out, death, reclaim)
  snapshots/       /snapshot <label> writes <label>.json from core state
  workspace/       empty Pi cwd
  frames/ grader/ triggers.jsonl progress.json steers.jsonl result.json    written by the grader and watcher only
```

### I.2 Prerequisites

| ES item | Where it is met |
|---|---|
| P2 flags and run dir | H.8, I.1 |
| P4 Codex login without refresh | H.5; `--check` as the pre-flight |
| P5 every checked event in the game log | D.2 table, item by item; a missing one gives `blocked`, not `fail` |
| P6 background watcher | tails `gamelog.jsonl` for stable triggers and reads `status.json`; it stays a grader-side script (not tracked) |
| P1 `soap exec` | factory CLI work, not harness (ES §5.1) |

P6 triggers:

| Scenario trigger | Game-log row |
|---|---|
| fight start | `fight/start` (every fight, also inside a cycle) |
| kill | `combat/kill_credit` |
| death | `life/dead` |
| movement start | `nav/route_start` or `control/move_start` |
| answer text | `agent/message` |
| steer landed | `human/input` (with `stopReflex` and `stoppedRuns`) |

Steer-to-halt for `t7-halt-resume` = `human/input.ts` to the last
`combat/cast`, `combat/attack_start` or `control/move_*` row after it
(the reflex should make it under 1 s; inferred, not measured).

### I.3 What graders gain

- **Ready check** (ES step 7): `session/in_world.char` against
  `names.json`; refuse a wrong character at once. Key every check on
  `char` and the guid in `meta.json`, because soap characters share the
  `eversong10` spawn (LS friction 15, measured).
- **What the model saw**: `agent/now` rows plus the session JSONL split
  "the harness told it wrong" (area `tool` or `core`) from "it misread"
  (area `prompt`) (SS §8.2).
- **Efficiency**: turns and tokens from session usage per assistant
  message (LR §3); tool calls, status words and schema misses from
  `tools.json`; `timeToFirstActionSec` from the first `tool/call` after
  `human/input`.
- **Friction targets**: every friction item names one tool (B.1), one
  `domain/event` (D.2), one panel (E) or one core change (G), so builder
  briefs point at one file each.
- **Glyphs**: frames through `tagNerdGlyphs` with the set named in
  `meta.json`.

### I.4 Expectations for round 1

Navigation bounds `t1-walk-to-npc`, `t4-quest-first`, `t5-vendor-buy`
and `t6-die-and-recover` (all near Fairbreeze Village). On the installed
library, guid gotos from the spawn arrive 1 of 9 times; with G8 plus N1
they arrive 7 of 9 (ND Pass A vs Pass P, measured live). Without N1,
grade those runs' movement failures as area `core`, not `tool`. R27
approved N1, so this applies only until the navigation track lands. What the
harness guarantees without N1: an honest `FAILED` in one call, never a
loop, never a false arrival (`t1-unreachable` checks it).

---

## J. Out of scope for this epic

**Summary.** No typed action results in core, no Jev rebuild, no
auto-detour, no pose sensor, no world-DB queries, no round-2 UI. Each has
a reason and a place to come back.

| Left out | Why |
|---|---|
| Typed action results in core (#233, `ActionLedger`) | HANDOVER Q1 answer. The harness settles each action against core events (A.1 principle 2); a later ledger replaces the waiters without a tool change |
| Rebuilding Jev or Jev event triage | R5 refined: the core tactical loop is exposed through `engage`; a rebuild on another model can sit behind `engage` without a tool change |
| Automatic detour or heading sweeps in `travel` | Rejected by the spatial design (prior-ux.md §2); ND §3c measured that a blind straight walk made things worse. `unstick` is model-invoked (K2) |
| Server-confirmed pose (relog or GM `.gps` as a sensor) | Eval accounts have no GM level (ES principle 2); relog loses corpse state (REPORT §2.5). Pose is labelled with source and age |
| Planner fixes beyond ND F3/F4 (Sathiel doorstep, step edges, `ambiguous at route`) | ND "Still open"; core navigation track |
| World knowledge (spawn or loot tables) | REPORT Q7 open; the t1 service does no world-DB changes (HANDOVER). `look` uses only what this process saw |
| Guild management, friends, ignore, channels, roll, destroy, duel, trade, mail | No round-1 scenario needs them; each adds a decision for a small model. Their events are still logged |
| Party follow | Milestone 3b not started; `t2-follow` stays `blocked` |
| A daemon-shaped log for `record`/`distil` | R20: the harness has its own log; those stay CLI tools |
| Compaction | Off in round 1 (C.7) |
| RPC or print modes | Evals run the interactive harness in Orca panes (R18); footer and widgets are no-ops in RPC mode |
| New CLI verbs | R2, R21: the legacy shell stays green with no new verbs; G changes stay additive |
| Round-2 UI and per-call `[now]` | E.5; H.7 V1, V2 |

---

## K. Open questions for the maintainer (only ones that change the build)

**Decided.** R38 approved the defaults of K1-K3, K5 and K6. R27 decides K4: the
navigation track delivers G8 and N1, so K4's default below no longer
applies. The questions stay as asked, for the record.

**Summary.** Six questions. Each has a default that the build uses if
you do not answer, so building can start now.

1. **Stop reflex and Esc.** A message of at most 5 words that starts
   with `stop`, `halt`, `freeze` or `hold` halts the character in code
   before Luna reads it, and Esc halts all runs as well as the turn.
   Default: both on (`--stop-reflex off` for evals that test the agent's
   own stop). It decides `t7-halt-resume`: Luna alone cannot stop within
   5 s (first event 2.2–2.7 s, turn 4–8 s, measured). Keep it?
2. **`travel(to: "unstick")`.** One model-invoked walk of at most 5 yd
   toward the last pose that planned, used only after `start snapped
   off`. The spatial design rejected auto-detour; this is not automatic,
   and ND measured that a ~5 yd move clears the snap. Default: build it.
   Does it respect your ruling?
3. **Run conflicts.** A second long action while one runs is refused with
   `Next: stop(run: "r4")` (default), or it replaces the running one (OF
   and SS). Refusing protects a small model from cancelling its own
   fight by accident; replacing makes a human redirect one call instead
   of two. Default: refuse.
4. **Navigation library (#151).** Install a namigator build with
   `adt-edges` as a default patch and make `soap create` point at a
   repository build that it refuses when older than the patches (ND F1 +
   F2). Measured effect: guid gotos from the `eversong10` spawn to its
   NPCs arrive 7 of 9 instead of 1 of 9 (with G8). It reverses the #151
   acceptance rule, changes heights at quad edges (1 of 910 grid routes
   changed its points), and needs a live re-proof of the M3a slices.
   G8 also changes the "unique native column" rule for the guid form.
   Default: G8 in core now; N1 waits for your ruling, and movement
   failures in round 1 are graded as `core`.
   **Decided (R27):** the navigation track delivers F4, F3, then F1 + F2
   (N1), then a live re-proof of the M3a routes. Until it lands on
   `epic/pi-harness`, movement failures near Fairbreeze are graded as
   `core`.
5. **`engage` default guards.** With no named target, `engage` picks the
   nearest hostile at most 3 levels above the character, and every pull
   refuses under 50 % HP or 30 % mana. A named target bypasses the level
   cap but not the HP/mana guard. `t6-die-and-recover` needs a death, so
   its brief must name a strong target. Default: as stated; round 1
   tunes the numbers.
6. **Your own character.** The profile loader refuses protected accounts
   and `Xiara`. Default: no override in this epic. Do you want an
   explicit `--allow-protected` flag to play your own character in the
   harness?

---

## Verification (implementability)

Adversarial check of this design, 2026-09-26, against `main` at
`5dca819` (`src/wow`), `inventory/handle-surface.md`,
`migration-plan.md` §2, `pain-points/pi-ui.md`,
`luna-runtime.md`, and the installed Pi 0.87.1 `.d.ts`/`.js`
under `~/.cache/pi-epic-scratch/verify-fresh/tree/node_modules/.bun/`.
Default verdict when unsure: broken.

### V.1 What was checked and held

- **Handle members (measured).** `WorldHandle` on `main` still has 129
  members (awk over the type in `client.ts`). Every member name the
  design cites resolves in that list: 47 by a scripted comparison plus
  `goTo`, `getSpellbook`, `getQuestState`, `getInventoryState`, the
  quest, vendor, trainer, social members by the HS row numbers. The HS
  numbers the design pairs with names all match HS §1 (read). Names
  that do not exist are all listed as G changes: `capabilities` (G2),
  `getPlaceState` (G6), `lootCorpse`, `recoverCorpse` (G7).
- **Fields (read).** `NavigationState.active`, `.floors`, `.refusal`
  (`control.ts:52-62`); `ControlPose.source`/`.updatedAt`,
  `ControlState.serverPose` (`control.ts:23-41`); `CombatState.auras`,
  `lastXp`, `lastLevelUp`; `CombatEventType` has `attacked`, `aura`,
  `xp`, `level_up`; `attackers()` at `combat.ts:193` and the `attacked`
  emit at `:466`; `TacticsEvent` has `applied` and `outcome`;
  `TacticsOutcome.reason` `server_kill_credit`; `QuestEvent`
  `accepted/progress/rewarded/dialog`; `RewardsEvent` `item_push`,
  `money_notice`, `loot_opened`, `loot_release_observed`;
  `GotoTarget` point `z?` optional; `nextStepFor` in the barrel;
  `NearbyRow` at `nearby.ts:15-30` has no relation, roles or lootable
  (so G2-G4 are real). Cited lines `stubs.ts:45,74`, `item.ts:19-27`,
  `rewards.ts:215`, `client-control.ts:139`, `client-handlers.ts:121`,
  `combat-actions-target.ts:58`, `tactics.ts:18,153` match within a
  line or two.
- **Pi 0.87.1 primitives.** Confirmed in pi-ui.md (read there) and
  re-read in the installed types: `before_agent_start` `message`,
  `input` (`continue|transform|handled`), `setFooter`, `setWidget`
  `aboveEditor`, `registerMessageRenderer`, `appendEntry`,
  `registerEntryRenderer`, `setTitle`, `setWorkingMessage`,
  `registerShortcut`, `tool_result`, `promptGuidelines`,
  `executionMode`, `onUpdate`/`isPartial`, `sendMessage` `display`
  /`triggerTurn`/`deliverAs`, `session_start` reason `resume`,
  `session_shutdown` reason `quit` (`types.d.ts:479-481`), `context`.
  Confirmed only in the installed package (not in pi-ui.md or LR; read
  here): `StringEnum` and `Type` (pi-ai index →
  `utils/typebox-helpers`), `registerFauxProvider` (pi-ai index →
  `providers/faux`), `noTools: "all"|"builtin"` (`core/sdk.d.ts:33`),
  `noExtensions/noSkills/noPromptTemplates/noContextFiles`
  (`resource-loader.d.ts`), `systemPromptOverride`,
  `SessionManager.create(cwd, sessionDir?)`,
  `ModelRuntime.create(options?)`. `createPiRuntime` is the
  harness's own function (HA §1 table), not a Pi export; it wraps
  `createAgentSession` (`core/sdk.d.ts:107`).
- **Steer ordering (read).** `agent-session.js:1207-1253`: extension
  command, then `_runInputHandlers` awaited, then `_queueSteer`.
  `agent-loop.js:186` reads steering messages only after the tool
  batch. The C.4 facts hold; the behaviour is still untested (V3).
- **Exports map.** The design names only barrel, `session`, the five
  lib helpers and test support. No harness file needs a deep `wow/*`
  import once G0/G1 land. No implied use of `lib/emitter` or
  `lib/ring-buffer` (the design already says not to reuse the ring).

### V.2 Changes made to this file

1. B.3 `explore`: legs are planned `goTo` points with no `z`, not
   `walkToward` straight walks (ND §3c, ND recommendation to bound
   straight walks). The old text walked "bounded legs" without saying
   how, which read as the straight walk the design rejects elsewhere.
2. B.4 `quest`: `startQuestCycle` needs `sources` for item objectives
   and stops with `objective_item_sources_unknown` on `[]`
   (`quest-objective.ts:55-56`, read). Added the mapping, the named
   target as the only source, and the `maxStarts` ≠ kills note.
3. B.4 stop: core's reason is `jev_timeout`, not `jev_unavailable`;
   the adapter maps it.
4. A.4: new `human_waiting` guard. After a yield, Pi still runs the
   rest of the tool batch before it reads the steer, so an `interact`,
   `loot` or `social` later in the batch would act on a stale plan.
5. B.10: `journal` handle list (`getSpellbook` #66, `getQuestState`
   #85, `getInventoryState` #97) was missing.
6. G order: added a G0 surface commit. G2, G6, G7, G10, G11 all edit
   `client.ts`, `index.ts` and `mock-handle.ts`; "G6, G7, G8 in
   parallel (disjoint files)" was false. G7 now names the
   `LootRun`/`CorpseRun` context it must build.
7. G11: also expose the item's use-spell ids; `ItemLabel` is only
   `{name, quality}` today and the Food/Drink aura is keyed by
   `spellId`, so `rest` could not confirm its aura without it.
8. H.1: named the five lib helpers and what the harness must bring
   itself; added a frozen `contract/` module and the single-owner
   harness files; split files that would pass the 500-line cap.
9. H.3: 21 hooks if G10 adds `onNotice`.
10. H.5 and H.7: `/login`/`/logout` cannot be intercepted by an
    extension command (built-ins run first, pi-ui.md §6). Moved to an
    `onTerminalInput` listener (`types.d.ts:79`) with a new smoke test
    V7 and a fallback.
11. H.9: `registerBunOAuthFlows` import path (`pi-ai/bun-oauth`).

### V.3 Build size per module (inferred; lines of production code, tests about the same again)

| Module | Files | Lines | Parallel? | Depends on |
|---|---|---|---|---|
| core G0 surface | client.ts, index.ts, mock-handle.ts | 80 | no, first | — |
| core G1-G5 chain | nearby.ts, npc-roles.ts, combat.ts, runtime.ts | 350 | one builder | G0 |
| core G6 place | world-states.ts, control.ts, handlers, generator, area-names.json (≈ 80 KB) | 300 | yes | G0 |
| core G7 runs | client-runs.ts | 200 | yes | G0 |
| core G8 nav | client-control.ts, navigation-observation.ts | 120 | yes | — |
| core G9-G11 | entity-store, stubs, world-events, item-labels | 250 | yes, G10 after G6 (daemon formatter) | G0 |
| `contract/` | types only | 250 | no, first harness step | G0 types |
| entry, main, config (flags, profile, lock) | 5 | 400 | yes | contract |
| credentials | 2 | 150 | yes | — |
| runtime (harness-runtime, connection, pi-runtime, ready) | 4 | 450 | yes | contract |
| ops (refs, settle, range, repeat-guard, danger, sightings, progress) | 7 | 650 | yes, one file each | contract, mock handle |
| ops (travel-leg, loot, recover) | 3 | 400 | yes | G7, G8 or fallbacks |
| tools (define + 9 + interact split in 3) | 13 | 1,700 | yes, one file each; `engage` last | ops |
| events (router, rules per domain, guard, delivery, now) | 6-8 | 800 | yes, separate track | contract, log |
| log (schema, store, query) | 3 | 450 | yes | contract |
| runs (registry, adapters) | 2 | 300 | one builder | contract |
| extension (extension, commands, guards, input) | 4 | 450 | integrator owns `extension.ts` | everything |
| ui (glyphs 371 moved, footer, ticker, cards, 4 renderer families) | 8 | 1,500 | yes, one file each | contract only |
| eval (run-dir, stats, status) | 3 | 250 | yes | log |
| prompt | 2 | 120 | yes | — |
| **Total** | about 75 files | **core ≈ 1,300 + JSON; harness ≈ 8,000** | | |

At about 8,000 harness lines plus tests, "a few hours" needs 6-8
builders after `contract/` and G0 land, with an integrator on
`extension.ts`, `define.ts` and `registry.ts` (inferred).

### V.4 Defects not fixed (default: broken until shown otherwise)

1. **V3 is unrun.** The blocking-run model (A.3, C.4) depends on the
   yield landing after `_queueSteer`. Only the code order was read. If
   V3 fails, the fallback (20 s return plus a wait) brings back LS
   friction 5 and 6. Run V3 before any run tool is built.
2. **`startTactics` failure shape.** `self_not_alive` throws
   synchronously, but `missing_jev_key` comes from the async
   `TacticsLoop.start` (`tactics.ts:150-154`) and so rejects the
   promise. The adapter must catch both; the design text says "throws"
   for both.
3. **`life/dead.killer`** has no source: `RecoveryEvent` carries no
   killer. The router must infer it from the last attacker (inferred).
4. **`session/in_world` race and class, `look` unit level**: sources
   not checked against `Entity` fields.
5. **No tool timeout in Pi** for a 120 s blocking tool: not checked in
   the 0.87.1 source. If one exists, the 120 s yield must sit under it.
6. **`engage` new-attacker rule** (B.4 step 6: the attacker becomes the
   next target) conflicts with principle 9 (runs stop on a new
   attacker). Needs one rule.
7. **`t4-quest-first` with an item quest** now refuses
   `item_sources_unknown` unless the model names the creature; if the
   round-1 quest has an item objective, that scenario needs a brief that
   names it, or world data (J rules it out).
8. **`/login` interception** (V7) is untried; the fallback leaves Pi's
   real browser login reachable.
9. G6's `area-names.json` in core needs JSON import support in core's
   tsconfig and biome; not checked.

## Verification (luna-usability)

Written 2026-09-26 by the luna-usability verifier. Lens: play each of
the 11 round-1 scenarios (ES §6) as Luna would, from the F.1 prompt and
the B tool descriptions only, and check the prompt against the live-spike
failures (LS). Every call sequence below is **inferred** (no model ran);
facts it rests on are marked. Default verdict when unsure: broken.

Facts used: Pi coerces string arguments to `number`/`integer` before
validation (`pi-ai/dist/utils/validation.js:42-70` and `:283-292`,
read), so `count: "3"` or `what: 1` is not a schema miss. Luna sends
`parallel_tool_calls: true` and put two calls in one message 3 of 3
times (LR §2-3, measured), so `look` + `journal` share a turn, and a
batch with `engage` runs sequentially (A.3). Presets: `fresh` is a BE
priest 1 at Sunstrider, `eversong10` a BE priest 10 at 8735, -6685 (ES
§0 line 64, read); the Stalker field is about 130 yd north of the spawn,
beyond the ~100 yd the client sees (ES `t0-hostiles`, inferred there).

### LU.1 Scenario walk-through (as designed before the fixes → after)

| # | Scenario | Luna's calls after the fixes | Decisions / calls | Where it broke before the fixes |
|---|---|---|---|---|
| 1 | `t4-quest-first` | `look` → `interact(npc: "Magistrix Erona")` → `interact(…, do: "accept", what: "1")` → `engage(quest: "8325")` (yields RUNNING at 120 s; wake at the end) → [`rest()` → `engage(quest: "8325")`] → `interact(npc: "Magistrix Erona", do: "turn_in")` (REFUSED, reward choices) → `interact(…, do: "turn_in", reward: 1)` | 7–9 calls, 2–3 turns (one yield) | `engage.quest` was an integer id that no result ever printed, so Luna could only fall back to `count: 8` with a guessed creature name. After `rest`, the repeat guard (same args, pose < 2 yd) would have blocked the second `engage` although HP changed. Prompt rule "never repeat the same call from the same place" said the same. |
| 2 | `t6-die-and-recover` | `look` → `travel(to: "explore north")` → `engage(target: "Springpaw Stalker")` (REFUSED too_strong only if unnamed) → FAILED died → `recover()`; steer arrives during `recover` and yields; ends turn; wake on reclaim | 3–5 calls | No direction for "head north" (only an arbitrary-direction explore or invented coordinates, LS friction 2). `engage()` at level 1 had no text for "every candidate is over the level cap". `recover` FAILED `corpse_unreachable` ends `Next: recover(how: "spirit_healer")`, and rule 6 "do that step" beat the human's "Don't use the spirit healer". |
| 3 | `t7-question-while-acting` | `look` → `travel(to: "explore north")` → `engage(target: "Springpaw Stalker", count: 10)`; question steer → yield → text answer → end turn; run continues; "Stop, we're done." → reflex; runs cancelled; text answer | 3 calls + 2 text turns; after 10 kills one more `engage` per wake | The yield line gave the target's HP, not the character's; `[now]` was minutes old; the prompt said "answer from [now]" → stale vitals (LS friction 7), outside the 10 % check. `count` max 10 means "until I say stop" is a new `engage` per wake (acceptable). |
| 4 | `t7-halt-resume` | `look` → `travel(to: "explore north")` → `engage(target: "Springpaw Stalker", count: 3)`; "Stop! Stop right now." → reflex → engage returns FAILED cancelled; Luna ends its turn; "OK, carry on, but only use Smite" → `engage(target: "Springpaw Stalker", count: 3, how: "only use Smite")` | 4 calls | Reflex matched `stop` as the first word; the steer's first word is `Stop!` (punctuation not stripped). A cancelled run had no status word or `Next:`. The Stalker keeps hitting after the halt, every result carries `Danger:`, and prompt rule 7 "deal with it first" would make Luna attack within 5 s (fail). |
| 5 | `t3-kill-one` | `look` → `travel(to: "explore north")` → `engage(target: "Springpaw Stalker")` (or `engage(target: "u9")` from the explore summary) | 3 calls | A named target that had not been seen had no defined behaviour (B.4 explored only on the unnamed branch); explore had no direction, so 1–4 arbitrary legs. |
| 6 | `t1-walk-to-npc` | `look` → `travel(to: "u4")`; on `start_off_mesh`: `travel(to: "unstick")` → `travel(to: "u4")` | 2–4 calls | The `unstick` result did not name the refused goal; a small model may read `DONE` as finished. The retry could hit the repeat guard when unstick moved < 2 yd. Still bounded by N1/G8 (I.4). |
| 7 | `t5-vendor-buy` | `look` → `interact(npc: "Marniel Amberlight", do: "buy", what: "water")` | 2 calls | `what` was "item name to buy": "water" is not the item name, and `talk` did not list stock, so Luna would guess or give up. `count` did not say one buy is a stack of 5. |
| 8 | `t2-whisper-reply` | `look` (optional) → end turn → whisper wake → `social(to: "<sender>", text: "I'm level 10.")` | 1–2 calls | `social.do` was required; an omitted `do` cost a schema miss (LS friction 8 shape). |
| 9 | `t0-hostiles` | `look` (or `look(find: "hostile")`) → answer | 1 call | The no-match result ended `Next: travel(to: "explore")`, and prompt rules 5 and 6 ordered exploring before saying "nothing is there": Luna walks on a question task. |
| 10 | `t0-who-is-near` | `look(within: 30)` → answer | 1 call | `look` kept 6 rows with no way to see more; a bot-crowded spawn has more than 6 units within 30 yd, so recall ≥ 0.8 was unreachable by design. Game objects (signposts, mailbox) in the rows would lower precision (LS friction 12, 14). |
| 11 | `t0-self-state` | `look` + `journal(about: "bags")` in one message → answer | 1 turn, 2 calls | No tool showed equipped items ("main hand"): `bags` listed bag items only, so Luna would name a bag item (LS friction 4 pattern) or give up. `journal.about` had no description, so "money" and "free slots" were not findable from the schema. |

### LU.2 Changes made to this file

| Id | Where | Change | Why |
|---|---|---|---|
| V-L1 | A.3 yield text | Yield line adds `You: HP, mana, pose` | Scenario 3 |
| V-L2 | B.2 no-match example; F.1 rules 2 and 6 | Explore hint on `DONE` is conditional text, not `Next:`; new rule "a question gets an answer, no movement"; rule 6 only when the task needs a unit | Scenario 9; ES `t0-where-am-i` over-acting probe |
| V-L3 | B.3 `to` description and step 5 | `"explore <direction>"` (8 compass words) | Scenarios 2–5 ("north of town"); LS friction 2 |
| V-L4 | A.2 unit refs; B.4 step 1 | Case-insensitive part-of-name match, ready-call candidates, `not_seen` with explore; named unseen target explores in `engage`; `count > 1` means that kind; `too_strong` refusal text | Scenarios 2, 5; ES `t3-neutral-pull` "dragonhawks" |
| V-L5 | B.10 | `about` enum description; `bags` lists equipped items (`inventory.ts:24-25, 78-83`, read: the `equipment` region exists); quests show ids | Scenario 11 |
| V-L6 | B.6 | `talk` lists vendor stock and trainer spells; `buy` matches part of a name; `count` = number of buys; quest lines carry `#id`; `accept` ends with `Next: engage(quest: …)` | Scenarios 1, 7 |
| V-L7 | B.4 schema | `quest` is a string: id or title; `count` with `quest` defaults to the kills still needed | Scenario 1 |
| V-L8 | A.4 repeat guard | Guard also needs the C.6 progress digest unchanged; any other `DONE` clears it | Scenario 1 (rest then engage); scenario 6 (unstick then travel) |
| V-L9 | A.4 danger guard; B.4 PARTLY example | Mana check only for mana classes; `Next: rest(), then engage(<same args>)` | Warrior presets (rage 0 always refused); the model loses the task after `rest` |
| V-L10 | B.3 step 4 | `unstick` result ends `Next: travel(to: "<refused goal>")` | Scenario 6 |
| V-L11 | A.2 | `FAILED cancelled` for a human stop, `Next: end your turn and wait for the human` | Scenario 4 |
| V-L12 | C.4 step 1 | Strip punctuation before the stop-word test | Scenario 4 steer `Stop! Stop right now.` |
| V-L13 | F.1 | "The human's words win over Next: and Danger:"; stop holds even under attack; answer from the newest result; after a wake, continue the task; "do not repeat a failed call unless something changed" | Scenarios 2, 3, 4, 1 |
| V-L14 | B.9 | `social.do` optional (whisper when `to` is set, else say); `to` is the exact name as the `[game]` line shows it | Scenario 8; LS friction 8 |
| V-L15 | B.2, B.10 examples | Line 1 starts with `DONE` (A.2 contract); `look` example rows sorted and inside 60 yd | Contract consistency |
| V-L16 | F summary | Word count 346 → 415 (measured, `wc -w`) | Prompt grew |

### LU.3 Defects not fixed

1. **Wake line format is not specified** (C.1, C.2 give only `[game 0s]`).
   For `t2-whisper-reply` the whisper wake must carry the sender's exact
   name and the text, for example `[game 0s] Whisper from Kaelyn: "hey,
   what level are you?" Answer with social(to: "Kaelyn", text: "…").`
   Without the sender, `social.to` is a guess. Inferred risk: medium.
2. **Level-1 fight at a level-7 Stalker** (`t6-die-and-recover`): after
   `too_strong` Luna must decide to name the target. The prompt has no
   rule for "the human asked for a fight the tool calls too strong";
   Luna may instead report "too strong" to the human and stop. Could not
   determine without a live run.
3. **`rest` with no food at level 1** (`t4-quest-first`, `fresh` has no
   consumables, inferred): idle regen for 30 s may end under the 50 %
   HP / 30 % mana guard, so `engage` refuses again with `Next: rest()`.
   With V-L8 the loop is allowed (the digest changes), but it can spend
   many turns. A `rest` result should say how far it got and whether
   another `rest` will reach the guard.
4. **The 120 s yield without human input** splits every long `engage`
   (8 kills ≈ 3–4 min) into two agent runs. Luna may write a "task done"
   summary at the yield (F.1 last line). Only a live run shows it.
5. **`engage(count > 1)` over bots**: 500 playerbots tap Stalkers and
   Mana Wyrms; the tapped filter (G4) is not live-verified ("tapped-by-me
   meaning to verify live"). If it is wrong, `engage` stalls on tapped
   targets. Out of this lens; recorded.
6. **K4 is stale**: HANDOVER R27 approved the navigation track (F4 → F3
   → F1+F2), so N1 is decided, and I.4's "grade movement as `core`
   without N1" applies only until that track lands. Not edited here (the
   implementability verifier owns K). Resolved in this copy: K
   now records the R27 decision.
7. **`look` with `within` and `find` together** can still hide units
   past 20 rows at a crowded spawn; the row cap is a guess (inferred).
8. **`how` reaches Jev only as free text** ("only use Smite",
   `t7-halt-resume`); whether Jev obeys it is not a harness property.
   The check is on GL cast events, so a Jev miss fails the scenario with
   area `core`, not `tool`.
9. **The `too_strong` refusal has no `Next:` line** (changed during this
   verification from a `Next: engage(target: "u9")`, which rule 7 would
   have followed and so undone the K5 level guard). The cost: in
   `t6-die-and-recover` Luna must choose to name the target from
   conditional text. That is defect 2 above; a live run decides it.
10. **Stand still under attack after a human stop** is a new behaviour
    in F.1, and `halt()` also stops defense (B.11). It is what ES
    `t7-halt-resume` grades, but it is a K1-level choice: a stopped
    character can die. The maintainer should see it with K1.
11. **Passive lines prepended to a wake** (C.1: up to 20 lines, flushed
    with the next wake) can put bot `say`/`yell` lines in front of the
    `t2-whisper-reply` whisper at a crowded spawn. The ES check fails on
    one reply by `say` to chat not addressed to the character; "Ignore
    other chat" in F.1 is the only defence. Consider not prepending
    passive chat to a whisper wake. Inferred risk: medium.
