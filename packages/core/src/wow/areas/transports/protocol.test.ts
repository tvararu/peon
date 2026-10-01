import { describe, expect, test } from "bun:test";
import {
  transportsGameObjectQueryBody,
  transportsMissingQueryBody,
} from "#test-support/areas/transports";
import { must } from "#test-support/must";
import {
  type GameObjectTemplateRow,
  readGameObjectTemplate,
  templateFromQueryBody,
} from "#wow/areas/transports/protocol";
import { PacketReader } from "#wow/protocol/packet";

describe("readGameObjectTemplate", () => {
  test("a type 15 template carries the taxi path, speed and map", () => {
    const body = transportsGameObjectQueryBody({
      entry: 190_549,
      type: 15,
      data: { 0: 7, 1: 30, 2: 5, 6: 1 },
    });
    const t = must(
      readGameObjectTemplate(templateFromQueryBody(new PacketReader(body))),
    );
    expect(t).toEqual({
      entry: 190_549,
      taxiPathId: 7,
      moveSpeed: 30,
      accelRate: 5,
      mapId: 1,
      pauseAtTime: 0,
      startOpen: 0,
    } satisfies GameObjectTemplateRow);
  });

  test("a type 11 template carries only the pause time", () => {
    const body = transportsGameObjectQueryBody({
      entry: 50,
      type: 11,
      data: { 0: 4000 },
    });
    expect(
      must(
        readGameObjectTemplate(templateFromQueryBody(new PacketReader(body))),
      ),
    ).toEqual({
      entry: 50,
      taxiPathId: 0,
      moveSpeed: 0,
      accelRate: 0,
      mapId: 0,
      pauseAtTime: 4000,
      startOpen: 0,
    } satisfies GameObjectTemplateRow);
  });

  test("other game object types are not transports", () => {
    const body = transportsGameObjectQueryBody({ entry: 9, type: 8 });
    expect(
      readGameObjectTemplate(templateFromQueryBody(new PacketReader(body))),
    ).toBeUndefined();
  });

  test("a missing template row is not a transport", () => {
    expect(
      readGameObjectTemplate(
        templateFromQueryBody(
          new PacketReader(transportsMissingQueryBody(190_549)),
        ),
      ),
    ).toBeUndefined();
  });
});
