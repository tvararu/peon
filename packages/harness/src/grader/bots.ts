import { messageOf } from "@tuicraft/core/lib/errors";
import { SOAP } from "#harness/grader/accounts";
import { type Exec, isRecord, parseJsonOutput } from "#harness/grader/exec";
import { writeJson } from "#harness/grader/run-finish";
import type { BotRisk, Scenario } from "#harness/grader/scenarios";

const HEALTH_MS = 20_000;

export type Bots =
  | {
      source: "health";
      count: number;
      charactersInWorld: number;
      factoryOnline: number;
      playersOnline: number;
      risk: BotRisk | "none";
    }
  | { source: "health"; count: null; error: string; risk: BotRisk };

const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export async function readBots(exec: Exec, catalogue: BotRisk): Promise<Bots> {
  try {
    const { code, stderr, stdout } = await exec([...SOAP, "health"], {
      timeoutMs: HEALTH_MS,
    });
    if (code !== 0)
      throw new Error(`soap health exited ${code}: ${stderr.trim()}`);
    const health = parseJsonOutput(stdout);
    if (!isRecord(health) || typeof health["charactersInWorld"] !== "number")
      throw new Error("soap health gave no charactersInWorld");
    const charactersInWorld = num(health["charactersInWorld"]);
    const factoryOnline = num(health["factoryOnline"]);
    const playersOnline = num(health["playersOnline"]);
    const count = Math.max(
      0,
      charactersInWorld - factoryOnline - playersOnline,
    );
    return {
      charactersInWorld,
      count,
      factoryOnline,
      playersOnline,
      risk: count === 0 ? "none" : catalogue,
      source: "health",
    };
  } catch (err) {
    return {
      count: null,
      error: messageOf(err),
      risk: catalogue,
      source: "health",
    };
  }
}

type RecordInit = {
  exec: Exec;
  runDir: string;
  scenario: Scenario;
  log: (line: string) => void;
};

export async function recordBots({
  exec,
  runDir,
  scenario,
  log,
}: RecordInit): Promise<void> {
  const bots = await readBots(exec, scenario.botRisk);
  const file = `${runDir}/run.json`;
  const run: unknown = await Bun.file(file).json();
  await writeJson(file, { ...(isRecord(run) ? run : {}), bots });
  log(
    bots.count === null
      ? `bots unknown (${bots.error}; risk ${bots.risk})`
      : `bots ${bots.count} (risk ${bots.risk})`,
  );
}
