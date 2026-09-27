import type { ClientConfig, NoticeEvent, WorldHandle } from "@peon/core";
import { messageOf } from "@peon/core/lib/errors";
import {
  authWithRetry,
  opcodeName,
  type PacketCounts,
  worldSession,
} from "@peon/core/session";
import { loadAccount } from "#tools/probe-account";
import type {
  FlowStep,
  ProbeArgs,
  ProbeStep,
  SendStep,
} from "#tools/probe-args";
import { type Json, loadFlows, type ProbeFlow } from "#tools/probe-flows";
import {
  createProbeSink,
  type ProbeSink,
  type TracePaths,
} from "#tools/probe-sink";

export type ProbeDeps = {
  root: string;
  login?: (config: ClientConfig) => Promise<WorldHandle>;
  logoutMs?: number;
};

type Arrival = { count: number; firstAt: number };
type SentRow = { opcode: string; size: number; at: number };
type FlowRow = { flow: string; args: Record<string, string> } & (
  | { result: Json }
  | { error: string }
);
type NoticeRow = { opcode: string; label: string; text: string; at: number };

export type ProbeReport = {
  account: string;
  character?: string;
  sent: SentRow[];
  flows: FlowRow[];
  received: Record<string, Arrival>;
  notices: NoticeRow[];
  packetErrors: { opcode: string; error: string }[];
  missing: string[];
  counts: PacketCounts | null;
  trace: TracePaths;
  error?: string;
};

export type ProbeResult = { code: 0 | 1 | 2 | 3; report: ProbeReport };

type Session = {
  handle: WorldHandle;
  sink: ProbeSink;
  report: ProbeReport;
  flows: Map<string, ProbeFlow>;
};

const LOGOUT_MS = 30_000;

async function sessionLogin(config: ClientConfig): Promise<WorldHandle> {
  const auth = await authWithRetry(config, { maxAttempts: 2 });
  return worldSession(config, auth);
}

function isFlow(step: ProbeStep): step is FlowStep {
  return "flow" in step;
}

function unknownFlows(
  steps: ProbeStep[],
  flows: Map<string, ProbeFlow>,
): string[] {
  return steps
    .filter(isFlow)
    .map((s) => s.flow)
    .filter((name) => !flows.has(name));
}

function sendStep({ sink, report }: Session, step: SendStep): void {
  const body = Buffer.from(step.body ?? "", "hex");
  sink.send(step.opcode, body);
  report.sent.push({
    at: Date.now(),
    opcode: opcodeName(step.opcode),
    size: body.byteLength,
  });
}

async function runFlow(
  session: Session,
  { flow: name, args }: FlowStep,
): Promise<boolean> {
  const run = session.flows.get(name)?.run;
  const outcome = await Promise.resolve()
    .then(() => run?.({ args, handle: session.handle }) ?? null)
    .then(
      (result) => ({ result }),
      (error: unknown) => ({ error: messageOf(error) }),
    );
  session.report.flows.push({ args, flow: name, ...outcome });
  return !("error" in outcome);
}

async function runSteps(session: Session, list: ProbeStep[]): Promise<boolean> {
  let ok = true;
  for (const step of list)
    if (isFlow(step)) ok = (await runFlow(session, step)) && ok;
    else sendStep(session, step);
  return ok;
}

function watch({ handle, report }: Session): () => void {
  const offs = [
    handle.onNotice(({ opcode, label, text, at }: NoticeEvent) =>
      report.notices.push({ at, label, opcode: opcodeName(opcode), text }),
    ),
    handle.onPacketError((opcode, error) =>
      report.packetErrors.push({
        error: error.message,
        opcode: opcodeName(opcode),
      }),
    ),
  ];
  return () => {
    for (const off of offs) off();
  };
}

async function logOut(handle: WorldHandle, ms: number): Promise<void> {
  handle.logout();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  await Promise.race([handle.closed, timeout]);
  clearTimeout(timer);
  handle.close();
  await handle.closed;
}

function emptyReport(account: string, trace: TracePaths): ProbeReport {
  const report = { account, counts: null, flows: [], missing: [], notices: [] };
  return { ...report, packetErrors: [], received: {}, sent: [], trace };
}

async function play(
  session: Session,
  args: ProbeArgs,
  deps: ProbeDeps,
): Promise<boolean> {
  const unwatch = watch(session);
  const ok = await runSteps(session, args.steps);
  await session.sink.waitFor(args.until, args.waitMs);
  unwatch();
  await logOut(session.handle, deps.logoutMs ?? LOGOUT_MS);
  return ok;
}

function exitCode(ok: boolean, report: ProbeReport): ProbeResult["code"] {
  if (!ok) return 1;
  return report.missing.length > 0 ? 3 : 0;
}

export async function runProbe(
  args: ProbeArgs,
  deps: ProbeDeps,
): Promise<ProbeResult> {
  const sink = createProbeSink({
    account: args.account,
    bodies: args.bodies,
    out: args.out,
    root: deps.root,
  });
  const report = emptyReport(args.account, sink.paths);
  const flows = await loadFlows();
  const unknown = unknownFlows(args.steps, flows);
  if (unknown.length > 0)
    return {
      code: 2,
      report: { ...report, error: `unknown flow ${unknown.join(", ")}.` },
    };
  try {
    const config = await loadAccount(deps.root, args.account);
    report.character = config.character;
    const handle = await (deps.login ?? sessionLogin)({
      ...config,
      trace: sink.trace,
    });
    const ok = await play({ flows, handle, report, sink }, args, deps).catch(
      async (error: unknown) => {
        handle.close();
        await handle.closed;
        throw error;
      },
    );
    Object.assign(report, await sink.finish(args.expect));
    return { code: exitCode(ok, report), report };
  } catch (error) {
    Object.assign(report, await sink.finish(args.expect));
    return { code: 1, report: { ...report, error: messageOf(error) } };
  }
}
