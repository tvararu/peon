import { mkdir, rm } from "node:fs/promises";
import type { ClientConfig, WorldHandle } from "@peon/core";
import { messageOf } from "@peon/core/lib/errors";
import type { TraceSender, TraceSink } from "@peon/core/session";
import { loadProfile } from "#harness/config/profile";
import type { PacketTraceMode } from "#harness/contract/config";
import { createPacketTrace } from "#harness/log/packet-trace";
import { type PuppetPaths, sendRequest } from "#harness/puppet/protocol";
import { listenPuppet, type PuppetServer } from "#harness/puppet/server";

export type PuppetBootInit = {
  paths: PuppetPaths;
  login: (config: ClientConfig) => Promise<WorldHandle>;
  packetTrace?: PacketTraceMode;
};

export type PuppetTrace = {
  sink: TraceSink;
  send: TraceSender;
  flush: () => Promise<void>;
};

export function createPuppetTrace(
  mode: PacketTraceMode,
  paths: PuppetPaths,
): PuppetTrace {
  const trace = createPacketTrace({ mode, paths });
  let sender: TraceSender | undefined;
  return {
    flush: trace.flush,
    send: (opcode, body) => {
      if (!sender)
        throw new Error("The session gave the puppet no packet sender.");
      sender(opcode, body);
    },
    sink: {
      attach: (send) => {
        sender = send;
      },
      bodies: trace.bodies,
      close: trace.close,
      row: trace.row,
    },
  };
}

export async function bootPuppet({
  paths,
  login,
  packetTrace = "off",
}: PuppetBootInit): Promise<PuppetServer> {
  const profile = await loadProfile(paths.configPath);
  await mkdir(paths.runtimeDir, { mode: 0o700, recursive: true });
  const running = await sendRequest(paths.socket, { cmd: "status" }).then(
    () => true,
    () => false,
  );
  if (running)
    throw new Error(
      `A puppet is already running at ${paths.socket}; stop it first.`,
    );
  await rm(paths.socket, { force: true });
  const trace =
    packetTrace === "off" ? undefined : createPuppetTrace(packetTrace, paths);
  if (trace) await mkdir(paths.stateDir, { mode: 0o700, recursive: true });
  const config = trace
    ? { ...profile.client, trace: trace.sink }
    : profile.client;
  const handle = await login(config).catch(async (error: unknown) => {
    await trace?.flush();
    throw new Error(
      `${profile.character} on ${profile.account} could not log in: ${messageOf(error)}`,
      { cause: error },
    );
  });
  const server = await listenPuppet({
    handle,
    paths,
    ...(trace && { send: trace.send }),
  });
  if (!trace) return server;
  return {
    done: server.done.then(trace.flush),
    stop: () => server.stop().then(trace.flush),
  };
}
