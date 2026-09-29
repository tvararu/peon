import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const ENTRY = /^[1-9][0-9]*$/;
const ERONA = "15278";
const FALLBACK_ID = 999_999;

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const text = args["entry"] ?? ERONA;
  if (!ENTRY.test(text))
    throw new Error(`quests-text needs entry=<creature entry>, not "${text}".`);
  const entry = Number(text);
  const quests = handle.quests;
  const row = await settle(() =>
    others(handle).find((r) => r.entity.entry === entry),
  );
  if (!row) throw new Error(`no entity with entry ${entry} is in view.`);
  handle.talk(row.entity.guid);
  const dialog = await settle(() => {
    const seen = handle.getQuestState().dialog;
    return seen?.kind === "gossip" && seen.data.guid === row.entity.guid
      ? seen.data
      : undefined;
  });
  const greeting = dialog
    ? await settle(() => quests.act.greeting(dialog.titleTextId))
    : undefined;
  const asked = quests.act.queryNpcText(FALLBACK_ID, row.entity.guid);
  const fallback = asked
    ? await settle(() => quests.act.greeting(FALLBACK_ID))
    : undefined;
  return {
    fallback: fallback ?? null,
    fallbackId: FALLBACK_ID,
    giver: summary(row),
    greeting: greeting ?? null,
    titleTextId: dialog?.titleTextId ?? null,
  };
}

export const flow: ProbeFlow = {
  name: "quests-text",
  run,
  usage:
    "--flow quests-text [--arg entry=<n>]: talk to the nearest entity with that entry (default 15278, Magistrix Erona), print its gossip title text id and greeting, then query text id 999999 and print the fallback greeting.",
};
