const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

export type Dealings = {
  dealt: Set<string>;
  human: string[];
};

export function createDealings(): Dealings {
  return { dealt: new Set(), human: [] };
}

export function noteHuman(dealings: Dealings, text: string): void {
  dealings.human.push(text);
}

export function noteDealt(dealings: Dealings, name: string): void {
  dealings.dealt.add(name.toLowerCase());
}

export function namedByHuman(dealings: Dealings, name: string): boolean {
  const escaped = name.replace(REGEX_SPECIALS, "\\$&");
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
    "iu",
  );
  return dealings.human.some((text) => pattern.test(text));
}

export function hasDealt(dealings: Dealings, name: string): boolean {
  return dealings.dealt.has(name.toLowerCase()) || namedByHuman(dealings, name);
}

export function standingNote(
  dealings: Dealings,
  name: string,
): string | undefined {
  if (namedByHuman(dealings, name)) return `the human's task names ${name}`;
  if (dealings.human.length > 0)
    return `the human's task does not name ${name}`;
  return undefined;
}
