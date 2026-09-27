import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { WorldHandle } from "@peon/core";
import type { HarnessRuntime } from "#harness/contract/services";

export type Run = (args: string, ctx: ExtensionCommandContext) => Promise<void>;
type Deliver = (handle: WorldHandle, text: string) => unknown;
type Chat = { names: string[]; description: string; deliver: Deliver };

export const OFFLINE_TEXT = "The game connection is down. Run /connect.";
export const NO_REPLY_TEXT = "Nobody has whispered you yet.";

const WORDS = /\s+/;
const CHANNELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const CHATS: Chat[] = [
  {
    deliver: (handle, text) => handle.sendSay(text),
    description: "Say text near the character",
    names: ["s", "say"],
  },
  {
    deliver: (handle, text) => handle.sendYell(text),
    description: "Yell text to everyone nearby",
    names: ["y", "yell"],
  },
  {
    deliver: (handle, text) => handle.sendParty(text),
    description: "Write to the party",
    names: ["p", "party"],
  },
  {
    deliver: (handle, text) => handle.sendGuild(text),
    description: "Write to the guild",
    names: ["g", "guild"],
  },
  {
    deliver: (handle, text) => handle.sendOfficer(text),
    description: "Write to the guild officers",
    names: ["o", "officer"],
  },
  {
    deliver: (handle, text) => handle.sendRaid(text),
    description: "Write to the raid",
    names: ["ra", "raid"],
  },
  {
    deliver: (handle, text) => handle.sendEmote(text),
    description: "Do a custom emote",
    names: ["e", "em", "me", "emote"],
  },
  {
    deliver: (handle, text) => {
      const to = handle.getReplyTarget();
      return to ? handle.sendWhisper(to, text) : NO_REPLY_TEXT;
    },
    description: "Whisper the last player who whispered you",
    names: ["r", "reply"],
  },
  ...CHANNELS.map((index) => ({
    deliver: (handle: WorldHandle, text: string) => {
      const name = handle.getChannel(index);
      return name
        ? handle.sendChannel(name, text)
        : `You are not in channel ${index}.`;
    },
    description: `Write to joined channel ${index}`,
    names: [String(index)],
  })),
];

async function deliver(
  rt: HarnessRuntime,
  ctx: ExtensionCommandContext,
  send: (handle: WorldHandle) => unknown,
): Promise<void> {
  const handle = rt.handle();
  if (!handle) return ctx.ui.notify(OFFLINE_TEXT, "error");
  const refusal = await rt.mutex.run(() => send(handle));
  if (typeof refusal === "string") ctx.ui.notify(refusal, "warning");
}

function spoken(rt: HarnessRuntime, name: string, send: Deliver): Run {
  return async (args, ctx) => {
    const text = args.trim();
    if (!text) return ctx.ui.notify(`Use /${name} <text>.`, "warning");
    await deliver(rt, ctx, (handle) => send(handle, text));
  };
}

function whisper(rt: HarnessRuntime, name: string): Run {
  return async (args, ctx) => {
    const [to, ...words] = args.trim().split(WORDS);
    const text = words.join(" ");
    if (!(to && text))
      return ctx.ui.notify(`Use /${name} <name> <text>.`, "warning");
    await deliver(rt, ctx, (handle) => handle.sendWhisper(to, text));
  };
}

export function chatCommands<T>(
  rt: HarnessRuntime,
  entry: (description: string, name: string, run: Run) => T,
): Record<string, T> {
  const commands: Record<string, T> = {};
  for (const { names, description, deliver: send } of CHATS)
    for (const name of names)
      commands[name] = entry(description, name, spoken(rt, name, send));
  for (const name of ["w", "whisper", "t", "tell"])
    commands[name] = entry(
      "Whisper a player: /w <name> <text>",
      name,
      whisper(rt, name),
    );
  return commands;
}
