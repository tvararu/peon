# Protocol coverage: re-baseline (key: rebaseline)

Plan index: [2026-09-27-protocol-coverage-plan.md](../2026-09-27-protocol-coverage-plan.md).
Contract: [contract.md](contract.md). Design:
[2026-09-27-protocol-coverage-design.md](../2026-09-27-protocol-coverage-design.md)
(section numbers such as "design 6.3" point into it).

The `rebaseline` unit is one task, R0, in phase R. It checks that the
design still matches the code after item 6 (harness primitives and direct
drive) has merged, and it records the baseline that later gates compare
against. It writes no code and handles no opcode.

- Phase: R. It runs before every other task (design 6.2 step 1).
- Under N33 the coordinator runs R0 now, before this plan is approved
  (design 2, approval condition 1).
- Worktree: `proto-rebaseline`, created with the command of contract 0.1,
  branch renamed to `proto/area-rebaseline`.
- Owned paths: `docs/plans/` files only (contract 2.1). R0 itself edits no
  repo file. It writes a report to the path its brief names. The
  coordinator reads the report and edits the design where the code moved.

Dependents: S0-1a to S0-5 (through S0-1a). T-1 to T-5 landed before R0
was pushed (plan index, "State at plan time"). R0 is met: the design
edit is commit `91780c8e`, and the eval baseline moves to the Gate R
baseline round of the plan index.

---

## Task R0: Re-baseline the design on the merged item 6

**codeArea:** `rebaseline`. **Phase:** R. **Size:** S.

**Files:**

- Report: the path the brief names (outside the repo; contract 0.11).
- Edit (coordinator, after the report):
  `docs/plans/2026-09-27-protocol-coverage-design.md`, only the sections
  the report shows are stale (design 6.3 names 3.10 "Tools" and the
  shared-edit table of 3.11), plus section 1.9 of
  `docs/plans/2026-09-27-protocol-coverage-plan/contract.md` if a name or
  type of contract 1.9 moved (contract precedence rule 3). R0 edits
  section 1.9 of the contract, not section 2.1.

**Depends on:** item 6 fully merged (R3, R11). The design found all five
item 6 issues closed at `71fba0ab` (design 6.1); R0 confirms it.

**Opcodes:** none.

**Steps** (design 6.3; no behaviour change, so no failing test):

1. List every item 6 slice (#419, #420, #423, #424, #427 and any later
   issue, including the extension-provided or MCP-exposed tools slice that
   #424 names) with `gh issue view` and `gh pr list`, and record each
   state. If any slice is still open, stop and report `blocked`: no code
   may start (R11).
2. Re-read `packages/harness/src/contract/result.ts`,
   `tools/game-tool.ts`, `tools/registry.ts` and `tools/define.ts`.
   Record whether `ToolName` is still a closed union and whether an
   extension can register a game tool. If either changed, report the
   rewrite that design 3.10 "Tools" and the 3.11 shared-edit table need.
3. Re-read `world/service.ts` and `world/hub.ts`: `version`, the key
   lists, whether `Sender` is exported, whether `Claim` has keys that
   clash with `areas`, and whether acts still need a claim.
4. Re-read `docs/harness.md`: the "ten" lines (`:5`, `:118` per design
   3.10), the tool table (`:122-133`, contract 2.6) and the world-service
   section.
5. Grep `ReadonlySet<ToolName>`, `Record<ToolName`, `Record<RunKind` and
   `Set<LogEvent>` under `packages/harness/src` for new kind-bound sets.
6. Check `events/router.test.ts` for the hook count, `subscribeAll`
   (`events/router.ts:185` at `71fba0ab`) for new hooks, and
   `loops/game.ts` for new one-word keys that a code-area name of design
   5.1 could shadow.
7. Check `log/query.ts` (`QUIET_DOMAINS`, the journal page size) and the
   PLAY hand-back note's kept prefixes in `drive/note.ts`.
8. Check `grader/scenario.schema.json` (`id`, `events`) and
   `grader/spawn-slots.ts`.
9. Check `tools/define.ts` `ACTING` and the PLAY refusal path.
10. Compare the ten-tool text, `ToolName`, `Claim` and `EVENT_KEYS` with
    contract 1.9 and record each match or mismatch (contract 2.1).
11. Run `mise ci:checks` once on the head of
    `origin/factory/426-protocol-coverage` and record the result and the
    test count.
12. (Deferred.) The Gate R baseline round of the plan index runs the four
    gate scenarios (`t1-walk-to-npc`, `t7-halt-resume`,
    `t3-ghostlands-kill`, `t0-hostiles`) with `--round 0` on
    `origin/factory/426-protocol-coverage` at the R0 push. R0 did not run
    them (design 6.6). A failure there does not block the build: on
    `main`, `t3-ghostlands-kill` fails (no kill credit, only gray mobs)
    and `t7-halt-resume` failed once from a stale `life/low_health` wake.

**Proof:** the report and the `mise ci:checks` result of step 11. The
eval baseline is the Gate R round (step 12). No live packet proof: R0 owns no
opcode. If the game server or SOAP is down, R0 records the `mise ci:checks`
baseline, reports the outage and stops (contract 0.6).

**Commit** (coordinator, only if step 2-10 findings change the design or
the contract):

```
docs: Re-baseline the protocol design on item 6

Item 6 moved code that the design's tool and world-service model rests
on. This updates the stale sections so step 0 and the areas build on
the code as it is.
```

If nothing moved, there is no commit. The report is the record, and the
coordinator quotes the baseline verdicts in the morning record (design
6.7).

---

## Dead opcodes

None. R0 handles no opcode, so the unit has no dead opcodes.

## COMPLETE
