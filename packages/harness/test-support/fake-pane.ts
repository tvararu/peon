import type { Pane } from "#harness/grader/pane";

export type FakePane = Pane & { sent: string[] };

export function fakePane(screens: readonly string[]): FakePane {
  const sent: string[] = [];
  let reads = 0;
  const screen = async (): Promise<string> => {
    const text = screens[Math.min(reads, screens.length - 1)] ?? "";
    reads += 1;
    return text;
  };
  return {
    close: async () => {},
    escape: async () => {
      sent.push("\u001b");
    },
    id: "term_fake",
    quit: async () => {
      sent.push("quit");
    },
    screen,
    send: async (text) => {
      sent.push(text);
    },
    sent,
    waitExit: async () => true,
  };
}
