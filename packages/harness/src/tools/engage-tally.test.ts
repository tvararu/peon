import { describe, expect, test } from "bun:test";
import type { AreaState } from "@peon/core";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import { decisionKind } from "#harness/tools/engage-tally";
import {
  field,
  KILL,
  lootsFang,
  outcome,
  STALKER,
  tactics,
  xp,
} from "#test-support/engage-fixtures";
import { toolCtx } from "#test-support/ops-fixtures";

const ME = 0x2an;
const BOAR = 0xf1_30_00_0c_1a_00_0a_bcn;

type LogEntry = AreaState<"combatlog">["entries"][number];

function feedLog(t: Awaited<ReturnType<typeof field>>, ...rows: LogEntry[]) {
  const combat = t.handle.getCombatState();
  t.handle.getCombatState = () => ({
    ...combat,
    self: { ...combat.self, guid: ME },
  });
  t.handle.spellDefinition = (id) =>
    id === 122 ? ({ id, name: "Frost Nova" } as never) : undefined;
  Object.assign(t.handle, {
    combatlog: {
      act: {},
      onEvent: () => () => undefined,
      state: () => ({
        comboPoints: undefined,
        dropped: 0,
        entries: rows.map((entry) => ({ ...entry, at: t.clock.now() })),
        fight: undefined,
        immunities: [],
        kills: [],
        lastFight: undefined,
      }),
    },
  });
}

function row(over: Partial<LogEntry>): LogEntry {
  return { amount: 0, at: 0, kind: "melee", source: ME, target: BOAR, ...over };
}

test("Jev decision cards name hunter actions by what they do", () => {
  expect(decisionKind("pet_attack")).toBe("attack");
  expect(decisionKind("spell:75:target")).toBe("spell");
  expect(decisionKind("attack")).toBe("attack");
  expect(decisionKind("stop_auto_shot")).toBe("wait");
});

describe("engage fight totals", () => {
  test("the DONE line and the after block carry the fight totals", async () => {
    const t = await field();
    feedLog(
      t,
      row({ amount: 200 }),
      row({ amount: 112, kind: "spell_damage", spellId: 133 }),
      row({ amount: 145, source: BOAR, target: ME }),
      row({ outcome: "dodge" }),
      row({ kind: "immune", spellId: 122 }),
    );
    tactics(t.handle, (runId) => {
      xp(t.handle, STALKER, 108);
      outcome(t.handle, runId, KILL);
    });
    lootsFang(t.handle);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.detail).toMatch(
      / server kill credit\. \+108 XP\. Looted Broken Fang x1, 12 copper\. Dealt 312, took 145; avoided: dodge x1; immune: Frost Nova\. You: HP/,
    );
    expect(res.after).toMatchObject({
      avoided: [{ count: 1, word: "dodge" }],
      castErrors: [{ count: 1, word: "immune" }],
      dealt: 312,
      healed: 0,
      immune: ["Frost Nova"],
      taken: 145,
    });
  });

  test("a fight with nothing in the combat log adds no totals line", async () => {
    const t = await field();
    feedLog(t);
    tactics(t.handle, (runId) => {
      xp(t.handle, STALKER, 108);
      outcome(t.handle, runId, KILL);
    });
    lootsFang(t.handle);
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res.detail).not.toContain("Dealt");
    expect(res.after).toMatchObject({
      avoided: [],
      castErrors: [],
      dealt: 0,
      immune: [],
      taken: 0,
    });
  });
});
