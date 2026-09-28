import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

type SelfstateEvent = Parameters<
  Parameters<WorldHandle["selfstate"]["onEvent"]>[0]
>[0];

function stateJson(handle: WorldHandle): Json {
  const { standState, ghostPending, timers } = handle.selfstate.state();
  return {
    ghostPending,
    standState: standState ?? null,
    timers: Object.keys(timers).sort(),
  };
}

async function run({ handle, settle }: FlowContext): Promise<Json> {
  const events: Json[] = [];
  const off = handle.selfstate.onEvent((event: SelfstateEvent) => {
    if (event.type === "stand_changed")
      events.push({ from: event.from ?? null, to: event.to });
  });
  try {
    const start = await settle(() => handle.selfstate.state().standState);
    const sit = await handle.selfstate.act.setStandState("sit");
    const sitting = stateJson(handle);
    const stand = await handle.selfstate.act.setStandState("stand");
    return {
      after: stateJson(handle),
      events,
      sit: sit.status,
      sitting,
      stand: stand.status,
      start: start ?? null,
    };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "selfstate-stand",
  run,
  usage:
    "--flow selfstate-stand: wait for the stand state from the self fields, sit with CMSG_STANDSTATECHANGE, then stand again; each act settles on SMSG_STANDSTATE_UPDATE or no_answer after 2 s.",
};
