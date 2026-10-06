import { describe, expect, jest, test } from "bun:test";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import {
  attempt,
  NOW,
  queueAvailable,
  world,
} from "#harness/areas/instances/tool-lfg-fixture";
import { setSelf } from "#test-support/ops-fixtures";

describe("dungeon lfg verbs", () => {
  test("leave_queue calls leave once", async () => {
    const t = await world({ lfg: { ...queueAvailable(), status: "queued" } });
    const leave = jest
      .spyOn(t.handle.lfg.act, "leave")
      .mockResolvedValue({ status: "ok" });
    const { settled } = await attempt(t, { do: "leave_queue" });
    expect(leave).toHaveBeenCalledTimes(1);
    expect(settled).toMatchObject({ status: "DONE" });
  });

  test.each([
    { accept: true, label: "accepted" },
    { accept: false, label: "declined" },
  ])(
    "answer with accept $accept answers the proposal",
    async ({ accept, label }) => {
      const t = await world();
      const answer = jest
        .spyOn(t.handle.lfg.act, "answerProposal")
        .mockResolvedValue({ state: 1, status: "ok" });
      const { settled, text } = await attempt(t, { accept, do: "answer" });
      expect(answer).toHaveBeenCalledWith(accept);
      expect(settled).toMatchObject({ status: "DONE" });
      expect(text.toLowerCase()).toContain(label);
    },
  );

  test("answer without a proposal is a refusal", async () => {
    const t = await world();
    jest
      .spyOn(t.handle.lfg.act, "answerProposal")
      .mockResolvedValue({ reason: "no_proposal", status: "refused" });
    const { settled } = await attempt(t, { accept: false, do: "answer" });
    expect(settled).toMatchObject({ reason: "no_proposal", status: "REFUSED" });
  });

  test("roles answers the role check", async () => {
    const t = await world();
    const setRoles = jest
      .spyOn(t.handle.lfg.act, "setRoles")
      .mockResolvedValue({ roles: 2, status: "ok" });
    const { settled, text } = await attempt(t, {
      do: "roles",
      roles: ["tank"],
    });
    expect(setRoles).toHaveBeenCalledWith(2);
    expect(settled).toMatchObject({ status: "DONE" });
    expect(text.toLowerCase()).toContain("tank");
  });

  test("roles of one word reads playably in the result", async () => {
    const t = await world();
    jest
      .spyOn(t.handle.lfg.act, "setRoles")
      .mockResolvedValue({ roles: 4, status: "ok" });
    const { settled } = await attempt(t, {
      do: "roles",
      roles: ["healer"],
    });
    expect(settled.detail.toLowerCase()).toContain("healer");
  });

  test("teleport out calls teleport with out true", async () => {
    const t = await world();
    const teleport = jest
      .spyOn(t.handle.lfg.act, "teleport")
      .mockResolvedValue({ status: "ok" });
    const { settled, text } = await attempt(t, { do: "teleport", to: "out" });
    expect(teleport).toHaveBeenCalledWith(true, undefined);
    expect(settled).toMatchObject({ status: "DONE" });
    expect(text.toLowerCase()).toContain("out of");
  });

  test("teleport refuses while dead", async () => {
    const t = await world();
    setSelf(t.handle, { life: "dead" });
    const teleport = jest.spyOn(t.handle.lfg.act, "teleport");
    const { settled } = await attempt(t, { do: "teleport", to: "in" });
    expect(teleport).not.toHaveBeenCalled();
    expect(settled).toMatchObject({ reason: "dead", status: "REFUSED" });
  });

  test.each([
    { accept: true, label: "to kick" },
    { accept: false, label: "against" },
  ])(
    "kick_vote with accept $accept calls voteKick once",
    async ({ accept, label }) => {
      const t = await world();
      const vote = jest
        .spyOn(t.handle.lfg.act, "voteKick")
        .mockResolvedValue({ status: "ok" });
      const { settled, text } = await attempt(t, { accept, do: "kick_vote" });
      expect(vote).toHaveBeenCalledWith(accept);
      expect(vote).toHaveBeenCalledTimes(1);
      expect(settled).toMatchObject({ status: "DONE" });
      expect(text.toLowerCase()).toContain(label);
    },
  );

  test("the tool answers neither a bind prompt nor a kick vote by itself", async () => {
    const t = await world({ lfg: queueAvailable() });
    jest.spyOn(t.handle.lfg.act, "join").mockResolvedValue({
      queued: [0x06_00_00_0c],
      roleCheck: false,
      status: "ok",
    });
    const bind = jest.spyOn(t.handle.instances.act, "answerBind");
    const vote = jest.spyOn(t.handle.lfg.act, "voteKick");
    await attempt(t, { do: "queue", roles: ["damage"] });
    t.handle.triggerAreaEvent("instances", {
      deadline: NOW + 60_000,
      encounterMask: 0,
      timeoutMs: 60_000,
      type: "bind_offer",
    });
    t.handle.triggerAreaEvent("lfg", {
      agrees: 0,
      deadline: NOW + 60_000,
      inProgress: true,
      needed: 3,
      type: "boot_vote",
      victim: 0xabn,
      votes: 1,
    });
    await withFakeTimers(() => elapse(0));
    expect(bind).not.toHaveBeenCalled();
    expect(vote).not.toHaveBeenCalled();
  });

  test("a group member queue hits the join's not_leader refusal", async () => {
    const t = await world({ lfg: queueAvailable() });
    const join = jest
      .spyOn(t.handle.lfg.act, "join")
      .mockResolvedValue({ reason: "not_leader", status: "refused" });
    const { settled } = await attempt(t, {
      do: "queue",
      roles: ["damage"],
    });
    expect(join).toHaveBeenCalledTimes(1);
    expect(settled).toMatchObject({ reason: "not_leader", status: "REFUSED" });
  });
});
