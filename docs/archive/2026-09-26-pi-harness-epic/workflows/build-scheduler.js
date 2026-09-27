export const meta = {
  name: 'pi-epic-build',
  description: 'Build the Pi harness epic by readiness: per-area Orca worktrees, builder then reviewer per task, serialised batched landings onto epic/pi-harness, gate check at the end of the phase',
  phases: [
    { title: 'Setup', detail: 'plan fix-up commit, task index as JSON' },
    { title: 'Build', detail: 'builders and reviewers per task, by readiness' },
    { title: 'Land', detail: 'serialised landings onto epic/pi-harness' },
    { title: 'Gate', detail: 'full checks at the phase gate, PR status' },
  ],
}
const M = { model: 'opus', effort: 'medium' }
const REPO = '/path/to/tuicraft'
const WORKSPACES = '/path/to/orca/workspaces/tuicraft'
const EPIC = `${WORKSPACES}/pi-epic`
const BUILD_DIR = `${REPO}/tmp/pi-epic/build`
const PLAN = 'docs/plans/2026-09-26-pi-harness-epic-plan.md'
const PDIR = 'docs/plans/2026-09-26-pi-harness-epic-plan'
const SPEC = 'docs/plans/2026-09-26-pi-harness-epic-design.md'
const A = args || {}
const PHASE = A.phase || '1'
const AREAS = ['core-a', 'core-b', 'found', 'log-events', 'ops-tools-a', 'ops-tools-b', 'ui', 'prompt-docs', 'eval-infra']
const wt = (area) => `${WORKSPACES}/pi-epic-${area}`

const COMMON = `
Standing rules (strict):
- Never change ${REPO} (the main checkout) except report files under ${BUILD_DIR}/. Never touch other worktrees than the one named in your task.
- grep, find and head are shell functions here: use rg, /usr/bin/find, "command head". On Linux call orca-ide, never bare orca.
- Commit with "mise exec -- git commit"; push only when your task says so, with "mise exec -- git push" (the hk pre-push hook runs the full mise ci --publish; let it run; never --no-verify; never force). Never create merge commits (GitHub GH013). Conventional Commit subjects of at most 50 characters with a why body, per AGENTS.md. No Claude attribution anywhere.
- Worktrees must be clean at push time (hk clean-worktree check): put scratch files only under the worktree's tmp/ (gitignored). Never create *.test.ts files under tmp/.
- earlyoom prefers killing bun: a test run that dies with SIGKILL mid-suite is memory pressure, not a regression. Check "journalctl -u earlyoom --since -10min" before you diagnose, then re-run.
- Live steps: only throwaway soap accounts you create ("bun packages/factory/src/main.ts soap create <preset>" with umask 077, JSON to a 0600 file), one character per agent, delete them before you finish (also on failure). Never print passwords. Never touch ADMIN, DEITY, X, Y, AUCTIONHOUSE, TCFACTORY, TCPRESETS, RNDBOT*, or Xiara. Never run the CLI or live tests from ${REPO}. The soap reaper is off; you clean up.
- Ownership exception (coordinator ruling 2026-09-27): any task may add minimal methods to packages/harness/test-support/fake-pi.ts when its own code needs them to register with Pi; keep the fake's existing behaviour and record it in the commit body.
- Precedence: the spec (${SPEC}) wins over the plan; the plan wins over your own preference. If a plan step's test or code is wrong against the spec or against the real code, fix it to match the spec and record the deviation in the commit body and in your report.
`
const BUILD = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'failed', 'blocked'] },
    commits: { type: 'array', items: { type: 'string' } },
    deviations: { type: 'array', items: { type: 'string' } },
    testsBefore: { type: 'string' }, testsAfter: { type: 'string' },
    smoke: { type: 'string', description: 'result of any smoke or gate test the task defines (for example V3), or "n/a"' },
    reportPath: { type: 'string' }, summary: { type: 'string' },
  },
  required: ['status', 'commits', 'deviations', 'testsBefore', 'testsAfter', 'smoke', 'reportPath', 'summary'],
}
const REVIEW = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fix'] },
    findings: { type: 'array', items: { type: 'string' } },
    correctedPlanTests: { type: 'array', items: { type: 'string' } },
    reportPath: { type: 'string' },
  },
  required: ['verdict', 'findings', 'correctedPlanTests', 'reportPath'],
}
const LAND = {
  type: 'object',
  properties: { status: { type: 'string', enum: ['landed', 'conflict', 'failed'] }, head: { type: 'string' }, detail: { type: 'string' } },
  required: ['status', 'head', 'detail'],
}
const INDEX = {
  type: 'object',
  properties: {
    tasks: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, area: { type: 'string', enum: AREAS }, title: { type: 'string' }, deps: { type: 'array', items: { type: 'string' } } }, required: ['id', 'area', 'title', 'deps'] } },
    note: { type: 'string' },
  },
  required: ['tasks', 'note'],
}

