# Luna runtime: Pi 0.87.1 + openai-codex/gpt-6-luna under Bun 1.4.2

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


Probe date 2026-09-26. Scratch code: `/home/deity/.cache/pi-epic-scratch/luna/app/`
(`sync-auth.ts`, `readonly-store.ts`, `dice-tool.ts`, `build.ts`, `headless.ts`,
`headless-diag.ts`, `store-test.ts`, `render-test.ts`, `smoke.ts`, `interactive.ts`).
Pi files are cited relative to `app/node_modules/@earendil-works/`.
Marks: **[measured]** ran it, **[read]** read the code, **[inferred]** reasoning.

App setup [measured]:

```
cd /home/deity/.cache/pi-epic-scratch/luna/app && bun init -y
bun add --exact @earendil-works/pi-coding-agent@0.87.1 @earendil-works/pi-ai@0.87.1 \
  @earendil-works/pi-agent-core@0.87.1 @earendil-works/pi-tui@0.87.1
```

## 1. Credentials

### Where they live [measured]

| Store | State |
|---|---|
| Codex CLI `~/.codex/auth.json` | Absent. `~/.codex/` exists and is empty. |
| Pi `~/.pi/agent/auth.json` | Absent. `~/.pi/agent` does not exist. |
| opencode `~/.local/share/opencode/auth.json` | Holds only `xai` (oauth), expired 2026-09-21. No codex. |
| omp `~/.omp/agent/agent.db`, table `auth_credentials` | **The only live codex credential.** Row `provider='openai-codex'`, `credential_type='oauth'`, `disabled_cause` null. `data` JSON keys: `access, refresh, expires, accountId, email, orgId, orgName, authorizedAt`. |

Schema [measured]: `auth_credentials(id, provider, credential_type, data TEXT, disabled_cause, identity_key, created_at, updated_at)`.
Inspection (`inspect-omp.ts`) printed key names, expiry, booleans and the non-secret `identity_key` column (account email and org id) to the session transcript. No token, refresh token or key was printed.

**Current codex access token expires 2026-09-30T20:20:18.813Z** (97.2 h left at 2026-09-26T19:05Z) [measured, `bun sync-auth.ts`].

### What the spike's sync-auth.ts does [read]

`docs/plans/2026-09-25-pi-harness-spike/sync-auth.ts`:
- :10 opens omp `agent.db` `{ readonly: true }`.
- :11-13 selects enabled oauth rows, newest first; :15 keeps `openai-codex` and `anthropic`.
- :20 skips expired rows; :21-27 writes `{type:"oauth", access, refresh:"not-shared-with-omp", expires, accountId}`.
- :31-33 writes `tmp/pi-harness-spike/agent/auth.json` (not kept), then chmods 0600 (window between write and chmod: the file is briefly created with the default umask) [read; the mode issue is inferred].
- The refresh token is never copied, so omp's token cannot rotate. But Pi's default file store will still try a refresh with the fake string (see below).

### How Pi 0.87.1 reads and refreshes [read]

