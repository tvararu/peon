import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { PacketTraceMode } from "#harness/contract/config";
import { TRACE_MODES } from "#harness/puppet/args";

export type PuppetLaunchMessage =
  | { type: "ready" }
  | { type: "failed"; message: string };

export type PuppetLaunchInit = {
  entry: string;
  packetTrace?: PacketTraceMode;
  timeoutMs?: number;
};

export const START_TIMEOUT_MS = 90_000;

const TRACE_FLAG = "--packet-trace";

export function packetTraceOf(argv: readonly string[]): PacketTraceMode {
  const at = argv.indexOf(TRACE_FLAG);
  if (at === -1) return "off";
  return TRACE_MODES.find((known) => known === argv[at + 1]) ?? "off";
}

export async function launchPuppet({
  entry,
  packetTrace = "off",
  timeoutMs = START_TIMEOUT_MS,
}: PuppetLaunchInit): Promise<void> {
  const outcome = Promise.withResolvers<PuppetLaunchMessage>();
  const trace = packetTrace === "off" ? [] : [TRACE_FLAG, packetTrace];
  const child = Bun.spawn([process.execPath, entry, ...trace], {
    detached: true,
    ipc: (message) => outcome.resolve(readMessage(message)),
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.exited
    .then((code) =>
      outcome.resolve({
        message: `The puppet exited with code ${code} before the character reached the world.`,
        type: "failed",
      }),
    )
    .catch(ignoreFailure);
  const timer = setTimeout(
    () =>
      outcome.resolve({
        message: `The character did not reach the world within ${timeoutMs / 1000} s.`,
        type: "failed",
      }),
    timeoutMs,
  );
  const result = await outcome.promise;
  clearTimeout(timer);
  if (result.type === "ready") {
    child.disconnect();
    child.unref();
    return;
  }
  child.kill();
  await child.exited;
  throw new Error(result.message);
}

function readMessage(message: unknown): PuppetLaunchMessage {
  const value = message as Partial<Record<string, unknown>> | null;
  if (value?.["type"] === "ready") return { type: "ready" };
  return {
    message:
      typeof value?.["message"] === "string"
        ? value["message"]
        : "The puppet sent an unreadable start message.",
    type: "failed",
  };
}
