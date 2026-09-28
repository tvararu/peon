import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

type Args = Readonly<Record<string, string>>;
type Button = { type: "spell" | "item"; id: number } | undefined;

const SEND_GRACE_MS = 1000;

function whole(args: Args, key: string): number | undefined {
  const raw = args[key];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value))
    throw new Error(`spells-bar needs ${key}=<integer>, not "${raw}".`);
  return value;
}

function buttonOf(args: Args): Button {
  const spell = whole(args, "spell");
  const item = whole(args, "item");
  if (spell !== undefined) return { id: spell, type: "spell" };
  if (item !== undefined) return { id: item, type: "item" };
  return undefined;
}

function barJson(handle: WorldHandle): Json {
  return handle
    .getActionBar()
    .map((b) => ({ id: b.id, slot: b.slot, type: b.type }));
}

async function run({ handle, args, settle }: FlowContext): Promise<Json> {
  const slot = whole(args, "slot");
  const toggles = whole(args, "toggles");
  if (slot === undefined && toggles === undefined)
    throw new Error("spells-bar needs slot=<n> or toggles=<mask>.");
  const out: Record<string, Json> = { before: barJson(handle) };
  if (slot !== undefined) {
    const button = buttonOf(args);
    const result = handle.spells.act.setActionButton(slot, button);
    out["button"] = result.ok ? "ok" : result.reason;
  }
  if (toggles !== undefined) {
    const result = handle.spells.act.setActionBarToggles(toggles);
    out["toggles"] = result.ok ? "ok" : result.reason;
    const seen = await settle(() =>
      handle.spells.state().barToggles === toggles ? toggles : undefined,
    );
    out["barToggles"] = seen ?? handle.spells.state().barToggles ?? null;
  }
  await Bun.sleep(SEND_GRACE_MS);
  out["after"] = barJson(handle);
  return out;
}

export const flow: ProbeFlow = {
  name: "spells-bar",
  run,
  usage:
    "--flow spells-bar --arg slot=<n> [--arg spell=<id> | --arg item=<id>] and/or --arg toggles=<mask>: set (or, with no spell or item, clear) one action button with CMSG_SET_ACTION_BUTTON, set the bar toggles with CMSG_SET_ACTIONBAR_TOGGLES and wait for PLAYER_FIELD_BYTES byte 2 to show them.",
};
