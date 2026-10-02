import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const DEFAULT_LINGER = 60;
const POLL_MS = 250;

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function friendGuid(handle: WorldHandle, name: string): bigint | undefined {
  const lower = name.toLowerCase();
  for (const entry of handle.getFriends())
    if (entry.name.toLowerCase() === lower) return entry.guid;
  return undefined;
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const friend = args["friend"];
  if (!friend) throw new Error("contacts-notes needs --arg friend=<NAME>.");
  const ignoreBefore = handle.getIgnored().length;
  handle.addFriend(friend);
  const guid = await settle(() => friendGuid(handle, friend));
  if (guid === undefined) throw new Error(`no friend entry for ${friend}.`);
  const noted = await handle.contacts.act.setFriendNote(friend, "peon");
  if (!noted.ok) throw new Error(`setFriendNote refused: ${noted.reason}.`);
  const listed = await handle.contacts.act.requestContacts(1);
  if (!listed.ok) throw new Error(`requestContacts refused: ${listed.reason}.`);
  const entry = handle.getFriends().find((e) => e.guid === guid);
  handle.addIgnore(friend);
  const linger = Number(args["linger"] ?? DEFAULT_LINGER);
  if (!(linger >= 0))
    throw new Error(
      `contacts-notes needs linger >= 0, not "${args["linger"]}".`,
    );
  const deadline = Date.now() + linger * 1000;
  while (Date.now() < deadline) await Bun.sleep(POLL_MS);
  return {
    guid: hex(guid),
    ignoreAfter: handle.getIgnored().length,
    ignoreBefore,
    note: entry?.note ?? null,
  };
}

export const flow: ProbeFlow = {
  name: "contacts-notes",
  run,
  usage:
    "--flow contacts-notes --arg friend=<NAME> [--arg linger=<s>]: add the friend, set the note to peon, read the flags-1 list, then ignore the friend and wait up to 60 s for whispers.",
};
