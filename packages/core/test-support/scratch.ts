import { afterAll } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../../tmp/test-scratch");

export function scratchDir(prefix: string): string {
  mkdirSync(ROOT, { recursive: true });
  const dir = mkdtempSync(join(ROOT, `${prefix}-`));
  afterAll(() => rmSync(dir, { force: true, recursive: true }));
  return dir;
}
