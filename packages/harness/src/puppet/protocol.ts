import { homedir, tmpdir } from "node:os";
import { basename, dirname } from "node:path";
import { type PathEnv, resolvePaths } from "@peon/core/lib/paths";

export type PuppetPaths = {
  configPath: string;
  runtimeDir: string;
  socket: string;
  pid: string;
  stateDir: string;
  packets: string;
  packetCounts: string;
};

export type PuppetRequest =
  | { cmd: "status" }
  | { cmd: "read" }
  | { cmd: "nearby" }
  | { cmd: "events" }
  | { cmd: "whisper"; target: string; text: string }
  | { cmd: "call"; method: string; args: unknown[] }
  | { cmd: "raw"; opcode: number; body: string }
  | { cmd: "stop" };

export type PuppetReply =
  | { ok: true; out: string }
  | { ok: false; error: string };

export class PuppetNotRunning extends Error {
  constructor() {
    super("No puppet is running for this account. Run start --json first.");
    this.name = "PuppetNotRunning";
  }
}

const NOT_LISTENING: readonly string[] = ["ENOENT", "ECONNREFUSED"];
const CMDS: readonly string[] = [
  "status",
  "read",
  "nearby",
  "events",
  "whisper",
  "call",
  "raw",
  "stop",
];
export const HEX_BODY = /^(?:[0-9a-f]{2})*$/i;

export function puppetPaths(env: PathEnv = Bun.env): PuppetPaths {
  const host = { home: homedir(), tmp: tmpdir(), uid: process.getuid?.() ?? 0 };
  const { configPath, runtimeDir, stateDir } = resolvePaths(env, host);
  return {
    configPath,
    packetCounts: `${stateDir}/packets.json`,
    packets: `${stateDir}/packets.jsonl`,
    pid: `${runtimeDir}/puppet.pid`,
    runtimeDir,
    socket: `${runtimeDir}/puppet.sock`,
    stateDir,
  };
}

export function encodeLine(message: PuppetRequest | PuppetReply): string {
  return `${JSON.stringify(message)}\n`;
}

export function decodeRequest(line: string): PuppetRequest | undefined {
  const value = parseObject(line);
  if (value === undefined || !CMDS.includes(String(value["cmd"])))
    return undefined;
  if (value["cmd"] === "call") {
    const { method, args } = value;
    return typeof method === "string" && Array.isArray(args)
      ? { args, cmd: "call", method }
      : undefined;
  }
  if (value["cmd"] === "raw") {
    const { opcode, body } = value;
    return Number.isInteger(opcode) &&
      typeof body === "string" &&
      HEX_BODY.test(body)
      ? { body, cmd: "raw", opcode: opcode as number }
      : undefined;
  }
  if (value["cmd"] !== "whisper") return value as PuppetRequest;
  const { target, text } = value;
  return typeof target === "string" && typeof text === "string"
    ? { cmd: "whisper", target, text }
    : undefined;
}

export function decodeReply(line: string): PuppetReply {
  const value = parseObject(line);
  if (value?.["ok"] === true && typeof value["out"] === "string")
    return { ok: true, out: value["out"] };
  if (value?.["ok"] === false && typeof value["error"] === "string")
    return { error: value["error"], ok: false };
  throw new Error(`The puppet sent an unreadable reply: ${line}`);
}

function parseObject(line: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function sendRequest(
  socketPath: string,
  request: PuppetRequest,
): Promise<PuppetReply> {
  const { promise, resolve, reject } = Promise.withResolvers<PuppetReply>();
  const failed = (error: unknown) =>
    reject(notRunning(error) ? new PuppetNotRunning() : error);
  let buffer = "";
  try {
    inSocketDir(socketPath, (name) =>
      Bun.connect({
        socket: {
          close: () =>
            reject(
              new Error("The puppet closed the connection without a reply."),
            ),
          data(socket, data) {
            buffer += data.toString();
            const end = buffer.indexOf("\n");
            if (end === -1) return;
            try {
              resolve(decodeReply(buffer.slice(0, end)));
            } catch (error) {
              reject(error);
            }
            socket.end();
          },
          error: (_socket, error) => reject(error),
          open: (socket) => {
            socket.write(encodeLine(request));
          },
        },
        unix: name,
      }),
    ).catch(failed);
  } catch (error) {
    failed(error);
  }
  return promise;
}

export function inSocketDir<T>(
  socketPath: string,
  use: (name: string) => T,
): T {
  const previous = process.cwd();
  process.chdir(dirname(socketPath));
  try {
    return use(basename(socketPath));
  } finally {
    process.chdir(previous);
  }
}

function notRunning(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    NOT_LISTENING.includes(String(error.code))
  );
}
