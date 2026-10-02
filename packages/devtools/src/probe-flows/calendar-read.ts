import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const BAD_EVENT_ID = 1_099_511_627_783n;

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function whole(args: Readonly<Record<string, string>>, key: string): bigint {
  const raw = args[key];
  if (raw === undefined) return BAD_EVENT_ID;
  const value = BigInt(raw);
  if (value < 2n ** 32n) throw new Error(`calendar-read needs ${key}>=2^32.`);
  return value;
}

async function attempt(act: () => Promise<unknown>): Promise<Json> {
  try {
    return json(await act());
  } catch (error) {
    return { thrown: error instanceof Error ? error.message : String(error) };
  }
}

function brief(handle: WorldHandle): Json {
  const state = handle.calendar.state();
  return json({
    binds: state.binds.map((bind) => ({
      difficulty: bind.difficulty,
      mapId: bind.mapId,
      secondsLeft: bind.secondsLeft,
    })),
    events: state.events.map((event) => ({
      dungeonId: event.dungeonId,
      flags: event.flags,
      id: `0x${event.id.toString(16)}`,
      title: event.title,
      type: event.type,
    })),
    holidays: state.holidays.map((holiday) => ({
      dates: holiday.dates.filter((date) => date !== 0).length,
      id: holiday.id,
      texture: holiday.texture,
    })),
    invites: state.invites.map((invite) => ({
      eventId: `0x${invite.eventId.toString(16)}`,
      inviteId: `0x${invite.inviteId.toString(16)}`,
      rank: invite.rank,
      status: invite.status,
    })),
    pending: state.pending,
    relationTime: state.relationTime,
    resets: state.resets,
    serverOffsetSeconds: state.serverOffsetSeconds,
    serverTime: state.serverTime,
  });
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const eventId = whole(args, "id");
  const read = await attempt(() => handle.calendar.act.get());
  const detail = await attempt(() => handle.calendar.act.event(eventId));
  const pending = await attempt(() => handle.calendar.act.pending());
  return json({
    detail,
    eventId: `0x${eventId.toString(16)}`,
    pending,
    read,
    state: brief(handle),
  });
}

export const flow: ProbeFlow = {
  name: "calendar-read",
  run,
  usage:
    "--flow calendar-read [--arg id=<event id>]: ask for the calendar, for one event's details (default id 2^40+7, which the server refuses with error 6), and for the pending count. Refuses ids below 2^32, which may be another player's real event.",
};
