import type { WorldHandle } from "@peon/core";
import {
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const ENTRY = /^[1-9][0-9]*$/;
const ERONA = "15278";

type Marks = ReturnType<WorldHandle["quests"]["state"]>["marks"];

const hex = (guid: bigint) => `0x${guid.toString(16)}`;

function marksOf(handle: WorldHandle, marks: Marks): Json[] {
  const rows = new Map(others(handle).map((row) => [row.entity.guid, row]));
  return [...marks].map(([guid, { status, source }]) => {
    const row = rows.get(guid);
    return {
      entry: row?.entity.entry ?? null,
      guid: hex(guid),
      name: row?.entity.name ?? null,
      source,
      status,
    };
  });
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const text = args["entry"] ?? ERONA;
  if (!ENTRY.test(text))
    throw new Error(
      `quests-marks needs entry=<creature entry>, not "${text}".`,
    );
  const entry = Number(text);
  const quests = handle.quests;
  await settle(() => (quests.state().marks.size > 0 ? true : undefined));
  const firstMarks = marksOf(handle, quests.state().marks);
  quests.act.queryGiverStatuses();
  const row = await settle(() =>
    others(handle).find((r) => r.entity.entry === entry),
  );
  const asked = row ? quests.act.queryGiverStatus(row.entity.guid) : false;
  const single = row
    ? await settle(() => {
        const mark = quests.state().marks.get(row.entity.guid);
        return mark?.source === "single" ? mark : undefined;
      })
    : undefined;
  return {
    firstMarks,
    giver: row ? summary(row) : null,
    giverStatus: single?.status ?? null,
    marks: marksOf(handle, quests.state().marks),
    singleSent: asked,
  };
}

export const flow: ProbeFlow = {
  name: "quests-marks",
  run,
  usage:
    "--flow quests-marks [--arg entry=<n>]: wait for the first non-empty quest-giver marks (the reply to the query the runtime sends after the givers come into view; the empty login list shows only in the packet trace), send CMSG_QUESTGIVER_STATUS_MULTIPLE_QUERY, then CMSG_QUESTGIVER_STATUS_QUERY for the nearest entity with that entry (default 15278, Magistrix Erona), and print the marks.",
};
