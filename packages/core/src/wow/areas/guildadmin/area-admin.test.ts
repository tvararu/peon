import { describe, expect, jest, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  guildadminCommandResultBody,
  guildadminEventBody,
  guildadminEventLogBody,
  guildadminPermissionsBody,
  guildadminQueryResponseBody,
  guildadminRosterBody,
  guildadminSaveEmblemResultBody,
  guildadminTabardVendorBody,
} from "#test-support/areas/guildadmin";
import { GuildMemberStatus } from "#wow/protocol/guild";
import { GameOpcode } from "#wow/protocol/opcodes";

const TAB = { flags: 0, slots: 0 };
const RANK = {
  rights: 0x1_cc,
  goldPerDay: 0,
  tabs: [TAB, TAB, TAB, TAB, TAB, TAB],
};

function member(name: string, publicNote: string, officerNote: string) {
  return {
    guid: 1n,
    status: GuildMemberStatus.ONLINE,
    name,
    rankIndex: 0,
    level: 80,
    playerClass: 1,
    gender: 0,
    area: 4395,
    timeOffline: 0,
    publicNote,
    officerNote,
  };
}

function rosterBody(info: string, ranks: number, publicNote = "") {
  return guildadminRosterBody({
    motd: "",
    info,
    ranks: Array.from({ length: ranks }, () => RANK),
    members: [member("Peon", publicNote, "")],
  });
}

