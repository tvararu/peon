import {
  createRuleMemo,
  type RuleInput,
  type RuleLookup,
} from "#harness/events/rules";

export function testLookup(over: Partial<RuleLookup> = {}): RuleLookup {
  return {
    experience: () => ({ next: undefined, xp: undefined }),
    itemName: () => undefined,
    lastAttacker: () => undefined,
    place: () => ({ area: undefined, zone: undefined }),
    questTitle: () => undefined,
    selfVitals: () => undefined,
    unitLevel: () => undefined,
    unitName: () => undefined,
    ...over,
  };
}

export function testRuleInput(over: Partial<RuleInput> = {}): RuleInput {
  return {
    lookup: testLookup(),
    memo: createRuleMemo(),
    now: 1_000_000,
    refOf: (guid) => `u${guid}`,
    runActive: false,
    selfGuid: 1n,
    selfName: "Fgk",
    wake: true,
    ...over,
  };
}
