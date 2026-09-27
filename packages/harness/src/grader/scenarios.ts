import t0Hostiles from "./scenarios/t0-hostiles.json" with { type: "json" };
import t0SelfState from "./scenarios/t0-self-state.json" with { type: "json" };
import t0WhoIsNear from "./scenarios/t0-who-is-near.json" with { type: "json" };
import t1WalkToNpc from "./scenarios/t1-walk-to-npc.json" with { type: "json" };
import t2WhisperReply from "./scenarios/t2-whisper-reply.json" with {
  type: "json",
};
import t3GhostlandsKill from "./scenarios/t3-ghostlands-kill.json" with {
  type: "json",
};
import t3KillOneHunter from "./scenarios/t3-kill-one-hunter.json" with {
  type: "json",
};
import t4AllianceFirst from "./scenarios/t4-alliance-first.json" with {
  type: "json",
};
import t4QuestFirst from "./scenarios/t4-quest-first.json" with {
  type: "json",
};
import t5VendorBuyGoldshire from "./scenarios/t5-vendor-buy-goldshire.json" with {
  type: "json",
};
import t6DieAndRecover from "./scenarios/t6-die-and-recover.json" with {
  type: "json",
};
import t7HaltResume from "./scenarios/t7-halt-resume.json" with {
  type: "json",
};
import t7QuestionWhileActing from "./scenarios/t7-question-while-acting.json" with {
  type: "json",
};

export type TriggerName =
  | "fight_start"
  | "kill"
  | "death"
  | "movement_start"
  | "answer_text"
  | "steer_landed";

export type SteerAt =
  | { kind: "trigger"; trigger: TriggerName; nth?: number; delayMs?: number }
  | { kind: "elapsed"; ms: number };

export type PartnerAction = { at: SteerAt; argv: string[]; windowMs: number };

export type ScenarioCheck = {
  id: string;
  source: "truth" | "verifier" | "witness" | "game_log" | "session" | "frame";
  expect: string;
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

const SCENARIOS: Readonly<Record<string, unknown>> = {
  "t0-hostiles": t0Hostiles,
  "t0-self-state": t0SelfState,
  "t0-who-is-near": t0WhoIsNear,
  "t1-walk-to-npc": t1WalkToNpc,
  "t2-whisper-reply": t2WhisperReply,
  "t3-ghostlands-kill": t3GhostlandsKill,
  "t3-kill-one-hunter": t3KillOneHunter,
  "t4-alliance-first": t4AllianceFirst,
  "t4-quest-first": t4QuestFirst,
  "t5-vendor-buy-goldshire": t5VendorBuyGoldshire,
  "t6-die-and-recover": t6DieAndRecover,
  "t7-halt-resume": t7HaltResume,
  "t7-question-while-acting": t7QuestionWhileActing,
};

export function loadScenario(id: string): Scenario {
  if (!Object.hasOwn(SCENARIOS, id))
    throw new Error(`unknown scenario: ${id} (known: ${ROUND_1.join(", ")})`);
  return SCENARIOS[id] as Scenario;
}
