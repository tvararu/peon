import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
} from "#tools/probe-flows";

function spent(spec: { talents: readonly { rank: number }[] }): number {
  let total = 0;
  for (const talent of spec.talents) total += talent.rank + 1;
  return total;
}
const hex = (guid: bigint) => `0x${guid.toString(16)}`;
const FAR_YARDS = 40;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? hex(part) : part,
    ),
  );
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const name = args["name"];
  if (!name) throw new Error("inspect-partner needs name=<player name>.");
  const find = () => others(handle).find((row) => row.entity.name === name);
  const target = await settle(find);
  if (!target) throw new Error(`no player named ${name} is in view.`);
  const talents = await handle.inspect.act.inspect(target.entity.guid);
  if (!talents) throw new Error(`no SMSG_INSPECT_TALENT for ${name}.`);
  const progress = await handle.inspect.act.inspectAchievements(
    target.entity.guid,
  );
  if (!progress)
    throw new Error(`no SMSG_RESPOND_INSPECT_ACHIEVEMENTS for ${name}.`);
  const result: Record<string, Json> = {
    achievements: progress.done.length,
    distance: target.distance ?? null,
    gear: json(
      talents.gear.map((item) => ({
        enchants: item.enchants.map((enchant) => enchant.id),
        entry: item.entry,
        slot: item.slot,
      })),
    ),
    guid: hex(target.entity.guid),
    name: target.entity.name ?? name,
    specs: talents.specs.map((spec) => spent(spec)),
  };
  if (args["far"] === "1") {
    const from = target.position;
    if (!from) throw new Error(`no position for ${name}.`);
    let traveled = 0;
    for (let left = FAR_YARDS; left > 0; left -= 20) {
      const leg = await handle.walkTowardPoint(
        { x: from.x, y: from.y, z: from.z },
        -Math.min(20, left),
      );
      traveled += leg.traveled;
    }
    result["walked"] = traveled;
    const retry = await handle.inspect.act.inspect(target.entity.guid);
    result["far"] = retry ? json(retry.gear.length) : null;
  }
  return result;
}

export const flow: ProbeFlow = {
  name: "inspect-partner",
  run,
  usage:
    "--flow inspect-partner --arg name=<player> [--arg far=1]: inspect the named nearby player, print gear entries, spent points per spec and the achievement count; far=1 walks 40 yd away and inspects again, which must resolve undefined.",
};
