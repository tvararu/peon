import { expect, test } from "bun:test";
import { setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { controlMethods } from "#wow/client-control";
import { EntityStore } from "#wow/entity-store";
import type { FactionTemplateCatalog } from "#wow/faction-template";
import { ObjectType } from "#wow/protocol/entity-fields";
import type { Runtimes } from "#wow/runtime";
import type { ReputationRelationView } from "#wow/unit-relation";
import type { WorldConn } from "#wow/world-conn";

const GUARD_FACTION = 911;

function nearbyRow(reputation: ReputationRelationView) {
  const control = setup();
  const entityStore = new EntityStore();
  const spot = { mapId: 530, orientation: 0, y: -6671.76, z: 70.34 };
  entityStore.create(0x07_64n, ObjectType.PLAYER, {
    health: 100,
    position: { ...spot, x: 8709.46 },
  });
  entityStore.create(0x99n, ObjectType.UNIT, {
    health: 50,
    position: { ...spot, x: 8712 },
  });
  const factions = {
    get: () => ({ faction: GUARD_FACTION }),
    relation: () => "hostile",
  } as unknown as FactionTemplateCatalog;
  const rt = {
    areas: {
      runtimes: { reputation: { act: { relationView: () => reputation } } },
    },
    combat: {
      isAttackingSelf: (guid: bigint) => guid === 0x99n,
      observedPosition: () => undefined,
    },
    control: control.runtime,
    factions: () => factions,
  } as unknown as Runtimes;
  const conn = {
    entityStore,
    remoteMotion: { all: () => [] },
  } as unknown as WorldConn;
  const methods = controlMethods(conn, rt);
  const rows = methods.queryNearby({});
  const row = must(rows.find((candidate) => candidate.entity.guid === 0x99n));
  return { relation: methods.unitRelation(0x99n), row };
}

const noReputation: ReputationRelationView = {
  atWar: () => false,
  forcedRank: () => undefined,
  hasReputationList: () => false,
  reputationRank: () => undefined,
};

test("passes faction relation and incoming attackers to the rows", () => {
  const { relation, row } = nearbyRow(noReputation);
  expect(row).toMatchObject({
    attackable: true,
    attackingMe: true,
    relation: "hostile",
  });
  expect(relation).toBe("hostile");
});

test("the reputation area's view decides a reputation faction's relation", () => {
  const { relation, row } = nearbyRow({
    ...noReputation,
    reputationRank: (faction) => (faction === GUARD_FACTION ? 5 : undefined),
  });
  expect(row.relation).toBe("friendly");
  expect(relation).toBe("friendly");
});
