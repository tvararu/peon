# Pi harness

The Pi harness is an interactive terminal agent that plays one World of
Warcraft 3.3.5a character. A model (by default `openai-codex/gpt-6-luna`
at thinking `off`) acts through ten game tools. A human watches the same
terminal and can type to the agent at any time. The harness is built on
`@peon/core` and is the only way to play Peon. The eval scenarios
that grade it are in [evals.md](evals.md).

## Run it

1. Log in to Codex once with omp (`omp`, provider `openai-codex`). The
   harness reads that login and never refreshes it.
2. Make a throwaway character. The command prints a JSON profile that
   holds a password, so keep the file private:

   ```
   umask 077
   mise factory soap create eversong10 > "$XDG_RUNTIME_DIR/char.json"
   ```

3. Start the harness from the repository root:

   ```
   mise harness --profile "$XDG_RUNTIME_DIR/char.json"
   ```

   `mise harness` runs `bun packages/harness/src/entry.ts` with the same
   flags. `mise harness --help` shows the mise task, not these flags.
4. Type a task, for example `Kill one Springpaw Stalker north of town.`
5. Quit with Ctrl-D on an empty editor, with `/quit`, or with two Ctrl-C
   within half a second. The harness prints `Work complete. Logging out
   of the game.` and exits when the server confirms the logout, in up to
   30 seconds.
   Do not press Ctrl-C while it waits: that ends the harness before the
   logout. Then delete the character with
   `mise factory soap delete <ACCOUNT>`.

To check the profile, the lock and the Codex login without a game
connection, add `--check`. The harness prints one line and exits.

## Play your own character

A Peon `config.toml` is a profile too. Write the character you play
into `~/.config/peon/config.toml` (mode 600, since it holds the
password):

```
account = "<account>"
password = "<password>"
character = "<character>"
```

`host` (default `localhost`), `port` (3724), `language` (1, Orcish; 7 for
Alliance), `timeout_minutes` (30), `spell_data_dir`,
`navigation_data_dir` and `navigation_library` are optional. Then run:

```
mise harness --profile ~/.config/peon/config.toml
```

