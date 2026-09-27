import type {
  ExtensionAPI,
  ExtensionContext,
  TerminalInputHandler,
} from "@earendil-works/pi-coding-agent";

type Handler = (event: never, ctx: ExtensionContext) => unknown;
type Shortcut = {
  description?: string;
  handler: (ctx: ExtensionContext) => Promise<void> | void;
};

export type FakeUi = {
  editor: string;
  notes: string[];
  inputs: TerminalInputHandler[];
};

export type FakePi = {
  api: ExtensionAPI;
  ui: FakeUi;
  ctx: ExtensionContext;
  events: () => string[];
  renderers: () => string[];
  emit: (
    event: { type: string } & Record<string, unknown>,
  ) => Promise<unknown[]>;
  press: (key: string) => Promise<void>;
  typeRaw: (
    data: string,
  ) => ({ consume?: boolean; data?: string } | undefined)[];
};

export function createFakePi(mode: "tui" | "print" = "tui"): FakePi {
  const handlers = new Map<string, Handler[]>();
  const shortcuts = new Map<string, Shortcut>();
  const renderers: string[] = [];
  const ui: FakeUi = { editor: "", inputs: [], notes: [] };
  const ctx = fakeContext(ui, mode);
  const api = {
    on(event: string, handler: Handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return () =>
        handlers.set(
          event,
          (handlers.get(event) ?? []).filter((h) => h !== handler),
        );
    },
    registerEntryRenderer(customType: string) {
      renderers.push(`entry:${customType}`);
    },
    registerMessageRenderer(customType: string) {
      renderers.push(`message:${customType}`);
    },
    registerShortcut(key: string, shortcut: Shortcut) {
      shortcuts.set(key, shortcut);
    },
    registerTool() {},
  } as unknown as ExtensionAPI;
  return {
    api,
    ctx,
    emit: async (event) =>
      Promise.all(
        (handlers.get(event.type) ?? []).map((h) => h(event as never, ctx)),
      ),
    events: () =>
      [...handlers.keys()].filter(
        (name) => (handlers.get(name) ?? []).length > 0,
      ),
    press: async (key) => {
      await shortcuts.get(key)?.handler(ctx);
    },
    renderers: () => [...renderers],
    typeRaw: (data) => ui.inputs.map((input) => input(data)),
    ui,
  };
}

function fakeContext(ui: FakeUi, mode: "tui" | "print"): ExtensionContext {
  const context = {
    mode,
    ui: {
      getEditorText: () => ui.editor,
      notify: (message: string) => ui.notes.push(message),
      onTerminalInput(handler: TerminalInputHandler) {
        ui.inputs.push(handler);
        return () => {
          ui.inputs = ui.inputs.filter((h) => h !== handler);
        };
      },
      setEditorText: (text: string) => {
        ui.editor = text;
      },
    },
  };
  return context as unknown as ExtensionContext;
}
