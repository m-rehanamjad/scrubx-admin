import fs from "node:fs";
import path from "node:path";

// 1. Load environment variables
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

import { getImageKitInstance, imagekit } from "../lib/imagekit.ts";
import {
  getImageKitUrl,
  getImageThumbnailUrl,
  getProductCardImageUrl,
  getProductHeroImageUrl,
  getCategoryBannerUrl,
} from "../lib/imagekit-url.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

async function runConnectionTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" 🧪 ImageKit Connection & URL Transformation Tests");
  console.log("═══════════════════════════════════════════════════════════\n");

  // 1. Verify Environment Variables
  console.log("Step 1: Environment Variables Presence");
  const pubKey = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  const privKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const endpoint = process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;

  assert(Boolean(pubKey && pubKey.startsWith("public_")), "Public Key starts with 'public_'");
  assert(Boolean(privKey && privKey.startsWith("private_")), "Private Key starts with 'private_'");
  assert(
    Boolean(endpoint && endpoint.startsWith("https://ik.imagekit.io/")),
    "URL Endpoint starts with 'https://ik.imagekit.io/'"
  );

  // 2. SDK Initialization
  console.log("\nStep 2: Server SDK Initialization");
  const instance = getImageKitInstance();
  assert(Boolean(instance), "ImageKit SDK singleton instantiated");
  assert(typeof instance.getAuthenticationParameters === "function", "SDK exposes getAuthenticationParameters()");
  assert(typeof instance.upload === "function", "SDK exposes upload()");
  assert(typeof instance.deleteFile === "function", "SDK exposes deleteFile()");

  // 3. Auth Token & Signature Generation
  console.log("\nStep 3: Upload Signature & Token Generation");
  const authParams = imagekit.getAuthenticationParameters();
  assert(typeof authParams.token === "string" && authParams.token.length > 10, "Generated secure token");
  assert(typeof authParams.signature === "string" && authParams.signature.length >= 32, "Generated cryptographic HMAC-SHA1 signature");
  assert(typeof authParams.expire === "number" && authParams.expire > Math.floor(Date.now() / 1000), "Expire timestamp is set in the future");

  // 4. URL Transformations
  console.log("\nStep 4: Edge URL Transformations & Presets");
  const testPath = "/scrubx/products/sample-scrub.jpg";

  // Base transformation with width, quality, and webp format
  const transformedUrl = getImageKitUrl(testPath, {
    width: 400,
    height: 400,
    quality: 85,
    format: "webp",
    crop: "maintain_ratio",
  });
  assert(
    transformedUrl.includes("tr:w-400,h-400,q-85,f-webp,c-maintain_ratio"),
    "getImageKitUrl generates expected tr parameter string",
    transformedUrl
  );
  assert(
    transformedUrl.startsWith(endpoint!),
    "Generated URL uses configured ImageKit endpoint",
    transformedUrl
  );

  // Thumbnail Preset
  const thumbUrl = getImageThumbnailUrl(testPath, 150);
  assert(
    thumbUrl.includes("tr:w-150,h-150,q-80,f-auto,c-maintain_ratio"),
    "getImageThumbnailUrl generates proper thumbnail transformation",
    thumbUrl
  );

  // Product Card Preset
  const cardUrl = getProductCardImageUrl(testPath);
  assert(
    cardUrl.includes("tr:w-400,h-500,q-85,f-auto,c-maintain_ratio"),
    "getProductCardImageUrl generates proper product card transformation",
    cardUrl
  );

  // Product Hero Preset
  const heroUrl = getProductHeroImageUrl(testPath);
  assert(
    heroUrl.includes("tr:w-800,h-1000,q-90,f-auto,c-maintain_ratio"),
    "getProductHeroImageUrl generates high-res hero transformation",
    heroUrl
  );

  // Category Banner Preset
  const bannerUrl = getCategoryBannerUrl(testPath);
  assert(
    bannerUrl.includes("tr:w-600,h-300,q-85,f-auto,c-maintain_ratio"),
    "getCategoryBannerUrl generates wide banner transformation",
    bannerUrl
  );

  // Edge Case: Full URL input should preserve transformation
  const fullExistingUrl = `${endpoint}/scrubx/products/sample-scrub.jpg`;
  const retransformed = getImageKitUrl(fullExistingUrl, { width: 300 });
  assert(
    retransformed.includes("tr:w-300") && retransformed.includes("/scrubx/products/sample-scrub.jpg"),
    "Handles existing full URL endpoint strings gracefully",
    retransformed
  );

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(` Summary: ${passed} Passed, ${failed} Failed`);
  console.log("═══════════════════════════════════════════════════════════");

  if (failed > 0) {
    process.exit(1);
  }
}

runConnectionTests().catch((err) => {
  console.error("Unexpected error running connection tests:", err);
  process.exit(1);
});
