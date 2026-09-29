import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  COVERAGE_DIR,
  COVERAGE_INDEX,
  coreSources,
  coverageRows,
  projectCoverage,
  REPO_ROOT,
  renderCoverage,
} from "#test-support/protocol-coverage";
import {
  AREA_NAMES,
  type LooseModule,
  registerModules,
} from "#wow/areas/compose";
import { emptyStore } from "#wow/areas/contract";
import { GameOpcode } from "#wow/protocol/opcodes";
import { STUBS } from "#wow/protocol/stubs";
import { OpcodeDispatch } from "#wow/protocol/world";

const FIXTURE: LooseModule = {
  eventTypes: [],
  name: "alpha",
  opcodes: {
    dead: ["CMSG_SET_FACTION_CHEAT"],
    owns: [
      "SMSG_DESTRUCTIBLE_BUILDING_DAMAGE",
      "CMSG_SET_FACTION_CHEAT",
      "SMSG_EQUIPMENT_SET_SAVED",
      "SMSG_PLAY_TIME_WARNING",
      "SMSG_LEARNED_DANCE_MOVES",
      "TC9_CMSG_PREPARE_FOR_REDIRECT",
      "TC9_SMSG_READY_FOR_REDIRECT",
    ],
    stubs: [["SMSG_EQUIPMENT_SET_SAVED", "Equipment set saved"]],
    unseen: ["SMSG_LEARNED_DANCE_MOVES"],
    uses: [],
  },
  register: (wire) => {
    wire.on(GameOpcode.SMSG_DESTRUCTIBLE_BUILDING_DAMAGE, () => undefined);
    wire.on(GameOpcode.SMSG_LEARNED_DANCE_MOVES, () => undefined);
  },
  store: () => emptyStore(),
};

function fixtureRows(sources: string[] = []) {
  const dispatch = new OpcodeDispatch();
  registerModules(dispatch, [FIXTURE], { alpha: emptyStore() });
  const stubs = [
    ...STUBS,
    ...FIXTURE.opcodes.stubs.map(
      ([name, label]) => [GameOpcode[name], label] as const,
    ),
  ];
  return coverageRows({ areas: [FIXTURE], dispatch, sources, stubs });
}

function row(rows: ReturnType<typeof fixtureRows>, name: string) {
  const found = rows.find((r) => r.name === name);
  if (!found) throw new Error(`no row ${name}`);
  return found;
}

async function coverageFiles(): Promise<string[]> {
  const names = await readdir(join(REPO_ROOT, COVERAGE_DIR)).catch(
    (): string[] => [],
  );
  return names.map((name) => `${COVERAGE_DIR}/${name}`).sort();
}

describe("renderCoverage", () => {
  test("renders the index, core and one file per area", async () => {
    const { files } = projectCoverage(await coreSources());
    expect([...files.keys()].sort()).toEqual(
      [
        COVERAGE_INDEX,
        `${COVERAGE_DIR}/core.md`,
        ...AREA_NAMES.map((name) => `${COVERAGE_DIR}/${name}.md`),
      ].sort(),
    );
  });

  test("every coverage file on disk matches and none is extra", async () => {
    const { files } = projectCoverage(await coreSources());
    for (const [path, text] of files)
      expect({
        path,
        text: await Bun.file(join(REPO_ROOT, path)).text(),
      }).toEqual({
        path,
        text,
      });
    expect(await coverageFiles()).toEqual(
      [...files.keys()].filter((p) => p.startsWith(`${COVERAGE_DIR}/`)).sort(),
    );
  });

  test("splits rows by the owning area", () => {
    const files = renderCoverage(fixtureRows(), [FIXTURE]);
    expect([...files.keys()].sort()).toEqual([
      COVERAGE_INDEX,
      `${COVERAGE_DIR}/alpha.md`,
      `${COVERAGE_DIR}/core.md`,
    ]);
    const alpha = files.get(`${COVERAGE_DIR}/alpha.md`) ?? "";
    const core = files.get(`${COVERAGE_DIR}/core.md`) ?? "";
    expect(alpha).toContain("`SMSG_PLAY_TIME_WARNING`");
    expect(core).not.toContain("`SMSG_PLAY_TIME_WARNING`");
    expect(core).toContain("`SMSG_UPDATE_OBJECT`");
    expect(alpha).toContain(
      "| `0x455` | `SMSG_LEARNED_DANCE_MOVES` | server | handled | not seen live |",
    );
  });

  test("the index holds no count", () => {
    const index = renderCoverage(fixtureRows(), [FIXTURE]).get(COVERAGE_INDEX);
    expect(index).toContain("protocol.md#add-an-area");
    expect(index).not.toMatch(/\d+ opcodes/);
  });
});

describe("coverageRows", () => {
  test("gives an area's opcodes dead, stub, handled or missing", () => {
    const rows = fixtureRows([
      "GameOpcode.CMSG_SET_FACTION_CHEAT GameOpcode.SMSG_EQUIPMENT_SET_SAVED",
    ]);
    expect(row(rows, "CMSG_SET_FACTION_CHEAT").status).toBe("dead");
    expect(row(rows, "SMSG_EQUIPMENT_SET_SAVED").status).toBe("stub");
    expect(row(rows, "SMSG_DESTRUCTIBLE_BUILDING_DAMAGE").status).toBe(
      "handled",
    );
    expect(row(rows, "SMSG_PLAY_TIME_WARNING").status).toBe("missing");
  });

  test("marks unseen opcodes not seen live", () => {
    const rows = fixtureRows();
    expect(row(rows, "SMSG_LEARNED_DANCE_MOVES").live).toBe("not seen live");
    expect(row(rows, "SMSG_DESTRUCTIBLE_BUILDING_DAMAGE").live).toBe("");
  });

  test("files each row under its owner", () => {
    const rows = fixtureRows();
    expect(row(rows, "SMSG_PLAY_TIME_WARNING").area).toBe("alpha");
    expect(row(rows, "SMSG_UPDATE_OBJECT").area).toBe("core");
  });

  test("reads the direction through the TC9 prefix", () => {
    const rows = fixtureRows();
    expect(row(rows, "TC9_CMSG_PREPARE_FOR_REDIRECT").direction).toBe("client");
    expect(row(rows, "TC9_SMSG_READY_FOR_REDIRECT").direction).toBe("server");
    expect(row(rows, "MSG_RANDOM_ROLL").direction).toBe("both");
  });

  test("tells handled, stubbed, sent and missing core opcodes apart", () => {
    const { rows } = projectCoverage(["send(GameOpcode.CMSG_BOOTME)"]);
    const status = new Map(rows.map((r) => [r.name, r.status]));
    expect(status.get("SMSG_UPDATE_OBJECT")).toBe("handled");
    expect(status.get("SMSG_WARDEN_DATA")).toBe("stub");
    expect(status.get("CMSG_BOOTME")).toBe("handled");
    expect(status.get("SMSG_SPELLLOGEXECUTE")).toBe("missing");
  });

  test("lists every opcode once", () => {
    const { rows } = projectCoverage([]);
    expect(rows.map((r) => r.opcode).toSorted((a, b) => a - b)).toEqual(
      Object.values(GameOpcode).toSorted((a, b) => a - b),
    );
  });
});
