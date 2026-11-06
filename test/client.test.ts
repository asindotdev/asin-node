import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ENDPOINTS,
  AsinApiError,
  AsinClient,
  AsinConfigurationError,
  AsinResponseDecodingError,
  AsinSerializationError,
  AsinTransportError,
  type AsinFetch,
} from "../src/index.js";

type Recorded = { url: URL; init: RequestInit };

function mockFetch(
  responder: (request: Recorded) => Response | Promise<Response> = () =>
    jsonResponse({ ok: true }),
): { fetch: AsinFetch; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const fetch: AsinFetch = async (input, init) => {
    const recorded = { url: new URL(String(input)), init };
    calls.push(recorded);
    return responder(recorded);
  };
  return { fetch, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function header(call: Recorded, name: string): string | null {
  return new Headers(call.init.headers).get(name);
}

describe("AsinClient configuration", () => {
  it("requires an API key", () => {
    const previous = process.env.ASIN_API_KEY;
    delete process.env.ASIN_API_KEY;
    try {
      assert.throws(() => new AsinClient(), AsinConfigurationError);
      assert.throws(
        () => new AsinClient({ apiKey: "   " }),
        AsinConfigurationError,
      );
    } finally {
      if (previous !== undefined) process.env.ASIN_API_KEY = previous;
    }
  });

  it("reads the API key from ASIN_API_KEY", async () => {
    const previous = process.env.ASIN_API_KEY;
    process.env.ASIN_API_KEY = "env-key";
    try {
      const { fetch, calls } = mockFetch();
      const client = new AsinClient({ fetch });
      await client.request("GET", "/account");
      assert.equal(header(calls[0]!, "authorization"), "Bearer env-key");
    } finally {
      if (previous === undefined) delete process.env.ASIN_API_KEY;
      else process.env.ASIN_API_KEY = previous;
    }
  });

  it("rejects an invalid base URL and timeout", () => {
    assert.throws(
      () => new AsinClient({ apiKey: "k", baseUrl: "not a url" }),
      AsinConfigurationError,
    );
    assert.throws(
      () => new AsinClient({ apiKey: "k", timeout: -1 }),
      AsinConfigurationError,
    );
  });
});

describe("requests", () => {
  it("sends the featured operation as a GET with the API key header", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse({ hello: "world" }));
    const client = new AsinClient({ apiKey: "test-key", fetch });
    const response = await client.searchAmazon({ query: "wireless earbuds" });

    assert.equal(response.kind, "json");
    assert.deepEqual(response.data, { hello: "world" });
    const call = calls[0]!;
    assert.equal(call.init.method, "GET");
    assert.equal(
      call.url.origin + call.url.pathname,
      "https://www.asin.dev/api/v1/search",
    );
    assert.equal(header(call, "authorization"), "Bearer test-key");
    assert.match(header(call, "user-agent") ?? "", /^asin-node\//);
    assert.equal(call.init.redirect, "manual");
  });

  it("serializes booleans, numbers and arrays in the query string", async () => {
    const { fetch, calls } = mockFetch();
    const client = new AsinClient({
      apiKey: "k",
      fetch,
      baseUrl: "https://example.test/",
    });
    await client.request("GET", "/anything", {
      text: "a b&c",
      flag: false,
      count: 0,
      ratio: 1.5,
      list: ["x", "y"],
      skipped: undefined,
      nothing: null,
    });
    const url = calls[0]!.url;
    assert.equal(url.origin, "https://example.test");
    assert.deepEqual(
      [...url.searchParams],
      [
        ["text", "a b&c"],
        ["flag", "false"],
        ["count", "0"],
        ["ratio", "1.5"],
        ["list", "x"],
        ["list", "y"],
      ],
    );
  });

  it("sends POST parameters as a JSON body", async () => {
    const { fetch, calls } = mockFetch();
    const client = new AsinClient({ apiKey: "k", fetch });
    await client.request("POST", "/anything", {
      query: "x",
      page: 2,
      gone: undefined,
    });
    const call = calls[0]!;
    assert.equal(call.init.method, "POST");
    assert.equal(header(call, "content-type"), "application/json");
    assert.deepEqual(JSON.parse(String(call.init.body)), {
      query: "x",
      page: 2,
    });
    assert.equal(call.url.search, "");
  });

  it("fills path parameters", async () => {
    const { fetch, calls } = mockFetch();
    const client = new AsinClient({ apiKey: "k", fetch });
    await client.request("GET", "/items/{id}", { id: "a/b c", other: 1 });
    assert.equal(calls[0]!.url.pathname, "/api/v1/items/a%2Fb%20c");
    assert.equal(calls[0]!.url.search, "?other=1");
    await assert.rejects(
      client.request("GET", "/items/{id}", {}),
      AsinSerializationError,
    );
  });

  it("sends wait where each endpoint reads it", async () => {
    const { fetch, calls } = mockFetch();
    const client = new AsinClient({ apiKey: "k", fetch });
    await client.request("POST", "/products/{id}/check", {
      id: "p1",
      wait: true,
    });
    assert.equal(calls[0]!.url.search, "?wait=true");
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), {});
    await client.request("POST", "/products", {
      product: "B09DFCB66S",
      wait: true,
    });
    assert.equal(calls[1]!.url.search, "");
    assert.deepEqual(JSON.parse(String(calls[1]!.init.body)), {
      product: "B09DFCB66S",
      wait: true,
    });
  });

  it("sends PATCH bodies and DELETE without a body", async () => {
    const { fetch, calls } = mockFetch();
    const client = new AsinClient({ apiKey: "k", fetch });
    await client.request("PATCH", "/products/{id}", { id: "p1", paused: true });
    assert.equal(calls[0]!.init.method, "PATCH");
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { paused: true });
    await client.request("DELETE", "/products/{id}", { id: "p1" });
    assert.equal(calls[1]!.init.method, "DELETE");
    assert.equal(calls[1]!.init.body, undefined);
  });

  it("validates required parameters before sending", async () => {
    const { fetch, calls } = mockFetch();
    const client = new AsinClient({ apiKey: "k", fetch });
    await assert.rejects(
      // @ts-expect-error -- missing required parameter on purpose
      client.searchAmazon({}),
      AsinSerializationError,
    );
    assert.equal(calls.length, 0);
  });

  it("rejects an unsupported method for an operation", async () => {
    const client = new AsinClient({ apiKey: "k", fetch: mockFetch().fetch });
    await assert.rejects(
      client.getAccount({}, { method: "POST" }),
      AsinConfigurationError,
    );
  });

  it("reads the nested error message", async () => {
    const { fetch } = mockFetch(() =>
      jsonResponse(
        { error: { code: "insufficient_credits", message: "No credits left" } },
        402,
      ),
    );
    const client = new AsinClient({ apiKey: "k", fetch, maxRetries: 0 });
    const error = await client.getAccount().catch((e: unknown) => e);
    assert.ok(error instanceof AsinApiError);
    assert.equal(error.errorMessage, "No credits left");
  });

  it("calls every documented endpoint on its path", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse({}));
    const client = new AsinClient({ apiKey: "k", fetch }) as unknown as Record<
      string,
      (params: unknown) => Promise<unknown>
    >;
    const required: Record<string, Record<string, unknown>> = {
      check_product: { id: "test" },
      delete_product: { id: "test" },
      fetch_offers: { asin: "test" },
      get_asin_history: { asin: "test" },
      get_offers: { asin: "test" },
      get_product: { id: "test" },
      search_amazon: { query: "test" },
      track_product: { product: "test" },
      update_product: { id: "test" },
    };
    for (const [name, endpoint] of Object.entries(ENDPOINTS)) {
      const method = name.replace(/_([a-z0-9])/g, (_m, c: string) =>
        c.toUpperCase(),
      );
      assert.equal(
        typeof client[method],
        "function",
        `missing method ${method}`,
      );
      await client[method]!.call(client, required[name] ?? {});
      const call = calls.at(-1)!;
      const expectedPath = endpoint.path.replace(/\{[^}]+\}/g, "test");
      assert.equal(call.url.pathname, "/api/v1" + expectedPath, name);
      assert.equal(call.init.method, endpoint.methods[0], name);
    }
    assert.equal(calls.length, Object.keys(ENDPOINTS).length);
  });
});

