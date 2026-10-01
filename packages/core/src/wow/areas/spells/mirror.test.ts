import { describe, expect, test } from "bun:test";
import { type MirrorImageEvent, MirrorImages } from "#wow/areas/spells/mirror";
import type { MirrorImagePacket } from "#wow/areas/spells/protocol";

const A = 0xf1_30_00_79_d8_00_00_11n;
const B = 0xf1_30_00_79_d8_00_00_12n;

function packet(guid: bigint, displayId = 100): MirrorImagePacket {
  return {
    classId: 8,
    displayId,
    face: 2,
    facialHair: 5,
    gender: 1,
    guid,
    guild: 9,
    hairColor: 4,
    hairStyle: 3,
    items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    race: 10,
    skin: 1,
  };
}

function setup(visible: Set<bigint>) {
  const events: MirrorImageEvent[] = [];
  const images = new MirrorImages(
    (guid) => visible.has(guid),
    (event) => events.push(event),
  );
  return { events, images };
}

describe("MirrorImages requests", () => {
  test("a guid that is not a visible unit is refused and not marked requested", () => {
    const visible = new Set<bigint>();
    const { images } = setup(visible);
    expect(images.request(A)).toBe("not_visible");
    visible.add(A);
    expect(images.request(A)).toBe("ok");
  });

  test("a second request for the same sighting is refused; another guid is not", () => {
    const { images } = setup(new Set([A, B]));
    expect(images.request(A)).toBe("ok");
    expect(images.request(A)).toBe("already_requested");
    expect(images.request(B)).toBe("ok");
  });

  test("the requested mark clears when the entity drops, so a new sighting can ask again", () => {
    const { images } = setup(new Set([A]));
    images.request(A);
    images.drop(A);
    expect(images.request(A)).toBe("ok");
  });
});

describe("MirrorImages replies", () => {
  test("a reply for a visible unit is stored and emits mirror_image with scalars", () => {
    const { events, images } = setup(new Set([A]));
    images.accept(packet(A));
    expect(images.snapshot()).toEqual([packet(A)]);
    expect(events).toEqual([
      {
        classId: 8,
        displayId: 100,
        gender: 1,
        guid: A,
        race: 10,
        type: "mirror_image",
      },
    ]);
  });

  test("a reply for a unit that left view is dropped silently", () => {
    const { events, images } = setup(new Set());
    images.accept(packet(A));
    expect(images.snapshot()).toEqual([]);
    expect(events).toEqual([]);
  });

  test("a second reply for the same guid replaces the first", () => {
    const { images } = setup(new Set([A]));
    images.accept(packet(A, 100));
    images.accept(packet(A, 200));
    expect(images.snapshot().map((i) => i.displayId)).toEqual([200]);
  });

  test("a drop removes the stored image; clear empties everything", () => {
    const { images } = setup(new Set([A, B]));
    images.accept(packet(A));
    images.accept(packet(B));
    images.drop(A);
    expect(images.snapshot().map((i) => i.guid)).toEqual([B]);
    images.clear();
    expect(images.snapshot()).toEqual([]);
    expect(images.request(B)).toBe("ok");
  });

  test("a snapshot is a copy that later replies do not change", () => {
    const { images } = setup(new Set([A, B]));
    images.accept(packet(A));
    const before = images.snapshot();
    images.accept(packet(B));
    expect(before.length).toBe(1);
  });
});
