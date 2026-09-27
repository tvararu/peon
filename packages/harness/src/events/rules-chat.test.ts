import { describe, expect, jest, test } from "bun:test";
import { type ChatMessage, ChatType } from "@peon/core";
import { createMockHandle } from "@peon/core/test-support/mock-handle";
import type { RunEnd } from "#harness/contract/runs";
import { createWakeGuard } from "#harness/events/guard";
import { createEventRouter } from "#harness/events/router";
import {
  chatDrafts,
  duelDrafts,
  groupDrafts,
} from "#harness/events/rules-chat";
import { createGameLog, createJsonlSink } from "#harness/log/store";
import { createRunRegistry } from "#harness/runs/registry";
import { testRuleInput } from "#test-support/rule-fixtures";

function msg(
  type: number,
  sender: string,
  message: string,
  channel?: string,
): ChatMessage {
  return { channel, message, sender, type };
}

function one(message: ChatMessage) {
  const [draft] = chatDrafts(message, testRuleInput());
  return draft;
}

describe("chatDrafts", () => {
  test("a whisper from another player wakes the agent", () => {
    expect(
      one(msg(ChatType.WHISPER, "Kaelyn", "hey, what level are you?")),
    ).toEqual({
      class: "wake",
      data: {
        channel: undefined,
        self: false,
        sender: "Kaelyn",
        text: "hey, what level are you?",
        type: ChatType.WHISPER,
      },
      domain: "chat",
      event: "chat/in",
      text: 'Whisper from Kaelyn: "hey, what level are you?"',
    });
  });

  test("own echoes never rise above log", () => {
    expect(
      one(msg(ChatType.WHISPER_INFORM, "Kaelyn", "I'm level 10.")),
    ).toMatchObject({
      class: "log",
      data: { self: true, to: "Kaelyn" },
      event: "chat/out",
      text: `You whisper to Kaelyn: "I'm level 10."`,
    });
    expect(one(msg(ChatType.SAY, "Fgk", "hello"))).toMatchObject({
      class: "log",
      event: "chat/out",
      text: 'Fgk says: "hello"',
    });
    expect(one(msg(ChatType.PARTY, "Fgk", "omw"))).toMatchObject({
      class: "log",
      event: "chat/out",
    });
  });

  test("group channels from others wake", () => {
    expect(one(msg(ChatType.PARTY, "Bob", "inc"))).toMatchObject({
      class: "wake",
      text: '[party] Bob: "inc"',
    });
    expect(one(msg(ChatType.GUILD, "Bob", "gz"))).toMatchObject({
      class: "wake",
      text: '[guild] Bob: "gz"',
    });
  });

  test("say wakes only when it names the character", () => {
    expect(one(msg(ChatType.SAY, "Bob", "hi fgk, want a group?"))?.class).toBe(
      "wake",
    );
    expect(one(msg(ChatType.YELL, "Bob", "anyone here?"))).toMatchObject({
      class: "passive",
      text: 'Bob yells: "anyone here?"',
    });
    expect(one(msg(ChatType.SAY, "Bob", "Fgkx is my alt"))?.class).toBe(
      "passive",
    );
  });

  test("monster lines and emotes are passive, channels are log", () => {
    expect(
      one(msg(ChatType.MONSTER_SAY, "Magistrix Erona", "Welcome."))?.class,
    ).toBe("passive");
    expect(one(msg(ChatType.EMOTE, "Bob", "waves."))).toMatchObject({
      class: "passive",
      text: "Bob waves.",
    });
    expect(one(msg(ChatType.CHANNEL, "Bob", "wts", "General"))).toMatchObject({
      class: "log",
      text: '[General] Bob: "wts"',
    });
  });

  test("quiet system lines are log, other system lines passive", () => {
    expect(
      one(msg(ChatType.SYSTEM, "", "[peon] SMSG_FOO is not yet implemented"))
        ?.class,
    ).toBe("log");
    expect(one(msg(ChatType.SYSTEM, "", "Welcome to AzerothCore"))?.class).toBe(
      "log",
    );
    expect(
      one(msg(ChatType.SYSTEM, "", "Bob has invited you to a group.")),
    ).toMatchObject({
      class: "passive",
      text: "[system] Bob has invited you to a group.",
    });
  });

  test("server banner lines stay in the log when colour codes wrap them", () => {
    for (const message of [
      "|cff00ff00Individual Progression: |cffccccccenabled|r",
      "|cff00ff00This server runs with |cff00ccffmod-playerbots|r |cffcccccchttps://github.com/mod-playerbots/mod-playerbots|r",
      "|cff00ff00Playerbots:|r The server is configured with 500 bots.",
      "This server is running the |cff4CFF00Loot aoe|r module.",
    ])
      expect(one(msg(ChatType.SYSTEM, "", message))?.class).toBe("log");
  });

  test("login toggles and the MOTD stay in the log", () => {
    for (const message of [
      "Accepting Whisper: ON",
      "Accepting Whisper: OFF",
      "|cff00ff00Welcome to the server|r\nHave fun",
    ])
      expect(one(msg(ChatType.SYSTEM, "", message))?.class).toBe("log");
  });

  test("strips colour codes and link wrappers from chat text", () => {
    expect(
      one(
        msg(
          ChatType.WHISPER,
          "Kaelyn",
          "sell me |cff9d9d9d|Hitem:4814:0:0:0|h[Discolored Fang]|h|r pls",
        ),
      ),
    ).toMatchObject({
      data: { text: "sell me [Discolored Fang] pls" },
      text: 'Whisper from Kaelyn: "sell me [Discolored Fang] pls"',
    });
    expect(
      one(msg(ChatType.SYSTEM, "", "|cffff0000Bob|r has invited you.")),
    ).toMatchObject({
      class: "passive",
      text: "[system] Bob has invited you.",
    });
  });
});

