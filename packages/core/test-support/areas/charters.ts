import { areaRig } from "#test-support/area-rig";
import { type ItemsWorld, itemsWorld } from "#test-support/areas/items-world";
import type { AreaHandle } from "#wow/areas/compose";
import type { SentPacket } from "#wow/areas/port";
import type { Entity } from "#wow/entity-store";
import { ObjectType } from "#wow/protocol/entity-fields";
import { PacketWriter } from "#wow/protocol/packet";
import { ITEM_FIELDS, PLAYER_FIELDS } from "#wow/protocol/update-fields";
import type { OpcodeDispatch } from "#wow/protocol/world";
import type { SessionStores } from "#wow/session-stores";

export const CHARTERS_ME = 0x0b_00n;
export const CHARTERS_GUILD_MASTER = 0xf1_30_00_00_00_00_1e_b4n;
export const CHARTERS_ORGANIZER = 0xf1_30_00_00_00_00_1e_b5n;
export const CHARTERS_CHARTER = 0x40_00_00_00_00_00_00_31n;
export const CHARTERS_PETITION_ID = 7;
export const CHARTERS_SIGNER = 0x0c_00n;

const PETITIONER = 0x4_00_00;
const TABARD_DESIGNER = 0x8_00_00;

export type ShowlistEntry = {
  index: number;
  entry: number;
  displayId: number;
  cost: number;
  unknown: number;
  required: number;
};

export const GUILD_ENTRY: ShowlistEntry = {
  cost: 1000,
  displayId: 16_161,
  entry: 5863,
  index: 1,
  required: 9,
  unknown: 0,
};

export const ARENA_ENTRIES: readonly ShowlistEntry[] = [
  {
    cost: 800_000,
    displayId: 16_161,
    entry: 23_560,
    index: 1,
    required: 2,
    unknown: 2,
  },
  {
    cost: 1_200_000,
    displayId: 16_161,
    entry: 23_561,
    index: 2,
    required: 3,
    unknown: 3,
  },
  {
    cost: 2_000_000,
    displayId: 16_161,
    entry: 23_562,
    index: 3,
    required: 5,
    unknown: 5,
  },
];

export function chartersShowlistBody(
  vendor: bigint,
  entries: readonly ShowlistEntry[],
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(vendor);
  w.uint8(entries.length);
  for (const e of entries) {
    w.uint32LE(e.index);
    w.uint32LE(e.entry);
    w.uint32LE(e.displayId);
    w.uint32LE(e.cost);
    w.uint32LE(e.unknown);
    w.uint32LE(e.required);
  }
  return w.finish();
}

export type QueryResponseInit = {
  id: number;
  owner: bigint;
  name: string;
  type: number;
  needed: number;
};

export function chartersQueryResponseBody(init: QueryResponseInit): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(init.id);
  w.uint64LE(init.owner);
  w.cString(init.name);
  w.uint8(0);
  if (init.type === 0) {
    w.uint32LE(init.needed);
    w.uint32LE(init.needed);
    w.uint32LE(0);
  } else {
    w.uint32LE(init.type - 1);
    w.uint32LE(init.type - 1);
    w.uint32LE(init.type);
  }
  for (let i = 0; i < 4; i++) w.uint32LE(0);
  w.uint16LE(0);
  for (let i = 0; i < 3; i++) w.uint32LE(0);
  for (let i = 0; i < 10; i++) w.uint8(0);
  w.uint32LE(0);
  w.uint32LE(init.type === 0 ? 0 : 1);
  return w.finish();
}

export type SignaturesInit = {
  item: bigint;
  requester: bigint;
  petition: number;
  signers: readonly bigint[];
};

export function chartersSignaturesBody(init: SignaturesInit): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(init.item);
  w.uint64LE(init.requester);
  w.uint32LE(init.petition);
  w.uint8(init.signers.length);
  for (const signer of init.signers) {
    w.uint64LE(signer);
    w.uint32LE(0);
  }
  return w.finish();
}

export function chartersRenameBody(item: bigint, name: string): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(item);
  w.cString(name);
  return w.finish();
}

export function chartersCommandResultBody(
  command: number,
  name: string,
  result: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(command);
  w.cString(name);
  w.uint32LE(result);
  return w.finish();
}

export function chartersItemPushBody(
  self: bigint,
  itemId: number,
  position: { bag: number; slot: number } = { bag: 255, slot: 24 },
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(self);
  w.uint32LE(1);
  w.uint32LE(0);
  w.uint32LE(1);
  w.uint8(position.bag);
  w.uint32LE(position.slot);
  w.uint32LE(itemId);
  w.uint32LE(0);
  w.uint32LE(0);
  w.uint32LE(1);
  w.uint32LE(1);
  return w.finish();
}

