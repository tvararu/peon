import type { CharCreateSpec } from "@peon/core/session";
import type { CharEndpoint, Json } from "#factory/realm-service";

export type Faction = "horde" | "alliance";

export type StageStep =
  | { endpoint: CharEndpoint; body: Json }
  | { online: { learn: readonly number[] } };

export type TemplatePreset = {
  template: string;
  faction: Faction;
  map: number;
  x: number;
  y: number;
  z: number;
  stage?: readonly StageStep[];
};

export type CreatePreset = {
  create: Omit<CharCreateSpec, "name">;
  gmLevelForCreate?: 1;
  faction: Faction;
  map: number;
  x: number;
  y: number;
  z: number;
  stage: readonly StageStep[];
};

export type PresetSpec = TemplatePreset | CreatePreset;

const eversong = { map: 530, x: 8735, y: -6685, z: 70.5 } as const;
const eversongPoint = { ...eversong, o: 1.686, zone: 3430 } as const;
const zeroFace = {
  face: 0,
  facialHair: 0,
  hairColor: 0,
  hairStyle: 0,
  skin: 0,
} as const;

function pos(): { body: Json; endpoint: CharEndpoint } {
  return { body: { ...eversongPoint }, endpoint: "position" };
}

function level(n: number): { body: Json; endpoint: CharEndpoint } {
  return { body: { level: n }, endpoint: "level" };
}

function money(copper: number): { body: Json; endpoint: CharEndpoint } {
  return { body: { copper }, endpoint: "money" };
}

function item(id: number): { body: Json; endpoint: CharEndpoint } {
  return { body: { count: 1, item: id }, endpoint: "items/add" };
}

function spells(...ids: number[]): { body: Json; endpoint: CharEndpoint }[] {
  return ids.map((spell) => ({
    body: { spell },
    endpoint: "spells/learn" as const,
  }));
}

export const presetSpecs = {
  elwynn1: {
    faction: "alliance",
    map: 0,
    template: "Tplelwynn",
    x: -8949.95,
    y: -132.49,
    z: 83.53,
  },
  elwynn10: {
    faction: "alliance",
    map: 0,
    template: "Tplgoldshire",
    x: -9455,
    y: 55,
    z: 56.8,
  },
  "eversong1-shaman": {
    ...eversong,
    create: { class: 7, gender: 0, race: 2, ...zeroFace },
    faction: "horde",
    stage: [pos()],
  },
  eversong10: { ...eversong, faction: "horde", template: "Tpleversong" },
  "eversong10-druid": {
    ...eversong,
    create: { class: 11, gender: 0, race: 6, ...zeroFace },
    faction: "horde",
    stage: [pos(), level(10), money(50_000), ...spells(8921, 5487)],
  },
  "eversong10-fishing": {
    ...eversong,
    faction: "horde",
    stage: [{ online: { learn: [7733] } }, item(6256)],
    template: "Tpleversong",
  },
  "eversong10-hunter": { ...eversong, faction: "horde", template: "Tplhunter" },
  "eversong10-mage": { ...eversong, faction: "horde", template: "Tplmage" },
  "eversong10-priest": {
    ...eversong,
    faction: "horde",
    template: "Tpleversong",
  },
  "eversong10-rogue": {
    ...eversong,
    create: { class: 4, gender: 1, race: 10, ...zeroFace },
    faction: "horde",
    stage: [pos(), level(10), money(50_000), ...spells(921, 2983, 6770)],
  },
  "eversong10-shaman": {
    ...eversong,
    create: { class: 7, gender: 0, race: 2, ...zeroFace },
    faction: "horde",
    stage: [
      pos(),
      level(10),
      money(50_000),
      item(5175),
      item(5176),
      ...spells(8042, 8071, 2484, 2075, 8050),
    ],
  },
  "eversong10-warlock": {
    ...eversong,
    create: { class: 9, gender: 1, race: 10, ...zeroFace },
    faction: "horde",
    stage: [pos(), level(10), money(50_000), ...spells(688, 172, 348, 980)],
  },
  "eversong10-warrior": {
    ...eversong,
    faction: "horde",
    template: "Tplwarrior",
  },
  "eversong55-deathknight": {
    ...eversong,
    create: { class: 6, gender: 0, race: 10, ...zeroFace },
    faction: "horde",
    gmLevelForCreate: 1 as const,
    stage: [pos(), money(50_000)],
  },
  fresh: {
    faction: "horde",
    map: 530,
    template: "Tplfresh",
    x: 10_349.6,
    y: -6357.29,
    z: 33.4,
  },
  ghostlands20: {
    faction: "horde",
    map: 530,
    template: "Tplghost",
    x: 7575,
    y: -6835,
    z: 88.66,
  },
  max80: {
    faction: "horde",
    map: 571,
    template: "Tplmax",
    x: 5807.98,
    y: 588.49,
    z: 660.94,
  },
} as const satisfies Record<string, PresetSpec>;

export type Preset = keyof typeof presetSpecs;

export const presets: Preset[] = [
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
  "eversong1-shaman",
];

const languages: Record<Faction, number> = { alliance: 7, horde: 1 };

export function isPreset(name: string): name is Preset {
  return Object.hasOwn(presetSpecs, name);
}

export function isCreatePreset(spec: PresetSpec): spec is CreatePreset {
  return "create" in spec;
}

export function presetEnvKey(preset: Preset): string {
  return `PEON_PRESET_${preset.toUpperCase().replaceAll("-", "_")}`;
}

export function needsProtocol(spec: PresetSpec): boolean {
  return isCreatePreset(spec) || (spec.stage?.length ?? 0) > 0;
}

export function templateFor(
  preset: Preset,
  env: Record<string, string>,
): string {
  const spec: PresetSpec = presetSpecs[preset];
  if (isCreatePreset(spec)) throw new Error(`preset ${preset} has no template`);
  return env[presetEnvKey(preset)] || spec.template;
}

export function presetLanguage(preset: Preset): number {
  return languages[presetSpecs[preset].faction];
}
