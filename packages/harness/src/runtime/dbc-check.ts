import { REQUIRED_DBC_FILES } from "@peon/core";

const TRAILING_SLASH = /\/$/;

export async function missingDbcWarnings(directory: string): Promise<string[]> {
  const root = directory.replace(TRAILING_SLASH, "");
  const warnings: string[] = [];
  for (const file of REQUIRED_DBC_FILES)
    if (!(await Bun.file(`${root}/${file}`).exists()))
      warnings.push(
        `spell_data_dir lacks ${file} (${directory}); the harness falls back to ids without it.`,
      );
  return warnings;
}
