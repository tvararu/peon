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
  const joinedGuids: bigint[] = [];
  const off = handle.channels.onEvent((event) => {
    if (event.type === "channel_notice" && event.notice.type === "joined")
      joinedGuids.push(event.notice.guid);
  });
  try {
    handle.joinChannel(channel);
    const partner = await settle(() => joinedGuids[0]);
    if (partner === undefined)
      throw new Error(`no partner joined ${channel} before the wait ended.`);
    const list = await handle.channels.act.listChannel(channel);
    if (!list.ok) throw new Error(`list of ${channel} failed: ${list.reason}.`);
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
      partner,
    });
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "channels-list",
  run,
  usage:
    "--flow channels-list --arg channel=<name> [--arg other=<name>]: join the channel, wait for a partner to join it, list it, list it with display, ask the member count, then list a channel it is not on.",
};