describe("groupDrafts", () => {
  test("invites, kicks and disbands wake; roster changes are passive", () => {
    const rc = testRuleInput();
    expect(groupDrafts({ from: "Bob", type: "invite_received" }, rc)).toEqual([
      {
        class: "wake",
        data: { from: "Bob" },
        domain: "group",
        event: "group/invite",
        text: "Bob invites you to a group.",
      },
    ]);
    expect(groupDrafts({ type: "kicked" }, rc)[0]).toMatchObject({
      class: "wake",
      event: "group/kicked",
    });
    expect(groupDrafts({ type: "group_destroyed" }, rc)[0]).toMatchObject({
      class: "wake",
      event: "group/disbanded",
    });
    expect(
      groupDrafts({ name: "Bob", type: "leader_changed" }, rc)[0],
    ).toMatchObject({
      class: "passive",
      event: "group/roster",
      text: "Bob is now the group leader.",
    });
    expect(groupDrafts({ guidLow: 2, type: "member_stats" }, rc)).toEqual([]);
  });

  test("a group list names the members and the leader", () => {
    const members = [
      { guidHigh: 0, guidLow: 2, name: "Bob", online: true },
      { guidHigh: 0, guidLow: 3, name: "Kaelyn", online: false },
    ];
    const [draft] = groupDrafts(
      {
        change: { added: ["Kaelyn"], formed: false, removed: [] },
        leader: "Bob",
        loot: null,
        members,
        type: "group_list",
      },
      testRuleInput(),
    );
    expect(draft).toMatchObject({
      class: "passive",
      data: { leader: "Bob", members: ["Bob", "Kaelyn"] },
      text: "Group: Bob, Kaelyn; leader Bob.",
    });
  });
});

describe("duelDrafts", () => {
  test("a duel request wakes; the rest is dropped", () => {
    expect(
      duelDrafts(
        { challenger: "Bob", type: "duel_requested" },
        testRuleInput(),
      ),
    ).toEqual([
      {
        class: "wake",
        data: { challenger: "Bob" },
        domain: "social",
        event: "social/duel_request",
        text: "Bob challenges you to a duel.",
      },
    ]);
    expect(
      duelDrafts({ timeMs: 3000, type: "duel_countdown" }, testRuleInput()),
    ).toEqual([]);
  });
});

describe("router with chat rules", () => {
  test("stamps the active run on a whisper and delivers it as a wake", () => {
    const clock = { now: () => 5000 };
    const log = createGameLog({ char: () => "Fgk", clock, file: undefined });
    const runs = createRunRegistry({
      clock,
      log,
      sink: createJsonlSink({ file: undefined }),
    });
    const router = createEventRouter({
      attacks: {
        attach: () => () => {},
        lastAttacker: () => undefined,
        lastHitAt: () => undefined,
      },
      context: () => ({
        now: 5000,
        refOf: (guid) => `u${guid}`,
        runActive: true,
        selfGuid: 1n,
        selfName: "Fgk",
        wake: true,
      }),
      flags: {
        check: false,
        connect: true,
        glyphs: undefined,
        logEntities: false,
        model: "m",
        nowPerCall: false,
        profile: "p",
        runDir: undefined,
        stopReflex: true,
        thinking: "high",
        wake: true,
      },
      guard: createWakeGuard(clock),
      jevLog: createJsonlSink({ file: undefined }),
      log,
      runs,
    });
    const sink = { human: jest.fn(), passive: jest.fn(), wake: jest.fn() };
    router.setSink(sink);
    const handle = createMockHandle();
    router.attach(handle);
    runs.start({
      args: {},
      kind: "engage",
      launch: () => new Promise<RunEnd<number>>(() => {}),
      toolCallId: "c1",
    });
    handle.triggerMessage(msg(ChatType.WHISPER, "Kaelyn", "hey"));
    const whisper = log.since(0).find((row) => row.event === "chat/in");
    expect(whisper).toMatchObject({ class: "wake", runId: "r1" });
    expect(sink.wake).toHaveBeenCalledWith([whisper]);
  });
});
