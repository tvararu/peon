import type { AreaActsOf } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

async function attempt(act: () => Promise<unknown>): Promise<Json> {
  try {
    return json(await act());
  } catch (error) {
    return { thrown: error instanceof Error ? error.message : String(error) };
  }
}

type SpecOf = Parameters<AreaActsOf<"calendar">["create"]>[0];
function at(days: number): SpecOf["time"] {
  const date = new Date(Date.now() + days * 86_400_000);
  return {
    day: date.getUTCDate(),
    hour: 19,
    minute: 0,
    month: date.getUTCMonth() + 1,
    weekday: date.getUTCDay(),
    year: date.getUTCFullYear(),
  };
}

function spec(title: string): SpecOf {
  const time = at(2);
  return {
    description: "peon calendar proof",
    dungeonId: -1,
    flags: 0,
    maxInvites: 100,
    repeat: 0,
    time,
    title,
    type: 0,
    zoneTime: time,
  };
}

async function run({ handle }: FlowContext): Promise<Json> {
  const created = await attempt(() =>
    handle.calendar.act.create(spec(`Peon ${Date.now() % 100_000}`)),
  );
  const createdJson = created as { eventId?: string; status?: string };
  const eventId =
    typeof createdJson.eventId === "string" ? BigInt(createdJson.eventId) : 0n;
  const inviteId = 0n;
  const updated =
    eventId === 0n
      ? { skipped: "no event" }
      : await attempt(() =>
          handle.calendar.act.update(eventId, inviteId, spec("Peon renamed")),
        );
  if (eventId !== 0n) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 6000);
    await promise;
  }
  const copied =
    eventId === 0n
      ? { skipped: "no event" }
      : await attempt(() => handle.calendar.act.copy(eventId, inviteId, at(3)));
  const copiedJson = copied as { eventId?: string };
  const copyId =
    typeof copiedJson.eventId === "string" ? BigInt(copiedJson.eventId) : 0n;
  const removed =
    eventId === 0n
      ? { skipped: "no event" }
      : await attempt(() => handle.calendar.act.remove(eventId, inviteId));
  const copyRemoved =
    copyId === 0n
      ? { skipped: "no copy" }
      : await attempt(() => handle.calendar.act.remove(copyId, inviteId));
  return json({
    copied,
    copyRemoved,
    created,
    removed,
    state: {
      createdByMe: handle.calendar
        .state()
        .createdByMe.map((id) => `0x${id.toString(16)}`),
      details: Object.keys(handle.calendar.state().details),
    },
    updated,
  });
}

export const flow: ProbeFlow = {
  name: "calendar-write",
  run,
  usage:
    "--flow calendar-write: create a personal event two days out, update it, copy it, then remove both. Needs no guild; creates at most two events.",
};
