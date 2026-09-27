import { describe, expect, test } from "bun:test";
import type { CycleTargetRecord } from "@tuicraft/core";
import type { EngageAfter } from "#harness/contract/details";
import { engageSpec } from "#harness/tools/engage";
import {
  cycleEnds,
  field,
  KILL,
  LYNX,
  outcome,
  STALKER,
  STALKER_2,
  tactics,
} from "#test-support/engage-fixtures";
import { toolCtx } from "#test-support/ops-fixtures";

function blocked(guid: bigint, reason: string): CycleTargetRecord {
  return {
    cause: reason,
    guid,
    outcome: { reason, status: "blocked" },
    status: "skipped",
  };
}

describe("engage stop reasons", () => {
  test("a fight the helper blocked is REFUSED in plain words", async () => {
    const t = await field();
    tactics(t.handle, (runId) =>
      outcome(t.handle, runId, {
        reason: "no_supported_combat_actions",
        status: "blocked",
      }),
    );
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    const ref = t.rt.refs.refOf(STALKER);
    expect(res).toMatchObject({
      next: `travel(to: "${ref}"), then engage(target: "${ref}")`,
      reason: "no_supported_combat_actions",
      status: "REFUSED",
    });
    expect(res.detail).toBe(
      "Springpaw Stalker was not killed: no usable attack from here; move into melee range. You: HP 200/200, mana 100%.",
    );
  });

  test("a fight that failed stays FAILED lost in plain words", async () => {
    const t = await field();
    tactics(t.handle, (runId) =>
      outcome(t.handle, runId, { reason: "manual_override", status: "failed" }),
    );
    const res = await engageSpec.run(
      { target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({ reason: "lost", status: "FAILED" });
    expect(res.detail).toBe(
      "Springpaw Stalker was not killed: stopped by a manual command. You: HP 200/200, mana 100%.",
    );
  });

  test("a queue where every target was blocked is REFUSED per target", async () => {
    const t = await field();
    cycleEnds(
      t.handle,
      [
        blocked(STALKER, "target_dead_without_server_credit"),
        blocked(STALKER_2, "target_dead_without_server_credit"),
        blocked(LYNX, "target_unreachable"),
      ],
      "queue_exhausted",
    );
    const res = await engageSpec.run(
      { count: 3, target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    const [a, b, c] = [STALKER, STALKER_2, LYNX].map((guid) =>
      t.rt.refs.refOf(guid),
    );
    expect(res).toMatchObject({ reason: "queue_exhausted", status: "REFUSED" });
    expect(res.detail).toStartWith(
      `0 of 3 kills: ${a} and ${b} died; no XP to you (another player's tap or a gray target), ${c} could not be reached. You: HP`,
    );
  });

  test("a denied loot after kills keeps PARTLY and says what is left", async () => {
    const t = await field();
    cycleEnds(
      t.handle,
      [
        { guid: STALKER, loot: "looted", outcome: KILL, status: "done" },
        { guid: STALKER_2, loot: "none", outcome: KILL, status: "done" },
      ],
      "loot_denied:release_only",
    );
    const res = await engageSpec.run(
      { count: 3, target: "Springpaw Stalker" },
      toolCtx<EngageAfter>(t),
    );
    expect(res).toMatchObject({
      reason: "loot_denied:release_only",
      status: "PARTLY",
    });
    expect(res.detail).toMatch(
      /^2 of 3 kills \(u\d+, u\d+\)\. Stopped: the last corpse was out of loot range; 1 kill still needed\./,
    );
  });
});
