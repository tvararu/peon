import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";
import { others } from "#tools/probe-flows";

async function run({ args, handle, settle }: FlowContext): Promise<Json> {
  const name = args["name"];
  if (name === undefined || name === "")
    throw new Error("referral-grant needs name=<NAME>.");
  const found = await settle(() =>
    others(handle).find(
      (row) =>
        row.entity.objectType === 4 &&
        row.entity.name?.toLowerCase() === name.toLowerCase(),
    ),
  );
  if (!found) throw new Error(`referral-grant sees no player named ${name}.`);
  const guid = found.entity.guid;
  const grant = await handle.referral.act.grantLevel(guid);
  const accept = handle.referral.act.acceptLevelGrant();
  return JSON.parse(
    JSON.stringify({ accept, grant, guid }, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

export const flow: ProbeFlow = {
  name: "referral-grant",
  run,
  usage:
    "--flow referral-grant --arg name=<NAME>: grant a level at the named player in view and report the server's failure code.",
};
