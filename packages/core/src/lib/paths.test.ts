import { describe, expect, test } from "bun:test";
import { resolvePaths } from "#lib/paths";

describe("resolvePaths", () => {
  test("honours XDG directories", () => {
    const paths = resolvePaths({
      XDG_CONFIG_HOME: "/cfg",
      XDG_RUNTIME_DIR: "/run/user/7",
      XDG_STATE_HOME: "/state",
    });
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
    const paths = resolvePaths({});
    expect(paths.configDir).toMatch(/\/\.config\/peon$/);
    expect(paths.stateDir).toMatch(/\/\.local\/state\/peon$/);
    expect(paths.runtimeDir).toMatch(/\/peon-\d+$/);
    expect(paths.socketPath).toBe(`${paths.runtimeDir}/sock`);
  });

  test("treats empty XDG values as unset", () => {
    const paths = resolvePaths({ XDG_CONFIG_HOME: "", XDG_STATE_HOME: "" });
    expect(paths.configDir).toMatch(/\/\.config\/peon$/);
    expect(paths.stateDir).toMatch(/\/\.local\/state\/peon$/);
  });
});