- `pi-coding-agent/dist/core/model-runtime.js:75` — `new RuntimeCredentials(options.credentials ?? DefaultAuthStorage.create(options.authPath))`. A `credentials: CredentialStore` option replaces the file store entirely (`model-runtime.d.ts:3-9`).
- `core/runtime-credentials.js:17-32` — thin overlay for runtime API keys; `modify` passes straight to the store. No refresh of its own.
- `CredentialStore` contract: `pi-ai/dist/auth/types.d.ts:57-79` — `read`, `list`, `modify(providerId, fn)` ("the only write path"), `delete`.
- **Refresh trigger 1, every request** — `pi-ai/dist/auth/resolve.js:62-108`: `DEFAULT_OAUTH_MINIMUM_VALIDITY_MS = 5 min` (:62); `minimumValidityMs = Math.max(5 min, override)` (:70), so the window cannot be lowered; if `now + 5 min >= expires` it calls `credentials.modify(...)` and inside it `oauth.refresh(current)` (:77-92). After `modify`, :105 only throws if the caller passed `minOAuthValidityMs`.
- **Refresh trigger 2, catalog refresh** — `pi-ai/dist/models.js:190-204` `resolveRefreshCredential`: only when the token is already expired, also through `modify`. Runs from `ModelRuntime.refresh()`, which `create()` calls unless `refreshOnCreate: false` (`model-runtime.js:100-101`).
- `pi-ai/dist/auth/oauth/openai-codex.js:445-449`: `refresh` posts the refresh token to `TOKEN_URL` (:25, :127-144); `toAuth` returns `{ apiKey: credential.access }` only.
- `pi-ai/dist/api/openai-codex-responses.js:169`, `:1250-1264`: the ChatGPT account id is derived from the access-token JWT. **The access token alone is enough**; `accountId` and `refresh` are not needed.
- With the default file store and the spike's fake refresh string, a token inside the 5-minute window makes Pi POST `not-shared-with-omp` to OpenAI's token endpoint and fail with `OAuth refresh failed for openai-codex` [inferred from the code above; not run, to avoid the network call].

### Recommended design

1. **Source**: omp `~/.omp/agent/agent.db`, opened `{ readonly: true }`, one row: `provider='openai-codex' and credential_type='oauth' and disabled_cause is null order by updated_at desc limit 1`. Take `access` and `expires` only.
2. **Never refresh, by construction**: pass a custom store to `ModelRuntime.create({ credentials, modelsPath: null, refreshOnCreate: false })` whose `modify()` returns the current credential **without calling `fn`**, and whose `delete()` does nothing (`app/readonly-store.ts`). Pi then skips `oauth.refresh` and goes straight to `toAuth`. `/login` and `/logout` become inert for this provider [inferred].
   - Measured (`bun store-test.ts`, fake token expiring in 60 s): `{"source":"OAuth","gotApiKey":true,"modifyCalls":1,"refreshAttemptsSeen":1,"fetches":0}` — `modify` was called once, the refresh callback never ran, zero `fetch` calls.
