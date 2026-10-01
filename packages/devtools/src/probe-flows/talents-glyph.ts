import type { WorldHandle } from "@peon/core";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

type Args = Readonly<Record<string, string>>;
type ApplyResult = Awaited<
  ReturnType<WorldHandle["talents"]["act"]["applyGlyph"]>
>;

const GLYPH_SLOTS = 6;
const RETRY_ON = ["slot_locked", "wrong_slot_type", "invalid_glyph"];

function json(value: unknown): Json {
  return JSON.parse(
    JSON.stringify(value, (_key, part) =>
      typeof part === "bigint" ? `0x${part.toString(16)}` : part,
    ),
  );
}

function whole(args: Args, key: string): number | undefined {
  const raw = args[key];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0)
    throw new Error(`talents-glyph needs ${key}=<number>, not "${raw}".`);
  return value;
}

function glyphsOf(handle: WorldHandle): Json {
  const state = handle.talents.state();
  return json({
    enabledMask: state.fields?.enabledMask,
    glyphs: state.slots.map((slot) => ({
      glyphId: slot.glyphId,
      index: slot.index,
      typeId: slot.typeId,
    })),
  });
}

function locate(handle: WorldHandle, entry: number) {
  const found = handle
    .getInventoryState()
    .slots.find(
      (slot) => slot.status === "occupied" && slot.item.entry === entry,
    );
  if (!found) throw new Error(`talents-glyph found no item ${entry} carried.`);
  return { bag: found.bag, slot: found.slot };
}

async function apply(
  handle: WorldHandle,
  entry: number,
  glyphSlot: number | undefined,
): Promise<Json> {
  const at = locate(handle, entry);
  const tries: { glyphSlot: number; result: ApplyResult }[] = [];
  const candidates =
    glyphSlot === undefined
      ? Array.from({ length: GLYPH_SLOTS }, (_, index) => index)
      : [glyphSlot];
  for (const candidate of candidates) {
    const result = await handle.talents.act.applyGlyph({
      ...at,
      glyphSlot: candidate,
    });
    tries.push({ glyphSlot: candidate, result });
    if (!RETRY_ON.includes(result.outcome)) break;
  }
  return json({ at, tries });
}

async function run({ args, handle, settle }: FlowContext): Promise<Json> {
  const entry = whole(args, "item");
  const remove = whole(args, "remove");
  if (entry === undefined && remove === undefined)
    throw new Error("talents-glyph needs item=<entry> or remove=<slot>.");
  await settle(() =>
    handle.getInventoryState().status === "complete" &&
    handle.talents.state().player
      ? true
      : undefined,
  );
  const report: Record<string, Json> = { before: glyphsOf(handle) };
  if (entry !== undefined)
    report["apply"] = await apply(handle, entry, whole(args, "slot"));
  if (remove !== undefined)
    report["remove"] = json(await handle.talents.act.removeGlyph(remove));
  report["after"] = glyphsOf(handle);
  return report;
}

export const flow: ProbeFlow = {
  name: "talents-glyph",
  run,
  usage:
    "--flow talents-glyph [--arg item=<entry> [--arg slot=<0-5>]] [--arg remove=<0-5>]: apply the carried glyph item (without slot=, the first socket whose lock and type accept it), then remove the glyph in that socket; prints the sockets before and after.",
};
