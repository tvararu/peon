import { expect, test } from "bun:test";
import { createCipheriv, createDecipheriv, createHmac } from "node:crypto";
import { Arc4 } from "#wow/crypto/arc4";

function sequentialKey(): Uint8Array {
  const sessionKey = new Uint8Array(40);
  for (let i = 0; i < 40; i++) sessionKey[i] = i;
  return sessionKey;
}

test("Arc4 decrypt reads the server's encrypt stream", () => {
  const sessionKey = sequentialKey();
  const serverEncKey = createHmac(
    "sha1",
    Buffer.from("CC98AE04E897EACA12DDC09342915357", "hex"),
  )
    .update(sessionKey)
    .digest();
  const serverCipher = createCipheriv("rc4", serverEncKey, "");
  serverCipher.update(new Uint8Array(1024));
  const data = new Uint8Array([0x00, 0x08, 0xdc, 0x01, 0x00, 0x00]);
  const fromServer = new Uint8Array(serverCipher.update(data));

  const arc4 = new Arc4(sessionKey);

  expect(arc4.decrypt(fromServer)).toEqual(data);
});

test("Arc4 encrypt matches server-side decrypt with correct key", () => {
  const sessionKey = sequentialKey();

  const arc4 = new Arc4(sessionKey);
  const original = new Uint8Array([0x00, 0x08, 0xdc, 0x01, 0x00, 0x00]);
  const encrypted = arc4.encrypt(new Uint8Array(original));

  const serverDecKey = createHmac(
    "sha1",
    Buffer.from("C2B3723CC6AED9B5343C53EE2F4367CE", "hex"),
  )
    .update(sessionKey)
    .digest();
  const serverCipher = createDecipheriv("rc4", serverDecKey, "");
  serverCipher.update(new Uint8Array(1024));
  const decrypted = new Uint8Array(serverCipher.update(encrypted));

  expect(decrypted).toEqual(original);
});

test("Arc4 continues one encrypt stream across calls", () => {
  const sessionKey = new Uint8Array(40).fill(0xab);
  const arc4 = new Arc4(sessionKey);
  const header = new Uint8Array([0x00, 0x04, 0x96, 0x00]);

  const e1 = arc4.encrypt(new Uint8Array(header));
  const e2 = arc4.encrypt(new Uint8Array(header));

  const serverDecKey = createHmac(
    "sha1",
    Buffer.from("C2B3723CC6AED9B5343C53EE2F4367CE", "hex"),
  )
    .update(sessionKey)
    .digest();
  const serverCipher = createDecipheriv("rc4", serverDecKey, "");
  serverCipher.update(new Uint8Array(1024));
  expect(new Uint8Array(serverCipher.update(e1))).toEqual(header);
  expect(new Uint8Array(serverCipher.update(e2))).toEqual(header);
});
