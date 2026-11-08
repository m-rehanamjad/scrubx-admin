import fs from "node:fs";

// 1. Load environment variables
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

import { imagekit } from "../lib/imagekit.ts";
import { getImageKitUrl, getImageThumbnailUrl } from "../lib/imagekit-url.ts";

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

// 1x1 transparent PNG buffer in base64
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function runLifecycleTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" 🚀 ImageKit Live Lifecycle Test (Upload -> Transform -> Delete)");
  console.log("═══════════════════════════════════════════════════════════\n");

  const timestamp = Date.now();
  const testFileName = `test-lifecycle-${timestamp}.png`;
  const folder = "/scrubx/products";

  let createdFileId: string | null = null;

  try {
    // Step 1: Upload test file to ImageKit
    console.log(`Step 1: Uploading buffer to folder "${folder}" as "${testFileName}"...`);
    const uploadResponse = await imagekit.upload({
      file: TINY_PNG_BASE64,
      fileName: testFileName,
      folder: folder,
      tags: ["ci-test", "scrubx-test"],
      useUniqueFileName: true,
    });

    createdFileId = uploadResponse.fileId;
    console.log(`  Upload successful!`);
    console.log(`  • File ID:  ${uploadResponse.fileId}`);
    console.log(`  • URL:      ${uploadResponse.url}`);
    console.log(`  • Path:     ${uploadResponse.filePath}`);

    assert(Boolean(uploadResponse.fileId && uploadResponse.fileId.length > 5), "Returned valid fileId");
    assert(
      Boolean(uploadResponse.url && uploadResponse.url.includes("ik.imagekit.io")),
      "Returned URL contains ImageKit host"
    );
    assert(
      uploadResponse.filePath.startsWith(folder),
      `File placed in specified folder (${folder})`
    );

    // Step 2: Test URL generation with the uploaded asset
    console.log("\nStep 2: Generating edge-transformed URLs for uploaded asset...");
    const thumbUrl = getImageThumbnailUrl(uploadResponse.url, 100);
    const responsiveWebp = getImageKitUrl(uploadResponse.url, {
      width: 250,
      quality: 80,
      format: "webp",
    });

    assert(thumbUrl.includes("tr:w-100"), "Thumbnail URL transformation valid", thumbUrl);
    assert(responsiveWebp.includes("tr:w-250,q-80,f-webp"), "Responsive WebP transformation valid", responsiveWebp);

    // Step 3: Delete the test file from ImageKit
    console.log(`\nStep 3: Deleting test asset (${createdFileId}) from ImageKit...`);
    await imagekit.deleteFile(createdFileId);
    console.log(`  Asset ${createdFileId} deleted successfully!`);
    assert(true, "ImageKit deleteFile completed without error");

    createdFileId = null; // Mark cleaned up
  } catch (err: any) {
    console.error("  ❌ Lifecycle execution error:", err?.message || err);
    failed++;

    // Attempt cleanup if file was created before failure
    if (createdFileId) {
      console.log(`  Attempting emergency cleanup for ${createdFileId}...`);
      try {
        await imagekit.deleteFile(createdFileId);
        console.log("  Emergency cleanup succeeded.");
      } catch (cleanErr) {
        console.warn("  Failed emergency cleanup:", cleanErr);
      }
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(` Summary: ${passed} Passed, ${failed} Failed`);
  console.log("═══════════════════════════════════════════════════════════");

  if (failed > 0) {
    process.exit(1);
  }
}

runLifecycleTests();
