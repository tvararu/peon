import type { AreaEventOf } from "@peon/core";
import type { AreaDraft } from "#harness/areas/contract";
import { defineHarnessArea } from "#harness/areas/contract";
import { guidText, type RuleInput } from "#harness/events/rules";

type QuestsEvent = AreaEventOf<"quests">;
type Marks = Extract<QuestsEvent, { type: "marks" }>;
type Mark = Marks["givers"][number]["mark"];
const OFFERED: Record<Mark, boolean> = {
  available: true,
  available_low: false,
  available_repeatable: false,
  incomplete: false,
  none: false,
  reward: true,
};
const WORDS: Record<Mark, string> = {
  available: "has a quest for you",
  available_low: "has a low-level quest for you",
  available_repeatable: "has a repeatable quest for you",
  incomplete: "has no quest ready for you yet",
  none: "has no quest for you",
  reward: "has a quest to turn in",
};

function offered(givers: Marks["givers"]): Marks["givers"] {
  return givers.filter((giver) => OFFERED[giver.mark] === true);
}

function row(
  giver: Marks["givers"][number],
  rc: RuleInput,
  draft: Pick<AreaDraft, "class" | "name" | "text"> & {
    data?: Record<string, unknown>;
  },
): AreaDraft {
  const name = rc.lookup.unitName(giver.guid) ?? "A unit";
  return {
    ...draft,
    data: { mark: giver.mark, name, ...draft.data },
    guid: guidText(giver.guid),
    ref: rc.refOf(giver.guid),
  };
}

function scalar(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString(10);
  const plain =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean";
  return plain ? value : undefined;
}

function quiet(event: QuestsEvent): AreaDraft {
  const fields = Object.entries(event).flatMap(([key, value]) => {
    const kept = scalar(value);
    return kept === undefined ? [] : [[key, kept] as const];
  });
  return {
    class: "log",
    data: { ...Object.fromEntries(fields), fallback: true },
    name: event.type,
    text: `quests ${event.type}`,
  };
}

function onMarks(
  e: Marks,
  mem: { seen: Set<string> },
  rc: RuleInput,
): AreaDraft[] {
  const now = new Set(offered(e.givers).map((giver) => guidText(giver.guid)));
  const same =
    now.size === mem.seen.size && [...now].every((key) => mem.seen.has(key));
  mem.seen = now;
  if (same) return [];
  const givers = offered(e.givers);
  if (givers.length === 0)
    return [
      {
        class: "log",
        data: {},
        name: "marks",
        text: "No quest giver in view has a quest for you or a quest to turn in.",
      },
    ];
  const [first, ...rest] = givers;
  if (!first) return [];
  const head = `${rc.lookup.unitName(first.guid) ?? "A unit"} ${rc.refOf(first.guid)} ${WORDS[first.mark]}`;
  const tail = rest.map(
    (giver) =>
      `${rc.lookup.unitName(giver.guid) ?? "A unit"} ${rc.refOf(giver.guid)} ${WORDS[giver.mark]}`,
  );
  const text = tail.length === 0 ? `${head}.` : `${head}; ${tail.join("; ")}.`;
  return [
    row(first, rc, {
      class: "log",
      data: {
        givers: givers.map((giver) => ({
          mark: giver.mark,
          name: rc.lookup.unitName(giver.guid) ?? "A unit",
        })),
      },
      name: "marks",
      text: `Quest givers near you: ${text}`,
    }),
  ];
}

export const questsHarness = defineHarnessArea({
  area: "quests",
  rules: () => {
    const mem = { seen: new Set<string>() };
    return {
      event: (e: QuestsEvent, rc: RuleInput) =>
        e.type === "marks" ? onMarks(e, mem, rc) : [quiet(e)],
    };
  },
  worldActs: ["queryGiverStatuses", "queryPoi"],
});