The harness guard in [Credentials and safety](#credentials-and-safety)
still applies: it refuses the protected accounts and the character
`Xiara`, whatever the profile.

## Flags

| Flag | Default | What it does |
|---|---|---|
| `--profile <path>` | required | The character to play: a soap session JSON, a soap ledger JSON, or a Peon `config.toml`. There is no default profile. |
| `--run-dir <path>` | `~/.local/state/peon-harness/runs/<utc>-<character>` | Where the run files go. The harness refuses a directory that already has `gamelog.jsonl`. |
| `--model <provider/id>` | `openai-codex/gpt-6-luna` | The model from Pi's bundled catalog. |
| `--thinking <level>` | `off` | The Pi thinking level. |
| `--no-connect` | off | Start without a game connection. Use `/connect` later. |
| `--wake on\|off` | `on` | When off, game events do not start an agent turn. |
| `--glyphs nerd\|unicode\|ascii` | `nerd`, or `PEON_GLYPHS` | The glyph set of the human UI. The model text never has glyphs. |
| `--stop-reflex on\|off` | `on` | When on, a short human message that starts with stop, halt, freeze or hold stops every action before the model reads it. |
| `--now-per-call` | off | Adds the `[now]` line before every model call, not only at the start of a turn. |
| `--log-entities` | off | Writes raw entity rows to the game log. |
| `--check` | off | Checks the profile, the lock and the Codex login, then exits with code 0. |

The harness reads no `WOW_*` variable. Only `--profile` selects the
character.

## Credentials and safety

- **Codex login.** The harness reads the newest `openai-codex` login from
  omp's database (`~/.omp/agent/agent.db`), read-only. At start it prints
  `Codex login: valid until <time> UTC (omp).` When there is no login, or
  when the login expires in less than 10 minutes, it prints what to do
  and stops with exit code 3. Run omp once so that it refreshes the
  login, then start the harness again. If the login expires during a
  session, the next model call fails with the same advice. `/login` and
  `/logout` do not change the login that the harness uses.
- **Fight helper.** `engage` uses Jev for split-second fight decisions. Jev
  needs `TYPESAFE_API_KEY` in the environment. Without it, `engage`
  refuses with `no_combat_helper` and the footer shows a red `no-jev`
  chip.
- **Protected characters.** The harness refuses the accounts `ADMIN`,
  `DEITY`, `X`, `Y`, `AUCTIONHOUSE`, `TCFACTORY`, `TCPRESETS`, every
  account that starts with `RNDBOT`, and the character `Xiara`. There is
  no flag to override this.
- **One owner per character.** A lock file
  `~/.local/state/peon-harness/locks/<ACCOUNT>-<character>.lock`
  stops a second harness. A lock from a dead process is replaced.
- **Secrets.** No log, run file or tool result holds the password. The
  `social` tool refuses chat text that contains the account name or the
  password.

## Tools

The model uses only these ten tools. Each result starts with a status
word (`DONE`, `PARTLY`, `RUNNING`, `UNCONFIRMED`, `REFUSED`, `FAILED`).
A result that is not `DONE` ends with a `Next:` step.

| Tool | What it does |
|---|---|
| `look` | Self, place, target, the running action, and the nearest units with short ids like `u7`. |
| `travel` | Walks to a unit, the corpse or a point, explores in a direction, or unsticks. |
| `engage` | Chooses a target, walks to it, fights it with Jev and loots it. |
| `loot` | Loots one corpse, one slot at a time. |
| `interact` | Talks to an NPC: quests, gossip, buy, sell junk, train, repair. |
| `rest` | Eats and drinks until health and mana reach a percent. |
| `recover` | Comes back to life: corpse run, spirit healer or a resurrection offer. |
| `social` | One chat message or one group action. |
| `journal` | Quest log, bags and gear, spells, or the game log. |
| `stop` | Stops one action or everything. |

`travel`, `engage`, `rest` and `recover` start a run (`r1`, `r2`, …).
Only one run can be active. The tool waits for the run to end and
streams its progress. When the human types, or after 120 seconds, the
tool returns `RUNNING`, the run continues, and a `[game]` message tells
the agent when it ends.

The system prompt is in `packages/harness/src/prompt/system-prompt.ts`.
The tool descriptions and usage lines are in
`packages/harness/src/prompt/guidelines.ts`.

## Stopping the agent

- Type `stop` (or `Stop!`, `halt`, `freeze`, `hold`, at most five words).
  The harness stops every run and halts the character before the model
  reads the message.
- `/stop` does the same.
- `F9` does the same from any screen.
- `Esc` aborts the model's turn. The harness then stops every run and
  halts the character.

Other human text while the agent works goes to the agent at the next
step. Action tools refuse until the agent reads it.

## Commands

| Command | What it does |
|---|---|
| `/now` | Shows the last `[now]` line exactly as the model got it. |
| `/log [filter]` | Shows the last 20 game-log rows, filtered by words, `from:Name` or `domain:<name>`. |
| `/stop` | Stops every run and halts the character. |
| `/connect` | Connects to the game after `--no-connect` or a lost connection. |
| `/disconnect` | Logs the character out and keeps the harness open. |
| `/s` `/say <text>` | Says the text near the character. |
| `/y` `/yell <text>` | Yells the text. |
| `/p` `/party <text>` | Writes to the party. |
| `/g` `/guild <text>` | Writes to the guild. |
| `/o` `/officer <text>` | Writes to the guild officers. |
| `/ra` `/raid <text>` | Writes to the raid. |
| `/e` `/em` `/me` `/emote <text>` | Does a custom emote, such as `/me waves`. |
| `/w` `/whisper` `/t` `/tell <name> <text>` | Whispers a player. |
| `/r` `/reply <text>` | Whispers the last player who whispered the character. |
| `/1` `/2` `/3` `/4` `/5` `/6` `/7` `/8` `/9 <text>` | Writes to the joined channel with that number. |
| `/wake on\|off` | Turns game-event wakes on or off. |
| `/snapshot <label>` | Writes the current world state to `snapshots/<label>.json` in the run directory. |

The chat commands use the game's slash names. With no text, a chat
command shows its usage. `/r` says so when nobody has whispered the
character yet, and guild or officer chat from a character with no guild
shows the game's `You are not in a guild.` line instead of sending.

Pi's own commands (`/new`, `/resume`, `/fork`, `/reload`, `/model`, …)
also work. The game connection stays open across `/new`, `/resume`,
`/fork` and `/reload`.

## Screen

- **Footer (4 rows).** Your unit frame, the target, place and money, and
  a chrome row: model, thinking, context, wake, glyph set, log rows,
  unread whispers, and red chips for a missing helper (`no-jev`,
  `no-nav`, `no-factions`, `no-spells`). The footer shows the same facts as the
  `[now]` line.
- **Ticker (6 rows, above the editor).** The live run, then the newest
  game events, also the ones that do not wake the agent. Emote notices
  the core does not parse yet are left out.
- **Event cards.** Each `[game]` message is one line per event with a
  glyph, the time and the text, oldest first. Kills, XP and loot inside
  an `engage` run that ends `DONE` or `PARTLY` are reported by its
  result, not as separate lines.
- **Human-only lines.** Packet errors, server corrections and not-yet-built
  notices. The model never sees them.
- **Tool rows.** Each tool call shows one call line and a short result.
  Press `ctrl+o` to expand a result. Run tools redraw their progress
  while they work.
- **Title and working line.** The tab title shows danger, for example
  `AGGRO`. The working line shows the run in game words, or `Work,
  work…` while the agent works with no run.
- **Voice lines.** `/connect` answers `Ready to work!`. These lines, the
  title and the working line are for the human; the model never sees
  them.

Use a terminal font with Nerd Font glyphs for `--glyphs nerd`. Use
`unicode` or `ascii` in other terminals.

A proposed redesign of the screen lives at
[docs/plans/2026-09-27-terminal-ui-design.md](plans/2026-09-27-terminal-ui-design.md).

## Run directory

| File | Content |
|---|---|
| `meta.json` | Version, git sha, account and character (no password), model, thinking, glyph set, flags, start and end, exit reason, capabilities. Every exit writes `endedAt` and `exitReason`: `quit` (Ctrl-D, `/quit`, two Ctrl-C), `sigterm`, `sighup`, `sigint` (Ctrl-C during the logout) or `fatal_error`. Only a SIGKILL leaves both empty. |
| `gamelog.jsonl` | Every game event as one typed row (`domain/event`). |
| `jev.jsonl` | Every Jev call and every fight-loop event; see [Jev log](#jev-log). |
| `session.jsonl` | A link to the current Pi session file in `pi-sessions/`. |
| `tools.json` | Calls, status words, validation errors, repeat refusals and timings per tool. |
| `runs.jsonl` | One row per run when it ends. |
| `status.json` | Agent state, active run and last progress, written every second. |
| `snapshots/` | Files from `/snapshot`. |
| `workspace/` | The empty working directory of Pi. |

## Jev log

`jev.jsonl` is a complete record of every Jev call, on in every run. Use
it to debug one bad decision: see the state Jev was shown, what it
answered and what happened next, then replay that call.

Every row has `type`, `runId` (one fight loop) and `ts`. The rows of one
call also share `call`, which counts from 1 in each `runId`.

| `type` | Content |
|---|---|
| `started`, `activated`, `stopped` | A fight loop's target, instruction, framing and fault marker, then its start and end reason. |
| `request` | `call`, `observation` (the state Jev sees, `unavailable` included), `candidates`, `instruction`, `framing`, `characterClass`, `sentAtMs`. |
| `exchange` | `call`, `model`, `instructions` (Jev's question), `framing` (the sentence sent, if any), `status`, `elapsedMs`, and `response` (the parsed body, or its text when it isn't JSON) or `error` when no answer came back. |
| `result` | `call`, `choice`, `probabilities`, `confidence`, `model`, `inputTokens`, `elapsedMs`. |
| `applied`, `discarded` | `call` and the action taken, or why it wasn't (`stale_age`, `unavailable`, `aborted`, ...). |
| `transport` | A failed call or loop: the `error` (`jev_timeout`, `TypeSafe HTTP 503`, ...), with `call` when it was one call. |
| `outcome` | How the fight ended, with the last `observation`. |

A call that times out still gets its `exchange` row, and its `result`
and `discarded` rows, when the answer arrives late. No row holds the API
key, an auth header or the endpoint URL. One call's rows take about
13 KB, nearly all of it the `request` row. A fight makes about 4 calls a
second, so an hour of nonstop fighting writes about 180 MB; time out of
a fight writes nothing.

To replay one call, give its `runId` and `call`. The body is the one
Peon sent:

```sh
jq -c --arg run "$RUN" --argjson call "$CALL" -s '
  map(select(.runId == $run and .call == $call))
  | (.[] | select(.type == "request")) as $q | (.[] | select(.type == "exchange")) as $x
  | {model: $x.model,
     questions: {action: {criteria: ($q.candidates | map({(.id): .description}) | add),
                          instructions: $x.instructions, type: "choice"}},
     state: ($q.observation + {standingInstruction: $q.instruction}
             + if $x.framing then {framing: $x.framing} else {} end)}' jev.jsonl \
| curl -s https://api.typesafe.ai/v1/systemone -H "Authorization: Bearer $TYPESAFE_API_KEY" \
    -H 'Content-Type: application/json' -d @-
```

## Exit codes

| Code | Cause |
|---|---|
| 0 | Normal exit, or `--check` passed. |
| 2 | Bad flags, a bad or protected profile, or a held lock. |
| 3 | No Codex login, or the login expires in less than 10 minutes. |
| 1 | A fatal error. `meta.json` says `fatal_error`. |
| 130 | SIGINT, for example Ctrl-C while the harness waits for the logout. `meta.json` says `sigint`. |
| 129, 143 | SIGHUP or SIGTERM before Pi has started. After Pi starts, both log out and exit 0. |

## Live smoke: the 120-second yield

Check that a run tool which lasts more than 120 seconds gives control
back to the agent. Use a throwaway character that stands far from its
goal, for example `eversong10`.

1. Start the harness as in [Run it](#run-it).
2. Type a task that walks for more than two minutes: a travel to
   coordinates at least 900 yards away on ground the character can
   reach, for example `Travel to <x>, <y>.` `travel` does not take
   place names. `rest` stops after 30 seconds, so it cannot show the
   yield.
3. Do not type while the run goes on. After 120 seconds the tool result
   starts with `RUNNING r<n>:` and gives HP, mana and position. Its
   next step is `end your turn; a [game] message comes when r<n> ends.
   Or stop(run: "r<n>").`
4. The agent ends its turn. When the run ends, a `[game]` message
   wakes it.
5. `gamelog.jsonl` has `nav/route_start` and `nav/route_end` rows (or
   `nav/refused`) with the run id, and `runs.jsonl` has the run.
