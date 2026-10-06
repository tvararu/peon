export type FramingVariant = "none" | "minimal" | "mechanics";

export function buildFraming(
  variant: FramingVariant,
  observation: Readonly<Record<string, unknown>>,
  characterClass = "character",
): string | undefined {
  if (variant === "none") return undefined;
  const rawSelf = observation["self"];
  const self =
    typeof rawSelf === "object" && rawSelf !== null
      ? (rawSelf as Record<string, unknown>)
      : undefined;
  const rawLevel = self?.["level"];
  const level = typeof rawLevel === "number" ? rawLevel : undefined;
  const levelPart =
    level === undefined
      ? `a ${characterClass}`
      : `a level ${level} ${characterClass}`;
  const minimal = `In World of Warcraft 3.3.5a, you are ${levelPart} fighting a hostile creature.`;
  if (variant === "minimal") return minimal;
  return `${minimal} The resource pool does not refill during the fight. Some actions apply effects over time. Some actions take time and can be disrupted.`;
}
