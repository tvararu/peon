export const meta = {
  name: 'pi-epic-eval-round',
  description: 'One eval round: land fix briefs (fix, review, land), refresh the eval worktree, run scenarios in a 6-pane pool with Opus graders, cluster friction into next-round briefs, record in spec and PR',
  phases: [
    { title: 'Fix', detail: 'fix briefs from the previous round, per area worktree' },
    { title: 'Run', detail: 'graders run scenarios in Orca panes, 6 at a time' },
    { title: 'Cluster', detail: 'friction clusters into at most 4 briefs' },
    { title: 'Record', detail: 'spec section 11 and a PR #367 comment' },
  ],
}
const M = { model: 'opus', effort: 'medium' }
const REPO = '/path/to/tuicraft'
const WORKSPACES = '/path/to/orca/workspaces/tuicraft'
const EVAL = `${WORKSPACES}/pi-epic-eval`
const EPIC = `${WORKSPACES}/pi-epic`
const A = args || {}
const ROUND = A.round
const BRIEFS = A.briefs || []
const POOL = A.pool || 6
const REPLICAS = A.replicas || 1
const OUT = `${REPO}/tmp/pi-epic/evals/round-${ROUND}`
const DESIGN = 'docs/plans/2026-09-26-pi-harness-epic/harness-design.md'
const SPEC = 'docs/plans/2026-09-26-pi-harness-epic-design.md'
const COMMON = `Rules: grep/find/head are shell functions here: use rg, /usr/bin/find, "command head". On Linux call orca-ide, never bare orca; close every pane you create. Commit with "mise exec -- git commit"; push with "mise exec -- git push origin HEAD:epic/pi-harness" (pre-push runs full ci; never --no-verify, never force, no merge commits; on rejection fetch, rebase, re-run checks, retry). Conventional Commit subjects of at most 50 characters with a why body; no Claude attribution. earlyoom may SIGKILL bun under load: re-run before diagnosing. Worktrees must be clean at push time; scratch only under the worktree's tmp/. Live: only throwaway soap accounts (umask 077, JSON to a 0600 file), delete them before you finish (also on failure), never print passwords, never touch ADMIN, DEITY, X, Y, AUCTIONHOUSE, TCFACTORY, TCPRESETS, RNDBOT* or Xiara, never run the CLI or live tests from ${REPO}. The spec ${SPEC} and the design ${DESIGN} win over any plan text; Luna-facing texts follow the design unless a brief says otherwise; record every deviation in the commit body. Any task may add minimal methods to packages/harness/test-support/fake-pi.ts. Keep the legacy shell green (mise ci). Before starting in a worktree: git fetch -q origin && git rebase origin/epic/pi-harness.`
const ensureWt = (area) => `Your worktree is ${WORKSPACES}/pi-epic-${area} (branch epic/area-${area}). If "git -C ${REPO} worktree list" has no such path, create it with orca-ide worktree create --repo path:${REPO} --name pi-epic-${area} --base-branch origin/epic/pi-harness --setup run --parent-worktree active --comment "owner: coordinator (Claude session tuicraft-ce), Pi harness epic area ${area}" (no agent), wait for setup, then "git -C ${WORKSPACES}/pi-epic-${area} branch -m epic/area-${area}".`
const pool = async (items, n, fn) => {
  const out = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k) }
  })
  await Promise.all(workers)
  return out
}

