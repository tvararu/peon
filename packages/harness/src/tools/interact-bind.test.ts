import { describe, expect, jest, test } from "bun:test";
import type { NearbyRow } from "@peon/core";
import type { InteractAfter } from "#harness/contract/details";
import { interactSpec } from "#harness/tools/interact";
import {
  contentOf,
  driveGoto,
  setSelf,
  setUnits,
  toolCtx,
  unitRow,
} from "#test-support/ops-fixtures";
import { createTestRuntime } from "#test-support/runtime-fixture";

const INNKEEPER = unitRow({
  distance: 3,
  guid: 0x50n,
  name: "Innkeeper Delaniel",
  relation: "friendly",
  roles: ["innkeeper"],
  x: 3,
  y: 0,
});

const VENDOR = unitRow({
  distance: 3,
  guid: 0x51n,
  name: "Marniel Amberlight",
  relation: "friendly",
  roles: ["vendor"],
  x: 3,
  y: 0,
});

async function world(row: NearbyRow) {
  const t = await createTestRuntime();
  setSelf(t.handle);
  setUnits(t.handle, [row]);
  t.handle.cancelInteraction = () => undefined;
  return t;
}

describe("interact bind", () => {
  test("at an innkeeper it binds once and reports the new home", async () => {
    const t = await world(INNKEEPER);
    const called: bigint[] = [];
    t.handle.getPlaceState = () => ({
      area: "Falconwing Square",
      areaId: 3665,
      at: 0,
      mapId: 530,
      zone: "Eversong Woods",
      zoneId: 3430,
    });
    jest
      .spyOn(t.handle.travel.act, "bindActivate")
      .mockImplementation((npc: bigint) => {
        called.push(npc);
        return Promise.resolve({
          home: { areaId: 3665, mapId: 530, x: 1, y: 2, z: 3 },
          status: "ok" as const,
        });
      });
    const res = await interactSpec.run(
      { do: "bind", npc: "Innkeeper Delaniel" },
      toolCtx<InteractAfter>(t),
    );
    expect(called).toEqual([0x50n]);
    expect(res.status).toBe("DONE");
    expect(contentOf(res)).toContain("Falconwing Square");
  });
  test("at a non-innkeeper it refuses without calling the act", async () => {
    const t = await world(VENDOR);
    const bindActivate = jest.spyOn(t.handle.travel.act, "bindActivate");
    await expect(
      interactSpec.run(
        { do: "bind", npc: "Marniel Amberlight" },
        toolCtx<InteractAfter>(t),
      ),
    ).rejects.toMatchObject({ reason: "not_innkeeper" });
    expect(bindActivate).not.toHaveBeenCalled();
  });

  test("a silent refusal is UNCONFIRMED no_answer", async () => {
    const t = await world(INNKEEPER);
    jest
      .spyOn(t.handle.travel.act, "bindActivate")
      .mockResolvedValue({ status: "no_answer" });

    const res = await interactSpec.run(
      { do: "bind", npc: "Innkeeper Delaniel" },
      toolCtx<InteractAfter>(t),
    );
    expect(res).toMatchObject({ reason: "no_answer", status: "UNCONFIRMED" });
  });

  test("bind walks to the innkeeper first", async () => {
    const t = await world(
      unitRow({
        distance: 12,
        guid: 0x50n,
        name: "Innkeeper Delaniel",
        relation: "friendly",
        roles: ["innkeeper"],
        x: 12,
        y: 0,
      }),
    );
    const goTo = driveGoto(t.handle, [{ arrive: { x: 9, y: 0 } }]);
    jest.spyOn(t.handle.travel.act, "bindActivate").mockResolvedValue({
      home: { areaId: 3665, mapId: 530, x: 1, y: 2, z: 3 },
      status: "ok" as const,
    });
    await interactSpec.run(
      { do: "bind", npc: "Innkeeper Delaniel" },
      toolCtx<InteractAfter>(t),
    );
    expect(goTo).toHaveBeenCalledWith({ guid: 0x50n, kind: "guid" });
  });
});
