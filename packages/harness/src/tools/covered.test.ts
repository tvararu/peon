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

  test("a call whose tool/call row is gone covers nothing", () => {
    const log = setup();
    const accepted = log.append(draft("quest/accepted"));
    coverRows(log, { status: "DONE", tool: "interact", toolCallId: "c9" });
    expect(log.get(accepted.seq)?.consumedBy).toBeUndefined();
  });
});