phase('Fix')
const fixUnit = async (b) => {
  const wt = `${WORKSPACES}/pi-epic-${b.area}`
  const tag = `r${ROUND}:${b.key}`
  let f = await agent(`${COMMON}\n${ensureWt(b.area)}\nFix brief ${b.key} from eval round ${ROUND - 1} (title: ${b.title}). ${b.brief}\nUse test-driven development: failing test first, then the fix. Run "mise typecheck harness", "mise test packages/harness" (and other packages you touch), and "mise lint". Commit in logical commits. Do not push. Write a report to ${OUT}/fix-${b.key}.md (mkdir -p). Return a 6-line summary with commit shas and deviations.`, { ...M, label: `fix:${tag}`, phase: 'Fix' })
  const review = () => agent(`${COMMON}\nReview fix brief ${b.key} independently in ${wt}: the commits in "git log origin/epic/pi-harness..HEAD". Brief: ${b.brief}\nCheck the brief is met with evidence; tests fail without the change (scratch copy under tmp/) and pass with it; Luna-facing texts match the design or the brief; no comments, no biome-ignore, files under 500 non-blank lines, type-only, no mock.module; mise test packages/harness green. Do not commit. First line "pass" or "fix", then findings with file:line.`, { ...M, label: `review:${tag}`, phase: 'Fix' })
  let r = await review()
  if (!String(r).trim().toLowerCase().startsWith('pass')) {
    f = await agent(`${COMMON}\nWorktree ${wt}. The reviewer asked for fixes to brief ${b.key}: ${String(r).slice(0, 4000)}\nFix each finding, re-run the tests, commit. Update ${OUT}/fix-${b.key}.md. Return a 5-line summary.`, { ...M, label: `fix2:${tag}`, phase: 'Fix' })
    r = await review()
  }
  if (!String(r).trim().toLowerCase().startsWith('pass')) return { key: b.key, landed: false, review: String(r).slice(0, 1200) }
  const l = await agent(`${COMMON}\nLand brief ${b.key} from ${wt}: rebase on origin/epic/pi-harness, run "mise typecheck" and "mise test" for touched packages, push HEAD:epic/pi-harness. First line: the new head sha.`, { ...M, label: `land:${tag}`, phase: 'Fix' })
  return { key: b.key, landed: true, head: String(l).split('\n')[0], summary: String(f).slice(0, 600) }
}
const byArea = {}
for (const b of BRIEFS) (byArea[b.area] = byArea[b.area] || []).push(b)
const fixes = (await parallel(Object.values(byArea).map(list => async () => {
  const res = []
  for (const b of list) res.push(await fixUnit(b))
  return res
}))).filter(Boolean).flat()
log(`round ${ROUND} fixes: ${fixes.map(f => `${f.key}:${f.landed ? 'landed' : 'NOT landed'}`).join(', ') || 'none'}`)

phase('Run')
const prep = await agent(`${COMMON}
Prepare eval round ${ROUND}. If "git -C ${REPO} worktree list" has no ${EVAL}, create it: orca-ide worktree create --repo path:${REPO} --name pi-epic-eval --base-branch origin/epic/pi-harness --setup run --parent-worktree active --comment "owner: coordinator (Claude session tuicraft-ce), Pi harness eval runs" (no agent), wait for setup, then "git -C ${EVAL} branch -m epic/eval". In ${EVAL} (branch epic/eval; this worktree never commits): "git fetch -q origin && git reset --hard origin/epic/pi-harness && mise bundle". Confirm: "mise eval scenario" lists the round-1 ids; soap health is ok (bun packages/factory/src/main.ts soap health); the codex credential is valid for at least 2 hours (bun packages/harness/src/entry.ts --check with any throwaway profile, or the credential status command docs/harness.md names; print only the expiry); TYPESAFE_API_KEY present (true/false); the soap reaper timer is inactive; no leftover eval panes (orca-ide terminal list) and no leftover FAC accounts from earlier rounds in "soap list" (names only; delete leftovers you can prove are eval accounts older than 1 hour). Then print each scenario id with its time budget in seconds (from "mise eval scenario <id>"). Return JSON only: {"head": "<sha>", "ok": true|false, "problems": [..], "scenarios": [{"id": "...", "budgetSec": n}]}`, { ...M, label: `prep:r${ROUND}`, phase: 'Run', schema: { type: 'object', properties: { head: { type: 'string' }, ok: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } }, scenarios: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, budgetSec: { type: 'number' } }, required: ['id', 'budgetSec'] } } }, required: ['head', 'ok', 'problems', 'scenarios'] } })
if (!prep || !prep.ok) return { round: ROUND, fixes, prep, error: 'prep failed' }
const wanted = A.scenarios ? prep.scenarios.filter(s => A.scenarios.includes(s.id)) : prep.scenarios
const runs = []
for (const s of wanted) for (let r = 1; r <= REPLICAS; r++) runs.push({ ...s, replica: r })
runs.sort((a, b) => b.budgetSec - a.budgetSec)
log(`round ${ROUND}: ${runs.length} runs at head ${prep.head}, pool ${POOL}`)

