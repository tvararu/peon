import { expect, jest, test } from "bun:test";
import {
  movementCompatibleSpell,
  spell,
  standingRequiredSpell,
} from "@peon/core/test-support/spell-fixtures";
import {
  context,
  MOVE_IDS,
  setup,
} from "#test-support/combat-actions-fixtures";

test("observation carries separation and facing to the target", () => {
  const { actions } = setup();
  const frame = actions.observe(context);
  expect(frame.observation["separation"]).toBe(10);
  expect(frame.observation["facingTarget"]).toBe(true);
});

test("unobserved target distance stays explicit rather than invented", () => {
  const { actions } = setup(undefined, { observeTargetPosition: false });
  const frame = actions.observe(context);
  expect(frame.observation["separation"]).toBeNull();
  expect(frame.observation["facingTarget"]).toBe(false);
});

test("movement candidates are offered exactly when movement is allowed", () => {
  const { actions, combat, control } = setup();
  const definition = jest.spyOn(combat, "definition").mockReturnValue(spell());
  try {
    let frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    for (const id of MOVE_IDS)
      expect(frame.candidates.map((c) => c.id)).toContain(id);
    control.forceRoot(1);
    frame = actions.observe(context);
    expect(frame.outcome).toBeUndefined();
    for (const id of MOVE_IDS)
      expect(frame.candidates.map((c) => c.id)).not.toContain(id);
  } finally {
    definition.mockRestore();
  }
});

test("a chosen move faces its heading and drives under the dead-man lease", () => {
  const { actions, control } = setup();
  const face = jest.spyOn(control, "face");
  const drive = jest.spyOn(control, "drive");
  actions.execute("turn_left", context);
  expect(face).toHaveBeenCalledWith(Math.PI / 2);
  expect(drive).toHaveBeenCalledWith({ move: "forward" }, 1500);
  expect(control.snapshot().moving).toBe(true);
});

test("choosing the same move again renews the lease", () => {
  const { actions, control } = setup();
  const drive = jest.spyOn(control, "drive");
  actions.execute("back_up", context);
  actions.execute("back_up", context);
  expect(drive).toHaveBeenCalledTimes(2);
  expect(drive).toHaveBeenLastCalledWith({ move: "backward" }, 1500);
});

test("wait renews nothing, so a running move lapses by itself", () => {
  const { actions, control } = setup();
  actions.execute("run_ahead", context);
  const drive = jest.spyOn(control, "drive");
  actions.execute("wait", context);
  expect(drive).not.toHaveBeenCalled();
});

test("stop halts an active movement lease", () => {
  const { actions, control } = setup();
  actions.execute("run_ahead", context);
  expect(control.snapshot().moving).toBe(true);
  actions.execute("stop", context);
  expect(control.snapshot().moving).toBe(false);
});

test("a standing-required spell executed while moving halts movement before casting", () => {
  const { actions, combat, control } = setup();
  const definition = jest
    .spyOn(combat, "definition")
    .mockReturnValue(standingRequiredSpell());
  try {
    actions.execute("run_ahead", context);
    expect(control.snapshot().moving).toBe(true);
    actions.execute("spell:17:target", context);
    expect(control.snapshot().moving).toBe(false);
    expect(combat.snapshot().pendingCast?.spellId).toBe(17);
  } finally {
    definition.mockRestore();
  }
});

test("a movement-compatible spell executed while moving does not release the lease", () => {
  const { actions, combat, control } = setup();
  const definition = jest
    .spyOn(combat, "definition")
    .mockReturnValue(movementCompatibleSpell());
  try {
    actions.execute("run_ahead", context);
    expect(control.snapshot().moving).toBe(true);
    actions.execute("spell:17:target", context);
    expect(control.snapshot().moving).toBe(true);
    expect(combat.snapshot().pendingCast?.spellId).toBe(17);
  } finally {
    definition.mockRestore();
  }
});
