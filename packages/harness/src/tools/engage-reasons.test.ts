import { describe, expect, test } from "bun:test";
import type { EngageTarget } from "#harness/contract/details";
import {
  failText,
  noXpText,
  plainReason,
  skippedText,
  stopText,
} from "#harness/tools/engage-reasons";

function target(ref: string, reason: string): EngageTarget {
  return {
    durationMs: undefined,
    name: "Springpaw Stalker",
    outcome: "skipped",
    reason,
    ref,
    xp: undefined,
  };
}

const t7 = [
  target("u20", "target_dead_without_server_credit"),
  target("u26", "target_dead_without_server_credit"),
  target("u25", "target_unreachable"),
];

describe("plainReason", () => {
  test.each([
    ["loot_denied:release_only", "the last corpse was out of loot range"],
    ["loot_denied:timeout", "the last corpse did not open for looting"],
    [
      "loot_denied:loot_source_unavailable",
      "the last corpse despawned or left view",
    ],
    [
      "no_supported_combat_actions",
      "no usable attack from here; move into melee range",
    ],
    [
      "target_dead_without_server_credit",
      "died; no XP to you (another player's tap or a gray target)",
    ],
    ["target_dead_tapped_by_other", "killed by another player"],
    ["target_unreachable", "could not be reached"],
    ["server_action_rejected:line_of_sight", "out of line of sight"],
    ["manual_override", "stopped by a manual command"],
    ["max_starts_reached", "the fight limit for one call was reached"],
    ["queue_exhausted", "no more targets in view"],
    ["loot_denied:3", "the corpse could not be looted"],
    ["obstructed", "the way there was blocked"],
    ["died", "you died"],
  ])("%s", (code, words) => {
    expect(plainReason(code)).toBe(words);
  });

  test("an unknown code stays as it is", () => {
    expect(plainReason("odd_code")).toBe("odd_code");
  });
});

describe("skippedText", () => {
  test("groups the targets that were not killed by reason", () => {
    expect(skippedText(t7)).toBe(
      "u20 and u26 died; no XP to you (another player's tap or a gray target), u25 could not be reached",
    );
  });

  test("leaves out the kills", () => {
    expect(
      skippedText([
        { ...target("u9", "server_kill_credit"), outcome: "killed" },
        target("u10", "target_unreachable"),
      ]),
    ).toBe("u10 could not be reached");
  });

  test("names the recheck skips in plain words", () => {
    expect(
      skippedText([
        target("u26", "engaged_by_other"),
        target("u25", "tapped_by_other"),
        target("u24", "target_dead"),
      ]),
    ).toBe(
      "u26 fighting another player, u25 tapped by another player, u24 already dead",
    );
  });
});

describe("stopText", () => {
  test("a denied loot says how many kills are still needed", () => {
    expect(
      stopText({
        kills: 5,
        name: "Mana Wyrm",
        targets: [],
        wanted: 8,
        why: "loot_denied:release_only",
      }),
    ).toBe("the last corpse was out of loot range; 3 kills still needed");
  });

  test("an empty queue names what happened to each target", () => {
    expect(
      stopText({
        kills: 2,
        name: "Springpaw Stalker",
        targets: [target("u25", "target_unreachable")],
        wanted: 3,
        why: "queue_exhausted",
      }),
    ).toBe("u25 could not be reached; 1 kill still needed");
  });

  test("an empty queue with nothing skipped says none are left in view", () => {
    const text = stopText({
      kills: 2,
      name: "Springpaw Stalker",
      targets: [],
      wanted: 3,
      why: "queue_exhausted",
    });
    expect(text).toContain("no more Springpaw Stalker in view");
    expect(text).toContain("1 kill still needed");
  });
});

describe("failText", () => {
  test("a queue with no kills gives the outcome of each target", () => {
    expect(
      failText({
        kills: 0,
        name: "Springpaw Stalker",
        targets: t7,
        wanted: 3,
        why: "queue_exhausted",
      }),
    ).toBe(
      "0 of 3 kills: u20 and u26 died; no XP to you (another player's tap or a gray target), u25 could not be reached.",
    );
  });

  test("an empty queue with nothing skipped says none are left in view", () => {
    expect(
      failText({
        kills: 0,
        name: "Springpaw Stalker",
        targets: [],
        wanted: 2,
        why: "queue_exhausted",
      }),
    ).toBe(
      "Springpaw Stalker was not killed: no more Springpaw Stalker in view.",
    );
  });

  test("one target says why it was not killed", () => {
    expect(
      failText({
        kills: 0,
        name: "Springpaw Stalker",
        targets: [],
        wanted: 1,
        why: "no_supported_combat_actions",
      }),
    ).toBe(
      "Springpaw Stalker was not killed: no usable attack from here; move into melee range.",
    );
  });

  test("a death without credit names no other player", () => {
    expect(
      failText({
        kills: 0,
        name: "Risen Hungerer",
        targets: [],
        wanted: 1,
        why: "target_dead_without_server_credit",
      }),
    ).toBe(
      "Risen Hungerer died; no XP to you (another player's tap or a gray target).",
    );
  });
});

describe("noXpText", () => {
  test("names a gray kill", () => {
    expect(
      noXpText([{ ...target("u33", "gray"), outcome: "killed", xp: 0 }]),
    ).toBe("gray target");
  });

  test("names a tapped kill without XP", () => {
    expect(
      noXpText([
        { ...target("u33", "gray"), outcome: "killed", xp: 0 },
        { ...target("u34", "no_xp_kill"), outcome: "killed", xp: 0 },
      ]),
    ).toBe("gray target or no kill XP from the server");
  });
});
