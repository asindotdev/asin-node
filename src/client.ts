import {
  AsinApiError,
  AsinConfigurationError,
  AsinResponseDecodingError,
  AsinSerializationError,
  AsinTransportError,
} from "./errors.js";
import { ENDPOINTS, type EndpointName } from "./endpoints.js";
import type * as Params from "./params.js";
import { encodeQueryPairs, serializeRequest } from "./serialization.js";
import type {
  ApiResponse,
  BatchOptions,
  BatchResult,
  BinaryResponse,
  HttpMethod,
  JsonResponse,
  RawResponse,
  RequestOptions,
  AsinClientOptions,
  AsinFetch,
} from "./types.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://www.asin.dev/api/v1";
export const DEFAULT_TIMEOUT_MS = 120_000;
/** Retries after a network error or a 408, 429, 500, 502, 503 or 504 response. */
export const MAX_RETRIES = 3;
/** Delay before the first retry, in milliseconds. */
export const DEFAULT_RETRY_DELAY_MS = 1_000;
/** Each retry waits this many times longer than the previous one (a Retry-After header wins). */
export const RETRY_BACKOFF_FACTOR = 1.5;
/** Longest wait between two attempts, in milliseconds. */
export const MAX_RETRY_DELAY_MS = 30_000;
/** Tasks run at the same time by batch(). */
export const DEFAULT_CONCURRENCY = 10;
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(rawResponse: RawResponse): boolean {
  return RETRYABLE_STATUSES.has(rawResponse.status);
}
const API_KEY_ENVIRONMENT_VARIABLE = "ASIN_API_KEY";

type EmptyParams = Params.EmptyParams;

/**
 * Official Asin API client. Create one instance and reuse it.
 */
export class AsinClient {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeout: number;
  readonly #maxRetries: number;
  readonly #retryDelay: number;
  readonly #headers: Readonly<Record<string, string>>;
  readonly #fetch: AsinFetch;

  constructor(options: AsinClientOptions = {}) {
    if (
      typeof options !== "object" ||
      options === null ||
      Array.isArray(options)
    ) {
      throw new AsinConfigurationError("AsinClient options must be an object.");
    }
    const apiKey =
      options.apiKey ?? readEnvironment(API_KEY_ENVIRONMENT_VARIABLE);
    if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
      throw new AsinConfigurationError(
        `A non-blank Asin API key is required. Pass apiKey or set ${API_KEY_ENVIRONMENT_VARIABLE}.`,
      );
    }
    try {
      new Headers({ Authorization: `Bearer ${apiKey}` });
    } catch (cause) {
      throw new AsinConfigurationError(
        "The Asin API key cannot be used in an HTTP header.",
        { cause },
      );
    }

    const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    let parsedBaseUrl: URL;
    try {
      parsedBaseUrl = new URL(baseUrl);
    } catch (cause) {
      throw new AsinConfigurationError("baseUrl must be an absolute URL.", {
        cause,
      });
    }
    if (
      parsedBaseUrl.protocol !== "https:" &&
      parsedBaseUrl.protocol !== "http:"
    ) {
      throw new AsinConfigurationError("baseUrl must use http or https.");
    }

    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    if (
      typeof timeout !== "number" ||
      !Number.isFinite(timeout) ||
      timeout < 0
    ) {
      throw new AsinConfigurationError(
        "timeout must be a non-negative number of milliseconds.",
      );
    }

