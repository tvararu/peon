import type {
  EntryRenderer,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUIContext,
  MessageRenderer,
  RegisteredCommand,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";

export type Call = { method: string; args: unknown[] };
export type Handler = (event: unknown, ctx: ExtensionCommandContext) => unknown;
export type Command = Omit<RegisteredCommand, "name" | "sourceInfo">;

export type UiRecorder = {
  ui: ExtensionUIContext;
  calls: Call[];
  named: (method: string) => unknown[][];
};

export type PiRecorder = {
  pi: ExtensionAPI;
  calls: Call[];
  commands: Map<string, Command>;
  messageRenderers: Map<string, MessageRenderer>;
  entryRenderers: Map<string, EntryRenderer>;
  entries: { customType: string; data: unknown }[];
  fire: (
    event: string,
    payload: unknown,
    ctx: ExtensionCommandContext,
  ) => Promise<void>;
  run: (
    name: string,
    args: string,
    ctx: ExtensionCommandContext,
  ) => Promise<void>;
};

export type RecorderContextInit = {
  ui: ExtensionUIContext;
  mode?: "tui" | "rpc" | "json" | "print";
  contextPct?: number;
};

export type FakeTui = { tui: TUI; renders: () => number };

function recorder(calls: Call[], known: Record<string, unknown>): unknown {
  return new Proxy(known, {
    get: (target, key) => {
      if (typeof key !== "string") return;
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        calls.push({ args, method: key });
      };
    },
  });
}

export function createUiRecorder(): UiRecorder {
  const calls: Call[] = [];
  const ui = recorder(calls, {}) as ExtensionUIContext;
  const named = (method: string) =>
    calls.filter((call) => call.method === method).map((call) => call.args);
  return { calls, named, ui };
}

export function recorderContext({
  ui,
  mode = "tui",
  contextPct,
}: RecorderContextInit): ExtensionCommandContext {
  const usage =
    contextPct === undefined
      ? undefined
      : { contextWindow: 272_000, percent: contextPct, tokens: 1 };
  const ctx = {
    getContextUsage: () => usage,
    hasUI: true,
    isIdle: () => true,
    mode,
    model: undefined,
    ui,
  };
  return ctx as unknown as ExtensionCommandContext;
}

export function createFakeTui(): FakeTui {
  let count = 0;
  const tui = {
    requestRender: () => {
      count += 1;
    },
  };
  return { renders: () => count, tui: tui as unknown as TUI };
}

export function createPiRecorder(): PiRecorder {
  const calls: Call[] = [];
  const handlers = new Map<string, Handler[]>();
  const commands = new Map<string, Command>();
  const messageRenderers = new Map<string, MessageRenderer>();
  const entryRenderers = new Map<string, EntryRenderer>();
  const entries: { customType: string; data: unknown }[] = [];
  const known = {
    appendEntry: (customType: string, data: unknown) =>
      entries.push({ customType, data }),
    getThinkingLevel: () => "high",
    on: (event: string, handler: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () =>
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((h) => h !== handler),
        );
    },
    registerCommand: (name: string, command: Command) =>
      commands.set(name, command),
    registerEntryRenderer: (type: string, renderer: EntryRenderer) =>
      entryRenderers.set(type, renderer),
    registerMessageRenderer: (type: string, renderer: MessageRenderer) =>
      messageRenderers.set(type, renderer),
  };
  const fire = async (
    event: string,
    payload: unknown,
    ctx: ExtensionCommandContext,
  ) => {
    for (const handler of handlers.get(event) ?? [])
      await handler(payload, ctx);
  };
  const run = async (
    name: string,
    args: string,
    ctx: ExtensionCommandContext,
  ) => {
    const command = commands.get(name);
    if (!command) throw new Error(`no command /${name}`);
    await command.handler(args, ctx);
  };
  const pi = recorder(calls, known) as ExtensionAPI;
  return {
    calls,
    commands,
    entries,
    entryRenderers,
    fire,
    messageRenderers,
    pi,
    run,
  };
}
