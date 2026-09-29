import { describe, expect, test } from "bun:test";
import {
  type AreaState,
  type ChatMessage,
  ChatType,
  type NearbyRow,
  ObjectType,
} from "@peon/core";
import {
  chatEventObj,
  eventsJson,
  nearbyRowObj,
  resultJson,
} from "#harness/puppet/format";

const pos = (x: number, y: number, z: number, orientation = 1.5) => ({
  mapId: 530,
  orientation,
  x,
  y,
  z,
});

const unitBase = {
  class_: 1,
  combatReach: 1.5,
  displayId: 100,
  factionTemplate: 1604,
  gender: 0,
  maxPower: [100],
  power: [100],
  race: 10,
  rawFields: new Map<number, number>(),
  scale: 1,
};

const rowBase = {
  attackable: false,
  attackingMe: false,
  lootable: false,
  relation: "neutral",
  remotePose: undefined,
  roles: [],
  tapped: false,
  tappedByOther: false,
  targetOf: undefined,
};

const rows = [
  {
    ...rowBase,
    bearingRadians: 0.785_398_163_397_448_3,
    distance: 12.345_678,
    entity: {
      ...unitBase,
      entry: 15_274,
      guid: 0xf130003baa000123n,
      health: 42,
      level: 3,
      maxHealth: 55,
      name: "Mana Wyrm",
      npcFlags: 0,
      objectType: ObjectType.UNIT,
      position: pos(10_312.5, -6331.25, 29.1),
      target: 0n,
      unitFlags: 8,
    },
    horizontalDistance: 12.3,
    originSource: "server",
    originUpdatedAt: 1_000_000,
    position: pos(10_312.5, -6331.25, 29.1),
    positionKind: "observed",
    positionObservedAt: 999_750,
    positionSource: "movement",
    preparedAt: 1_000_100,
    remotePose: {
      extraFlags: 0,
      flags: 1,
      guid: 0xf130003baa000123n,
      motion: "moving",
      moverTime: 5555,
      position: pos(10_312.5, -6331.25, 29.1),
      receivedAt: 999_750,
      source: "update",
    },
    self: false,
    turnRadians: -0.25,
  },
  {
    ...rowBase,
    bearingRadians: null,
    distance: null,
    entity: {
      ...unitBase,
      entry: 0,
      guid: 0x2an,
      health: 90,
      level: 10,
      maxHealth: 90,
      name: "Fevala",
      npcFlags: 0,
      objectType: ObjectType.PLAYER,
      position: undefined,
      target: 0x17n,
      unitFlags: 0,
    },
    horizontalDistance: null,
    originSource: null,
    originUpdatedAt: null,
    position: undefined,
    positionKind: null,
    positionObservedAt: null,
    positionSource: null,
    preparedAt: 1_000_100,
    self: false,
    turnRadians: null,
  },
  {
    ...rowBase,
    bearingRadians: 3.1,
    distance: 4.999,
    entity: {
      bytes1: 0,
      displayId: 7,
      entry: 181_283,
      flags: 0,
      gameObjectType: 3,
      guid: 0xf110002c42000456n,
      name: "Sunstrider Mailbox",
      objectType: ObjectType.GAMEOBJECT,
      position: pos(10_300, -6330, 28, 0),
      rawFields: new Map<number, number>(),
      scale: 1,
    },
    horizontalDistance: 4.004,
    originSource: "predicted",
    originUpdatedAt: 1_000_050,
    position: pos(10_300, -6330, 28, 0),
    positionKind: "predicted",
    positionObservedAt: null,
    positionSource: "update_object",
    preparedAt: 1_000_100,
    self: false,
    turnRadians: 0,
  },
  {
    ...rowBase,
    bearingRadians: null,
    distance: 0,
    entity: {
      ...unitBase,
      entry: 0,
      guid: 0x17n,
      health: 100,
      level: 1,
      maxHealth: 100,
      name: "Fgklgoafpfk",
      npcFlags: 0,
      objectType: ObjectType.PLAYER,
      position: pos(10_305, -6329, 28.5, 2),
      target: 0n,
      unitFlags: 8,
    },
    horizontalDistance: 0,
    originSource: "self_entity",
    originUpdatedAt: 1_000_000,
    position: pos(10_305, -6329, 28.5, 2),
    positionKind: "observed",
    positionObservedAt: 1_000_000,
    positionSource: "control",
    preparedAt: 1_000_100,
    self: true,
    turnRadians: null,
  },
] as unknown as NearbyRow[];

