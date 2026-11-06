/**
 * A string union that still accepts values added to the API after this SDK was released.
 */
export type OpenString<T extends string> = T | (string & {});

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type JsonPrimitive = string | number | boolean | null | undefined;
export type JsonValue =
  JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/** Fetch-compatible function used for every API request. */
export type AsinFetch = (
  input: URL | string,
  init: RequestInit,
) => Promise<Response>;

export interface AsinClientOptions {
  /** API key sent as a Bearer token in the `Authorization` header. Defaults to the `ASIN_API_KEY` environment variable. */
  apiKey?: string | null | undefined;
  /** API origin. Defaults to `https://www.asin.dev/api/v1`. */
  baseUrl?: string | null | undefined;
  /** Client-side deadline per request, in milliseconds. Defaults to 120000; `0` disables it. */
  timeout?: number | null | undefined;
  /** Extra headers sent with every request. */
  headers?: Record<string, string> | null | undefined;
  /** Retries after a network error or a 408/429/5xx response. Defaults to 3; `0` disables retries. */
  maxRetries?: number | null | undefined;
  /** Delay before the first retry in milliseconds, growing 1.5× per retry. Defaults to 1000. */
  retryDelay?: number | null | undefined;
  /** Custom Fetch-compatible transport. Defaults to the global `fetch`. */
  fetch?: AsinFetch | null | undefined;
}

export interface RequestOptions {
  /** HTTP method. Defaults to the method of the operation. */
  method?: HttpMethod | null | undefined;
  /** Cancels the request. */
  signal?: AbortSignal | null | undefined;
  /** Overrides the client retry count for this request. */
  maxRetries?: number | null | undefined;
  /** Overrides the client deadline for this request, in milliseconds. */
  timeout?: number | null | undefined;
  /** Extra headers for this request. */
  headers?: Record<string, string> | null | undefined;
}

/** Buffered HTTP response as received from the API. */
export interface RawResponse {
  readonly status: number;
  readonly statusText: string;
  /** Lower-cased header names mapped to every received value. */
  readonly headers: ReadonlyMap<string, readonly string[]>;
  readonly contentType: string | null;
  readonly body: Uint8Array;
}

export interface JsonResponse<T = any> {
  readonly kind: "json";
  /** Parsed JSON body. */
  readonly data: T;
  readonly rawResponse: RawResponse;
}

export interface BinaryResponse {
  readonly kind: "binary";
  /** Response body (image, PDF, HTML…). */
  readonly bytes: Uint8Array;
  readonly contentType: string | null;
  readonly rawResponse: RawResponse;
}

export type ApiResponse<T = any> = JsonResponse<T> | BinaryResponse;

export interface BatchOptions {
  /** Tasks in flight at the same time. Defaults to 10. */
  concurrency?: number | undefined;
  /** Stops starting new tasks once aborted. */
  signal?: AbortSignal | null | undefined;
}

/** Outcome of one batch item, shaped like `Promise.allSettled`. */
export type BatchResult<T> =
  | { readonly status: "fulfilled"; readonly index: number; readonly value: T }
  | {
      readonly status: "rejected";
      readonly index: number;
      readonly reason: unknown;
    };

export interface EndpointDefinition {
  readonly path: string;
  readonly methods: readonly HttpMethod[];
  readonly response: "json" | "any";
  readonly required: readonly string[];
}
