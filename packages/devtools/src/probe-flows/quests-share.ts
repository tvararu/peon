import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
} from "#tools/probe-flows";

const DEFAULT_QUEST_ID = 8326;
const ESCORT_QUEST_ID = 8488;
const MIRVEDA_ENTRY = 15_402;
const RELAY_CODES: readonly number[] = [2, 3];

async function run({ args, handle, settle }: FlowContext): Promise<Json> {
  if (args["mode"] === "escort") return escortSharer({ args, handle, settle });
  if (args["mode"] === "escort-confirm")
    return escortPartner({ args, handle, settle });
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

async function escortSharer({ handle, settle }: FlowContext): Promise<Json> {
  const grouped = await settle(() =>
    handle.getPartyState().inGroup ? true : undefined,
  );
  if (!grouped) throw new Error("no group formed; invite this account first.");
  const row = await settle(() =>
    others(handle).find((entry) => entry.entity.entry === MIRVEDA_ENTRY),
  );
  if (!row)
    throw new Error(`no entity with entry ${MIRVEDA_ENTRY} is in view.`);
  handle.talk(row.entity.guid);
  const offered = await settle(() => {
    const dialog = handle.getQuestState().dialog;
    if (!dialog) return;
    if (dialog.kind === "details" && dialog.data.questId === ESCORT_QUEST_ID)
      return dialog.data;
    const quests =
      dialog.kind === "gossip" || dialog.kind === "list"
        ? dialog.data.quests
        : undefined;
    if (quests?.some((entry) => entry.questId === ESCORT_QUEST_ID))
      return "menu" as const;
  });
  if (!offered) throw new Error(`quest ${ESCORT_QUEST_ID} was not offered.`);
  if (offered === "menu") {
    handle.selectQuest(ESCORT_QUEST_ID);
    const details = await settle(() => {
      const dialog = handle.getQuestState().dialog;
      return dialog?.kind === "details" &&
        dialog.data.questId === ESCORT_QUEST_ID
        ? dialog.data
        : undefined;
    });
    if (!details) throw new Error(`quest ${ESCORT_QUEST_ID} sent no details.`);
  }
  handle.acceptQuest();
  const logged = await settle(() =>
    handle
      .getQuestState()
      .log.slots.some((slot) => slot.questId === ESCORT_QUEST_ID)
      ? true
      : undefined,
  );
  if (!logged)
    throw new Error(`quest ${ESCORT_QUEST_ID} did not enter the log.`);
  return {
    giver: `0x${row.entity.guid.toString(16)}`,
    questId: ESCORT_QUEST_ID,
  };
}

async function escortPartner({ handle, settle }: FlowContext): Promise<Json> {
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
  usage: `--flow quests-share [--arg quest=<id>] [--arg relay=<s>]: wait for a group, share quest <id> (default ${DEFAULT_QUEST_ID}, which the server auto-accepts for the receiver; use 8329 to see an offer) with it and print each MSG_QUEST_PUSH_RESULT as { guid, result } (0 SHARING_QUEST, 1 CANT_TAKE_QUEST, 4 BUSY, 6 HAVE_QUEST). With relay=<s> it also waits up to that long for a member's answer, 2 accept or 3 decline. With --arg mode=escort, run on the grouped sharer beside Apprentice Mirveda (entry 15402): talk to her, take quest 8488, and print it once it enters the log. With --arg mode=escort-confirm, run on the grouped partner: wait for the SMSG_QUEST_CONFIRM_ACCEPT offer on quest 8488 and print it.`,
};
