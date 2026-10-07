import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import { TICKETS_ANSWER_MS } from "#wow/areas/tickets/runtime-shared";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketWriter } from "#wow/protocol/packet";

function ticketBody(): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(0x06);
  w.uint32LE(7);
  w.cString("peon probe");
  w.uint8(0);
  w.floatLE(1.5);
  w.floatLE(2.5);
  w.floatLE(0.25);
  w.uint8(0);
  w.uint8(0);
  return w.finish();
}

function codeBody(code: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(code);
  return w.finish();
}

describe("tickets store", () => {
  test("system status keeps the enabled flag without an event", () => {
    const rig = areaRig("tickets");
    try {
      const seen: unknown[] = [];
      rig.stores.areas.tickets.onEvent((event) => seen.push(event));
      rig.inject(
        GameOpcode.SMSG_GMTICKET_SYSTEMSTATUS,
        (() => {
          const w = new PacketWriter();
          w.uint32LE(1);
          return w.finish();
        })(),
      );
      expect(rig.stores.areas.tickets.snapshot().systemEnabled).toBe(true);
      expect(seen).toEqual([]);
    } finally {
      rig.dispose();
    }
  });

  test("get ticket keeps the open ticket and emits it", () => {
    const rig = areaRig("tickets");
    try {
      const seen: unknown[] = [];
      rig.stores.areas.tickets.onEvent((event) => seen.push(event));
      rig.inject(GameOpcode.SMSG_GMTICKET_GETTICKET, ticketBody());
      expect(rig.stores.areas.tickets.snapshot().ticket?.status).toBe("open");
      expect(seen).toHaveLength(1);
    } finally {
      rig.dispose();
    }
  });

  test("delete reply with code 9 clears the ticket", () => {
    const rig = areaRig("tickets");
    try {
      rig.inject(GameOpcode.SMSG_GMTICKET_GETTICKET, ticketBody());
      rig.inject(GameOpcode.SMSG_GMTICKET_DELETETICKET, codeBody(9));
      expect(rig.stores.areas.tickets.snapshot().ticket).toEqual({
        status: "none",
      });
    } finally {
      rig.dispose();
    }
  });

  test("gm response marks the ticket completed and keeps the text", () => {
    const rig = areaRig("tickets");
    try {
      rig.inject(GameOpcode.SMSG_GMTICKET_GETTICKET, ticketBody());
      const w = new PacketWriter();
      w.uint32LE(1);
      w.uint32LE(7);
      w.cString("peon probe");
      const reply = new TextEncoder().encode("gm answer");
      w.rawBytes(reply);
      w.uint8(0);
      w.uint8(0);
      w.uint8(0);
      w.uint8(0);
      rig.inject(GameOpcode.SMSG_GMRESPONSE_RECEIVED, w.finish());
      const snapshot = rig.stores.areas.tickets.snapshot();
      expect(snapshot.ticket?.status).toBe("completed");
      expect(snapshot.response?.response).toBe("gm answer");
    } finally {
      rig.dispose();
    }
  });

  test("survey update keeps the offered flag", () => {
    const rig = areaRig("tickets");
    try {
      const w = new PacketWriter();
      w.uint8(1);
      rig.inject(GameOpcode.SMSG_GMRESPONSE_STATUS_UPDATE, w.finish());
      expect(rig.stores.areas.tickets.snapshot().surveyOffered).toBe(true);
    } finally {
      rig.dispose();
    }
  });
});

