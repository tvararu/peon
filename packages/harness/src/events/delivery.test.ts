import { describe, expect, jest, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ChatType } from "@peon/core";
import type { LogDraft } from "#harness/contract/log";
import {
  attachCallRows,
  createDelivery,
  formatWake,
} from "#harness/events/delivery";
import { WAKE_MIN_GAP_MS } from "#harness/events/guard";
import { createGameLog } from "#harness/log/store";
import { createTestRuntime } from "#test-support/runtime-fixture";

type Sent = { message: Record<string, unknown>; options: unknown };

function fakePi() {
  const sent: Sent[] = [];
  const entries: { customType: string; data: unknown }[] = [];
  const api = {
    appendEntry: (customType: string, data?: unknown) => {
      entries.push({ customType, data });
    },
    sendMessage: (message: Record<string, unknown>, options?: unknown) => {
      sent.push({ message, options });
    },
  };
  return { api: api as unknown as ExtensionAPI, entries, sent };
}

function wakeDraft(text: string, data: Record<string, unknown> = {}): LogDraft {
  return {
    class: "wake",
    data,
    delivered: false,
    domain: "run",
    event: "run/ended",
    text,
  };
}

function passiveDraft(
  text: string,
  event: LogDraft["event"] = "xp/gain",
): LogDraft {
  return {
    class: "passive",
    data: {},
    delivered: false,
    domain: event === "chat/in" ? "chat" : "xp",
    event,
    text,
  };
}

const whisperDraft: LogDraft = {
  class: "wake",
  data: { sender: "Kaelyn", type: ChatType.WHISPER },
  delivered: false,
  domain: "chat",
  event: "chat/in",
  text: 'Whisper from Kaelyn: "hey"',
};

