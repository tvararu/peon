import { describe, expect, test } from "bun:test";
import { type Config, parseConfig, serializeConfig } from "#lib/config";

describe("parseConfig", () => {
  test("parses string and number values", () => {
    const input = `account = "x"\npassword = "xwow2026"\ncharacter = "Z"\nport = 3724`;
    const cfg = parseConfig(input);
    expect(cfg.account).toBe("x");
    expect(cfg.password).toBe("xwow2026");
    expect(cfg.port).toBe(3724);
  });

  test("ignores blank lines and comments", () => {
    const input = `# comment\naccount = "x"\npassword = "y"\n\ncharacter = "Xia"`;
    const cfg = parseConfig(input);
    expect(cfg.account).toBe("x");
    expect(cfg.character).toBe("Xia");
  });

  test("uses defaults for missing keys", () => {
    const cfg = parseConfig(`account = "x"\npassword = "y"\ncharacter = "Z"`);
    expect(cfg.host).toBe("localhost");
    expect(cfg.port).toBe(3724);
    expect(cfg.language).toBe(1);
    expect(cfg.timeout_minutes).toBe(30);
  });

  test("throws on missing account", () => {
    expect(() => parseConfig(`password = "y"\ncharacter = "Z"`)).toThrow(
      "Missing required config field: account",
    );
  });

  test("throws on missing password", () => {
    expect(() => parseConfig(`account = "x"\ncharacter = "Z"`)).toThrow(
      "Missing required config field: password",
    );
  });

  test("throws on missing character", () => {
    expect(() => parseConfig(`account = "x"\npassword = "y"`)).toThrow(
      "Missing required config field: character",
    );
  });

  test("unescapes backslash and quote in quoted values", () => {
    const input = `account = "te\\"st"\npassword = "p\\\\w"\ncharacter = "Z"`;
    const cfg = parseConfig(input);
    expect(cfg.account).toBe('te"st');
    expect(cfg.password).toBe("p\\w");
  });

  test("rejects non-positive port", () => {
    expect(() =>
      parseConfig(`account = "x"\npassword = "y"\ncharacter = "Z"\nport = -1`),
    ).toThrow("Invalid port");
  });

  test("rejects NaN language", () => {
    expect(() =>
      parseConfig(
        `account = "x"\npassword = "y"\ncharacter = "Z"\nlanguage = abc`,
      ),
    ).toThrow("Invalid language");
  });

  test("rejects Infinity timeout_minutes", () => {
    expect(() =>
      parseConfig(
        `account = "x"\npassword = "y"\ncharacter = "Z"\ntimeout_minutes = Infinity`,
      ),
    ).toThrow("Invalid timeout_minutes");
  });
});

describe("serializeConfig", () => {
  test("round-trips through parse", () => {
    const cfg: Config = {
      account: "x",
      character: "Xia",
      host: "t1",
      language: 1,
      password: "xwow2026",
      port: 3724,
      timeout_minutes: 30,
    };
    const text = serializeConfig(cfg);
    const parsed = parseConfig(text);
    expect(parsed).toEqual(cfg);
  });

  test("escapes backslash and double-quote in values", () => {
    const cfg: Config = {
      account: 'te"st',
      character: "Z",
      host: "t1",
      language: 1,
      password: "p\\w",
      port: 3724,
      timeout_minutes: 30,
    };
    const text = serializeConfig(cfg);
    expect(text).toContain('account = "te\\"st"');
    expect(text).toContain('password = "p\\\\w"');
    const parsed = parseConfig(text);
    expect(parsed).toEqual(cfg);
  });
});

test("optional capability paths reject empty or numeric values without requiring capability data for chat", () => {
  const base = 'account = "a"\npassword = "b"\ncharacter = "c"';
  expect(parseConfig(base).spell_data_dir).toBeUndefined();
  expect(() => parseConfig(`${base}\nspell_data_dir = "  "`)).toThrow();
  expect(() => parseConfig(`${base}\nnavigation_library = 123`)).toThrow();
  const config = parseConfig(
    `${base}\nspell_data_dir = "data/raw"\nnavigation_data_dir = "data/nav"\nnavigation_library = "libnav.so"`,
  );
  expect(parseConfig(serializeConfig(config))).toEqual(config);
});
