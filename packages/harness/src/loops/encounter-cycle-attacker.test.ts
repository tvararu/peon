import { expect, test } from "bun:test";
import { fakeRecovery } from "#test-support/cycle-recovery-fixtures";
import {
  fakeControl,
  fakeLoot,
  makeCycle,
} from "#test-support/encounter-cycle-fixtures";

const HEADHUNTER_U40 = 40n;
const HEADHUNTER_U42 = 42n;

function blockedTactics(
  starts: bigint[],
  reasonOf: (guid: bigint) => string | undefined,
) {
  let last: bigint | undefined;
  return {
    start: async (
      ctx: { targetGuid: bigint; instruction: string },
      _signal?: AbortSignal,
    ) => {
      starts.push(ctx.targetGuid);
      last = ctx.targetGuid;
    },
    stop: (_reason: string) => {},
    snapshot: () => {
      const reason = last === undefined ? undefined : reasonOf(last);
      return {
        lastOutcome:
          reason === undefined
            ? { status: "completed" as const, reason: "server_kill_credit" }
            : { status: "blocked" as const, reason },
      };
    },
  };
}

test("does not pull a second unit while the unreachable one still attacks", async () => {
  const starts: bigint[] = [];
  const attackers: bigint[] = [];
  const tactics = blockedTactics(starts, () => {
    attackers.push(HEADHUNTER_U40);
    return "target_unreachable";
  });
  const runtime = makeCycle({
    attackers: () => attackers,
    control: fakeControl(),
    loot: fakeLoot({}),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics,
  });
  await runtime.start({
    guids: [HEADHUNTER_U40, HEADHUNTER_U42],
    instruction: "fight",
    maxStarts: 2,
  });
  const state = runtime.snapshot();
  expect(starts).toEqual([HEADHUNTER_U40]);
  expect(state.stopCause).toBe("attacker_unreachable");
  expect(state.stopDetail).toMatchObject({ ref: HEADHUNTER_U40 });
});

test("moves on to the next unit when the unreachable one is not attacking", async () => {
  const starts: bigint[] = [];
  const tactics = blockedTactics(starts, (guid) =>
    guid === HEADHUNTER_U40 ? "target_unreachable" : undefined,
  );
  const runtime = makeCycle({
    attackers: () => [],
    control: fakeControl(),
    loot: fakeLoot({}),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics,
  });
  await runtime.start({
    guids: [HEADHUNTER_U40, HEADHUNTER_U42],
    instruction: "fight",
    maxStarts: 2,
  });
  expect(starts).toEqual([HEADHUNTER_U40, HEADHUNTER_U42]);
  expect(runtime.snapshot().stopCause).not.toBe("attacker_unreachable");
});

test("does not start the second unit when the unreachable one attacks during its approach", async () => {
  const starts: bigint[] = [];
  const attackers: bigint[] = [];
  const approached: bigint[] = [];
  const runtime = makeCycle({
    approach: async (guid) => {
      approached.push(guid);
      if (guid === HEADHUNTER_U42) attackers.push(HEADHUNTER_U40);
    },
    attackers: () => attackers,
    control: fakeControl(),
    loot: fakeLoot({}),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics: blockedTactics(starts, (guid) =>
      guid === HEADHUNTER_U40 ? "target_unreachable" : undefined,
    ),
  });
  await runtime.start({
    guids: [HEADHUNTER_U40, HEADHUNTER_U42],
    instruction: "fight",
    maxStarts: 2,
  });
  const state = runtime.snapshot();
  expect(approached).toContain(HEADHUNTER_U42);
  expect(starts).toEqual([HEADHUNTER_U40]);
  expect(state.stopCause).toBe("attacker_unreachable");
  expect(state.stopDetail).toMatchObject({ ref: HEADHUNTER_U40 });
});

test("stops when a later unreachable unit attacks although an earlier one does not", async () => {
  const starts: bigint[] = [];
  const attackers: bigint[] = [];
  const tactics = blockedTactics(starts, (guid) => {
    if (guid === 41n) attackers.push(guid);
    return guid === HEADHUNTER_U42 ? undefined : "target_unreachable";
  });
  const runtime = makeCycle({
    attackers: () => attackers,
    control: fakeControl(),
    loot: fakeLoot({}),
    now: () => 0,
    recovery: fakeRecovery({ life: ["alive"] }),
    tactics,
  });
  await runtime.start({
    guids: [HEADHUNTER_U40, 41n, HEADHUNTER_U42],
    instruction: "fight",
    maxStarts: 3,
  });
  const state = runtime.snapshot();
  expect(starts).toEqual([HEADHUNTER_U40, 41n]);
  expect(state.stopCause).toBe("attacker_unreachable");
  expect(state.stopDetail).toMatchObject({ ref: 41n });
});
