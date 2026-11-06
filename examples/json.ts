import { AsinClient } from "@asindev/sdk";

const client = new AsinClient({ apiKey: process.env.ASIN_API_KEY });

const response = await client.searchAmazon({ query: "wireless earbuds" });
console.log(JSON.stringify(response.data, null, 2));
