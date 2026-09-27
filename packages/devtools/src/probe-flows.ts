import type { WorldHandle } from "@peon/core";

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export type Settle = <T>(read: () => T | undefined) => Promise<T | undefined>;

export type FlowContext = {
  handle: WorldHandle;
  args: Readonly<Record<string, string>>;
  settle: Settle;
};

export type ProbeFlow = {
  name: string;
  usage: string;
  run: (ctx: FlowContext) => Json | Promise<Json>;
};

type NearbyRow = ReturnType<WorldHandle["queryNearby"]>[number];

const SETTLE_POLL_MS = 100;

const FLOWS_DIR = `${import.meta.dir}/probe-flows`;
const TYPES: Readonly<Record<number, string>> = {
  3: "unit",
  4: "player",
  5: "gameobject",
};

function isFlow(value: unknown): value is ProbeFlow {
  if (typeof value !== "object" || value === null) return false;
  const { name, usage, run } = value as Record<string, unknown>;
  return (
    typeof name === "string" &&
    typeof usage === "string" &&
    typeof run === "function"
  );
}

export function settleWithin(ms: number): Settle {
  return async (read) => {
    const deadline = Date.now() + ms;
    let value = read();
    while (value === undefined && Date.now() < deadline) {
      await Bun.sleep(SETTLE_POLL_MS);
      value = read();
    }
    return value;
  };
}

export async function loadFlows(
  dir = FLOWS_DIR,
): Promise<Map<string, ProbeFlow>> {
  const flows = new Map<string, ProbeFlow>();
  const files = await Array.fromAsync(new Bun.Glob("*.ts").scan(dir));
  for (const file of files
    .filter((name) => !name.endsWith(".test.ts"))
    .sort()) {
    const { flow } = await import(`${dir}/${file}`);
    if (!isFlow(flow) || `${flow.name}.ts` !== file)
      throw new Error(
        `${dir}/${file} must export a flow named after its file.`,
      );
    flows.set(flow.name, flow);
  }
  return flows;
}

export function entityType(row: NearbyRow): string {
  return TYPES[row.entity.objectType] ?? `type${row.entity.objectType}`;
}

export function others(handle: WorldHandle): NearbyRow[] {
  return handle
    .queryNearby()
    .filter((row) => !row.self)
    .sort(
      (a, b) =>
        (a.distance ?? Number.POSITIVE_INFINITY) -
        (b.distance ?? Number.POSITIVE_INFINITY),
    );
}

export function summary(row: NearbyRow): Json {
  const { entity, distance, roles } = row;
  return {
    distance: distance === null ? null : Math.round(distance * 10) / 10,
    entry: entity.entry,
    guid: `0x${entity.guid.toString(16)}`,
    name: entity.name ?? null,
    roles,
    type: entityType(row),
  };
}
