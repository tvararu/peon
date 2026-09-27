import { describe, expect, test } from "bun:test";
import { sendToSocket } from "#cli/ipc";
import { useIpcServer } from "#test-support/commands-fixtures";

describe("daemon notices", () => {
  const ipc = useIpcServer();

  test("a not-implemented notice reads back as the old system line", async () => {
    ipc.start();
    ipc.handle.triggerNotice({
      at: 1,
      label: "Weather change",
      opcode: 1,
      text: "[tuicraft] Weather change is not yet implemented",
      type: "not_implemented",
    });
    const lines = await sendToSocket("READ", ipc.sockPath);
    expect(lines).toEqual([
      "[system] [tuicraft] Weather change is not yet implemented",
    ]);
  });
});
