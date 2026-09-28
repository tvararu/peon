import { afterEach, describe, expect, jest, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { USAGE } from "#harness/puppet/args";
import { type PuppetCliInit, runPuppet } from "#harness/puppet/main";
import {
  encodeLine,
  type PuppetPaths,
  type PuppetReply,
  puppetPaths,
} from "#harness/puppet/protocol";
import { writeAccountConfig } from "#test-support/puppet-fixtures";

const MAIN = `${import.meta.dir}/main.ts`;
const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function tempPaths(): Promise<{ dir: string; paths: PuppetPaths }> {
  const dir = await mkdtemp(`${tmpdir()}/puppet-main-`);
  cleanups.push(() => rm(dir, { force: true, recursive: true }));
  const paths = puppetPaths({
    XDG_CONFIG_HOME: `${dir}/config`,
    XDG_RUNTIME_DIR: `${dir}/runtime`,
  });
  await mkdir(paths.runtimeDir, { recursive: true });
  return { dir, paths };
}

function fakePuppet(paths: PuppetPaths, reply: PuppetReply): string[] {
  const seen: string[] = [];
  const listener = Bun.listen({
    socket: {
      data(socket, data) {
        seen.push(data.toString().trimEnd());
        socket.write(encodeLine(reply));
      },
    },
    unix: paths.socket,
  });
  cleanups.push(() => listener.stop(true));
  return seen;
}

async function cli(argv: string[], paths: PuppetPaths, launch = jest.fn()) {
  const out: string[] = [];
  const err: string[] = [];
  const init: PuppetCliInit = {
    argv,
    err: (text) => err.push(text),
    launch,
    out: (text) => out.push(text),
    paths,
  };
  const code = await runPuppet(init);
  return { code, err, launch, out };
}

describe("runPuppet", () => {
  test("a bad command prints the usage and exits 2", async () => {
    const { paths } = await tempPaths();
    const { code, err, out } = await cli(["status"], paths);
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("status");
    expect(err.join("\n")).toContain(USAGE);
    expect(out).toEqual([]);
  });

  test.each([
    [["read", "--json"]],
    [["nearby", "--json"]],
    [["events", "--json"]],
    [["send", "-w", "Fevala", "hi"]],
    [["stop"]],
    [["call", "invite", '["Fabc"]']],
  ])("%p with no puppet running exits 1 and says so", async (argv) => {
    const { paths } = await tempPaths();
    const { code, err, out } = await cli(argv, paths);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("No puppet is running");
    expect(out).toEqual([]);
  });

  test("send -w asks the puppet to whisper and prints its OK", async () => {
    const { paths } = await tempPaths();
    const seen = fakePuppet(paths, { ok: true, out: "OK" });
    const { code, out } = await cli(
      ["send", "-w", "Fevala", "hey,", "what", "level?"],
      paths,
    );
    expect(code).toBe(0);
    expect(out).toEqual(["OK"]);
    expect(seen).toEqual([
      '{"cmd":"whisper","target":"Fevala","text":"hey, what level?"}',
    ]);
  });

  test("call sends the method and its raw arguments", async () => {
    const { paths } = await tempPaths();
    const seen = fakePuppet(paths, {
      ok: true,
      out: '{"command":"call","data":{"method":"invite"},"error":null,"events":[],"kind":"result"}',
    });
    const { code, out } = await cli(["call", "invite", '["Fabc"]'], paths);
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(seen).toEqual(['{"args":["Fabc"],"cmd":"call","method":"invite"}']);
  });

  test("events --json sends the events request and prints its reply", async () => {
    const { paths } = await tempPaths();
    const reply =
      '{"command":"events","data":null,"error":null,"events":[],"kind":"events"}';
    const seen = fakePuppet(paths, { ok: true, out: reply });
    const { code, out } = await cli(["events", "--json"], paths);
    expect(code).toBe(0);
    expect(out).toEqual([reply]);
    expect(seen).toEqual(['{"cmd":"events"}']);
  });

  test("a call with a bad argument exits 2 before it reaches the puppet", async () => {
    const { paths } = await tempPaths();
    const seen = fakePuppet(paths, { ok: true, out: "" });
    const { code, err } = await cli(["call", "selectTarget", "[42]"], paths);
    expect(code).toBe(2);
    expect(err.join("\n")).toContain("selectTarget");
    expect(seen).toEqual([]);
  });

  test("a refused request exits 1 with the puppet's message", async () => {
    const { paths } = await tempPaths();
    fakePuppet(paths, { error: "The puppet is stopping.", ok: false });
    const { code, err } = await cli(["read", "--json"], paths);
    expect(code).toBe(1);
    expect(err).toEqual(["The puppet is stopping."]);
  });

  test("start launches the puppet and prints the CLI's start result", async () => {
    const { paths } = await tempPaths();
    const { code, launch, out } = await cli(["start", "--json"], paths);
    expect(code).toBe(0);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(out).toEqual([
      '{"command":"start","data":{"socket":"responsive","started":true},"error":null,"events":[],"kind":"result"}',
    ]);
  });

  test("start with a puppet already answering does not launch another", async () => {
    const { paths } = await tempPaths();
    fakePuppet(paths, { ok: true, out: "" });
    const { code, launch, out } = await cli(["start", "--json"], paths);
    expect(code).toBe(0);
    expect(launch).not.toHaveBeenCalled();
    expect(out).toEqual([
      '{"command":"start","data":{"socket":"responsive","started":false},"error":null,"events":[],"kind":"result"}',
    ]);
  });

  test("start exits 1 with the launch failure", async () => {
    const { paths } = await tempPaths();
    const launch = jest.fn(async () => {
      throw new Error("Cannot connect to 127.0.0.1:1");
    });
    const { code, err, out } = await cli(["start", "--json"], paths, launch);
    expect(code).toBe(1);
    expect(err).toEqual(["Cannot connect to 127.0.0.1:1"]);
    expect(out).toEqual([]);
  });
});

describe("main.ts as a process", () => {
  async function run(dir: string, argv: string[]) {
    const proc = Bun.spawn([process.execPath, MAIN, ...argv], {
      env: {
        ...Bun.env,
        XDG_CONFIG_HOME: `${dir}/config`,
        XDG_RUNTIME_DIR: `${dir}/runtime`,
      },
      stderr: "pipe",
      stdout: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, err, out };
  }

  test("start refuses a protected account from config.toml", async () => {
    const { dir, paths } = await tempPaths();
    await writeAccountConfig(paths.configPath, {
      account: "admin",
      character: "Fgklgoafpfk",
    });
    const { code, err, out } = await run(dir, ["start", "--json"]);
    expect(code).toBe(1);
    expect(err).toContain("ADMIN");
    expect(out).toBe("");
  });

  test("start fails when the character cannot log in", async () => {
    const { dir, paths } = await tempPaths();
    const closed = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: { data() {} },
    });
    const port = closed.port;
    closed.stop(true);
    await writeAccountConfig(paths.configPath, {
      account: "FAC0123456789",
      character: "Fgklgoafpfk",
      port,
    });
    const { code, err, out } = await run(dir, ["start", "--json"]);
    expect(code).toBe(1);
    expect(err).toContain("Fgklgoafpfk");
    expect(out).toBe("");
    expect(await Bun.file(paths.socket).exists()).toBe(false);
  });
});
