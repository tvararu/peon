import { appendFile } from "node:fs/promises";
import type { Clock } from "#harness/contract/services";
import type { AccountNames } from "#harness/grader/accounts";
import { type Exec, parseJsonOutput } from "#harness/grader/exec";
import type { PartnerAction } from "#harness/grader/scenarios";
import { describeAt, dueSteer, type SteerCursor } from "#harness/grader/steer";
import type { TriggerRow } from "#harness/grader/watch";

export const PARTNER_READ_EVERY_MS = 5000;

const ACTION_TIMEOUT_MS = 30_000;
const READ_TIMEOUT_MS = 10_000;

export type PartnerTrack = {
  cursor: SteerCursor;
  windowEnd: number | undefined;
  readAt: number | undefined;
};

type PartnerInit = {
  exec: Exec;
  clock: Clock;
  runDir: string;
  agent: AccountNames;
  partner: AccountNames;
};

type StepInit = PartnerInit & {
  actions: readonly PartnerAction[];
  track: PartnerTrack;
  triggers: readonly TriggerRow[];
};

export function newPartnerTrack(since: number): PartnerTrack {
  return {
    cursor: { index: 0, since },
    readAt: undefined,
    windowEnd: undefined,
  };
}

export function expandArgv(
  argv: readonly string[],
  { agent, partner }: { agent: string; partner: string },
): string[] {
  return argv.map((arg) =>
    arg.replaceAll("<AGENT>", agent).replaceAll("<PARTNER>", partner),
  );
}

export async function readPartner({
  exec,
  clock,
  runDir,
  partner,
}: PartnerInit): Promise<void> {
  const { code, stdout } = await exec([partner.wrapper, "read", "--json"], {
    timeoutMs: READ_TIMEOUT_MS,
  });
  const row = {
    code,
    events: parseJsonOutput(stdout) ?? null,
    ms: clock.now(),
  };
  await appendFile(`${runDir}/partner-read.jsonl`, `${JSON.stringify(row)}\n`);
}

async function fire(init: StepInit, action: PartnerAction): Promise<void> {
  const { agent, clock, exec, partner, runDir, track } = init;
  const argv = expandArgv(action.argv, {
    agent: agent.character,
    partner: partner.character,
  });
  const ms = clock.now();
  const { code, stderr } = await exec([partner.wrapper, ...argv], {
    timeoutMs: ACTION_TIMEOUT_MS,
  });
  const row = {
    actor: "partner",
    code,
    ms,
    text: argv.join(" "),
    trigger: describeAt(action.at),
  };
  await appendFile(`${runDir}/steers.jsonl`, `${JSON.stringify(row)}\n`);
  if (code !== 0)
    throw new Error(
      `partner ${argv[0]} exited ${code}: ${stderr.trim().split("\n").at(-1) ?? ""}`,
    );
  track.cursor = { index: track.cursor.index + 1, since: ms };
  track.windowEnd = ms + action.windowMs;
}

export async function stepPartner(init: StepInit): Promise<void> {
  const { actions, clock, track, triggers } = init;
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
  await readPartner(init);
}
