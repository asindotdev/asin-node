import { AsinSerializationError } from "./errors.js";
import type { HttpMethod } from "./types.js";

export type WirePair = readonly [name: string, value: string];

const QUERY_STRING_PARAMS: Readonly<Record<string, readonly string[]>> = {
  "/products/{id}/check": ["wait"],
};

export interface SerializedRequest {
  readonly path: string;
  readonly query: readonly WirePair[];
  readonly body: Record<string, unknown> | undefined;
}

/**
 * Fills `{name}` path segments, then sends the remaining parameters as query pairs (GET, DELETE) or a JSON body (POST, PATCH).
 * `wait` stays in the query string on POST /products/{id}/check.
 * `null`, `undefined` and empty arrays are omitted; `false` and `0` are sent.
 */
export function serializeRequest(
  method: HttpMethod,
  pathTemplate: string,
  params: Readonly<Record<string, unknown>> | null | undefined,
): SerializedRequest {
  if (
    params !== null &&
    params !== undefined &&
    (typeof params !== "object" || Array.isArray(params))
  ) {
    throw new AsinSerializationError(
      "Request parameters must be a plain object.",
    );
  }
  const remaining: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) remaining[name] = value;
  }

  const path = pathTemplate.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = remaining[name];
    delete remaining[name];
    if (value === undefined) {
      throw new AsinSerializationError(
        `The "${name}" path parameter is required.`,
        name,
      );
    }
    return encodeURIComponent(toWireString(name, value));
  });

  if (method === "GET" || method === "DELETE") {
    const query: WirePair[] = [];
    for (const [name, value] of Object.entries(remaining)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined && item !== null)
            query.push([name, toWireString(name, item)]);
        }
      } else {
        query.push([name, toWireString(name, value)]);
      }
    }
    return { path, query, body: undefined };
  }

  const query: WirePair[] = [];
  for (const name of QUERY_STRING_PARAMS[pathTemplate] ?? []) {
    if (name in remaining) {
      query.push([name, toWireString(name, remaining[name])]);
      delete remaining[name];
    }
  }
  for (const [name, value] of Object.entries(remaining)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new AsinSerializationError(
        `The "${name}" parameter must be a finite number.`,
        name,
      );
    }
  }
  return { path, query, body: remaining };
}

export function toWireString(name: string, value: unknown): string {
  switch (typeof value) {
    case "string":
      return value;
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new AsinSerializationError(
          `The "${name}" parameter must be a finite number.`,
          name,
        );
      }
      return String(value);
    case "bigint":
      return value.toString();
    case "object":
      try {
        return JSON.stringify(value);
      } catch (cause) {
        throw new AsinSerializationError(
          `The "${name}" parameter could not be serialized.`,
          name,
          { cause },
        );
      }
    default:
      throw new AsinSerializationError(
        `The "${name}" parameter has an unsupported type (${typeof value}).`,
        name,
      );
  }
}

export function encodeQueryPairs(pairs: readonly WirePair[]): string {
  return pairs
    .map(
      ([name, value]) =>
        `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}
