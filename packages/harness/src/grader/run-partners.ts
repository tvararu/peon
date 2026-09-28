import type { Clock } from "#harness/contract/services";
import {
  type AccountNames,
  applySetup,
  createAccount,
  RunAbort,
} from "#harness/grader/accounts";
import type { Exec } from "#harness/grader/exec";
import {
  type Partner,
  type PartnerTrack,
  readersOf,
  readPartner,
  stepPartner,
} from "#harness/grader/partner";
import type { Scenario } from "#harness/grader/scenarios";
import type { TriggerRow } from "#harness/grader/watch";

const PARTNER_START_MS = 120_000;
const PARTNER_STOP_MS = 60_000;

export type PartnerSpec = Pick<Partner, "kind" | "role"> & { preset: string };

type PartnersInit = {
  exec: Exec;
  runDir: string;
  partners: Partner[];
};

export function partnerSpecs(scenario: Scenario): PartnerSpec[] {
  if (scenario.partner === null) return [];
  return [{ kind: scenario.partner, preset: scenario.preset, role: "partner" }];
}

export async function createPartners(
  init: PartnersInit & { owner: string; log: (line: string) => void },
  specs: readonly PartnerSpec[],
): Promise<void> {
  for (const { kind, preset, role } of specs) {
    const names = await createAccount({ ...init, preset, role });
    init.partners.push({ kind, names, role });
    init.log(`${role} ${names.account} ${names.character}`);
  }
}

export async function placePartners(
  { exec, partners, runDir }: PartnersInit,
  step: Scenario["setup"][number] | undefined,
): Promise<void> {
  if (step === undefined) return;
  for (const { names } of partners)
    await applySetup({ account: names.account, exec, runDir, setup: [step] });
}

export async function startPartners({
  exec,
  partners,
}: Omit<PartnersInit, "runDir">): Promise<void> {
  for (const { names, role } of partners) {
    const { code, stderr } = await exec([names.wrapper, "start", "--json"], {
      timeoutMs: PARTNER_START_MS,
    });
    if (code !== 0)
      throw new RunAbort(
        "launch_failed",
        `${role} start exited ${code}: ${stderr.trim()}`,
      );
  }
}

export function stopPartner(exec: Exec, { names }: Partner): Promise<unknown> {
  return exec([names.wrapper, "stop"], { timeoutMs: PARTNER_STOP_MS });
}

export function witnessOf(partners: readonly Partner[]): string | undefined {
  return partners.find(({ kind }) => kind === "witness")?.names.wrapper;
}

export type PartnerRun = PartnersInit & {
  clock: Clock;
  agent: AccountNames | undefined;
  scenario: Scenario;
};

export async function actPartners(
  run: PartnerRun,
  track: PartnerTrack,
  triggers: readonly TriggerRow[],
): Promise<boolean> {
  const actions = run.scenario.partnerActions ?? [];
  const { agent } = run;
  if (agent === undefined || run.partners.length === 0 || actions.length === 0)
    return false;
  const before = track.cursor.index;
  await stepPartner({ ...run, actions, agent, track, triggers });
  return track.cursor.index > before;
}

export async function readPartners(run: PartnerRun): Promise<void> {
  if (run.agent === undefined) return;
  const readers = readersOf(run.partners, run.scenario.partnerActions ?? []);
  for (const partner of readers) await readPartner({ ...run, partner });
}
