import { messageOf } from "@tuicraft/core/lib/errors";
import { UsageError } from "#harness/config/flags";
import {
  type PuppetCommand,
  parsePuppetArgs,
  USAGE,
} from "#harness/puppet/args";
import { resultJson } from "#harness/puppet/format";
import { launchPuppet } from "#harness/puppet/launch";
import {
  type PuppetPaths,
  type PuppetRequest,
  puppetPaths,
  sendRequest,
} from "#harness/puppet/protocol";

export type PuppetCliInit = {
  argv: readonly string[];
  paths: PuppetPaths;
  launch: () => Promise<void>;
  out: (text: string) => void;
  err: (text: string) => void;
};

export async function runPuppet(init: PuppetCliInit): Promise<number> {
  let command: PuppetCommand;
  try {
    command = parsePuppetArgs(init.argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    init.err(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  try {
    return await run(command, init);
  } catch (error) {
    init.err(messageOf(error));
    return 1;
  }
}

async function run(
  command: PuppetCommand,
  init: PuppetCliInit,
): Promise<number> {
  if (command.kind === "start") {
    const running = await sendRequest(init.paths.socket, {
      cmd: "status",
    }).then(
      () => true,
      () => false,
    );
    if (!running) await init.launch();
    init.out(resultJson("start", { socket: "responsive", started: !running }));
    return 0;
  }
  const request: PuppetRequest =
    command.kind === "send"
      ? { cmd: "whisper", target: command.target, text: command.text }
      : { cmd: command.kind };
  const reply = await sendRequest(init.paths.socket, request);
  if (!reply.ok) {
    init.err(reply.error);
    return 1;
  }
  if (reply.out !== "") init.out(reply.out);
  return 0;
}

if (import.meta.main)
  process.exitCode = await runPuppet({
    argv: Bun.argv.slice(2),
    err: console.error,
    launch: () => launchPuppet({ entry: `${import.meta.dir}/serve.ts` }),
    out: console.log,
    paths: puppetPaths(),
  });
