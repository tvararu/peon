import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ClientConfig, WorldHandle } from "@peon/core";
import { opcodeNumber, worldSession } from "@peon/core/session";
import { startMockWorldServer } from "@peon/core/test-support/mock-world-server";
import { scratchDir } from "@peon/core/test-support/scratch";
import {
  base,
  fakeAuth,
} from "@peon/core/test-support/world-handlers-fixtures";
import { accountPaths } from "#tools/probe-account";
import type { ProbeArgs, ProbeStep } from "#tools/probe-args";
import { type ProbeDeps, runProbe } from "#tools/probe-run";

const ACCOUNT = "FAC0123456789";
const PING = opcodeNumber("CMSG_PING") ?? -1;
const PONG = opcodeNumber("SMSG_PONG") ?? -1;
const STUBBED = opcodeNumber("SMSG_GUILD_BANK_LIST") ?? -1;
const GOSSIP = opcodeNumber("SMSG_GOSSIP_MESSAGE") ?? -1;
const LOGOUT = opcodeNumber("CMSG_LOGOUT_REQUEST") ?? -1;
const stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

type World = Awaited<ReturnType<typeof startMockWorldServer>>;
type Setup = {
  ws: World;
  deps: ProbeDeps;
  handles: WorldHandle[];
  root: string;
};

async function setup(after?: (ws: World) => void): Promise<Setup> {
  const root = scratchDir("probe-run");
  const config = accountPaths(root, ACCOUNT).config;
  await mkdir(dirname(config), { recursive: true });
  await writeFile(
    config,
    `account = "${ACCOUNT}"\npassword = "pw"\ncharacter = "Fprobe"\n`,
  );
  const ws = await startMockWorldServer({ coalesceSelfCreate: true });
  stops.push(() => ws.stop());
  const handles: WorldHandle[] = [];
  const login = async ({ trace }: ClientConfig) => {
    const client = {
      ...base,
      host: "127.0.0.1",
      logoutTimeoutMs: 5,
      port: ws.port,
      trace,
    };
    const handle = await worldSession(client, fakeAuth(ws.port));
    handles.push(handle);
    after?.(ws);
    return handle;
  };
  return {
    deps: { login, logoutMs: 100, root, settleMs: 20 },
    handles,
    root,
    ws,
  };
}

function args(extra: Partial<ProbeArgs>): ProbeArgs {
  return {
    account: ACCOUNT,
    bodies: false,
    expect: [],
    steps: [],
    until: [],
    waitMs: 20,
    ...extra,
  };
}

