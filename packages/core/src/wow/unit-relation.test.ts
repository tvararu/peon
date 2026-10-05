import { beforeAll, describe, expect, test } from "bun:test";
import { dbcFiles, packDbc } from "#test-support/dbc";
import { EntityStore } from "#wow/entity-store";
import {
  type FactionTemplateCatalog,
  loadFactionTemplates,
} from "#wow/faction-template";
import { ObjectType, UnitFlag } from "#wow/protocol/entity-fields";
import {
  creatureAggroesSelf,
  type ReputationRelationView,
  reputationReaction,
  targetRelation,
} from "#wow/unit-relation";

const SELF = 1n;
const PLAYER_MASK = 1;
const TEMPLATES = {
  self: 1,
  hostile: 2,
  neutral: 3,
  friendly: 4,
  guard: 5,
} as const;
const GUARD_FACTION = 50;

function template(
  id: number,
  faction: number,
  masks: { friendly?: number; hostile?: number; our?: number },
  enemies: number[] = [],
): number[] {
  const row = new Array<number>(14).fill(0);
  row[0] = id;
  row[1] = faction;
  row[3] = masks.our ?? 0;
  row[4] = masks.friendly ?? 0;
  row[5] = masks.hostile ?? 0;
  enemies.forEach((enemy, index) => {
    row[6 + index] = enemy;
  });
  return row;
}

let catalog: FactionTemplateCatalog;

beforeAll(async () => {
  const templates = packDbc(14, [
    template(TEMPLATES.self, 10, { our: PLAYER_MASK }),
    template(TEMPLATES.hostile, 20, { hostile: PLAYER_MASK }),
    template(TEMPLATES.neutral, 30, {}),
    template(TEMPLATES.friendly, 40, { friendly: PLAYER_MASK }),
    template(TEMPLATES.guard, GUARD_FACTION, { friendly: PLAYER_MASK }),
    template(14, 14, { hostile: PLAYER_MASK }),
    template(25, 25, {}),
    template(38, 29, { hostile: PLAYER_MASK }, [28]),
  ]);
  const source = dbcFiles(new Map([["FactionTemplate.dbc", templates]]));
  catalog = await loadFactionTemplates(source);
});

function world(
  factionTemplate: number,
  options: {
    objectType?: ObjectType;
    attacking?: boolean;
    factions?: FactionTemplateCatalog;
    reputation?: ReputationRelationView;
  } = {},
) {
  const store = new EntityStore();
  store.create(SELF, ObjectType.PLAYER, {
    health: 100,
    maxHealth: 100,
    factionTemplate: TEMPLATES.self,
  });
  store.create(2n, options.objectType ?? ObjectType.UNIT, {
    health: 100,
    maxHealth: 100,
    factionTemplate,
    target: options.attacking ? SELF : 0n,
    unitFlags: options.attacking ? UnitFlag.IN_COMBAT : 0,
  });
  return {
    entity: (guid: bigint) => store.get(guid),
    factions: () => ("factions" in options ? options.factions : catalog),
    ...(options.reputation && { reputation: options.reputation }),
  };
}

describe("targetRelation", () => {
  test("names the relation that decided the fight", () => {
    expect(targetRelation(world(TEMPLATES.hostile), 2n, SELF)).toBe("hostile");
    expect(targetRelation(world(TEMPLATES.neutral), 2n, SELF)).toBe("neutral");
    expect(targetRelation(world(TEMPLATES.friendly), 2n, SELF)).toBe(
      "friendly",
    );
    expect(targetRelation(world(99), 2n, SELF)).toBe("unknown");
    expect(targetRelation(world(TEMPLATES.neutral), 3n, SELF)).toBe("unknown");
  });
});

function view(
  init: {
    atWar?: readonly number[];
    forced?: Record<number, number>;
    lists?: readonly number[];
    ranks?: Record<number, number>;
  } = {},
): ReputationRelationView {
  return {
    atWar: (faction) => init.atWar?.includes(faction) ?? false,
    forcedRank: (faction) => init.forced?.[faction],
    hasReputationList: (faction) => init.lists?.includes(faction) ?? false,
    reputationRank: (faction) => init.ranks?.[faction],
  };
}
const relationWith = (
  factionTemplate: number,
  reputation: ReputationRelationView,
  objectType?: ObjectType,
) =>
  targetRelation(world(factionTemplate, { objectType, reputation }), 2n, SELF);