const NEARBY_ROWS = [
  '{"bearingRadians":0.7853981633974483,"distance":12.35,"entry":15274,"guid":"0xf130003baa000123","horizontalDistance":12.3,"name":"Mana Wyrm","originSource":"server","originUpdatedAt":1000000,"self":false,"turnRadians":-0.25,"type":"unit","level":3,"health":42,"maxHealth":55,"target":"0x0","unitFlags":8,"npcFlags":0,"factionTemplate":1604,"mapId":530,"orientation":1.5,"positionAgeMs":350,"positionKind":"observed","positionObservedAt":999750,"positionSource":"movement","x":10312.5,"y":-6331.25,"z":29.1,"remotePose":{"ageMs":350,"extraFlags":0,"flags":1,"invalid":null,"mapId":530,"motion":"moving","moverTime":5555,"orientation":1.5,"receivedAt":999750,"source":"update","x":10312.5,"y":-6331.25,"z":29.1}}',
  '{"bearingRadians":null,"distance":null,"entry":0,"guid":"0x2a","horizontalDistance":null,"name":"Fevala","originSource":null,"originUpdatedAt":null,"self":false,"turnRadians":null,"type":"player","level":10,"health":90,"maxHealth":90,"target":"0x17","unitFlags":0,"npcFlags":0,"factionTemplate":1604}',
  '{"bearingRadians":3.1,"distance":5,"entry":181283,"guid":"0xf110002c42000456","horizontalDistance":4,"name":"Sunstrider Mailbox","originSource":"predicted","originUpdatedAt":1000050,"self":false,"turnRadians":0,"type":"gameobject","gameObjectType":3,"mapId":530,"orientation":0,"positionAgeMs":null,"positionKind":"predicted","positionObservedAt":null,"positionSource":"update_object","x":10300,"y":-6330,"z":28}',
  '{"bearingRadians":null,"distance":0,"entry":0,"guid":"0x17","horizontalDistance":0,"name":"Fgklgoafpfk","originSource":"self_entity","originUpdatedAt":1000000,"self":true,"turnRadians":null,"type":"player","level":1,"health":100,"maxHealth":100,"target":"0x0","unitFlags":8,"npcFlags":0,"factionTemplate":1604,"mapId":530,"orientation":2,"positionAgeMs":100,"positionKind":"observed","positionObservedAt":1000000,"positionSource":"control","x":10305,"y":-6329,"z":28.5}',
];

const chats: ChatMessage[] = [
  { message: "10", sender: "Fevala", type: ChatType.WHISPER },
  {
    message: "hey, what level are you?",
    sender: "Fevala",
    type: ChatType.WHISPER_INFORM,
  },
  {
    channel: "General - Eversong Woods",
    message: "|cffffd000|Hitem:6948:0|h[Hearthstone]|h|r anyone?",
    sender: "Somebody",
    type: ChatType.CHANNEL,
  },
  { message: "%s growls.", sender: "Mana Wyrm", type: ChatType.MONSTER_EMOTE },
  {
    message: "Server restart in 5 minutes",
    origin: "server",
    sender: "",
    type: ChatType.SYSTEM,
  },
  { message: "hello", sender: "Fevala", type: ChatType.SAY },
  { message: "odd", sender: "X", type: 99 },
];

const READ_EVENTS = [
  '{"message":"10","sender":"Fevala","type":"WHISPER_FROM"}',
  '{"message":"hey, what level are you?","sender":"Fevala","type":"WHISPER_TO"}',
  '{"message":"[Hearthstone] anyone?","sender":"Somebody","type":"CHANNEL","channel":"General - Eversong Woods"}',
  '{"message":"Mana Wyrm growls.","sender":"Mana Wyrm","type":"MONSTER_EMOTE"}',
  '{"message":"Server restart in 5 minutes","sender":"","type":"SERVER_BROADCAST"}',
  '{"message":"hello","sender":"Fevala","type":"SAY"}',
  '{"message":"odd","sender":"X","type":"TYPE_99"}',
];

