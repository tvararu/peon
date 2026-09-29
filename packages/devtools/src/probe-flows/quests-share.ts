import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const DEFAULT_QUEST_ID = 8326;
const ESCORT_QUEST_ID = 8488;
const RELAY_CODES: readonly number[] = [2, 3];

async function run({ args, handle, settle }: FlowContext): Promise<Json> {
  if (args["mode"] === "escort") return escort({ args, handle, settle });
  const relayMs = Number(args["relay"] ?? "0") * 1000;
  const questId = Number(args["quest"] ?? DEFAULT_QUEST_ID);
  const grouped = await settle(() =>
    handle.getPartyState().inGroup ? true : undefined,
  );
  if (!grouped) throw new Error("no group formed; invite this account first.");
  const started = handle.quests.act.shareQuest(questId);
  if (!started.ok)
    throw new Error(`quest ${questId} not shared: ${started.reason}.`);
  const results = () => handle.quests.state().share?.push?.results ?? [];
  await settle(() => (results().length > 0 ? true : undefined));
  const deadline = Date.now() + relayMs;
  while (
    Date.now() < deadline &&
    !results().some((row) => RELAY_CODES.includes(row.result))
  )
    await settle(() =>
      results().some((row) => RELAY_CODES.includes(row.result))
        ? true
        : undefined,
    );
  return {
    results: results().map((row) => ({
      guid: `0x${row.guid.toString(16)}`,
      result: row.result,
    })),
    status: handle.quests.state().share?.push?.status ?? "open",
  };
}

async function escort({ handle, settle }: FlowContext): Promise<Json> {
  const seen = await settle(() => {
    const offer = handle.quests.state().share?.offer;
    if (!offer) return;
    if (offer.kind !== "confirm" || offer.questId !== ESCORT_QUEST_ID) return;
    return {
      from: `0x${offer.from.toString(16)}`,
      questId: offer.questId,
      title: offer.title,
    };
  });
  if (!seen) throw new Error("no escort prompt was offered.");
  return seen;
}

export const flow: ProbeFlow = {
  name: "quests-share",
  run,
  usage: `--flow quests-share [--arg quest=<id>] [--arg relay=<s>]: wait for a group, share quest <id> (default ${DEFAULT_QUEST_ID}, which the server auto-accepts for the receiver; use 8329 to see an offer) with it and print each MSG_QUEST_PUSH_RESULT as { guid, result } (0 SHARING_QUEST, 1 CANT_TAKE_QUEST, 4 BUSY, 6 HAVE_QUEST). With relay=<s> it also waits up to that long for a member's answer, 2 accept or 3 decline. With --arg mode=escort it waits for the partner SMSG_QUEST_CONFIRM_ACCEPT offer on quest 8488 and prints it.`,
};