async function lines(path: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(path, "utf8");
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("runProbe", () => {
  test("sends a packet, stops once the reply arrives and writes the trace", async () => {
    const { deps, ws, handles, root } = await setup();
    const steps = [{ body: "0700000000000000", opcode: PING }];
    const started = Date.now();
    const probe = args({
      bodies: true,
      expect: [PONG],
      steps,
      until: [PONG],
      waitMs: 10_000,
    });
    const { code, report } = await runProbe(probe, deps);
    expect(Date.now() - started).toBeLessThan(5000);
    expect(code).toBe(0);
    expect(report.missing).toEqual([]);
    expect(report.sent).toEqual([
      { at: expect.any(Number), opcode: "CMSG_PING", size: 8 },
    ]);
    expect(report.received["SMSG_PONG"]).toEqual({
      count: 1,
      firstAt: expect.any(Number),
    });
    const ping = ws.captured.find((p) => p.opcode === PING && p.body[0] === 7);
    expect(Buffer.from(ping?.body ?? []).toString("hex")).toBe(
      "0700000000000000",
    );
    await handles[0]?.closed;
    expect(report.trace.rows.startsWith(`${root}/tmp/probe/${ACCOUNT}-`)).toBe(
      true,
    );
    const rows = await lines(report.trace.rows);
    expect(rows).toContainEqual(
      expect.objectContaining({
        body: "0700000000000000",
        dir: "out",
        opcode: "CMSG_PING",
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ dir: "in", opcode: "SMSG_PONG" }),
    );
    expect(rows).toContainEqual({
      at: expect.any(Number),
      dir: "out",
      opcode: "CMSG_AUTH_SESSION",
      size: expect.any(Number),
    });
    const counts = JSON.parse(await readFile(report.trace.counts, "utf8"));
    expect(counts.seen["SMSG_PONG"]).toBe(1);
    expect(counts.sent["CMSG_PING"]).toBeGreaterThanOrEqual(1);
    expect(report.counts?.seen["SMSG_PONG"]).toBe(1);
  });

  test("writes headers only without --bodies, to --out", async () => {
    const { deps, root } = await setup();
    const out = `${root}/custom`;
    const steps = [{ body: "0700000000000000", opcode: PING }];
    const { report } = await runProbe(
      args({ out, steps, until: [PONG], waitMs: 5000 }),
      deps,
    );
    expect(report.trace.rows).toBe(`${out}/packets.jsonl`);
    const rows = await lines(report.trace.rows);
    expect(rows.some((row) => "body" in row)).toBe(false);
  });

  test("exits 3 and names each expected opcode that never arrived", async () => {
    const { deps } = await setup();
    const { code, report } = await runProbe(args({ expect: [GOSSIP] }), deps);
    expect(code).toBe(3);
    expect(report.missing).toEqual(["SMSG_GOSSIP_MESSAGE"]);
  });

  test("reports notices, including ones made before it subscribed", async () => {
    const { deps } = await setup((ws) => ws.inject(STUBBED, new Uint8Array(8)));
    const { code, report } = await runProbe(
      args({ until: [STUBBED], waitMs: 5000 }),
      deps,
    );
    expect(code).toBe(0);
    expect(report.notices).toEqual([
      {
        at: expect.any(Number),
        label: "Guild bank",
        opcode: "SMSG_GUILD_BANK_LIST",
        text: expect.any(String),
      },
    ]);
  });

  test("records a failing flow, still logs out and exits 1", async () => {
    const { deps, handles, ws } = await setup();
    const steps = [{ args: { entry: "1" }, flow: "talk" }];
    const { code, report } = await runProbe(args({ steps }), deps);
    expect(code).toBe(1);
    expect(report.flows).toEqual([
      {
        args: { entry: "1" },
        error: expect.stringContaining("entry 1"),
        flow: "talk",
      },
    ]);
    await handles[0]?.closed;
    expect(await ws.waitForCapture((p) => p.opcode === LOGOUT)).toBeDefined();
  });

  test("runs flows in order with sends", async () => {
    const { deps } = await setup();
    const steps: ProbeStep[] = [
      { args: {}, flow: "login" },
      { body: "0700000000000000", opcode: PING },
      { args: { kind: "unit" }, flow: "nearest" },
    ];
    const { code, report } = await runProbe(args({ steps }), deps);
    expect(code).toBe(0);
    expect(report.flows.map((f) => f.flow)).toEqual(["login", "nearest"]);
    expect(report.sent).toEqual([
      { at: expect.any(Number), opcode: "CMSG_PING", size: 8 },
    ]);
    expect(report.flows[1]).toMatchObject({
      result: { kind: "unit", rows: [] },
    });
  });

  test("refuses an unknown flow with exit 2 before it logs in", async () => {
    const { deps, handles } = await setup();
    const steps = [{ args: {}, flow: "dance" }];
    const { code, report } = await runProbe(args({ steps }), deps);
    expect(code).toBe(2);
    expect(report.error).toContain("dance");
    expect(handles).toEqual([]);
  });

  test("exits 1 when login fails or the account is not set up", async () => {
    const { deps, root } = await setup();
    const failing = {
      ...deps,
      login: () => Promise.reject(new Error("auth refused")),
    };
    const failed = await runProbe(args({}), failing);
    const absent = await runProbe(args({ account: "FAC9999999999" }), {
      ...deps,
      root,
    });
    expect(failed).toMatchObject({
      code: 1,
      report: { error: expect.stringContaining("auth refused") },
    });
    expect(absent).toMatchObject({
      code: 1,
      report: { error: expect.stringContaining("no config") },
    });
  });
});
