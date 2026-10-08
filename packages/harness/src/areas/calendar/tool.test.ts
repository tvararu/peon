import { describe, expect, jest, test } from "bun:test";
import { validateToolArguments } from "@earendil-works/pi-ai";
import type { AreaState } from "@peon/core";
import { elapse, withFakeTimers } from "@peon/core/test-support/fake-time";
import { calendarSpec, calendarTool } from "#harness/areas/calendar/tool";
import { calendarParams } from "#harness/areas/calendar/tool-types";
import { createMockGame } from "#test-support/mock-game";
import { contentOf, toolCtx } from "#test-support/ops-fixtures";
import type { MockHandle } from "#test-support/runtime-fixture";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { expectSendKind } from "#test-support/tool-harness";

type CalendarState = AreaState<"calendar">;

const ZONE = { day: 4, hour: 19, minute: 0, month: 7, weekday: 6, year: 2026 };

function calendarState(over: Partial<CalendarState> = {}): CalendarState {
  return {
    arenaTeam: [],
    binds: [],
    clearedPending: 0,
    createdByMe: [],
    details: {},
    events: [],
    filterGuild: [],
    holidays: [],
    invites: [],
    lockouts: [],
    lockoutUpdates: [],
    pending: undefined,
    receivedAt: undefined,
    relationTime: undefined,
    resets: [],
    selfInvites: {},
    serverOffsetSeconds: 25_200,
    serverTime: 1_790_928_000,
    zoneTime: { ...ZONE },
    ...over,
  };
}

function stateOf(handle: MockHandle, state: CalendarState): void {
  Object.assign(handle.calendar, {
    act: Object.assign(handle.calendar.act, {
      event: jest.fn(async (id: bigint) => ({
        detail: state.details[id.toString()],
        state,
        status: "ok" as const,
      })),
      get: jest.fn(async () => ({ state, status: "ok" as const })),
    }),
    state: () => state,
  });
}

function acts(handle: MockHandle) {
  const act = handle.calendar.act;
  return {
    answer: jest.spyOn(act, "answer"),
    copy: jest.spyOn(act, "copy"),
    create: jest.spyOn(act, "create"),
    invite: jest.spyOn(act, "invite"),
    remove: jest.spyOn(act, "remove"),
    update: jest.spyOn(act, "update"),
  };
}

function storedEvent(id: bigint, title: string) {
  return {
    creator: 1n,
    dungeonId: -1,
    flags: 0,
    id,
    time: { ...ZONE, hour: 12 },
    title,
    type: 0,
  };
}

function storedDetail(id: bigint, title: string) {
  return {
    creator: 1n,
    description: "peon calendar proof",
    dungeonId: -1,
    eventId: id,
    flags: 0,
    guildId: 0,
    invites: [],
    maxInvites: 100,
    repeat: 0,
    sendType: 1,
    time: { ...ZONE, hour: 12 },
    title,
    type: 0,
    zoneTime: { ...ZONE, hour: 12 },
  };
}

