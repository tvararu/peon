import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  TALENTS_TAB_NAMES,
  talentsCatalogFiles,
  talentsTabDbc,
  talentsTalentDbc,
  talentsTalentsInfoBody,
} from "#test-support/areas/talents";
import { dbcFiles } from "#test-support/dbc";
import type { DbcSource } from "#wow/dbc";
import type { Entity } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PLAYER_FIELDS, UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;
const LEARN = GameOpcode.CMSG_LEARN_TALENT;
const INFO = GameOpcode.SMSG_TALENTS_INFO;
function warrior(fieldPoints: number | undefined): Entity {
  const rawFields = new Map<number, number>([
    [UNIT_FIELDS.BYTES_0.offset, 10 | (1 << 8)],
  ]);
  if (fieldPoints !== undefined)
    rawFields.set(PLAYER_FIELDS.CHARACTER_POINTS1.offset, fieldPoints);
  return { guid: ME, rawFields } as unknown as Entity;
}

function catalogSource(): DbcSource {
  const files = new Map(talentsCatalogFiles());
  files.set(
    "Talent.dbc",
    talentsTalentDbc([
      { column: 1, id: 124, ranks: [1, 2, 3], row: 0, tab: 161 },
    ]),
  );
  files.set(
    "TalentTab.dbc",
    talentsTabDbc([
      { classMask: 1, id: 161, name: TALENTS_TAB_NAMES.arms, page: 0 },
    ]),
  );
  return dbcFiles(files);
}

type Setup = { dbc?: DbcSource; fieldPoints?: number; packetPoints?: number };

function rigged({ dbc, fieldPoints, packetPoints }: Setup) {
  const rig = areaRig("talents", {
    dbc,
    getEntity: (guid) => (guid === ME ? warrior(fieldPoints) : undefined),
    selfGuid: ME,
  });
  if (packetPoints !== undefined)
    rig.inject(
      INFO,
      talentsTalentsInfoBody({ freePoints: packetPoints, specs: [{}] }),
    );
  return rig;
}

describe("talents runtime: free points precedence", () => {
  const modes = [
    { name: "degraded", dbc: undefined },
    { name: "catalog", dbc: catalogSource() },
  ];
  for (const mode of modes) {
    test(`${mode.name}: packet points win over stale zero object field`, async () => {
      const rig = rigged({ dbc: mode.dbc, fieldPoints: 0, packetPoints: 1 });
      try {
        const before = rig.sent.length;
        const pending = rig.handle.act.learnTalents([
          { rank: 0, talentId: 124 },
        ]);
        for (let round = 0; round < 20 && rig.sent.length < before + 1; round++)
          await Promise.resolve();
        expect(rig.sent.at(-1)?.opcode).toBe(LEARN);
        rig.inject(
          INFO,
          talentsTalentsInfoBody({
            freePoints: 0,
            specs: [{ talents: [{ rank: 0, talentId: 124 }] }],
          }),
        );
        const result = await pending;
        expect(result.entries[0]?.outcome).toBe("learned");
      } finally {
        rig.dispose();
      }
    });

    test(`${mode.name}: packet zero refuses even when the field still shows points`, async () => {
      const rig = rigged({ dbc: mode.dbc, fieldPoints: 2, packetPoints: 0 });
      try {
        const before = rig.sent.length;
        const result = await rig.handle.act.learnTalents([
          { rank: 0, talentId: 124 },
        ]);
        expect(rig.sent.length).toBe(before);
        expect(result.entries[0]?.outcome).toBe("no_points");
      } finally {
        rig.dispose();
      }
    });
  }

  test("the object field is used when no packet has arrived", async () => {
    const rig = rigged({ fieldPoints: 0 });
    try {
      const before = rig.sent.length;
      const result = await rig.handle.act.learnTalents([
        { rank: 0, talentId: 124 },
      ]);
      expect(rig.sent.length).toBe(before);
      expect(result.entries[0]?.outcome).toBe("no_points");
    } finally {
      rig.dispose();
    }
  });
});

describe("talents runtime: disposal cancels learns", () => {
  test("degraded: disposing right after the call sends nothing and rejects", async () => {
    const rig = rigged({ packetPoints: 3 });
    const before = rig.sent.length;
    const pending = rig.handle.act.learnTalents([{ rank: 0, talentId: 124 }]);
    const settled = pending.then(
      () => "resolved",
      () => "rejected",
    );
    rig.dispose();
    expect(await settled).toBe("rejected");
    expect(rig.sent.length).toBe(before);
  });

  test("catalog: disposing during a delayed DBC load rejects at once and sends nothing", async () => {
    const gate = Promise.withResolvers<void>();
    let neverCalled = false;
    const never: DbcSource = (file) => {
      neverCalled = true;
      return gate.promise.then(() => {
        throw new Error(file);
      });
    };
    const rig = rigged({ dbc: never, packetPoints: 3 });
    const before = rig.sent.length;
    const pending = rig.handle.act.learnTalents([{ rank: 1, talentId: 124 }]);
    const settled = pending.then(
      () => "resolved",
      () => "rejected",
    );
    for (let round = 0; round < 20 && !neverCalled; round++)
      await Promise.resolve();
    rig.dispose();
    expect(await settled).toBe("rejected");
    expect(rig.sent.length).toBe(before);
    gate.resolve();
    await settled;
  });

  test("catalog: a DBC load that settles after disposal sends nothing", async () => {
    const gate = Promise.withResolvers<void>();
    const source = catalogSource();
    const delayed: DbcSource = (file) => gate.promise.then(() => source(file));
    const rig = rigged({ dbc: delayed, packetPoints: 3 });
    const before = rig.sent.length;
    const pending = rig.handle.act.learnTalents([{ rank: 1, talentId: 124 }]);
    const settled = pending.then(
      () => "resolved",
      () => "rejected",
    );
    await Promise.resolve();
    rig.dispose();
    gate.resolve();
    expect(await settled).toBe("rejected");
    expect(rig.sent.length).toBe(before);
  });
});