phase('Setup')
const setup = await agent(`${COMMON}
Work in the epic worktree ${EPIC} (branch epic/pi-harness). Run "git pull --ff-only".
${PHASE === '1' ? `First make one docs commit with these approved conditions (the advisor approved the plan in the maintainer's place on 2026-09-26):
1. In ${PLAN} and ${PDIR}/ui.md: U10 depends on U11a, so U11a comes first (swap the index rows and the ui.md order). State in the execution mechanics that builders take any ready task (all dependencies landed, same-area dependencies at least reviewed), not index order; move F5c after F8a in the found order. Rename L10b's reference "F5a" to "F5ab".
2. In ${SPEC} section 2, subsection "Decisions taken during spec review, not yet ruled by the maintainer", add: contract decisions D1 (grader tooling lives in packages/harness/src/grader/, not devtools) and D2 (the P6 watcher is tracked in the repo), and D3-D16 by reference to ${PDIR}/contract.md section 5; plus two advisor rulings: a named engage on a tappedByOther target returns REFUSED tapped_by_other with a Next line (attacking a tapped mob yields nothing and a small model cannot know that; update the plan task that resolves named targets, ops-tools-b.md near the resolveUnit step, with the test); the harness login retry authWithRetry(maxAttempts: 2) is accepted as a transient-failure retry, separate from settlement 8, which binds the grader.
3. Run mise lint:docs and mise format; commit "docs: Settle plan order and pending rulings" with a why body; push. Then update PR #367's body "## Status" with the plan commit (9dc0483, 4014bc3, and this one) and "build started (phase 1)" using gh api REST (repos/tvararu/tuicraft/pulls/367 PATCH).
` : ''}Then extract the task index from ${PLAN} (the task index table) as JSON: every task id, its area (one of ${AREAS.join(', ')}), its title, and its depends-on ids exactly as the index lists them (after the fix above). Check the count (127) and that every dependency id exists. Return the structured result; put any irregularity in "note".`, { ...M, label: 'setup', phase: 'Setup', schema: INDEX })
if (!setup || !setup.tasks || setup.tasks.length < 100) return { error: 'index extraction failed', setup }
const tasks = setup.tasks
const byId = {}
for (const t of tasks) byId[t.id] = t
log(`index: ${tasks.length} tasks; ${setup.note}`)

const closure = (ids) => {
  const s = new Set()
  const st = [...ids]
  while (st.length) {
    const x = st.pop()
    if (s.has(x) || !byId[x]) continue
    s.add(x)
    st.push(...byId[x].deps)
  }
  return s
}
const targetIds = A.targets === 'all' ? tasks.map(t => t.id) : A.targets || [...tasks.filter(t => t.area === 'core-a' || t.area === 'core-b').map(t => t.id), 'F8a']
const target = closure(targetIds)
const landedIn = new Set(A.landed || [])
const status = {}
for (const id of target) status[id] = landedIn.has(id) ? 'landed' : 'pending'
log(`phase ${PHASE}: ${target.size} tasks in scope (${[...target].filter(i => status[i] === 'pending').length} to build)`)

const results = {}
const areaReviewed = {}
const areaBusy = {}
const areaStopped = {}
for (const a of AREAS) { areaReviewed[a] = []; areaBusy[a] = false }
let landChain = Promise.resolve()

const depOk = (t, d) => status[d] === 'landed' || (status[d] === 'reviewed' && byId[d] && byId[d].area === t.area) || !target.has(d) && landedIn.has(d)
const isReady = (id) => status[id] === 'pending' && byId[id].deps.every(d => depOk(byId[id], d))
const nextReady = (area) => tasks.map(t => t.id).find(id => target.has(id) && byId[id].area === area && isReady(id))

const taskText = (t) => `Task ${t.id} ("${t.title}") in area ${t.area}. Read, in your worktree: the task section for ${t.id} in ${PDIR}/${t.area}.md; ${PDIR}/contract.md (names, types, file ownership; the rules in its section 0); the "Global Constraints" and "Review Focus" sections of ${PLAN}. Read the spec ${SPEC} only where the task cites it.`

const ensureWt = (area) => `Your worktree is ${wt(area)} on branch epic/area-${area}. If "git -C ${REPO} worktree list" has no such path, create it: read "orca-ide worktree create --help", then run it with --repo path:${REPO} --name pi-epic-${area} --base-branch origin/epic/pi-harness --setup run --parent-worktree active --comment "owner: coordinator (Claude session tuicraft-ce), Pi harness epic area ${area}" and no agent; wait until setup (mise trust, mise bundle, mkdir tmp) finishes; then rename the branch with "git -C ${wt(area)} branch -m epic/area-${area}". In the worktree: "git fetch -q origin", then "git rebase origin/epic/pi-harness" (your area branch may hold reviewed commits that have not landed yet; keep them; resolve conflicts carefully, keeping both sides' intent).`

const buildPrompt = (t) => `${COMMON}
${ensureWt(t.area)}
${taskText(t)}
Implement the task exactly as its steps say, test first: write the failing test, run it and see it fail, implement, run and see it pass. Then run "mise typecheck <package>" and "mise test packages/<package>" for each package you touched (and "mise lint" on your files). Commit as the task's commit step says (exact git add paths). Do not push. If the task defines a smoke or gate test (for example V3 in F8a), run it and report the result in "smoke". If a dependency's code is missing or wrong so that you cannot finish, stop with status "blocked" and say exactly what is missing.
Write your report to ${BUILD_DIR}/${t.id}.md (mkdir -p): what you did, deviations from the plan with reasons, test counts before and after, and anything the next tasks must know. Return the structured result.`

const reviewPrompt = (t, b) => `${COMMON}
You review task ${t.id} independently. Worktree ${wt(t.area)} (branch epic/area-${t.area}); the builder's commits: ${b.commits.join(', ')}. Do not read the builder's transcript; you may read its report ${b.reportPath}. ${taskText(t)}
Check: the diff touches only the files the task owns (contract section 3 and the task's Files list); the tests fail without the change (in a scratch copy under the worktree's tmp/, revert the non-test files of these commits, run the task's tests, confirm they fail, then delete the scratch copy); the tests pass with it; Luna-facing and human-facing texts match the spec/design verbatim; no comments, no biome-ignore, files under 500 non-blank lines, type-only (no interface or enum), no mock.module, no secrets; the commit message follows AGENTS.md; each deviation the builder recorded is justified by the spec or the real code. ${t.id === 'F6b' ? 'This is F6b, the BOOT gate: in addition, start an Orca terminal pane in the area worktree, run the harness with --check (it must exit 0) and then a --no-connect boot, capture orca-ide terminal read --screen, confirm the footer, the widgets and the banner render, quit cleanly, close the pane, and report it.' : ''} ${t.id === 'F8d' ? 'This is F8d: run its second test (the hidden role custom message injected on a wake run reaches the model) and report pass or fail explicitly in findings.' : ''} ${t.id === 'B13' ? 'This is B13: run the settlement-1 tests (engage retargets a new attacker while count allows; otherwise names it in Danger) and list every plan test you or the builder had to correct in correctedPlanTests.' : ''}
Do not commit. Verdict "pass" or "fix" with concrete findings (file:line). Write your report to ${BUILD_DIR}/${t.id}.review.md. Return the structured result.`

const fixPrompt = (t, b, r) => `${COMMON}
${ensureWt(t.area)}
${taskText(t)}
A reviewer asked for fixes to your task's commits (${b.commits.join(', ')}). Findings: ${JSON.stringify(r.findings)}. Fix each one (new commits on the area branch are fine; do not rewrite history that is already on origin). Re-run the task's tests and the per-package checks. Update ${BUILD_DIR}/${t.id}.md. Return the structured result (commits = all commits of this task).`

const landPrompt = (area, ids) => `${COMMON}
You land reviewed work. Worktree ${wt(area)} (branch epic/area-${area}); it holds reviewed commits for tasks ${ids.join(', ')}. Steps: "git fetch -q origin"; "git rebase origin/epic/pi-harness" (resolve conflicts carefully, keeping both sides' intent; if a conflict needs a design decision, stop with status "conflict" and explain); run "mise typecheck" and "mise test" for every package the commits touch; then "mise exec -- git push origin HEAD:epic/pi-harness" (the pre-push hook runs the full ci; if it fails, diagnose: earlyoom kill or flaky test means re-run; a real failure means stop with status "failed" and name the test). If the push is rejected because the branch moved, fetch, rebase again, re-run the checks, and retry. Never force. Report the new origin/epic/pi-harness head. Return the structured result.`

const requestLand = (area) => {
  const ids = [...areaReviewed[area]]
  if (!ids.length) return landChain
  areaReviewed[area] = []
  landChain = landChain.then(async () => {
    const l = await agent(landPrompt(area, ids), { ...M, label: `land:${area}:${ids.join('+')}`, phase: 'Land', schema: LAND })
    if (l && l.status === 'landed') { for (const i of ids) status[i] = 'landed'; log(`landed ${ids.join(', ')} at ${l.head}`) }
    else { for (const i of ids) status[i] = 'blocked'; log(`landing failed for ${ids.join(', ')}: ${l ? l.detail : 'no result'}`) }
    for (const i of ids) results[i] = { ...(results[i] || {}), land: l }
  })
  return landChain
}

const shouldLand = (t) => {
  const waiting = [...target].some(x => status[x] === 'pending' && byId[x].area !== t.area && byId[x].deps.includes(t.id))
  const more = nextReady(t.area)
  return waiting || areaReviewed[t.area].length >= 3 || !more
}

const runTask = async (id) => {
  const t = byId[id]
  let b = await agent(buildPrompt(t), { ...M, label: `build:${id}`, phase: 'Build', schema: BUILD })
  if (!b || b.status !== 'done') { status[id] = 'blocked'; areaStopped[t.area] = true; results[id] = { build: b }; log(`blocked in build: ${id}; area ${t.area} stopped`); return }
  let r = await agent(reviewPrompt(t, b), { ...M, label: `review:${id}`, phase: 'Build', schema: REVIEW })
  if (r && r.verdict === 'fix') {
    b = await agent(fixPrompt(t, b, r), { ...M, label: `fix:${id}`, phase: 'Build', schema: BUILD })
    if (b && b.status === 'done') r = await agent(reviewPrompt(t, b), { ...M, label: `review2:${id}`, phase: 'Build', schema: REVIEW })
  }
  results[id] = { build: b, review: r }
  if (!b || b.status !== 'done' || !r || r.verdict !== 'pass') { status[id] = 'blocked'; areaStopped[t.area] = true; log(`blocked in review: ${id}; area ${t.area} stopped`); return }
  status[id] = 'reviewed'
  areaReviewed[t.area].push(id)
  if (shouldLand(t)) await requestLand(t.area)
}

phase('Build')
const running = new Set()
while (true) {
  for (const area of AREAS) {
    if (areaBusy[area] || areaStopped[area]) continue
    const id = nextReady(area)
    if (!id) continue
    areaBusy[area] = true
    status[id] = 'building'
    const p = runTask(id).catch(e => { status[id] = 'blocked'; log(`error in ${id}: ${e}`) }).then(() => { areaBusy[area] = false; running.delete(p) })
    running.add(p)
  }
  if (running.size === 0) {
    const pendingLand = AREAS.filter(a => areaReviewed[a].length && !areaStopped[a])
    if (!pendingLand.length) break
    for (const a of pendingLand) requestLand(a)
    await landChain
    continue
  }
  await Promise.race([...running])
}
await landChain

const summary = {}
for (const id of target) summary[id] = status[id]
const blocked = [...target].filter(i => status[i] !== 'landed')
const deviations = [...target].flatMap(i => ((results[i] && results[i].build && results[i].build.deviations) || []).map(d => `${i}: ${d}`))
const smokes = [...target].filter(i => results[i] && results[i].build && results[i].build.smoke && results[i].build.smoke !== 'n/a').map(i => `${i}: ${results[i].build.smoke}`)
log(`phase ${PHASE}: ${[...target].filter(i => status[i] === 'landed').length}/${target.size} landed; not landed: ${blocked.join(', ') || 'none'}`)

phase('Gate')
const gate = await agent(`${COMMON}
Phase ${PHASE} gate check. In the epic worktree ${EPIC}: "git pull --ff-only"; run "mise ci:checks" and report pass counts. Tasks not landed in this phase: ${blocked.join(', ') || 'none'}. Smoke results: ${smokes.join('; ') || 'none reported'}. Update PR #367's body "## Status" (gh api REST PATCH repos/tvararu/tuicraft/pulls/367; keep the first paragraph) with a line for phase ${PHASE}: tasks landed (count), the epic head sha, the gate result, and blocked tasks. Do not commit. Return a 6-line summary with the head sha and the ci result.`, { ...M, label: 'gate', phase: 'Gate' })

return { phase: PHASE, landed: [...target].filter(i => status[i] === 'landed'), blocked, deviations, smokes, gate, reviewFindings: Object.fromEntries([...target].filter(i => results[i] && results[i].review && results[i].review.correctedPlanTests && results[i].review.correctedPlanTests.length).map(i => [i, results[i].review.correctedPlanTests])) }