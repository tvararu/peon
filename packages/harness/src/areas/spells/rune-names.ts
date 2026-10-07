const RUNE_TYPES = ["blood", "unholy", "frost", "death"] as const;

export function runeName(type: number): string {
  return RUNE_TYPES[type] ?? `type ${type}`;
}
