import { expect, test } from "bun:test";
import { AREAS } from "#wow/areas/registry";
import {
  AREA_NAMES,
  type AreaActsOf,
  type AreaEvent,
  type AreaEventOf,
  type AreaHandle,
  type AreaHandles,
  type AreaName,
  type AreaState,
  type Capabilities,
  type CombatAura,
  type CombatEventType,
  type ControlEventType,
  type CreatureInfo,
  type DestroyEvent,
  type FactionRelation,
  type ItemKind,
  itemKind,
  type NamedInventoryItem,
  type NamedInventorySlot,
  type NamedLootItem,
  type NearbyUnits,
  type NoticeEvent,
  type NpcRole,
  npcRoles,
  type PlaceState,
  type PlayerLife,
  type RemoteMotionEvent,
  type TrainerEvent,
  type Unsubscribe,
  type VendorEvent,
} from "#wow/index";

type HarnessNames = {
  areaActs: AreaActsOf<AreaName>;
  areaEvent: AreaEvent;
  areaEventOf: AreaEventOf<AreaName>;
  areaHandle: AreaHandle<AreaName>;
  areaHandles: AreaHandles;
  areaState: AreaState<AreaName>;
  capabilities: Capabilities;
  aura: CombatAura;
  combatEvent: CombatEventType;
  controlEvent: ControlEventType;
  creature: CreatureInfo;
  destroy: DestroyEvent;
  relation: FactionRelation;
  kind: ItemKind;
  item: NamedInventoryItem;
  slot: NamedInventorySlot;
  lootItem: NamedLootItem;
  units: NearbyUnits;
  notice: NoticeEvent;
  role: NpcRole;
  place: PlaceState;
  life: PlayerLife;
  motion: RemoteMotionEvent;
  trainer: TrainerEvent;
  unsubscribe: Unsubscribe;
  vendor: VendorEvent;
};

test("the barrel carries every name the harness imports", () => {
  const names: Partial<HarnessNames> = {};
  expect(Object.keys(names)).toEqual([]);
  expect(typeof itemKind).toBe("function");
  expect(typeof npcRoles).toBe("function");
});

test("the barrel names every registered area", () => {
  expect<readonly string[]>(AREA_NAMES).toEqual(Object.keys(AREAS));
});
