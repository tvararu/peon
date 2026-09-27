import { isRecord, parseJsonOutput } from "#harness/grader/exec";
import type { EvalConditions } from "#harness/grader/result";
import type { Scenario } from "#harness/grader/scenarios";

const SCENARIO_SHA_LENGTH = 12;

async function readText(path: string): Promise<string | undefined> {
  const file = Bun.file(path);
  return (await file.exists()) ? file.text() : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function jevModelsOf(jevLog: string): string[] {
  const models = jevLog.split("\n").flatMap((line) => {
    const row = parseJsonOutput(line);
    const model = isRecord(row) && row["type"] === "result" && row["model"];
    return typeof model === "string" ? [model] : [];
  });
  return [...new Set(models)].sort();
}

export function scenarioSha(scenario: Scenario): string {
  return new Bun.CryptoHasher("sha256")
    .update(JSON.stringify(scenario))
    .digest("hex")
    .slice(0, SCENARIO_SHA_LENGTH);
}

export async function conditionsOf(
  runDir: string,
  scenario: Scenario,
): Promise<EvalConditions> {
  const meta = parseJsonOutput((await readText(`${runDir}/meta.json`)) ?? "");
  const jevLog = (await readText(`${runDir}/jev.jsonl`)) ?? "";
  const known = isRecord(meta) ? meta : {};
  return {
    harnessSha: text(known["gitSha"]),
    jevModels: jevModelsOf(jevLog),
    model: text(known["model"]),
    scenarioSha: scenarioSha(scenario),
    thinking: text(known["thinking"]),
  };
}
