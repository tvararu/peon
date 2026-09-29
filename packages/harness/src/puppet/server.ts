import { rm, writeFile } from "node:fs/promises";
import type { WorldHandle } from "@peon/core";
import { messageOf } from "@peon/core/lib/errors";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import { opcodeName, type TraceSender } from "@peon/core/session";
import type { Socket, UnixSocketListener } from "bun";
import { decodeCall, PUPPET_CALLS } from "#harness/puppet/calls";
import {
  type ChatEvent,
  chatEventObj,
  eventsJson,
  nearbyRowObj,
  resultJson,
} from "#harness/puppet/format";
import {
  decodeRequest,
  encodeLine,
  inSocketDir,
  type PuppetPaths,
  type PuppetReply,
  type PuppetRequest,
} from "#harness/puppet/protocol";
import { LOGOUT_WAIT_MS, logOutWithin } from "#harness/runtime/connection";

export type PuppetServerInit = {
  handle: WorldHandle;
  paths: PuppetPaths;
  logoutWaitMs?: number;
  chatCapacity?: number;
  send?: TraceSender;
};

export type PuppetServer = {
  done: Promise<void>;
  stop: () => Promise<void>;
};

export const CHAT_CAPACITY = 1000;

type EventRow = { at: number; event: unknown; hook: string };

function plainJson(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, field: unknown) =>
      typeof field === "bigint" ? field.toString() : field,
    ) ?? "null",
  );
}

function gameEventsJson(events: EventRow[]): string {
  return JSON.stringify({
    command: "events",
    data: null,
    error: null,
    events,
    kind: "events",
  });
}

export async function listenPuppet(
  init: PuppetServerInit,
): Promise<PuppetServer> {
  const puppet = new Puppet(init);
  await puppet.listen();
  return { done: puppet.done.promise, stop: () => puppet.stop() };
}

class Puppet {
  readonly done = Promise.withResolvers<void>();
  private readonly handle: WorldHandle;
  private readonly paths: PuppetPaths;
  private readonly waitMs: number;
  private readonly send: TraceSender | undefined;
  private readonly chat: ChatEvent[] = [];
  private readonly events: EventRow[] = [];
  private readonly unsubscribe: (() => void)[];
  private listener: UnixSocketListener<{ buffer: string }> | undefined;
  private loggingOut: Promise<string> | undefined;
  private ended = false;

  constructor(init: PuppetServerInit) {
    this.handle = init.handle;
    this.paths = init.paths;
    this.waitMs = init.logoutWaitMs ?? LOGOUT_WAIT_MS;
    this.send = init.send;
    const capacity = init.chatCapacity ?? CHAT_CAPACITY;
    const { handle } = init;
    const keep = (hook: string) => (event: unknown) => {
      this.events.push({ at: Date.now(), event: plainJson(event), hook });
      if (this.events.length > capacity) this.events.shift();
    };
    this.unsubscribe = [
      handle.onMessage((msg) => {
        this.chat.push(chatEventObj(msg));
        if (this.chat.length > capacity) this.chat.shift();
      }),
      handle.onGroupEvent(keep("group")),
      handle.onGuildEvent(keep("guild")),
      handle.onDuelEvent(keep("duel")),
      handle.onNotice(keep("notice")),
      handle.onPacketError((opcode, error) =>
        keep("packetError")({ error: messageOf(error), opcode }),
      ),
      handle.onAreaEvent(keep("area")),
    ];
  }

  async listen(): Promise<void> {
    this.listener = inSocketDir(this.paths.socket, (name) =>
      Bun.listen<{ buffer: string }>({
        socket: {
          data: (socket, data) => {
            socket.data.buffer += data.toString();
            const end = socket.data.buffer.indexOf("\n");
            if (end === -1) return;
            this.reply(socket, socket.data.buffer.slice(0, end)).catch(
              ignoreFailure,
            );
          },
          open(socket) {
            socket.data = { buffer: "" };
          },
        },
        unix: name,
      }),
    );
    await writeFile(this.paths.pid, `${process.pid}\n`);
    this.handle.closed
      .then(() => (this.loggingOut ? undefined : this.finish()))
      .catch(ignoreFailure);
  }

  async stop(): Promise<void> {
    await this.logOut();
    await this.finish();
  }

  private async reply(
    socket: Socket<{ buffer: string }>,
    line: string,
  ): Promise<void> {
    const request = decodeRequest(line);
    const reply: PuppetReply = request
      ? await this.answer(request).catch((error: unknown) => ({
          error: messageOf(error),
          ok: false as const,
        }))
      : { error: "The puppet cannot read that request.", ok: false };
    socket.write(encodeLine(reply));
    socket.end();
    if (request?.cmd === "stop") await this.finish();
  }

  private async answer(request: PuppetRequest): Promise<PuppetReply> {
    if (request.cmd === "stop") return { ok: true, out: await this.logOut() };
    if (this.loggingOut) return { error: "The puppet is stopping.", ok: false };
    if (request.cmd === "read")
      return { ok: true, out: eventsJson("read", this.chat.splice(0)) };
    if (request.cmd === "events")
      return { ok: true, out: gameEventsJson(this.events.splice(0)) };
    if (request.cmd === "nearby")
      return {
        ok: true,
        out: resultJson("nearby", this.handle.queryNearby().map(nearbyRowObj)),
      };
    if (request.cmd === "whisper") {
      this.handle.sendWhisper(request.target, request.text);
      return { ok: true, out: "OK" };
    }
    if (request.cmd === "call") return this.call(request.method, request.args);
    if (request.cmd === "raw") return this.raw(request.opcode, request.body);
    return { ok: true, out: "" };
  }

  private async call(method: string, raw: unknown[]): Promise<PuppetReply> {
    const call = decodeCall(method, JSON.stringify(raw));
    if ("error" in call) return { error: call.error, ok: false };
    const outcome = await PUPPET_CALLS[call.method]?.run(
      this.handle,
      call.args,
    );
    const failure = outcomeError(outcome);
    if (failure !== undefined) return { error: failure, ok: false };
    return { ok: true, out: resultJson("call", { method: call.method }) };
  }

  private raw(opcode: number, hex: string): PuppetReply {
    if (!this.send)
      return {
        error: "Start the puppet with --packet-trace to send raw packets.",
        ok: false,
      };
    const body = Uint8Array.from(Buffer.from(hex, "hex"));
    this.send(opcode, body);
    return {
      ok: true,
      out: resultJson("raw", { opcode: opcodeName(opcode), size: body.length }),
    };
  }

  private logOut(): Promise<string> {
    this.loggingOut ??= logOutWithin(this.handle, this.waitMs).then(
      (complete) =>
        complete
          ? "Logged out."
          : `The server did not finish the logout within ${this.waitMs / 1000} s; the puppet closed the socket.`,
    );
    return this.loggingOut;
  }

  private async finish(): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    for (const off of this.unsubscribe) off();
    const { listener } = this;
    if (listener)
      await Promise.resolve()
        .then(() => inSocketDir(this.paths.socket, () => listener.stop()))
        .catch(ignoreFailure);
    await Promise.all([
      rm(this.paths.socket, { force: true }),
      rm(this.paths.pid, { force: true }),
    ]);
    this.done.resolve();
  }
}

function outcomeError(outcome: unknown): string | undefined {
  if (typeof outcome !== "object" || outcome === null) return undefined;
  const status = Reflect.get(outcome, "status");
  if (status === undefined || status === "ok" || status === "done")
    return undefined;
  const reason = Reflect.get(outcome, "reason");
  return typeof reason === "string" && reason !== ""
    ? `${String(status)}: ${reason}`
    : String(status);
}
