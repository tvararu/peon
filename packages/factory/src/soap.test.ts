import { describe, expect, test } from "bun:test";
import { rm, writeFile } from "node:fs/promises";
import { serializeConfig } from "@peon/core/lib/config";
import { scratchDir } from "@peon/core/test-support/scratch";
import {
  accountAgeHours,
  accountName,
  assertFactory,
  characterName,
  envelope,
  factoryAccount,
  hasTriple,
  inheritedConfig,
  newNames,
  newPassword,
  parseEnv,
  parseResponse,
  reserveNames,
} from "#factory/soap";
import { pinfoAccount, type SoapResult } from "#factory/soap-copy";

describe("names", () => {
  test("account is FAC + 8 hex seconds + 2 random, uppercase", () => {
    expect(accountName(0x6a_b6_e0_5f, "5a")).toBe("FAC6AB6E05F5A");
    expect(accountName(0x1, "0f")).toBe("FAC000000010F");
  });

  test("character maps hex digits to a-p", () => {
    expect(characterName("FAC6AB6E05F5A")).toBe("Fgklgoafpfk");
  });

  test("new names match the sweep regex and carry the time", () => {
    const now = 0x6a_b6_e0_5f * 1000 + 999;
    const { account, character } = newNames(now, () => "5a");
    expect(account).toBe("FAC6AB6E05F5A");
    expect(character).toBe("Fgklgoafpfk");
    expect(factoryAccount.test(account)).toBe(true);
  });

  test("triple letters are detected case-insensitively", () => {
    expect(hasTriple("Faaab")).toBe(true);
    expect(hasTriple("Fffab")).toBe(true);
    expect(hasTriple("Faabb")).toBe(false);
  });

  test("a triple in the time digits never moves the creation second", () => {
    const seconds = 0x6a_bb_b0_00;
    const { account, character } = newNames(seconds * 1000, () => "12");
    expect(account).toBe("FAC6ABBB00012");
    expect(hasTriple(character)).toBe(false);
  });

  test("no creation second or random byte yields a triple character", () => {
    const seconds = [0x6a_bb_b0_00, 0x6a_bb_bb_bb, 0x6a_aa_a0_00, 0];
    for (const s of seconds)
      for (const random of ["00", "11", "ff", "ab"]) {
        const account = accountName(s, random);
        expect(hasTriple(characterName(account))).toBe(false);
      }
  });

  test("password is 16 alphanumerics", () => {
    expect(newPassword()).toMatch(/^[A-Za-z0-9]{16}$/);
  });
});

describe("factory guard", () => {
  test.each([
    "ADMIN",
    "DEITY",
    "X",
    "Y",
    "AUCTIONHOUSE",
    "TCFACTORY",
    "TCPRESETS",
    "RNDBOT001",
    "FACTORY",
  ])("refuses %s", (name) => expect(() => assertFactory(name)).toThrow());

  test("refuses near misses", () => {
    expect(() => assertFactory("FAC6AB6E05F5")).toThrow();
    expect(() => assertFactory("FAC6AB6E05F5AB")).toThrow();
    expect(() => assertFactory("fac6ab6e05f5a")).toThrow();
    expect(() => assertFactory("FAC6AB6E05G5A")).toThrow();
  });

  test("accepts factory accounts", () => {
    expect(() => assertFactory("FAC6AB6E05F5A")).not.toThrow();
  });
});

describe("accountAgeHours", () => {
  test("reads the seconds back from the name", () => {
    const now = (0x6a_b6_e0_5f + 3 * 3600) * 1000;
    expect(accountAgeHours("FAC6AB6E05F5A", now)).toBe(3);
  });

  test("refuses non-factory names", () => {
    expect(() => accountAgeHours("TCFACTORY")).toThrow();
  });
});

describe("SOAP", () => {
  test("envelope escapes & < >", () => {
    expect(envelope("say a&b <c>")).toContain(
      "<command>say a&amp;b &lt;c&gt;</command>",
    );
  });

  test("result is ok with carriage-return entities stripped", () => {
    const xml = `<SOAP-ENV:Body><ns1:executeCommandResponse><result>Account created: FAC6AB6E05F5A&#xD;
</result></ns1:executeCommandResponse></SOAP-ENV:Body>`;
    expect(parseResponse(xml)).toEqual({
      ok: true,
      text: "Account created: FAC6AB6E05F5A",
    });
  });

  test("fault is not ok and carries the fault string", () => {
    const xml = `<SOAP-ENV:Fault><faultcode>SOAP-ENV:Client</faultcode><faultstring>Character 'Fgklgoafpfk' does not exist.&#xD;
</faultstring></SOAP-ENV:Fault>`;
    expect(parseResponse(xml)).toEqual({
      ok: false,
      text: "Character 'Fgklgoafpfk' does not exist.",
    });
  });

  test("unrecognised body is not ok", () => {
    expect(parseResponse("").ok).toBe(false);
    expect(parseResponse("<html>401</html>")).toEqual({
      ok: false,
      text: "<html>401</html>",
    });
  });

  test("entities in the text are decoded", () => {
    expect(parseResponse("<result>a &lt;b&gt; &amp; c</result>").text).toBe(
      "a <b> & c",
    );
  });
});

