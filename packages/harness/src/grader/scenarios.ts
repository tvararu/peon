import { type Schema, schemaErrors } from "#harness/grader/json-schema";
import schema from "./scenario.schema.json" with { type: "json" };

export type TriggerName =
  | "fight_start"
  | "kill"
  | "death"
  | "movement_start"
  | "answer_text"
  | "steer_landed"
  | "task_landed";

export type SteerAt =
  | { kind: "trigger"; trigger: TriggerName; nth?: number; delayMs?: number }
  | { kind: "elapsed"; ms: number };

export type PartnerAction = {
  at: SteerAt;
  argv: string[];
  windowMs: number;
  actor?: number;
};

export type ScenarioPartner = { role: "partner" | "witness"; preset: string };

export const MAX_PARTNERS = 4;

export type BotRisk = "low" | "med" | "high";

export type CheckMeasure =
  | "answer_time"
  | "answer_values"
  | "kill_after_answer"
  | "kill_xp"
  | "max_attackers"
  | "no_fight_after_stop";

export type TruthPick =
  | "alive"
  | "bank"
  | "durability"
  | "equipment"
  | "hearth"
  | "inventory"
  | "level"
  | "mail"
  | "money"
  | "quests"
  | "reputation"
  | "spells"
  | "totalXp";

export type TruthDelta = "money" | "totalXp";

export type TruthWho =
  | "agent"
  | "partner"
  | "partner1"
  | "partner2"
  | "partner3"
  | "partner4";

export type CheckEvidence = {
  truth?: TruthPick[];
  delta?: TruthDelta[];
  items?: number[];
  point?: { x: number; y: number };
  events?: string[];
  ids?: number[];
  who?: TruthWho;
};

export type ScenarioCheck = {
  id: string;
  source: "truth" | "verifier" | "witness" | "game_log" | "session" | "frame";
  expect: string;
  evidence?: CheckEvidence;
  measure?: CheckMeasure;
  blockedBy?: string;
};

export type Scenario = {
  id: string;
  tier: number;
  preset: string;
  partner: "partner" | "witness" | null;
  setup: { endpoint: string; body: Record<string, unknown> }[];
  budget: { minutes: number; turns: number; tools: number };
  paneMinutes: number;
  task: string;
  steers: { at: SteerAt; text: string }[];
  partnerActions?: PartnerAction[];
  partners?: ScenarioPartner[];
  blockedBy?: string[];
  field?: string;
  spawn?: string;
  checks: ScenarioCheck[];
  needsWatcher: boolean;
  navBound: boolean;
  botRisk: BotRisk;
};

export const ROUND_1: readonly string[] = [
  "t4-quest-first",
  "t6-die-and-recover",
  "t4-alliance-first",
  "t7-question-while-acting",
  "t7-halt-resume",
  "t3-ghostlands-kill",
  "t1-walk-to-npc",
  "t5-vendor-buy-goldshire",
  "t2-whisper-reply",
  "t0-hostiles",
  "t0-who-is-near",
  "t0-self-state",
];

const DIR = `${import.meta.dir}/scenarios`;
const JSON_FILE = /\.json$/;
const SCHEMA = schema as unknown as Schema;

function whoErrors({ checks, partner, partners }: Scenario): string[] {
  const roles = new Set<string>([
    "agent",
    ...(partners?.map((_, index) => `partner${index + 1}`) ??
      (partner === null ? [] : ["partner"])),
  ]);
  return checks.flatMap(({ evidence }, index) => {
    const who = evidence?.who;
    return who === undefined || roles.has(who)
      ? []
      : [`$.checks[${index}].evidence.who: the scenario has no ${who}`];
  });
}

function partnerErrors(scenario: Scenario): string[] {
  const { partner, partnerActions = [], partners } = scenario;
  const count = partners?.length ?? (partner === null ? 0 : 1);
  const errors = partnerActions.flatMap(({ actor }, index) =>
    actor !== undefined && actor > count
      ? [`$.partnerActions[${index}].actor: no partner ${actor}`]
      : [],
  );
  errors.push(...whoErrors(scenario));
  if (partners === undefined) return errors;
  if (partner !== null)
    errors.push("$.partners: set partner or partners, not both");
  if (partners.length === 0) errors.push("$.partners: at least 1 partner");
  if (partners.length > MAX_PARTNERS)
    errors.push(`$.partners: at most ${MAX_PARTNERS} partners`);
  return errors;
}

export function parseScenario(file: string, value: unknown): Scenario {
  const errors = schemaErrors(SCHEMA, value);
  const stem = file.replace(JSON_FILE, "");
  if (errors.length === 0 && (value as Scenario).id !== stem)
    errors.push(`$.id: expected ${stem}`);
  if (errors.length === 0) errors.push(...partnerErrors(value as Scenario));
  if (errors.length > 0)
    throw new Error(`invalid scenario ${file}: ${errors.join("; ")}`);
  return value as Scenario;
}

async function readScenario(file: string): Promise<Scenario> {
  const value: unknown = await Bun.file(`${DIR}/${file}`)
    .json()
    .catch((error: Error) => {
      throw new Error(`invalid scenario ${file}: ${error.message}`);
    });
  return parseScenario(file, value);
}

const SCENARIOS: ReadonlyMap<string, Scenario> = new Map(
  await Promise.all(
    [...new Bun.Glob("*.json").scanSync(DIR)]
      .toSorted()
      .map(
        async (file) =>
          [file.replace(JSON_FILE, ""), await readScenario(file)] as const,
      ),
  ),
);

export const SCENARIO_IDS: readonly string[] = [...SCENARIOS.keys()];

export function loadScenario(id: string): Scenario {
  const scenario = SCENARIOS.get(id);
  if (scenario === undefined)
    throw new Error(`unknown scenario: ${id} (known: ${ROUND_1.join(", ")})`);
  return scenario;
}
