import type { MirrorImagePacket } from "#wow/areas/spells/protocol";

export type MirrorImage = Readonly<MirrorImagePacket>;

export type MirrorImageEvent = {
  type: "mirror_image";
  guid: bigint;
  displayId: number;
  race: number;
  gender: number;
  classId: number;
};

export type MirrorRequest = "ok" | "not_visible" | "already_requested";

export class MirrorImages {
  private readonly images = new Map<bigint, MirrorImage>();
  private readonly requested = new Set<bigint>();
  private readonly visible: (guid: bigint) => boolean;
  private readonly emit: (event: MirrorImageEvent) => void;

  constructor(
    visible: (guid: bigint) => boolean,
    emit: (event: MirrorImageEvent) => void,
  ) {
    this.visible = visible;
    this.emit = emit;
  }

  request(guid: bigint): MirrorRequest {
    if (!this.visible(guid)) return "not_visible";
    if (this.requested.has(guid)) return "already_requested";
    this.requested.add(guid);
    return "ok";
  }

  accept(packet: MirrorImagePacket): void {
    if (!this.visible(packet.guid)) return;
    this.images.set(packet.guid, { ...packet, items: [...packet.items] });
    this.emit({
      classId: packet.classId,
      displayId: packet.displayId,
      gender: packet.gender,
      guid: packet.guid,
      race: packet.race,
      type: "mirror_image",
    });
  }

  drop(guid: bigint): void {
    this.images.delete(guid);
    this.requested.delete(guid);
  }

  snapshot(): MirrorImage[] {
    return [...this.images.values()].map((image) => ({
      ...image,
      items: [...image.items],
    }));
  }

  clear(): void {
    this.images.clear();
    this.requested.clear();
  }
}
