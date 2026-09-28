const HOME = process.env.HOME;
const SESSION = "2e70352c-5c4b-4546-af18-8c852f2bf87d";
const PROJECT = `${HOME}/.claude/projects/${`${HOME}/orca/workspaces/peon/ribboneel`.replaceAll("/", "-")}`;
const TRANSCRIPT = `${PROJECT}/${SESSION}.jsonl`;
const SUBAGENTS = `${PROJECT}/${SESSION}/subagents`;
const JOURNALS = `${SUBAGENTS}/workflows`;
const EXCLUDE = process.argv.slice(2);

type Kind = "workflow" | "agent" | "fork";
type Usage = Record<string, number>;
type Run = { kind: Kind; task: string; wf?: string; start: string; end?: string; status?: string; script?: string; resume?: string; usage?: Usage; estimate?: Usage };
const runs = new Map<string, Run>();
const uses = new Map<string, { ts: string; name: string; input: Record<string, unknown> }>();
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];
const scriptName = (input: Record<string, unknown>) =>
  ((input.script as string | undefined)?.match(/name: '([\w.-]+)'/)?.[1] ??
    (input.scriptPath as string | undefined)?.split("/").pop()?.replace(/\.js$/, ""))?.replace(/^.*-and-harness-recon$/, "reference-and-harness-recon");

for (const line of (await Bun.file(TRANSCRIPT).text()).split("\n")) {
  if (!line) continue;
  const j = JSON.parse(line);
  const blocks = Array.isArray(j.message?.content) ? j.message.content : [];
  for (const b of blocks) {
    if (b.type === "tool_use" && ["Workflow", "Agent", "SendMessage"].includes(b.name)) uses.set(b.id, { ts: j.timestamp, name: b.name, input: b.input });
    if (b.type !== "tool_result" || !uses.has(b.tool_use_id)) continue;
    const t = strings(b.content).join("\n");
    const u = uses.get(b.tool_use_id);
    if (!u) continue;
    if (u.name === "SendMessage") {
      const to = u.input.to as string;
      runs.set(`fork:${to}`, { kind: "fork", task: to, start: u.ts, script: `SendMessage fork of ${to}` });
      continue;
    }
    const task = u.name === "Agent" ? t.match(/agentId: (\w+)/)?.[1] : t.match(/Task ID: (\w+)/)?.[1];
    if (!task) continue;
    runs.set(task, {
      kind: u.name === "Agent" ? "agent" : "workflow",
      task,
      start: u.ts,
      wf: t.match(/workflows\/(wf_[0-9a-f-]+)/)?.[1],
      script: u.name === "Agent" ? `Agent: ${u.input.description}` : scriptName(u.input),
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
      r.script ??= n.match(/scripts\/([\w.-]+)-wf_/)?.[1];
      const usage = n.match(/<usage>([\s\S]*?)<\/usage>/)?.[1] ?? "";
      r.usage = Object.fromEntries([...usage.matchAll(/<(\w+)>(\d+)<\/\1>/g)].map((x) => [x[1], Number(x[2])]));
    }
  }
}

type Agent = { first: string; last: string; tokens: number; tools: number };
const readAgent = async (path: string): Promise<Agent | undefined> => {
  const f = Bun.file(path);
  if (!(await f.exists())) return undefined;
  const lines = (await f.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const turns = lines.filter((l) => l.type === "assistant" && l.message?.usage);
  const u = turns.at(-1)?.message.usage ?? {};
  const ids = new Set(lines.filter((l) => l.type === "assistant").flatMap((l) => (Array.isArray(l.message?.content) ? l.message.content : [])).filter((c: { type: string }) => c.type === "tool_use").map((c: { id: string }) => c.id));
  return {
    first: turns[0]?.timestamp ?? "",
    last: turns.at(-1)?.timestamp ?? "",
    tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    tools: ids.size,
  };
};
const toUsage = (as: Agent[]): Usage => ({
  agent_count: as.length,
  subagent_tokens: as.reduce((s, a) => s + a.tokens, 0),
  tool_uses: as.reduce((s, a) => s + a.tools, 0),
  duration_ms: as.length ? Date.parse(as.map((a) => a.last).sort().at(-1) ?? "") - Date.parse(as.map((a) => a.first).sort()[0] ?? "") : 0,
});

const all = [...runs.values()]
  .filter((r) => !EXCLUDE.includes(r.wf ?? "") && !EXCLUDE.includes(r.task))
  .sort((a, b) => a.start.localeCompare(b.start));
const flows = all.filter((r) => r.kind === "workflow");
const started = new Map<string, number>();
for (const wf of new Set(flows.map((r) => r.wf ?? ""))) {
  const f = Bun.file(`${JOURNALS}/${wf}/journal.jsonl`);
  if (!(await f.exists())) continue;
  started.set(wf, (await f.text()).split("\n").filter((l) => l.includes('"type":"started"')).length);
}

for (const r of all) {
  if (r.usage?.subagent_tokens) continue;
  if (r.kind === "workflow") {
    const next = flows.find((o) => o.wf === r.wf && o.start > r.start)?.start ?? "9999";
    const dir = `${JOURNALS}/${r.wf}`;
    const files = [...new Bun.Glob("agent-*.jsonl").scanSync(dir)];
    const agents = (await Promise.all(files.map((f) => readAgent(`${dir}/${f}`)))).filter((a): a is Agent => !!a && a.first >= r.start && a.first < next);
    r.estimate = toUsage(agents);
  } else {
    const a = await readAgent(`${SUBAGENTS}/agent-${r.task}.jsonl`);
    const own = a && a.first >= r.start ? [a] : [];
    r.estimate = toUsage(own);
  }
}

const sum = (rs: Run[], k: string, pick: (r: Run) => Usage | undefined) => rs.reduce((s, r) => s + (pick(r)?.[k] ?? 0), 0);
const keys = ["agent_count", "subagent_tokens", "tool_uses", "duration_ms"];
const block = (rs: Run[], pick: (r: Run) => Usage | undefined) => ({
  launches: rs.filter((r) => pick(r)).length,
  ...Object.fromEntries(keys.map((k) => [k, sum(rs, k, pick)])),
});
for (const r of all) {
  const u = r.usage?.subagent_tokens ? r.usage : r.estimate;
  console.log([r.kind, r.start.slice(0, 16), r.end?.slice(0, 16) ?? "-", r.wf ?? "-", r.task, r.status ?? "-", r.script ?? "-", r.resume ? `resume ${r.resume}` : "", r.kind === "workflow" ? (started.get(r.wf ?? "") ?? 0) : 1, r.usage?.subagent_tokens ? "record" : "estimate", ...keys.map((k) => u?.[k] ?? "-")].join("\t"));
}
const recorded = (r: Run) => (r.usage?.subagent_tokens ? r.usage : undefined);
const estimated = (r: Run) => (r.usage?.subagent_tokens ? undefined : r.estimate);
console.log(JSON.stringify({
  workflows: {
    launches: flows.length,
    runs: new Set(flows.map((r) => r.wf)).size,
    scripts: new Set(flows.map((r) => r.script)).size,
    journalStarts: [...started.values()].reduce((a, b) => a + b, 0),
    recorded: block(flows, recorded),
    estimated: block(flows, estimated),
  },
  agentTool: { recorded: block(all.filter((r) => r.kind === "agent"), recorded), estimated: block(all.filter((r) => r.kind === "agent"), estimated) },
  forks: { estimated: block(all.filter((r) => r.kind === "fork"), estimated) },
}));
