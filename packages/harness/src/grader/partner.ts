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

export type PartnerTrack = {
  cursor: SteerCursor;
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

export function actorOf(partners: readonly Partner[]): Partner {
  const partner = partners[0];
  if (partner === undefined) throw new Error("the scenario has no partner");
  return partner;
}

export function readersOf(
  partners: readonly Partner[],
  actions: readonly PartnerAction[],
): Partner[] {
  return actions.length === 0 || partners.length === 0
    ? []
    : [actorOf(partners)];
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
  const partner = actorOf(partners);
  const argv = expandArgv(action.argv, {
    agent: agent.character,
    partner: partner.names.character,
  });
  const ms = clock.now();
  const { code, stderr } = await exec([partner.names.wrapper, ...argv], {
    timeoutMs: ACTION_TIMEOUT_MS,
  });
  const row = {
    actor: partner.role,
    code,
    ms,
    text: argv.join(" "),
    trigger: describeAt(action.at),
  };
  await appendFile(`${runDir}/steers.jsonl`, `${JSON.stringify(row)}\n`);
  if (code !== 0)
    throw new Error(
      `${partner.role} ${argv[0]} exited ${code}: ${stderr.trim().split("\n").at(-1) ?? ""}`,
    );
  track.cursor = { index: track.cursor.index + 1, since: ms };
  track.windowEnd = ms + action.windowMs;
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
