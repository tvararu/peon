import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  talentsTalentsInfoBody,
  talentsTalentsInfoPetBody,
} from "#test-support/areas/talents";
import { testStores } from "#test-support/session-fixtures";
import { type TalentsEvent, TalentsStore } from "#wow/areas/talents/store";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import type { SessionDeps } from "#wow/session-stores";

const ME = 0x2an;
const INFO = GameOpcode.SMSG_TALENTS_INFO;

function rigWithEvents() {
  const rig = areaRig("talents", { selfGuid: ME });
  const seen: TalentsEvent[] = [];
  rig.handle.onEvent((event) => seen.push(event));
  return { rig, seen };
}

const LEVEL_12 = talentsTalentsInfoBody({
  freePoints: 0,
  specs: [
    {
      glyphs: [161, 0, 0, 0, 0, 0],
      talents: [
        { rank: 1, talentId: 1862 },
        { rank: 0, talentId: 1868 },
      ],
    },
  ],
});

describe("TalentsStore through the area", () => {
  test("the first player-form packet is stored and diffed against an empty state", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(INFO, LEVEL_12);
      expect(rig.handle.state().player).toMatchObject({
        activeSpec: 0,
        freePoints: 0,
        kind: "player",
        specCount: 1,
      });
      expect(seen).toEqual([
        {
          glyphs: [{ from: 0, slot: 0, to: 161 }],
          pointsAfter: 0,
          pointsBefore: 0,
          specAfter: 0,
          specBefore: 0,
          talents: [
            { from: 0, talentId: 1862, to: 2 },
            { from: 0, talentId: 1868, to: 1 },
          ],
          type: "info",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("the same packet again gives one info event with an empty diff", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(INFO, LEVEL_12);
      rig.inject(INFO, LEVEL_12);
      expect(seen).toHaveLength(2);
      expect(seen[1]).toEqual({
        glyphs: [],
        pointsAfter: 0,
        pointsBefore: 0,
        specAfter: 0,
        specBefore: 0,
        talents: [],
        type: "info",
      });
    } finally {
      rig.dispose();
    }
  });

  test("a rank gained and a rank lost show in the diff", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(INFO, LEVEL_12);
      rig.inject(
        INFO,
        talentsTalentsInfoBody({
          freePoints: 0,
          specs: [
            {
              glyphs: [161, 0, 0, 0, 0, 0],
              talents: [{ rank: 2, talentId: 1862 }],
            },
          ],
        }),
      );
      expect(seen[1]).toMatchObject({
        talents: [
          { from: 2, talentId: 1862, to: 3 },
          { from: 1, talentId: 1868, to: 0 },
        ],
        type: "info",
      });
    } finally {
      rig.dispose();
    }
  });

  test("more free points and no rank change give info and then points", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(INFO, talentsTalentsInfoBody({ freePoints: 2, specs: [{}] }));
      seen.length = 0;
      rig.inject(INFO, talentsTalentsInfoBody({ freePoints: 3, specs: [{}] }));
      expect(seen).toEqual([
        {
          glyphs: [],
          pointsAfter: 3,
          pointsBefore: 2,
          specAfter: 0,
          specBefore: 0,
          talents: [],
          type: "info",
        },
        { after: 3, before: 2, type: "points" },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("fewer free points give no points event", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(INFO, talentsTalentsInfoBody({ freePoints: 3, specs: [{}] }));
      seen.length = 0;
      rig.inject(
        INFO,
        talentsTalentsInfoBody({
          freePoints: 2,
          specs: [{ talents: [{ rank: 0, talentId: 1862 }] }],
        }),
      );
      expect(seen.map((event) => event.type)).toEqual(["info"]);
    } finally {
      rig.dispose();
    }
  });

  test("the pet form fills pet only and emits pet_info", () => {
    const { rig, seen } = rigWithEvents();
    try {
      rig.inject(INFO, LEVEL_12);
      const player = rig.handle.state().player;
      seen.length = 0;
      rig.inject(
        INFO,
        talentsTalentsInfoPetBody({
          freePoints: 2,
          talents: [{ rank: 0, talentId: 2107 }],
        }),
      );
      expect(rig.handle.state().pet).toEqual({
        freePoints: 2,
        kind: "pet",
        talents: [{ rank: 0, talentId: 2107 }],
      });
      expect(rig.handle.state().player).toEqual(player);
      expect(seen).toEqual([
        {
          freePoints: 2,
          talents: [{ rank: 0, talentId: 2107 }],
          type: "pet_info",
        },
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("a packet before the self entity exists is kept", () => {
    const { rig } = rigWithEvents();
    try {
      rig.inject(INFO, talentsTalentsInfoBody({ freePoints: 4, specs: [{}] }));
      expect(rig.handle.state()).toMatchObject({
        fields: { freePoints: undefined },
        player: { freePoints: 4 },
      });
    } finally {
      rig.dispose();
    }
  });
});

function selfEntity(fields: Record<number, number>): Entity {
  return {
    entry: 0,
    guid: ME,
    name: undefined,
    objectType: ObjectType.PLAYER,
    position: undefined,
    rawFields: new Map(Object.entries(fields).map(([k, v]) => [Number(k), v])),
    scale: 1,
  };
}

function storeWith(entity: Entity | undefined) {
  const deps: SessionDeps = {
    getEntity: (guid) => (guid === ME ? entity : undefined),
    now: () => 0,
    selfGuid: () => ME,
    send: () => undefined,
    updateEntity: () => undefined,
  };
  return new TalentsStore(deps, testStores(deps));
}

describe("TalentsStore snapshot slots", () => {
  test("each slot takes its type from the fields, unlocked from bit i of GLYPHS_ENABLED and the glyph from the active spec (Player.cpp:13614-13625)", () => {
    const store = storeWith(
      selfEntity({
        1312: 21,
        1313: 22,
        1314: 23,
        1315: 41,
        1316: 42,
        1317: 43,
        1324: 0x0b,
      }),
    );
    store.info({
      activeSpec: 1,
      freePoints: 0,
      kind: "player",
      specCount: 2,
      specs: [
        { glyphs: [1, 2, 3, 4, 5, 6], talents: [] },
        { glyphs: [161, 0, 0, 162, 0, 0], talents: [] },
      ],
    });
    expect(store.snapshot().slots).toEqual([
      { glyphId: 161, index: 0, typeId: 21, unlocked: true },
      { glyphId: 0, index: 1, typeId: 22, unlocked: true },
      { glyphId: 0, index: 2, typeId: 23, unlocked: false },
      { glyphId: 162, index: 3, typeId: 41, unlocked: true },
      { glyphId: 0, index: 4, typeId: 42, unlocked: false },
      { glyphId: 0, index: 5, typeId: 43, unlocked: false },
    ]);
  });

  test("with no entity and no packet every slot value is undefined", () => {
    const [first] = storeWith(undefined).snapshot().slots;
    expect(first).toEqual({
      glyphId: undefined,
      index: 0,
      typeId: undefined,
      unlocked: undefined,
    });
  });

  test("a packet with no spec leaves the glyphs undefined", () => {
    const store = storeWith(undefined);
    store.info({
      activeSpec: 0,
      freePoints: 0,
      kind: "player",
      specCount: 0,
      specs: [],
    });
    expect(store.snapshot().slots.map((slot) => slot.glyphId)).toEqual(
      new Array(6).fill(undefined),
    );
  });
});

describe("noteRefused", () => {
  test("emits a refused event with a copy of the entries", () => {
    const { rig, seen } = rigWithEvents();
    try {
      const entries = [{ rank: 0, talentId: 1 }];
      rig.stores.areas.talents.noteRefused(entries);
      expect(seen).toEqual([
        {
          entries: [{ rank: 0, talentId: 1 }],
          outcome: "refused",
          type: "refused",
        },
      ]);
      expect(entries).toEqual([{ rank: 0, talentId: 1 }]);
    } finally {
      rig.dispose();
    }
  });
});
