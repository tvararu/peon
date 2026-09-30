import { describe, expect, test } from "bun:test";
import {
  clientPrivateKey,
  clientSeed,
  FIXTURE_ACCOUNT,
  FIXTURE_PASSWORD,
  sessionKey,
} from "#test-support/fixtures";
import { startMockWorldServer } from "#test-support/mock-world-server";
import {
  buildCharCreate,
  type CharCreateSpec,
  charCreateResult,
  createCharacter,
} from "#wow/char-create";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader } from "#wow/protocol/packet";

const spec: CharCreateSpec = {
  class: 7,
  facialHair: 5,
  face: 2,
  gender: 0,
  hairColor: 4,
  hairStyle: 3,
  name: "Fabcdefghij",
  race: 2,
  skin: 1,
};
const AUTH = { realmHost: "127.0.0.1", realmId: 1, sessionKey };
function auth(port: number) {
  return { ...AUTH, realmPort: port };
}

function config(port: number) {
  return {
    account: FIXTURE_ACCOUNT,
    character: spec.name,
    clientSeed,
    host: "127.0.0.1",
    password: FIXTURE_PASSWORD,
    port,
    srpPrivateKey: clientPrivateKey,
  };
}
describe("buildCharCreate", () => {
  test("writes the name cstring then nine bytes ending in outfit 0", () => {
    const body = buildCharCreate(spec);
    const reader = new PacketReader(body);
    expect(reader.cString()).toBe(spec.name);
    const fields = Array.from({ length: 9 }, () => reader.uint8());
    expect(fields).toEqual([2, 7, 0, 1, 2, 3, 4, 5, 0]);
    expect(body.byteLength).toBe(spec.name.length + 1 + 9);
  });
});

describe("charCreateResult", () => {
  test.each([
    [0x2f, "success"],
    [0x30, "error"],
    [0x31, "failed"],
    [0x32, "name_in_use"],
    [0x33, "disabled"],
    [0x35, "server_limit"],
    [0x36, "account_limit"],
    [0x39, "expansion"],
    [0x3a, "expansion_class"],
    [0x3b, "level_requirement"],
    [0x3c, "unique_class_limit"],
    [0x3e, "restricted_raceclass"],
    [0x7f, "code_0x7f"],
  ])("code 0x%x is %s", (code, name) => {
    expect(charCreateResult(code)).toBe(name);
  });
});

describe("createCharacter", () => {
  test("sends the create request, resolves on success and never logs in", async () => {
    const server = await startMockWorldServer();
    try {
      const done = createCharacter(
        config(server.port),
        auth(server.port),
        spec,
      );
      const sent = await server.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_CHAR_CREATE,
      );
      expect(Array.from(sent.body)).toEqual(Array.from(buildCharCreate(spec)));
      server.inject(GameOpcode.SMSG_CHAR_CREATE, new Uint8Array([0x2f]));
      await expect(done).resolves.toEqual({ result: "success" });
      expect(
        server.captured.some((p) => p.opcode === GameOpcode.CMSG_PLAYER_LOGIN),
      ).toBe(false);
    } finally {
      server.stop();
    }
  });

  test("rejects with the reason name for any other code", async () => {
    const server = await startMockWorldServer();
    try {
      const done = createCharacter(
        config(server.port),
        auth(server.port),
        spec,
      );
      done.catch(() => {});
      await server.waitForCapture(
        (p) => p.opcode === GameOpcode.CMSG_CHAR_CREATE,
      );
      server.inject(GameOpcode.SMSG_CHAR_CREATE, new Uint8Array([0x3b]));
      await expect(done).rejects.toThrow("level_requirement");
    } finally {
      server.stop();
    }
  });

  test("rejects when the reply never comes", async () => {
    const server = await startMockWorldServer();
    try {
      await expect(
        createCharacter(config(server.port), auth(server.port), spec, 30),
      ).rejects.toThrow("Timed out");
    } finally {
      server.stop();
    }
  });

  test("rejects when world admission fails", async () => {
    const server = await startMockWorldServer({ authStatus: 0x0d });
    try {
      await expect(
        createCharacter(config(server.port), auth(server.port), spec),
      ).rejects.toThrow("World auth failed");
    } finally {
      server.stop();
    }
  });
});
