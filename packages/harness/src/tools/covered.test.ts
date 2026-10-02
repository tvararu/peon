import { describe, expect, test } from "bun:test";
import type { LogDraft, LogEvent } from "#harness/contract/log";
import { createGameLog } from "#harness/log/store";
import { coverRows } from "#harness/tools/covered";

function draft(event: LogEvent, data: Record<string, unknown> = {}): LogDraft {
  return {
    class: "passive",
    data,
    delivered: false,
    domain: event.split("/")[0] as LogDraft["domain"],
    event,
    text: event,
  };
}

function setup() {
  const clock = { now: () => 1000 };
  return createGameLog({ char: () => "Fgk", clock, file: undefined });
}

describe("coverRows", () => {
  test("an interact result covers the quest and trade rows of its call", () => {
    const log = setup();
    const before = log.append(draft("quest/accepted"));
    log.append({
      class: "log",
      data: { toolCallId: "c1" },
      domain: "tool",
      event: "tool/call",
      text: "interact called",
    });
    const accepted = log.append(draft("quest/accepted"));
    const money = log.append(draft("money/change", { reason: "vendor_buy" }));
    const whisper = log.append(draft("chat/in"));
    const explored = log.append(draft("xp/gain", { source: "exploration" }));
    const reward = log.append(draft("xp/gain", { source: "quest" }));
    coverRows(log, {
      status: "DONE",
      tool: "interact",
      toolCallId: "c1",
    });
    expect(log.get(accepted.seq)?.consumedBy).toBe("c1");
    expect(log.get(money.seq)?.consumedBy).toBe("c1");
    expect(log.get(whisper.seq)?.consumedBy).toBeUndefined();
    expect(log.get(before.seq)?.consumedBy).toBeUndefined();
    expect(log.get(explored.seq)?.consumedBy).toBeUndefined();
    expect(log.get(reward.seq)?.consumedBy).toBe("c1");
  });

  test("an interact bank result covers its own bank rows", () => {
    const log = setup();
    log.append({
      class: "log",
      data: { toolCallId: "c1" },
      domain: "tool",
      event: "tool/call",
      text: "interact called",
    });
    const opened = log.append(draft("bank/opened"));
    const deposit = log.append(draft("bank/deposit"));
    coverRows(log, { status: "DONE", tool: "interact", toolCallId: "c1" });
    expect(log.get(opened.seq)?.consumedBy).toBe("c1");
    expect(log.get(deposit.seq)?.consumedBy).toBe("c1");
  });

  test("a failed call or another tool covers nothing", () => {
    const log = setup();
    const accepted = log.append(draft("quest/accepted"));
    coverRows(log, {
      status: "FAILED",
      tool: "interact",
      toolCallId: "c1",
    });
    coverRows(log, {
      status: "DONE",
      tool: "look",
      toolCallId: "c2",
    });
    expect(log.get(accepted.seq)?.consumedBy).toBeUndefined();
  });

  test("a group mark covers its mark echo row", () => {
    const log = setup();
    log.append({
      class: "log",
      data: { toolCallId: "c1" },
      domain: "tool",
      event: "tool/call",
      text: "group called",
    });
    const mark = log.append(draft("raid/mark"));
    const ping = log.append(draft("raid/ping_row"));
    coverRows(log, { status: "DONE", tool: "group", toolCallId: "c1" });
    expect(log.get(mark.seq)?.consumedBy).toBe("c1");
    expect(log.get(ping.seq)?.consumedBy).toBeUndefined();
  });

  test("a group kick covers its roster row", () => {
    const log = setup();
    log.append({
      class: "log",
      data: { toolCallId: "c1" },
      domain: "tool",
      event: "tool/call",
      text: "group called",
    });
    const roster = log.append(draft("raid/roster"));
    coverRows(log, { status: "DONE", tool: "group", toolCallId: "c1" });
    expect(log.get(roster.seq)?.consumedBy).toBe("c1");
  });

  test("a mail check covers its listed rows", () => {
    const log = setup();
    log.append({
      class: "log",
      data: { toolCallId: "c1" },
      domain: "tool",
      event: "tool/call",
      text: "mail called",
    });
    const listed = log.append(draft("mail/listed"));
    const sent = log.append(draft("mail/sent"));
    coverRows(log, { status: "DONE", tool: "mail", toolCallId: "c1" });
    expect(log.get(listed.seq)?.consumedBy).toBe("c1");
    expect(log.get(sent.seq)?.consumedBy).toBe("c1");
  });

  test("a vehicle call covers its entered and control rows", () => {
    const log = setup();
    log.append({
      class: "log",
      data: { toolCallId: "c1" },
      domain: "tool",
      event: "tool/call",
      text: "vehicle called",
    });
    const entered = log.append(draft("vehicles/entered"));
    const control = log.append(draft("vehicles/control"));
    const listed = log.append(draft("mail/listed"));
    coverRows(log, { status: "DONE", tool: "vehicle", toolCallId: "c1" });
    expect(log.get(entered.seq)?.consumedBy).toBe("c1");
    expect(log.get(control.seq)?.consumedBy).toBe("c1");
    expect(log.get(listed.seq)?.consumedBy).toBeUndefined();
  });

  test("a call whose tool/call row is gone covers nothing", () => {
    const log = setup();
    const accepted = log.append(draft("quest/accepted"));
    coverRows(log, { status: "DONE", tool: "interact", toolCallId: "c9" });
    expect(log.get(accepted.seq)?.consumedBy).toBeUndefined();
  });
});
