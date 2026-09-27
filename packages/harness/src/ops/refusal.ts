import type { ToolStatus } from "#harness/contract/result";

type RefusalStatus = Extract<ToolStatus, "REFUSED" | "FAILED" | "UNCONFIRMED">;

export type RefusalInit = {
  reason: string;
  detail: string;
  next?: string;
  body?: string[];
  options?: unknown;
  status?: RefusalStatus;
};

export class Refusal extends Error {
  readonly reason: string;
  readonly detail: string;
  readonly next: string | undefined;
  readonly body: string[];
  readonly options: unknown;
  readonly status: RefusalStatus;

  constructor(init: RefusalInit) {
    super(`${init.reason}: ${init.detail}`);
    this.name = "Refusal";
    this.reason = init.reason;
    this.detail = init.detail;
    this.next = init.next;
    this.body = init.body ?? [];
    this.options = init.options;
    this.status = init.status ?? "REFUSED";
  }
}
