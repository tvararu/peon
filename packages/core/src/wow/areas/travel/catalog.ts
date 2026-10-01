import {
  type DbcFile,
  type DbcSource,
  f32,
  i32,
  localeString,
  openDbc,
  u32,
} from "#wow/dbc";

export type TaxiNode = {
  id: number;
  map: number;
  x: number;
  y: number;
  z: number;
  name: string;
};

export type TaxiEdge = { from: number; to: number; price: number };

export class TaxiCatalog {
  private readonly nodes = new Map<number, TaxiNode>();
  private readonly edges = new Map<number, readonly TaxiEdge[]>();

  constructor(nodes: readonly TaxiNode[], edges: readonly TaxiEdge[]) {
    for (const node of nodes) this.nodes.set(node.id, node);
    const byFrom = new Map<number, TaxiEdge[]>();
    for (const edge of edges) {
      const list = byFrom.get(edge.from);
      if (list) list.push(edge);
      else byFrom.set(edge.from, [edge]);
    }
    for (const [from, list] of byFrom) this.edges.set(from, list);
  }

  node(id: number): TaxiNode | undefined {
    return this.nodes.get(id);
  }

  nodesByName(part: string): readonly TaxiNode[] {
    const needle = part.toLowerCase();
    return [...this.nodes.values()].filter((node) =>
      node.name.toLowerCase().includes(needle),
    );
  }

  edgesFrom(from: number): readonly TaxiEdge[] {
    return this.edges.get(from) ?? [];
  }
}

export const TAXI_NODES_LAYOUT = {
  file: "TaxiNodes.dbc",
  fields: 24,
  recordSize: 96,
};
export const TAXI_PATH_LAYOUT = {
  file: "TaxiPath.dbc",
  fields: 4,
  recordSize: 16,
};

function readNode(file: DbcFile, row: number): TaxiNode {
  return {
    id: u32(file, row, 0),
    map: u32(file, row, 1),
    x: f32(file, row, 2),
    y: f32(file, row, 3),
    z: f32(file, row, 4),
    name: localeString(file, row, 5),
  };
}

function missingFile(file: string, cause: unknown): Error {
  return new Error(`missing_taxi_data: ${file}`, { cause });
}

async function openTaxiFile(
  source: DbcSource,
  layout: typeof TAXI_NODES_LAYOUT,
): Promise<DbcFile> {
  try {
    return await openDbc(source, layout);
  } catch (error) {
    throw missingFile(layout.file, error);
  }
}

export async function loadTaxiCatalog(source: DbcSource): Promise<TaxiCatalog> {
  const nodesFile = await openTaxiFile(source, TAXI_NODES_LAYOUT);
  const pathFile = await openTaxiFile(source, TAXI_PATH_LAYOUT);
  const nodes: TaxiNode[] = [];
  for (let row = 0; row < nodesFile.recordCount; row++)
    nodes.push(readNode(nodesFile, row));
  const edges: TaxiEdge[] = [];
  for (let row = 0; row < pathFile.recordCount; row++)
    edges.push({
      from: i32(pathFile, row, 1),
      to: i32(pathFile, row, 2),
      price: i32(pathFile, row, 3),
    });
  return new TaxiCatalog(nodes, edges);
}
