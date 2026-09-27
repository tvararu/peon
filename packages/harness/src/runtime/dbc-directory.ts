import type { DbcSource } from "@peon/core";

const TRAILING_SLASH = /\/$/;

export function dbcDirectory(directory: string): DbcSource {
  const root = directory.replace(TRAILING_SLASH, "");
  return async (file) => {
    const handle = Bun.file(`${root}/${file}`);
    if (!(await handle.exists()))
      throw new Error(`missing ${file} in ${directory}`);
    return new Uint8Array(await handle.arrayBuffer());
  };
}
