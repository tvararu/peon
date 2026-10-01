import {
  loadScenario,
  ROUND_1,
  type Scenario,
} from "#harness/grader/scenarios";

type SetupStep = Scenario["setup"][number];
type Point = readonly [x: number, y: number, z: number];
export type Spawn = {
  map: number;
  zone: number;
  o: number;
  points: readonly Point[];
};

const EVERSONG: Spawn = {
  map: 530,
  o: 1.686,
  points: [
    [8735, -6685, 70.44],
    [8731, -6685, 70.59],
    [8735, -6689, 71],
    [8735, -6681, 69.92],
    [8739, -6685, 70.19],
    [8731, -6689, 71.19],
    [8731, -6681, 70.05],
    [8739, -6689, 70.68],
    [8739, -6681, 69.73],
    [8727, -6685, 70.64],
    [8735, -6693, 71.5],
    [8735, -6677, 69.58],
    [8743, -6685, 69.89],
    [8727, -6689, 71.26],
    [8727, -6681, 70.07],
    [8731, -6693, 71.74],
    [8731, -6677, 69.76],
    [8739, -6693, 71.09],
    [8739, -6677, 69.38],
    [8743, -6689, 70.23],
    [8743, -6681, 69.48],
    [8727, -6693, 71.85],
    [8727, -6677, 69.88],
    [8743, -6693, 70.3],
    [8743, -6677, 69.14],
    [8723, -6685, 70.7],
    [8735, -6673, 69.42],
    [8747, -6685, 69.56],
    [8723, -6689, 71.31],
    [8723, -6681, 70.3],
    [8731, -6673, 69.7],
    [8739, -6673, 69.15],
    [8747, -6689, 69.72],
    [8747, -6681, 69.22],
    [8723, -6693, 71.92],
    [8723, -6677, 70.05],
    [8727, -6673, 69.93],
    [8743, -6673, 68.9],
    [8747, -6693, 69.69],
    [8747, -6677, 68.89],
    [8735, -6697, 71.96],
    [8731, -6697, 72.28],
    [8739, -6697, 71.38],
    [8727, -6697, 72.44],
    [8743, -6697, 70.22],
    [8751, -6685, 69.26],
    [8737, -6671, 69.42],
    [8735, -6669, 69.56],
    [8733, -6671, 69.42],
  ],
  zone: 3430,
};

const GHOSTLANDS: Spawn = {
  map: 530,
  o: 4.007,
  points: [
    [7575, -6835, 88.66],
    [7571, -6835, 88.95],
    [7575, -6839, 89.74],
    [7575, -6831, 87.76],
    [7579, -6835, 88.5],
    [7571, -6839, 90.39],
    [7571, -6831, 87.84],
    [7579, -6839, 89.57],
    [7579, -6831, 87.59],
    [7583, -6835, 88.42],
    [7567, -6835, 88.95],
    [7575, -6843, 90.64],
    [7571, -6843, 91.28],
    [7579, -6843, 90.53],
    [7583, -6839, 89.55],
    [7583, -6831, 87.35],
  ],
  zone: 3433,
};

const FAIRBREEZE_SOUTH: Spawn = {
  map: 530,
  o: 1.686,
  points: [
    [8663, -6685, 75.57],
    [8663, -6689, 75],
    [8663, -6681, 76.48],
    [8663, -6693, 74.75],
    [8663, -6677, 77.67],
    [8659, -6685, 77.92],
    [8659, -6689, 77.45],
    [8659, -6693, 76.96],
  ],
  zone: 3430,
};

const FAIRBREEZE_EAST: Spawn = {
  map: 530,
  o: 1.686,
  points: [
    [8735, -6757, 85.13],
    [8731, -6757, 86.07],
    [8739, -6757, 83.48],
    [8735, -6761, 86.84],
    [8731, -6761, 87.43],
    [8727, -6757, 86.5],
    [8743, -6757, 81.27],
    [8727, -6761, 87.62],
  ],
  zone: 3430,
};

const EVERSONG_WEST: Spawn = {
  map: 530,
  o: 1.686,
  points: [
    [8748, -6634, 70.76],
    [8744, -6634, 70.54],
    [8748, -6638, 70.67],
    [8748, -6630, 70.75],
    [8752, -6634, 70.68],
    [8744, -6638, 70.54],
    [8744, -6630, 70.59],
    [8752, -6638, 70.58],
    [8752, -6630, 70.61],
    [8740, -6634, 70.48],
    [8748, -6642, 70.44],
    [8748, -6626, 70.67],
    [8756, -6634, 70.23],
    [8740, -6638, 70.46],
    [8740, -6630, 70.54],
    [8744, -6642, 70.53],
    [8744, -6626, 70.62],
    [8752, -6642, 70.27],
    [8752, -6626, 70.4],
    [8756, -6638, 70.16],
    [8756, -6630, 70.2],
    [8740, -6642, 70.5],
    [8740, -6626, 70.54],
    [8756, -6642, 69.88],
  ],
  zone: 3430,
};

const SPAWN_OF: Readonly<Record<string, Spawn>> = {
  eversong10: EVERSONG,
  "eversong10-hunter": EVERSONG,
  "eversong10-mage": EVERSONG,
  "eversong10-warrior": EVERSONG,
  ghostlands20: GHOSTLANDS,
};

