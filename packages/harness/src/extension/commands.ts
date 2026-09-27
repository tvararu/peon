import type {
  ExtensionAPI,
  ExtensionCommandContext,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import type { WorldHandle } from "@peon/core";
import { messageOf } from "@peon/core/lib/errors";
import type { HarnessRuntime } from "#harness/contract/services";
import { humanStop } from "#harness/extension/input";
import { queryLog } from "#harness/log/query";

type Run = (args: string, ctx: ExtensionCommandContext) => Promise<void>;
type Command = Omit<RegisteredCommand, "name" | "sourceInfo">;
type Send = (handle: WorldHandle, text: string) => void;

export const LOG_COMMAND_ROWS = 20;
export const OFFLINE_TEXT = "The game connection is down. Run /connect.";

const WORDS = /\s+/;
const LABEL_JUNK = /[^a-z0-9_-]+/g;

function logInput(rt: HarnessRuntime, text: string): void {
  const data = { stoppedRuns: [], stopReflex: false, text, via: "command" };
  rt.log.append({
    class: "log",
    data,
    domain: "human",
    event: "human/input",
    text: `Human: ${text}`,
  });
}

function logged(rt: HarnessRuntime, name: string, run: Run): Run {
  return async (args, ctx) => {
    logInput(rt, `/${name} ${args}`.trim());
    await run(args, ctx);
  };
}

async function send(
  rt: HarnessRuntime,
  ctx: ExtensionCommandContext,
  deliver: (handle: WorldHandle) => void,
): Promise<void> {
  const handle = rt.handle();
  if (!handle) return ctx.ui.notify(OFFLINE_TEXT, "error");
  await rt.mutex.run(() => deliver(handle));
}

function chat(rt: HarnessRuntime, deliver: Send): Run {
  return async (args, ctx) => {
    const text = args.trim();
    if (!text)
      return ctx.ui.notify("Write the text after the command.", "warning");
    await send(rt, ctx, (handle) => deliver(handle, text));
  };
}

function whisper(rt: HarnessRuntime): Run {
  return async (args, ctx) => {
    const [to, ...words] = args.trim().split(WORDS);
    const text = words.join(" ");
    if (!(to && text)) return ctx.ui.notify("Use /w <name> <text>.", "warning");
    await send(rt, ctx, (handle) => handle.sendWhisper(to, text));
  };
}

function stop(rt: HarnessRuntime): Run {
  return (_args, ctx) => {
    const stopped = humanStop({ rt, text: "/stop", via: "command" });
    const names = stopped.map((run) => `${run.id} (${run.kind})`).join(", ");
    ctx.ui.notify(
      names
        ? `Stopped ${names}.`
        : "No run was active. Movement and attacks stopped.",
      "info",
    );
    return Promise.resolve();
  };
}

function now(rt: HarnessRuntime): Run {
  return (_args, ctx) => {
    ctx.ui.notify(
      rt.session.lastNow ?? "No [now] line was sent to the model yet.",
      "info",
    );
    return Promise.resolve();
  };
}

function log(pi: ExtensionAPI, rt: HarnessRuntime): Run {
  return (args, ctx) => {
    const query = { find: args.trim() || undefined, limit: LOG_COMMAND_ROWS };
    const page = queryLog({
      log: rt.log,
      now: rt.clock.now(),
      query,
      runs: rt.runs,
      turnStartSeq: 0,
    });
    const more = page.more > 0 ? `, ${page.more} more` : "";
    ctx.ui.notify(
      `Game log ${page.label}: ${page.rows.length} rows${more}.`,
      "info",
    );
    for (const entry of page.rows) pi.appendEntry("wow-human", { entry });
    return Promise.resolve();
  };
}

function connect(rt: HarnessRuntime): Run {
  return async (_args, ctx) => {
    if (rt.connection() === "online")
      return ctx.ui.notify("The game connection is already up.", "info");
    try {
      await rt.connect();
      ctx.ui.notify("Connected to the game.", "info");
    } catch (error) {
      ctx.ui.notify(`Connect failed: ${messageOf(error)}`, "error");
    }
  };
}

function disconnect(rt: HarnessRuntime): Run {
  return async (_args, ctx) => {
    await rt.disconnect();
    ctx.ui.notify("Disconnected. Run /connect to log in again.", "info");
  };
}

function wake(rt: HarnessRuntime): Run {
  return (args, ctx) => {
    const value = args.trim();
    if (value !== "on" && value !== "off") {
      ctx.ui.notify("Use /wake on or /wake off.", "warning");
      return Promise.resolve();
    }
    rt.session.wake = value === "on";
    ctx.ui.notify(`Wake is ${value}.`, "info");
    return Promise.resolve();
  };
}

function snapshot(rt: HarnessRuntime): Run {
  return async (args, ctx) => {
    const label =
      args.trim().toLowerCase().replace(LABEL_JUNK, "-") ||
      `manual-${rt.clock.now()}`;
    const path = await rt.snapshots.write(label);
    ctx.ui.notify(`Wrote ${path}.`, "info");
  };
}

function commands(
  pi: ExtensionAPI,
  rt: HarnessRuntime,
): Record<string, Command> {
  const entry = (description: string, name: string, run: Run): Command => ({
    description,
    handler: logged(rt, name, run),
  });
  return {
    connect: entry("Log the character in again", "connect", connect(rt)),
    disconnect: entry(
      "Log the character out and keep the harness open",
      "disconnect",
      disconnect(rt),
    ),
    g: entry(
      "Say text in guild chat",
      "g",
      chat(rt, (handle, text) => handle.sendGuild(text)),
    ),
    log: entry(
      "Show the last 20 game log rows (optional filter)",
      "log",
      log(pi, rt),
    ),
    now: entry("Show the last [now] line the model got", "now", now(rt)),
    p: entry(
      "Say text in party chat",
      "p",
      chat(rt, (handle, text) => handle.sendParty(text)),
    ),
    say: entry(
      "Say text near the character",
      "say",
      chat(rt, (handle, text) => handle.sendSay(text)),
    ),
    snapshot: entry("Write a world snapshot file", "snapshot", snapshot(rt)),
    stop: {
      description: "Stop every run, movement and attack",
      handler: stop(rt),
    },
    w: entry("Whisper a player: /w <name> <text>", "w", whisper(rt)),
    wake: entry("Turn game wake-ups on or off: /wake on|off", "wake", wake(rt)),
  };
}

export function installCommands(pi: ExtensionAPI, rt: HarnessRuntime): void {
  for (const [name, command] of Object.entries(commands(pi, rt)))
    pi.registerCommand(name, command);
}
