export type Schema = {
  type?: string;
  required?: readonly string[];
  properties?: Readonly<Record<string, Schema>>;
  items?: Schema;
  enum?: readonly unknown[];
  pattern?: string;
  minimum?: number;
  maxLength?: number;
  additionalProperties?: Schema | boolean;
};

export function schemaErrors(schema: Schema, value: unknown): string[] {
  return errorsAt(schema, value, "$");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasType(type: string | undefined, value: unknown): boolean {
  if (type === undefined) return true;
  if (type === "integer") return Number.isInteger(value);
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  return typeof value === type;
}

function errorsAt(node: Schema, value: unknown, path: string): string[] {
  if (node.enum !== undefined)
    return node.enum.includes(value)
      ? []
      : [`${path}: expected one of ${node.enum.join("|")}`];
  if (!hasType(node.type, value)) return [`${path}: expected ${node.type}`];
  if (Array.isArray(value))
    return value.flatMap((item, i) =>
      node.items ? errorsAt(node.items, item, `${path}[${i}]`) : [],
    );
  if (isObject(value)) return objectErrors(node, value, path);
  return scalarErrors(node, value, path);
}

function objectErrors(
  node: Schema,
  value: Record<string, unknown>,
  path: string,
): string[] {
  const properties = node.properties ?? {};
  const missing = (node.required ?? [])
    .filter((key) => !Object.hasOwn(value, key))
    .map((key) => `${path}: missing ${key}`);
  const listed = Object.entries(properties).flatMap(([key, child]) =>
    Object.hasOwn(value, key)
      ? errorsAt(child, value[key], `${path}.${key}`)
      : [],
  );
  return [...missing, ...listed, ...extraErrors(node, value, path)];
}

function extraErrors(
  node: Schema,
  value: Record<string, unknown>,
  path: string,
): string[] {
  const extra = node.additionalProperties;
  if (extra === undefined || extra === true) return [];
  const properties = node.properties ?? {};
  const unlisted = Object.entries(value).filter(
    ([key]) => !Object.hasOwn(properties, key),
  );
  if (extra === false)
    return unlisted.map(([key]) => `${path}: unknown ${key}`);
  return unlisted.flatMap(([key, child]) =>
    errorsAt(extra, child, `${path}.${key}`),
  );
}

function scalarErrors(node: Schema, value: unknown, path: string): string[] {
  const errors: string[] = [];
  if (
    node.pattern !== undefined &&
    typeof value === "string" &&
    !new RegExp(node.pattern).test(value)
  ) {
    errors.push(`${path}: does not match ${node.pattern}`);
  }
  if (
    node.minimum !== undefined &&
    typeof value === "number" &&
    value < node.minimum
  ) {
    errors.push(`${path}: below minimum ${node.minimum}`);
  }
  if (
    node.maxLength !== undefined &&
    typeof value === "string" &&
    value.length > node.maxLength
  ) {
    errors.push(`${path}: longer than ${node.maxLength}`);
  }
  return errors;
}
