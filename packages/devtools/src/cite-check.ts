import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Citation, type Doc, findCitations } from "#tools/cite-markdown";
import { handlerNames, packetClasses, scopeText } from "#tools/cite-source";

export type Tree = { files: string[]; read: (path: string) => Promise<string> };

export type Verdict =
  | "ok"
  | "unbound"
  | "missing"
  | "ambiguous"
  | "out_of_range"
  | "mismatch";

export type CiteResult = {
  doc: string;
  line: number;
  cited: string;
  verdict: Verdict;
  detail: string;
};

type Names = Record<string, string[]>;
type Outcome = Pick<CiteResult, "verdict" | "detail">;

const CHECKOUT = "code/azerothcore-wotlk-playerbots";
const SOURCES = "{src,modules}/**/*.{cpp,cc,h,hpp,inl}";
const OPCODE_TABLE = "Server/Protocol/Opcodes.cpp";
const PACKETS = /\/Server\/Packets\/[^/]+\.h$/;
const PASSING = new Set<Verdict>(["ok", "unbound"]);

const endsWithPath = (file: string, path: string) =>
  file === path || file.endsWith(`/${path}`);

const mentions = (text: string, name: string) =>
  new RegExp(`(?<!\\w)${name}(?!\\w)`).test(text);

async function opcodeNames(tree: Tree): Promise<Names> {
  const names: Names = {};
  const add = (opcode: string, name: string) => {
    names[opcode] = [...(names[opcode] ?? [opcode]), name];
  };
  for (const file of tree.files.filter((f) => endsWithPath(f, OPCODE_TABLE))) {
    const handlers = handlerNames(await tree.read(file));
    for (const [opcode, handler] of Object.entries(handlers))
      add(opcode, handler);
  }
  for (const file of tree.files.filter((f) => PACKETS.test(`/${f}`))) {
    const classes = packetClasses(await tree.read(file));
    for (const [opcode, list] of Object.entries(classes)) {
      for (const name of list) add(opcode, name);
    }
  }
  return names;
}

const lineCount = (text: string) =>
  text.split("\n").length - (text.endsWith("\n") ? 1 : 0);

function matchScopes(citation: Citation, text: string, names: Names): Outcome {
  const scopes = [...new Set(citation.lines.map((l) => scopeText(text, l)))];
  for (const opcode of citation.opcodes) {
    for (const name of names[opcode] ?? [opcode]) {
      if (scopes.some((s) => mentions(s, name))) {
        return { detail: `names ${name}`, verdict: "ok" };
      }
    }
  }
  const head = (scopes[0] ?? "").trim().split("\n")[0]?.trim() ?? "";
  const detail = `${head} names none of ${citation.opcodes.join(", ")}`;
  return { detail, verdict: "mismatch" };
}

async function judge(
  citation: Citation,
  tree: Tree,
  names: Names,
): Promise<Outcome> {
  const found = tree.files.filter((f) => endsWithPath(f, citation.path));
  const [file] = found;
  if (!file)
    return { detail: "no such file in the checkout", verdict: "missing" };
  if (found.length > 1)
    return { detail: found.join(", "), verdict: "ambiguous" };
  const text = await tree.read(file);
  const count = lineCount(text);
  if (citation.lines.some((l) => l < 1 || l > count)) {
    return { detail: `the file has ${count} lines`, verdict: "out_of_range" };
  }
  if (citation.opcodes.length === 0) {
    return { detail: "no opcode in the same block", verdict: "unbound" };
  }
  return matchScopes(citation, text, names);
}

export async function checkCitations(
  docs: Doc[],
  tree: Tree,
): Promise<CiteResult[]> {
  const citations = docs.flatMap(findCitations);
  const names = await opcodeNames(tree);
  const results: CiteResult[] = [];
  for (const c of citations) {
    const outcome = await judge(c, tree, names);
    results.push({ cited: c.cited, doc: c.doc, line: c.line, ...outcome });
  }
  return results;
}

export const failed = (results: CiteResult[]) =>
  results.some((r) => !PASSING.has(r.verdict));

export function formatReport(results: CiteResult[]): string {
  const count = (v: Verdict) => results.filter((r) => r.verdict === v).length;
  const broken = results.filter((r) => !PASSING.has(r.verdict)).length;
  const lines = results.map(
    (r) => `${r.doc}:${r.line} ${r.cited} ${r.verdict}: ${r.detail}`,
  );
  const total = `${results.length} citations: ${count("ok")} ok, ${count("unbound")} unbound, ${broken} broken`;
  return [...lines, total].join("\n");
}

async function checkoutTree(dir: string): Promise<Tree> {
  const files = await Array.fromAsync(new Bun.Glob(SOURCES).scan({ cwd: dir }));
  return { files, read: (path) => Bun.file(join(dir, path)).text() };
}

async function readDocs(args: string[]): Promise<Doc[]> {
  if (args.length === 0) {
    if (!existsSync("docs/areas")) return [];
    const glob = new Bun.Glob("docs/areas/*.md");
    return readDocs((await Array.fromAsync(glob.scan("."))).sort());
  }
  return Promise.all(
    args.map(async (path) => ({
      path,
      text: path === "-" ? await Bun.stdin.text() : await Bun.file(path).text(),
    })),
  );
}

async function main(): Promise<number> {
  const dir = Bun.env["PEON_AZEROTHCORE_DIR"] ?? join(homedir(), CHECKOUT);
  if (!existsSync(join(dir, "src"))) {
    console.error(
      `no AzerothCore checkout at ${dir}; set PEON_AZEROTHCORE_DIR`,
    );
    return 2;
  }
  const results = await checkCitations(
    await readDocs(Bun.argv.slice(2)),
    await checkoutTree(dir),
  );
  console.log(formatReport(results));
  return failed(results) ? 1 : 0;
}

if (import.meta.main) process.exit(await main());