3. **Production shape** [inferred]: have `read()` query omp's db live (cache on the db file mtime), so a token omp refreshes is picked up with no sync step and no `auth.json` on disk. The probe used the task's copy (`auth.json`, `{type, access, refresh:"", expires}`, written with `writeFileSync(..., { mode: 0o600 })`). Cache the value: one headless session made **205 `read()` calls** [measured], each a file read in the probe.
4. **Expiry detection**: before building the session (and before each `prompt()` in a long session), check `expires - now`. Refuse under 10 minutes (Pi's own window is 5). Message to the human: `The codex token expires at <ISO>. Run omp once so it refreshes the token, then relaunch.` (`build.ts` `checkToken`). Also hook the refusal callback in `modify()` to print the same text, since a long session can cross the window [measured: callback fires].
5. Never print the token; print the expiry only.

## 2. Model

- `openai-codex/gpt-6-luna` **is in the 0.87.1 registry** [measured]: `pi-ai/dist/providers/data/openai-codex.json:1` (single-line file; entry `"gpt-6-luna"`), loaded by `providers/openai-codex.models.js`. `api: openai-codex-responses`, `baseUrl: https://chatgpt.com/backend-api`, `contextWindow 272000`, `maxTokens 128000`, `input: text, image`, catalog cost $0.10 in / $0.50 out per M.
- No `models.json` entry is needed. (If one were: `modelsPath` points at a `models.json` in the agent dir; not exercised.)
- `thinkingLevelMap`: `{"off":"none","minimal":"low","low":"low","medium":"medium","high":"high","xhigh":"xhigh","max":"max"}`.
- Accepted levels [read]: `pi-ai/dist/models.js:553-564` `getSupportedThinkingLevels` → all seven: `off, minimal, low, medium, high, xhigh, max` (`off` maps to `"none"`, not `null`, so it stays).
- `high` → request `reasoning: { effort: "high", summary: "auto" }` [read: `openai-codex-responses.js:414-424`; measured via a `before_provider_request` hook in `headless-diag.ts`, which also showed `parallel_tool_calls: true`].
- `minimal` is sent as `low` [read].

## 3. Headless call

`build.ts` builds the session: `PI_CODING_AGENT_DIR` and `PI_OFFLINE=1` are set before a dynamic `import()` of Pi; `SettingsManager.inMemory({ quietStartup: true, compaction: { enabled: false } })`; `SessionManager.inMemory(cwd)`; `resourceLoaderOptions: { noExtensions, noSkills, noPromptTemplates, noContextFiles, noThemes: true, systemPrompt }`; `createAgentSessionFromServices({ model: gpt-6-luna, thinkingLevel: "high", noTools: "builtin", customTools: [rollDice] })`. Active tools: `["roll_dice"]` only.

`PI_OFFLINE` gates only startup network work (catalog, fd/rg download, version check, package check, telemetry); nothing in the inference path reads it [read: `rg -n PI_OFFLINE` hits are `model-runtime.js:88`, `utils/tools-manager.js:13`, `utils/version-check.js:37`, `interactive-mode.js:782,879,963`, `core/package-manager.js:38`].

Command: `cd /home/deity/.cache/pi-epic-scratch/luna/app && bun headless.ts` (three runs). Prompt: "Roll 2d6 and 1d20 at the same time: make both roll_dice calls in one response, in parallel. Then summarise the results in one sentence." [measured]

| Run | first stream event (= first toolcall_start) | first text delta | total | tool calls in msg 1 | tools executed | usage msg1 / msg2 (in/out) |
|---|---|---|---|---|---|---|
| 1 | 2679 ms | 4175 ms | 6290 ms | 2 | 2 (2d6, 1d20), started 1 ms apart | 168/60, 279/32 |
| 2 | 2210 ms | 4405 ms | 8113 ms | 2 | 2, started 1 ms apart | 168/60, 279/32 |
| 3 | 2201 ms | 3521 ms | 4039 ms | 2 | 2, started 2 ms apart | 168/60, 279/32 |

- Session build: 12 ms after import. Time is measured from session built to event.
- Every run: two `toolCall` blocks in **one** assistant message (`stopReason: "toolUse"`), both executed in parallel, then one text message (`stopReason: "stop"`), e.g. "The 2d6 roll was 3 and 5 (total 8), and the 1d20 roll was 18."
- Usage is reported per assistant message (`input, output, cacheRead, cacheWrite, reasoning, totalTokens, cost`). `reasoning` was **0** on all turns and no `thinking` blocks arrived, although `effort: "high"` was sent [measured]. Either the model chose not to reason on a trivial task or the backend does not report it [inferred; unresolved].
- The store saw `modifies: 0` (no refresh attempt) on all runs.
- Transport: Pi's default `transport: "auto"` is WebSocket first, SSE fallback (`openai-codex-responses.js:184-190`) [read]; which one ran was not recorded.

## 4. Tool results and rendering

- A tool returns `AgentToolResult`: `{ content: (TextContent|ImageContent)[], details: T }` — `content` goes to the model, `details` is "arbitrary structured details for logs or UI rendering" [read: `pi-agent-core/dist/types.d.ts:366-378`]. `roll_dice` returns `content: [{type:"text", text:"rolled 2d6: 4, 3 (total 7)"}]` and `details: {count, sides, rolls, total, at}` (`dice-tool.ts`).
- `ToolDefinition` [read: `pi-coding-agent/dist/core/extensions/types.d.ts:345-377`]: `renderCall(args, theme, ctx) => Component`, `renderResult(result, {expanded, isPartial}, theme, ctx) => Component`, `renderShell?: "default" | "self"`, `executionMode?`.
- `ToolExecutionComponent.updateDisplay` [read: `modes/interactive/components/tool-execution.js:232-281`]: with a definition it calls `renderCall` (fallback: tool name) and `renderResult({content, details}, {expanded, isPartial})` (fallback: the content text); a throwing renderer falls back silently (:250-252, :271-278). With no definition it prints name + args JSON + content text (:283-285, :326-328). Background: pending/success/error colour (:225-229).
- Rendered at 120 columns [measured: `PI_OFFLINE=1 bun render-test.ts`, ANSI stripped, `ToolExecutionComponent` from the package index with a stub TUI]:

```
--- custom renderCall+renderResult, collapsed (5 lines)
| 🎲 roll 2d6
| total 7
--- custom renderers, expanded
| 🎲 roll 2d6
| total 7 [4 3]
--- definition without renderCall/renderResult
| roll_dice
| rolled 2d6: 4, 3 (total 7)
--- no definition at all (10 lines)
| roll_dice
|
| {
|   "count": 2,
|   "sides": 6
| }
| rolled 2d6: 4, 3 (total 7)
```

  Each block also has one blank padding line above and below plus one leading blank line; every line is padded to 120 visible columns (background fill). The same custom rendering showed in the live Orca pane (section 6).

## 5. Compile

- `bun build --compile smoke.ts --outfile dist/smoke` works: 1964-1977 modules, about 180 ms, 92 MB binary [measured].
- The binary starts: `cd /tmp && PI_OFFLINE=1 PI_CODING_AGENT_DIR=... dist/smoke` → `{"importAndBuildMs":63,"model":"gpt-6-luna","thinking":"high","tools":["roll_dice"],"exports":152}` [measured].
- **Break 1, OAuth in the binary** [measured]: the first prompt fails with `OAuth auth derivation failed for openai-codex: Cannot find module './openai-codex.js' imported from /$bunfs/root/smoke`. Cause [read]: `pi-ai/dist/auth/oauth/load.js:15-33` loads flows through a variable `import()` specifier that the bundler cannot follow. Fix: call `registerBunOAuthFlows()` from `@earendil-works/pi-ai/bun-oauth` (`pi-ai/dist/bun-oauth.js:11-21`) before use, as Pi's own binary does (`pi-coding-agent/dist/bun/runtime-setup.js`). After that the compiled prompt completes (toolCall → toolResult → text) [measured].
- **Break 2, InteractiveMode theme** [measured]: `dist/interactive` crashes at `initTheme` with `ENOENT ... open '/home/deity/.cache/pi-epic-scratch/luna/app/dist/theme/dark.json'`. Cause [read]: `pi-coding-agent/dist/config.js:17` detects a Bun binary from `$bunfs` in `import.meta.url`; then `getPackageDir()` is `dirname(process.execPath)` (:316-319) unless `PI_PACKAGE_DIR` is set, and `getThemesDir()` is `<packageDir>/theme` (:329-331). Fix: ship `theme/dark.json` and `theme/light.json` (from `pi-coding-agent/dist/modes/interactive/theme/`) next to the binary. After that the compiled InteractiveMode ran a full prompt in Orca [measured]. Same rule applies to `assets/` (`clankolas.png`), `export-html/`, `package.json`, `README.md`, `docs/` next to the binary (:344-384) [read; not exercised].
- `PI_CODING_AGENT_DIR` must still be set before Pi is evaluated; in the entry it is set before a dynamic `import()` [measured working].

## 6. Orca pane

Commands [measured]:

```
orca-ide status --json                       # runtime ready, app 1.4.205
orca-ide terminal create --worktree path:/home/deity/code/tuicraft --title luna-pi-probe \
  --command "cd /home/deity/.cache/pi-epic-scratch/luna/app && PI_OFFLINE=1 PI_CODING_AGENT_DIR=/home/deity/.cache/pi-epic-scratch/luna/agent bun interactive.ts" --json
orca-ide terminal read --terminal <handle> --screen --json
orca-ide terminal send --terminal <handle> --text "<prompt>" --enter --json
orca-ide terminal send --terminal <handle> --text $'\e' --json       # Escape
orca-ide terminal send --terminal <handle> --text $'\x03' --json     # Ctrl-C (or --interrupt)
orca-ide terminal send --terminal <handle> --text $'\x04' --json     # Ctrl-D
orca-ide terminal close --terminal <handle> --tab --json
```

- `create` returned `surface: "background"` with a warning that Orca could not make the tab discoverable; the handle still worked.
- `--screen` returns the rendered frame (`source: "screen"`, 120 columns): transcript, the tool rows with the custom renderers (`🎲 roll 2d6` / `total 7`), the assistant text, the **widget**, the editor between two rules, the cwd line, and the footer (`↑421 ↓92 $0.000 (sub) 0.1%/272k ... gpt-6-luna • high`). A typed but unsent draft shows as a line between the rules. While running, the top rule shows `── ⠏ Working ───`.
- Widget: `ctx.ui.setWidget("luna", ["LUNA-WIDGET line one: ...", "LUNA-WIDGET line two: ..."])` from `session_start` (guarded by `ctx.mode === "tui"`) shows as two lines directly above the editor [measured].
- Submit: `--enter` submits the editor [measured]. The send receipt says `provider: "unsupported"`, `observation: "unsupported"`: Orca cannot confirm submission for this program, so confirm with a screen read.
- Escape (`$'\e'`, 1 byte) during a turn aborts it; the transcript shows `Operation aborted` [measured].
- Ctrl-C (`$'\x03'` or `--interrupt`, 1 byte each) clears the editor. Two Ctrl-C within 500 ms exit (`interactive-mode.js:3342-3352`, `core/keybindings.js:29-30` `app.clear` = ctrl+c, `app.exit` = ctrl+d) [read]; two sends 206 ms apart exited the binary [measured]. Two sends about 1 s apart did not exit [measured]. Ctrl-D on an empty editor exits [measured]. The shell stays alive after Pi exits.
- Read latency: `--screen` 91-131 ms (samples 91, 131, 92, 99, 115, 101, 105, 100, 97) [measured]; stream read 98 ms.
- Rendering garbage: none seen in `--screen` output. One startup line: ` Warning: fd not found. Offline mode enabled, skipping download.` (`utils/tools-manager.js:309`, from `interactive-mode.js:730-731` `ensureTool("fd")`, which runs even with `noTools: "builtin"`). The default stream read is unsuitable for a TUI (per `orca-ide terminal read --help`).
- Closed with `terminal close --tab`: result `closeMode: "tab"`, `ptyKilled: false` (Pi had already exited; the shell was the remaining process). `terminal list` no longer shows the handle [measured].

## Gotchas

1. `~/.codex` is empty: omp's `agent.db` is the only codex credential on this box. The harness depends on omp staying logged in.
2. Pi's OAuth refresh window is at least 5 minutes and cannot be lowered (`resolve.js:70`). Any store that lets `modify` run `fn` will refresh. The spike's fake refresh token makes that a failing POST rather than a logout, but it is still a network call and a confusing error.
3. A read-only store makes `/login` and `/logout` no-ops for openai-codex. Hide or intercept them.
4. `reasoning` usage is 0 at `high` on a trivial prompt; no thinking blocks arrive. Do not read "high" as "visibly thinks".
5. Compiled binaries need `registerBunOAuthFlows()` or every OAuth provider fails at the first prompt with a misleading "auth derivation failed" error.
6. Compiled InteractiveMode needs `theme/*.json` next to the executable (or `PI_PACKAGE_DIR` pointing at a directory with `theme/`). The binary is not self-contained.
7. `PI_CODING_AGENT_DIR` and `PI_OFFLINE` must be set before Pi's modules evaluate: use a dynamic `import()` after setting them, or set them in the launcher.
8. `InteractiveMode` always calls `ensureTool("fd"|"rg")`; with `PI_OFFLINE=1` it prints a warning line in the transcript instead of downloading.
9. `orca-ide terminal send` cannot confirm submission for a Pi pane (`observation: unsupported`); verify with `read --screen`. Exit needs two Ctrl-C within 500 ms, so send them back to back, or use Ctrl-D on an empty editor.
10. `terminal create` may return a background handle with a "not discoverable" warning; the handle still works.
11. `SettingsManager.inMemory` + `quietStartup: true` hides Pi's startup header, so the first screen is only the widget, editor and footer.
12. The store is read 205 times in one short session: cache credential reads.
13. Pi's `ctx.hasUI` is true in RPC mode too; guard TUI-only calls with `ctx.mode === "tui"` (used here).

## Check

Adversarial check, 2026-09-26, by a separate agent. Marks as above.

### Confirmed

- **Headless call, re-run once** [measured]. Commands: `cd /home/deity/.cache/pi-epic-scratch/luna/app && bun sync-auth.ts` (auth file mode `600`, 1844 bytes), then `bun headless.ts`, then `rm -f ../agent/auth.json`. Result: build 12 ms, first event = first `toolcall_start` 2448 ms, first text delta 3657 ms, total 4240 ms. Message 1: 2 tool calls, `stopReason: "toolUse"`, usage 168/60. Both `roll_dice` calls (2d6, 1d20) started 1 ms apart and ended at 2486 ms. Message 2: `stopReason: "stop"`, usage 279/32. Model `openai-codex/gpt-6-luna`, thinking `high`, active tools `["roll_dice"]`, store `reads: 205, modifies: 0`. Token expiry `2026-09-30T20:20:18.813Z` (97.09 h left). All values are inside the ranges in section 3, and the 205 reads match exactly. Output: `luna/check-headless.json`; stderr was empty.
- **Registry entry** [measured]: `pi-ai/dist/providers/data/openai-codex.json` has `"id":"gpt-6-luna"`, `api openai-codex-responses`, `baseUrl https://chatgpt.com/backend-api`, `contextWindow 272000`, `maxTokens 128000`, cost 0.1/0.5.
- **No refresh of a shared token** [read]. Every refresh in Pi 0.87.1 goes through `CredentialStore.modify` and runs only inside the callback that `modify` receives:
  - `pi-ai/dist/auth/resolve.js:62` (5-min window), `:70` (`Math.max`, cannot be lowered), `:77` `credentials.modify(...)`, `:87` `oauth.refresh(current, ...)` inside that callback. `:105` throws only when `minOAuthValidityMs` is set. `:110` then calls `toAuth`.
  - `pi-ai/dist/models.js:190-205` `resolveRefreshCredential`: `:199` `modify`, `:202` `oauth.refresh` inside the callback.
  - `pi-ai/dist/auth/oauth/openai-codex.js:445` `refresh` → `refreshOpenAICodexToken` (`:422`), `TOKEN_URL` `:25`. `:446-448` `toAuth` returns only `{ apiKey: credential.access }`.
  - `pi-coding-agent/dist/core/runtime-credentials.js:31` passes `modify` straight to the store. `core/model-runtime.js:75` uses `options.credentials` when given. `core/agent-session-services.js:56-57` builds its own `ModelRuntime` (file store) only when `modelRuntime` is not passed. `build.ts:34-37` passes it.
  - `rg -n -i refresh pi-ai/dist/api/openai-codex-responses.js`: no hits. The request path has no refresh of its own.
  - `app/readonly-store.ts:21-26`: `modify` never calls `_fn`, and `delete` (`:27`) does nothing. The source row is read with `{ readonly: true }` (`app/sync-auth.ts:5`), and only `access` and `expires` are copied, with `refresh: ""` (`:12`). omp's refresh token is not in the Pi process at all.
  - `rg -n 'refreshOpenAICodexToken|refreshToken\(' pi-ai/dist pi-coding-agent/dist -g '*.js'`: the codex refresh is defined at `oauth/openai-codex.js:422` and called only at `:445`. No other caller.
  - Conclusion: with this store, Pi cannot rotate omp's token. The live run confirms `modifies: 0`.
- **Orca pane closed** [measured]: `orca-ide terminal list --json` lists 2 terminals. Neither is the probe handle `term_6f35ae69-…` from `luna/orca-create.json` (title `luna-pi-probe`). `ps -eo pid,etime,args | rg 'pi-epic-scratch/luna|interactive\.ts|dist/interactive|dist/smoke'` finds no process. One listed terminal has the title `π - workspace`. It is a different handle (`term_39214eed-…`), and its preview shows a game map (`Springpaw Stalker`, `Dragonhawk Egg`), not the dice probe. It belongs to other work. I did not touch it.
- **Secret scan** [measured, counts only]:
  - This file: `eyJ` 0, `sk-` 0, `access_token` 0 before this section (the only later hits are these pattern names), `refresh` 17 before this section (all prose), runs of 40+ `[A-Za-z0-9+/_=-]` 7 (all file paths, 42-48 chars; 5 before this section, 2 in it).
  - `/home/deity/.cache/pi-epic-scratch/luna`, without `app/node_modules` and the two binaries: `eyJ` 0, `sk-` 0, `access_token` 0. Long runs: 166 `sha512-` integrity hashes and 4 package paths in `bun.lock`, 2 schema URLs in `dist/theme/*.json`, 9 Orca `term_` handles in the Orca JSON records. No token.
  - Whole scratch tree, including `node_modules` and `dist/smoke`, `dist/interactive` (binary-safe `rg -a`): JWT-shaped strings (`eyJ….….…`) 0. The `sk-`, `access_token` and `refresh` hits there are library source text.
- **Auth file deleted** [measured]: `luna/agent/` is empty after the run. `luna/fake-auth.json` from `store-test.ts` is not present.
- Also confirmed [read]: `config.js:17` (`$bunfs` detection), `:316-331` (package dir, themes dir); `oauth/load.js:15-33` (variable `import()`); `openai-codex-responses.js:184-190` (transport `auto`); `interactive-mode.js:3342-3352` (two Ctrl-C within 500 ms).

### Corrected

1. **`/login` is not inert** [read]. `pi-ai/dist/models.js:300-314`: `login` runs the provider's `method.login(...)` first (the full browser OAuth flow, with network calls). Only after that does it call `modify`, and the read-only store then discards the new credential. So `/login` does a real login and throws the result away. It does not touch omp's token, but it confuses the user. Hide or intercept `/login` and `/logout` (Gotcha 3 stands, the reason changes).
2. **`PI_OFFLINE` hit list is incomplete** [read]. `rg -n PI_OFFLINE pi-coding-agent/dist -g '!bundle/**'` also hits `modes/interactive/bug-report.js:22` (bug-report upload) and `main.js:445-447` (`--offline` sets it). Neither is in the inference path, so the conclusion stands.
3. **Spike `sync-auth.ts` mode window** [read + measured umask]. `docs/plans/2026-09-25-pi-harness-spike/sync-auth.ts:32-33` writes without `mode`, then chmods. `umask` in this shell is `0077`, so the file is created `0600` and there is no window here. The window exists only under a looser umask (for example `022`). Pass `{ mode: 0o600 }` to `writeFileSync`, as `app/sync-auth.ts:12` does.
4. **`inspect-omp.ts` and `identity_key`** [read]. Section 1 says the inspection printed the `identity_key` column. `luna/inspect-omp.ts:7` as it is now filters `identity_key` out, so the current script does not print it. Either an earlier version printed it or the claim is wrong. I could not determine which from the files.

### Could not confirm

- Section 3 runs 1-3 and sections 4-6 (render test, compile breaks, Orca pane keys and read latencies): not re-run. The task allowed one headless call only.
- Whether `reasoning: 0` at `high` means no reasoning or no reporting: my run did not record `reasoning` (`headless.ts:25` omits it).
- Which transport (WebSocket or SSE) carried the call: not recorded.
- Recommendation 3 (live read of omp's db, cached on mtime) is design, not tested. A cache keyed only on the db file mtime can miss an omp write that lands in the `-wal` file. Key the cache on the `-wal` mtime too, or re-read when `expires - now` falls under the refusal threshold [inferred].
