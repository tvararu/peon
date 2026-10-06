import { describe, expect, test } from "bun:test";
import { basename, join } from "node:path";
import { createMockHandle } from "#test-support/mock-handle";
import { testStores } from "#test-support/session-fixtures";
import {
  AREA_NAMES,
  areaStubs,
  type LooseModule,
  looseModule,
} from "#wow/areas/compose";
import type { AreaRegister, OpcodeName } from "#wow/areas/contract";
import { AREAS } from "#wow/areas/registry";
import { FIXTURE_MODULES } from "#wow/areas/typecheck-fixture";
import { GameOpcode } from "#wow/protocol/opcodes";
import { STUBS } from "#wow/protocol/stubs";

const AREAS_DIR = import.meta.dir;
const HARNESS_AREAS_DIR = join(AREAS_DIR, "../../../../harness/src/areas");
const MODULES = AREA_NAMES.map((name) => looseModule(AREAS[name]));
const LATE_LOGOUT = ["SMSG_LOGOUT_RESPONSE", "SMSG_LOGOUT_COMPLETE"];
const CORE_DOMAINS = [
  "session",
  "control",
  "nav",
  "chat",
  "combat",
  "xp",
  "quest",
  "loot",
  "money",
  "vendor",
  "trainer",
  "fight",
  "life",
  "group",
  "social",
  "aura",
  "run",
  "tool",
  "human",
  "agent",
  "packet",
  "notice",
  "snapshot",
  "entity",
];
const VALUE_IMPORTS = [
  /^#lib\/[\w-]+$/,
  /^#wow\/protocol\/[\w-]+$/,
  /^#wow\/areas\/contract$/,
  /^#wow\/geometry$/,
  /^#wow\/dbc$/,
  /^#wow\/data\/[\w-]+$/,
  /^#wow\/inventory$/,
  /^#wow\/player-state$/,
];
const BANNED_NAMES = /\b(WorldHandle|SessionStores|WorldEvents)\b/;
const IMPORT = /(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*"([^"]+)"/gs;
const NAMED = /GameOpcode\.([A-Z0-9_]+)/g;
const FROZEN_STUBS: [name: OpcodeName, label: string][] = [
  ["SMSG_CHANNEL_LIST", "Channel member list"],
  ["SMSG_GUILD_INFO", "Guild info"],
  ["SMSG_GUILD_BANK_LIST", "Guild bank"],
  ["SMSG_CHAT_PLAYER_AMBIGUOUS", "Ambiguous player name"],
  ["SMSG_CHAT_NOT_IN_PARTY", "Not in party"],
  ["SMSG_SEND_MAIL_RESULT", "Mail result"],
  ["SMSG_MAIL_LIST_RESULT", "Mail list"],
  ["SMSG_SHOW_MAILBOX", "Mailbox opened"],
  ["SMSG_TEXT_EMOTE", "Text emote"],
  ["SMSG_EMOTE", "Emote animation"],
  ["MSG_RAID_READY_CHECK", "Ready check"],
  ["MSG_RAID_READY_CHECK_CONFIRM", "Ready check confirm"],
  ["MSG_RAID_READY_CHECK_FINISHED", "Ready check finished"],
  ["SMSG_AREA_TRIGGER_MESSAGE", "Area trigger message"],
  ["SMSG_SERVER_FIRST_ACHIEVEMENT", "Server first achievement"],
  ["SMSG_ACHIEVEMENT_EARNED", "Achievement earned"],
  ["SMSG_CRITERIA_UPDATE", "Achievement criteria"],
  ["SMSG_ALL_ACHIEVEMENT_DATA", "Achievement data"],
  ["SMSG_ATTACKERSTATEUPDATE", "Damage dealt"],
  ["SMSG_SPELLHEALLOG", "Heal received"],
  ["SMSG_SPELLNONMELEEDAMAGELOG", "Spell damage"],
  ["SMSG_ENVIRONMENTAL_DAMAGE_LOG", "Environmental damage"],
  ["SMSG_EQUIPMENT_SET_LIST", "Equipment sets"],
  ["SMSG_TRADE_STATUS", "Trade window"],
  ["SMSG_TRADE_STATUS_EXTENDED", "Trade update"],
  ["SMSG_AUCTION_LIST_RESULT", "Auction results"],
  ["SMSG_AUCTION_OWNER_NOTIFICATION", "Auction sold"],
  ["SMSG_AUCTION_BIDDER_NOTIFICATION", "Auction outbid"],
  ["SMSG_AUCTION_COMMAND_RESULT", "Auction result"],
  ["SMSG_BATTLEFIELD_STATUS", "Battleground status"],
  ["SMSG_BATTLEFIELD_LIST", "Battleground list"],
  ["SMSG_ZONE_UNDER_ATTACK", "Zone under attack"],
  ["SMSG_LFG_UPDATE_PLAYER", "LFG status"],
  ["SMSG_LFG_PROPOSAL_UPDATE", "LFG proposal"],
  ["SMSG_LFG_QUEUE_STATUS", "LFG queue"],
  ["SMSG_CALENDAR_SEND_CALENDAR", "Calendar"],
  ["SMSG_CALENDAR_EVENT_INVITE_ALERT", "Calendar invite"],
  ["SMSG_ARENA_TEAM_EVENT", "Arena team event"],
  ["SMSG_ARENA_TEAM_COMMAND_RESULT", "Arena command result"],
  ["SMSG_WEATHER", "Weather change"],
  ["SMSG_WARDEN_DATA", "Warden anti-cheat"],
  ["SMSG_LOGIN_SETTIMESPEED", "Game time"],
  ["SMSG_ACCOUNT_DATA_TIMES", "Account data"],
  ["SMSG_FEATURE_SYSTEM_STATUS", "System features"],
  ["SMSG_TUTORIAL_FLAGS", "Tutorial flags"],
  ["SMSG_INITIALIZE_FACTIONS", "Factions"],
  ["SMSG_SET_PROFICIENCY", "Proficiency"],
  ["SMSG_TALENTS_INFO", "Talents"],
  ["SMSG_BINDPOINTUPDATE", "Bind point"],
  ["SMSG_POWER_UPDATE", "Power update"],
  ["SMSG_HEALTH_UPDATE", "Health update"],
  ["SMSG_SET_PHASE_SHIFT", "Phase shift"],
  ["SMSG_PLAY_SOUND", "Sound effect"],
  ["SMSG_PLAY_MUSIC", "Music"],
  ["SMSG_PLAY_SPELL_VISUAL", "Spell visual"],
  ["SMSG_INSTANCE_DIFFICULTY", "Instance difficulty"],
  ["SMSG_RAID_INSTANCE_MESSAGE", "Instance message"],
];

