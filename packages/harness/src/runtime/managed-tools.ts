import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type Which = (name: string) => string | null;

const TOOLS = [
  { bin: "fd", names: ["fd", "fdfind"] },
  { bin: "rg", names: ["rg"] },
] as const;

const SILENT = "#!/bin/sh\nexit 0\n";

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

export async function seedManagedTools(
  agentDir: string,
  which: Which = Bun.which,
): Promise<void> {
  const binDir = join(agentDir, "bin");
  for (const tool of TOOLS) {
    const path = join(binDir, tool.bin);
    if (tool.names.some((name) => which(name)) || (await exists(path)))
      continue;
    await mkdir(binDir, { recursive: true });
    await writeFile(path, SILENT, { mode: 0o755 });
  }
}
