import { npcRoles } from "@peon/core";
import {
  entityType,
  type FlowContext,
  type Json,
  others,
  type ProbeFlow,
  summary,
} from "#tools/probe-flows";

const LIMIT = 5;
const TYPES = new Set(["unit", "player", "gameobject"]);
const ROLES = new Set<string>(npcRoles(0xff_ff_ff_ff));

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const kind = args["kind"] ?? "";
  if (!(TYPES.has(kind) || ROLES.has(kind)))
    throw new Error(
      `nearest needs kind=<unit|player|gameobject|an NPC role>, not "${kind}".`,
    );
  const matches = () => {
    const found = others(handle).filter((row) =>
      TYPES.has(kind)
        ? entityType(row) === kind
        : row.roles.some((role) => role === kind),
    );
    return found.length > 0 ? found : undefined;
  };
  const rows = (await settle(matches)) ?? [];
  return { kind, rows: rows.slice(0, LIMIT).map(summary) };
}

export const flow: ProbeFlow = {
  name: "nearest",
  run,
  usage:
    "--flow nearest --arg kind=<object type or NPC role>: list the five nearest.",
};
