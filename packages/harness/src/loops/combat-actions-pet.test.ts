import { expect, test } from "bun:test";
import { ObjectType, UNIT_FIELDS } from "@peon/core";
import { GameOpcode, PacketReader } from "@peon/core/test-support/internals";
import { engagedWith } from "#harness/loops/combat-actions-credit";
import { context } from "#test-support/combat-actions-fixtures";
import { hunter } from "#test-support/hunter-fixtures";

const PET = 0xf1_40_00_00_00_00_00_aan;

function withPet(health = 150) {
  const fixture = hunter(20);
  fixture.fields.set(UNIT_FIELDS.SUMMON.offset, 0xaa);
  fixture.fields.set(UNIT_FIELDS.SUMMON.offset + 1, 0xf1_40_00_00);
  fixture.store.create(PET, ObjectType.UNIT, {
    health,
    maxHealth: 150,
    name: "Ravager",
    rawFields: new Map([[UNIT_FIELDS.HEALTH.offset, health]]),
    target: 0n,
  });
  return fixture;
}

test("the observation names the pet with its health and target", () => {
  const { actions, store } = withPet();
  expect(actions.observe(context).observation["pet"]).toEqual({
    guid: "0xf1400000000000aa",
    health: 150,
    maxHealth: 150,
    name: "Ravager",
    onTarget: false,
    target: null,
  });
  store.update(PET, { target: context.targetGuid });
  expect(actions.observe(context).observation["pet"]).toMatchObject({
    onTarget: true,
    target: "0x2",
  });
});

test("pet_attack sends CMSG_PET_ACTION attack on the selected creature", () => {
  const { actions, advance, combat, ids, sent } = withPet();
  expect(ids()).toContain("pet_attack");
  actions.execute("pet_attack", context);
  const packet = sent.at(-1);
  expect(packet?.opcode).toBe(GameOpcode.CMSG_PET_ACTION);
  const r = new PacketReader(packet?.body ?? new Uint8Array());
  expect([r.uint64LE(), r.uint32LE(), r.uint64LE()]).toEqual([
    PET,
    0x07_00_00_02,
    context.targetGuid,
  ]);
  expect(combat.snapshot().petCommand).toEqual({
    at: 1000,
    pet: PET,
    target: context.targetGuid,
  });
  expect(ids()).not.toContain("pet_attack");
  advance(2500);
  expect(ids()).toContain("pet_attack");
});

test("a pet on the target, a dead pet or no pet gets no pet_attack", () => {
  const onTarget = withPet();
  onTarget.store.update(PET, { target: context.targetGuid });
  expect(onTarget.ids()).not.toContain("pet_attack");
  expect(withPet(0).ids()).not.toContain("pet_attack");
  const none = hunter(20);
  expect(none.ids()).not.toContain("pet_attack");
  expect(none.actions.observe(context).observation["pet"]).toBeNull();
});

test("a pet command or Auto Shot on the target counts as engagement", () => {
  const { actions, combat, store } = withPet();
  const idle = () => store.update(2n, { target: 0n });
  idle();
  expect(engagedWith(combat.snapshot(), store.get(2n))).toBe(false);
  store.update(2n, { target: 1n });
  actions.execute("pet_attack", context);
  idle();
  expect(engagedWith(combat.snapshot(), store.get(2n))).toBe(true);
  const shooter = hunter(20);
  shooter.actions.execute("spell:75:target", context);
  shooter.store.update(2n, { target: 0n });
  expect(engagedWith(shooter.combat.snapshot(), shooter.store.get(2n))).toBe(
    true,
  );
});
