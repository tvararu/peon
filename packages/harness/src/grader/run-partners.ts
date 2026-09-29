import { messageOf } from "@peon/core/lib/errors";
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
import { readTruth } from "#harness/grader/truth";
import type { TriggerRow } from "#harness/grader/watch";

const PARTNER_START_MS = 120_000;
const PARTNER_STOP_MS = 60_000;

export type PartnerSpec = Pick<Partner, "kind" | "role"> & { preset: string };

type PartnersInit = {
  exec: Exec;
  runDir: string;
  partners: Partner[];
};

const NUMBERED = ["partner1", "partner2", "partner3", "partner4"] as const;

export function partnerSpecs(scenario: Scenario): PartnerSpec[] {
  const { partner, partners } = scenario;
  if (partners !== undefined)
    return partners.map(({ preset, role }, index) => {
      const numbered = NUMBERED[index];
      if (numbered === undefined)
        throw new Error(
          `${scenario.id} has more than ${NUMBERED.length} partners`,
        );
      return { kind: role, preset, role: numbered };
    });
  return partner === null
    ? []
    : [{ kind: partner, preset: scenario.preset, role: "partner" }];
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
  scenario?: Pick<Scenario, "partnerSetup">,
): Promise<void> {
  if (step !== undefined)
    for (const { names } of partners)
      await applySetup({ account: names.account, exec, runDir, setup: [step] });
  for (const { actor = 1, body, endpoint } of scenario?.partnerSetup ?? []) {
    const partner = partners[actor - 1];
    if (partner === undefined) continue;
    await applySetup({
      account: partner.names.account,
      exec,
      runDir,
      setup: [{ body, endpoint }],
    });
  }
}

export const partnerTruthFile = (
  runDir: string,
  { role }: Pick<Partner, "role">,
  when: "baseline" | "final",
): string => `${runDir}/${role}-${when}.json`;

async function partnerBaseline(
  { exec, runDir }: PartnersInit,
  partner: Partner,
): Promise<void> {
  const truth = await readTruth(exec, partner.names.account).catch(
    (err: unknown) => {
      throw new RunAbort("service_down", messageOf(err), { cause: err });
    },
  );
  await Bun.write(
    partnerTruthFile(runDir, partner, "baseline"),
    `${JSON.stringify(truth, null, 2)}\n`,
  );
  if (truth.online)
    throw new RunAbort(
      "other",
      `${partner.role} baseline truth says the character is online`,
    );
}

export async function startPartners(init: PartnersInit): Promise<void> {
  const { exec, partners } = init;
  for (const partner of partners) {
    await partnerBaseline(init, partner);
    const { names, role } = partner;
    const { code, stderr } = await exec(
      [names.wrapper, "start", "--json", "--packet-trace", "headers"],
      { timeoutMs: PARTNER_START_MS },
    );
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
