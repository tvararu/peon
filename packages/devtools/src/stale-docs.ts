import { existsSync } from "node:fs";

export type Doc = { path: string; text: string };
export type Finding = {
  path: string;
  line: number;
  match: string;
  reason: string;
};

type Rule = {
  pattern: RegExp;
  reason: string;
  allow?: (match: string) => boolean;
};

export type Exists = (path: string) => boolean;

const tmpOutputs = [
  "namigator/",
  "worktree-archive-<date>/",
  "squash.json",
  "qa-changes.json",
  "puppet-<ACCOUNT>",
  "evals/",
  "factory-account-<ACCOUNT>/",
];

const tmpPrefix = /^(?:\.\/)?tmp\//;
const whitespace = /\s+/g;

const historyRules: Rule[] = [
  {
    pattern: /\b(?:since|until|as\s+of)\s+\d{4}-\d{2}-\d{2}/g,
    reason: "dated history: state the current rule",
  },
  {
    pattern: /\bon\s+\d{4}-\d{2}-\d{2}/g,
    reason: "says when something changed: state what holds now",
  },
  {
    pattern:
      /\b(?:ruling|review|decision|cleanup)\s+of\s+\d{4}-\d{2}-\d{2}|\b\d{4}-\d{2}-\d{2}\s+(?:ruling|review|decision|cleanup)\b/g,
    reason: "cites a dated event: state the rule it set",
  },
  {
    pattern:
      /\b(?:was|were|has\s+been|have\s+been)\s+(?:deleted|removed|retired|dropped|archived)\b/g,
    reason: "narrates a removal: say what exists now",
  },
  {
    pattern: /\bat\s+the\s+maintainer's\s+request\b/g,
    reason: "narrates who asked: state the rule",
  },
];

const deadRules: Rule[] = [
  {
    allow: (match) => {
      const path = match.replace(tmpPrefix, "");
      return path === "" || tmpOutputs.some((p) => path.startsWith(p));
    },
    pattern: /(?<![\w./-])(?:\.\/)?tmp\/(?:[^\s`'"),;]*[^\s`'"),;.:])?/g,
    reason:
      "points under tmp/, which is ephemeral: link a committed file or say it is not committed",
  },
  {
    pattern: /\b(?:DECISIONS|JOURNAL)\.md\b|\bovn-|\bgameplay-\*/g,
    reason: "names a deleted notes file or worktree",
  },
  {
    pattern: /\bfactory-(?:worker|reviewer|merger|qa)\b/g,
    reason: "old automation name: the automations are work, review, merge, qa",
  },
];

const sources = [
  "AGENTS.md",
  "README.md",
  "docs/*.md",
  "packages/factory/src/prompts/*.md",
];

const globTail = /\/[^/]*[*{<].*$/;
const trailing = /[/.,:;]+$/;
const CAPABILITIES = "docs/capabilities.md";
const SCENARIOS = "packages/harness/src/grader/scenarios";
const scenarioRef = /`(t\d+-[a-z0-9-]+)`/g;
const jsonSuffix = /\.json$/;

function deadPathRule(exists: Exists): Rule {
  return {
    allow: (match) =>
      !match.startsWith("src/") &&
      exists(match.replace(globTail, "").replace(trailing, "")),
    pattern:
      /(?<![\w.-])(?<!\.\.\/[\w.-]+\/)(?:packages\/[\w-]+\/(?:src|test-support)(?:\/[\w.*<>{}-]*)*|src\/(?:wow|lib|test|cli|daemon|ui|tools|factory|harness|main\.ts|main\.test\.ts|md\.d\.ts)(?:\/[\w.*<>{}-]*)*)/g,
    reason:
      "names a source path that does not exist: code lives in packages/<pkg>/src or packages/<pkg>/test-support",
  };
}

function findings(doc: Doc, rule: Rule): Finding[] {
  return [...doc.text.matchAll(rule.pattern)]
    .filter(([match]) => !rule.allow?.(match))
    .map(({ 0: match, index }) => ({
      line: doc.text.slice(0, index).split("\n").length,
      match: match.replace(whitespace, " "),
      path: doc.path,
      reason: rule.reason,
    }));
}

export function staleFindings(
  doc: Doc,
  exists: Exists = (path) => existsSync(path),
): Finding[] {
  return [...historyRules, ...deadRules, deadPathRule(exists)]
    .flatMap((rule) => findings(doc, rule))
    .sort((a, b) => a.line - b.line);
}

export function capabilityFindings(
  doc: Doc,
  scenarios: readonly string[],
): Finding[] {
  const listed = new Set(
    [...doc.text.matchAll(scenarioRef)].map(([, id]) => id),
  );
  const unknown = findings(doc, {
    allow: (match) => scenarios.includes(match.slice(1, -1)),
    pattern: scenarioRef,
    reason: "names an eval scenario that does not exist",
  });
  const missing = scenarios
    .filter((id) => !listed.has(id))
    .map((id) => ({
      line: 1,
      match: id,
      path: doc.path,
      reason: "leaves out an eval scenario: list it under a capability",
    }));
  return [...unknown, ...missing];
}

async function scenarioIds(root: string): Promise<string[]> {
  const ids: string[] = [];
  for await (const file of new Bun.Glob("*.json").scan(`${root}/${SCENARIOS}`))
    ids.push(file.replace(jsonSuffix, ""));
  return ids.sort();
}

async function load(root: string): Promise<Doc[]> {
  const docs = new Map<string, Doc>();
  for (const pattern of sources) {
    let matched = false;
    for await (const path of new Bun.Glob(pattern).scan({
      cwd: root,
      dot: true,
    })) {
      matched = true;
      docs.set(path, {
        path,
        text: await Bun.file(`${root}/${path}`).text(),
      });
    }
    if (!matched) throw new Error(`no docs match ${pattern}`);
  }
  return [...docs.values()].sort((a, b) => a.path.localeCompare(b.path));
}

async function main(): Promise<void> {
  const root = process.cwd();
  const docs = await load(root);
  const capabilities = docs.find((doc) => doc.path === CAPABILITIES) ?? {
    path: CAPABILITIES,
    text: "",
  };
  const found = [
    ...docs.flatMap((doc) =>
      staleFindings(doc, (path) => existsSync(`${root}/${path}`)),
    ),
    ...capabilityFindings(capabilities, await scenarioIds(root)),
  ];
  for (const f of found)
    console.error(`${f.path}:${f.line}: ${f.reason}: ${f.match}`);
  if (found.length === 0) return;
  console.error(
    `${found.length} stale passage(s); see "Docs and memory" in AGENTS.md`,
  );
  process.exitCode = 1;
}

if (import.meta.main) await main();
