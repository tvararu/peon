import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  TALENTS_TAB_NAMES,
  talentsCatalogFiles,
  talentsTabDbc,
  talentsTalentDbc,
  talentsTalentsInfoBody,
  talentsTalentsInfoPetBody,
} from "#test-support/areas/talents";
import { dbcFiles } from "#test-support/dbc";
import { elapse, withFakeTimers } from "#test-support/fake-time";
import {
  buildLearnPreviewTalents,
  buildLearnTalent,
} from "#wow/areas/talents/protocol";
import type { TalentsEvent } from "#wow/areas/talents/store";
import type { Entity } from "#wow/entity-store";
import { GameOpcode } from "#wow/protocol/opcodes";
import { UNIT_FIELDS } from "#wow/protocol/update-fields";

const ME = 0x2an;
const LEARN = GameOpcode.CMSG_LEARN_TALENT;
const PREVIEW = GameOpcode.CMSG_LEARN_PREVIEW_TALENTS;
const INFO = GameOpcode.SMSG_TALENTS_INFO;
const FILES = talentsCatalogFiles();

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function warrior(): Entity {
  return {
    guid: ME,
    rawFields: new Map([[UNIT_FIELDS.BYTES_0.offset, 10 | (1 << 8)]]),
  } as unknown as Entity;
}

type Setup = {
  dbc?: boolean;
  specs?: Parameters<typeof talentsTalentsInfoBody>[0]["specs"];
  freePoints?: number;
};

function rigged({ dbc = true, specs, freePoints = 3 }: Setup = {}) {
  const rig = areaRig("talents", {
    dbc: dbc ? dbcFiles(FILES) : undefined,
    getEntity: (guid) => (guid === ME ? warrior() : undefined),
    selfGuid: ME,
  });
  const seen: TalentsEvent[] = [];
  const off = rig.handle.onEvent((event) => seen.push(event));
  rig.inject(
    INFO,
    talentsTalentsInfoBody({ freePoints, specs: specs ?? [{}] }),
  );
  return { off, rig, seen };
}

const PREVIEW_124_2_130 = {
  body: buildLearnPreviewTalents([
    { rank: 2, talentId: 124 },
    { rank: 0, talentId: 130 },
  ]),
  opcode: PREVIEW,
};