describe("puppet JSON output, pinned to the CLI's", () => {
  test("nearby --json prints the rows in one result envelope", () => {
    expect(
      resultJson(
        "nearby",
        rows.map((row) => nearbyRowObj(row)),
      ),
    ).toBe(
      `{"command":"nearby","data":[${NEARBY_ROWS.join(",")}],"error":null,"events":[],"kind":"result"}`,
    );
  });

  test("nearby --json with nothing around prints an empty list", () => {
    expect(resultJson("nearby", [])).toBe(
      '{"command":"nearby","data":[],"error":null,"events":[],"kind":"result"}',
    );
  });

  test("read --json prints the chat events in one events envelope", () => {
    expect(eventsJson("read", chats.map(chatEventObj))).toBe(
      `{"command":"read","data":null,"error":null,"events":[${READ_EVENTS.join(",")}],"kind":"events"}`,
    );
  });

  test("read --json with no chat prints no events", () => {
    expect(eventsJson("read", [])).toBe(
      '{"command":"read","data":null,"error":null,"events":[],"kind":"events"}',
    );
  });

  test("start --json prints the started result", () => {
    expect(resultJson("start", { socket: "responsive", started: true })).toBe(
      '{"command":"start","data":{"socket":"responsive","started":true},"error":null,"events":[],"kind":"result"}',
    );
  });
});

type UnitMovement = AreaState<"unitmotion">["units"][number];

const SPEED_ROWS = [
  ["walk", 2.5, "create"],
  ["run", 3.5, "spline"],
  ["run_back", 4.5, "create"],
  ["swim", 4.722_222, "move_msg"],
  ["swim_back", 2.5, "create"],
  ["flight", 7, "create"],
  ["flight_back", 4.5, "create"],
  ["turn", 3.141_594, "create"],
  ["pitch", 3.14, "create"],
] as const;

function movementOf(guidValue: bigint, flagsValue: number): UnitMovement {
  return {
    flags: flagsValue,
    guid: guidValue,
    runBefore: 7,
    serverControlled: true,
    speeds: Object.fromEntries(
      SPEED_ROWS.map(([kind, value, source]) => [
        kind,
        { at: 5, source, value },
      ]),
    ),
    updatedAt: 5,
  } as UnitMovement;
}

describe("nearbyRowObj movement", () => {
  test("a unit with stored movement gains flags, nine sourced speeds, root and control", () => {
    const wyrm = rows[0];
    if (!wyrm) throw new Error("missing fixture row");
    const movements = new Map([
      [wyrm.entity.guid.toString(), movementOf(wyrm.entity.guid, 0x08_00)],
    ]);
    const movement = nearbyRowObj(wyrm, movements)["movement"] as Record<
      string,
      unknown
    >;
    expect(movement["flags"]).toBe(0x08_00);
    expect(movement["rooted"]).toBe(true);
    expect(movement["serverControlled"]).toBe(true);
    expect(Object.keys(movement["speeds"] as object)).toHaveLength(9);
    expect(movement["speeds"]).toEqual(
      Object.fromEntries(
        SPEED_ROWS.map(([kind, value, source]) => [kind, { source, value }]),
      ),
    );
  });

  test("a unit whose flags lack the root bit is not rooted", () => {
    const wyrm = rows[0];
    if (!wyrm) throw new Error("missing fixture row");
    const movements = new Map([
      [wyrm.entity.guid.toString(), movementOf(wyrm.entity.guid, 1)],
    ]);
    const movement = nearbyRowObj(wyrm, movements)["movement"] as Record<
      string,
      unknown
    >;
    expect(movement["flags"]).toBe(1);
    expect(movement["rooted"]).toBe(false);
  });

  test("the root bit is found among other flag bits", () => {
    const wyrm = rows[0];
    if (!wyrm) throw new Error("missing fixture row");
    const rootedOf = (flags: number): unknown => {
      const movements = new Map([
        [wyrm.entity.guid.toString(), movementOf(wyrm.entity.guid, flags)],
      ]);
      const movement = nearbyRowObj(wyrm, movements)["movement"] as Record<
        string,
        unknown
      >;
      return movement["rooted"];
    };
    expect(rootedOf(0x1_08_01)).toBe(true);
    expect(rootedOf(0x1_f7_ff)).toBe(false);
  });

  test("with no stored movement the row is unchanged", () => {
    const wyrm = rows[0];
    const other = rows[1];
    if (!(wyrm && other)) throw new Error("missing fixture row");
    const untouched = nearbyRowObj(wyrm);
    const missing = nearbyRowObj(
      wyrm,
      new Map([[other.entity.guid.toString(), movementOf(1n, 0)]]),
    );
    expect(missing).toEqual(untouched);
    expect("movement" in missing).toBe(false);
    expect("movement" in untouched).toBe(false);
  });
});