async function setup() {
  let now = 100_000;
  const clock = { now: () => now };
  const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
  const { rt } = await createTestRuntime({ parts: { clock, log } });
  const pi = fakePi();
  const delivery = createDelivery({ pi: pi.api, rt });
  return {
    delivery,
    log,
    pi,
    rt,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

function content(sent: Sent | undefined): string {
  return String(sent?.message["content"]);
}

describe("formatWake", () => {
  test("sorts rows oldest first, with ages and the whisper hint", () => {
    const base = { char: "Fgk", seq: 1, v: 1 as const };
    const passive = { ...base, ...passiveDraft("You gain 130 XP."), ts: 0 };
    const ended = {
      ...base,
      ...wakeDraft("r4 travel ended: DONE arrived."),
      seq: 2,
      ts: 3000,
    };
    const attacked = {
      ...base,
      ...wakeDraft("Springpaw Stalker u9 attacks you."),
      seq: 3,
      ts: 1000,
    };
    expect(formatWake([ended, attacked, passive], 5000)).toBe(
      [
        "[game 5s] You gain 130 XP.",
        "[game 4s] Springpaw Stalker u9 attacks you.",
        "[game 2s] r4 travel ended: DONE arrived.",
      ].join("\n"),
    );
    const tied = { ...passive, seq: 4, text: "You gain 5 XP.", ts: 3000 };
    expect(formatWake([tied, ended], 5000)).toBe(
      "[game 2s] r4 travel ended: DONE arrived.\n[game 2s] You gain 5 XP.",
    );
    const whisper = { ...base, ...whisperDraft, seq: 3, ts: 3000 };
    expect(formatWake([whisper], 5000)).toBe(
      '[game 2s] Whisper from Kaelyn: "hey" Next: social(to: "Kaelyn", text: "…")',
    );
  });

  test("gives party, guild and say wakes their reply call", () => {
    const base = { char: "Fgk", seq: 1, ts: 0, v: 1 as const };
    const line = (type: number, text: string) => ({
      ...base,
      ...whisperDraft,
      data: { sender: "Kaelyn", type },
      text,
    });
    expect(
      formatWake([line(ChatType.PARTY, '[party] Kaelyn: "pull"')], 0),
    ).toBe(
      '[game 0s] [party] Kaelyn: "pull" Next: social(do: "party", text: "…")',
    );
    expect(formatWake([line(ChatType.GUILD, '[guild] Kaelyn: "hi"')], 0)).toBe(
      '[game 0s] [guild] Kaelyn: "hi" Next: social(do: "guild", text: "…")',
    );
    expect(formatWake([line(ChatType.SAY, 'Kaelyn says: "Fgk, hi"')], 0)).toBe(
      '[game 0s] Kaelyn says: "Fgk, hi" Next: social(do: "say", text: "…")',
    );
    expect(
      formatWake(
        [line(ChatType.WHISPER_FOREIGN, 'Whisper from Kaelyn: "hey"')],
        0,
      ),
    ).toBe(
      '[game 0s] Whisper from Kaelyn: "hey" Next: social(to: "Kaelyn", text: "…")',
    );
  });
});

describe("createDelivery", () => {
  test("sends a wake at once while idle, as a followUp", async () => {
    const { delivery, log, pi } = await setup();
    const whisper = log.append(whisperDraft);
    delivery.wake([whisper]);
    expect(pi.sent).toEqual([
      {
        message: {
          content:
            '[game 0s] Whisper from Kaelyn: "hey" Next: social(to: "Kaelyn", text: "…")',
          customType: "wow-event",
          details: { entries: [whisper], kind: "wake" },
          display: true,
        },
        options: { deliverAs: "followUp", triggerTurn: true },
      },
    ]);
    expect(log.get(whisper.seq)?.delivered).toBe(true);
  });

  test("holds wakes while the agent works and skips consumed rows", async () => {
    const { delivery, log, pi, rt } = await setup();
    rt.session.agent = "tool";
    const consumed = log.append(wakeDraft("r1 engage u9 succeeded: 1 kill"));
    const other = log.append(wakeDraft("r2 rest succeeded: 90%"));
    delivery.wake([consumed]);
    delivery.wake([other]);
    expect(pi.sent).toEqual([]);
    log.mark(consumed.seq, { consumedBy: "call-1" });
    delivery.flush();
    expect(pi.sent).toHaveLength(1);
    expect(pi.sent[0]?.message["details"]).toEqual({
      entries: [other],
      kind: "wake",
    });
    expect(log.get(consumed.seq)?.delivered).toBe(false);
  });

  test("a row consumed by a running engage survives a flush and returns if the run stops", async () => {
    const { delivery, log, pi, rt } = await setup();
    const run = rt.runs.start<number>({
      args: {},
      kind: "engage",
      launch: ({ signal }) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () =>
            resolve({ status: "cancelled", summary: "stopped", value: 0 }),
          );
        }),
      toolCallId: "call-9",
    });
    const row = log.append({
      ...passiveDraft("You gain 90 XP."),
      consumedBy: "call-9",
      runId: run.id,
    });
    delivery.passive(row);
    delivery.flush();
    expect(pi.sent).toEqual([]);
    rt.runs.cancel(run.id, "human");
    await run.done;
    log.mark(row.seq, { consumedBy: undefined });
    delivery.flush();
    expect(pi.sent.map(content)).toEqual(["[game 0s] You gain 90 XP."]);
    expect(log.get(row.seq)?.delivered).toBe(true);
  });

  test("a row an engage tallied leaves the queue once the run ends", async () => {
    const { delivery, log, pi, rt } = await setup();
    const run = rt.runs.start<number>({
      args: {},
      kind: "engage",
      launch: () =>
        Promise.resolve({ status: "succeeded", summary: "1 kill", value: 1 }),
      toolCallId: "call-9",
    });
    const row = log.append({
      ...passiveDraft("You gain 90 XP."),
      consumedBy: "call-9",
      runId: run.id,
    });
    delivery.passive(row);
    await run.done;
    delivery.flush();
    log.mark(row.seq, { consumedBy: undefined });
    delivery.flush();
    expect(pi.sent).toEqual([]);
  });

  test("joins wakes inside the 5 s gap", async () => {
    const { delivery, log, pi, tick } = await setup();
    delivery.wake([log.append(wakeDraft("first"))]);
    tick(1000);
    jest.useFakeTimers();
    try {
      delivery.wake([log.append(wakeDraft("second"))]);
      delivery.wake([log.append(wakeDraft("third"))]);
      expect(pi.sent).toHaveLength(1);
      jest.advanceTimersByTime(WAKE_MIN_GAP_MS - 1000);
      expect(pi.sent).toHaveLength(2);
      expect(content(pi.sent[1])).toBe("[game 0s] second\n[game 0s] third");
    } finally {
      jest.useRealTimers();
    }
  });

  test("flushes passive lines once, capped at 20", async () => {
    const { delivery, log, pi } = await setup();
    for (const n of Array.from({ length: 22 }, (_, i) => i + 1))
      delivery.passive(log.append(passiveDraft(`line ${n}`)));
    expect(pi.sent).toEqual([]);
    delivery.flush();
    expect(pi.sent[0]?.options).toEqual({ triggerTurn: false });
    const lines = content(pi.sent[0]).split("\n");
    expect(lines).toHaveLength(21);
    expect(lines[0]).toBe("[game 0s] line 3");
    expect(lines[20]).toBe('+2 more in the log (journal about "log").');
    delivery.flush();
    expect(pi.sent).toHaveLength(1);
  });

  test("a chat wake takes no passive lines; they wait for the next flush", async () => {
    const { delivery, log, pi } = await setup();
    delivery.passive(log.append(passiveDraft('Bob says: "lol"', "chat/in")));
    delivery.passive(log.append(passiveDraft("You gain 130 XP.")));
    delivery.wake([log.append(whisperDraft)]);
    expect(content(pi.sent[0])).toBe(
      '[game 0s] Whisper from Kaelyn: "hey" Next: social(to: "Kaelyn", text: "…")',
    );
    delivery.flush();
    expect(content(pi.sent[1]).split("\n")).toEqual([
      '[game 0s] Bob says: "lol"',
      "[game 0s] You gain 130 XP.",
    ]);
  });

  test("a non-chat wake carries the passive lines in time order", async () => {
    const { delivery, log, pi } = await setup();
    delivery.passive(log.append(passiveDraft("You gain 130 XP.")));
    delivery.wake([log.append(wakeDraft("r4 travel ended: DONE arrived."))]);
    expect(content(pi.sent[0]).split("\n")).toEqual([
      "[game 0s] You gain 130 XP.",
      "[game 0s] r4 travel ended: DONE arrived.",
    ]);
  });

  test("human lines go to the session only", async () => {
    const { delivery, log, pi } = await setup();
    const error = log.append({
      class: "log",
      data: {},
      domain: "packet",
      event: "packet/error",
      text: "Packet 0x1f6 failed: short read",
    });
    delivery.human(error);
    expect(pi.entries).toEqual([
      { customType: "wow-human", data: { entry: error } },
    ]);
    expect(pi.sent).toEqual([]);
  });

  test("takePassive returns the buffer and clears it", async () => {
    const { delivery, log } = await setup();
    const line = log.append(passiveDraft("You gain 130 XP."));
    delivery.passive(line);
    expect(delivery.takePassive()).toEqual([line]);
    expect(log.get(line.seq)?.delivered).toBe(true);
    expect(delivery.takePassive()).toEqual([]);
  });
});

