import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { harnessStateDir, parseFlags } from "#harness/config/flags";
import { ompDbPath } from "#harness/credentials/omp-store";
import { EXIT, type MainDeps, main } from "#harness/main";
import { codexRow, writeOmpDb } from "#test-support/omp-db";

const NOW = Date.parse("2026-09-26T19:00:00Z");

let home: string;
let lines: { out: string[]; err: string[] };

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "harness-main-"));
  lines = { err: [], out: [] };
});

afterEach(async () => {
  await rm(home, { force: true, recursive: true });
});

function deps(): MainDeps {
  return {
    err: (line) => lines.err.push(line),
    home,
    interactive: async () => {
      throw new Error("the --check path must not start Pi");
    },
    now: () => NOW,
    out: (line) => lines.out.push(line),
  };
}

async function ledger(account = "FACABC0123456"): Promise<string> {
  const path = join(home, "ledger.json");
  await writeFile(
    path,
    JSON.stringify({
      account,
      character: "Fgklibhlflc",
      createdAt: "2026-09-26T00:00:00Z",
      owner: home,
      password: "pw",
      preset: "eversong10",
    }),
  );
  return path;
}

function locks(): string[] {
  const dir = join(harnessStateDir(home), "locks");
  return existsSync(dir) ? readdirSync(dir) : [];
}

describe("main --check", () => {
  test("prints the credential line, exits 0 and releases the lock", async () => {
    writeOmpDb(ompDbPath(home), [
      codexRow({ access: "tok", expires: NOW + 3_600_000 }),
    ]);
    const code = await main(
      parseFlags(["--profile", await ledger(), "--check"]),
      deps(),
    );
    expect(code).toBe(EXIT.ok);
    expect(lines.out).toEqual([
      "Codex login: valid until 2026-09-26 20:00 UTC (omp).",
    ]);
    expect(locks()).toEqual([]);
  });

  test("exits 3 when omp has no Codex login", async () => {
    const code = await main(
      parseFlags(["--profile", await ledger(), "--check"]),
      deps(),
    );
    expect(code).toBe(EXIT.credential);
    expect(lines.err).toEqual([
      "No Codex login found in omp. Run omp and log in to openai-codex. Then start the harness again.",
    ]);
    expect(locks()).toEqual([]);
  });

  test("exits 3 without --check when the login expires in under 10 minutes", async () => {
    writeOmpDb(ompDbPath(home), [
      codexRow({ access: "tok", expires: NOW + 300_000 }),
    ]);
    expect(await main(parseFlags(["--profile", await ledger()]), deps())).toBe(
      EXIT.credential,
    );
  });

  test("refuses a protected account before it takes a lock", async () => {
    const code = await main(
      parseFlags(["--profile", await ledger("ADMIN"), "--check"]),
      deps(),
    );
    expect(code).toBe(EXIT.refused);
    expect(lines.err).toEqual([
      "The account ADMIN is protected. The harness does not log in to it.",
    ]);
    expect(locks()).toEqual([]);
  });

  test("refuses while another live harness holds the character", async () => {
    writeOmpDb(ompDbPath(home), [
      codexRow({ access: "tok", expires: NOW + 3_600_000 }),
    ]);
    const lockDir = join(harnessStateDir(home), "locks");
    await Bun.write(
      join(lockDir, "FACABC0123456-Fgklibhlflc.lock"),
      JSON.stringify({ host: "h", pid: 1, runDir: "/r", startedAt: "x" }),
    );
    const code = await main(
      parseFlags(["--profile", await ledger(), "--check"]),
      deps(),
    );
    expect(code).toBe(EXIT.refused);
    expect(lines.err[0]).toContain("Another harness (pid 1");
  });
});

describe("main without --check", () => {
  test("builds the run dir, starts Pi with the game tools and finishes on quit", async () => {
    writeOmpDb(ompDbPath(home), [
      codexRow({ access: "tok", expires: NOW + 3_600_000 }),
    ]);
    const profile = join(home, "ledger.json");
    await writeFile(
      profile,
      JSON.stringify({
        account: "FACABC0123456",
        character: "Fgklibhlflc",
        createdAt: "2026-09-26T00:00:00Z",
        owner: home,
        password: "zq-secret-pass",
        preset: "eversong10",
      }),
    );
    const runDir = join(home, "run1");
    let tools: string[] = [];
    const quitting: MainDeps = {
      ...deps(),
      interactive: async (runtime) => {
        tools = runtime.session.getActiveToolNames();
        await runtime.dispose();
      },
    };
    const flags = ["--profile", profile, "--run-dir", runDir, "--no-connect"];
    expect(await main(parseFlags(flags), quitting)).toBe(EXIT.ok);
    expect(tools).toEqual(
      expect.arrayContaining(["look", "travel", "engage", "stop"]),
    );
    const meta = JSON.parse(readFileSync(join(runDir, "meta.json"), "utf8"));
    expect(meta).toMatchObject({
      account: "FACABC0123456",
      character: "Fgklibhlflc",
      exitReason: "quit",
      model: "openai-codex/gpt-6-luna",
      v: 1,
    });
    expect(typeof meta.endedAt).toBe("number");
    expect(locks()).toEqual([]);
    for (const name of readdirSync(runDir, { recursive: true })) {
      const path = join(runDir, String(name));
      if (!statSync(path).isFile()) continue;
      const text = readFileSync(path, "utf8").toLowerCase();
      expect(text).not.toContain("zq-secret-pass");
    }
  });
});
