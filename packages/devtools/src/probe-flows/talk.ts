import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const ENTRY = /^[1-9][0-9]*$/;

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const text = args["entry"] ?? "";
  if (!ENTRY.test(text))
    throw new Error(`talk needs entry=<creature entry>, not "${text}".`);
  const entry = Number(text);
  const find = () => others(handle).find((r) => r.entity.entry === entry);
  const row = await settle(find);
  if (!row) throw new Error(`no entity with entry ${entry} is in view.`);
  handle.talk(row.entity.guid);
  return summary(row);
}

export const flow: ProbeFlow = {
  name: "talk",
  run,
  usage:
    "--flow talk --arg entry=<n>: send CMSG_GOSSIP_HELLO to the nearest entity with that entry.",
};
