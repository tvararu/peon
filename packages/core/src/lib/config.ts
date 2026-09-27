export type Config = {
  account: string;
  password: string;
  character: string;
  host: string;
  port: number;
  language: number;
  timeout_minutes: number;
  spell_data_dir?: string;
  navigation_data_dir?: string;
  navigation_library?: string;
};

export const realmDefaults: Pick<Config, "host" | "port"> = {
  host: "localhost",
  port: 3724,
};

const DEFAULTS: Partial<Config> = {
  ...realmDefaults,
  language: 1,
  timeout_minutes: 30,
};

function parseValue(raw: string): string | number {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  const n = Number(raw);
  return Number.isNaN(n) ? raw : n;
}

function parseLines(text: string): Record<string, string | number> {
  const result: Record<string, string | number> = { ...DEFAULTS };
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    result[key] = parseValue(trimmed.slice(eq + 1).trim());
  }
  return result;
}

function validateConfig(result: Record<string, string | number>): void {
  for (const field of ["account", "password", "character"] as const) {
    if (typeof result[field] !== "string") {
      throw new Error(`Missing required config field: ${field}`);
    }
  }
  for (const field of ["port", "language", "timeout_minutes"] as const) {
    const v = result[field];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) {
      throw new Error(`Invalid ${field}: must be a finite positive number`);
    }
  }
  for (const field of [
    "spell_data_dir",
    "navigation_data_dir",
    "navigation_library",
  ] as const) {
    const value = result[field];
    if (
      value !== undefined &&
      (typeof value !== "string" || value.trim().length === 0)
    )
      throw new Error(`Invalid ${field}: must be a non-empty string`);
  }
}

export function parseConfig(text: string): Config {
  const result = parseLines(text);
  validateConfig(result);
  return result as unknown as Config;
}

export function serializeConfig(cfg: Config): string {
  return Object.entries(cfg)
    .map(([k, v]) =>
      typeof v === "string"
        ? `${k} = "${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
        : `${k} = ${v}`,
    )
    .join("\n");
}