describe("pinfoAccount", () => {
  test("reads the owning account", () => {
    const text = `| Player Fgklgoafpfk (offline) (guid: 2515)
| Account: FAC6AB6E05F5A (ID: 309),
   GMLevel: 0
| Level: 10 (0/7600 XP (7600 XP left))`;
    expect(pinfoAccount(text)).toBe("FAC6AB6E05F5A");
  });

  test("returns undefined without an Account line", () => {
    expect(
      pinfoAccount("Character 'Fgklgoafpfk' does not exist."),
    ).toBeUndefined();
  });
});

describe("parseEnv", () => {
  test("reads KEY=VALUE lines and strips quotes", () => {
    const env = parseEnv(
      `PEON_SOAP_URL=http://realm.example:7878/\n# note\nPEON_SOAP_USER="TCFACTORY"\n\n`,
    );
    expect(env).toEqual({
      PEON_SOAP_URL: "http://realm.example:7878/",
      PEON_SOAP_USER: "TCFACTORY",
    });
  });
});

describe("inheritedConfig", () => {
  const patched = "/store/0123456789abcdef/libnamigator.so";

  test("uses the patched library and copies the realm and data paths", async () => {
    const dir = scratchDir("soap-nav");
    try {
      const path = `${dir}/config.toml`;
      await writeFile(
        path,
        serializeConfig({
          account: "ME",
          character: "Me",
          host: "realm.example",
          language: 1,
          navigation_data_dir: "/data/nav",
          navigation_library: "/home/me/old/libnamigator.so",
          password: "secret",
          port: 3725,
          spell_data_dir: "/data/spells",
          timeout_minutes: 30,
        }),
      );
      expect(await inheritedConfig(path, async () => patched)).toEqual({
        host: "realm.example",
        navigation_data_dir: "/data/nav",
        navigation_library: patched,
        port: 3725,
        spell_data_dir: "/data/spells",
      });
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  test("defaults to localhost without a maintainer config", async () => {
    expect(
      await inheritedConfig("/missing/config.toml", async () => patched),
    ).toEqual({ host: "localhost", navigation_library: patched, port: 3724 });
  });

  test("refuses when the patched library is missing", async () => {
    const missing = () => Promise.reject(new Error("run mise namigator:build"));
    await expect(
      inheritedConfig("/missing/config.toml", missing),
    ).rejects.toThrow("run mise namigator:build");
  });
});

describe("reserveNames", () => {
  const collision = {
    ok: false,
    text: "Account with this name already exist!",
  };
  const created = { ok: true, text: "Account created: X" };
  const fresh = () => {
    let n = 0;
    return () =>
      newNames(0x6a_b6_e0_50 * 1000, () => (0x10 + n++).toString(16));
  };
  const server = (replies: SoapResult[]) => {
    const commands: string[] = [];
    const run = async (command: string) => {
      commands.push(command);
      return replies.shift() ?? created;
    };
    return { commands, run };
  };

  test("creates once when the name is free", async () => {
    const { commands, run } = server([created]);
    const names = await reserveNames("pw", run, fresh());
    expect(commands).toEqual([`account create ${names.account} pw`]);
  });

  test("retries with fresh names after a collision", async () => {
    const { commands, run } = server([collision, collision, created]);
    const names = await reserveNames("pw", run, fresh());
    const accounts = commands.map((c) => c.split(" ")[2]);
    expect(commands).toHaveLength(3);
    expect(new Set(accounts).size).toBe(3);
    expect(accounts.at(-1)).toBe(names.account);
  });

  test("gives up after eight collisions", async () => {
    const { commands, run } = server(
      Array.from({ length: 10 }, () => collision),
    );
    await expect(reserveNames("pw", run, fresh())).rejects.toThrow();
    expect(commands).toHaveLength(8);
  });

  test("does not retry other failures", async () => {
    const { commands, run } = server([
      { ok: false, text: "Account name is too long" },
    ]);
    await expect(reserveNames("pw", run, fresh())).rejects.toThrow();
    expect(commands).toHaveLength(1);
  });
});
