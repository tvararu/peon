import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const channel = args["channel"];
  if (channel === undefined || channel.length === 0)
    throw new Error("channels-list needs channel=<name>.");
  const other = args["other"] ?? `${channel}other`;
  let joined = false;
  const off = handle.channels.onEvent((event) => {
    if (event.type === "channel_notice" && event.notice.type === "you_joined")
      joined = true;
  });
  try {
    handle.joinChannel(channel);
    if ((await settle(() => (joined ? true : undefined))) === undefined)
      throw new Error(`never joined ${channel}: no you_joined notice.`);
    const list = await handle.channels.act.listChannel(channel);
    if (!list.ok) throw new Error(`list of ${channel} failed: ${list.reason}.`);
    if (list.members.length < 2)
      throw new Error(
        `no partner on ${channel}: ${list.members.length} member.`,
      );
    const display = await handle.channels.act.listChannel(channel, {
      display: true,
    });
    if (!display.ok)
      throw new Error(`display list of ${channel} failed: ${display.reason}.`);
    const count = await handle.channels.act.channelMemberCount(channel);
    if (count === undefined)
      throw new Error(`member count of ${channel} got no answer.`);
    const notMember = await handle.channels.act.listChannel(other);
    return json({
      channel,
      count,
      display,
      list,
      notMember,
      other,
    });
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "channels-list",
  run,
  usage:
    "--flow channels-list --arg channel=<name> [--arg other=<name>]: join the channel (a partner account joined it first), list it, fail unless two members show, list it with display, ask the member count, then list a channel it is not on.",
};
