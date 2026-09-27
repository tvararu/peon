import type { JevPort } from "#harness/jev/contract";
import {
  createFaultSelect,
  faultMarker,
  parseJevFault,
} from "#harness/jev/fault";
import { selectJevAction } from "#harness/jev/select";

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
    select: (request, { signal }) =>
      base(request, { apiKey, endpointUrl, signal }),
  };
}
