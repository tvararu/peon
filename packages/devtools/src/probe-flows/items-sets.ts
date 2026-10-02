import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

type Args = Readonly<Record<string, string>>;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

const DOS = ["save", "use", "delete"] as const;
type Do = (typeof DOS)[number];

function doOf(args: Args): Do {
  const value = args["do"];
  const found = DOS.find((candidate) => candidate === value);
  if (!found)
    throw new Error(`items-sets needs do=${DOS.join("|")}, not "${value}".`);
  return found;
}

function indexOf(args: Args): number {
  const value = Number(args["index"]);
  if (!Number.isInteger(value) || value < 0 || value > 9)
    throw new Error(`items-sets needs index=<0-9>, not "${args["index"]}".`);
  return value;
}

function nameOf(args: Args, doName: Do): string {
  if (doName !== "save") return "";
  const name = args["name"] ?? "";
  if (new TextEncoder().encode(name).length > 16)
    throw new Error("items-sets needs name=<at most 16 bytes>.");
  return name;
}

function wornGuids(handle: WorldHandle): string[] {
  const guids: string[] = [];
  for (let slot = 0; slot < 19; slot++) {
    const held = handle
      .getInventoryState()
      .slots.find(
        (entry) =>
          entry.bag === 255 &&
          entry.slot === slot &&
          entry.region === "equipment",
      );
    guids.push(
      held?.status === "occupied" ? `0x${held.guid.toString(16)}` : "0x0",
    );
  }
  return guids;
}

function useOrDelete(
  handle: WorldHandle,
  doName: "use" | "delete",
  index: number,
): Promise<unknown> {
  if (doName === "use") return handle.items.act.useSet(index);
  return handle.items.act.deleteSet(index);
}

function listed(handle: WorldHandle): unknown {
  const state = handle.items.state() as { sets?: unknown };
  return state.sets;
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const doName = doOf(args);
  const index = indexOf(args);
  const name = nameOf(args, doName);
  await settle(() =>
    handle.getInventoryState().status === "complete" ? true : undefined,
  );
  const guids = wornGuids(handle);
  const outcome =
    doName === "save"
      ? await handle.items.act.saveSet({
          ...(args["icon"] ? { icon: args["icon"] } : {}),
          index,
          name,
        })
      : await useOrDelete(handle, doName, index);
  return json({
    do: doName,
    index,
    outcome,
    sets: listed(handle),
    worn: guids,
  });
}

export const flow: ProbeFlow = {
  name: "items-sets",
  run,
  usage:
    "--flow items-sets --arg do=save|use|delete --arg index=<0-9> [--arg name=<at most 16 bytes>] [--arg icon=<name>]: save the worn gear as set index, wear it back, or delete it; prints the worn guids, the outcome and the list it saw.",
};
