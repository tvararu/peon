import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function spellOf(args: Readonly<Record<string, string>>): number {
  const spell = Number(args["spell"] ?? 458);
  if (!Number.isInteger(spell) || spell <= 0)
    throw new Error(
      `selfstate-mount needs spell=<id>, not "${args["spell"]}".`,
    );
  return spell;
}

async function run({ handle, settle, args }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  const events: Json[] = [];
  const off = handle.selfstate.onEvent((event) => {
    if (event.type === "stand_changed")
      events.push({ from: event.from ?? null, to: event.to });
  });
  try {
    await handle.loadCatalogs();
    const before = handle.selfstate.state().collisionHeight ?? null;
    handle.cast(spell, 0n);
    const mounted = await settle(
      () => handle.selfstate.state().collisionHeight,
    );
    const cancel = handle.spells.act.cancelAura(spell);
    const cancelStatus = cancel.ok ? "ok" : cancel.reason;
    const after =
      (await settle(() => {
        const height = handle.selfstate.state().collisionHeight;
        return height === mounted ? undefined : height;
      })) ?? null;
    return {
      after,
      before,
      cancel: cancelStatus,
      events,
      mounted: mounted ?? null,
      spell,
    };
  } finally {
    off();
  }
}

export const flow: ProbeFlow = {
  name: "selfstate-mount",
  run,
  usage:
    "--flow selfstate-mount [--arg spell=<id>]: cast the mount spell <id> (default 458) with the existing cast act, wait for the collision height from SMSG_MOVE_SET_COLLISION_HGT, then cancel the aura and report the height after the dismount.",
};
