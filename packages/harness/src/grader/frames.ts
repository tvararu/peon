import type { Pane } from "#harness/grader/pane";
import { tagNerdGlyphs } from "#harness/ui/glyphs";

export type Frame = { seq: number; at: number; file: string; text: string };

type CaptureInit = {
  pane: Pane;
  dir: string;
  seq: number;
  last: string | undefined;
  now: number;
};

export function tagFrame(screen: string): string {
  return tagNerdGlyphs(screen);
}

export async function captureFrame({
  pane,
  dir,
  seq,
  last,
  now,
}: CaptureInit): Promise<Frame | undefined> {
  const text = tagFrame(await pane.screen());
  if (text === last) return undefined;
  const file = `${dir}/${String(seq).padStart(5, "0")}-${now}.txt`;
  await Bun.write(file, text);
  return { at: now, file, seq, text };
}
