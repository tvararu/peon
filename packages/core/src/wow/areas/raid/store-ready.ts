import type { RaidGroup } from "#wow/areas/raid/protocol";

export type ReadyAnswer = "ready" | "not_ready" | "offline";

export type ReadyCheck = {
  initiator: bigint;
  startedAt: number;
  answers: ReadonlyMap<bigint, ReadyAnswer>;
  ownAnswer: ReadyAnswer | undefined;
  finishedAt: number | undefined;
};

export type ReadyEvent =
  | { type: "ready_check_started"; initiator: bigint; name: string }
  | {
      type: "ready_check_answer";
      guid: bigint;
      name: string;
      answer: ReadyAnswer;
    }
  | {
      type: "ready_check_finished";
      ready: number;
      notReady: readonly string[];
      offline: number;
      pending: number;
    };

const STATUS_ONLINE = 0x01;

function nameOf(group: RaidGroup | undefined, guid: bigint): string {
  return group?.members.find((member) => member.guid === guid)?.name ?? "";
}

export function isOnline(status: number): boolean {
  return (status & STATUS_ONLINE) !== 0;
}

export function pendingGuids(
  group: RaidGroup | undefined,
  check: ReadyCheck,
): readonly bigint[] {
  return (group?.members ?? [])
    .filter(
      (member) =>
        member.guid !== check.initiator &&
        isOnline(member.status) &&
        !check.answers.has(member.guid),
    )
    .map((member) => member.guid);
}

function summary(
  group: RaidGroup | undefined,
  check: ReadyCheck,
): Extract<ReadyEvent, { type: "ready_check_finished" }> {
  const notReady: string[] = [];
  let ready = 0;
  let offline = 0;
  for (const [guid, answer] of check.answers) {
    if (answer === "ready") ready++;
    else if (answer === "offline") offline++;
    else notReady.push(nameOf(group, guid));
  }
  return {
    notReady,
    offline,
    pending: pendingGuids(group, check).length,
    ready,
    type: "ready_check_finished",
  };
}

export class ReadyStore {
  private check: ReadyCheck | undefined;

  current(): ReadyCheck | undefined {
    return this.check;
  }

  start(
    group: RaidGroup | undefined,
    initiator: bigint,
    now: number,
  ): ReadyEvent {
    this.check = {
      answers: new Map(),
      finishedAt: undefined,
      initiator,
      ownAnswer: undefined,
      startedAt: now,
    };
    return {
      initiator,
      name: nameOf(group, initiator),
      type: "ready_check_started",
    };
  }

  confirm(
    group: RaidGroup | undefined,
    guid: bigint,
    ready: boolean,
  ): ReadyEvent | undefined {
    const check = this.check;
    const member = group?.members.find((entry) => entry.guid === guid);
    if (!check || check.finishedAt !== undefined || !member) return undefined;
    const answer: ReadyAnswer = ready
      ? "ready"
      : isOnline(member.status)
        ? "not_ready"
        : "offline";
    this.check = {
      ...check,
      answers: new Map(check.answers).set(guid, answer),
    };
    return { answer, guid, name: member.name, type: "ready_check_answer" };
  }

  own(ready: boolean): void {
    const check = this.check;
    if (!check || check.finishedAt !== undefined) return;
    this.check = { ...check, ownAnswer: ready ? "ready" : "not_ready" };
  }

  finish(group: RaidGroup | undefined, now: number): ReadyEvent | undefined {
    const check = this.check;
    if (!check || check.finishedAt !== undefined) return undefined;
    this.check = { ...check, finishedAt: now };
    return summary(group, this.check);
  }

  clear(): void {
    this.check = undefined;
  }
}