describe("responses", () => {
  it("returns binary bodies with their content type", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const { fetch } = mockFetch(
      () => new Response(bytes, { headers: { "content-type": "image/png" } }),
    );
    const client = new AsinClient({ apiKey: "k", fetch });
    const response = await client.request("GET", "/anything");
    assert.equal(response.kind, "binary");
    if (response.kind === "binary") {
      assert.deepEqual([...response.bytes], [...bytes]);
      assert.equal(response.contentType, "image/png");
    }
  });

  it("rejects a non-JSON success for a JSON operation", async () => {
    const { fetch } = mockFetch(
      () =>
        new Response("<html>", { headers: { "content-type": "text/html" } }),
    );
    const client = new AsinClient({ apiKey: "k", fetch });
    await assert.rejects(
      client.searchAmazon({ query: "wireless earbuds" }),
      AsinResponseDecodingError,
    );
  });

  it("maps API errors", async () => {
    const { fetch } = mockFetch(() =>
      jsonResponse({ error: "Invalid API Key" }, 401),
    );
    const client = new AsinClient({ apiKey: "k", fetch });
    const error = await client
      .request("GET", "/account")
      .catch((e: unknown) => e);
    assert.ok(error instanceof AsinApiError);
    assert.equal(error.status, 401);
    assert.equal(error.message, "Invalid API Key");
    assert.deepEqual(error.responseBody, { error: "Invalid API Key" });
  });

  it("keeps non-JSON error bodies", async () => {
    const { fetch } = mockFetch(
      () => new Response("Bad gateway", { status: 502 }),
    );
    const client = new AsinClient({ apiKey: "k", fetch, maxRetries: 0 });
    const error = await client
      .request("GET", "/account")
      .catch((e: unknown) => e);
    assert.ok(error instanceof AsinApiError);
    assert.equal(error.status, 502);
    assert.equal(
      new TextDecoder().decode(error.rawResponse.body),
      "Bad gateway",
    );
  });

  it("wraps transport failures", async () => {
    const client = new AsinClient({
      apiKey: "k",
      maxRetries: 0,
      fetch: async () => {
        throw new TypeError("network down");
      },
    });
    await assert.rejects(client.request("GET", "/account"), AsinTransportError);
  });

  it("propagates caller cancellation", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    const client = new AsinClient({ apiKey: "k", fetch: mockFetch().fetch });
    await assert.rejects(
      client.request("GET", "/account", null, { signal: controller.signal }),
      /stop/,
    );
  });
});

