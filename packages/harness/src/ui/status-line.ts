import type { RunKind } from "#harness/contract/runs";
import type { NowSnapshot, RunView } from "#harness/contract/views";
import { span } from "#harness/ui/draw";

const VERB: Readonly<Record<RunKind, string>> = {
  arena: "queueing",
  engage: "fighting",
  pilot: "steering",
  recover: "recovering",
  rest: "resting",
  trade: "trading",
  travel: "walking",
};

export function titleFor(snapshot: NowSnapshot | undefined): string {
  if (!snapshot) return "peon";
  const { self, attackers } = snapshot;
  const base = `${self.name} L${self.level}`;
  if (self.life === "dead" || self.life === "ghost")
    return `${base} ${self.life.toUpperCase()}`;
  const hp = `${self.maxHp > 0 ? Math.round((100 * self.hp) / self.maxHp) : 0}%`;
  return attackers.length > 0 ? `${base} ${hp} AGGRO` : `${base} ${hp}`;
}

export function workingMessage(run: RunView | undefined): string {
  if (!run) return "Work, work…";
  const what =
    run.progress === undefined
      ? run.label
      : `${VERB[run.kind]} ${run.progress}`;
  return `${what} (${run.id}, ${span(run.elapsedMs)})`;
}
