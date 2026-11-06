// Generated from the Asin OpenAPI document. Do not edit by hand.

import type { EndpointDefinition } from "./types.js";

/** Every documented operation, keyed by its snake_case name. */
export const ENDPOINTS = {
  check_product: {
    path: "/products/{id}/check",
    methods: ["POST"],
    response: "json",
    required: ["id"],
  },
  delete_product: {
    path: "/products/{id}",
    methods: ["DELETE"],
    response: "json",
    required: ["id"],
  },
  fetch_offers: {
    path: "/offers",
    methods: ["POST"],
    response: "json",
    required: ["asin"],
  },
  get_account: {
    path: "/account",
    methods: ["GET"],
    response: "json",
    required: [],
  },
  get_asin_history: {
    path: "/history",
    methods: ["GET"],
    response: "json",
    required: ["asin"],
  },
  get_offers: {
    path: "/offers",
    methods: ["GET"],
    response: "json",
    required: ["asin"],
  },
  get_product: {
    path: "/products/{id}",
    methods: ["GET"],
    response: "json",
    required: ["id"],
  },
  list_products: {
    path: "/products",
    methods: ["GET"],
    response: "json",
    required: [],
  },
  search_amazon: {
    path: "/search",
    methods: ["GET"],
    response: "json",
    required: ["query"],
  },
  track_product: {
    path: "/products",
    methods: ["POST"],
    response: "json",
    required: ["product"],
  },
  update_product: {
    path: "/products/{id}",
    methods: ["PATCH"],
    response: "json",
    required: ["id"],
  },
} as const satisfies Record<string, EndpointDefinition>;

export type EndpointName = keyof typeof ENDPOINTS;
