import type { PlayerLife } from "@tuicraft/core";
import type { LogClass, LogDraft, LogEvent } from "#harness/contract/log";
import type { RunEvent, RunRecord } from "#harness/contract/runs";
import { runLabel } from "#harness/runs/registry";

export type RuleContext = {
  selfName: string;
  selfGuid: bigint;
  runActive: boolean;
  wake: boolean;
  now: number;
  refOf: (guid: bigint) => string;
};
export type Drafts = LogDraft[];
export type SelfVitals = {
  hp: number;
  maxHp: number;
  power: number;
  maxPower: number;
};
export type PlaceNames = { zone: string | undefined; area: string | undefined };
export type RuleLookup = {
  experience: () => { xp: number | undefined; next: number | undefined };
  itemName: (itemId: number) => string | undefined;
  lastAttacker: () => bigint | undefined;
  place: () => PlaceNames;
  questTitle: (questId: number) => string | undefined;
  selfVitals: () => SelfVitals | undefined;
  unitLevel: (guid: bigint) => number | undefined;
  unitName: (guid: bigint) => string | undefined;
};
export type AuraMemo = { spellId: number; name: string | undefined };
export type PoseMemo = { mapId: number; x: number; y: number; z: number };
export type RuleMemo = {
  auras: Map<number, AuraMemo>;
  coinage: number | undefined;
  cycleActive: boolean;
  fights: Map<string, { at: number; guid: bigint }>;
  levelAt: number | undefined;
  life: PlayerLife | undefined;
  lowHealth: Map<number, boolean>;
  moneyNoticeAt: number | undefined;
  pose: PoseMemo | undefined;
  questProgress: Map<string, number>;
  questTitles: Map<number, string>;
  runProgressAt: Map<string, number>;
  xpAt: number | undefined;
};
export type RuleInput = RuleContext & { lookup: RuleLookup; memo: RuleMemo };

export const RUN_PROGRESS_MS = 5000;

type RunRow = {
  record: RunRecord;
  event: LogEvent;
  cls: LogClass;
  text: string;
};

export function createRuleMemo(): RuleMemo {
  return {
    auras: new Map(),
    coinage: undefined,
    cycleActive: false,
    fights: new Map(),
    levelAt: undefined,
    life: undefined,
    lowHealth: new Map(),
    moneyNoticeAt: undefined,
    pose: undefined,
    questProgress: new Map(),
    questTitles: new Map(),
    runProgressAt: new Map(),
    xpAt: undefined,
  };
}

export function guidText(guid: bigint): string {
  return guid.toString(16);
}

export function unitIds(
  guid: bigint | undefined,
  rc: RuleContext,
): { guid?: string; ref?: string } {
  return guid === undefined
    ? {}
    : { guid: guidText(guid), ref: rc.refOf(guid) };
}

function runRow({ record, event, cls, text }: RunRow): LogDraft {
  const { args, id, kind, progress, reason, status, summary, toolCallId } =
    record;
  const data = { args, id, kind, progress, reason, status, summary };
  return {
    class: cls,
    data,
    domain: "run",
    event,
    runId: id,
    text,
    tool: toolCallId,
  };
}

function progressDrafts(record: RunRecord, rc: RuleInput): Drafts {
  const last = rc.memo.runProgressAt.get(record.id);
  if (record.progress === undefined) return [];
  if (last !== undefined && rc.now - last < RUN_PROGRESS_MS) return [];
  rc.memo.runProgressAt.set(record.id, rc.now);
  return [
    runRow({
      cls: "log",
      event: "run/progress",
      record,
      text: `${record.id} ${record.progress}`,
    }),
  ];
}

function endDraft(record: RunRecord): LogDraft {
  const cancelled =
    record.status === "cancelled" || record.status === "interrupted";
  const cls = cancelled || record.awaited ? "log" : "wake";
  const why = record.summary ?? record.reason ?? "no summary";
  const text = `${record.id} ${runLabel(record)} ${record.status}: ${why}`;
  return runRow({
    cls,
    event: cancelled ? "run/cancelled" : "run/ended",
    record,
    text,
  });
}

export function runDrafts({ type, record }: RunEvent, rc: RuleInput): Drafts {
  if (type === "progress") return progressDrafts(record, rc);
  if (type === "ended") return [endDraft(record)];
  const text = `${record.id} started: ${runLabel(record)}`;
  return [runRow({ cls: "log", event: "run/started", record, text })];
}
