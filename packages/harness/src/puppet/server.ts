import { rm, writeFile } from "node:fs/promises";
import type { WorldHandle } from "@peon/core";
import { messageOf } from "@peon/core/lib/errors";
import { ignoreFailure } from "@peon/core/lib/ignore-failure";
import type { Socket, UnixSocketListener } from "bun";
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
};

export type PuppetServer = {
  done: Promise<void>;
  stop: () => Promise<void>;
};

export const CHAT_CAPACITY = 1000;

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
  private readonly chat: ChatEvent[] = [];
  private readonly unsubscribe: () => void;
  private listener: UnixSocketListener<{ buffer: string }> | undefined;
  private loggingOut: Promise<string> | undefined;
  private ended = false;

  constructor(init: PuppetServerInit) {
    this.handle = init.handle;
    this.paths = init.paths;
    this.waitMs = init.logoutWaitMs ?? LOGOUT_WAIT_MS;
    const capacity = init.chatCapacity ?? CHAT_CAPACITY;
    this.unsubscribe = init.handle.onMessage((msg) => {
      this.chat.push(chatEventObj(msg));
      if (this.chat.length > capacity) this.chat.shift();
    });
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
    if (request.cmd === "nearby")
      return {
        ok: true,
        out: resultJson("nearby", this.handle.queryNearby().map(nearbyRowObj)),
      };
    if (request.cmd === "whisper") {
      this.handle.sendWhisper(request.target, request.text);
      return { ok: true, out: "OK" };
    }
    return { ok: true, out: "" };
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
    this.unsubscribe();
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