describe("targetRelation with reputation (Unit.cpp:6830-7016)", () => {
  test("a forced rank for the target's faction wins over the template masks (Unit.cpp:6843-6855, 6960-6963)", () => {
    expect(relationWith(TEMPLATES.hostile, view({ forced: { 20: 4 } }))).toBe(
      "friendly",
    );
    expect(
      relationWith(
        TEMPLATES.guard,
        view({ forced: { 50: 0 }, ranks: { 50: 7 } }),
      ),
    ).toBe("hostile");
  });

  test("a reputation faction answers with the character's rank, capped at Neutral at war (Unit.cpp:6973-6984)", () => {
    expect(relationWith(TEMPLATES.guard, view({ ranks: { 50: 0 } }))).toBe(
      "hostile",
    );
    expect(relationWith(TEMPLATES.guard, view({ ranks: { 50: 5 } }))).toBe(
      "friendly",
    );
    expect(
      relationWith(TEMPLATES.guard, view({ atWar: [50], ranks: { 50: 5 } })),
    ).toBe("neutral");
    expect(relationWith(TEMPLATES.hostile, view({ ranks: { 20: 5 } }))).toBe(
      "friendly",
    );
  });

  test("ranks map as Unit::IsHostileTo and IsFriendlyTo (Unit.cpp:7008-7016)", () => {
    const relations = [0, 1, 2, 3, 4, 5, 6, 7].map((rank) =>
      relationWith(TEMPLATES.neutral, view({ forced: { 30: rank } })),
    );
    expect(relations).toEqual([
      "hostile",
      "hostile",
      "neutral",
      "neutral",
      "friendly",
      "friendly",
      "friendly",
      "friendly",
    ]);
  });

  test("a player target keeps the template rule", () => {
    const reputation = view({ forced: { 20: 4 }, ranks: { 50: 0 } });
    expect(relationWith(TEMPLATES.hostile, reputation, ObjectType.PLAYER)).toBe(
      "hostile",
    );
    expect(relationWith(TEMPLATES.guard, reputation, ObjectType.PLAYER)).toBe(
      "friendly",
    );
  });

  test("a faction without a reputation rank keeps the template rule", () => {
    const empty = view();
    expect(relationWith(TEMPLATES.hostile, empty)).toBe("hostile");
    expect(relationWith(TEMPLATES.guard, empty)).toBe("friendly");
    expect(relationWith(TEMPLATES.neutral, empty)).toBe("neutral");
    expect(relationWith(99, view({ forced: { 99: 4 } }))).toBe("unknown");
  });
});

describe("reputationReaction", () => {
  test("maps a template to its faction and answers forced rank, then capped reputation rank", () => {
    expect(
      reputationReaction(view(), catalog, TEMPLATES.guard),
    ).toBeUndefined();
    expect(
      reputationReaction(view({ ranks: { 50: 6 } }), catalog, TEMPLATES.guard),
    ).toBe(6);
    expect(
      reputationReaction(
        view({ atWar: [50], ranks: { 50: 6 } }),
        catalog,
        TEMPLATES.guard,
      ),
    ).toBe(3);
    expect(
      reputationReaction(
        view({ atWar: [50], ranks: { 50: 1 } }),
        catalog,
        TEMPLATES.guard,
      ),
    ).toBe(1);
    expect(
      reputationReaction(
        view({ forced: { 50: 2 }, ranks: { 50: 6 } }),
        catalog,
        TEMPLATES.guard,
      ),
    ).toBe(2);
    expect(
      reputationReaction(view({ forced: { 50: 2 } }), catalog, 99),
    ).toBeUndefined();
  });
});

describe("creatureAggroesSelf", () => {
  test("a neutral-to-all template never starts the fight", () => {
    expect(creatureAggroesSelf(catalog, 25, TEMPLATES.self, view())).toBe(
      false,
    );
    expect(creatureAggroesSelf(catalog, 99, TEMPLATES.self, view())).toBe(
      false,
    );
    expect(creatureAggroesSelf(catalog, 14, 99, view())).toBe(false);
  });

  test("templates hostile to the player start the fight", () => {
    expect(creatureAggroesSelf(catalog, 14, TEMPLATES.self, view())).toBe(true);
    expect(creatureAggroesSelf(catalog, 38, TEMPLATES.self, view())).toBe(true);
    expect(
      creatureAggroesSelf(catalog, TEMPLATES.friendly, TEMPLATES.self, view()),
    ).toBe(false);
  });

  test("a reputation rank overrides the template masks", () => {
    const hostile = view({ lists: [30], ranks: { 30: 0 } });
    expect(
      creatureAggroesSelf(catalog, TEMPLATES.neutral, TEMPLATES.self, hostile),
    ).toBe(true);
    const friendly = view({ lists: [30], ranks: { 30: 5 } });
    expect(
      creatureAggroesSelf(catalog, TEMPLATES.neutral, TEMPLATES.self, friendly),
    ).toBe(false);
    const listed = view({ lists: [25], ranks: { 25: 1 } });
    expect(creatureAggroesSelf(catalog, 25, TEMPLATES.self, listed)).toBe(true);
    const unknown = view({ lists: [25] });
    expect(creatureAggroesSelf(catalog, 25, TEMPLATES.self, unknown)).toBe(
      false,
    );
  });
});
