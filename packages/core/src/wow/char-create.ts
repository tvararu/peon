import type { AuthResult } from "#wow/auth";
import type { ClientConfig } from "#wow/client";
import {
  authenticateWorld,
  connectWorld,
  createWorldConn,
} from "#wow/client-connection";
import { closeTap, createTap } from "#wow/packet-trace";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";
import { sendPacket } from "#wow/world-handlers";

export type CharCreateSpec = {
  name: string;
  race: number;
  class: number;
  gender: number;
  skin: number;
  face: number;
  hairStyle: number;
  hairColor: number;
  facialHair: number;
};

export type CharCreateResult = { result: string };

const resultNames: Record<number, string> = {
  47: "success",
  48: "error",
  49: "failed",
  50: "name_in_use",
  51: "disabled",
  53: "server_limit",
  54: "account_limit",
  57: "expansion",
  58: "expansion_class",
  59: "level_requirement",
  60: "unique_class_limit",
  62: "restricted_raceclass",
};

export function buildCharCreate(spec: CharCreateSpec): Uint8Array {
  const w = new PacketWriter(spec.name.length + 10);
  w.cString(spec.name);
  w.uint8(spec.race);
  w.uint8(spec.class);
  w.uint8(spec.gender);
  w.uint8(spec.skin);
  w.uint8(spec.face);
  w.uint8(spec.hairStyle);
  w.uint8(spec.hairColor);
  w.uint8(spec.facialHair);
  w.uint8(0);
  return w.finish();
}

export function charCreateResult(code: number): string {
  return resultNames[code] ?? `code_0x${code.toString(16)}`;
}

type CreateSession = {
  conn: ReturnType<typeof createWorldConn>;
  resolve: (value: CharCreateResult) => void;
  reject: (error: unknown) => void;
  onClosed: () => void;
  settled: boolean;
  closing: boolean;
  failure: unknown;
  failed: boolean;
};
function releaseWaits(session: CreateSession): void {
  for (const opcode of [
    GameOpcode.SMSG_AUTH_CHALLENGE,
    GameOpcode.SMSG_AUTH_RESPONSE,
    GameOpcode.SMSG_CHAR_CREATE,
  ])
    session.conn.dispatch.handle(opcode, new PacketReader(new Uint8Array(0)));
  closeTap(session.conn.trace, session.conn.dispatch);
}

function observe(session: CreateSession, error?: unknown): void {
  if (!session.settled) {
    session.failure = error;
    session.failed = error !== undefined;
  }
}

function finishAfterClose(session: CreateSession): void {
  if (session.settled) return;
  session.settled = true;
  if (session.failed) session.reject(session.failure);
  else session.resolve({ result: "success" });
}

function closeCreate(session: CreateSession): void {
  session.closing = true;
  releaseWaits(session);
  try {
    session.conn.socket?.end();
  } catch {
    session.onClosed();
  }
}

export function createCharacter(
  config: ClientConfig,
  auth: AuthResult,
  spec: CharCreateSpec,
  timeoutMs = 10_000,
): Promise<CharCreateResult> {
  const { promise, resolve, reject } =
    Promise.withResolvers<CharCreateResult>();
  const conn = createWorldConn();
  conn.trace = createTap(config.trace);
  conn.dispatch.onUnhandled(() => false);
  const { promise: closed, resolve: onClosed } = Promise.withResolvers<void>();
  const session: CreateSession = {
    closing: false,
    conn,
    failed: false,
    failure: undefined,
    onClosed,
    reject,
    resolve,
    settled: false,
  };
  connectWorld(conn, auth, {
    close() {
      releaseWaits(session);
      onClosed();
      if (!session.closing)
        observe(session, new Error("World connection closed"));
      finishAfterClose(session);
    },
    reject: (error) => {
      releaseWaits(session);
      onClosed();
      observe(session, error);
      finishAfterClose(session);
    },
  });
  void (async () => {
    try {
      await authenticateWorld(conn, config, auth);
      const reply = conn.dispatch.expect(GameOpcode.SMSG_CHAR_CREATE, {
        timeoutMs,
      });
      sendPacket(conn, GameOpcode.CMSG_CHAR_CREATE, buildCharCreate(spec));
      const code = (await reply).uint8();
      const name = charCreateResult(code);
      if (name !== "success")
        observe(
          session,
          new Error(`Character create: ${name} (0x${code.toString(16)})`),
        );
      closeCreate(session);
      await closed;
      finishAfterClose(session);
    } catch (error) {
      observe(session, error);
      closeCreate(session);
      await closed;
      finishAfterClose(session);
    }
  })();
  return promise;
}
