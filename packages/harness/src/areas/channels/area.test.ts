import { describe, expect, test } from "bun:test";
import type { AreaEvent } from "@peon/core";
import { areaDrafts, areaRuleSet } from "#harness/areas/rules";
import { testRuleInput } from "#test-support/rule-fixtures";

function draftsOf(event: unknown) {
  return areaDrafts(
    areaRuleSet(),
    { area: "channels", event } as unknown as AreaEvent,
    testRuleInput(),
  );
}

describe("channels harness rules", () => {
  test("a kick notice gives one log channels/kicked row", () => {
    const rows = draftsOf({
      notice: {
        actor: 0xde1n,
        channel: "peonab12cd",
        target: 0xab2n,
        type: "player_kicked",
      },
      type: "channel_notice",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "log",
      domain: "channels",
      event: "channels/kicked",
    });
    expect(rows[0]?.text).toContain("peonab12cd");
  });

  test("a ban notice gives one log channels/banned row", () => {
    const rows = draftsOf({
      notice: {
        actor: 0xde1n,
        channel: "peonab12cd",
        target: 0xab2n,
        type: "player_banned",
      },
      type: "channel_notice",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: "channels/banned" });
  });

  test("an invite notice gives one wake channels/invited row", () => {
    const rows = draftsOf({
      notice: { channel: "peonab12cd", inviter: 0xab2n, type: "invite" },
      type: "channel_notice",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      class: "wake",
      event: "channels/invited",
    });
  });

  test("a userlist add gives one log channels/userlist_joined row", () => {
    const rows = draftsOf({
      change: "add",
      channel: "peonab12cd",
      count: 2,
      flags: 3,
      guid: 0xab2n,
      memberFlags: 0,
      type: "channel_userlist",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: "channels/userlist_joined" });
  });

  test("a members event gives one log channels/listed row with the count", () => {
    const rows = draftsOf({
      channel: "peonab12cd",
      count: 2,
      flags: 3,
      members: [],
      type: "channel_members",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event: "channels/listed" });
    expect(rows[0]?.data).toMatchObject({ count: 2 });
  });

  test("an unruled notice gives no row", () => {
    const rows = draftsOf({
      notice: { channel: "peonab12cd", type: "muted" },
      type: "channel_notice",
    });
    expect(rows).toHaveLength(0);
  });
});