describe("attachCallRows", () => {
  const call = (toolCallId: string): LogDraft => ({
    class: "log",
    data: { toolCallId },
    domain: "tool",
    event: "tool/call",
    text: "travel called",
  });

  test("a passive row from the run goes into its result, not the next wake", async () => {
    const { delivery, log, pi, tick } = await setup();
    const before = log.append(passiveDraft("You gain 5 XP."));
    delivery.passive(before);
    log.append(call("c1"));
    const explored = log.append({
      ...passiveDraft("You gain 55 XP (exploring Ghostlands)."),
      data: { source: "exploration" },
    });
    delivery.passive(explored);
    const told = log.append({
      ...passiveDraft("You gain 90 XP."),
      consumedBy: "c1",
    });
    tick(2000);
    expect(attachCallRows(log, "c1", 102_000)).toBe(
      "\n[game 2s] You gain 55 XP (exploring Ghostlands).",
    );
    expect(log.get(explored.seq)).toMatchObject({
      consumedBy: "c1",
      delivered: true,
    });
    expect(log.get(told.seq)?.delivered).toBe(false);
    delivery.wake([log.append(wakeDraft("r4 travel ended: DONE arrived."))]);
    expect(content(pi.sent[0]).split("\n")).toEqual([
      "[game 2s] You gain 5 XP.",
      "[game 0s] r4 travel ended: DONE arrived.",
    ]);
    delivery.flush();
    expect(pi.sent).toHaveLength(1);
  });

  test("shows 5 rows, then a count", async () => {
    const { log } = await setup();
    log.append(call("c1"));
    const rows = Array.from({ length: 7 }, (_, i) =>
      log.append(passiveDraft(`line ${i + 1}`)),
    );
    expect(attachCallRows(log, "c1", 100_000).split("\n")).toEqual([
      "",
      "[game 0s] line 1",
      "[game 0s] line 2",
      "[game 0s] line 3",
      "[game 0s] line 4",
      "[game 0s] line 5",
      '+2 more in the log (journal about "log").',
    ]);
    expect(rows.map((row) => log.get(row.seq)?.consumedBy)).toEqual(
      Array.from({ length: 7 }, () => "c1"),
    );
  });

  test("adds nothing without rows, or without the call", async () => {
    const { log } = await setup();
    log.append(passiveDraft("You gain 5 XP."));
    expect(attachCallRows(log, "c1", 100_000)).toBe("");
    log.append(call("c1"));
    log.append(wakeDraft("r4 travel ended"));
    expect(attachCallRows(log, "c1", 100_000)).toBe("");
  });
});