describe("calendar tool", () => {
  test("minimalArgs passes the parameters schema", () => {
    expect(
      validateToolArguments(
        { description: "probe", name: "probe", parameters: calendarParams },
        {
          arguments: calendarSpec.minimalArgs,
          id: "c1",
          name: "probe",
          type: "toolCall",
        },
      ),
    ).toEqual(calendarSpec.minimalArgs);
  });

  test("expectSendKind passes for the action tool", async () => {
    await withFakeTimers(async () => {
      const game = createMockGame();
      const checking = expectSendKind(
        calendarTool,
        { do: "create", title: "Peon proof" },
        game,
      );
      await elapse(8000);
      await checking;
    });
  });

  test("list reports the stored events", async () => {
    const t = await createTestRuntime({});
    stateOf(t.handle, calendarState({ events: [storedEvent(7n, "Raid")] }));
    const out = await calendarSpec.run({ do: "list" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(contentOf(out)).toContain("Raid");
  });

  test("create sends tomorrow at 19:00 by default and reports the id", async () => {
    const t = await createTestRuntime({});
    const state = calendarState({});
    stateOf(t.handle, state);
    const spies = acts(t.handle);
    spies.create.mockResolvedValue({ eventId: 7n, state, status: "ok" });
    const out = await calendarSpec.run(
      { do: "create", title: "Peon proof" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(contentOf(out)).toContain("7");
    const spec = spies.create.mock.calls[0]?.[0];
    expect(spec?.title).toBe("Peon proof");
    expect(spec?.time).toMatchObject({ day: 5, hour: 19, month: 7 });
  });

  test("create with a refused server settles REFUSED", async () => {
    const t = await createTestRuntime({});
    const state = calendarState({});
    stateOf(t.handle, state);
    acts(t.handle).create.mockResolvedValue({
      error: 2,
      name: "",
      status: "refused",
    });
    const out = await calendarSpec.run(
      { do: "create", title: "Peon proof" },
      toolCtx(t),
    );
    expect(out.status).toBe("REFUSED");
    expect(out.reason).toBe("error_2");
  });

  test("update keeps the stored description and time", async () => {
    const t = await createTestRuntime({});
    const state = calendarState({
      createdByMe: [7n],
      details: { "7": storedDetail(7n, "Peon proof") },
      events: [storedEvent(7n, "Peon proof")],
      invites: [
        {
          creator: 1n,
          eventId: 7n,
          guildEvent: false,
          inviteId: 9n,
          rank: 2,
          status: 3,
        },
      ],
    });
    stateOf(t.handle, state);
    const spies = acts(t.handle);
    spies.update.mockResolvedValue({ state, status: "ok" });
    const out = await calendarSpec.run(
      { do: "update", event: "7", title: "Peon renamed" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    const [, , spec] = spies.update.mock.calls[0] ?? [];
    expect(spec?.title).toBe("Peon renamed");
    expect(spec?.description).toBe("peon calendar proof");
  });

  test("remove sends the invite id from the calendar", async () => {
    const t = await createTestRuntime({});
    const state = calendarState({
      createdByMe: [7n],
      events: [storedEvent(7n, "Peon proof")],
      invites: [
        {
          creator: 1n,
          eventId: 7n,
          guildEvent: false,
          inviteId: 9n,
          rank: 2,
          status: 3,
        },
      ],
    });
    stateOf(t.handle, state);
    const spies = acts(t.handle);
    spies.remove.mockResolvedValue({ state, status: "ok" });
    const out = await calendarSpec.run(
      { do: "remove", event: "7" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(spies.remove).toHaveBeenCalledWith(7n, 9n);
  });

  test("copy sends the same default day as create", async () => {
    const t = await createTestRuntime({});
    const state = calendarState({
      createdByMe: [7n],
      events: [storedEvent(7n, "Peon proof")],
    });
    stateOf(t.handle, state);
    const spies = acts(t.handle);
    spies.copy.mockResolvedValue({ eventId: 8n, state, status: "ok" });
    const out = await calendarSpec.run({ do: "copy", event: "7" }, toolCtx(t));
    expect(out.status).toBe("DONE");
    expect(contentOf(out)).toContain("8");
  });

  test("invite sends the event id and the player name", async () => {
    const t = await createTestRuntime({});
    const state = calendarState({
      createdByMe: [7n],
      events: [storedEvent(7n, "Peon proof")],
    });
    stateOf(t.handle, state);
    const spies = acts(t.handle);
    spies.invite.mockResolvedValue({ state, status: "ok" });
    const out = await calendarSpec.run(
      { do: "invite", event: "7", name: "Jev" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(spies.invite).toHaveBeenCalledWith(7n, "Jev");
  });

  test("invite without a name is a local refusal", async () => {
    const t = await createTestRuntime({});
    stateOf(t.handle, calendarState({}));
    await expect(
      calendarSpec.run({ do: "invite", event: "7" }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "missing_arg" });
  });

  test("rsvp accept answers status 1", async () => {
    const t = await createTestRuntime({});
    const state = calendarState({
      events: [storedEvent(7n, "Peon proof")],
      invites: [
        {
          creator: 1n,
          eventId: 7n,
          guildEvent: false,
          inviteId: 9n,
          rank: 0,
          status: 0,
        },
      ],
    });
    stateOf(t.handle, state);
    const spies = acts(t.handle);
    spies.answer.mockResolvedValue({ state, status: "ok" });
    const out = await calendarSpec.run(
      { do: "rsvp", event: "7", step: "accept" },
      toolCtx(t),
    );
    expect(out.status).toBe("DONE");
    expect(spies.answer).toHaveBeenCalledWith(7n, 9n, 1);
  });

  test("unknown event titles are a local refusal", async () => {
    const t = await createTestRuntime({});
    stateOf(t.handle, calendarState({}));
    await expect(
      calendarSpec.run({ do: "read", event: "missing" }, toolCtx(t)),
    ).rejects.toMatchObject({ reason: "no_such_event" });
  });
});
