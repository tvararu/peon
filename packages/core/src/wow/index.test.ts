import { expect, test } from "bun:test";
import {
  type Capabilities,
  type CombatAura,
  type CombatEventType,
  type ControlEventType,
  type CreatureInfo,
  type CycleRecovery,
  type CycleStop,
  type DestroyEvent,
  type FactionRelation,
  type ItemKind,
  itemKind,
  JevUnavailableError,
  type LootOutcome,
  type NamedInventoryItem,
  type NamedInventorySlot,
  type NamedLootItem,
  type NearbyUnits,
  type NoticeEvent,
  type NpcRole,
  npcRoles,
  type PlaceState,
  type PlayerLife,
  type RecoveryOutcome,
  type RemoteMotionEvent,
  type TacticsOutcome,
  type TrainerEvent,
  type Unsubscribe,
  type VendorEvent,
} from "#wow/index";

type HarnessNames = {
  capabilities: Capabilities;
  aura: CombatAura;
  combatEvent: CombatEventType;
  controlEvent: ControlEventType;
  creature: CreatureInfo;
  recovery: CycleRecovery;
  stop: CycleStop;
  destroy: DestroyEvent;
  relation: FactionRelation;
  kind: ItemKind;
  loot: LootOutcome;
  item: NamedInventoryItem;
  slot: NamedInventorySlot;
  lootItem: NamedLootItem;
  units: NearbyUnits;
  notice: NoticeEvent;
  role: NpcRole;
  place: PlaceState;
  life: PlayerLife;
  recovered: RecoveryOutcome;
  motion: RemoteMotionEvent;
  tactics: TacticsOutcome;
  trainer: TrainerEvent;
  unsubscribe: Unsubscribe;
  vendor: VendorEvent;
};

test("the barrel carries every name the harness imports", () => {
  const names: Partial<HarnessNames> = {};
  expect(Object.keys(names)).toEqual([]);
  expect(new JevUnavailableError("probe")).toBeInstanceOf(Error);
  expect(typeof itemKind).toBe("function");
  expect(typeof npcRoles).toBe("function");
});
