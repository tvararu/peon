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

export type PartnerAction = { at: SteerAt; argv: string[]; windowMs: number };

export type BotRisk = "low" | "med" | "high";

export type CheckMeasure =
  | "answer_time"
  | "answer_values"
  | "kill_after_answer"
  | "kill_xp"
  | "max_attackers"
  | "no_fight_after_stop"
  | "pet_attack";

export type TruthPick =
  | "alive"
  | "inventory"
  | "level"
  | "money"
  | "quests"
  | "totalXp";

export type TruthDelta = "money" | "totalXp";

export type CheckEvidence = {
  truth?: TruthPick[];
  delta?: TruthDelta[];
  items?: number[];
  point?: { x: number; y: number };
  events?: string[];
  ids?: number[];
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
  "t3-kill-one-hunter",
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

export function parseScenario(file: string, value: unknown): Scenario {
  const errors = schemaErrors(SCHEMA, value);
  const stem = file.replace(JSON_FILE, "");
  if (errors.length === 0 && (value as Scenario).id !== stem)
    errors.push(`$.id: expected ${stem}`);
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
