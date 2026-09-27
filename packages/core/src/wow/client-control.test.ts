import { expect, test } from "bun:test";
import { setup } from "#test-support/control-fixtures";
import { must } from "#test-support/must";
import { controlMethods } from "#wow/client-control";
import { EntityStore } from "#wow/entity-store";
import type { FactionTemplateCatalog } from "#wow/faction-template";
import { ObjectType } from "#wow/protocol/entity-fields";
import type { Runtimes } from "#wow/runtime";
import type { WorldConn } from "#wow/world-conn";

test("passes faction relation and incoming attackers to the rows", () => {
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
    relation: () => "hostile",
  } as unknown as FactionTemplateCatalog;
  const rt = {
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
  const rows = controlMethods(conn, rt).queryNearby({});
  const row = must(rows.find((candidate) => candidate.entity.guid === 0x99n));
  expect(row).toMatchObject({
    attackable: true,
    attackingMe: true,
    relation: "hostile",
  });
});