type Problems = string[];

function isOpcodeName(name: string): name is OpcodeName {
  return name in GameOpcode;
}

function stems(dir: string): string[] {
  const glob = new Bun.Glob("*.ts");
  try {
    return [...glob.scanSync({ cwd: dir, onlyFiles: true })].map((file) =>
      basename(file, ".ts").replace(/\.test$/, ""),
    );
  } catch {
    return [];
  }
}

function coreHandleKeys(): string[] {
  const names = new Set<string>(AREA_NAMES);
  return Object.keys(createMockHandle()).filter((key) => !names.has(key));
}

function nameProblems(name: string): Problems {
  const reserved = new Set([
    ...coreHandleKeys(),
    "onAreaEvent",
    ...CORE_DOMAINS,
    ...stems(AREAS_DIR),
    ...stems(HARNESS_AREAS_DIR),
  ]);
  const problems: Problems = [];
  if (!/^[a-z]+$/.test(name)) problems.push(`${name}: not one lower-case word`);
  if (reserved.has(name)) problems.push(`${name}: reserved`);
  return problems;
}

function declarationProblems({ name, opcodes }: LooseModule): Problems {
  const owns = new Set<string>(opcodes.owns);
  const named = [...opcodes.owns, ...opcodes.uses];
  const subset = [
    ...opcodes.stubs.map(([op]) => op),
    ...opcodes.dead,
    ...opcodes.unseen,
  ];
  return [
    ...named
      .filter((op) => !isOpcodeName(op))
      .map((op) => `${name}: ${op} is no opcode`),
    ...named
      .filter((op) => LATE_LOGOUT.includes(op))
      .map((op) => `${name}: ${op} is late`),
    ...subset
      .filter((op) => !owns.has(op))
      .map((op) => `${name}: ${op} is not owned`),
  ];
}

function ownershipProblems(modules: readonly LooseModule[]): Problems {
  const owner = new Map<string, string>();
  const shared: Problems = [];
  for (const { name, opcodes } of modules)
    for (const op of opcodes.owns) {
      const first = owner.get(op);
      if (first) shared.push(`${op}: owned by ${first} and ${name}`);
      owner.set(op, name);
    }
  return [...modules.flatMap(declarationProblems), ...shared];
}

