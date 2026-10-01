import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const ENTRY = /^[1-9][0-9]*$/;
const COPPER = /^[0-9]+$/;
const RESET_OPTION = /^i wish to unlearn my talents/i;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function numberArg(
  args: Readonly<Record<string, string>>,
  name: string,
  pattern: RegExp,
): number {
  const text = args[name] ?? "";
  if (!pattern.test(text))
    throw new Error(`talents-reset needs ${name}=<number>, not "${text}".`);
  return Number(text);
}

function freePoints(handle: WorldHandle): Json {
  return handle.talents.state().player?.freePoints ?? null;
}

async function run(ctx: FlowContext): Promise<Json> {
  const { args, handle, settle } = ctx;
  const entry = numberArg(args, "npc", ENTRY);
  const maxCost = numberArg(args, "max", COPPER);
  const trainer = await settle(() =>
    others(handle).find((r) => r.entity.entry === entry),
  );
  if (!trainer) throw new Error(`no entity with entry ${entry} is in view.`);
  const guid = trainer.entity.guid;
  handle.talk(guid);
  const menu = await settle(() => {
    const dialog = handle.getQuestState().dialog;
    return dialog?.kind === "gossip" && dialog.data.guid === guid
      ? dialog.data
      : undefined;
  });
  if (!menu) throw new Error("the trainer sent no gossip menu.");
  const option = menu.options.find((o) => RESET_OPTION.test(o.text));
  if (!option)
    throw new Error(
      `no reset option in the trainer's menu: ${JSON.stringify(menu.options.map((o) => o.text))}.`,
    );
  const before = freePoints(handle);
  const result = await handle.talents.act.resetTalents({
    maxCost,
    optionIndex: option.optionIndex,
  });
  return json({
    dialogAfter: handle.getQuestState().dialog?.kind ?? null,
    freePointsAfter: freePoints(handle),
    freePointsBefore: before,
    optionIndex: option.optionIndex,
    result,
    trainer: summary(trainer),
  });
}

export const flow: ProbeFlow = {
  name: "talents-reset",
  run,
  usage:
    "--flow talents-reset --arg npc=<creature entry> --arg max=<copper>: open the gossip menu of the nearest creature of that entry, pick the option that starts 'I wish to unlearn my talents', run the talents reset act with that cost limit and print the result with the free points before and after.",
};
