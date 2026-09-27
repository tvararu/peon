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

const SPAWN_OF: Readonly<Record<string, Spawn>> = {
  eversong10: EVERSONG,
  "eversong10-hunter": EVERSONG,
  "eversong10-mage": EVERSONG,
  "eversong10-warrior": EVERSONG,
  ghostlands20: GHOSTLANDS,
};

const NAMED: Readonly<Record<string, Spawn>> = {
  eversong: EVERSONG,
  "fairbreeze-east": FAIRBREEZE_EAST,
  "fairbreeze-south": FAIRBREEZE_SOUTH,
  ghostlands: GHOSTLANDS,
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
