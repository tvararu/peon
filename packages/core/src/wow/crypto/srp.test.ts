import { expect, test } from "bun:test";
import { bigIntToLeBytes, leBytesToBigInt, modPow, SRP } from "#wow/crypto/srp";

test("bigIntToLeBytes converts correctly", () => {
  const n = BigInt("0x0102030405060708");
  const bytes = bigIntToLeBytes(n, 8);
  expect(bytes).toEqual(
    new Uint8Array([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]),
  );
});

test("leBytesToBigInt converts correctly", () => {
  const bytes = new Uint8Array([
    0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01,
  ]);
  expect(leBytesToBigInt(bytes)).toBe(BigInt("0x0102030405060708"));
});

test("modPow computes correctly", () => {
  expect(modPow(2n, 10n, 1000n)).toBe(24n);
  expect(modPow(3n, 7n, 50n)).toBe(37n);
});

test("SRP rejects B = 0 mod N", () => {
  const srp = new SRP("TEST", "PASSWORD");
  const N = BigInt(
    "0x894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7",
  );
  const salt = new Uint8Array(32);
  expect(() => srp.calculate({ g: 7n, N, salt, B: 0n }, 1n)).toThrow(
    "SRP: invalid server B value",
  );
});

test("SRP rejects B = N (also 0 mod N)", () => {
  const srp = new SRP("TEST", "PASSWORD");
  const N = BigInt(
    "0x894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7",
  );
  const salt = new Uint8Array(32);
  expect(() => srp.calculate({ g: 7n, N, salt, B: N }, 1n)).toThrow(
    "SRP: invalid server B value",
  );
});
