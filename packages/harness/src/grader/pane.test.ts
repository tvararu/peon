import { describe, expect, test } from "bun:test";
import {
  attachPane,
  HARNESS_LAUNCH,
  harnessCommand,
  openPane,
  shellQuote,
} from "#harness/grader/pane";
import { failed, fakeExec, ok, orcaOk } from "#test-support/fake-exec";

const HANDLE = "term_6f35ae69-5890-46e9-9b7c-1fd52a01c76c";
const STALE = JSON.stringify({
  error: { code: "terminal_handle_stale", message: "terminal_handle_stale" },
  ok: false,
});
const TIMEOUT = JSON.stringify({
  error: { code: "timeout", message: "timeout" },
  ok: false,
});
const EXITED = JSON.stringify({
  ok: true,
  result: { wait: { condition: "exit", satisfied: true, status: "exited" } },
});

describe("harnessCommand", () => {
  test("execs the harness with the profile, the run dir and nerd glyphs", () => {
    expect(
      harnessCommand({
        profile: "/wt/tmp/evals/1/t0-self-state-1/account.json",
        runDir: "/wt/tmp/evals/1/t0-self-state-1",
      }),
    ).toBe(
      `exec ${HARNESS_LAUNCH} --profile /wt/tmp/evals/1/t0-self-state-1/account.json --run-dir /wt/tmp/evals/1/t0-self-state-1 --glyphs nerd`,
    );
  });

  test("quotes a path with a space or a quote", () => {
    expect(shellQuote("/a b/it's")).toBe("'/a b/it'\\''s'");
    expect(shellQuote("/plain/path-1.json")).toBe("/plain/path-1.json");
  });
});

describe("openPane", () => {
  test("creates a terminal in the worktree and uses the returned handle", async () => {
    const { calls, exec } = fakeExec(() =>
      orcaOk({
        handle: HANDLE,
        surface: "background",
        title: "eval-1-t0-self-state-1",
      }),
    );
    const pane = await openPane({
      command: "exec cat",
      exec,
      title: "eval-1-t0-self-state-1",
      worktree: "/wt",
    });
    expect(pane.id).toBe(HANDLE);
    expect(calls[0]?.argv).toEqual([
      "orca-ide",
      "terminal",
      "create",
      "--worktree",
      "path:/wt",
      "--title",
      "eval-1-t0-self-state-1",
      "--command",
      "exec cat",
      "--json",
    ]);
  });

  test("throws when orca-ide fails", async () => {
    const { exec } = fakeExec(() => failed(1, "no runtime"));
    await expect(
      openPane({ command: "exec cat", exec, title: "t", worktree: "/wt" }),
    ).rejects.toThrow("orca-ide terminal create failed (1): no runtime");
  });
});