describe("late wakes", () => {
  const attacked = (guid: string): LogDraft => ({
    class: "wake",
    data: { attacker: guid },
    delivered: false,
    domain: "combat",
    event: "combat/attacked",
    guid,
    text: `Starving Ghostclaw ${guid} attacks you.`,
  });
  const ended = (guid: string): LogDraft => ({
    class: "log",
    data: { target: guid },
    domain: "fight",
    event: "fight/end",
    guid,
    text: "Fight ended.",
  });

  test("drops an attack whose fight ended before the agent was free", async () => {
    const { delivery, log, pi, rt } = await setup();
    rt.session.agent = "tool";
    const stale = log.append(attacked("f1"));
    const live = log.append(attacked("f2"));
    delivery.wake([stale, live]);
    log.append(ended("f1"));
    rt.session.agent = "idle";
    delivery.flush();
    expect(pi.sent.map(content)).toEqual([
      "[game 0s] Starving Ghostclaw f2 attacks you.",
    ]);
    expect(log.get(stale.seq)?.delivered).toBe(false);
  });

  test("drops every attack once its fight ended, with no wake at all", async () => {
    const { delivery, log, pi, rt } = await setup();
    rt.session.agent = "streaming";
    const stale = log.append(attacked("f1"));
    delivery.wake([stale]);
    log.append({ ...ended("f1"), event: "combat/kill_credit" });
    delivery.passive(log.append(passiveDraft("You gain 63 XP.")));
    rt.session.agent = "idle";
    delivery.flush();
    expect(pi.sent.map((sent) => sent.options)).toEqual([
      { triggerTurn: false },
    ]);
  });

  test("never pushes exploration XP outside a tool result", async () => {
    const { delivery, log, pi } = await setup();
    const explored = log.append({
      ...passiveDraft("You gain 55 XP (exploring Ghostlands)."),
      data: { source: "exploration" },
    });
    delivery.passive(explored);
    delivery.flush();
    delivery.wake([log.append(wakeDraft("r4 travel ended"))]);
    expect(pi.sent.map(content)).toEqual(["[game 0s] r4 travel ended"]);
    expect(log.get(explored.seq)?.delivered).toBe(false);
  });
});
