const HOME = process.env.HOME;
const SESSION = "7fa1d885-6568-4f60-ba6d-a5a41a3c39f3";
const PROJECT = `${HOME}/.claude/projects/${`${HOME}/code/tuicraft`.replaceAll("/", "-")}`;
const TRANSCRIPT = `${PROJECT}/${SESSION}.jsonl`;
const JOURNALS = `${PROJECT}/${SESSION}/subagents/workflows`;
const EXCLUDE = process.argv.slice(2);

type Run = { task: string; wf?: string; start: string; end?: string; status?: string; summary?: string; script?: string; args?: unknown; resume?: string; usage?: Record<string, number> };
const runs = new Map<string, Run>();
const uses = new Map<string, { ts: string; input: Record<string, unknown> }>();
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

for (const line of (await Bun.file(TRANSCRIPT).text()).split("\n")) {
  if (!line) continue;
  const j = JSON.parse(line);
  const blocks = Array.isArray(j.message?.content) ? j.message.content : [];
  for (const b of blocks) {
    if (b.type === "tool_use" && b.name === "Workflow") uses.set(b.id, { ts: j.timestamp, input: b.input });
    if (b.type !== "tool_result" || !uses.has(b.tool_use_id)) continue;
    const t = strings(b.content).join("\n");
    const task = t.match(/Task ID: (\w+)/)?.[1];
    const u = uses.get(b.tool_use_id);
    if (!task || !u) continue;
    runs.set(task, {
      task,
      start: u.ts,
      wf: t.match(/workflows\/(wf_[0-9a-f-]+)/)?.[1],
      summary: t.match(/Summary: (.*)/)?.[1],
      script: (u.input.scriptPath as string | undefined)?.split("/").pop(),
      args: u.input.args,
      resume: u.input.resumeFromRunId as string | undefined,
    });
  }
  for (const s of strings(j)) {
    for (const m of s.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
      const n = m[1] ?? "";
      const r = runs.get(n.match(/<task-id>(\w+)<\/task-id>/)?.[1] ?? "");
      if (!r || r.end) continue;
      r.end = j.timestamp;
      r.status = n.match(/<status>(\w+)<\/status>/)?.[1];
      r.script ??= n.match(/scripts\/([\w.-]+\.js)/)?.[1];
      const usage = n.match(/<usage>([\s\S]*?)<\/usage>/)?.[1] ?? "";
      r.usage = Object.fromEntries([...usage.matchAll(/<(\w+)>(\d+)<\/\1>/g)].map((x) => [x[1], Number(x[2])]));
    }
  }
}

const all = [...runs.values()].filter((r) => !EXCLUDE.includes(r.wf ?? "")).sort((a, b) => a.start.localeCompare(b.start));
const started = new Map<string, number>();
for (const wf of new Set(all.map((r) => r.wf ?? ""))) {
  const f = Bun.file(`${JOURNALS}/${wf}/journal.jsonl`);
  if (!(await f.exists())) continue;
  started.set(wf, (await f.text()).split("\n").filter((l) => l.includes('"type":"started"')).length);
}
const sum = (k: string) => all.reduce((s, r) => s + (r.usage?.[k] ?? 0), 0);
for (const r of all)
  console.log([r.start.slice(0, 16), r.end?.slice(0, 16) ?? "-", r.wf, r.task, r.status ?? "-", r.script?.replace(/-wf_.*/, "") ?? "-", JSON.stringify((r.args as { phase?: string; round?: number } | undefined)?.phase ?? (r.args as { round?: number } | undefined)?.round ?? ""), started.get(r.wf ?? "") ?? 0, r.usage?.agent_count ?? "-", r.usage?.subagent_tokens ?? "-", r.usage?.tool_uses ?? "-", r.usage?.duration_ms ?? "-"].join("\t"));
console.log(JSON.stringify({
  launches: all.length,
  runs: new Set(all.map((r) => r.wf)).size,
  scripts: new Set(all.map((r) => r.script?.replace(/-wf_.*/, ""))).size,
  journalStarts: [...started.values()].reduce((a, b) => a + b, 0),
  agent_count: sum("agent_count"),
  subagent_tokens: sum("subagent_tokens"),
  tool_uses: sum("tool_uses"),
  duration_ms: sum("duration_ms"),
}));