function registered(module: LooseModule) {
  const on: number[] = [];
  const peek: number[] = [];
  const wire: AreaRegister = {
    on: (opcode) => on.push(opcode),
    peek: (opcode) => peek.push(opcode),
  };
  const deps = {
    getEntity: () => undefined,
    now: () => 0,
    selfGuid: () => 0n,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  module.register(wire, module.store(deps, testStores()));
  return { on, peek };
}

function registrationProblems(module: LooseModule): Problems {
  const { on, peek } = registered(module);
  const codes = (names: readonly OpcodeName[]) =>
    new Set<number>(names.map((n) => GameOpcode[n]));
  const owns = codes(module.opcodes.owns);
  const uses = codes(module.opcodes.uses);
  return [
    ...on
      .filter((op) => !owns.has(op))
      .map((op) => `${module.name}: on 0x${op.toString(16)} not owned`),
    ...peek
      .filter((op) => !uses.has(op))
      .map((op) => `${module.name}: peek 0x${op.toString(16)} not used`),
  ];
}

function namedProblems(module: LooseModule, source: string): Problems {
  const declared = new Set<string>([
    ...module.opcodes.owns,
    ...module.opcodes.uses,
  ]);
  return [...source.matchAll(NAMED)]
    .map((match) => match[1] ?? "")
    .filter((name) => !declared.has(name))
    .map((name) => `${module.name}: names ${name}`);
}

function typeOnly(keyword: string | undefined, clause: string): boolean {
  if (keyword) return true;
  const inner = /^\{([^}]*)\}$/.exec(clause.trim())?.[1];
  if (inner === undefined) return false;
  const parts = inner
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => part.startsWith("type "));
}

function importProblems(area: string, source: string): Problems {
  const own = new RegExp(`^#wow/areas/${area}/[\\w-]+$`);
  const problems: Problems = [];
  for (const [, keyword, clause = "", spec = ""] of source.matchAll(IMPORT)) {
    const tag = `${area}: ${spec}`;
    const otherArea = /^#wow\/areas\/[a-z]+\//.test(spec) && !own.test(spec);
    if (spec === "#wow/client" || spec === "#wow/areas/compose" || otherArea)
      problems.push(`${tag} is banned`);
    if (BANNED_NAMES.test(clause))
      problems.push(`${tag} imports a registry type`);
    const allowed = own.test(spec) || VALUE_IMPORTS.some((re) => re.test(spec));
    if (!(allowed || typeOnly(keyword, clause)))
      problems.push(`${tag} is a value import`);
    if (!spec.startsWith("#")) problems.push(`${tag} is not an alias`);
  }
  if (/GameOpcode\.(CMSG|MSG)_MOVE_/.test(source))
    problems.push(`${area}: sends movement`);
  return problems;
}

function eventTypeProblems(module: LooseModule): Problems {
  return module.eventTypes
    .filter((type) => !/^[a-z_]+$/.test(type))
    .map((type) => `${module.name}: event ${type}`);
}

async function areaSources(area: string): Promise<string[]> {
  const glob = new Bun.Glob("**/*.ts");
  const dir = join(AREAS_DIR, area);
  const files = [...glob.scanSync({ cwd: dir })].filter(
    (f) => !f.endsWith(".test.ts"),
  );
  return await Promise.all(files.map((f) => Bun.file(join(dir, f)).text()));
}

function withOpcodes(
  module: LooseModule,
  opcodes: Partial<LooseModule["opcodes"]>,
): LooseModule {
  return { ...module, opcodes: { ...module.opcodes, ...opcodes } };
}

function fixture(index: number): LooseModule {
  const module = FIXTURE_MODULES[index];
  if (!module) throw new Error(`no fixture ${index}`);
  return module;
}

describe("the area registry", () => {
  test("directories, keys and module names agree, and each name is free", () => {
    const glob = new Bun.Glob("*/area.ts");
    const dirs = [...glob.scanSync({ cwd: AREAS_DIR })]
      .map((f) => f.split("/")[0])
      .sort();
    expect(dirs).toEqual([...AREA_NAMES].sort());
    expect(MODULES.map((m) => m.name)).toEqual([...AREA_NAMES]);
    expect(AREA_NAMES.flatMap(nameProblems)).toEqual([]);
  });

  test("ownership is a partition of real opcodes", () => {
    expect(ownershipProblems(MODULES)).toEqual([]);
  });

  test("each area registers only what it owns and uses", () => {
    expect(MODULES.flatMap(registrationProblems)).toEqual([]);
  });

  test("each named opcode is owned or used", async () => {
    const found = await Promise.all(
      MODULES.map(async (m) =>
        (await areaSources(m.name)).flatMap((s) => namedProblems(m, s)),
      ),
    );
    expect(found.flat()).toEqual([]);
  });

  test("area sources import only the allow-list", async () => {
    const found = await Promise.all(
      MODULES.map(async (m) =>
        (await areaSources(m.name)).flatMap((s) => importProblems(m.name, s)),
      ),
    );
    expect(found.flat()).toEqual([]);
  });

  test("each frozen stub stays a stub or gains an area handler", () => {
    const stubs = new Set(
      [...STUBS, ...areaStubs()].map(([op, label]) => `${op} ${label}`),
    );
    const handled = new Set(MODULES.flatMap((m) => registered(m).on));
    const lost = FROZEN_STUBS.filter(
      ([name, label]) =>
        !(
          stubs.has(`${GameOpcode[name]} ${label}`) ||
          handled.has(GameOpcode[name])
        ),
    );
    expect(lost).toEqual([]);
  });

  test("event types are lower-case words", () => {
    expect(MODULES.flatMap(eventTypeProblems)).toEqual([]);
  });
});

