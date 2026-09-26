import type { ClientConfig, Unsubscribe, WorldHandle } from "@tuicraft/core";
import { messageOf } from "@tuicraft/core/lib/errors";
import { ignoreFailure } from "@tuicraft/core/lib/ignore-failure";
import { authWithRetry, worldSession } from "@tuicraft/core/session";
import type { ConnectionState, Profile } from "#harness/contract/config";
import type { LogDraft } from "#harness/contract/log";
import type { RunRegistry } from "#harness/contract/runs";
import type {
  Clock,
  GameLog,
  HandleObserver,
  HarnessRuntime,
  Login,
} from "#harness/contract/services";
import { Refusal } from "#harness/ops/refusal";

export type ConnectionInit = {
  profile: Profile;
  login: Login;
  observers: HandleObserver[];
  log: GameLog;
  runs: RunRegistry;
  clock: Clock;
  backoffMs?: readonly number[];
};
export type Connection = Pick<
  HarnessRuntime,
  | "handle"
  | "requireHandle"
  | "connection"
  | "onConnection"
  | "connect"
  | "disconnect"
>;

export const BACKOFF_MS: readonly number[] = [5000, 15_000, 45_000];

const CLOSE_WAIT_MS = 5000;
const LOST_TEXT = "Connection lost. The human must run /connect.";

export function defaultLogin(config: ClientConfig): Promise<WorldHandle> {
  return authWithRetry(config, { maxAttempts: 2 }).then((auth) =>
    worldSession(config, auth),
  );
}

export function createConnection(init: ConnectionInit): Connection {
  const slot = new ConnectionSlot(init);
  return {
    connect: () => slot.connect(),
    connection: () => slot.state,
    disconnect: () => slot.disconnect(),
    handle: () => slot.current,
    onConnection: (cb) => slot.subscribe(cb),
    requireHandle: () => slot.require(),
  };
}

class ConnectionSlot {
  state: ConnectionState = "offline";
  current: WorldHandle | undefined;
  private readonly init: ConnectionInit;
  private readonly backoff: readonly number[];
  private readonly listeners = new Set<(state: ConnectionState) => void>();
  private detach: Unsubscribe[] = [];
  private retry: ReturnType<typeof setTimeout> | undefined;
  private epoch = 0;
  private closing: Promise<void> | undefined;

  constructor(init: ConnectionInit) {
    this.init = init;
    this.backoff = init.backoffMs ?? BACKOFF_MS;
  }

  async connect(): Promise<void> {
    if (this.closing) await this.closing;
    if (this.state === "online" || this.state === "connecting") return;
    this.clearRetry();
    const epoch = ++this.epoch;
    this.set("connecting");
    const handle = await this.init
      .login(this.init.profile.client)
      .catch((error: unknown) => {
        if (epoch !== this.epoch) return;
        this.set("offline");
        throw error;
      });
    if (handle) this.adopt(handle, epoch, 1);
  }

  disconnect(): Promise<void> {
    this.closing ??= this.close().finally(() => {
      this.closing = undefined;
    });
    return this.closing;
  }

  subscribe(cb: (state: ConnectionState) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  require(): WorldHandle {
    if (this.current) return this.current;
    throw new Refusal({
      detail: "the game connection is down.",
      next: "ask the human to run /connect.",
      reason: "offline",
    });
  }

  private set(next: ConnectionState): void {
    this.state = next;
    for (const cb of this.listeners) cb(next);
  }

  private append(draft: Omit<LogDraft, "domain">): void {
    this.init.log.append({ ...draft, domain: "session" });
  }

  private async close(): Promise<void> {
    this.clearRetry();
    this.epoch++;
    const handle = this.current;
    if (!handle) {
      if (this.state !== "offline") this.set("offline");
      return;
    }
    this.set("closing");
    handle.logout();
    if (!(await closedWithin(handle, CLOSE_WAIT_MS))) handle.close();
    await handle.closed;
    if (this.state === "closing") this.set("offline");
  }

  private adopt(handle: WorldHandle, epoch: number, attempt: number): void {
    if (epoch === this.epoch) this.attach(handle, attempt);
    else handle.logout();
  }

  private clearRetry(): void {
    clearTimeout(this.retry);
    this.retry = undefined;
  }

  private attach(handle: WorldHandle, attempt: number): void {
    this.current = handle;
    this.detach = this.init.observers.map((observer) =>
      observer.attach(handle),
    );
    handle.closed.then(() => this.closed(handle)).catch(ignoreFailure);
    this.append({
      class: "log",
      data: { attempt },
      event: "session/connected",
      text: `Connected as ${this.init.profile.character}.`,
    });
    this.set("online");
  }

  private closed(handle: WorldHandle): void {
    if (handle !== this.current) return;
    for (const off of this.detach) off();
    this.detach = [];
    this.current = undefined;
    if (this.state === "closing") {
      this.set("offline");
      return;
    }
    this.init.runs.cancelAll("lost");
    this.append({
      class: "log",
      data: { attempt: 1, inMs: this.backoff[0] },
      event: "session/lost",
      text: "The game connection closed. The harness tries to connect again.",
    });
    this.schedule(0);
  }

  private schedule(index: number): void {
    const delay = this.backoff[index];
    if (delay === undefined) {
      this.set("offline");
      this.append({
        class: "wake",
        data: { attempts: this.backoff.length },
        event: "session/lost",
        text: LOST_TEXT,
      });
      return;
    }
    this.set("backoff");
    this.retry = setTimeout(() => this.reconnect(index), delay);
  }

  private reconnect(index: number): void {
    this.retry = undefined;
    const epoch = ++this.epoch;
    this.set("connecting");
    this.init.login(this.init.profile.client).then(
      (handle) => this.adopt(handle, epoch, index + 1),
      (error: unknown) => {
        if (epoch === this.epoch) this.failed(index, error);
      },
    );
  }

  private failed(index: number, error: unknown): void {
    this.append({
      class: "log",
      data: { attempt: index + 1, error: messageOf(error) },
      event: "session/lost",
      text: `Reconnect attempt ${index + 1} failed.`,
    });
    this.schedule(index + 1);
  }
}

async function closedWithin(handle: WorldHandle, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  const done = await Promise.race([
    handle.closed.then(() => true as const),
    timeout,
  ]);
  clearTimeout(timer);
  return done;
}