const EVERSONG_RAID: Spawn = {
  map: 530,
  o: 1.686,
  points: [
    [8735, -6550, 67.35],
    [8731, -6550, 68.15],
    [8739, -6550, 66.5],
    [8735, -6554, 67.85],
    [8731, -6554, 68.69],
    [8739, -6554, 66.89],
    [8735, -6546, 66.88],
    [8731, -6546, 67.67],
  ],
  zone: 3430,
};

const EVERSONG_TRADE: Spawn = {
  map: 530,
  o: 1.686,
  points: [
    [8640, -6600, 85.19],
    [8636, -6600, 86.24],
    [8644, -6600, 84.23],
    [8640, -6604, 85.05],
    [8636, -6604, 86.19],
    [8644, -6604, 84.01],
    [8640, -6596, 85.18],
    [8636, -6596, 86.2],
    [8644, -6596, 84.37],
    [8640, -6592, 85.03],
    [8636, -6592, 86.01],
    [8644, -6592, 84.24],
    [8648, -6600, 82.41],
    [8648, -6604, 82.2],
    [8648, -6596, 83.02],
    [8648, -6592, 83.32],
    [8632, -6600, 87.48],
    [8632, -6604, 87.48],
    [8632, -6596, 87.41],
    [8632, -6592, 87.21],
  ],
  zone: 3430,
};

const EVERSONG_READY: Spawn = {
  map: 530,
  o: 1.686,
  points: [
    [8735, -6470, 60.18],
    [8731, -6470, 60.54],
    [8739, -6470, 59.58],
    [8735, -6474, 60.33],
    [8731, -6474, 60.72],
    [8739, -6474, 59.81],
    [8735, -6466, 59.76],
    [8731, -6466, 60.11],
    [8739, -6466, 59.13],
    [8743, -6470, 58.93],
    [8743, -6474, 59.21],
    [8743, -6466, 58.5],
    [8727, -6470, 60.65],
    [8727, -6474, 60.97],
    [8727, -6466, 60.22],
    [8735, -6462, 59.12],
  ],
  zone: 3430,
};

const EVERSONG_PETS: Spawn = {
  map: 530,
  o: 1.686,
  points: [
    [8825, -6645, 51.5],
    [8821, -6645, 52.44],
    [8825, -6649, 51.32],
    [8825, -6641, 51.81],
    [8829, -6645, 50.64],
    [8821, -6649, 52.36],
    [8821, -6641, 52.54],
    [8829, -6649, 50.35],
    [8829, -6641, 51.09],
    [8817, -6645, 53.31],
    [8825, -6653, 51.29],
    [8825, -6637, 52.26],
    [8833, -6645, 49.94],
    [8817, -6649, 53.41],
    [8817, -6641, 53.09],
    [8821, -6653, 52.46],
  ],
  zone: 3430,
};

const EVERSONG_UNLEARN: Spawn = {
  map: 530,
  o: 1.686,
  points: [
    [8900, -6390, 13.52],
    [8896, -6390, 14.51],
    [8904, -6390, 12.54],
    [8900, -6394, 13.95],
    [8900, -6386, 13.05],
  ],
  zone: 3430,
};
const UNDERCITY_WARRIOR: Spawn = {
  map: 0,
  o: 0,
  points: [
    [1775.77, 409.61, -57.11],
    [1777.77, 409.61, -57.11],
    [1773.77, 409.61, -57.11],
    [1775.77, 411.61, -57.11],
  ],
  zone: 1497,
};

const NAMED: Readonly<Record<string, Spawn>> = {
  eversong: EVERSONG,
  "eversong-pets": EVERSONG_PETS,
  "eversong-raid": EVERSONG_RAID,
  "eversong-ready": EVERSONG_READY,
  "eversong-trade": EVERSONG_TRADE,
  "eversong-unlearn": EVERSONG_UNLEARN,
  "eversong-west": EVERSONG_WEST,
  "fairbreeze-east": FAIRBREEZE_EAST,
  "fairbreeze-south": FAIRBREEZE_SOUTH,
  ghostlands: GHOSTLANDS,
  "undercity-warrior": UNDERCITY_WARRIOR,
};

export function spawnOf(scenario: Scenario): Spawn | undefined {
  const { spawn } = scenario;
  if (spawn === undefined) return SPAWN_OF[scenario.preset];
  const named = NAMED[spawn];
  if (named === undefined)
    throw new Error(`unknown spawn ${spawn} in ${scenario.id}`);
  return named;
}

export type StartSlots = { agent: SetupStep; partner: SetupStep };

function positionStep(spawn: Spawn, point: Point): SetupStep {
  const [x, y, z] = point;
  return {
    body: { map: spawn.map, o: spawn.o, x, y, z, zone: spawn.zone },
    endpoint: "position",
  };
}

export function startSlots(
  scenario: Scenario,
  replica: number,
): StartSlots | undefined {
  const spawn = spawnOf(scenario);
  if (spawn === undefined) return undefined;
  const group = ROUND_1.filter((id) => spawnOf(loadScenario(id)) === spawn);
  const index = group.indexOf(scenario.id);
  const slot = index < 0 ? -1 : index + (replica - 1) * group.length;
  const agent = slot < 0 ? undefined : spawn.points[2 * slot];
  const partner = spawn.points[2 * slot + 1];
  if (agent === undefined || partner === undefined)
    throw new Error(`no start slot for ${scenario.id} replica ${replica}`);
  return {
    agent: positionStep(spawn, agent),
    partner: positionStep(spawn, partner),
  };
}
