import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  applySetup,
  createAccount,
  deleteAccounts,
  quarantine,
  RunAbort,
  removeSessionFiles,
  SOAP,
  sessionFile,
} from "#harness/grader/accounts";
import { failed, fakeExec, ok } from "#test-support/fake-exec";

const ACC = "FAC0123456789";
const SESSION = {
  account: ACC,
  character: "Fevala",
  dir: "/wt/tmp/factory-account-FAC0123456789",
  password: "pw-secret-123",
  preset: "eversong10",
  wrapper: "/wt/tmp/tc-FAC0123456789",
};

const dir = (): Promise<string> => mkdtemp(`${tmpdir()}/accounts-`);

describe("createAccount", () => {
  test("keeps the session in a mode-600 file and the names in names.json", async () => {
    const runDir = await dir();
    const { calls, exec } = fakeExec(() => ok(`${JSON.stringify(SESSION)}\n`));
    const names = await createAccount({
      exec,
      owner: "eval-1-t0-self-state-1",
      preset: "eversong10",
      role: "agent",
      runDir,
    });
    expect(names).toEqual({
      account: ACC,
      character: "Fevala",
      preset: "eversong10",
      wrapper: "/wt/tmp/tc-FAC0123456789",
    });
    expect(calls[0]?.argv).toEqual([
      ...SOAP,
      "create",
      "eversong10",
      "--owner",
      "eval-1-t0-self-state-1",
    ]);
    expect((await stat(sessionFile(runDir, "agent"))).mode % 0o1000).toBe(
      0o600,
    );
    expect(await Bun.file(`${runDir}/names.json`).json()).toEqual(names);
    expect(await Bun.file(`${runDir}/names.json`).text()).not.toContain(
      "pw-secret-123",
    );
  });

  test("writes partner files for the partner role", async () => {
    const runDir = await dir();
    const { exec } = fakeExec(() => ok(JSON.stringify(SESSION)));
    await createAccount({
      exec,
      owner: "eval-1-t2-whisper-reply-1",
      preset: "eversong10",
      role: "partner",
      runDir,
    });
    expect((await readdir(runDir)).toSorted()).toEqual([
      "partner-names.json",
      "partner.json",
    ]);
  });

  test("aborts as soap_create when soap create fails", async () => {
    const { exec } = fakeExec(() => failed(1, "pdump copy failed 3 times"));
    const error = await createAccount({
      exec,
      owner: "o",
      preset: "eversong10-hunter",
      role: "agent",
      runDir: await dir(),
    }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(RunAbort);
    expect((error as RunAbort).abortCause).toBe("soap_create");
    expect((error as RunAbort).evidence).toBe(
      "soap create eversong10-hunter exited 1: pdump copy failed 3 times",
    );
  });

  test("aborts when the reply names no factory account", async () => {
    const { exec } = fakeExec(() =>
      ok(JSON.stringify({ ...SESSION, account: "XIARA" })),
    );
    await expect(
      createAccount({
        exec,
        owner: "o",
        preset: "eversong10",
        role: "agent",
        runDir: await dir(),
      }),
    ).rejects.toThrow("soap_create: soap create returned no factory account");
  });
});

describe("applySetup", () => {
  test("runs each setup call and logs each reply", async () => {
    const runDir = await dir();
    const { calls, exec } = fakeExec(() =>
      ok(
        '{\n  "changed": { "level": 1, "xp": 0 },\n  "char": "Fevala",\n  "ok": true\n}\n',
      ),
    );
    await applySetup({
      account: ACC,
      exec,
      runDir,
      setup: [{ body: { level: 1 }, endpoint: "level" }],
    });
    expect(calls[0]?.argv).toEqual([
      ...SOAP,
      "setup",
      ACC,
      "level",
      '{"level":1}',
    ]);
    expect(await Bun.file(`${runDir}/setup.log`).text()).toBe(
      '{"changed":{"level":1,"xp":0},"char":"Fevala","ok":true}\n',
    );
  });

  test("aborts as setup_failed with the reason code", async () => {
    const { exec } = fakeExec(() =>
      failed(
        1,
        "",
        JSON.stringify({
          error: "online",
          ok: false,
          reason: "character_online",
        }),
      ),
    );
    await expect(
      applySetup({
        account: ACC,
        exec,
        runDir: await dir(),
        setup: [{ body: { level: 1 }, endpoint: "level" }],
      }),
    ).rejects.toThrow("setup_failed: level: character_online");
  });
});

describe("deleteAccounts", () => {
  test("deletes each account and reports the ones still listed", async () => {
    const other = "FAC0000000002";
    const { calls, exec } = fakeExec((argv) =>
      argv[3] === "list"
        ? ok(JSON.stringify([{ account: other, owner: "eval-1-x-1" }]))
        : ok(),
    );
    expect(await deleteAccounts({ accounts: [ACC, other], exec })).toEqual([
      other,
    ]);
    expect(calls.map((call) => call.argv.slice(3))).toEqual([
      ["delete", ACC],
      ["delete", other],
      ["list"],
    ]);
  });

  test("throws when soap list fails, so the caller keeps every account", async () => {
    const { exec } = fakeExec((argv) =>
      argv[3] === "list" ? failed(1, "service down") : ok(),
    );
    await expect(deleteAccounts({ accounts: [ACC], exec })).rejects.toThrow(
      "soap list exited 1: service down",
    );
  });
});

describe("quarantine and removeSessionFiles", () => {
  test("moves leaked files into a mode-700 quarantine dir", async () => {
    const runDir = await dir();
    await mkdir(`${runDir}/frames`);
    await writeFile(`${runDir}/frames/00001-5.txt`, "leak");
    await quarantine({ files: ["frames/00001-5.txt"], runDir });
    expect(await readdir(`${runDir}/quarantine`)).toEqual([
      "frames_00001-5.txt",
    ]);
    expect((await stat(`${runDir}/quarantine`)).mode % 0o1000).toBe(0o700);
    expect(await readdir(`${runDir}/frames`)).toEqual([]);
  });

  test("removes the session files and tolerates missing ones", async () => {
    const runDir = await dir();
    await writeFile(sessionFile(runDir, "agent"), "{}");
    await removeSessionFiles(runDir);
    expect(await readdir(runDir)).toEqual([]);
  });
});
