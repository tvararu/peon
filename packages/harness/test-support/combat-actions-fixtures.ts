import { ObjectType, UNIT_FIELDS } from "@peon/core";
import { ControlRuntime, EntityStore } from "@peon/core/test-support/internals";
import { combatParts } from "@peon/core/test-support/session-fixtures";
import { CombatActions } from "#harness/loops/combat-actions";
import type { RangedGear } from "#harness/loops/combat-ranged-gear";
import { routedControl } from "#test-support/navigation-fixtures";

export const context = {
  instruction: "Defeat the selected creature",
  targetGuid: 2n,
};
export const MOVE_IDS = [
  "run_ahead",
  "veer_left",
  "veer_right",
  "turn_left",
  "turn_right",
  "turn_around",
  "strafe_left",
  "strafe_right",
  "back_up",
  "stop",
];

export function setup(
  nowFn: () => number = () => 1000,
  options: { observeTargetPosition?: boolean; gear?: () => RangedGear } = {},
) {
  const sent: { opcode: number; body: Uint8Array | undefined }[] = [];
  const store = new EntityStore();
  const fields = new Map<number, number>([
    [UNIT_FIELDS.HEALTH.offset, 100],
    [UNIT_FIELDS.MAXHEALTH.offset, 100],
    [UNIT_FIELDS.BYTES_0.offset, 1],
    [0x7a, 0x28_01],
    [UNIT_FIELDS.POWER1.offset, 15],
    [UNIT_FIELDS.MAXPOWER1.offset, 1000],
    [UNIT_FIELDS.BASE_MANA.offset, 100],
  ]);
  store.create(1n, ObjectType.PLAYER, {
    health: 100,
    maxHealth: 100,
    rawFields: fields,
  });
  store.create(2n, ObjectType.UNIT, {
    health: 100,
    maxHealth: 100,
    rawFields: new Map([[UNIT_FIELDS.HEALTH.offset, 100]]),
    target: 1n,
    unitFlags: 0x8_00_00,
  });
  const runtime = new ControlRuntime({
    ground: {
      height: (_mapId, _x, _y, from) => from?.z,
      pathClear: () => true,
    },
    now: nowFn,
    selfGuid: () => 1n,
    send() {},
    ticks: () => 0,
  });
  const { control, routes } = routedControl(runtime, nowFn);

  control.observeSelf({
    position: { mapId: 530, orientation: 0, x: 0, y: 0, z: 0 },
    runBackSpeed: 4,
    runSpeed: 7,
  });
  const {
    combat,
    store: combatStore,
    motion,
  } = combatParts({
    getEntity: (guid) => store.get(guid),
    now: nowFn,
    selectedGuid: () => 2n,
    selfGuid: () => 1n,
    selfPose: () => control.snapshot().pose,
    send: (opcode, body) => {
      sent.push({ body, opcode });
    },
  });
  if (options.observeTargetPosition ?? true)
    motion.observe(2n, {
      mapId: 530,
      orientation: 0,
      x: 10,
      y: 0,
      z: 0,
    });
  combatStore.applyInitialSpells({ cooldowns: [], spells: [{ spellId: 17 }] });
  const port = {
    attack: (targetGuid: bigint) => combat.attack(targetGuid),
    cancelCast: () => combat.cancelCast(),
    cast: (spellId: number, targetGuid: bigint) =>
      combat.cast(spellId, targetGuid),
    channel: () => combatStore.casts.channel,
    definition: (spellId: number) => combat.definition(spellId),
    halt: () => combat.halt(),
    isAttackingSelf: (guid: bigint) => combat.isAttackingSelf(guid),
    petAttack: (petGuid: bigint, targetGuid: bigint) =>
      combat.petAttack(petGuid, targetGuid),
    readyAt: (spellId: number) => combat.readyAt(spellId),
    snapshot: (targetGuid?: bigint) => combat.snapshot(targetGuid),
    stopAttack: () => combat.stopAttack(),
    stopAutoRepeat: () => combat.stopAutoRepeat(),
  };
  const actions = new CombatActions({
    combat: port,
    control,
    entity: (guid) => store.get(guid),
    now: nowFn,
    relation: () => "unknown",
    ...(options.gear && { gear: options.gear }),
  });
  actions.activate(context);
  return {
    actions,
    combat,
    combatStore,
    control,
    fields,
    motion,
    routes,
    sent,
    store,
  };
}