export function chartersBuyFailedBody(
  vendor: bigint,
  itemId: number,
  result: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(vendor);
  w.uint32LE(itemId);
  w.uint8(result);
  return w.finish();
}

export function chartersSignResultBody(
  item: bigint,
  signer: bigint,
  result: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(item);
  w.uint64LE(signer);
  w.uint32LE(result);
  return w.finish();
}

export function chartersDeclineBody(signer: bigint): Uint8Array {
  const w = new PacketWriter();
  w.uint64LE(signer);
  return w.finish();
}

export function chartersTurnInResultBody(code: number): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(code);
  return w.finish();
}

export function chartersArenaCommandResultBody(
  action: number,
  team: string,
  player: string,
  error: number,
): Uint8Array {
  const w = new PacketWriter();
  w.uint32LE(action);
  w.cString(team);
  w.cString(player);
  w.uint32LE(error);
  return w.finish();
}

export function chartersFailureBody(result: number): Uint8Array {
  const w = new PacketWriter();
  w.uint8(result);
  w.uint64LE(0n);
  w.uint64LE(0n);
  w.uint8(0);
  return w.finish();
}

const low = (guid: bigint) => Number(guid & 0xff_ff_ff_ffn);
const high = (guid: bigint) => Number(guid >> 32n);

function here() {
  return { mapId: 0, orientation: 0, x: 0, y: 0, z: 0 };
}

function charterNpc(guid: bigint, entry: number, flags: number): Entity {
  return {
    displayId: 0,
    entry,
    factionTemplate: 0,
    guid,
    health: 100,
    level: 60,
    maxHealth: 100,
    name: undefined,
    npcFlags: flags,
    objectType: ObjectType.UNIT,
    position: here(),
    rawFields: new Map(),
    scale: 1,
    target: 0n,
  } as Entity;
}

export function chartersGuildMaster(): Entity {
  return charterNpc(
    CHARTERS_GUILD_MASTER,
    28_774,
    PETITIONER | TABARD_DESIGNER,
  );
}

export function chartersOrganizer(): Entity {
  return charterNpc(CHARTERS_ORGANIZER, 29_534, PETITIONER);
}

export function chartersStranger(guid: bigint): Entity {
  return charterNpc(guid, 1234, 0);
}
export function chartersCharter(
  world: ItemsWorld,
  slot: number,
  guid: bigint = CHARTERS_CHARTER,
  petitionId?: number | undefined,
): Entity {
  const entity = world.put(255, slot, { entry: 5863, guid });
  if (petitionId !== undefined)
    (entity.rawFields as Map<number, number>).set(
      ITEM_FIELDS.ENCHANTMENT_1_1.offset,
      petitionId,
    );
  return entity;
}

export function chartersArenaCharter(
  world: ItemsWorld,
  slot: number,
  guid: bigint,
  petitionId?: number | undefined,
): Entity {
  const entity = world.put(255, slot, { entry: 23_560, guid });
  if (petitionId !== undefined)
    (entity.rawFields as Map<number, number>).set(
      ITEM_FIELDS.ENCHANTMENT_1_1.offset,
      petitionId,
    );
  return entity;
}

export function chartersSetGuild(world: ItemsWorld, guildId: number): void {
  (world.player.rawFields as Map<number, number>).set(
    PLAYER_FIELDS.GUILDID.offset,
    guildId,
  );
}

export type ChartersRig = {
  dispatch: OpcodeDispatch;
  stores: SessionStores;
  handle: AreaHandle<"charters">;
  sent: readonly SentPacket[];
  inject: (opcode: number, body: Uint8Array) => void;
  touch: () => void;
  dispose: () => void;
};

export function chartersRig(world: ItemsWorld): ChartersRig {
  const master = chartersGuildMaster();
  const organizer = chartersOrganizer();
  const self = { ...world.player, position: here() } as Entity;
  const rig = areaRig("charters", {
    getEntity: (guid) => {
      if (guid === world.player.guid) return self;
      if (guid === CHARTERS_GUILD_MASTER) return master;
      if (guid === CHARTERS_ORGANIZER) return organizer;
      if (guid === 0x99n) return chartersStranger(guid);
      return world.lookup(guid);
    },
    selfGuid: world.player.guid,
  });
  return {
    ...rig,
    touch: () =>
      rig.events.entity.emit({ changed: [], entity: self, type: "update" }),
  };
}

export function chartersScene(seed: (world: ItemsWorld) => void = () => {}) {
  const world = itemsWorld(CHARTERS_ME);
  seed(world);
  const rig = chartersRig(world);
  rig.touch();
  return { rig, world };
}

export { high as chartersHigh, low as chartersLow };