const GRADE = {
  type: 'object',
  properties: {
    scenario: { type: 'string' }, replica: { type: 'number' }, runDir: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'fail', 'blocked', 'aborted'] },
    checksMet: { type: 'number' }, checksTotal: { type: 'number' },
    abortCause: { type: 'string' },
    efficiency: { type: 'object', properties: { turns: { type: 'number' }, toolCalls: { type: 'number' }, wallSec: { type: 'number' }, firstActionSec: { type: 'number' }, tokensIn: { type: 'number' }, tokensOut: { type: 'number' }, toolErrors: { type: 'number' } }, required: ['turns', 'toolCalls', 'wallSec'] },
    friction: { type: 'array', items: { type: 'object', properties: { area: { type: 'string', enum: ['tool', 'event', 'prompt', 'panel', 'core', 'eval'] }, target: { type: 'string' }, category: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, quote: { type: 'string' }, suggestedFix: { type: 'string' } }, required: ['area', 'target', 'category', 'severity', 'quote', 'suggestedFix'] } },
    notes: { type: 'string' },
  },
  required: ['scenario', 'replica', 'runDir', 'verdict', 'checksMet', 'checksTotal', 'efficiency', 'friction', 'notes'],
}
const grades = (await pool(runs, POOL, (s) => agent(`${COMMON}
You grade one eval run. From the eval worktree root ${EVAL} (do not change its files outside tmp/), run: "mise eval run ${s.id} --round ${ROUND} --replica ${s.replica}". It creates the throwaway account, launches the real harness (gpt-6-luna, high) in an Orca pane, types the task and steers, captures frames, reads final truth and writes a draft result; wait for it to finish (budget ${s.budgetSec} s plus up to 5 minutes for logout and truth). Then read the run dir it prints (result draft, grader/, gamelog.jsonl, session.jsonl, tools.json, runs.jsonl, frames/) and grade per the eval suite (docs/plans/2026-09-26-pi-harness-epic/eval-suite.md: four verdicts, server-confirmed checks only, efficiency, friction). For every friction item give the area (tool, event, prompt, panel, core, or eval for grader and scenario defects), the exact target (tool name, domain/event, panel, core file, or scenario file), a category, a severity, a verbatim quote from the session, a game-log row or a frame, and a concrete suggested fix. Separate "the harness told it wrong" (tool, event, core) from "it misread" (prompt). Write the final graded file and run "mise eval result <run-dir> <file>" so result.json validates. If the run aborted, say the cause with evidence. Close any pane left open and make sure the account is deleted. Return the structured grade.`, { ...M, label: `grade:${s.id}#${s.replica}`, phase: 'Run', schema: GRADE }))).filter(Boolean)
const pass = grades.filter(g => g.verdict === 'pass').length
const aborted = grades.filter(g => g.verdict === 'aborted').length
log(`round ${ROUND}: ${pass}/${grades.length} pass, ${aborted} aborted`)