describe("retries", () => {
  it("retries retryable statuses, then succeeds", async () => {
    const statuses = [503, 429, 200];
    const { fetch, calls } = mockFetch(() =>
      jsonResponse({ ok: true }, statuses.shift()!),
    );
    const client = new AsinClient({ apiKey: "k", fetch, retryDelay: 1 });
    const response = await client.request("GET", "/account");
    assert.equal(response.kind, "json");
    assert.equal(calls.length, 3);
  });

  it("gives up after maxRetries", async () => {
    const { fetch, calls } = mockFetch(() =>
      jsonResponse({ error: "busy" }, 503),
    );
    const client = new AsinClient({
      apiKey: "k",
      fetch,
      retryDelay: 1,
      maxRetries: 2,
    });
    await assert.rejects(client.request("GET", "/account"), AsinApiError);
    assert.equal(calls.length, 3);
  });

  it("never retries client errors", async () => {
    const { fetch, calls } = mockFetch(() =>
      jsonResponse({ error: "Payment required" }, 402),
    );
    const client = new AsinClient({ apiKey: "k", fetch, retryDelay: 1 });
    await assert.rejects(client.request("GET", "/account"), AsinApiError);
    assert.equal(calls.length, 1);
  });

  it("retries network errors and honours Retry-After", async () => {
    let n = 0;
    const client = new AsinClient({
      apiKey: "k",
      retryDelay: 1,
      fetch: async () => {
        n++;
        if (n === 1) throw new TypeError("socket hang up");
        if (n === 2)
          return new Response("{}", {
            status: 429,
            headers: { "retry-after": "0", "content-type": "application/json" },
          });
        return jsonResponse({ ok: true });
      },
    });
    await client.request("GET", "/account");
    assert.equal(n, 3);
  });

  it("never retries a 401", async () => {
    const cases: [string, number][] = [
      [
        "Rate limit exceeded: You've exceeded the rate limit on your subscription",
        1,
      ],
      ["Rate limit exceeded for the API key: quota daily", 1],
      ["Invalid API Key", 1],
    ];
    for (const [message, expectedCalls] of cases) {
      let n = 0;
      const { fetch, calls } = mockFetch(() =>
        n++ === 0
          ? jsonResponse({ error: message }, 401)
          : jsonResponse({ ok: true }),
      );
      const client = new AsinClient({ apiKey: "k", fetch, retryDelay: 1 });
      await client.request("GET", "/account").catch(() => undefined);
      assert.equal(calls.length, expectedCalls, message);
    }
  });

  it("lets one request override the retry count", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse({}, 500));
    const client = new AsinClient({ apiKey: "k", fetch, retryDelay: 1 });
    await assert.rejects(
      client.request("GET", "/account", null, { maxRetries: 0 }),
      AsinApiError,
    );
    assert.equal(calls.length, 1);
  });
});

describe("batch", () => {
  it("keeps input order, isolates failures and caps concurrency", async () => {
    const client = new AsinClient({ apiKey: "k", fetch: mockFetch().fetch });
    let running = 0;
    let peak = 0;
    const results = await client.batch(
      [1, 2, 3, 4, 5, 6],
      async (n) => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 5));
        running--;
        if (n === 4) throw new Error("boom");
        return n * 10;
      },
      { concurrency: 2 },
    );
    assert.equal(peak, 2);
    assert.deepEqual(
      results.map((r) => (r.status === "fulfilled" ? r.value : "failed")),
      [10, 20, 30, "failed", 50, 60],
    );
    assert.equal(results[3]!.index, 3);
  });

  it("runs SDK calls", async () => {
    const { fetch, calls } = mockFetch(() => jsonResponse({ ok: true }));
    const client = new AsinClient({ apiKey: "k", fetch });
    const results = await client.batch(["a", "b", "c"], (q) =>
      client.request("GET", "/account", { q }),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
    assert.equal(calls.length, 3);
  });
});