describe("guildadmin admin area", () => {
  test("an injected MSG_GUILD_PERMISSIONS sets permissions, emits and resolves act.permissions", async () => {
    const rig = areaRig("guildadmin");
    try {
      const pending = rig.handle.act.permissions();
      expect(rig.sent).toEqual([
        { opcode: GameOpcode.MSG_GUILD_PERMISSIONS, body: new Uint8Array() },
      ]);
      rig.inject(
        GameOpcode.MSG_GUILD_PERMISSIONS,
        guildadminPermissionsBody({
          rank: 0,
          rights: 0xf_ff_ff,
          goldPerDay: -1,
          tabCount: 0,
          tabs: [],
        }),
      );
      const result = await pending;
      expect(result.status).toBe("ok");
      expect(rig.handle.state().permissions?.rights).toBe(0xf_ff_ff);
    } finally {
      rig.dispose();
    }
  });

  test("an injected MSG_GUILD_EVENT_LOG_QUERY sets eventLog and resolves act.eventLog", async () => {
    const rig = areaRig("guildadmin");
    try {
      const pending = rig.handle.act.eventLog();
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.MSG_GUILD_EVENT_LOG_QUERY);
      rig.inject(
        GameOpcode.MSG_GUILD_EVENT_LOG_QUERY,
        guildadminEventLogBody([{ type: 2, player: 7n, secondsAgo: 3 }]),
      );
      expect(await pending).toEqual({
        status: "ok",
        entries: [
          {
            type: 2,
            player: 7n,
            other: undefined,
            rank: undefined,
            secondsAgo: 3,
          },
        ],
      });
      expect(rig.handle.state().eventLog).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("a peeked roster stores ranks and notes", () => {
    const rig = areaRig("guildadmin");
    try {
      rig.inject(GameOpcode.SMSG_GUILD_ROSTER, rosterBody("text", 5, "tank"));
      const roster = rig.handle.state().roster;
      expect(roster?.ranks).toHaveLength(5);
      expect(roster?.members[0]?.publicNote).toBe("tank");
      expect(roster?.info).toBe("text");
    } finally {
      rig.dispose();
    }
  });

  test("a peeked query response stores the emblem", () => {
    const rig = areaRig("guildadmin");
    try {
      const emblem = {
        style: 1,
        color: 2,
        borderStyle: 3,
        borderColor: 4,
        backgroundColor: 5,
      };
      rig.inject(
        GameOpcode.SMSG_GUILD_QUERY_RESPONSE,
        guildadminQueryResponseBody({
          id: 1,
          name: "FacX",
          rankNames: [],
          emblem,
          rankCount: 5,
        }),
      );
      expect(rig.handle.state().emblem).toEqual(emblem);
    } finally {
      rig.dispose();
    }
  });

  test("act.addRank sends the name and resolves on GE_RANK_UPDATED", async () => {
    const rig = areaRig("guildadmin");
    try {
      const pending = rig.handle.act.addRank("Raider");
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_GUILD_ADD_RANK);
      rig.inject(
        GameOpcode.SMSG_GUILD_EVENT,
        guildadminEventBody({ code: 10, params: ["5", "Raider", "6"] }),
      );
      expect(await pending).toEqual({
        status: "updated",
        rank: 5,
        name: "Raider",
        count: 6,
      });
    } finally {
      rig.dispose();
    }
  });

  test("act.addRank refuses a long name and a full guild before sending", async () => {
    const rig = areaRig("guildadmin");
    try {
      expect((await rig.handle.act.addRank("x".repeat(16))).status).toBe(
        "refused",
      );
      rig.inject(GameOpcode.SMSG_GUILD_ROSTER, rosterBody("", 10));
      expect((await rig.handle.act.addRank("Ok")).status).toBe("refused");
      expect(rig.sent).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("act.setRank resolves on the matching GE_RANK_UPDATED and denies on a command error", async () => {
    const rig = areaRig("guildadmin");
    try {
      const spec = { name: "Vet", rights: 0x40, goldPerDay: 0, tabs: [] };
      const ok = rig.handle.act.setRank(5, spec);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_GUILD_RANK);
      rig.inject(
        GameOpcode.SMSG_GUILD_EVENT,
        guildadminEventBody({ code: 10, params: ["5", "Vet", "6"] }),
      );
      expect((await ok).status).toBe("updated");
      const denied = rig.handle.act.setRank(5, spec);
      rig.inject(
        GameOpcode.SMSG_GUILD_COMMAND_RESULT,
        guildadminCommandResultBody({ command: 16, name: "", result: 8 }),
      );
      expect(await denied).toEqual({ status: "denied", result: 8 });
    } finally {
      rig.dispose();
    }
  });

  test("act.removeLowestRank refuses without confirm, at 5 ranks, and resolves on GE_RANK_DELETED", async () => {
    const rig = areaRig("guildadmin");
    try {
      expect(
        (await rig.handle.act.removeLowestRank({ confirm: false })).status,
      ).toBe("refused");
      rig.inject(GameOpcode.SMSG_GUILD_ROSTER, rosterBody("", 5));
      expect(
        (await rig.handle.act.removeLowestRank({ confirm: true })).status,
      ).toBe("refused");
      expect(rig.sent).toEqual([]);
      rig.inject(GameOpcode.SMSG_GUILD_ROSTER, rosterBody("", 6));
      const pending = rig.handle.act.removeLowestRank({ confirm: true });
      expect(rig.sent[0]).toEqual({
        opcode: GameOpcode.CMSG_GUILD_DEL_RANK,
        body: new Uint8Array(),
      });
      rig.inject(
        GameOpcode.SMSG_GUILD_EVENT,
        guildadminEventBody({ code: 11, params: ["5"] }),
      );
      expect(await pending).toEqual({ status: "removed", count: 5 });
    } finally {
      rig.dispose();
    }
  });

  test("act.setNote sends the right opcode, resolves on the roster, refuses a long note", async () => {
    const rig = areaRig("guildadmin");
    try {
      expect(
        (
          await rig.handle.act.setNote("Peon", "x".repeat(32), {
            officer: false,
          })
        ).status,
      ).toBe("refused");
      expect(rig.sent).toEqual([]);
      const pub = rig.handle.act.setNote("Peon", "tank", { officer: false });
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.CMSG_GUILD_SET_PUBLIC_NOTE);
      rig.inject(GameOpcode.SMSG_GUILD_ROSTER, rosterBody("", 5, "tank"));
      expect(await pub).toEqual({ status: "set" });
      const off = rig.handle.act.setNote("Peon", "x", { officer: true });
      expect(rig.sent[1]?.opcode).toBe(GameOpcode.CMSG_GUILD_SET_OFFICER_NOTE);
      rig.inject(
        GameOpcode.SMSG_GUILD_COMMAND_RESULT,
        guildadminCommandResultBody({ command: 19, name: "", result: 8 }),
      );
      expect(await off).toEqual({ status: "denied", result: 8 });
    } finally {
      rig.dispose();
    }
  });

  test("act.setInfoText sends the text then a roster request and compares the info", async () => {
    const rig = areaRig("guildadmin");
    try {
      const ok = rig.handle.act.setInfoText("hello");
      expect(rig.sent.map((p) => p.opcode)).toEqual([
        GameOpcode.CMSG_GUILD_INFO_TEXT,
        GameOpcode.CMSG_GUILD_ROSTER,
      ]);
      rig.inject(GameOpcode.SMSG_GUILD_ROSTER, rosterBody("hello", 5));
      expect(await ok).toEqual({ status: "set" });
      const bad = rig.handle.act.setInfoText("other");
      rig.inject(GameOpcode.SMSG_GUILD_ROSTER, rosterBody("hello", 5));
      expect(await bad).toEqual({ status: "rejected", current: "hello" });
      expect((await rig.handle.act.setInfoText("x".repeat(501))).status).toBe(
        "refused",
      );
    } finally {
      rig.dispose();
    }
  });

  test("act.saveEmblem resolves on the result code", async () => {
    const rig = areaRig("guildadmin");
    try {
      const emblem = {
        style: 1,
        color: 2,
        borderStyle: 3,
        borderColor: 4,
        backgroundColor: 5,
      };
      const ok = rig.handle.act.saveEmblem(0x10n, emblem);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.MSG_SAVE_GUILD_EMBLEM);
      rig.inject(
        GameOpcode.MSG_SAVE_GUILD_EMBLEM,
        guildadminSaveEmblemResultBody(0),
      );
      expect(await ok).toEqual({ status: "saved" });
      const bad = rig.handle.act.saveEmblem(0x10n, emblem);
      rig.inject(
        GameOpcode.MSG_SAVE_GUILD_EMBLEM,
        guildadminSaveEmblemResultBody(2),
      );
      expect(await bad).toEqual({ status: "failed", code: 2 });
    } finally {
      rig.dispose();
    }
  });

  test("act.openTabardVendor resolves on the echoed guid", async () => {
    const rig = areaRig("guildadmin");
    try {
      const pending = rig.handle.act.openTabardVendor(0x10n);
      expect(rig.sent[0]?.opcode).toBe(GameOpcode.MSG_TABARDVENDOR_ACTIVATE);
      rig.inject(
        GameOpcode.MSG_TABARDVENDOR_ACTIVATE,
        guildadminTabardVendorBody(0x10n),
      );
      expect(await pending).toEqual({ status: "opened", npc: 0x10n });
    } finally {
      rig.dispose();
    }
  });

  test("silent admin acts settle no_reply after 5 s", async () => {
    jest.useFakeTimers();
    const rig = areaRig("guildadmin");
    try {
      const pending = rig.handle.act.openTabardVendor(0x10n);
      jest.advanceTimersByTime(5000);
      expect(await pending).toEqual({ status: "no_reply" });
    } finally {
      jest.useRealTimers();
      rig.dispose();
    }
  });
});
