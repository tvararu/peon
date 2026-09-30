import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

function spellOf(args: Readonly<Record<string, string>>): number {
  const spell = Number(args["spell"] ?? 458);
  if (!Number.isInteger(spell) || spell <= 0)
    throw new Error(
      `selfstate-mount needs spell=<id>, not "${args["spell"]}".`,
    );
  return spell;
}

function describe(outcome: { status: string; reason?: string }): string {
  return outcome.reason ?? outcome.status;
}

async function run({ handle, settle, args }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  const events: Json[] = [];
  const off = handle.selfstate.onEvent((event) => {
    if (event.type === "stand_changed")
      events.push({ from: event.from ?? null, to: event.to });
    else if (event.type === "mounted")
      events.push({
        mounted: { displayId: event.displayId, taxi: event.taxi },
      });
    else if (event.type === "dismounted")
      events.push({ dismounted: { taxi: event.taxi } });
    else if (event.type === "mount_anim")
      events.push({ mountAnim: event.guid.toString() });
  });
  try {
    await handle.loadCatalogs();
    const before = handle.selfstate.state().collisionHeight ?? null;
    handle.cast(spell, 0n);
    const mounted = await settle(() => {
      const height = handle.selfstate.state().collisionHeight;
      return height === before ? undefined : height;
    });
    const special =
      args["special"] === "1"
        ? describe(handle.selfstate.act.mountSpecialAnim())
        : null;
    const dismount = describe(await handle.selfstate.act.dismount());
    if (mounted === undefined)
      throw new Error(
        `selfstate-mount saw no SMSG_MOVE_SET_COLLISION_HGT after casting ${spell}.`,
      );
    const after =
      (await settle(() => {
        const height = handle.selfstate.state().collisionHeight;
        return height === mounted ? undefined : height;
      })) ?? null;
    return {
      after,
      before,
      dismount,
      events,
      mounted: mounted ?? null,
      special,
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
    "--flow selfstate-mount [--arg spell=<id>] [--arg special=1]: cast the mount spell <id> (default 458) with the existing cast act and wait for the collision height from SMSG_MOVE_SET_COLLISION_HGT. With special=1, send CMSG_MOUNTSPECIAL_ANIM. Then dismount with the selfstate act and report the dismount outcome, the selfstate events and the height after it.",
};
