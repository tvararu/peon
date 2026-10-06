import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { guildSpec, guildTool } from "#harness/areas/guildadmin/tool";
import { guildParams } from "#harness/areas/guildadmin/tool-types";
import {
  contentOf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import type { MockHandle } from "#test-support/runtime-fixture";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { expectSendKind } from "#test-support/tool-harness";

const DESIGNER = 0xf1_30_00_00_00_00_00_07n;

function acts(handle: MockHandle) {
  const act = handle.guildadmin.act;
  return {
    addRank: jest.spyOn(act, "addRank"),
    disband: jest.spyOn(act, "disband"),
    eventLog: jest.spyOn(act, "eventLog"),
    info: jest.spyOn(act, "info"),
    openTabardVendor: jest.spyOn(act, "openTabardVendor"),
    permissions: jest.spyOn(act, "permissions"),
    removeLowestRank: jest.spyOn(act, "removeLowestRank"),
    saveEmblem: jest.spyOn(act, "saveEmblem"),
    setInfoText: jest.spyOn(act, "setInfoText"),
    setNote: jest.spyOn(act, "setNote"),
    setRank: jest.spyOn(act, "setRank"),
  };
}

async function world() {
  const t = await createTestRuntime({});
  return { ...t, acts: acts(t.handle) };
}

function designer(handle: MockHandle): void {
  setUnits(handle, [
    unitRow({
      distance: 3,
      guid: DESIGNER,
      name: "Andrew Matthews",
      relation: "friendly",
      roles: ["tabard_designer"],
      x: 3,
      y: 0,
    }),
  ]);
}

describe("guild tool", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: guildParams },
        {
          arguments: guildSpec.minimalArgs,
          id: "c1",
          name: "probe",
          type: "toolCall",
        },
      ),
    ).toEqual(guildSpec.minimalArgs);
  });

  test("expectSendKind passes for the action tool", async () => {
    await expectSendKind(guildTool, { do: "rank" });
  });

  test("rank add sends the name and reports the new rank", async () => {
    const t = await world();
    t.acts.addRank.mockResolvedValue({
      count: 6,
      name: "Raider",
      rank: 5,
      status: "updated",
    });
    const out = await guildSpec.run(
      { do: "rank", name: "Raider", step: "add" },
      toolCtx(t),
    );
    expect(t.acts.addRank).toHaveBeenCalledWith("Raider");
    expect(out.status).toBe("DONE");
    expect(contentOf(out)).toContain("rank 5");
  });

  test("rank add with a silent server is UNCONFIRMED", async () => {
    const t = await world();
    t.acts.addRank.mockResolvedValue({ status: "no_reply" });
    const out = await guildSpec.run(
      { do: "rank", name: "Raider", step: "add" },
      toolCtx(t),
    );
    expect(out.status).toBe("UNCONFIRMED");
    expect(out.reason).toBe("no_reply");
  });

  test("rank remove needs confirm and passes it on", async () => {
    const t = await world();
    t.acts.removeLowestRank.mockResolvedValue({ status: "removed", count: 5 });
    await guildSpec.run(
      { confirm: true, do: "rank", step: "remove" },
      toolCtx(t),
    );
    expect(t.acts.removeLowestRank).toHaveBeenCalledWith({ confirm: true });
  });

  test("rank rename keeps the rights of the known rank", async () => {
    const t = await world();
    const tabs = [{ flags: 1, slots: 2 }];
    jest.spyOn(t.handle, "requestGuildRoster").mockResolvedValue(undefined);
    jest.spyOn(t.handle.guildadmin, "state").mockReturnValue({
      disbanded: false,
      emblem: undefined,
      eventLog: undefined,
      info: undefined,
      permissions: undefined,
      roster: {
        info: "",
        members: [],
        motd: "",
        ranks: [{ goldPerDay: 5, rights: 0x1_cc, tabs }],
      },
    });
    t.acts.setRank.mockResolvedValue({
      count: 5,
      name: "Chief",
      rank: 0,
      status: "updated",
    });
    const out = await guildSpec.run(
      { do: "rank", name: "Chief", rank: 0, step: "rename" },
      toolCtx(t),
    );
    expect(t.acts.setRank).toHaveBeenCalledWith(0, {
      goldPerDay: 5,
      name: "Chief",
      rights: 0x1_cc,
      tabs,
    });
    expect(out.status).toBe("DONE");
  });

  test("rank rename of an unknown rank refuses before sending", async () => {
    const t = await world();
    jest.spyOn(t.handle, "requestGuildRoster").mockResolvedValue(undefined);
    await expect(
      guildSpec.run(
        { do: "rank", name: "X", rank: 9, step: "rename" },
        toolCtx(t),
      ),
    ).rejects.toMatchObject({ reason: "no_such_rank" });
    expect(t.acts.setRank).not.toHaveBeenCalled();
  });

  test("note and officer_note pick the officer flag", async () => {
    const t = await world();
    t.acts.setNote.mockResolvedValue({ status: "set" });
    await guildSpec.run({ do: "note", name: "Peon", text: "tank" }, toolCtx(t));
    await guildSpec.run(
      { do: "officer_note", name: "Peon", text: "x" },
      toolCtx(t),
    );
    expect(t.acts.setNote).toHaveBeenNthCalledWith(1, "Peon", "tank", {
      officer: false,
    });
    expect(t.acts.setNote).toHaveBeenNthCalledWith(2, "Peon", "x", {
      officer: true,
    });
  });

  test("a denied note reports no_right", async () => {
    const t = await world();
    t.acts.setNote.mockResolvedValue({ result: 8, status: "denied" });
    const out = await guildSpec.run(
      { do: "note", name: "Peon", text: "x" },
      toolCtx(t),
    );
    expect(out.status).toBe("REFUSED");
    expect(out.reason).toBe("no_right");
  });

  test("info_text sets, and a rejected text reports the kept one", async () => {
    const t = await world();
    t.acts.setInfoText.mockResolvedValueOnce({ status: "set" });
    expect(
      (await guildSpec.run({ do: "info_text", text: "hi" }, toolCtx(t))).status,
    ).toBe("DONE");
    t.acts.setInfoText.mockResolvedValueOnce({
      current: "old",
      status: "rejected",
    });
    expect(
      (await guildSpec.run({ do: "info_text", text: "hi" }, toolCtx(t))).reason,
    ).toBe("no_right");
  });

  test("permissions and log print their rows", async () => {
    const t = await world();
    t.acts.permissions.mockResolvedValue({
      permissions: {
        goldPerDay: -1,
        rank: 0,
        rights: 0xf_ff_ff,
        tabCount: 0,
        tabs: [],
      },
      status: "ok",
    });
    t.acts.eventLog.mockResolvedValue({
      entries: [
        { other: 2n, player: 1n, rank: undefined, secondsAgo: 4, type: 1 },
      ],
      status: "ok",
    });
    expect(
      contentOf(await guildSpec.run({ do: "permissions" }, toolCtx(t))),
    ).toContain("rank 0");
    expect(contentOf(await guildSpec.run({ do: "log" }, toolCtx(t)))).toContain(
      "invited",
    );
  });

  test("disband without confirm refuses", async () => {
    const t = await world();
    t.acts.disband.mockResolvedValue({ status: "refused" });
    await expect(
      guildSpec.run({ do: "disband" }, toolCtx(t)),
    ).rejects.toMatchObject({
      reason: "needs_confirm",
    });
  });

  test("tabard opens the nearest designer", async () => {
    const t = await world();
    designer(t.handle);
    t.acts.openTabardVendor.mockResolvedValue({
      npc: DESIGNER,
      status: "opened",
    });
    const out = await guildSpec.run({ do: "tabard" }, toolCtx(t));
    expect(t.acts.openTabardVendor).toHaveBeenCalledWith(DESIGNER);
    expect(out.status).toBe("DONE");
  });

  test("tabard with no designer refuses", async () => {
    const t = await world();
    setUnits(t.handle, []);
    await expect(
      guildSpec.run({ do: "tabard" }, toolCtx(t)),
    ).rejects.toMatchObject({
      reason: "no_designer",
    });
  });

  test("emblem needs confirm and every field, then reports the failure code", async () => {
    const t = await world();
    designer(t.handle);
    const full = {
      background: 5,
      border_color: 4,
      border_style: 3,
      color: 2,
      do: "emblem",
      style: 1,
    } as const;
    await expect(
      guildSpec.run({ ...full, confirm: false }, toolCtx(t)),
    ).rejects.toMatchObject({
      reason: "needs_confirm",
    });
    await expect(
      guildSpec.run({ do: "emblem", confirm: true }, toolCtx(t)),
    ).rejects.toMatchObject({
      reason: "missing_arg",
    });
    t.acts.saveEmblem.mockResolvedValue({ code: 2, status: "failed" });
    const out = await guildSpec.run({ ...full, confirm: true }, toolCtx(t));
    expect(t.acts.saveEmblem).toHaveBeenCalledWith(DESIGNER, {
      backgroundColor: 5,
      borderColor: 4,
      borderStyle: 3,
      color: 2,
      style: 1,
    });
    expect(out.reason).toBe("emblem_2");
  });
});
