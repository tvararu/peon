import { describe, expect, test } from "bun:test";
import { areaRig } from "#test-support/area-rig";
import {
  buildBug,
  buildCreateTicket,
  buildReportLag,
  buildSurveySubmit,
  buildSystemStatus,
  buildUpdateText,
  parseCreateReply,
  parseDeleteReply,
  parseGetTicket,
  parseGmResponse,
  parseStatusUpdate,
  parseSystemStatus,
  parseUpdateReply,
} from "#wow/areas/tickets/protocol";
import { cleanText } from "#wow/areas/tickets/text";
import { GameOpcode } from "#wow/protocol/opcodes";
import { PacketReader, PacketWriter } from "#wow/protocol/packet";

function readerOf(body: Uint8Array): PacketReader {
  return new PacketReader(body);
}

describe("ticket system status", () => {
  test("enabled when the flag is set", () => {
    expect(parseSystemStatus(readerOf(buildSystemStatus(true)))).toEqual({
      enabled: true,
    });
    expect(parseSystemStatus(readerOf(buildSystemStatus(false)))).toEqual({
      enabled: false,
    });
  });
});

describe("ticket get", () => {
  test("status 10 means no ticket", () => {
    const w = new PacketWriter();
    w.uint32LE(0x0a);
    expect(parseGetTicket(readerOf(w.finish()))).toEqual({ status: "none" });
  });

  test("status 6 parses every ticket field", () => {
    const w = new PacketWriter();
    w.uint32LE(0x06);
    w.uint32LE(7);
    w.cString("peon probe");
    w.uint8(1);
    w.floatLE(1.5);
    w.floatLE(2.5);
    w.floatLE(0.25);
    w.uint8(2);
    w.uint8(1);
    expect(parseGetTicket(readerOf(w.finish()))).toEqual({
      status: "open",
      ticket: {
        ageDays: 1.5,
        escalation: 2,
        id: 7,
        needMoreHelp: true,
        oldestAgeDays: 2.5,
        readByGm: true,
        text: "peon probe",
        updatedAgeDays: 0.25,
      },
    });
  });

  test("unknown status keeps its code", () => {
    const w = new PacketWriter();
    w.uint32LE(3);
    expect(parseGetTicket(readerOf(w.finish()))).toEqual({ status: 3 });
  });
});

describe("ticket writes", () => {
  test("create writes NeedResponse as u32 then NeedMoreHelp as u8", () => {
    const body = buildCreateTicket({
      map: 1,
      needMoreHelp: true,
      needResponse: true,
      text: "peon probe",
      x: 1,
      y: 2,
      z: 3,
    });
    const reader = readerOf(body);
    expect(reader.uint32LE()).toBe(1);
    expect(reader.floatLE()).toBeCloseTo(1, 5);
    expect(reader.floatLE()).toBeCloseTo(2, 5);
    expect(reader.floatLE()).toBeCloseTo(3, 5);
    expect(reader.cString()).toBe("peon probe");
    expect(reader.uint32LE()).toBe(1);
    expect(reader.uint8()).toBe(1);
    expect(reader.uint32LE()).toBe(0);
    expect(reader.uint32LE()).toBe(0);
    expect(reader.remaining).toBe(0);
  });

  test("create cleans link escapes", () => {
    const body = buildCreateTicket({
      map: 0,
      needMoreHelp: false,
      needResponse: false,
      text: "a|Hb|r",
      x: 0,
      y: 0,
      z: 0,
    });
    const reader = readerOf(body);
    reader.uint32LE();
    reader.floatLE();
    reader.floatLE();
    reader.floatLE();
    expect(reader.cString()).toBe("aHbr");
  });

  test("update writes the cleaned text alone", () => {
    const reader = readerOf(buildUpdateText("a|Hb|r"));
    expect(reader.cString()).toBe("aHbr");
    expect(reader.remaining).toBe(0);
  });

  test("reply codes name their outcomes", () => {
    const single = (code: number): Uint8Array => {
      const w = new PacketWriter();
      w.uint32LE(code);
      return w.finish();
    };
    expect(parseCreateReply(readerOf(single(2)))).toEqual({
      code: 2,
      outcome: "create_success",
    });
    expect(parseCreateReply(readerOf(single(3)))).toEqual({
      code: 3,
      outcome: "create_error",
    });
    expect(parseUpdateReply(readerOf(single(4)))).toEqual({
      code: 4,
      outcome: "update_success",
    });
    expect(parseUpdateReply(readerOf(single(5)))).toEqual({
      code: 5,
      outcome: "update_error",
    });
    expect(parseDeleteReply(readerOf(single(9)))).toEqual({
      code: 9,
      outcome: "ticket_deleted",
    });
  });
});

