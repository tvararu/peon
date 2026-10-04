import { appendFile } from "node:fs/promises";
import type { Clock } from "#harness/contract/services";
import type { AccountNames, Role } from "#harness/grader/accounts";
import { type Exec, parseJsonOutput } from "#harness/grader/exec";
import type { PartnerAction } from "#harness/grader/scenarios";
import { describeAt, dueSteer, type SteerCursor } from "#harness/grader/steer";
import type { TriggerRow } from "#harness/grader/watch";

export const PARTNER_READ_EVERY_MS = 5000;

const ACTION_TIMEOUT_MS = 30_000;
const READ_TIMEOUT_MS = 10_000;
const TRADE_WAIT_MS = 60_000;
const WAIT_MARGIN_MS = 15_000;

const TRADE_CALLS: Readonly<Record<string, true>> = {
  tradeAcceptOffered: true,
  tradeAnswer: true,
  tradeRequest: true,
  tradeRequestQuiet: true,
};

export function actionTimeoutMs(argv: readonly string[]): number {
  if (argv[0] === "call" && TRADE_CALLS[argv[1] ?? ""] === true)
    return TRADE_WAIT_MS + WAIT_MARGIN_MS;
  return ACTION_TIMEOUT_MS;
}

const SILENT_FAILURES: Readonly<Record<string, true>> = {
  no_offer: true,
  no_request: true,
  unanswered: true,
};

type SteerRow = {
  actor: string;
  agentSilent?: boolean;
  code: number;
  ms: number;
  text: string;
  trigger: string;
};

function silentAgent(code: number, stderr: string): boolean {
  if (code === 143) return true;
  if (code !== 1) return false;
  const last = stderr.trim().split("\n").at(-1) ?? "";
  return SILENT_FAILURES[last] === true;
}

export type PartnerTrack = {
  cursor: SteerCursor;
  silent: boolean;
  windowEnd: number | undefined;
  readAt: number | undefined;
};

export type Partner = {
  role: Exclude<Role, "agent">;
  kind: "partner" | "witness";
  names: AccountNames;
};

type ReadInit = {
  exec: Exec;
  clock: Clock;
  runDir: string;
  partner: Partner;
};

type StepInit = Omit<ReadInit, "partner"> & {
  agent: AccountNames;
  partners: readonly Partner[];
  actions: readonly PartnerAction[];
  track: PartnerTrack;
  triggers: readonly TriggerRow[];
};

export function newPartnerTrack(since: number): PartnerTrack {
  return {
    cursor: { index: 0, since },
    readAt: undefined,
    silent: false,
    windowEnd: undefined,
  };
}

export function expandArgv(
  argv: readonly string[],
  { agent, partners }: { agent: string; partners: readonly string[] },
): string[] {
  return argv.map((arg) =>
    partners.reduce(
      (text, name, index) => text.replaceAll(`<PARTNER${index + 1}>`, name),
      arg
        .replaceAll("<AGENT>", agent)
        .replaceAll("<PARTNER>", partners[0] ?? "<PARTNER>"),
    ),
  );
}

export function actorOf(
  partners: readonly Partner[],
  { actor = 1 }: Pick<PartnerAction, "actor">,
): Partner {
  const partner = partners[actor - 1];
  if (partner === undefined)
    throw new Error(`the scenario has no partner ${actor}`);
  return partner;
}

export function readersOf(
  partners: readonly Partner[],
  actions: readonly PartnerAction[],
): Partner[] {
  if (partners.length === 0) return [];
  const actors = new Set(actions.map((action) => actorOf(partners, action)));
  return partners.filter((partner) => actors.has(partner));
}

export async function readPartner({
  exec,
  clock,
  runDir,
  partner,
}: ReadInit): Promise<void> {
  const { code, stdout } = await exec(
    [partner.names.wrapper, "read", "--json"],
    { timeoutMs: READ_TIMEOUT_MS },
  );
  const row = {
    code,
    events: parseJsonOutput(stdout) ?? null,
    ms: clock.now(),
  };
  await appendFile(
    `${runDir}/${partner.role}-read.jsonl`,
    `${JSON.stringify(row)}\n`,
  );
}

async function fire(init: StepInit, action: PartnerAction): Promise<void> {
  const { agent, clock, exec, partners, runDir, track } = init;
  const partner = actorOf(partners, action);
  const argv = expandArgv(action.argv, {
    agent: agent.character,
    partners: partners.map(({ names }) => names.character),
  });
  const ms = clock.now();
  const { code, stderr } = await exec([partner.names.wrapper, ...argv], {
    timeoutMs: actionTimeoutMs(argv),
  });
  const silent = silentAgent(code, stderr);
  const row: SteerRow = {
    actor: partner.role,
    code,
    ms,
    text: argv.join(" "),
    trigger: describeAt(action.at),
  };
  if (silent) row.agentSilent = true;
  await appendFile(`${runDir}/steers.jsonl`, `${JSON.stringify(row)}\n`);
  if (code === 0 || silent || (track.silent && argv[0] === "call")) {
    track.silent = track.silent || silent;
    track.cursor = { index: track.cursor.index + 1, since: ms };
    track.windowEnd = ms + action.windowMs;
    return;
  }
  throw new Error(
    `${partner.role} ${argv[0]} exited ${code}: ${stderr.trim().split("\n").at(-1) ?? ""}`,
  );
}

export async function stepPartner(init: StepInit): Promise<void> {
  const { actions, clock, partners, track, triggers } = init;
  const now = clock.now();
  const due = dueSteer({
    cursor: track.cursor,
    now,
    steers: actions,
    triggers,
  });
  if (due !== undefined) await fire(init, due);
  if (track.cursor.index === 0) return;
  if (track.readAt !== undefined && now - track.readAt < PARTNER_READ_EVERY_MS)
    return;
  track.readAt = now;
  for (const partner of readersOf(partners, actions))
    await readPartner({ ...init, partner });
}
