import { expect, jest, test } from "bun:test";
import { ObjectType, UNIT_FIELDS } from "@peon/core";
import { GameOpcode } from "@peon/core/test-support/internals";
import { ARCANE_SHOT, AUTO_SHOT } from "@peon/core/test-support/spell-fixtures";
import { context } from "#test-support/combat-actions-fixtures";
import { hunter } from "#test-support/hunter-fixtures";
import { drive, fixture, judgment } from "#test-support/tactics-fixtures";

const PET = 0xf1_40_00_00_00_00_00_aan;

test("fake Jev sends the pet in, starts Auto Shot, then fires Arcane Shot", async () => {
  const h = hunter(20);
  h.fields.set(UNIT_FIELDS.SUMMON.offset, 0xaa);
  h.fields.set(UNIT_FIELDS.SUMMON.offset + 1, 0xf1_40_00_00);
  h.store.create(PET, ObjectType.UNIT, {
    health: 150,
    maxHealth: 150,
    rawFields: new Map([[UNIT_FIELDS.HEALTH.offset, 150]]),
    target: 0n,
  });
  const plan = [
    "pet_attack",
    `spell:${AUTO_SHOT}:target`,
    `spell:${ARCANE_SHOT}:target`,
  ];
  const offered: string[][] = [];
  const done = Promise.withResolvers<void>();
  const f = fixture({
    activate: () => {},
    execute: (id) => {
      h.actions.execute(id, context);
      if (id === plan.at(-1)) done.resolve();
    },
    observe: () => h.actions.observe(context),
    select: async (request) => {
      offered.push(request.candidates.map((candidate) => candidate.id));
      return judgment(plan[offered.length - 1] ?? "wait");
    },
  });
  jest.useFakeTimers();
  const running = f.tactics.start(context);
  try {
    await drive(done.promise);
  } finally {
    f.tactics.dispose();
    jest.useRealTimers();
    await running;
  }
  expect(offered[0]).toContain("pet_attack");
  expect(offered[0]).toContain(`spell:${AUTO_SHOT}:target`);
  expect(h.sent.map((packet) => packet.opcode)).toEqual([
    GameOpcode.CMSG_PET_ACTION,
    GameOpcode.CMSG_CAST_SPELL,
    GameOpcode.CMSG_CAST_SPELL,
  ]);
  expect(h.combat.snapshot().autoRepeat?.spellId).toBe(AUTO_SHOT);
  expect(h.combat.snapshot().pendingCast?.spellId).toBe(ARCANE_SHOT);
});
