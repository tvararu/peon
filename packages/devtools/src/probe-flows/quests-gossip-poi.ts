import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const ENTRY = /^[1-9][0-9]*$/;
const GUARD = "1423";
const INN = /inn/i;

function point(
  poi:
    | {
        flags: number;
        x: number;
        y: number;
        icon: number;
        importance: number;
        name: string;
      }
    | undefined,
): Json {
  if (!poi) return null;
  return {
    flags: poi.flags,
    icon: poi.icon,
    importance: poi.importance,
    name: poi.name,
    x: poi.x,
    y: poi.y,
  };
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const text = args["entry"] ?? GUARD;
  if (!ENTRY.test(text))
    throw new Error(
      `quests-gossip-poi needs entry=<creature entry>, not "${text}".`,
    );
  const entry = Number(text);
  const quests = handle.quests;
  const row = await settle(() =>
    others(handle).find((r) => r.entity.entry === entry),
  );
  if (!row) throw new Error(`no entity with entry ${entry} is in view.`);
  handle.talk(row.entity.guid);
  const menu = await settle(() => {
    const dialog = handle.getQuestState().dialog;
    return dialog?.kind === "gossip" && dialog.data.guid === row.entity.guid
      ? dialog.data
      : undefined;
  });
  if (!menu) throw new Error("the guard sent no gossip menu.");
  const option = menu.options.find((o) => INN.test(o.text));
  if (!option)
    throw new Error(
      `no inn option in the guard's menu: ${JSON.stringify(menu.options.map((o) => o.text))}.`,
    );
  handle.selectGossipOption(option.optionIndex);
  const poi = await settle(() =>
    quests.state().gossipPoi?.from === row.entity.guid
      ? quests.state().gossipPoi
      : undefined,
  );
  return {
    giver: summary(row),
    menuId: menu.menuId,
    poi: point(poi ?? undefined),
  };
}

export const flow: ProbeFlow = {
  name: "quests-gossip-poi",
  run,
  usage:
    "--flow quests-gossip-poi [--arg entry=<n>]: talk to the nearest guard with that entry (default 1423, a Stormwind Guard), select the Inn gossip option, and print the point of interest.",
};
