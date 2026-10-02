import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { createTraceSink } from "#factory/soap-create";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { force: true, recursive: true });
});
function scratch(): string {
  const dir = mkdtempSync(`${tmpdir()}/create-trace-`);
  dirs.push(dir);
  return dir;
}

describe("createTraceSink", () => {
  test("asks for packet bodies", () => {
    expect(createTraceSink(scratch()).bodies).toBe(true);
  });

  test("appends one JSON row per packet, creating a private directory", () => {
    const dir = `${scratch()}/nested/trace`;
    const sink = createTraceSink(dir);
    sink.row({ at: 1, dir: "out", opcode: 54, size: 21 });
    sink.row({ at: 2, dir: "in", opcode: 58, size: 1 });
    const lines = readFileSync(`${dir}/packets.jsonl`, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines.map((row) => row.opcode)).toEqual([54, 58]);
    expect((statSync(dir).mode % 0o1000).toString(8)).toBe("700");
  });
});
