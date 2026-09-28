import { GameOpcode } from "#wow/protocol/opcodes";
import type { PacketReader } from "#wow/protocol/packet";
import type { WorldConn } from "#wow/world-conn";
import { sendPacket } from "#wow/world-handlers";

export const LOGOUT_TIMEOUT_MS = 30_000;

export type LogoutOutcome = "complete" | "refused" | "timeout" | "closed";
export type LogoutRefusal =
  | "in_combat"
  | "duel_or_frozen"
  | "falling"
  | "unknown";
export type LogoutResult = { outcome: LogoutOutcome; reason?: LogoutRefusal };

const REFUSALS: Record<number, LogoutRefusal> = {
  1: "in_combat",
  2: "duel_or_frozen",
  3: "falling",
};

export function parseLogoutResponse(r: PacketReader): {
  result: number;
  instant: boolean;
} {
  return { result: r.uint32LE(), instant: r.uint8() !== 0 };
}

export function requestLogout(
  conn: WorldConn,
  closed: Promise<void>,
  timeoutMs: number,
): Promise<LogoutResult> {
  const { promise, resolve } = Promise.withResolvers<LogoutResult>();
  const timer = setTimeout(() => resolve({ outcome: "timeout" }), timeoutMs);
  promise.then(() => clearTimeout(timer));
  closed.then(() => resolve({ outcome: "closed" }));
  conn.dispatch.on(GameOpcode.SMSG_LOGOUT_RESPONSE, (r) => {
    const { result } = parseLogoutResponse(r);
    if (result !== 0)
      resolve({ outcome: "refused", reason: REFUSALS[result] ?? "unknown" });
  });
  conn.dispatch.on(GameOpcode.SMSG_LOGOUT_COMPLETE, () =>
    resolve({ outcome: "complete" }),
  );
  try {
    sendPacket(conn, GameOpcode.CMSG_LOGOUT_REQUEST);
  } catch {
    resolve({ outcome: "closed" });
  }
  return promise;
}
