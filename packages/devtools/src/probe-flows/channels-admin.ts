import {
  type FlowContext,
  type Json,
  type ProbeFlow,
  settleWithin,
} from "#tools/probe-flows";

type ChannelAdminAction =
  | "password"
  | "set_owner"
  | "owner"
  | "moderator"
  | "unmoderator"
  | "mute"
  | "unmute"
  | "invite"
  | "kick"
  | "ban"
  | "unban"
  | "announcements"
  | "moderate";

const ACTIONS: ChannelAdminAction[] = [
  "owner",
  "password",
  "moderator",
  "unmoderator",
  "mute",
  "unmute",
  "invite",
  "announcements",
  "moderate",
  "ban",
  "unban",
  "kick",
  "set_owner",
];

type Args = Readonly<Record<string, string>>;

function argOf(args: Args, key: string): string {
  const value = args[key];
  if (value === undefined || value.length === 0)
    throw new Error(`channels-admin needs ${key}=<name>.`);
  return value;
}

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const channel = argOf(args, "channel");
  const partner = argOf(args, "partner");
  const password = args["password"] ?? "abc";
  const seen: Record<string, unknown>[] = [];
  const off = handle.channels.onEvent((event) => {
    if (event.type === "channel_notice")
      seen.push(event.notice as Record<string, unknown>);
  });
  try {
    handle.joinChannel(channel);
    const joined = await settle(() =>
      seen.find((row) => row["type"] === "you_joined"),
    );
    if (joined === undefined)
      throw new Error(`never joined ${channel}: no you_joined notice.`);
    const waitMs = Number(args["wait_ms"] ?? 0);
    if (waitMs > 0)
      await settleWithin(waitMs)(() =>
        seen.find((row) => row["type"] === "joined"),
      );
    const rows: Json[] = [];
    const params: Record<ChannelAdminAction, string | undefined> = {
      announcements: undefined,
      ban: partner,
      invite: partner,
      kick: partner,
      moderate: undefined,
      moderator: partner,
      mute: partner,
      owner: undefined,
      password,
      set_owner: partner,
      unban: partner,
      unmoderator: partner,
      unmute: partner,
    };
    for (const action of ACTIONS) {
      const outcome = await handle.channels.act.channelAdmin(
        channel,
        action,
        params[action],
      );
      if (!outcome.ok)
        throw new Error(`${action} on ${channel} refused: ${outcome.reason}.`);
      rows.push({ action, notice: json(outcome.notice ?? null) });
    }
    return { channel, notices: rows, partner, seen: json(seen) };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "channels-admin",
  run,
  usage:
    "--flow channels-admin --arg channel=<name> --arg partner=<name> [--arg password=<pw>] [--arg wait_ms=<ms>]: join the channel, wait up to wait_ms for another player to join, run the thirteen admin actions (owner, password, moderator, unmoderator, mute, unmute, invite, announcements, moderate, ban, unban, kick, set_owner), and print each server notice.",
};
