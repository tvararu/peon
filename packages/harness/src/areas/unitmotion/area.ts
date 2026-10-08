import type { AreaEventOf } from "@peon/core";
import { type AreaDraft, defineHarnessArea } from "#harness/areas/contract";
import type { RuleInput } from "#harness/events/rules";

const ROW_GAP_MS = 100;

type MotionEvent = AreaEventOf<"unitmotion">;

function inFight(guid: bigint, rc: RuleInput): boolean {
  const fights = [...rc.memo.fights.values()];
  return (
    fights.some((fight) => fight.guid === guid) ||
    guid === rc.lookup.lastAttacker()
  );
}

type RowInit = { name: string; text: string; data: Record<string, unknown> };

function rowOf(guid: bigint, init: RowInit, rc: RuleInput): AreaDraft {
  return {
    class: "log",
    data: { ...init.data, guid: guid.toString(10) },
    guid: guid.toString(10),
    name: init.name,
    ref: rc.refOf(guid),
    text: init.text,
  };
}

type FlagEvent = Extract<MotionEvent, { type: "flag" }>;
type SpeedEvent = Extract<MotionEvent, { type: "speed" }>;

function flagDraft(event: FlagEvent, name: string): RowInit | undefined {
  if (event.flag !== "root") return undefined;
  return event.on
    ? { data: { on: true }, name: "rooted", text: `${name} rooted` }
    : { data: { on: false }, name: "freed", text: `${name} freed from root` };
}

function speedDraft(event: SpeedEvent, name: string): RowInit | undefined {
  if (event.kind !== "run") return undefined;
  const { previous, value } = event;
  if (previous === undefined || previous === value || previous <= 0)
    return undefined;
  const pct = Math.round((value / previous) * 100);
  return value < previous
    ? {
        data: { pct, previous, value },
        name: "slowed",
        text: `${name} slowed to ${pct}% run speed`,
      }
    : {
        data: { pct, previous, value },
        name: "sped",
        text: `${name} sped up to ${pct}% run speed`,
      };
}
function draftOf(event: MotionEvent, rc: RuleInput): AreaDraft | undefined {
  const name = rc.lookup.unitName(event.guid) ?? rc.refOf(event.guid);
  if (event.type === "flag") {
    const init = flagDraft(event, name);
    return init ? rowOf(event.guid, init, rc) : undefined;
  }
  if (event.type === "speed") {
    const init = speedDraft(event, name);
    return init ? rowOf(event.guid, init, rc) : undefined;
  }
  return undefined;
}

export const unitmotionHarness = defineHarnessArea({
  area: "unitmotion",
  rules: () => {
    const lastRow = new Map<bigint, number>();
    return {
      event: (event, rc) => {
        if (event.type === "removed") return [];
        if (event.self || !inFight(event.guid, rc)) return [];
        const draft = draftOf(event, rc);
        if (!draft) return [];
        const last = lastRow.get(event.guid);
        if (last !== undefined && rc.now - last < ROW_GAP_MS) return [];
        lastRow.set(event.guid, rc.now);
        return [draft];
      },
    };
  },
});
