import { askHuman, nextCall } from "#harness/tools/define";

export type Unreached = { reason: string | undefined; detail: string };
export type Structural = "unsupported_map" | "no_path" | "no_ground";

const NO_PATH = [
  "UNKNOWN_PATH",
  "end snapped off",
  "native path omits destination",
];

export function structuralReach(leg: Unreached): Structural | undefined {
  if (
    leg.reason?.startsWith("unsupported_map") ||
    leg.detail.includes("unsupported map")
  )
    return "unsupported_map";
  if (leg.reason === "no_ground") return "no_ground";
  if (NO_PATH.some((text) => leg.detail.includes(text))) return "no_path";
}

export function structuralAsk(kind: Structural, name?: string): string {
  if (kind === "unsupported_map")
    return askHuman(
      name === undefined
        ? "This map has no navigation data, so I cannot walk anywhere. Can you move me?"
        : `This map has no navigation data, so I cannot walk to ${name}. Can you move me there?`,
    );
  return askHuman(
    `I cannot reach ${name ?? "anywhere"} from here. Is there another way?`,
  );
}

export function reachNext(
  leg: Unreached,
  unit: { name: string; ref: string },
): string {
  if (leg.reason === "start_off_mesh")
    return nextCall("travel", { to: "unstick" });
  const kind = structuralReach(leg);
  if (kind) return structuralAsk(kind, unit.name);
  return nextCall("travel", { to: unit.ref });
}
