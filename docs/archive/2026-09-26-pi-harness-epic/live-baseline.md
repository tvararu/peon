# Live suite baseline (pre-migration)

> Record copy for the [Pi harness epic spec](../2026-09-26-pi-harness-epic-design.md),
> taken 2026-09-26 from the epic's scratch notes. `HANDOVER.md` (the
> coordinator's working notes) was not kept: its rulings R1-R38 are the
> spec's Decisions section. Paths under `~/.cache/pi-epic-scratch/`, and
> scratch files in the checkout's `tmp` directory other than the copies in
> this directory, were not kept. Wrapper, account and eval paths in that
> directory name outputs that the described tools write at run time.
> `src/...` paths before the workspace split now live under
> `packages/<pkg>/src/`.


Key: live-baseline. Run date 2026-09-26.

## Commit tested

`5dca8196ee387eb610a31e8aeb5c2275a25a013c` "chore: Keep the factory under the GraphQL limit" (the tip of origin/main in the local checkout at run time). This is a scratch clone at `/home/deity/.cache/pi-epic-scratch/live-baseline`, made with the standard recipe. It has no `mise.local.toml`, and `mise.toml` has no `WOW_*` entries (read, `rg -n "WOW_|^\[env\]" mise.toml` gave no matches). Bun 1.4.2.

## Result: 21 pass, 0 fail, 0 skip (measured)

`Ran 21 tests across 4 files. [104.71s]`, 264 expect() calls, exit code 0. This was one run only, so this report has no flakiness data (see Caveats).

## Timings (measured)

| Step | Wall time |
|---|---|
| `soap create fresh --gm 2` (account 1) | ~0.48 s |
| `soap create eversong10` (account 2) | ~0.58 s |
| `mise test:live` (whole suite) | 104.75 s (bun reports 104.71 s) |
| `soap delete` account 1 | 0.32 s |
| `soap delete` account 2 | 0.32 s |

The create times come from the output file's birth time minus its modification time. My timer command failed because `bc` is not installed. The figures include bun startup and are good to about ±10 ms. They are inferred from filesystem timestamps and were not timed directly. The delete and suite times are from `date` deltas.

## Per-test results (measured, from junit)

| File | Test | Time | Result |
|---|---|---|---|
| live.ts | full login flow against live server | 2.08 s | pass |
| live.ts | two-client chat > whisper between two characters | 4.12 s | pass |
| live.ts | two-client chat > who query returns results | 1.07 s | pass |
| live.ts | two-client chat > whisper to nonexistent player triggers not-found | 4.08 s | pass |
| live.ts | two-client chat > say message received by nearby client | 9.16 s | pass |
| live.ts | fault paths > forced teleport relocates and recovers | 18.03 s | pass |
| live.ts | fault paths > freeze denies movement then releases | 11.17 s | pass |
| live.ts | fault paths > held WHO meets HALT without error | 1.06 s | pass |
| live.ts | party management > invite, accept, leader transfer, leave | 3.30 s | pass |
| live.ts | daemon IPC > STATUS, SAY, READ_WAIT via inline daemon server | 2.05 s | pass |
| live.ts | entity tracking > character sees another character appear | 7.37 s | pass |
| live.ts | entity tracking > getNearbyEntities returns entities with positions | 0.27 s | pass |
| live.ts | gameplay guards while alive > initial spells populate the learned list | 0.11 s | pass |
| live.ts | gameplay guards while alive > idle navigation observation carries no next step | 0.07 s | pass |
| live.ts | gameplay guards while alive > recovery and loot refuse while alive | 0.17 s | pass |
| live-quest.ts | quest dialog > auto-accept quest enters the log on select, then abandons | 2.45 s | pass |
| live-quest.ts | quest dialog > the cancel's close settles a talk ignored at range | 8.37 s | pass |
| live-quest.ts | quest dialog > a trainer list answers the option, opens the offer and the next giver talks | 6.58 s | pass |
| live-quest.ts | quest dialog > an ignored talk expires as no_reply and the next talk works | 13.33 s | pass |
| live-remote-motion.ts | remote movement > observer receives a moving character's remote pose | 4.87 s | pass |
| live-vendor.ts | vendor: buy water and sell it back, each confirmed by coinage | 4.96 s | pass |

File totals from junit: live.ts 15 tests / 64.15 s, live-quest.ts 4 / 30.73 s, live-remote-motion.ts 1 / 4.87 s, live-vendor.ts 1 / 4.96 s. The sum is about 104.7 s, so the files ran one after another. The slowest tests are the teleport fault path (18 s), the no_reply quest talk (13 s) and freeze (11 s).

## Failing or flaky tests

No test failed. I saw no infrastructure fault: the server and SOAP both answered. I cannot say anything about flakiness from one run. The migration gate should run this suite several times on the base commit before it treats a single post-migration failure as a regression.

## Reproduction commands for the migration gate

Run these from a scratch clone, never from the main checkout. The main checkout's `mise.local.toml` injects fixed accounts.

```bash
D=/home/deity/.cache/pi-epic-scratch/<key>
git clone --quiet file:///home/deity/code/tuicraft $D
git -C $D fetch --quiet file:///home/deity/code/tuicraft refs/remotes/origin/main
git -C $D checkout --quiet FETCH_HEAD
cd $D && mise trust -y && mise bundle && mkdir -p tmp

umask 077; S=$HOME/.cache/pi-epic-scratch/<key>-secrets; mkdir -p $S
bun src/factory/main.ts soap create fresh --gm 2 --owner <key> > $S/a1.json
bun src/factory/main.ts soap create eversong10 --owner <key> > $S/a2.json

export WOW_ACCOUNT_1=$(jq -r .account $S/a1.json) WOW_PASSWORD_1=$(jq -r .password $S/a1.json) WOW_CHARACTER_1=$(jq -r .character $S/a1.json)
export WOW_ACCOUNT_2=$(jq -r .account $S/a2.json) WOW_PASSWORD_2=$(jq -r .password $S/a2.json) WOW_CHARACTER_2=$(jq -r .character $S/a2.json)
XDG_CONFIG_HOME=$(jq -r .dir $S/a1.json)/config mise test:live \
  --reporter=junit --reporter-outfile=$S/junit.xml > $S/suite.log 2>&1; echo rc=$?

bun src/factory/main.ts soap delete $(jq -r .account $S/a1.json)
bun src/factory/main.ts soap delete $(jq -r .account $S/a2.json)
rm -rf $S
```

Notes:
- The JSON files hold the account passwords. Do not cat them. Read only single fields with `jq -r .account|.character|.dir|.wrapper`.
- `mise test:live` passes extra arguments through to `bun test`, so the junit reporter flags work (measured). With the junit reporter and output piped, the console shows only the summary. Take per-test results from the junit XML.
- Put the deletes in a `trap ... EXIT` so the accounts are removed when the suite fails.
- `bc` is not installed. Time steps with `date +%s%N` and shell arithmetic.

## Artifacts

- `/home/deity/.cache/pi-epic-scratch/live-baseline-artifacts/junit.xml` holds the per-test junit output. I checked it for both passwords and it has neither.
- `/home/deity/.cache/pi-epic-scratch/live-baseline-artifacts/suite.log` holds the console output.
- The accounts were FAC6AB817A901 (fresh, GM 2) and FAC6AB817A928 (eversong10). I deleted both (`{"deleted":[...]}`, rc=0), and `soap list` no longer shows them. I also deleted the password files.
