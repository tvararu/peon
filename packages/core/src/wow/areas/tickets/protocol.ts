import { cleanText } from "#wow/areas/tickets/text";
import type { PacketReader } from "#wow/protocol/packet";
import { PacketWriter } from "#wow/protocol/packet";

export type GmTicket = {
  id: number;
  text: string;
  needMoreHelp: boolean;
  ageDays: number;
  oldestAgeDays: number;
  updatedAgeDays: number;
  escalation: number;
  readByGm: boolean;
};

export type GetTicketResult =
  | { status: "none" }
  | { status: "open"; ticket: GmTicket }
  | { status: number };

export type CreateTicketCode = { code: number; outcome: string };
export type UpdateTicketCode = { code: number; outcome: string };
export type DeleteTicketCode = { code: number; outcome: string };

export type GmResponse = { ticketId: number; text: string; response: string };

export type SurveyAnswer = { questionId: number; answer: number; text: string };

export function parseSystemStatus(reader: PacketReader): { enabled: boolean } {
  return { enabled: reader.uint32LE() !== 0 };
}

export function buildSystemStatus(enabled: boolean): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(enabled ? 1 : 0);
  return w.finish();
}

export function parseGetTicket(reader: PacketReader): GetTicketResult {
  const status = reader.uint32LE();
  if (status === 0x0a) return { status: "none" };
  if (status !== 0x06) return { status };
  const id = reader.uint32LE();
  const text = reader.cString();
  const needMoreHelp = reader.uint8() !== 0;
  const ageDays = reader.floatLE();
  const oldestAgeDays = reader.floatLE();
  const updatedAgeDays = reader.floatLE();
  const escalation = reader.uint8();
  const readByGm = reader.uint8() !== 0;
  return {
    status: "open",
    ticket: {
      ageDays,
      escalation,
      id,
      needMoreHelp,
      oldestAgeDays,
      readByGm,
      text,
      updatedAgeDays,
    },
  };
}

function createCodeName(code: number): string {
  if (code === 2) return "create_success";
  if (code === 3) return "create_error";
  return `code_${code}`;
}

function updateCodeName(code: number): string {
  if (code === 4) return "update_success";
  if (code === 5) return "update_error";
  return `code_${code}`;
}

function deleteCodeName(code: number): string {
  if (code === 9) return "ticket_deleted";
  return `code_${code}`;
}

export function parseCreateReply(reader: PacketReader): CreateTicketCode {
  const code = reader.uint32LE();
  return { code, outcome: createCodeName(code) };
}

export function parseUpdateReply(reader: PacketReader): UpdateTicketCode {
  const code = reader.uint32LE();
  return { code, outcome: updateCodeName(code) };
}

export function parseDeleteReply(reader: PacketReader): DeleteTicketCode {
  const code = reader.uint32LE();
  return { code, outcome: deleteCodeName(code) };
}

export type CreateTicketFields = {
  map: number;
  x: number;
  y: number;
  z: number;
  text: string;
  needResponse: boolean;
  needMoreHelp: boolean;
};

export function buildCreateTicket(fields: CreateTicketFields): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(fields.map);
  w.floatLE(fields.x);
  w.floatLE(fields.y);
  w.floatLE(fields.z);
  w.cString(cleanText(fields.text));
  w.uint32LE(fields.needResponse ? 1 : 0);
  w.uint8(fields.needMoreHelp ? 1 : 0);
  w.uint32LE(0);
  w.uint32LE(0);
  return w.finish();
}

export function buildUpdateText(text: string): Uint8Array {
  const w = new PacketWriter();
  w.cString(cleanText(text));
  return w.finish();
}

export function parseGmResponse(reader: PacketReader): GmResponse {
  const responseId = reader.uint32LE();
  const ticketId = reader.uint32LE();
  if (responseId !== 1)
    throw new RangeError(`Unknown GM response id ${responseId}.`);
  const text = reader.cString();
  const raw: number[] = [];
  for (let chunk = 0; chunk < 4; chunk++) {
    while (true) {
      const byte = reader.uint8();
      if (byte === 0) break;
      raw.push(byte);
    }
  }
  return {
    response: new TextDecoder().decode(new Uint8Array(raw)),
    text,
    ticketId,
  };
}

export function parseStatusUpdate(reader: PacketReader): {
  showSurvey: boolean;
} {
  return { showSurvey: reader.uint8() !== 0 };
}

export function buildSurveySubmit(
  surveyId: number,
  answers: readonly SurveyAnswer[],
  comment: string,
): Uint8Array {
  if (answers.length > 10)
    throw new RangeError(`Survey answers cap at 10, got ${answers.length}.`);
  const w = new PacketWriter();
  w.uint32LE(surveyId);
  for (const entry of answers) {
    if (entry.questionId === 0)
      throw new RangeError("Survey question id 0 ends the list early.");
    w.uint32LE(entry.questionId);
    w.uint8(entry.answer);
    w.cString(cleanText(entry.text));
  }
  if (answers.length < 10) w.uint32LE(0);
  w.cString(cleanText(comment));
  return w.finish();
}

export type BugFields = { suggestion: boolean; content: string; text: string };

export function buildBug(fields: BugFields): Uint8Array {
  const content = cleanText(fields.content);
  const text = cleanText(fields.text);
  const w = new PacketWriter();
  w.uint32LE(fields.suggestion ? 1 : 0);
  w.uint32LE(new TextEncoder().encode(content).byteLength + 1);
  w.cString(content);
  w.uint32LE(new TextEncoder().encode(text).byteLength + 1);
  w.cString(text);
  return w.finish();
}

export type LagFields = {
  kind: number;
  map: number;
  x: number;
  y: number;
  z: number;
};

export function buildReportLag(fields: LagFields): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(fields.kind);
  w.uint32LE(fields.map);
  w.floatLE(fields.x);
  w.floatLE(fields.y);
  w.floatLE(fields.z);
  return w.finish();
}
