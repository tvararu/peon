import { expect, test } from "bun:test";
import { timeoutOutcome } from "#harness/loops/combat-actions-observation";
import { context, setup } from "#test-support/combat-actions-fixtures";

test("a retained goto creature target serializes as a hex GUID for Jev", () => {
  const { actions, routes } = setup();
  routes.refuse(
    { x: 5, y: 0 },
    "pathfind_find_height failed (UNKNOWN_HEIGHT)",
    { target: 0xf130003d2108604dn },
  );
  const frame = actions.observe(context);
  const sent = JSON.parse(JSON.stringify(frame.observation));

  expect(sent.navigation).toMatchObject({
    active: false,
    refusal: "stop",
    target: "0xf130003d2108604d",
  });
});

test("a fact the client never observed reaches Jev as null, not a missing key", () => {
  const { actions } = setup(() => 1000, { observeTargetPosition: false });
  const sent = JSON.parse(JSON.stringify(actions.observe(context).observation));

  expect(sent.target).toMatchObject({ health: 100, pose: null });
  expect(sent.attackTarget).toBeNull();
});

test("a running channel never times out", () => {
  const { combatStore } = setup();
  combatStore.casts.beginChannel({
    durationMs: 3000,
    spellId: 17,
    target: 2n,
  });
  const combat = combatStore.record(2n);
  const snap = setup().combat.snapshot(2n);
  const state = {
    ...snap,
    ...combat,
    casting: undefined,
    pendingCast: undefined,
  };
  expect(timeoutOutcome(state, 1000 + 9000)).toBeUndefined();
});
