export type Doc = { path: string; text: string };

export type Citation = {
  doc: string;
  line: number;
  cited: string;
  path: string;
  lines: number[];
  opcodes: string[];
};

const CITATION =
  /(?<![\w./~-])([\w./~-]+\.(?:cpp|cc|h|hpp|inl)):(\d+(?:-\d+)?(?:,\d+(?:-\d+)?)*)/g;
const OPCODE = /\b(?:CMSG|SMSG|MSG|UMSG|TC9)_[A-Z0-9_]*[A-Z0-9](?![\w*])/g;
const CHECKOUT_PREFIX = /^.*azerothcore-wotlk-playerbots\//;
const LEADING = /^(?:\.\/|\/)+/;
const ITEM = /^\s*(?:[-*+]|\d+\.)\s/;
const OWN_LINE = /^\s*(?:\||#)/;

function blockIds(lines: string[]): number[] {
  let id = 0;
  let open = false;
  return lines.map((line) => {
    const blank = !line.trim();
    if (blank || !open || ITEM.test(line) || OWN_LINE.test(line)) id++;
    open = !(blank || OWN_LINE.test(line));
    return id;
  });
}

function expand(spec: string): number[] {
  return spec.split(",").flatMap((part) => {
    const [from = 0, to = from] = part.split("-").map(Number);
    return Array.from(
      { length: Math.max(to - from + 1, 1) },
      (_, k) => from + k,
    );
  });
}

function opcodesByBlock(lines: string[], ids: number[]): Map<number, string[]> {
  const found = new Map<number, string[]>();
  lines.forEach((line, i) => {
    const id = ids[i] ?? 0;
    const names = found.get(id) ?? [];
    for (const [name] of line.matchAll(OPCODE)) {
      if (!names.includes(name)) names.push(name);
    }
    found.set(id, names);
  });
  return found;
}

export function findCitations(doc: Doc): Citation[] {
  const lines = doc.text.split("\n");
  const ids = blockIds(lines);
  const opcodes = opcodesByBlock(lines, ids);
  return lines.flatMap((text, i) =>
    [...text.matchAll(CITATION)].map(([cited, path = "", spec = ""]) => ({
      cited,
      doc: doc.path,
      line: i + 1,
      lines: expand(spec),
      opcodes: opcodes.get(ids[i] ?? 0) ?? [],
      path: path.replace(CHECKOUT_PREFIX, "").replace(LEADING, ""),
    })),
  );
}
