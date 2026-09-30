import { describe, expect, test } from "bun:test";
import {
  isCreatePreset,
  isPreset,
  needsProtocol,
  presetEnvKey,
  presetLanguage,
  presetSpecs,
  presets,
  templateFor,
} from "#factory/soap-presets";

describe("presets", () => {
  test("keeps the original three and adds the realm service presets", () => {
    expect(presets).toEqual([
      "fresh",
      "eversong10",
      "max80",
      "eversong10-warrior",
      "eversong10-mage",
      "eversong10-hunter",
      "elwynn1",
      "elwynn10",
      "ghostlands20",
      "eversong10-priest",
      "eversong10-shaman",
      "eversong10-warlock",
      "eversong10-rogue",
      "eversong10-druid",
      "eversong55-deathknight",
      "eversong10-fishing",
    ]);
    expect([...presets].sort() as string[]).toEqual(
      Object.keys(presetSpecs).sort(),
    );
  });

  test("names each template character and start point", () => {
    expect(presetSpecs["eversong10-hunter"]).toMatchObject({
      map: 530,
      template: "Tplhunter",
      x: 8735,
      y: -6685,
    });
    expect(presetSpecs.elwynn10).toMatchObject({
      map: 0,
      template: "Tplgoldshire",
      x: -9455,
      y: 55,
    });
    expect(presetSpecs.ghostlands20.template).toBe("Tplghost");
    expect(presetSpecs.elwynn1.template).toBe("Tplelwynn");
  });

  test("recognises only known names", () => {
    expect(isPreset("elwynn1")).toBe(true);
    expect(isPreset("elwynn2")).toBe(false);
    expect(isPreset("eversong10-shaman")).toBe(true);
  });

  test("env keys use underscores so soap.env can hold them", () => {
    expect(presetEnvKey("eversong10-hunter")).toBe(
      "PEON_PRESET_EVERSONG10_HUNTER",
    );
    expect(presetEnvKey("fresh")).toBe("PEON_PRESET_FRESH");
  });

  test("soap.env overrides the built-in template", () => {
    expect(templateFor("fresh", {})).toBe("Tplfresh");
    expect(templateFor("fresh", { PEON_PRESET_FRESH: "Other" })).toBe("Other");
    expect(
      templateFor("eversong10-mage", {
        PEON_PRESET_EVERSONG10_MAGE: "Mage2",
      }),
    ).toBe("Mage2");
  });

  test("the priest and fishing presets share the eversong template", () => {
    expect(templateFor("eversong10-priest", {})).toBe("Tpleversong");
    expect(templateFor("eversong10-fishing", {})).toBe("Tpleversong");
    expect(
      templateFor("eversong10-priest", {
        PEON_PRESET_EVERSONG10_PRIEST: "Other",
      }),
    ).toBe("Other");
  });

  test("Alliance presets speak Common, Horde presets Orcish", () => {
    expect(presetLanguage("elwynn1")).toBe(7);
    expect(presetLanguage("elwynn10")).toBe(7);
    expect(presetLanguage("eversong10-warrior")).toBe(1);
    expect(presetLanguage("fresh")).toBe(1);
    for (const name of [
      "eversong10-priest",
      "eversong10-shaman",
      "eversong10-warlock",
      "eversong10-rogue",
      "eversong10-druid",
      "eversong55-deathknight",
      "eversong10-fishing",
    ] as const)
      expect(presetLanguage(name)).toBe(1);
  });

  test("created presets carry the right race, class and start", () => {
    expect(presetSpecs["eversong10-shaman"]).toMatchObject({
      create: { class: 7, gender: 0, race: 2 },
      map: 530,
      x: 8735,
      y: -6685,
    });
    expect(presetSpecs["eversong10-warlock"]).toMatchObject({
      create: { class: 9, gender: 1, race: 10 },
    });
    expect(presetSpecs["eversong10-rogue"]).toMatchObject({
      create: { class: 4, gender: 1, race: 10 },
    });
    expect(presetSpecs["eversong10-druid"]).toMatchObject({
      create: { class: 11, gender: 0, race: 6 },
    });
    expect(presetSpecs["eversong55-deathknight"]).toMatchObject({
      create: { class: 6, gender: 0, race: 10 },
      gmLevelForCreate: 1,
      map: 530,
      x: 8735,
      y: -6685,
    });
  });

  test("the death knight starts at 55 with no level stage", () => {
    const dk = presetSpecs["eversong55-deathknight"];
    expect(isCreatePreset(dk)).toBe(true);
    if (!isCreatePreset(dk)) throw new Error("unreachable");
    expect(
      dk.stage.some((s) => "endpoint" in s && s.endpoint === "level"),
    ).toBe(false);
    const shaman = presetSpecs["eversong10-shaman"];
    expect(isCreatePreset(shaman)).toBe(true);
    if (!isCreatePreset(shaman)) throw new Error("unreachable");
    expect(
      shaman.stage.some((s) => "endpoint" in s && s.endpoint === "level"),
    ).toBe(true);
  });

  test("the fishing preset stages the pole then learns online", () => {
    const fishing = presetSpecs["eversong10-fishing"];
    expect(isCreatePreset(fishing)).toBe(false);
    expect(fishing.stage?.at(-1)).toEqual({ online: { learn: [7733] } });
    expect(
      fishing.stage?.some((s) => "endpoint" in s && s.endpoint === "items/add"),
    ).toBe(true);
  });

  test("staged template presets and created presets go through the protocol path", () => {
    expect(needsProtocol(presetSpecs["eversong10-fishing"])).toBe(true);
    expect(needsProtocol(presetSpecs["eversong10-rogue"])).toBe(true);
    expect(needsProtocol(presetSpecs["eversong55-deathknight"])).toBe(true);
    expect(needsProtocol(presetSpecs["eversong10-priest"])).toBe(false);
    expect(needsProtocol(presetSpecs["eversong10-mage"])).toBe(false);
  });
});