function filesOf() {
  const files = new Map(FILES);
  files.set(
    "Talent.dbc",
    talentsTalentDbc([
      { column: 1, id: 124, ranks: [1, 2, 3], row: 0, tab: 161 },
      { column: 1, id: 130, ranks: [4, 5, 6], row: 0, tab: 161 },
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

describe("talents runtime: learn", () => {
  test("one legal entry sends one CMSG_LEARN_TALENT and a matching reply is learned", async () => {
    const { off, rig } = rigged({ dbc: false });
    try {
      const pending = rig.handle.act.learnTalents([{ rank: 1, talentId: 124 }]);
      await flush();
      expect(rig.sent.at(-1)?.opcode).toBe(LEARN);
      rig.inject(
        INFO,
        talentsTalentsInfoBody({
          freePoints: 2,
          specs: [{ talents: [{ rank: 1, talentId: 124 }] }],
        }),
      );
      expect(await pending).toEqual({
        catalog: false,
        entries: [{ outcome: "learned", rank: 1, talentId: 124 }],
      });
    } finally {
      off();
      rig.dispose();
    }
  });

  test("two legal entries send one CMSG_LEARN_PREVIEW_TALENTS with both", async () => {
    const { off, rig } = rigged({ dbc: false });
    try {
      const pending = rig.handle.act.learnTalents([
        { rank: 2, talentId: 124 },
        { rank: 0, talentId: 130 },
      ]);
      await flush();
      expect(rig.sent.at(-1)).toEqual(PREVIEW_124_2_130);
      rig.inject(
        INFO,
        talentsTalentsInfoBody({
          freePoints: 0,
          specs: [
            {
              talents: [
                { rank: 2, talentId: 124 },
                { rank: 0, talentId: 130 },
              ],
            },
          ],
        }),
      );
      expect((await pending).entries).toEqual([
        { outcome: "learned", rank: 2, talentId: 124 },
        { outcome: "learned", rank: 0, talentId: 130 },
      ]);
    } finally {
      off();
      rig.dispose();
    }
  });

  test("a pet-form packet does not settle the wait", async () => {
    const { off, rig } = rigged({ dbc: false });
    try {
      const pending = rig.handle.act.learnTalents([{ rank: 1, talentId: 124 }]);
      await flush();
      rig.inject(INFO, talentsTalentsInfoPetBody({ talents: [] }));
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await flush();
      expect(settled).toBe(false);
      rig.inject(
        INFO,
        talentsTalentsInfoBody({
          freePoints: 2,
          specs: [{ talents: [{ rank: 1, talentId: 124 }] }],
        }),
      );
      expect(await pending).toMatchObject({ catalog: false });
    } finally {
      off();
      rig.dispose();
    }
  });

  test("a reply without the rank is refused_by_server (Player.cpp:14290)", async () => {
    const { off, rig } = rigged({ dbc: false });
    try {
      const pending = rig.handle.act.learnTalents([{ rank: 1, talentId: 124 }]);
      await flush();
      rig.inject(INFO, talentsTalentsInfoBody({ freePoints: 3, specs: [{}] }));
      expect(await pending).toEqual({
        catalog: false,
        entries: [{ outcome: "refused_by_server", rank: 1, talentId: 124 }],
      });
    } finally {
      off();
      rig.dispose();
    }
  });

  test("no reply in 5 s is no_reply", async () => {
    await withFakeTimers(async () => {
      const { off, rig } = rigged({ dbc: false });
      try {
        const pending = rig.handle.act.learnTalents([
          { rank: 1, talentId: 124 },
        ]);
        const assertion = pending.then((result) =>
          expect(result).toEqual({
            catalog: false,
            entries: [{ outcome: "no_reply", rank: 1, talentId: 124 }],
          }),
        );
        await elapse(5100);
        await assertion;
      } finally {
        off();
        rig.dispose();
      }
    });
  });

  test("a local refusal sends nothing, notes refused and emits the event", async () => {
    const { off, rig, seen } = rigged({ dbc: false, freePoints: 0 });
    const before = rig.sent.length;
    try {
      const result = await rig.handle.act.learnTalents([
        { rank: 0, talentId: 124 },
      ]);
      expect(rig.sent.length).toBe(before);
      expect(result).toEqual({
        catalog: false,
        entries: [{ outcome: "no_points", rank: 0, talentId: 124 }],
      });
      expect(seen.at(-1)).toEqual({
        entries: [{ rank: 0, talentId: 124 }],
        outcome: "refused",
        type: "refused",
      });
    } finally {
      off();
      rig.dispose();
    }
  });

  test("a second call in flight throws talent_request_busy", async () => {
    const { off, rig } = rigged({ dbc: false });
    try {
      const first = rig.handle.act.learnTalents([{ rank: 1, talentId: 124 }]);
      await expect(
        rig.handle.act.learnTalents([{ rank: 1, talentId: 124 }]),
      ).rejects.toThrow("talent_request_busy");
      rig.inject(
        INFO,
        talentsTalentsInfoBody({
          freePoints: 2,
          specs: [{ talents: [{ rank: 1, talentId: 124 }] }],
        }),
      );
      await first;
    } finally {
      off();
      rig.dispose();
    }
  });

  test("catalog() resolves undefined with no DBC source", async () => {
    const { off, rig } = rigged({ dbc: false });
    try {
      expect(await rig.handle.act.catalog()).toBeUndefined();
    } finally {
      off();
      rig.dispose();
    }
  });

  test("catalog() loads once and the local rules refuse a wrong-class talent", async () => {
    const rig = areaRig("talents", {
      dbc: filesOf(),
      getEntity: (guid) => (guid === ME ? warrior() : undefined),
      selfGuid: ME,
    });
    try {
      const first = await rig.handle.act.catalog();
      const second = await rig.handle.act.catalog();
      expect(first?.talent(124)).toMatchObject({ id: 124, row: 0 });
      expect(second).toBe(first);
      expect(first?.tab(161)?.name).toBe(TALENTS_TAB_NAMES.arms);
      rig.inject(INFO, talentsTalentsInfoBody({ freePoints: 3, specs: [{}] }));
      const before = rig.sent.length;
      const result = await rig.handle.act.learnTalents([
        { rank: 0, talentId: 9999 },
      ]);
      expect(rig.sent.length).toBe(before);
      expect(result).toMatchObject({
        catalog: true,
        entries: [{ outcome: "unknown_talent", rank: 0, talentId: 9999 }],
      });
    } finally {
      rig.dispose();
    }
  });

  test("with the catalog one legal entry goes as CMSG_LEARN_TALENT", async () => {
    const rig = areaRig("talents", {
      dbc: filesOf(),
      getEntity: (guid) => (guid === ME ? warrior() : undefined),
      selfGuid: ME,
    });
    try {
      rig.inject(INFO, talentsTalentsInfoBody({ freePoints: 3, specs: [{}] }));
      const pending = rig.handle.act.learnTalents([{ rank: 0, talentId: 124 }]);
      await flush();
      expect(rig.sent.at(-1)).toEqual({
        body: buildLearnTalent({ rank: 0, talentId: 124 }),
        opcode: LEARN,
      });
      rig.inject(
        INFO,
        talentsTalentsInfoBody({
          freePoints: 2,
          specs: [{ talents: [{ rank: 0, talentId: 124 }] }],
        }),
      );
      expect(await pending).toEqual({
        catalog: true,
        entries: [{ outcome: "learned", rank: 0, talentId: 124 }],
      });
    } finally {
      rig.dispose();
    }
  });

  test("a plan with one legal and one unknown talent reports both and emits the refusal", async () => {
    const rig = areaRig("talents", {
      dbc: filesOf(),
      getEntity: (guid) => (guid === ME ? warrior() : undefined),
      selfGuid: ME,
    });
    const seen: TalentsEvent[] = [];
    const off = rig.handle.onEvent((event) => seen.push(event));
    try {
      rig.inject(INFO, talentsTalentsInfoBody({ freePoints: 3, specs: [{}] }));
      const pending = rig.handle.act.learnTalents([
        { rank: 0, talentId: 124 },
        { rank: 0, talentId: 9999 },
      ]);
      await flush();
      expect(rig.sent.at(-1)?.opcode).toBe(LEARN);
      expect(rig.sent.at(-1)).toEqual({
        body: buildLearnTalent({ rank: 0, talentId: 124 }),
        opcode: LEARN,
      });
      rig.inject(
        INFO,
        talentsTalentsInfoBody({
          freePoints: 2,
          specs: [{ talents: [{ rank: 0, talentId: 124 }] }],
        }),
      );
      expect(await pending).toEqual({
        catalog: true,
        entries: [
          { outcome: "learned", rank: 0, talentId: 124 },
          { outcome: "unknown_talent", rank: 0, talentId: 9999 },
        ],
      });
      expect(seen.filter((event) => event.type === "refused")).toEqual([
        {
          entries: [{ rank: 0, talentId: 9999 }],
          outcome: "refused",
          type: "refused",
        },
      ]);
    } finally {
      off();
      rig.dispose();
    }
  });

  test("a degraded mixed plan refuses the bad rank and reports the sent one", async () => {
    const { off, rig, seen } = rigged({ dbc: false });
    try {
      const pending = rig.handle.act.learnTalents([
        { rank: 1, talentId: 124 },
        { rank: 5, talentId: 130 },
      ]);
      await flush();
      expect(rig.sent.at(-1)?.opcode).toBe(LEARN);
      rig.inject(
        INFO,
        talentsTalentsInfoBody({
          freePoints: 2,
          specs: [{ talents: [{ rank: 1, talentId: 124 }] }],
        }),
      );
      expect(await pending).toEqual({
        catalog: false,
        entries: [
          { outcome: "learned", rank: 1, talentId: 124 },
          { outcome: "bad_rank", rank: 5, talentId: 130 },
        ],
      });
      expect(seen.filter((event) => event.type === "refused")).toEqual([
        {
          entries: [{ rank: 5, talentId: 130 }],
          outcome: "refused",
          type: "refused",
        },
      ]);
    } finally {
      off();
      rig.dispose();
    }
  });

  test("a degraded mixed plan with no reply reports no_reply and the refusal", async () => {
    await withFakeTimers(async () => {
      const { off, rig, seen } = rigged({ dbc: false });
      try {
        const pending = rig.handle.act.learnTalents([
          { rank: 1, talentId: 124 },
          { rank: 5, talentId: 130 },
        ]);
        const assertion = pending.then((result) =>
          expect(result).toEqual({
            catalog: false,
            entries: [
              { outcome: "no_reply", rank: 1, talentId: 124 },
              { outcome: "bad_rank", rank: 5, talentId: 130 },
            ],
          }),
        );
        await elapse(5100);
        await assertion;
        expect(seen.filter((event) => event.type === "refused")).toEqual([
          {
            entries: [{ rank: 5, talentId: 130 }],
            outcome: "refused",
            type: "refused",
          },
        ]);
      } finally {
        off();
        rig.dispose();
      }
    });
  });

  test("a partly successful preview learns one entry and refuses the other", async () => {
    const { off, rig } = rigged({ dbc: false });
    try {
      const pending = rig.handle.act.learnTalents([
        { rank: 2, talentId: 124 },
        { rank: 0, talentId: 130 },
      ]);
      await flush();
      expect(rig.sent.at(-1)).toEqual(PREVIEW_124_2_130);
      rig.inject(
        INFO,
        talentsTalentsInfoBody({
          freePoints: 1,
          specs: [{ talents: [{ rank: 2, talentId: 124 }] }],
        }),
      );
      expect((await pending).entries).toEqual([
        { outcome: "learned", rank: 2, talentId: 124 },
        { outcome: "refused_by_server", rank: 0, talentId: 130 },
      ]);
    } finally {
      off();
      rig.dispose();
    }
  });

  test("an oversized plan rejects without leaving a waiter behind", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", listener);
    const { off, rig } = rigged({ dbc: false, freePoints: 200 });
    try {
      const plan = new Array(151).fill({ rank: 0, talentId: 124 });
      await expect(rig.handle.act.learnTalents(plan)).rejects.toThrow(
        "too_many_talents",
      );
      rig.dispose();
      await flush();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", listener);
      off();
      rig.dispose();
    }
  });

  test("a failed send rejects without leaving a waiter behind", async () => {
    await withFakeTimers(async () => {
      const unhandled: unknown[] = [];
      const listener = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", listener);
      const { off, rig } = rigged({ dbc: false });
      try {
        (rig.sent as unknown[]).push = () => {
          throw new Error("socket down");
        };
        await expect(
          rig.handle.act.learnTalents([{ rank: 1, talentId: 124 }]),
        ).rejects.toThrow("socket down");
        await elapse(5100);
        await Promise.resolve();
        expect(unhandled).toEqual([]);
      } finally {
        process.off("unhandledRejection", listener);
        off();
        rig.dispose();
      }
    });
  });
});
