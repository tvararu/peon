import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const QUEST_ID = 8326;
const RELAY_CODES: readonly number[] = [2, 3];

async function run({ args, handle, settle }: FlowContext): Promise<Json> {
  const relayMs = Number(args["relay"] ?? "0") * 1000;
  const grouped = await settle(() =>
    handle.getPartyState().inGroup ? true : undefined,
  );
  if (!grouped) throw new Error("no group formed; invite this account first.");
  const started = handle.quests.act.shareQuest(QUEST_ID);
  if (!started.ok)
    throw new Error(`quest ${QUEST_ID} not shared: ${started.reason}.`);
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

export const flow: ProbeFlow = {
  name: "quests-share",
  run,
  usage: `--flow quests-share [--arg relay=<s>]: wait for a group, share quest ${QUEST_ID} with it and print each MSG_QUEST_PUSH_RESULT as { guid, result } (0 SHARING_QUEST, 1 CANT_TAKE_QUEST, 4 BUSY, 6 HAVE_QUEST). With relay=<s> it also waits up to that long for a member's answer, 2 accept or 3 decline.`,
};
