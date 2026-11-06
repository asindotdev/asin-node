import { AsinApiError, AsinClient } from "@asindev/sdk";

const client = new AsinClient({ apiKey: process.env.ASIN_API_KEY });

try {
  // Any endpoint, including ones released after this SDK version.
  const response = await client.request("GET", "/account");
  if (response.kind === "json") console.log(response.data);
} catch (error) {
  if (error instanceof AsinApiError) {
    console.error(`HTTP ${error.status}: ${error.message}`);
  } else {
    throw error;
  }
}
