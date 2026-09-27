import { describe, expect, test } from "bun:test";
import type { RunRecord } from "#harness/contract/runs";
import {
  type Claim,
  createControlArbiter,
  type Grant,
  type OwnerChange,
  type Takeover,
} from "#harness/runtime/control-owner";

function setup() {
  const takeovers: Takeover[] = [];
  const changes: OwnerChange[] = [];
  const stopped = [{ id: "r1" } as RunRecord];
  const control = createControlArbiter((takeover) => {
    takeovers.push(takeover);
    return stopped;
  });
  control.onChange((change) => changes.push(change));
  return { changes, control, stopped, takeovers };
}

function grantOf(claim: Claim): Grant {
  if (!claim.granted) throw new Error(`refused: ${claim.holder}`);
  return claim.grant;
}

describe("createControlArbiter", () => {
  test("a free body goes to any claimant without pre-empting anything", () => {
    const { control, takeovers } = setup();
    expect(control.claim("loop", "run_outlived_turn")).toMatchObject({
      granted: true,
      stopped: [],
    });
    expect(control.owner()).toBe("loop");
    expect(takeovers).toEqual([]);
  });

  test("human > agent > loop: each higher claim pre-empts the holder", () => {
    const { control, stopped, takeovers } = setup();
    control.claim("loop", "run_outlived_turn");
    expect(control.claim("agent", "travel")).toMatchObject({
      granted: true,
      stopped,
    });
    expect(control.claim("human", "key")).toMatchObject({
      granted: true,
      stopped,
    });
    expect(takeovers).toEqual([
      { by: "agent", displaced: "loop", reason: "travel" },
      { by: "human", displaced: "agent", reason: "key" },
    ]);
    expect(control.owner()).toBe("human");
  });

  test("a lower claim is refused while a higher owner holds and changes nothing", () => {
    const { changes, control, takeovers } = setup();
    const human = grantOf(control.claim("human", "drive"));
    changes.length = 0;
    takeovers.length = 0;
    expect(control.claim("agent", "travel")).toEqual({
      granted: false,
      holder: "human",
    });
    expect(control.claim("loop", "run_outlived_turn")).toEqual({
      granted: false,
      holder: "human",
    });
    control.release(human, "hand_back");
    control.claim("agent", "travel");
    expect(control.claim("loop", "run_outlived_turn")).toEqual({
      granted: false,
      holder: "agent",
    });
    expect(takeovers).toEqual([]);
    expect(control.owner()).toBe("agent");
  });

  test("a second claim by the same owner pre-empts the first grant", () => {
    const { changes, control, takeovers } = setup();
    const first = grantOf(control.claim("loop", "run_outlived_turn"));
    const second = grantOf(control.claim("loop", "probe"));
    expect(takeovers).toEqual([
      { by: "loop", displaced: "loop", reason: "probe" },
    ]);
    expect(control.holds(first)).toBe(false);
    expect(control.holds(second)).toBe(true);
    expect(changes.at(-1)).toEqual({
      owner: "loop",
      previous: "loop",
      reason: "probe",
    });
    control.release(first, "run_ended");
    expect(control.owner()).toBe("loop");
    control.release(second, "done");
    expect(control.owner()).toBe("none");
  });

  test("a human claim always stops everything, even from a free body or its own hold", () => {
    const { control, takeovers } = setup();
    control.claim("human", "reflex");
    control.claim("human", "key");
    expect(takeovers).toEqual([
      { by: "human", displaced: "none", reason: "reflex" },
      { by: "human", displaced: "human", reason: "key" },
    ]);
  });

  test("release frees the body only for the current grant", () => {
    const { changes, control } = setup();
    const loop = grantOf(control.claim("loop", "run_outlived_turn"));
    changes.length = 0;
    const agent = grantOf(control.claim("agent", "travel"));
    control.release(loop, "run_ended");
    expect(control.owner()).toBe("agent");
    control.release(agent, "turn_ended");
    expect(control.owner()).toBe("none");
    expect(changes).toEqual([
      { owner: "agent", previous: "loop", reason: "travel" },
      { owner: "none", previous: "agent", reason: "turn_ended" },
    ]);
  });
});
