import { describe, expect, test } from "bun:test";
import type { InteractAfter, TravelAfter } from "#harness/contract/details";
import { pinnedBy } from "#harness/ops/remembered";
import { createSightings, SIGHTING_TTL_MS } from "#harness/ops/sightings";
import { unitViews } from "#harness/ops/views";
import { interactSpec } from "#harness/tools/interact";
import { lookTool } from "#harness/tools/look";
import { travelSpec } from "#harness/tools/travel";
import {
  driveGoto,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { answer } from "#test-support/quest-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";
import { runTool } from "#test-support/tool-harness";

const ERONA = 0x40n;
const RESPAWNED = 0x41n;

function erona(guid: bigint, distance: number, x = 106) {
  return unitRow({
    distance,
    entry: 15_402,
    guid,
    level: 12,
    name: "Magistrix Erona",
    relation: "friendly",
    roles: ["questgiver"],
    x,
    y: 0,
    z: 5,
  });
}

async function remembered() {
  const t = await createTestRuntime();
  t.rt.sightings = createSightings(t.rt.clock);
  setSelf(t.handle, { x: 0, y: 0 });
  setUnits(t.handle, [erona(ERONA, 106)]);
  unitViews(toolCtx<TravelAfter>(t));
  setUnits(t.handle, []);
  t.clock.advance(180_000);
  return t;
}

describe("remembered NPCs", () => {
  test("a questgiver is remembered after the sightings TTL", async () => {
    const t = await remembered();
    t.clock.advance(SIGHTING_TTL_MS);
    t.rt.sightings.prune(t.clock.now());
    expect(t.rt.sightings.get(ERONA)?.name).toBe("Magistrix Erona");
  });

  test("travel to a questgiver out of view walks to where it was last seen, then to it", async () => {
    const t = await remembered();
    const goTo = driveGoto(t.handle, [
      {
        arrive: { x: 98, y: 0, z: 5 },
        onArrive: () => setUnits(t.handle, [erona(ERONA, 8)]),
      },
      { arrive: { x: 104, y: 0, z: 5 } },
    ]);
    const res = await travelSpec.run(
      { to: "Magistrix Erona" },
      toolCtx<TravelAfter>(t),
    );
    expect(goTo).toHaveBeenNthCalledWith(1, {
      kind: "point",
      x: 106,
      y: 0,
      z: 5,
    });
    expect(goTo).toHaveBeenNthCalledWith(2, { guid: ERONA, kind: "guid" });
    expect(res.status).toBe("DONE");
    expect(res.detail).toStartWith("arrived at Magistrix Erona");
  });

  test("a respawned NPC is found again by its entry", async () => {
    const t = await remembered();
    const goTo = driveGoto(t.handle, [
      {
        arrive: { x: 98, y: 0, z: 5 },
        onArrive: () => setUnits(t.handle, [erona(RESPAWNED, 8)]),
      },
      { arrive: { x: 104, y: 0, z: 5 } },
    ]);
    const res = await travelSpec.run(
      { to: "Magistrix Erona" },
      toolCtx<TravelAfter>(t),
    );
    expect(goTo).toHaveBeenNthCalledWith(2, { guid: RESPAWNED, kind: "guid" });
    expect(res.status).toBe("DONE");
  });

  test("an NPC that is not at its last-known point fails with a look step", async () => {
    const t = await remembered();
    driveGoto(t.handle, [{ arrive: { x: 98, y: 0, z: 5 } }]);
    const res = await travelSpec.run(
      { to: "Magistrix Erona" },
      toolCtx<TravelAfter>(t),
    );
    expect(res).toMatchObject({
      next: 'look(find: "questgiver")',
      reason: "not_at_last_known",
      status: "FAILED",
    });
    expect(res.detail).toMatch(/Magistrix Erona u\d+/);
    expect(res.detail).toContain("8 yd N");
    expect(res.detail).toContain("3 min ago");
  });

  test("after not_at_last_known the next look no longer lists the old point", async () => {
    const t = await remembered();
    const look = () =>
      runTool(lookTool.definition(t.rt), { find: "questgiver" });
    expect((await look()).text).toContain("Magistrix Erona");
    driveGoto(t.handle, [{ arrive: { x: 98, y: 0, z: 5 } }]);
    await travelSpec.run({ to: "Magistrix Erona" }, toolCtx<TravelAfter>(t));
    expect(t.rt.sightings.get(ERONA)).toBeUndefined();
    expect((await look()).text).not.toContain("Magistrix Erona");
  });

  test("interact with a questgiver out of view walks to it and talks", async () => {
    const t = await remembered();
    let cancelled = 0;
    t.handle.cancelInteraction = () => {
      cancelled += 1;
    };
    t.handle.talk = () => answer(t.handle, "window", {});
    const goTo = driveGoto(t.handle, [
      {
        arrive: { x: 98, y: 0, z: 5 },
        onArrive: () => setUnits(t.handle, [erona(ERONA, 8)]),
      },
      {
        arrive: { x: 104, y: 0, z: 5 },
        onArrive: () => setUnits(t.handle, [erona(ERONA, 2)]),
      },
    ]);
    const res = await interactSpec.run(
      { npc: "Magistrix Erona" },
      toolCtx<InteractAfter>(t),
    );
    expect(goTo).toHaveBeenNthCalledWith(1, {
      kind: "point",
      x: 106,
      y: 0,
      z: 5,
    });
    expect(res.status).toBe("DONE");
    expect(cancelled).toBe(1);
  });

  test("interact with a remembered NPC that is gone fails not_at_last_known", async () => {
    const t = await remembered();
    driveGoto(t.handle, [{ arrive: { x: 98, y: 0, z: 5 } }]);
    await expect(
      interactSpec.run(
        { do: "turn_in", npc: "Magistrix Erona" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({
      next: 'look(find: "questgiver")',
      reason: "not_at_last_known",
      status: "FAILED",
    });
  });
});

describe("pinnedBy", () => {
  test("keeps a quest ender with no NPC flags past the TTL", async () => {
    const t = await createTestRuntime();
    t.rt.quests.set(783, {
      ender: "Marshal McBride",
      giver: "Deputy Willem",
      objectives: "Speak with Marshal McBride.",
      title: "A Threat Within",
    });
    t.rt.sightings = createSightings(t.rt.clock, pinnedBy(t.rt.quests));
    setSelf(t.handle, { x: 0, y: 0 });
    setUnits(t.handle, [
      unitRow({
        distance: 56,
        guid: 0x50n,
        name: "Marshal McBride",
        relation: "friendly",
        x: 56,
        y: 0,
      }),
    ]);
    unitViews(toolCtx<TravelAfter>(t));
    t.clock.advance(SIGHTING_TTL_MS + 1);
    expect(t.rt.sightings.get(0x50n)?.name).toBe("Marshal McBride");
  });
});
