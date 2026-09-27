import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { serializeConfig } from "@tuicraft/core/lib/config";

export async function staleSocket(path: string): Promise<void> {
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `Bun.listen({ socket: { data() {} }, unix: ${JSON.stringify(path)} }); console.log("up");`,
    ],
    { stdout: "pipe" },
  );
  await child.stdout.getReader().read();
  child.kill(9);
  await child.exited;
}

export async function writeAccountConfig(
  path: string,
  fields: { account: string; character: string; host?: string; port?: number },
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${serializeConfig({
      host: "127.0.0.1",
      language: 1,
      password: "pw",
      port: 3724,
      timeout_minutes: 30,
      ...fields,
    })}\n`,
  );
}
