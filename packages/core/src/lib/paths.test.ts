import { describe, expect, test } from "bun:test";
import { resolvePaths } from "#lib/paths";

const host = { home: "/home/u", tmp: "/tmp", uid: 1000 };

describe("resolvePaths", () => {
  test("honours XDG directories", () => {
    const paths = resolvePaths(
      {
        XDG_CONFIG_HOME: "/cfg",
        XDG_RUNTIME_DIR: "/run/user/7",
        XDG_STATE_HOME: "/state",
      },
      host,
    );
    expect(paths).toEqual({
      configDir: "/cfg/peon",
      configPath: "/cfg/peon/config.toml",
      logPath: "/state/peon/session.log",
      pidPath: "/run/user/7/peon/pid",
      runtimeDir: "/run/user/7/peon",
      socketPath: "/run/user/7/peon/sock",
      stateDir: "/state/peon",
    });
  });

  test("falls back to home and a uid-scoped temp directory", () => {
    const paths = resolvePaths({}, host);
    expect(paths.configDir).toBe("/home/u/.config/peon");
    expect(paths.stateDir).toBe("/home/u/.local/state/peon");
    expect(paths.runtimeDir).toBe("/tmp/peon-1000");
    expect(paths.socketPath).toBe("/tmp/peon-1000/sock");
  });

  test("treats empty XDG values as unset", () => {
    const env = { XDG_CONFIG_HOME: "", XDG_STATE_HOME: "" };
    const paths = resolvePaths(env, host);
    expect(paths.configDir).toBe("/home/u/.config/peon");
    expect(paths.stateDir).toBe("/home/u/.local/state/peon");
  });
});
