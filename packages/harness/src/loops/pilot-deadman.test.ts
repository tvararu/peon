import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import { setup } from "@peon/core/test-support/control-fixtures";
import { GameOpcode } from "@peon/core/test-support/internals";
import { PilotActions } from "#harness/loops/pilot-actions";
import type { PilotContext } from "#harness/loops/pilot-types";

const context: PilotContext = {
  instruction: "reach",
  objective: { kind: "reach", x: 8800, y: -6671.76 },
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

function pilotOn() {
  const f = setup({
    ground: {
      height: (_mapId, _x, _y, from) => from?.z ?? 70.34,
      pathClear: () => true,
    },
  });
  const actions = new PilotActions({
    control: f.runtime,
    ground: {
      height: (_mapId, _x, _y, from) => from?.z ?? 70.34,
      pathClear: () => true,
    },
    life: () => "alive",
  });
  return { ...f, actions };
}

function stops(sent: { opcode: number }[]): number {
  return sent.filter((packet) => packet.opcode === GameOpcode.MSG_MOVE_STOP)
    .length;
}

describe("pilot dead-man", () => {
  test("one applied run_ahead with no further decision stops the mover within 1.5 s", () => {
    const { actions, sent, advance } = pilotOn();
    sent.length = 0;
    actions.execute("run_ahead", context);
    expect(stops(sent)).toBe(0);
    advance(1400);
    expect(stops(sent)).toBe(0);
    advance(200);
    expect(stops(sent)).toBe(1);
  });

  test("a renewed run_ahead keeps the character moving past the first lease", () => {
    const { actions, sent, advance } = pilotOn();
    sent.length = 0;
    actions.execute("run_ahead", context);
    advance(1000);
    actions.execute("run_ahead", context);
    advance(1000);
    expect(stops(sent)).toBe(0);
    advance(600);
    expect(stops(sent)).toBe(1);
  });

  test("halt stops the mover at once", () => {
    const { actions, sent } = pilotOn();
    actions.execute("run_ahead", context);
    sent.length = 0;
    actions.halt();
    expect(stops(sent)).toBe(1);
  });
});
