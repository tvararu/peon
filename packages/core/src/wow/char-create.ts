import type { AuthResult } from "#wow/auth";
import type { ClientConfig } from "#wow/client";
import {
  authenticateWorld,
  connectWorld,
  createWorldConn,
} from "#wow/client-connection";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";
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

export function createCharacter(
  config: ClientConfig,
  auth: AuthResult,
  spec: CharCreateSpec,
  timeoutMs = 10_000,
): Promise<CharCreateResult> {
  const { promise, resolve, reject } =
    Promise.withResolvers<CharCreateResult>();
  const conn = createWorldConn();
  conn.dispatch.onUnhandled(() => false);
  let done = false;
  const finish = (fn: () => void): void => {
    if (done) return;
    done = true;
    try {
      conn.socket?.end();
    } catch {
      /* the socket is already gone */
    }
    fn();
  };
  connectWorld(conn, auth, {
    close() {
      finish(() =>
        reject(new Error("World connection closed before SMSG_CHAR_CREATE")),
      );
    },
    reject: (error) => finish(() => reject(error)),
  });
  void (async () => {
    try {
      await authenticateWorld(conn, config, auth);
      const reply = conn.dispatch.expect(GameOpcode.SMSG_CHAR_CREATE, {
        timeoutMs,
      });
      sendPacket(conn, GameOpcode.CMSG_CHAR_CREATE, buildCharCreate(spec));
      const name = charCreateResult((await reply).uint8());
      if (name === "success") finish(() => resolve({ result: name }));
      else finish(() => reject(new Error(`Character create: ${name}`)));
    } catch (error) {
      finish(() => reject(error));
    }
  })();
  return promise;
}
