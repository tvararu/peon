import type { GameLogEntry, LogDraft } from "#harness/contract/log";

export const MOVE_JOIN_MS = 250;

type Held = {
  draft: LogDraft;
  runId: string;
  write: (draft: LogDraft) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type MoveJoin = {
  take: (
    draft: LogDraft,
    runId: string | undefined,
    write: (draft: LogDraft) => void,
  ) => boolean;
  observe: (entry: GameLogEntry) => void;
  flush: () => void;
};

function arrived(draft: LogDraft): LogDraft {
  return {
    ...draft,
    data: { ...draft.data, cause: "arrived" },
    text: "You stop (arrived).",
  };
}

function legArrived(entry: GameLogEntry, held: Held | undefined): boolean {
  return (
    held !== undefined &&
    entry.event === "nav/route_end" &&
    entry.runId === held.runId &&
    entry.data["status"] === "arrived"
  );
}

export function createMoveJoin(): MoveJoin {
  let held: Held | undefined;
  const drop = () => {
    clearTimeout(held?.timer);
    const was = held;
    held = undefined;
    return was;
  };
  const flush = () => {
    const was = drop();
    was?.write(was.draft);
  };
  return {
    flush,
    observe(entry) {
      if (held && legArrived(entry, held)) held.draft = arrived(held.draft);
    },
    take(draft, runId, write) {
      if (draft.event === "control/move_start" && held?.runId === runId) {
        drop();
        return true;
      }
      if (draft.event !== "control/move_stop" || runId === undefined)
        return false;
      flush();
      const timer = setTimeout(flush, MOVE_JOIN_MS);
      held = { draft: { ...draft, runId }, runId, timer, write };
      return true;
    },
  };
}