describe("the registry checks", () => {
  test("pass the fixture modules", () => {
    expect(ownershipProblems(FIXTURE_MODULES)).toEqual([]);
    expect(FIXTURE_MODULES.flatMap(registrationProblems)).toEqual([]);
    expect(FIXTURE_MODULES.flatMap(eventTypeProblems)).toEqual([]);
    expect(
      importProblems("alpha", 'import { x } from "#wow/areas/alpha/store";'),
    ).toEqual([]);
  });

  test("reject a reserved or malformed name", () => {
    expect(nameProblems("halt")).toEqual(["halt: reserved"]);
    expect(nameProblems("onAreaEvent")).toEqual([
      "onAreaEvent: not one lower-case word",
      "onAreaEvent: reserved",
    ]);
    expect(nameProblems("session")).toEqual(["session: reserved"]);
    expect(nameProblems("compose")).toEqual(["compose: reserved"]);
    expect(nameProblems("mail")).toEqual([]);
  });

  test("reject shared, unknown, unowned and late opcodes", () => {
    const alpha = fixture(0);
    const twin = { ...alpha, name: "twin" };
    const ghost = withOpcodes(alpha, { uses: ["SMSG_NO_SUCH" as OpcodeName] });
    const loose = withOpcodes(alpha, { dead: ["SMSG_CAMERA_SHAKE"] });
    const late = withOpcodes(alpha, { owns: ["SMSG_LOGOUT_COMPLETE"] });
    expect(ownershipProblems([alpha, twin])).toEqual([
      "SMSG_QUERY_TIME_RESPONSE: owned by alpha and twin",
      "CMSG_QUERY_TIME: owned by alpha and twin",
    ]);
    expect(ownershipProblems([ghost])).toEqual([
      "alpha: SMSG_NO_SUCH is no opcode",
    ]);
    expect(ownershipProblems([loose])).toEqual([
      "alpha: SMSG_CAMERA_SHAKE is not owned",
    ]);
    expect(ownershipProblems([late])).toEqual([
      "alpha: SMSG_LOGOUT_COMPLETE is late",
    ]);
  });

  test("reject a handler or peek outside the declaration", () => {
    const bare = withOpcodes(fixture(0), { owns: [], uses: [] });
    expect(registrationProblems(bare)).toEqual([
      `alpha: on 0x${GameOpcode.SMSG_QUERY_TIME_RESPONSE.toString(16)} not owned`,
      `alpha: peek 0x${GameOpcode.SMSG_UPDATE_OBJECT.toString(16)} not used`,
    ]);
  });

  test("reject an opcode named but not declared", () => {
    expect(
      namedProblems(fixture(1), "send(GameOpcode.CMSG_QUERY_TIME)"),
    ).toEqual(["beta: names CMSG_QUERY_TIME"]);
  });

  test("reject an import outside the allow-list", () => {
    const lines = [
      'import { createMockHandle } from "#test-support/mock-handle";',
      'import type { WorldHandle } from "#wow/index";',
      'import type { AreaName } from "#wow/areas/compose";',
      'import { gammaArea } from "#wow/areas/gamma/area";',
      'import { sessionDeps } from "#wow/session-stores";',
      'import { helper } from "./helper";',
      "send(GameOpcode.MSG_MOVE_JUMP);",
    ];
    expect(importProblems("alpha", lines.join("\n"))).toEqual([
      "alpha: #test-support/mock-handle is a value import",
      "alpha: #wow/index imports a registry type",
      "alpha: #wow/areas/compose is banned",
      "alpha: #wow/areas/gamma/area is banned",
      "alpha: #wow/areas/gamma/area is a value import",
      "alpha: #wow/session-stores is a value import",
      "alpha: ./helper is a value import",
      "alpha: ./helper is not an alias",
      "alpha: sends movement",
    ]);
  });

  test("reject an event type that is not a lower-case word", () => {
    const bad = { ...fixture(1), eventTypes: ["Rang-Out"] };
    expect(eventTypeProblems(bad)).toEqual(["beta: event Rang-Out"]);
  });
});