describe("attachPane", () => {
  test("sends text with --terminal and --enter", async () => {
    const { calls, exec } = fakeExec(() => orcaOk({ handle: HANDLE }));
    await attachPane({ exec, id: HANDLE }).send("Quick status", {
      enter: true,
    });
    expect(calls[0]?.argv).toEqual([
      "orca-ide",
      "terminal",
      "send",
      "--terminal",
      HANDLE,
      "--text",
      "Quick status",
      "--enter",
      "--json",
    ]);
  });

  test("reads the rendered screen as one string", async () => {
    const { calls, exec } = fakeExec(() =>
      orcaOk({
        handle: HANDLE,
        source: "screen",
        tail: ["line one", "line two"],
      }),
    );
    expect(await attachPane({ exec, id: HANDLE }).screen()).toBe(
      "line one\nline two",
    );
    expect(calls[0]?.argv).toEqual([
      "orca-ide",
      "terminal",
      "read",
      "--terminal",
      HANDLE,
      "--screen",
      "--json",
    ]);
  });

  test("escape sends one ESC byte", async () => {
    const { calls, exec } = fakeExec(() => orcaOk({ handle: HANDLE }));
    await attachPane({ exec, id: HANDLE }).escape();
    expect(calls[0]?.argv).toContain("\u001b");
  });

  test("quit sends Ctrl-D and stops when the pane exits", async () => {
    const { calls, exec } = fakeExec((argv) =>
      argv[2] === "wait" ? ok(EXITED) : orcaOk({ handle: HANDLE }),
    );
    await attachPane({ exec, id: HANDLE }).quit();
    const texts = calls.flatMap((call) =>
      call.argv[2] === "send" ? [call.argv[6]] : [],
    );
    expect(texts).toEqual(["\u0004"]);
  });

  test("quit sends two Ctrl-C when read --screen still shows Pi after Ctrl-D", async () => {
    const { calls, exec } = fakeExec((argv) => {
      if (argv[2] === "wait") return failed(1, "", TIMEOUT);
      if (argv[2] === "read")
        return orcaOk({
          handle: HANDLE,
          status: "running",
          tail: ["─".repeat(40)],
        });
      return orcaOk({ handle: HANDLE });
    });
    await attachPane({ exec, id: HANDLE }).quit();
    const texts = calls.flatMap((call) =>
      call.argv[2] === "send" ? [call.argv[6]] : [],
    );
    expect(texts).toEqual(["\u0004", "\u0003", "\u0003"]);
    expect(calls.find((call) => call.argv[2] === "wait")?.argv).toEqual([
      "orca-ide",
      "terminal",
      "wait",
      "--terminal",
      HANDLE,
      "--for",
      "exit",
      "--timeout-ms",
      "3000",
      "--json",
    ]);
    expect(calls.find((call) => call.argv[2] === "read")?.argv).toEqual([
      "orca-ide",
      "terminal",
      "read",
      "--terminal",
      HANDLE,
      "--screen",
      "--json",
    ]);
  });

  test("quit sends no Ctrl-C when read --screen shows Pi has gone", async () => {
    const { calls, exec } = fakeExec((argv) => {
      if (argv[2] === "wait") return failed(1, "", TIMEOUT);
      if (argv[2] === "read")
        return orcaOk({ handle: HANDLE, status: "exited", tail: [] });
      return orcaOk({ handle: HANDLE });
    });
    await attachPane({ exec, id: HANDLE }).quit();
    const texts = calls.flatMap((call) =>
      call.argv[2] === "send" ? [call.argv[6]] : [],
    );
    expect(texts).toEqual(["\u0004"]);
  });

  test("quit treats a Ctrl-D the exiting pane refused as sent", async () => {
    const notWritable = JSON.stringify({
      error: {
        code: "terminal_not_writable",
        message: "terminal_not_writable",
      },
      ok: false,
    });
    const { calls, exec } = fakeExec((argv) => {
      if (argv[2] === "send") return failed(1, "", notWritable);
      if (argv[2] === "wait") return ok(EXITED);
      return orcaOk({ handle: HANDLE });
    });
    await attachPane({ exec, id: HANDLE }).quit();
    expect(calls.map((call) => call.argv[2])).toEqual(["send", "wait"]);
  });

  test("quit still fails when Orca refuses the Ctrl-D for another reason", async () => {
    const { exec } = fakeExec(() => failed(1, "boom"));
    await expect(attachPane({ exec, id: HANDLE }).quit()).rejects.toThrow(
      "orca-ide terminal send failed (1): boom",
    );
  });

  test("waitExit is false on a timeout and true on exit", async () => {
    const timeout = fakeExec(() => failed(1, "", TIMEOUT));
    const exited = fakeExec(() => ok(EXITED));
    expect(
      await attachPane({ exec: timeout.exec, id: HANDLE }).waitExit(500),
    ).toBe(false);
    expect(
      await attachPane({ exec: exited.exec, id: HANDLE }).waitExit(500),
    ).toBe(true);
  });

  test("close closes the tab", async () => {
    const { calls, exec } = fakeExec(() => orcaOk({ closeMode: "tab" }));
    await attachPane({ exec, id: HANDLE }).close();
    expect(calls[0]?.argv).toEqual([
      "orca-ide",
      "terminal",
      "close",
      "--terminal",
      HANDLE,
      "--tab",
      "--json",
    ]);
  });

  test("treats a stale handle as closed", async () => {
    const { exec } = fakeExec(() => failed(1, "", STALE));
    await expect(
      attachPane({ exec, id: HANDLE }).close(),
    ).resolves.toBeUndefined();
  });

  test("close throws on any other failure", async () => {
    const { exec } = fakeExec(() => failed(1, "no runtime"));
    await expect(attachPane({ exec, id: HANDLE }).close()).rejects.toThrow(
      "orca-ide terminal close failed (1): no runtime",
    );
  });
});