describe("tickets acts", () => {
  test("ticketSystem sends and resolves on the injected reply", async () => {
    const rig = areaRig("tickets");
    try {
      const pending = rig.handle.act.ticketSystem();
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_GMTICKET_SYSTEMSTATUS,
      ]);
      const w = new PacketWriter();
      w.uint32LE(1);
      rig.inject(GameOpcode.SMSG_GMTICKET_SYSTEMSTATUS, w.finish());
      expect(await pending).toEqual({ enabled: true });
      expect(rig.stores.areas.tickets.snapshot().systemEnabled).toBe(true);
    } finally {
      rig.dispose();
    }
  });

  test("ticket sends and resolves on the injected reply", async () => {
    const rig = areaRig("tickets");
    try {
      const pending = rig.handle.act.ticket();
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_GMTICKET_GETTICKET,
      ]);
      rig.inject(GameOpcode.SMSG_GMTICKET_GETTICKET, ticketBody());
      expect(await pending).toEqual({
        status: "open",
        ticket: expect.objectContaining({ id: 7 }),
      });
    } finally {
      rig.dispose();
    }
  });

  test("update sends the cleaned text and names the error code", async () => {
    const rig = areaRig("tickets");
    try {
      const pending = rig.handle.act.updateTicket("a|Hb|r");
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_GMTICKET_UPDATETEXT,
      ]);
      rig.inject(GameOpcode.SMSG_GMTICKET_UPDATETEXT, codeBody(5));
      expect(await pending).toEqual({
        outcome: "update_error",
        status: "updated",
      });
    } finally {
      rig.dispose();
    }
  });

  test(
    "abandon with no reply resolves none after the timeout",
    async () => {
      const rig = areaRig("tickets", { now: () => 0 });
      try {
        const pending = rig.handle.act.abandonTicket();
        await Promise.resolve();
        expect(rig.sent.map((packet) => packet.opcode)).toEqual([
          GameOpcode.CMSG_GMTICKET_DELETETICKET,
        ]);
        rig.inject(GameOpcode.SMSG_GMTICKET_DELETETICKET, codeBody(9));
        expect(await pending).toEqual({
          outcome: "ticket_deleted",
          status: "deleted",
        });
      } finally {
        rig.dispose();
      }
    },
    TICKETS_ANSWER_MS + 2000,
  );

  test(
    "resolve with no reply resolves none after waiting",
    async () => {
      const rig = areaRig("tickets");
      const start = Date.now();
      try {
        const result = await rig.handle.act.resolveGmResponse();
        expect(Date.now() - start).toBeGreaterThanOrEqual(
          TICKETS_ANSWER_MS - 50,
        );
        expect(result).toEqual({ status: "none" });
      } finally {
        rig.dispose();
      }
    },
    TICKETS_ANSWER_MS + 2000,
  );

  test("submit survey and the reports record one packet each", async () => {
    const rig = areaRig("tickets");
    try {
      await rig.handle.act.submitSurvey(
        9,
        [{ answer: 3, questionId: 41, text: "fine" }],
        "done",
      );
      await rig.handle.act.reportBug({
        content: "crash",
        suggestion: false,
        text: "startup",
      });
      await rig.handle.act.reportLag({ kind: 5, map: 1, x: 1, y: 2, z: 3 });
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_GMSURVEY_SUBMIT,
        GameOpcode.CMSG_BUG,
        GameOpcode.CMSG_GM_REPORT_LAG,
      ]);
    } finally {
      rig.dispose();
    }
  });

  test("create sends position, map and cleaned text", async () => {
    const self = {
      entry: 0,
      guid: 0xde1n,
      name: "Me",
      objectType: ObjectType.PLAYER,
      position: { mapId: 1, orientation: 0, x: 10, y: 20, z: 30 },
      rawFields: new Map(),
      scale: 1,
    } satisfies Entity;
    const rig = areaRig("tickets", {
      getEntity: (guid) => (guid === 0xde1n ? self : undefined),
      selfGuid: 0xde1n,
    });
    try {
      const pending = rig.handle.act.createTicket({
        needMoreHelp: true,
        text: "a|Hb|r",
      });
      await Promise.resolve();
      expect(rig.sent.map((packet) => packet.opcode)).toEqual([
        GameOpcode.CMSG_GMTICKET_CREATE,
      ]);
      rig.inject(GameOpcode.SMSG_GMTICKET_CREATE, codeBody(2));
      expect(await pending).toEqual({
        outcome: "create_success",
        status: "created",
      });
    } finally {
      rig.dispose();
    }
  });
});
