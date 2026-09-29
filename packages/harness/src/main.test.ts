import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { REQUIRED_DBC_FILES } from "@peon/core";
import { scratchDir } from "@peon/core/test-support/scratch";
import { harnessStateDir, parseFlags } from "#harness/config/flags";
import { ompDbPath } from "#harness/credentials/omp-store";
import { EXIT, type MainDeps, main } from "#harness/main";
import {
  EXIT_SIGINT,
  type ExitProcess,
  LOGOUT_NOTICE,
} from "#harness/runtime/exit";
import { codexRow, writeOmpDb } from "#test-support/omp-db";

const NOW = Date.parse("2026-09-26T19:00:00Z");

let home: string;
let lines: { out: string[]; err: string[] };

beforeEach(async () => {
  home = scratchDir("harness-main");
  lines = { err: [], out: [] };
  proc = new EventEmitter();
  exits = [];
});

afterEach(async () => {
  await rm(home, { force: true, recursive: true });
});

let proc: EventEmitter;
let exits: number[];

function fakeProcess(): ExitProcess {
  return {
    exit: (code) => {
      exits.push(code);
      proc.emit("exit", code);
    },
    listenerCount: (event) => proc.listenerCount(event),
    on: (event, listener) => proc.on(event, listener),
  };
}

function deps(): MainDeps {
  return {
    err: (line) => lines.err.push(line),
    home,
    interactive: async () => {
      throw new Error("the --check path must not start Pi");
    },
    now: () => NOW,
    out: (line) => lines.out.push(line),
    proc: fakeProcess(),
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

describe("main exit paths write endedAt and exitReason", () => {
  async function playing(
    interactive: MainDeps["interactive"],
  ): Promise<{ runDir: string; result: Promise<number> }> {
    writeOmpDb(ompDbPath(home), [
      codexRow({ access: "tok", expires: NOW + 3_600_000 }),
    ]);
    const runDir = join(home, "run1");
    const flags = [
      "--profile",
      await ledger(),
      "--run-dir",
      runDir,
      "--no-connect",
    ];
    return {
      result: main(parseFlags(flags), { ...deps(), interactive }),
      runDir,
    };
  }

  function readMeta(runDir: string) {
    return JSON.parse(readFileSync(join(runDir, "meta.json"), "utf8"));
  }

  test("Ctrl-D, /quit and double Ctrl-C end in Pi's shutdown: quit, with the logout notice", async () => {
    const { result, runDir } = await playing((runtime) => runtime.dispose());
    expect(await result).toBe(EXIT.ok);
    expect(readMeta(runDir)).toMatchObject({ exitReason: "quit" });
    expect(readMeta(runDir).endedAt).toBe(NOW);
    expect(lines.out).toContain(LOGOUT_NOTICE);
    proc.emit("exit", 0);
    expect(readMeta(runDir)).toMatchObject({ exitReason: "quit" });
  });

  test("SIGTERM: Pi's prepended handler shuts down, the meta says sigterm and no logout notice prints", async () => {
    const { result, runDir } = await playing(async (runtime) => {
      let shutdown: Promise<void> | undefined;
      proc.prependListener("SIGTERM", () => {
        shutdown = runtime.dispose();
      });
      proc.emit("SIGTERM");
      await shutdown;
    });
    await result;
    expect(readMeta(runDir)).toMatchObject({
      endedAt: NOW,
      exitReason: "sigterm",
    });
    expect(lines.out).not.toContain(LOGOUT_NOTICE);
  });

  test("SIGINT while the harness logs out: the meta says sigint and the exit code is 130", async () => {
    const { result, runDir } = await playing(async (runtime) => {
      proc.emit("SIGINT");
      await runtime.dispose();
    });
    await result;
    expect(exits).toEqual([EXIT_SIGINT]);
    expect(readMeta(runDir)).toMatchObject({
      endedAt: NOW,
      exitReason: "sigint",
    });
  });

  test("a fatal error: the process exit writes fatal_error", async () => {
    const { result, runDir } = await playing(async () => {
      throw new Error("boom");
    });
    await expect(result).rejects.toThrow("boom");
    proc.emit("exit", 1);
    expect(readMeta(runDir)).toMatchObject({
      endedAt: NOW,
      exitReason: "fatal_error",
    });
    expect(locks()).toEqual([]);
  });
});

describe("main --check spell data", () => {
  async function profileWith(dir: string): Promise<string> {
    const path = join(home, "config.toml");
    await writeFile(
      path,
      `account = "FACABC0123456"\npassword = "pw"\ncharacter = "Fgklibhlflc"\nspell_data_dir = "${dir}"\n`,
    );
    return path;
  }

  async function seed(dir: string, files: readonly string[]): Promise<void> {
    await mkdir(dir, { recursive: true });
    for (const file of files) await writeFile(join(dir, file), "");
  }

  function validLogin(): void {
    writeOmpDb(ompDbPath(home), [
      codexRow({ access: "tok", expires: NOW + 3_600_000 }),
    ]);
  }

  test("warns once per missing file and still passes the check", async () => {
    validLogin();
    const dir = join(home, "dbc");
    const present = REQUIRED_DBC_FILES.filter(
      (file) => file !== "Lock.dbc" && file !== "AreaTrigger.dbc",
    );
    await seed(dir, present);
    const code = await main(
      parseFlags(["--profile", await profileWith(dir), "--check"]),
      deps(),
    );
    expect(code).toBe(EXIT.ok);
    expect(lines.err).toHaveLength(2);
    expect(lines.err[0]).toContain("Lock.dbc");
    expect(lines.err[1]).toContain("AreaTrigger.dbc");
  });

  test("is silent when every file is present", async () => {
    validLogin();
    const dir = join(home, "dbc");
    await seed(dir, REQUIRED_DBC_FILES);
    const code = await main(
      parseFlags(["--profile", await profileWith(dir), "--check"]),
      deps(),
    );
    expect(code).toBe(EXIT.ok);
    expect(lines.err).toEqual([]);
  });

  test("is silent when spell_data_dir is unset", async () => {
    validLogin();
    const code = await main(
      parseFlags(["--profile", await ledger(), "--check"]),
      deps(),
    );
    expect(code).toBe(EXIT.ok);
    expect(lines.err).toEqual([]);
  });
});
