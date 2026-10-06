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

const AGENT_WAITS: Readonly<Record<string, number>> = {
  tradeAccept: TRADE_WAIT_MS,
  tradeAcceptOffered: 2 * TRADE_WAIT_MS,
  tradeAnswer: TRADE_WAIT_MS,
  tradeRequest: TRADE_WAIT_MS,
  tradeRequestQuiet: TRADE_WAIT_MS,
};

function actionTimeoutMs(argv: readonly string[]): number {
  if (argv[0] !== "call") return ACTION_TIMEOUT_MS;
  const waits = AGENT_WAITS[argv[1] ?? ""];
  if (waits === undefined) return ACTION_TIMEOUT_MS;
  return waits + WAIT_MARGIN_MS;
}

const SILENT_FAILURES: Readonly<Record<string, true>> = {
  no_offer: true,
  no_request: true,
  unanswered: true,
};

const TRADE_CONTINUE: Readonly<Record<string, true>> = {
  "no trade is open": true,
  "no trade to cancel": true,
  no_offer: true,
  no_request: true,
  "the trade is not accepted": true,
  unanswered: true,
};
const CONTINUE_CALLS: Readonly<Record<string, true>> = {
  tradeAccept: true,
  tradeAcceptOffered: true,
  tradeAnswer: true,
  tradeCancel: true,
  tradeOffer: true,
  tradeRequest: true,
  tradeRequestQuiet: true,
};

type SteerRow = {
  actor: string;
  agentSilent?: boolean;
  code: number;
  ms: number;
  text: string;
  trigger: string;
};

function silentAgent(
  method: string,
  code: number,
  stderr: string,
  timedOut: boolean,
): boolean {
  if (AGENT_WAITS[method] === undefined) return false;
  if (code === 143) return timedOut;
  if (code !== 1) return false;
  const last = stderr.trim().split("\n").at(-1) ?? "";
  return SILENT_FAILURES[last] === true;
}

export type PartnerTrack = {
  cursor: SteerCursor;
  silent: readonly string[];
  windowEnd: number | undefined;
  readAt: number | undefined;
  startedAt: number;
  reactedSeq: readonly (number | undefined)[];
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
    reactedSeq: [],
    readAt: undefined,
    silent: [],
    startedAt: since,
    windowEnd: undefined,
  };
}