phase('Cluster')
const CL = {
  type: 'object',
  properties: {
    passRate: { type: 'number' }, abortRate: { type: 'number' },
    medianToolCalls: { type: 'number' }, medianWallSec: { type: 'number' },
    summary: { type: 'string' },
    briefs: { type: 'array', items: { type: 'object', properties: { key: { type: 'string' }, area: { type: 'string', enum: ['core-a', 'core-b', 'found', 'log-events', 'ops-tools-a', 'ops-tools-b', 'ui', 'prompt-docs', 'eval-infra'] }, title: { type: 'string' }, brief: { type: 'string' }, evidence: { type: 'string' } }, required: ['key', 'area', 'title', 'brief', 'evidence'] } },
    deferred: { type: 'array', items: { type: 'string' } },
  },
  required: ['passRate', 'abortRate', 'medianToolCalls', 'medianWallSec', 'summary', 'briefs', 'deferred'],
}
const cluster = await agent(`${COMMON}
You cluster eval round ${ROUND}. Grades (JSON): ${JSON.stringify(grades).slice(0, 60000)}
Fix briefs landed before this round: ${JSON.stringify(fixes).slice(0, 3000)}
1. Compute pass rate, abort rate, median tool calls and wall time. Compare with earlier rounds if ${REPO}/tmp/pi-epic/evals/ holds them.
2. Cluster friction by area + target + category; rank by (number of runs hit) x severity. Read the run dirs to confirm the top clusters (quote evidence).
3. Write at most 4 builder briefs for the next round, highest impact first. Each brief: key (short slug), area (which area worktree builds it: tool work in ops-tools-a or ops-tools-b, events and log in log-events, UI in ui, prompt text in prompt-docs, core in core-a, grader and scenarios in eval-infra), title, a precise brief (what is wrong, the evidence, the exact behaviour and texts to produce, the tests to add, and which scenario should flip), and evidence (run dirs). Prefer fixes that remove a whole class of friction. Put scenario or grader defects in an eval-infra brief. Put everything else in "deferred" with one line each.
4. Write ${OUT}/cluster.md with the table of runs, the clusters and the briefs (mkdir -p).
Return the structured result.`, { ...M, label: `cluster:r${ROUND}`, phase: 'Cluster', schema: CL })

phase('Record')
const record = await agent(`Work in ${EPIC} (branch epic/pi-harness); "git pull --ff-only" first. grep/find/head are shell functions: use rg, /usr/bin/find, "command head". No Claude attribution. Commit via "mise exec -- git commit", push via "mise exec -- git push" (on rejection: fetch, rebase, retry; never force).
Record eval round ${ROUND} in ${SPEC} section 11 under an "Eval round ${ROUND}" heading: head ${prep.head}; fix briefs landed before the round (${fixes.map(f => `${f.key} ${f.landed ? f.head : 'not landed'}`).join('; ') || 'none'}); the table of runs (scenario, verdict, checks, tool calls, turns, wall time, first action); pass rate, abort rate, medians; the top friction clusters; the briefs chosen for the next round and the deferred list. Source: ${OUT}/cluster.md and this data: ${JSON.stringify({ grades: grades.map(g => ({ s: g.scenario, r: g.replica, v: g.verdict, c: `${g.checksMet}/${g.checksTotal}`, e: g.efficiency, cause: g.abortCause || '' })), cluster: cluster && { passRate: cluster.passRate, abortRate: cluster.abortRate, medianToolCalls: cluster.medianToolCalls, medianWallSec: cluster.medianWallSec, summary: cluster.summary, briefs: cluster.briefs.map(b => b.key + ': ' + b.title), deferred: cluster.deferred } }).slice(0, 20000)}
Add any behaviour-changing decision the fix briefs made to the build decisions list. Run mise lint:docs and mise format. Commit "docs: Record eval round ${ROUND}" (why body), push. Then post a comment on PR #367 with the round summary (gh api repos/tvararu/tuicraft/issues/367/comments -f body=...; plain text, no attribution), and update "## Status" in the PR body with one line for the round. Return a 4-line summary with the sha and the comment URL.`, { ...M, label: `record:r${ROUND}`, phase: 'Record' })

return { round: ROUND, head: prep.head, fixes, pass, total: grades.length, aborted, grades: grades.map(g => ({ s: g.scenario, v: g.verdict, c: `${g.checksMet}/${g.checksTotal}`, calls: g.efficiency.toolCalls, wall: g.efficiency.wallSec, cause: g.abortCause || '' })), cluster, record }