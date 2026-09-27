const sealed = new WeakSet<object>();

function refuseWrite(target: object): void {
  if (sealed.has(target)) throw new TypeError("read_only_snapshot");
}

class SnapshotMap<K, V> extends Map<K, V> {
  override set(key: K, value: V): this {
    refuseWrite(this);
    return super.set(key, value);
  }

  override delete(key: K): boolean {
    refuseWrite(this);
    return super.delete(key);
  }

  override clear(): void {
    refuseWrite(this);
    super.clear();
  }
}

class SnapshotSet<V> extends Set<V> {
  override add(value: V): this {
    refuseWrite(this);
    return super.add(value);
  }

  override delete(value: V): boolean {
    refuseWrite(this);
    return super.delete(value);
  }

  override clear(): void {
    refuseWrite(this);
    super.clear();
  }
}

function seal<T extends object>(value: T): T {
  sealed.add(value);
  return Object.freeze(value);
}

export function snapshot<T>(value: T): T {
  return copy(value, new WeakMap()) as T;
}

function copy(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value !== "object" || value === null) return value;
  const known = seen.get(value);
  if (known !== undefined) return known;
  if (value instanceof Promise) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    return structuredClone(value);
  if (value instanceof Date) return new Date(value.getTime());
  return copyContainer(value, seen);
}

function copyContainer(value: object, seen: WeakMap<object, unknown>): unknown {
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    seen.set(value, out);
    for (const item of value) out.push(copy(item, seen));
    return Object.freeze(out);
  }
  if (value instanceof Map) {
    const out = new SnapshotMap<unknown, unknown>();
    seen.set(value, out);
    for (const [key, item] of value) out.set(copy(key, seen), copy(item, seen));
    return seal(out);
  }
  if (value instanceof Set) {
    const out = new SnapshotSet<unknown>();
    seen.set(value, out);
    for (const item of value) out.add(copy(item, seen));
    return seal(out);
  }
  const out: Record<string, unknown> = Object.create(
    Object.getPrototypeOf(value),
  );
  seen.set(value, out);
  for (const [key, item] of Object.entries(value)) out[key] = copy(item, seen);
  return Object.freeze(out);
}