    const maxRetries = options.maxRetries ?? MAX_RETRIES;
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new AsinConfigurationError(
        "maxRetries must be a non-negative integer.",
      );
    }
    const retryDelayMs = options.retryDelay ?? DEFAULT_RETRY_DELAY_MS;
    if (
      typeof retryDelayMs !== "number" ||
      !Number.isFinite(retryDelayMs) ||
      retryDelayMs < 0
    ) {
      throw new AsinConfigurationError(
        "retryDelay must be a non-negative number of milliseconds.",
      );
    }

    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function") {
      throw new AsinConfigurationError(
        "A Fetch-compatible transport is required.",
      );
    }

    this.#apiKey = apiKey;
    this.#baseUrl = baseUrl.replace(/\/+$/, "");
    this.#timeout = timeout;
    this.#maxRetries = maxRetries;
    this.#retryDelay = retryDelayMs;
    this.#headers = Object.freeze({ ...(options.headers ?? {}) });
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Sends any request to the Asin API. Use it for endpoints released after this SDK version.
   * GET and DELETE parameters travel in the query string; POST and PATCH parameters travel in a JSON body.
   */
  async request<T = any>(
    method: HttpMethod,
    path: string,
    params?: Readonly<Record<string, unknown>> | null,
    options?: RequestOptions | null,
  ): Promise<ApiResponse<T>> {
    return this.#send<T>(method, path, params, options, "any");
  }

  /**
   * Runs `task` for every item with at most `concurrency` tasks in flight (default 10) and returns one result per
   * item, in input order. A failing item never stops the others.
   *
   * ```ts
   * const results = await client.batch(ids, (id) => client.someEndpoint({ query: id }));
   * ```
   */
  async batch<I, T>(
    items: Iterable<I>,
    task: (item: I, index: number) => Promise<T>,
    options: BatchOptions = {},
  ): Promise<BatchResult<T>[]> {
    const list = [...items];
    const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new AsinConfigurationError(
        "concurrency must be a positive integer.",
      );
    }
    const results: BatchResult<T>[] = new Array(list.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < list.length) {
        const index = next++;
        options.signal?.throwIfAborted();
        try {
          results[index] = {
            status: "fulfilled",
            index,
            value: await task(list[index]!, index),
          };
        } catch (reason) {
          results[index] = { status: "rejected", index, reason };
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, list.length) }, worker),
    );
    return results;
  }

  /**
   * Check the price now. Asks for a check right away (1 credit), at most once per 5 minutes; earlier calls return the product unchanged. A paused product has to be resumed first. The check runs in the background; with wait=true the answer waits for it. Read last_e…
   *
   * `POST /products/{id}/check`
   */
  checkProduct<T = any>(
    params: Params.CheckProductParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("check_product", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Stop tracking a product. Removes the product and its price history.
   *
   * `DELETE /products/{id}`
   */
  deleteProduct<T = any>(
    params: Params.DeleteProductParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("delete_product", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Read every offer from Amazon. Reads the offers on Amazon for 1 credit, refunded if it doesn't answer. A read made in the last 3 hours, by anyone, is returned instead, for free (charged: false). The answer is the same as GET /offers.
   *
   * `POST /offers`
   */
  fetchOffers<T = any>(
    params: Params.FetchOffersParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("fetch_offers", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Plan and remaining credits. Your plan, the credits left (monthly allowance and packs), how many products you track and the credits they use per month.
   *
   * `GET /account`
   */
  getAccount<T = any>(
    params?: EmptyParams | null,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("get_account", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Price history of any ASIN. Every price Asin read for an ASIN on a marketplace over the period, whoever tracks it, oldest first, with the lowest, highest and average of those prices. A history of more than 5000 points is thinned evenly, keeping its first and last poi…
   *
   * `GET /history`
   */
  getAsinHistory<T = any>(
    params: Params.GetAsinHistoryParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("get_asin_history", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Offers already known. Who sells the product and at what price, as last read, cheapest first, with Amazon's own price and the cheapest new and used offers (used is only known for Amazon's own outlet). Free: this never reads Amazon or spends a credit. When nobody…
   *
   * `GET /offers`
   */
  getOffers<T = any>(
    params: Params.GetOffersParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("get_offers", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Get a product and its price history. The product's latest state and every price read of the period, oldest first. The history covers every read of this ASIN on this marketplace, including those made before you added it, so a product added today can come with months of prices;…
   *
   * `GET /products/{id}`
   */
  getProduct<T = any>(
    params: Params.GetProductParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("get_product", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * List tracked products. Your watchlist, newest first, with each product's latest state and its recent prices (trend). Filter with asin (and marketplace) to know if a product is tracked, or with filter to get the same lists as the app's tabs.
   *
   * `GET /products`
   */
  listProducts<T = any>(
    params?: Params.ListProductsParams | null,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("list_products", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Search Amazon. Amazon search results (up to 60, sponsored included), to find the ASIN of a product. Free, limited to 30 searches per hour.
   *
   * `GET /search`
   */
  searchAmazon<T = any>(
    params: Params.SearchAmazonParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("search_amazon", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Track a product. Adds an ASIN, an Amazon link or a short link (amzn.to, a.co…) to your watchlist. The first check runs in the background within seconds (checking is true until then): poll GET /products/{id}, or send wait: true to get the answer once it's d…
   *
   * `POST /products`
   */
  trackProduct<T = any>(
    params: Params.TrackProductParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("track_product", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  /**
   * Change alerts and checks. Target price, drop alerts, check interval, or pause. Send only what changes.
   *
   * `PATCH /products/{id}`
   */
  updateProduct<T = any>(
    params: Params.UpdateProductParams,
    options?: RequestOptions | null,
  ): Promise<JsonResponse<T>> {
    return this.#call("update_product", params, options) as Promise<
      JsonResponse<T>
    >;
  }

  async #call(
    name: EndpointName,
    params: Readonly<object> | null | undefined,
    options: RequestOptions | null | undefined,
  ): Promise<ApiResponse> {
    const endpoint = ENDPOINTS[name];
    const supported: readonly HttpMethod[] = endpoint.methods;
    const method = options?.method ?? supported[0] ?? "GET";
    if (!supported.includes(method)) {
      throw new AsinConfigurationError(
        `${endpoint.path} supports ${supported.join(", ")}, not ${method}.`,
      );
    }
    const values = (params ?? {}) as Readonly<Record<string, unknown>>;
    for (const name of endpoint.required as readonly string[]) {
      if (values[name] === undefined || values[name] === null) {
        throw new AsinSerializationError(
          `The "${name}" parameter is required.`,
          name,
        );
      }
    }
    return this.#send(
      method,
      endpoint.path,
      values,
      { ...options, method },
      endpoint.response,
    );
  }

  async #send<T>(
    method: HttpMethod,
    path: string,
    params: Readonly<Record<string, unknown>> | null | undefined,
    options: RequestOptions | null | undefined,
    expected: "json" | "any",
  ): Promise<ApiResponse<T>> {
    if (
      method !== "GET" &&
      method !== "POST" &&
      method !== "PATCH" &&
      method !== "DELETE"
    ) {
      throw new AsinConfigurationError(
        `Unsupported HTTP method: ${String(method)}.`,
      );
    }
    if (typeof path !== "string" || !path.startsWith("/")) {
      throw new AsinConfigurationError('The request path must start with "/".');
    }
    const serialized = serializeRequest(method, path, params);
    const url = new URL(this.#baseUrl + serialized.path);
    if (serialized.query.length > 0)
      url.search = encodeQueryPairs(serialized.query);

    const headers = new Headers({
      Accept: "application/json, */*;q=0.8",
      "User-Agent": `asin-node/${VERSION}`,
      ...this.#headers,
      ...(options?.headers ?? {}),
      Authorization: `Bearer ${this.#apiKey}`,
    });
    const init: RequestInit = { method, headers, redirect: "manual" };
    if (serialized.body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(serialized.body);
    }

    const timeout = options?.timeout ?? this.#timeout;
    const maxRetries = options?.maxRetries ?? this.#maxRetries;
    let rawResponse: RawResponse;
    for (let attempt = 0; ; attempt++) {
      options?.signal?.throwIfAborted();
      const signals: AbortSignal[] = [];
      if (options?.signal) signals.push(options.signal);
      const deadline = timeout > 0 ? AbortSignal.timeout(timeout) : undefined;
      if (deadline) signals.push(deadline);
      if (signals.length > 0)
        init.signal =
          signals.length === 1 ? signals[0]! : AbortSignal.any(signals);

      try {
        const response = await this.#fetch(url, init);
        const body = new Uint8Array(await response.arrayBuffer());
        rawResponse = createRawResponse(response, body);
      } catch (cause) {
        if (options?.signal?.aborted) throw cause;
        if (deadline?.aborted) {
          throw new AsinTransportError(
            `Asin request timed out after ${timeout} ms.`,
            cause,
          );
        }
        if (attempt < maxRetries) {
          await sleep(
            retryDelay(this.#retryDelay, attempt, undefined),
            options?.signal ?? undefined,
          );
          continue;
        }
        throw new AsinTransportError(
          "Asin request failed before an HTTP response body was received.",
          cause,
        );
      }

      if (rawResponse.status >= 200 && rawResponse.status <= 299) break;
      if (isRetryable(rawResponse) && attempt < maxRetries) {
        const retryAfter = rawResponse.headers.get("retry-after")?.[0];
        await sleep(
          retryDelay(this.#retryDelay, attempt, retryAfter),
          options?.signal ?? undefined,
        );
        continue;
      }
      throw createApiError(rawResponse);
    }
    return decodeSuccessResponse<T>(rawResponse, expected);
  }
}

function retryDelay(
  baseMs: number,
  attempt: number,
  retryAfter: string | undefined,
): number {
  const seconds = retryAfter === undefined ? Number.NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(seconds * 1_000, 60_000);
  return Math.min(baseMs * RETRY_BACKOFF_FACTOR ** attempt, MAX_RETRY_DELAY_MS);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function readEnvironment(name: string): string | undefined {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  const value = env?.[name];
  return value === undefined || value === "" ? undefined : value;
}

function createRawResponse(response: Response, body: Uint8Array): RawResponse {
  const headers = new Map<string, readonly string[]>();
  for (const [name, value] of response.headers) {
    headers.set(name.toLowerCase(), Object.freeze([value]));
  }
  const getSetCookie = (
    response.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  if (typeof getSetCookie === "function") {
    const values = getSetCookie.call(response.headers);
    if (values.length > 0)
      headers.set("set-cookie", Object.freeze([...values]));
  }
  return {
    status: response.status,
    statusText: response.statusText,
    headers,
    contentType: response.headers.get("content-type"),
    body,
  };
}

function createApiError(rawResponse: RawResponse): AsinApiError {
  const parsed = tryParseJson(rawResponse.body);
  const objectBody =
    parsed.ok && isJsonObject(parsed.value) ? parsed.value : null;
  // The API answers {"error": {"code", "message"}}.
  const nestedError = objectBody?.["error"];
  let errorMessage: string | undefined =
    isJsonObject(nestedError) && typeof nestedError["message"] === "string"
      ? nestedError["message"]
      : undefined;
  for (const key of ["error", "message", "error_message", "detail"]) {
    const value = objectBody?.[key];
    if (typeof value === "string" && value.length > 0) {
      errorMessage = value;
      break;
    }
  }
  return new AsinApiError({
    rawResponse,
    ...(parsed.ok ? { responseBody: parsed.value } : {}),
    ...(errorMessage === undefined ? {} : { errorMessage }),
  });
}

function decodeSuccessResponse<T>(
  rawResponse: RawResponse,
  expected: "json" | "any",
): ApiResponse<T> {
  if (!isJsonMediaType(rawResponse.contentType)) {
    if (expected === "json") {
      throw new AsinResponseDecodingError(
        "Asin returned a successful non-JSON response for a JSON operation.",
        rawResponse,
        new TypeError(
          `Unexpected content type: ${rawResponse.contentType ?? "none"}.`,
        ),
      );
    }
    const binary: BinaryResponse = {
      kind: "binary",
      bytes: rawResponse.body,
      contentType: rawResponse.contentType,
      rawResponse,
    };
    return binary;
  }
  const parsed = tryParseJson(rawResponse.body);
  if (!parsed.ok) {
    throw new AsinResponseDecodingError(
      "Asin returned a successful JSON response that could not be decoded.",
      rawResponse,
      parsed.cause,
    );
  }
  const json: JsonResponse<T> = {
    kind: "json",
    data: parsed.value as T,
    rawResponse,
  };
  return json;
}

function isJsonMediaType(contentType: string | null): boolean {
  if (contentType === null) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return (
    mediaType === "application/json" || Boolean(mediaType?.endsWith("+json"))
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseJson(
  body: Uint8Array,
): { ok: true; value: unknown } | { ok: false; cause: unknown } {
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body)) };
  } catch (cause) {
    return { ok: false, cause };
  }
}
