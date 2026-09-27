export type Paths = {
  configDir: string;
  configPath: string;
  logPath: string;
  pidPath: string;
  runtimeDir: string;
  socketPath: string;
  stateDir: string;
};

export type PathEnv = Record<string, string | undefined>;

export type PathHost = { home: string; tmp: string; uid: number };

export function resolvePaths(env: PathEnv, host: PathHost): Paths {
  const configDir = `${env["XDG_CONFIG_HOME"] || `${host.home}/.config`}/peon`;
  const runtimeBase = env["XDG_RUNTIME_DIR"];
  const runtimeDir = runtimeBase
    ? `${runtimeBase}/peon`
    : `${host.tmp}/peon-${host.uid}`;
  const stateDir = `${env["XDG_STATE_HOME"] || `${host.home}/.local/state`}/peon`;
  return {
    configDir,
    configPath: `${configDir}/config.toml`,
    logPath: `${stateDir}/session.log`,
    pidPath: `${runtimeDir}/pid`,
    runtimeDir,
    socketPath: `${runtimeDir}/sock`,
    stateDir,
  };
}
