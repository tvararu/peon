# Pi harness live smoke checks (V1, V5, V6, V7)

Taken 2026-09-27 on `epic/pi-harness` at `5a1968f`, Pi 0.87.1, `openai-codex/gpt-6-luna` thinking `high`, soap preset `eversong10` (a level 10 Blood Elf Priest in Fairbreeze Village), in Orca terminal panes read with `orca-ide terminal read --screen`.

| Id | Question (design H.7) | Verdict | Evidence |
|---|---|---|---|
| V1 | A `context`-hook user message after a tool result is accepted by `openai-codex-responses` | pass | With `--now-per-call`, "Look around and tell me the nearest questgiver." ran one `look any` call and then answered "The nearest questgiver is Velan Brightoak, 21 yards north." The session holds 1 `toolResult` row followed by a second `assistant` row. The screen shows no `Error`, `400` or `invalid_request` text (count 0). |
| V5 | `setFooter` from `session_start` takes effect in an Orca pane | pass | Pi's default footer is absent. The footer rows read `Fgkliifcieo 10 Priest ████████████████217/217 ████████████████607/607 ··········0% idle`, `no target`, `Eversong Woods · Fairbreeze Village 8735,-6685 server 18s 5 0 0`, and `openai-codex/gpt-6-luna · high · ctx 0% · wake:on · glyphs:nerd · log 14 rows`, with the run widget line `no run │ 0 kills +0 xp` above the chat. |
| V6 | A hidden `before_agent_start` message (`display: false`) reaches Luna | pass | "How much health do you have? Answer from what you already know; do not call a tool." got "You have 217/217 health." The last `agent/now` row holds `HP 217/217`. The `[now]` text does not show on the screen. The session holds 0 `toolResult` rows. |
| V7 | An `onTerminalInput` listener swallows Enter on `/login` before the built-in handler | pass | The screen shows `Warning: /login and /logout do nothing useful here. The harness reads the Codex login from omp.` No login selector and no browser URL appear. The game log holds 1 `human/input` row with `Human: /login (blocked)`. |

## Consequences

- V1: `--now-per-call` may be used.
- V5: the footer uses setFooter.
- V6: `[now]` stays hidden.
- V7: the `/login` guard stays.

## Observations outside the verdicts

- Ctrl+D quits only after the server logout finishes, which takes several seconds. A second harness started on the same profile in that window refuses with `Another harness (pid … run dir …) holds this character. Stop it first.` Wait for the first process to exit before starting the next.
- Server system messages show raw WoW colour codes in the chat widget, for example `|cff00ff00Playerbots:|r`.
- Pi prints `Warning: fd not found. Offline mode enabled, skipping download.` at startup.
- The per-call `[now]` message that `--now-per-call` adds is not written to the game log, so V1's evidence for it is the flag in `meta.json` and the `context` hook in `packages/harness/src/events/install.ts`.
