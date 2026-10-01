import type { WorldHandle } from "@peon/core";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { FlowContext, Json, ProbeFlow } from "#tools/probe-flows";

const MIRROR_IMAGE_NPC = 31_216;
const FIND_WAIT_MS = 8000;
const REPLY_WAIT_MS = 5000;
const POLL_MS = 100;

function spellOf(args: Readonly<Record<string, string>>): number {
  const spell = Number(args["spell"] ?? "");
  if (!Number.isInteger(spell) || spell <= 0)
    throw new Error(`spells-mirror needs spell=<id>, not "${args["spell"]}".`);
  return spell;
}

async function until(test: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (test()) return true;
    await Bun.sleep(POLL_MS);
  }
  return test();
}

function imageGuids(handle: WorldHandle): bigint[] {
  return handle
    .queryNearby()
    .filter(
      (row) => "entry" in row.entity && row.entity.entry === MIRROR_IMAGE_NPC,
    )
    .map((row) => row.entity.guid);
}

async function run({ handle, args }: FlowContext): Promise<Json> {
  const spell = spellOf(args);
  await handle.loadCatalogs().catch(ignoreFailure);
  handle.cast(spell, 0n);
  await until(() => imageGuids(handle).length > 0, FIND_WAIT_MS);
  const guids = imageGuids(handle);
  const requests = guids.map((guid) => ({
    guid,
    result: handle.spells.act.requestMirrorImage(guid),
  }));
  await until(
    () =>
      guids.every((guid) =>
        handle.spells.state().mirrorImages.some((image) => image.guid === guid),
      ),
    REPLY_WAIT_MS,
  );
  const held = handle.spells.state().mirrorImages;
  return {
    cast: guids.length > 0 ? "ok" : "no_images",
    images: requests.map(({ guid, result }) => {
      const image = held.find((m) => m.guid === guid);
      return {
        appearance: image
          ? {
              classId: image.classId,
              displayId: image.displayId,
              gender: image.gender,
              items: [...image.items],
              race: image.race,
            }
          : null,
        guid: `0x${guid.toString(16)}`,
        requested: result.ok,
      };
    }),
    spell,
  };
}

export const flow: ProbeFlow = {
  name: "spells-mirror",
  run,
  usage:
    "--flow spells-mirror --arg spell=<id>: cast the spell (Mirror Image 55342), find the summoned images (NPC 31216) nearby, request each with CMSG_GET_MIRRORIMAGE_DATA and report the appearance from SMSG_MIRRORIMAGE_DATA.",
};
