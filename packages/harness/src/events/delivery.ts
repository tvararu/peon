import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ChatType } from "@tuicraft/core";
import type {
  GameLogEntry,
  HumanLineDetails,
  WowEventDetails,
} from "#harness/contract/log";
import type {
  DeliverySink,
  GameLog,
  HarnessRuntime,
} from "#harness/contract/services";
import { WAKE_MIN_GAP_MS } from "#harness/events/guard";

export const PASSIVE_FLUSH_CAP = 20;
export const CALL_ROWS_CAP = 5;

const FIGHT_OVER = new Set<GameLogEntry["event"]>([
  "fight/end",
  "combat/kill_credit",
  "combat/target_died",
]);

export type Delivery = DeliverySink & {
  flush: () => void;
  takePassive: () => GameLogEntry[];
};

type DeliveryInit = { pi: ExtensionAPI; rt: HarnessRuntime };
type Send = DeliveryInit & {
  kind: WowEventDetails["kind"];
  wakes: GameLogEntry[];
  passive: GameLogEntry[];
};

function isChat(entry: GameLogEntry): boolean {
  return entry.event === "chat/in";
}

function isChatWake(entry: GameLogEntry): boolean {
  return entry.class === "wake" && isChat(entry);
}

const WHISPERS = new Set<unknown>([ChatType.WHISPER, ChatType.WHISPER_FOREIGN]);

const CHANNEL_REPLY = new Map<unknown, string>([
  [ChatType.PARTY, "party"],
  [ChatType.PARTY_LEADER, "party"],
  [ChatType.GUILD, "guild"],
  [ChatType.OFFICER, "guild"],
]);

function replyHint(entry: GameLogEntry): string {
  if (!isChatWake(entry)) return "";
  const type = entry.data["type"];
  if (WHISPERS.has(type))
    return ` Next: social(to: "${String(entry.data["sender"])}", text: "…")`;
  return ` Next: social(do: "${CHANNEL_REPLY.get(type) ?? "say"}", text: "…")`;
}

function wakeLine(entry: GameLogEntry, now: number): string {
  const age = Math.max(0, Math.round((now - entry.ts) / 1000));
  return `[game ${age}s] ${entry.text}${replyHint(entry)}`;
}

export function formatWake(
  entries: readonly GameLogEntry[],
  now: number,
): string {
  return entries
    .toSorted((a, b) => a.ts - b.ts || a.seq - b.seq)
    .map((entry) => wakeLine(entry, now))
    .join("\n");
}

function capped(passive: GameLogEntry[]): {
  shown: GameLogEntry[];
  more: number;
} {
  const shown = passive.slice(-PASSIVE_FLUSH_CAP);
  return { more: passive.length - shown.length, shown };
}

function moreText(more: number): string {
  return more > 0 ? `\n+${more} more in the log (journal about "log").` : "";
}

export function attachCallRows(
  log: GameLog,
  toolCallId: string,
  now: number,
): string {
  const rows = log.since(0);
  const start = rows.findLastIndex(
    (row) => row.event === "tool/call" && row.data["toolCallId"] === toolCallId,
  );
  if (start < 0) return "";
  const fresh = rows
    .slice(start + 1)
    .filter(
      (row) =>
        row.class === "passive" &&
        row.consumedBy === undefined &&
        row.delivered !== true,
    );
  if (fresh.length === 0) return "";
  for (const row of fresh)
    log.mark(row.seq, { consumedBy: toolCallId, delivered: true });
  const shown = formatWake(fresh.slice(0, CALL_ROWS_CAP), now);
  return `\n${shown}${moreText(fresh.length - CALL_ROWS_CAP)}`;
}

function quiet(entry: GameLogEntry): boolean {
  return entry.event === "xp/gain" && entry.data["source"] === "exploration";
}

function fightOver(rt: HarnessRuntime, entry: GameLogEntry): boolean {
  if (entry.event !== "combat/attacked" || entry.guid === undefined)
    return false;
  return rt.log
    .since(entry.seq)
    .some((row) => row.guid === entry.guid && FIGHT_OVER.has(row.event));
}

function heldByRun(rt: HarnessRuntime, entry: GameLogEntry): boolean {
  const run = entry.runId ? rt.runs.get(entry.runId) : undefined;
  return run?.status === "running";
}

function drain(rt: HarnessRuntime, seqs: number[]): GameLogEntry[] {
  const kept: number[] = [];
  const ready = seqs.splice(0).flatMap((seq) => {
    const entry = rt.log.get(seq);
    if (!entry) return [];
    if (entry.consumedBy === undefined) return [entry];
    if (heldByRun(rt, entry)) kept.push(seq);
    return [];
  });
  seqs.push(...kept);
  return ready;
}

function markDelivered(
  rt: HarnessRuntime,
  entries: readonly GameLogEntry[],
): void {
  for (const entry of entries) rt.log.mark(entry.seq, { delivered: true });
}

function send({ pi, rt, kind, wakes, passive }: Send): void {
  const { more, shown } = capped(passive);
  const entries = [...wakes, ...shown];
  if (entries.length === 0) return;
  const tail = moreText(more);
  const details: WowEventDetails = { entries, kind };
  const content = `${formatWake(entries, rt.clock.now())}${tail}`;
  const options =
    kind === "wake"
      ? { deliverAs: "followUp" as const, triggerTurn: true }
      : { triggerTurn: false };
  pi.sendMessage(
    { content, customType: "wow-event", details, display: true },
    options,
  );
  markDelivered(rt, entries);
}

export function createDelivery({ pi, rt }: DeliveryInit): Delivery {
  const wakeSeqs: number[] = [];
  const passiveSeqs: number[] = [];
  let lastWakeAt: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const passiveFor = (wakes: GameLogEntry[]): GameLogEntry[] => {
    if (wakes.some(isChatWake)) return [];
    return drain(rt, passiveSeqs);
  };
  const sendWakes = () => {
    clearTimeout(timer);
    timer = undefined;
    const wakes = drain(rt, wakeSeqs).filter((entry) => !fightOver(rt, entry));
    if (wakes.length === 0) return;
    lastWakeAt = rt.clock.now();
    send({ kind: "wake", passive: passiveFor(wakes), pi, rt, wakes });
  };
  const schedule = () => {
    if (rt.session.agent !== "idle" || timer) return;
    const wait =
      lastWakeAt === undefined
        ? 0
        : WAKE_MIN_GAP_MS - (rt.clock.now() - lastWakeAt);
    if (wait > 0) timer = setTimeout(sendWakes, wait);
    else sendWakes();
  };
  return {
    flush() {
      sendWakes();
      send({
        kind: "passive",
        passive: drain(rt, passiveSeqs),
        pi,
        rt,
        wakes: [],
      });
    },
    human(entry) {
      pi.appendEntry<HumanLineDetails>("wow-human", { entry });
    },
    passive(entry) {
      if (!quiet(entry)) passiveSeqs.push(entry.seq);
    },
    takePassive() {
      const { shown } = capped(drain(rt, passiveSeqs));
      markDelivered(rt, shown);
      return shown;
    },
    wake(entries) {
      wakeSeqs.push(...entries.map((entry) => entry.seq));
      schedule();
    },
  };
}
