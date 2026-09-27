const SECRET = "[secret]";

export function scrub(value: unknown, secret: string): unknown {
  if (secret.length === 0) return value;
  if (typeof value === "string") return value.replaceAll(secret, SECRET);
  if (Array.isArray(value)) return value.map((item) => scrub(item, secret));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrub(item, secret)]),
    );
  return value;
}
