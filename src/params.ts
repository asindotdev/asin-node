// Generated from the Asin OpenAPI document. Do not edit by hand.

import type { OpenString } from "./types.js";

/** Parameters for operations that take none. */
export type EmptyParams = Record<string, never>;

/** Parameters for `checkProduct()` — `POST /products/{id}/check`. */
export interface CheckProductParams {
  /** product_id returned when the product was added */
  id: string;
  /** Answer once the check is done (up to 45 seconds) Default: `false`. */
  wait?: boolean | undefined;
}

/** Parameters for `deleteProduct()` — `DELETE /products/{id}`. */
export interface DeleteProductParams {
  /** product_id returned when the product was added */
  id: string;
}

/** Parameters for `fetchOffers()` — `POST /offers`. */
export interface FetchOffersParams {
  /** 10-character ASIN */
  asin: string;
  /** Amazon store, e.g. com for amazon.com Default: `"com"`. */
  marketplace?:
    | OpenString<
        | "com"
        | "co.uk"
        | "de"
        | "fr"
        | "it"
        | "es"
        | "ca"
        | "co.jp"
        | "com.br"
        | "com.mx"
        | "in"
      >
    | undefined;
  /** Read Amazon again unless the last read is under 5 minutes old (1 credit) Default: `false`. */
  refresh?: boolean | undefined;
}

/** Parameters for `getAsinHistory()` — `GET /history`. */
export interface GetAsinHistoryParams {
  /** 10-character ASIN */
  asin: string;
  /** Amazon store, e.g. com for amazon.com Default: `"com"`. */
  marketplace?:
    | OpenString<
        | "com"
        | "co.uk"
        | "de"
        | "fr"
        | "it"
        | "es"
        | "ca"
        | "co.jp"
        | "com.br"
        | "com.mx"
        | "in"
      >
    | undefined;
  /** History period in days Default: `90`. */
  days?: number | undefined;
}

/** Parameters for `getOffers()` — `GET /offers`. */
export interface GetOffersParams {
  /** 10-character ASIN */
  asin: string;
  /** Amazon store, e.g. com for amazon.com Default: `"com"`. */
  marketplace?:
    | OpenString<
        | "com"
        | "co.uk"
        | "de"
        | "fr"
        | "it"
        | "es"
        | "ca"
        | "co.jp"
        | "com.br"
        | "com.mx"
        | "in"
      >
    | undefined;
}

/** Parameters for `getProduct()` — `GET /products/{id}`. */
export interface GetProductParams {
  /** product_id returned when the product was added */
  id: string;
  /** History period in days Default: `90`. */
  days?: number | undefined;
}

/** Parameters for `listProducts()` — `GET /products`. */
export interface ListProductsParams {
  /** Only this ASIN */
  asin?: string | undefined;
  /** Only this Amazon store */
  marketplace?:
    | OpenString<
        | "com"
        | "co.uk"
        | "de"
        | "fr"
        | "it"
        | "es"
        | "ca"
        | "co.jp"
        | "com.br"
        | "com.mx"
        | "in"
      >
    | undefined;
  /** Only the products of one of the app's watchlist filters. all: Every tracked product (default). drops: Cheaper now than when the product was added. target: At or below its target price. out_of_stock: No offer at the last check. attention: The last check didn't go through (last_error is set): no cred… Default: `"all"`. */
  filter?:
    | OpenString<
        "all" | "drops" | "target" | "out_of_stock" | "attention" | "paused"
      >
    | undefined;
  /** Page number Default: `1`. */
  page?: number | undefined;
  /** Products per page Default: `20`. */
  limit?: number | undefined;
}

/** Parameters for `searchAmazon()` — `GET /search`. */
export interface SearchAmazonParams {
  /** Keywords */
  query: string;
  /** Amazon store, e.g. com for amazon.com Default: `"com"`. */
  marketplace?:
    | OpenString<
        | "com"
        | "co.uk"
        | "de"
        | "fr"
        | "it"
        | "es"
        | "ca"
        | "co.jp"
        | "com.br"
        | "com.mx"
        | "in"
      >
    | undefined;
}

/** Parameters for `trackProduct()` — `POST /products`. */
export interface TrackProductParams {
  /** ASIN (B09DFCB66S) or Amazon product link */
  product: string;
  /** Amazon store, e.g. com for amazon.com. A product link sets it on its own. Default: `"com"`. */
  marketplace?:
    | OpenString<
        | "com"
        | "co.uk"
        | "de"
        | "fr"
        | "it"
        | "es"
        | "ca"
        | "co.jp"
        | "com.br"
        | "com.mx"
        | "in"
      >
    | undefined;
  /** Email the owner when the price goes at or below this amount. null removes it. */
  target_price?: number | undefined;
  /** Minutes between two checks (1440 = daily). Checks faster than daily need a plan or a credit pack: every 60 minutes with a pack or Starter, 30 with Pro, 5 with Business. Default: `1440`. */
  interval_minutes?: number | undefined;
  /** Answer once the first check is done (up to 45 seconds) Default: `false`. */
  wait?: boolean | undefined;
}

/** Parameters for `updateProduct()` — `PATCH /products/{id}`. */
export interface UpdateProductParams {
  /** product_id returned when the product was added */
  id: string;
  /** Email the owner when the price goes at or below this amount. null removes it. */
  target_price?: number | undefined;
  /** Minutes between two checks (1440 = daily). Checks faster than daily need a plan or a credit pack: every 60 minutes with a pack or Starter, 30 with Pro, 5 with Business. Default: `1440`. */
  interval_minutes?: number | undefined;
  /** Email when the price drops or the product is back in stock */
  alert_on_drop?: boolean | undefined;
  /** Stop checking (and charging) for now; false resumes */
  paused?: boolean | undefined;
}
