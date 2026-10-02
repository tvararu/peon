import { describe, expect, spyOn, test } from "bun:test";
import type { WorldHandle } from "@peon/core";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import {
  type FlowContext,
  type Settle,
  settleWithin,
} from "#tools/probe-flows";
import { flow } from "#tools/probe-flows/contacts-notes";

const TOM = 0x99n;

function context(args: Record<string, string>): FlowContext {
  const handle = createMockHandle();
  handle.getFriends = (() => [
    {
      area: 10,
      guid: TOM,
      level: 80,
      name: "Tom",
      note: "peon",
      playerClass: 1,
      status: 1,
    },
  ]) as WorldHandle["getFriends"];
  handle.getIgnored = (() => []) as WorldHandle["getIgnored"];
  const settle: Settle = (read) => Promise.resolve(read());
  void settleWithin;
  return { args, handle, settle };
}

describe("contacts-notes flow", () => {
  test("adds the friend, sets the note, reads the list and reports counts", async () => {
    const ctx = context({ friend: "Tom", linger: "0" });
    const note = spyOn(
      ctx.handle.contacts.act,
      "setFriendNote",
    ).mockImplementation(async () => ({ ok: true }));
    const list = spyOn(
      ctx.handle.contacts.act,
      "requestContacts",
    ).mockImplementation(async () => ({ ok: true }));
    const result = (await flow.run(ctx)) as Record<string, unknown>;
    expect(ctx.handle.addFriend).toHaveBeenCalledWith("Tom");
    expect(note).toHaveBeenCalledWith("Tom", "peon");
    expect(list).toHaveBeenCalledWith(1);
    expect(ctx.handle.addIgnore).toHaveBeenCalledWith("Tom");
    expect(result["note"]).toBe("peon");
    expect(result["ignoreBefore"]).toBe(0);
  });

  test("needs the friend argument", async () => {
    const ctx = context({});
    await expect(flow.run(ctx)).rejects.toThrow("friend");
  });
});
