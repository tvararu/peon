import type { JevPort } from "#harness/jev/contract";
import {
  createFaultSelect,
  faultMarker,
  parseJevFault,
} from "#harness/jev/fault";
import { selectJevAction } from "#harness/jev/select";
import { createGreedySelect, GREEDY_MODEL } from "#harness/loops/pilot-greedy";
export type JevEnv = Record<string, string | undefined>;

export function jevPort(env: JevEnv): JevPort | undefined {
  const fault = parseJevFault(env["JEV_FAULT"]);
  const apiKey = env["TYPESAFE_API_KEY"];
  if (!apiKey) return undefined;
  const endpointUrl = env["JEV_ENDPOINT_URL"] ?? env["TYPESAFE_ENDPOINT_URL"];
  const base = fault
    ? createFaultSelect(fault, selectJevAction)
    : selectJevAction;
  return {
    fault: fault && faultMarker(fault),
    select: (request, { record, signal }) =>
      base(request, { apiKey, endpointUrl, record, signal }),
  };
}

export const PILOT_CHOOSER_ENV = "PEON_PILOT_CHOOSER";

export function pilotPort(
  env: JevEnv,
  jev: JevPort | undefined,
): JevPort | undefined {
  if (env[PILOT_CHOOSER_ENV] === "greedy")
    return { fault: GREEDY_MODEL, select: createGreedySelect() };
  return jev;
}
