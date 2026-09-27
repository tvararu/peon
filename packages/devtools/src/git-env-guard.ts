import { mkdir, rm } from "node:fs/promises";

export type GuardResult = { code: number; changed: string[] };

function withoutGit(env: Record<string, string | undefined>) {
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(env))
    if (value !== undefined && !key.startsWith("GIT_")) kept[key] = value;
  return kept;
}

async function git(dir: string, ...args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", "-C", dir, ...args], {
    env: withoutGit(Bun.env),
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0)
    throw new Error(`git ${args.join(" ")} exited ${code}: ${stderr.trim()}`);
  return stdout;
}

async function settings(dir: string, file: string): Promise<string[]> {
  const entries = await git(dir, "config", "--file", file, "--list", "-z");
  return entries
    .split("\0")
    .filter((entry) => entry !== "" && !entry.startsWith("branch."))
    .map((entry) => entry.replace("\n", "="));
}

async function snapshot(root: string, files: Record<string, string>) {
  const out: Record<string, string[]> = {};
  for (const [name, file] of Object.entries(files))
    out[name] = await settings(root, file);
  return out;
}

export async function guardGitEnv(
  command: string[],
  root: string = process.cwd(),
): Promise<GuardResult> {
  const sandbox = `${root}/tmp/git-env-${process.pid}-${Date.now()}`;
  const common = await git(
    root,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  );
  try {
    await mkdir(sandbox, { recursive: true });
    await git(sandbox, "init", "-q");
    const files = {
      sandbox: `${sandbox}/.git/config`,
      shared: `${common.trim()}/config`,
    };
    const before = await snapshot(root, files);
    const proc = Bun.spawn(command, {
      cwd: root,
      env: { ...Bun.env, GIT_DIR: `${sandbox}/.git`, GIT_WORK_TREE: sandbox },
      stdio: ["inherit", "inherit", "inherit"],
    });
    const code = await proc.exited;
    const after = await snapshot(root, files);
    const changed = Object.keys(files).filter(
      (name) => before[name]?.join("\n") !== after[name]?.join("\n"),
    );
    return { changed, code: code === 0 && changed.length > 0 ? 1 : code };
  } finally {
    await rm(sandbox, { force: true, recursive: true });
  }
}

async function main(): Promise<void> {
  const { changed, code } = await guardGitEnv(Bun.argv.slice(2));
  for (const name of changed)
    console.error(
      `git-env-guard: the run wrote to the ${name} repository's config with GIT_DIR exported; spawn git through gitEnv()`,
    );
  process.exitCode = code;
}

if (import.meta.main) await main();
