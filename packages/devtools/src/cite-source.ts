type Kind = "function" | "type" | "other";
type Block = { start: number; close: number; kind: Kind };
type Open = { start: number; header: string };
type Scan = {
  line: number;
  header: string;
  headerStart: number;
  stack: Open[];
  blocks: Block[];
};

const CONTROL = /^(?:if|for|while|switch|catch|else|do|return|case|default)\b/;
const LAMBDA = /(?<!operator\s*)\[[^\]]*\]\s*(?:\([^)]*\))?\s*(?:mutable\s*)?$/;
const LAMBDA_CALL = /(?<!operator\s*)\[[^\]]*\]\s*\(/;
const FUNCTION_END =
  /\)\s*(?:const|override|final|noexcept|volatile|&|&&|\s)*(?:->\s*[\w:<>,*&\s]+)?$/;
const TYPE = /\b(?:class|struct|union|enum)\s+\w+/;
const OPCODE_TABLE = /\b(?:OpcodeTable::Initialize|enum\s+Opcodes)\b/;
const HANDLER =
  /DEFINE_HANDLER\(\s*(\w+)\s*,[^;]*&WorldSession::(Handle\w+)\s*\)/g;
const PACKET_CTOR =
  /\b(\w+)\s*\([^)]*\)\s*:\s*(?:Server|Client)Packet\(\s*(\w+)/g;
const SKIP_TO = { "'": "'", '"': '"', "/*": "*/", "//": "\n" } as const;
const blockCache = new Map<string, Block[]>();

function classify(header: string): Kind {
  const h = header.replace(/\s+/g, " ").trim();
  if (CONTROL.test(h) || LAMBDA.test(h) || LAMBDA_CALL.test(h)) return "other";
  if (FUNCTION_END.test(h) && h.includes("(")) return "function";
  return TYPE.test(h) ? "type" : "other";
}

function skipQuoted(text: string, i: number, end: string): number {
  let j = i + 1;
  while (j < text.length && !text.startsWith(end, j))
    j += text[j] === "\\" ? 2 : 1;
  return end === "\n" ? j : j + end.length;
}

function skipDirective(text: string, i: number): number {
  let j = i;
  while (j < text.length) {
    const nl = text.indexOf("\n", j);
    if (nl === -1) return text.length;
    if (text[nl - 1] !== "\\") return nl;
    j = nl + 1;
  }
  return j;
}

function atLineStart(text: string, i: number): boolean {
  const before = text.slice(text.lastIndexOf("\n", i - 1) + 1, i);
  return before.trim() === "";
}

function skipFrom(text: string, i: number): number | null {
  const two = text.slice(i, i + 2);
  const one = text[i] ?? "";
  if (two === "//" || two === "/*")
    return skipQuoted(text, i + 1, SKIP_TO[two]);
  if (one === '"' || one === "'") return skipQuoted(text, i, SKIP_TO[one]);
  if (one === "#" && atLineStart(text, i)) return skipDirective(text, i);
  return null;
}

function countLines(text: string, from: number, to: number): number {
  let n = 0;
  for (let k = from; k < to; k++) if (text[k] === "\n") n++;
  return n;
}

function step(scan: Scan, char: string): void {
  if (char === "{") {
    scan.stack.push({ header: scan.header, start: scan.headerStart });
  } else if (char === "}") {
    const open = scan.stack.pop();
    if (open) {
      const kind = classify(open.header);
      scan.blocks.push({ close: scan.line, kind, start: open.start });
    }
  }
  if (char === "{" || char === "}" || char === ";") {
    scan.header = "";
    return;
  }
  if (!scan.header) {
    if (!char.trim()) return;
    scan.headerStart = scan.line;
  }
  scan.header += char === "\n" ? " " : char;
}

function scanBlocks(text: string): Block[] {
  const scan: Scan = {
    blocks: [],
    header: "",
    headerStart: 1,
    line: 1,
    stack: [],
  };
  let i = 0;
  while (i < text.length) {
    const next = skipFrom(text, i);
    if (next !== null) {
      scan.line += countLines(text, i, next);
      if (scan.header) scan.header += " ";
      i = next;
      continue;
    }
    const char = text[i] ?? "";
    step(scan, char);
    if (char === "\n") scan.line++;
    i++;
  }
  return scan.blocks;
}

function blocksOf(text: string): Block[] {
  const cached = blockCache.get(text);
  if (cached) return cached;
  const blocks = scanBlocks(text);
  blockCache.set(text, blocks);
  return blocks;
}

function enclosing(blocks: Block[], line: number): Block | undefined {
  const covering = blocks.filter((b) => b.start <= line && line <= b.close);
  const byStart = (a: Block, b: Block) => a.start - b.start;
  const functions = covering.filter((b) => b.kind === "function").sort(byStart);
  if (functions[0]) return functions[0];
  return covering
    .filter((b) => b.kind === "type")
    .sort(byStart)
    .at(-1);
}

export function scopeText(text: string, line: number): string {
  const lines = text.split("\n");
  const block = enclosing(blocksOf(text), line);
  const head = block ? (lines[block.start - 1] ?? "") : "";
  if (!block || OPCODE_TABLE.test(head)) return lines[line - 1] ?? "";
  return lines.slice(block.start - 1, block.close).join("\n");
}

export function handlerNames(opcodesCpp: string): Record<string, string> {
  const names: Record<string, string> = {};
  for (const [, opcode, handler] of opcodesCpp.matchAll(HANDLER)) {
    if (opcode && handler && !handler.startsWith("Handle_")) {
      names[opcode] = handler;
    }
  }
  return names;
}

export function packetClasses(header: string): Record<string, string[]> {
  const classes: Record<string, string[]> = {};
  for (const [, name, opcode] of header.matchAll(PACKET_CTOR)) {
    if (name && opcode) classes[opcode] = [...(classes[opcode] ?? []), name];
  }
  return classes;
}
