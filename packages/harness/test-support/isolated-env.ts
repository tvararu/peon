const LEAKY =
  /KEY|TOKEN|SECRET|CREDENTIAL|^AWS_|^AZURE_|^GOOGLE_|VERTEX|CLOUDFLARE/i;

export function isolateProviderEnv(home: string): () => void {
  const savedEnv = new Map<string, string | undefined>();
  for (const key of Object.keys(Bun.env))
    if (LEAKY.test(key)) {
      savedEnv.set(key, Bun.env[key]);
      delete Bun.env[key];
    }
  const savedHome = process.env["HOME"];
  process.env["HOME"] = home;
  return () => {
    for (const [key, value] of savedEnv)
      if (value === undefined) delete Bun.env[key];
      else Bun.env[key] = value;
    if (savedHome === undefined) delete process.env["HOME"];
    else process.env["HOME"] = savedHome;
  };
}
