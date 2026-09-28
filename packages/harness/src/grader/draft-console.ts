import { CONSOLE_FILE, type ConsoleRow } from "#harness/grader/console-read";
import { isRecord, parseJsonOutput } from "#harness/grader/exec";
import type { ScenarioCheck } from "#harness/grader/scenarios";

export type ConsoleLog = { row: ConsoleRow; line: number }[];

export type ConsoleFill = { met: boolean; observed: unknown; ref?: string };

export async function readConsoleLog(runDir: string): Promise<ConsoleLog> {
  const handle = Bun.file(`${runDir}/${CONSOLE_FILE}`);
  if (!(await handle.exists())) return [];
  return (await handle.text()).split("\n").flatMap((text, index) => {
    const row = parseJsonOutput(text);
    return isRecord(row) && typeof row["id"] === "string"
      ? [{ line: index + 1, row: row as ConsoleRow }]
      : [];
  });
}

export function fillConsole(
  log: ConsoleLog,
  { evidence, id }: ScenarioCheck,
): ConsoleFill {
  const read = evidence?.console;
  if (read === undefined)
    return {
      met: false,
      observed: { reason: "the check has no console read" },
    };
  const found = log.find(({ row }) => row.id === id);
  if (found === undefined)
    return {
      met: false,
      observed: { reason: `${CONSOLE_FILE} has no row for ${id}` },
    };
  const { account, arg, code, text, verb } = found.row;
  const matched = new RegExp(read.match, "m").test(text);
  return {
    met: code === 0 && matched,
    observed: { account, arg, code, match: read.match, matched, text, verb },
    ref: `${CONSOLE_FILE}:${found.line}`,
  };
}
