import { describe, expect, jest, test } from "bun:test";
import { SelfStore } from "#wow/self-store";

const HOME = { mapId: 530, x: 1, y: 2, z: 3, orientation: 0 };

describe("SelfStore login", () => {
  test("a login wait resolves on the verify packet even when a listener throws", async () => {
    const self = new SelfStore();
    self.onEvent(() => {
      throw new Error("socket closed");
    });
    const login = self.waitLogin();
    expect(() =>
      self.receive({ type: "login_verified", position: HOME }),
    ).toThrow("socket closed");
    await login;
    expect(self.loggedIn).toBe(true);
    expect(self.mapId).toBe(530);
    await self.waitLogin();
  });

  test("a login wait without a verify packet times out", async () => {
    jest.useFakeTimers();
    try {
      const login = new SelfStore().waitLogin(1000);
      jest.advanceTimersByTime(1000);
      await expect(login).rejects.toThrow("Timed out waiting for opcode 0x236");
    } finally {
      jest.useRealTimers();
    }
  });

  test("a new world moves the current map", () => {
    const self = new SelfStore();
    self.receive({ type: "login_verified", position: HOME });
    self.receive({ type: "new_world", position: { ...HOME, mapId: 0 } });
    expect(self.mapId).toBe(0);
  });
});