describe("gm response", () => {
  function responseBody(message: string, chunks: string[]): Uint8Array {
    const w = new PacketWriter();
    w.uint32LE(1);
    w.uint32LE(7);
    w.cString(message);
    const bytes = new TextEncoder().encode(chunks.join(""));
    let at = 0;
    for (let chunk = 0; chunk < 4; chunk++) {
      const left = bytes.length - at;
      const take = chunk === 0 ? left : 0;
      w.rawBytes(bytes.subarray(at, at + take));
      at += take;
      w.uint8(0);
    }
    return w.finish();
  }

  test("joins the four response chunks", () => {
    const parsed = parseGmResponse(
      readerOf(responseBody("original", ["gm ", "ans", "wer"])),
    );
    expect(parsed).toEqual({
      response: "gm answer",
      text: "original",
      ticketId: 7,
    });
  });

  test("replies with another response id are rejected", () => {
    const w = new PacketWriter();
    w.uint32LE(2);
    w.uint32LE(7);
    w.cString("original");
    for (let chunk = 0; chunk < 4; chunk++) w.uint8(0);
    expect(() => parseGmResponse(readerOf(w.finish()))).toThrow(RangeError);
  });

  test("status update reads the survey flag", () => {
    const one = new PacketWriter();
    one.uint8(1);
    expect(parseStatusUpdate(readerOf(one.finish()))).toEqual({
      showSurvey: true,
    });
    const zero = new PacketWriter();
    zero.uint8(0);
    expect(parseStatusUpdate(readerOf(zero.finish()))).toEqual({
      showSurvey: false,
    });
  });
});

describe("survey submit", () => {
  test("writes the answers then a zero terminator", () => {
    const body = buildSurveySubmit(
      9,
      [
        { answer: 3, questionId: 41, text: "fine" },
        { answer: 1, questionId: 42, text: "a|b" },
      ],
      "later",
    );
    const reader = readerOf(body);
    expect(reader.uint32LE()).toBe(9);
    expect(reader.uint32LE()).toBe(41);
    expect(reader.uint8()).toBe(3);
    expect(reader.cString()).toBe("fine");
    expect(reader.uint32LE()).toBe(42);
    expect(reader.uint8()).toBe(1);
    expect(reader.cString()).toBe("ab");
    expect(reader.uint32LE()).toBe(0);
    expect(reader.cString()).toBe("later");
    expect(reader.remaining).toBe(0);
  });

  test("ten answers need no terminator but eleven are refused", () => {
    const answers = Array.from({ length: 10 }, (_, index) => ({
      answer: 1,
      questionId: 100 + index,
      text: "ok",
    }));
    const reader = readerOf(buildSurveySubmit(9, answers, "done"));
    reader.uint32LE();
    for (let index = 0; index < 10; index++) {
      reader.uint32LE();
      reader.uint8();
      reader.cString();
    }
    expect(reader.cString()).toBe("done");
    expect(reader.remaining).toBe(0);
    expect(() =>
      buildSurveySubmit(
        9,
        [...answers, { answer: 1, questionId: 200, text: "extra" }],
        "done",
      ),
    ).toThrow(RangeError);
  });

  test("question id zero ends the server loop early and is refused", () => {
    expect(() =>
      buildSurveySubmit(9, [{ answer: 1, questionId: 0, text: "x" }], "done"),
    ).toThrow(RangeError);
  });
});

describe("bug and lag reports", () => {
  test("bug writes the suggestion flag and two sized strings", () => {
    const content = "crash on login";
    const reader = readerOf(
      buildBug({ content, suggestion: false, text: "startup" }),
    );
    expect(reader.uint32LE()).toBe(0);
    expect(reader.sizedString()).toBe(content);
    expect(reader.sizedString()).toBe("startup");
    expect(reader.remaining).toBe(0);
  });

  test("bug lengths count the terminating byte", () => {
    const reader = readerOf(
      buildBug({ content: "ab", suggestion: true, text: "cd" }),
    );
    expect(reader.uint32LE()).toBe(1);
    expect(reader.uint32LE()).toBe(3);
    expect(reader.cString()).toBe("ab");
    expect(reader.uint32LE()).toBe(3);
    expect(reader.cString()).toBe("cd");
  });

  test("bug cleans link escapes", () => {
    expect(cleanText("a|Hb|r")).toBe("aHbr");
  });

  test("lag writes two u32 and three f32", () => {
    const reader = readerOf(
      buildReportLag({ kind: 5, map: 1, x: 1, y: 2, z: 3 }),
    );
    expect(reader.uint32LE()).toBe(5);
    expect(reader.uint32LE()).toBe(1);
    expect(reader.floatLE()).toBeCloseTo(1, 5);
    expect(reader.floatLE()).toBeCloseTo(2, 5);
    expect(reader.floatLE()).toBeCloseTo(3, 5);
    expect(reader.remaining).toBe(0);
  });
});

describe("tickets through the area rig", () => {
  test("ticket store keeps the read ticket", () => {
    const rig = areaRig("tickets");
    try {
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
      rig.inject(GameOpcode.SMSG_GMTICKET_GETTICKET, w.finish());
      expect(rig.stores.areas.tickets.snapshot().ticket).toEqual({
        status: "open",
        ticket: {
          ageDays: 1.5,
          escalation: 0,
          id: 7,
          needMoreHelp: false,
          oldestAgeDays: 2.5,
          readByGm: false,
          text: "peon probe",
          updatedAgeDays: 0.25,
        },
      });
    } finally {
      rig.dispose();
    }
  });
});
