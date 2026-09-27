import { expect, test } from "bun:test";
import { context, setup } from "#test-support/combat-actions-fixtures";

test("a retained goto creature target serializes as a hex GUID for Jev", () => {
  const { actions, control } = setup();
  control.navigationError(
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
