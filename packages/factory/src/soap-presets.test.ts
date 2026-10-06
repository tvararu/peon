import { describe, expect, test } from "bun:test";
import {
  isPreset,
  needsProtocol,
  presetEnvKey,
  presetLanguage,
  presetSpecs,
  presets,
  templateFor,
} from "#factory/soap-presets";

describe("presets", () => {
  test("selects every spec by name", () => {
    for (const name of Object.keys(presetSpecs))
      expect(isPreset(name)).toBe(true);
    expect(isPreset("no-such-preset")).toBe(false);
    expect([...presets].sort() as string[]).toEqual(
      Object.keys(presetSpecs).sort(),
    );
  });

  test("env keys use underscores so soap.env can hold them", () => {
    expect(presetEnvKey("eversong10-hunter")).toBe(
      "PEON_PRESET_EVERSONG10_HUNTER",
    );
    expect(presetEnvKey("fresh")).toBe("PEON_PRESET_FRESH");
  });

  test("soap.env overrides the built-in template", () => {
    expect(templateFor("fresh", {})).toBe("Tplfresh");
    expect(templateFor("eversong10-priest", {})).toBe("Tpleversong");
    expect(templateFor("fresh", { PEON_PRESET_FRESH: "Other" })).toBe("Other");
    expect(
      templateFor("eversong10-mage", {
        PEON_PRESET_EVERSONG10_MAGE: "Mage2",
      }),
    ).toBe("Mage2");
    expect(
      templateFor("eversong10-priest", {
        PEON_PRESET_EVERSONG10_PRIEST: "Other",
      }),
    ).toBe("Other");
  });

  test("Alliance presets speak Common, Horde presets Orcish", () => {
    expect(presetLanguage("elwynn1")).toBe(7);
    expect(presetLanguage("eversong10-warrior")).toBe(1);
  });

  test("staged template presets and created presets go through the protocol path", () => {
    expect(needsProtocol(presetSpecs["eversong10-fishing"])).toBe(true);
    expect(needsProtocol(presetSpecs["eversong10-rogue"])).toBe(true);
    expect(needsProtocol(presetSpecs["eversong55-deathknight"])).toBe(true);
    expect(needsProtocol(presetSpecs["eversong10-priest"])).toBe(false);
    expect(needsProtocol(presetSpecs["eversong10-mage"])).toBe(false);
  });
});