export function sequentialActions(
  actions: readonly PartnerAction[],
): PartnerAction[] {
  return actions.filter((action) => action.reactive !== true);
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

async function fireReactive(
  init: StepInit,
  action: PartnerAction,
): Promise<void> {
  const { agent, clock, exec, partners, runDir, track } = init;
  const partner = actorOf(partners, action);
  const startedAt = clock.now();
  const argv = expandArgv(action.argv, {
    agent: agent.character,
    partners: partners.map(({ names }) => names.character),
  });
  const { code } = await exec([partner.names.wrapper, ...argv], {
    timeoutMs: actionTimeoutMs(action.argv),
  });
  const row: SteerRow = {
    actor: partner.role,
    code,
    ms: startedAt,
    text: argv.join(" "),
    trigger: describeAt(action.at),
  };
  await appendFile(`${runDir}/steers.jsonl`, `${JSON.stringify(row)}\n`);
  track.windowEnd = startedAt + action.windowMs;
}

async function fire(init: StepInit, action: PartnerAction): Promise<void> {
  const { agent, clock, exec, partners, runDir, track } = init;
  const partner = actorOf(partners, action);
  const argv = expandArgv(action.argv, {
    agent: agent.character,
    partners: partners.map(({ names }) => names.character),
  });
  const method = argv[0] === "call" ? argv[1] : argv[0];
  const timeoutMs = actionTimeoutMs(argv);
  const startedAt = clock.now();
  const { code, stderr } = await exec([partner.names.wrapper, ...argv], {
    timeoutMs,
  });
  const timedOut = code === 143 && clock.now() - startedAt >= timeoutMs;
  const silent = silentAgent(method ?? "", code, stderr, timedOut);
  const row: SteerRow = {
    actor: partner.role,
    code,
    ms: startedAt,
    text: argv.join(" "),
    trigger: describeAt(action.at),
  };
  if (silent) row.agentSilent = true;
  await appendFile(`${runDir}/steers.jsonl`, `${JSON.stringify(row)}\n`);
  const last = stderr.trim().split("\n").at(-1) ?? "";
  const continues =
    code === 1 &&
    argv[0] === "call" &&
    CONTINUE_CALLS[method ?? ""] === true &&
    TRADE_CONTINUE[last] === true &&
    track.silent.includes(partner.role);
  if (code === 0 || silent || continues) {
    track.silent = silent ? [...track.silent, partner.role] : track.silent;
    track.cursor = { index: track.cursor.index + 1, since: startedAt };
    track.windowEnd = startedAt + action.windowMs;
    return;
  }
  throw new Error(
    `${partner.role} ${argv[0]} exited ${code}: ${stderr.trim().split("\n").at(-1) ?? ""}`,
  );
}

const CHECK_OPEN = 2;

type CheckWave = { closeMs: number | undefined; open: TriggerRow };

function checkWaves(
  triggers: readonly TriggerRow[],
  trigger: string,
  since: number,
  windowMs: number,
): CheckWave[] {
  const waves: CheckWave[] = [];
  for (const row of triggers) {
    if (row.trigger !== trigger || row.ms <= since) continue;
    if ((row.state ?? CHECK_OPEN) !== CHECK_OPEN) {
      const pending = waves.findLast((wave) => wave.closeMs === undefined);
      if (pending !== undefined) pending.closeMs = row.ms;
      continue;
    }
    const last = waves.at(-1);
    if (
      last !== undefined &&
      last.closeMs === undefined &&
      row.ms - last.open.ms <= windowMs
    )
      continue;
    waves.push({ closeMs: undefined, open: row });
  }
  return waves;
}

function dueReactive(
  actions: readonly PartnerAction[],
  track: PartnerTrack,
  triggers: readonly TriggerRow[],
  now: number,
): { action: PartnerAction; index: number; seq: number }[] {
  const due: { action: PartnerAction; index: number; seq: number }[] = [];
  for (const [index, action] of actions.entries()) {
    if (action.reactive !== true) continue;
    const at = action.at;
    if (at.kind !== "trigger") continue;
    const answered = track.reactedSeq[index];
    const wave = checkWaves(
      triggers,
      at.trigger,
      track.startedAt,
      action.windowMs,
    ).find(
      (entry) =>
        entry.open.seq !== answered &&
        (entry.closeMs === undefined || entry.closeMs > now),
    );
    if (wave === undefined) continue;
    if (now - wave.open.ms < (at.delayMs ?? 0)) continue;
    due.push({ action, index, seq: wave.open.seq });
  }
  return due;
}

export async function stepPartner(init: StepInit): Promise<void> {
  const { actions, clock, partners, track, triggers } = init;
  const now = clock.now();
  const pending = dueReactive(actions, track, triggers, now);
  const reactedSeq = [...track.reactedSeq];
  for (const { index, seq } of pending) reactedSeq[index] = seq;
  track.reactedSeq = reactedSeq;
  const failures = (
    await Promise.allSettled(
      pending.map(({ action }) => fireReactive(init, action)),
    )
  ).filter((outcome) => outcome.status === "rejected");
  const first = failures[0];
  if (first !== undefined) throw first.reason;
  const ordered = sequentialActions(actions);
  const due = dueSteer({
    cursor: track.cursor,
    now,
    steers: ordered,
    triggers,
  });
  if (due !== undefined) await fire(init, due);
  if (
    track.cursor.index === 0 &&
    track.reactedSeq.every((hit) => hit === undefined)
  )
    return;
  if (track.readAt !== undefined && now - track.readAt < PARTNER_READ_EVERY_MS)
    return;
  track.readAt = now;
  for (const partner of readersOf(partners, actions))
    await readPartner({ ...init, partner });
}
