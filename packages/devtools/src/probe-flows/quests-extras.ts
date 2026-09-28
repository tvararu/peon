import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const ERONA = "15278";

const PONG_WAIT_MS = 35_000;

type LogRow = { slot: number; questId: number };

function logSlots(handle: WorldHandle): LogRow[] {
  const rows: LogRow[] = [];
  for (const slot of handle.getQuestState().log.slots)
    if (slot.questId !== undefined && slot.questId !== 0)
      rows.push({ questId: slot.questId, slot: slot.slot });
  return rows;
}

function toJson(rows: LogRow[]): Json {
  return rows.map((row) => ({ questId: row.questId, slot: row.slot }));
}

async function run({ handle, settle }: FlowContext): Promise<Json> {
  const quests = handle.quests;
  const row = await settle(() =>
    others(handle).find((entry) => entry.entity.entry === Number(ERONA)),
  );
  quests.act.questgiverHello(row?.entity.guid ?? 0n);
  const lastSeq = handle.login.state().link.lastSeq;
  quests.act.autoLaunch();
  const logged = await settle(() =>
    handle.getQuestState().lastError?.kind === "stale_dialog"
      ? handle.getQuestState().lastError
      : undefined,
  );
  const pinged = await new Promise<{ rttMs: number; seq: number } | false>(
    (resolve) => {
      const off = handle.onAreaEvent((area) => {
        if (area.area !== "login" || area.event.type !== "pong") return;
        if (area.event.seq > lastSeq) {
          clearTimeout(timer);
          off();
          resolve({ rttMs: area.event.rttMs, seq: area.event.seq });
        }
      });
      const timer = setTimeout(() => {
        off();
        resolve(false);
      }, PONG_WAIT_MS);
    },
  );
  const before = logSlots(handle);
  const first = before[0];
  const second = before[1];
  const swapped =
    first && second ? quests.act.swapLogSlots(first.slot, second.slot) : false;
  const swappedLog = swapped
    ? await settle(() => {
        const rows = logSlots(handle);
        const moved =
          rows.length > 1 &&
          first &&
          second &&
          rows[0]?.questId === second.questId &&
          rows[1]?.questId === first.questId;
        return moved ? rows : undefined;
      })
    : undefined;
  return {
    after: toJson(swappedLog ?? logSlots(handle)),
    before: toJson(before),
    completed: [...(quests.state().completed?.ids ?? [])].sort((a, b) => a - b),
    giver: row ? summary(row) : null,
    helloSent: row !== undefined,
    ping: pinged,
    staleDialog: logged !== undefined,
    swapped,
  };
}

export const flow: ProbeFlow = {
  name: "quests-extras",
  run,
  usage:
    "--flow quests-extras: send CMSG_QUESTGIVER_HELLO to Magistrix Erona (entry 15278), CMSG_QUESTGIVER_QUEST_AUTOLAUNCH, wait for the next SMSG_PONG and report it as ping, swap log slots 0 and 1, and print the quest log before and after plus the completed ids. The hello reaches QuestStore with no pending intent, so it records stale_dialog (SR1-quests-13).",
};
