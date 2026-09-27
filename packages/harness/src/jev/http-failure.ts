import { JevTransportError, JevUnavailableError } from "#harness/jev/failure";

const REFUSED: Record<number, string> = {
  401: "unauthorized",
  402: "payment_required",
  403: "forbidden",
};

export function httpFailure(status: number, body: unknown): Error {
  const refused = REFUSED[status];
  if (refused !== undefined) {
    const kind = field(field(body, "detail"), "error_type");
    const named = typeof kind === "string" && kind !== "" ? kind : refused;
    return new JevUnavailableError(`HTTP ${status} ${named}`);
  }
  const message = `TypeSafe HTTP ${status}`;
  if (status === 429 || status >= 500) return new JevTransportError(message);
  return new Error(message);
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}
